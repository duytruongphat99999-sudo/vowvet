/**
 * MonMin Supplements — live fetch + parse + cache + disease-match.
 *
 * KHÔNG dùng Baserow (feature = live fetch từ monminpet.com), KHÔNG đụng số DER.
 * Tách hẳn khỏi api/lib/nutrition.ts.
 *
 * Flow (loadMonMinSupplements):
 *   sitemap-index.xml → child sitemaps → mọi URL /san-pham/<slug>/ (KHÔNG hardcode count)
 *   → fetch từng product page (follow redirect 301→trailing-slash/http), concurrency cap 6
 *   → parse <script type="application/ld+json"> @type=Product (name/description/image/price/sku/category)
 *      thiếu → fallback og:image + <title>/og:* ; vẫn lỗi → SKIP slug (1 trang chết không sập cả load)
 *   → matchedConditions: keyword-match name+description vs CONDITION_NUTRITION (tái dùng vocab bệnh sẵn)
 *   → cache 6h.
 *
 * Defensive: sitemap/network fail mà có cache cũ → trả stale + log; không cache → trả [] (KHÔNG throw).
 */
import { HEALTH_CONDITIONS, CONDITION_NUTRITION } from "@shared/health-conditions.ts";

const SITE = "https://monminpet.com";
const SITEMAP_INDEX = `${SITE}/sitemap-index.xml`;
const FETCH_TIMEOUT_MS = 12_000;
const CONCURRENCY = 6;

export const SUPPLEMENTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface MonMinSupplement {
  slug: string;
  name: string;
  description: string;
  image: string;
  url: string;
  price: number | null;
  category: string | null;
  matchedConditions: string[];
}

let supplementsCache: { data: MonMinSupplement[]; expires_at: number } | null = null;

export function invalidateSupplementsCache(): void {
  supplementsCache = null;
}

// ============================================================
// Disease matching (reuse CONDITION_NUTRITION keywords — KHÔNG taxonomy mới)
// ============================================================

/** lowercase + bỏ dấu tiếng Việt (NFD strip combining marks + đ→d). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/đ/g, "d");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Khớp term theo TỪ (word-boundary), KHÔNG substring thuần — tránh false-positive rác kiểu
 * "mẹ"→"me" khớp "supplement"/"metabolic". Caller truyền hay + term CÙNG HỆ:
 * cùng đã-bỏ-dấu (keyword thường) HOẶC cùng còn-dấu (keyword đồng-tự, xem matchConditions).
 */
function containsKeyword(hay: string, term: string): boolean {
  if (!term) return false;
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(term)}(?=[^a-z0-9]|$)`);
  return re.test(hay);
}

/**
 * Hai cơ chế SIẾT KHỚP (chỉ đổi CÁCH khớp — KHÔNG đổi vocab gốc ở health-conditions.ts):
 *  (a) ĐỒNG TỰ CÓ DẤU: keyword tiếng Việt dễ va chạm khi bỏ dấu (vd "thận"→"than" trùng
 *      "thần" trong "an thần") → khớp trên text CÓ DẤU (chỉ lowercase). Còn lại khớp trên norm.
 *  (b) WEAK KEYWORD: cụm generic ("tiêu hóa"/"sensitive"/"digestive") — nếu MỌI keyword khớp
 *      của 1 code đều weak → KHÔNG gắn code (cần ≥1 keyword ĐẶC HIỆU).
 */
const VN_DIACRITIC_KEYWORDS = new Set<string>(["thận"]);
const WEAK_KEYWORDS = new Set<string>(["tiêu hóa", "tieu hoa", "sensitive", "digestive"]);

function isWeakKeyword(kw: string): boolean {
  return WEAK_KEYWORDS.has(kw) || WEAK_KEYWORDS.has(norm(kw));
}

/**
 * Mỗi trong 18 code: gom keyword khớp (diacritic-keyword khớp trên text CÓ DẤU, còn lại trên norm).
 * Chỉ gắn code khi có ≥1 keyword ĐẶC HIỆU khớp — weak-only → bỏ.
 */
function matchConditions(name: string, description: string): string[] {
  const accented = `${name} ${description}`.toLowerCase(); // giữ dấu — cho keyword đồng-tự
  const hay = norm(accented); // bỏ dấu — cho keyword thường
  const out: string[] = [];
  for (const cond of HEALTH_CONDITIONS) {
    const cn = CONDITION_NUTRITION[cond.code];
    if (!cn || !cn.keywords?.length) continue; // tier 2/3 không có keyword → bỏ qua
    let hasStrong = false;
    for (const kw of cn.keywords) {
      const matched = VN_DIACRITIC_KEYWORDS.has(kw)
        ? containsKeyword(accented, kw.toLowerCase()) // so trên text CÓ DẤU → "thần" ≠ "thận"
        : containsKeyword(hay, norm(kw)); // so trên text đã bỏ dấu
      if (matched && !isWeakKeyword(kw)) {
        hasStrong = true; // ≥1 keyword đặc hiệu khớp → đủ gắn code
        break;
      }
    }
    if (hasStrong) out.push(cond.code);
  }
  return out;
}

// ============================================================
// HTTP helpers
// ============================================================

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow", // 301 → trailing-slash / http
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "VowVet-SupplementSync/1 (+https://vowvet.monminpet.com)" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

/** /san-pham/<slug>/ → slug ; loại trang listing (/san-pham/) + path lồng. */
function productSlugFromUrl(url: string): string | null {
  const m = url.match(/\/san-pham\/([^/?#]+)\/?(?:[?#]|$)/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).trim();
  if (!slug || slug === "san-pham") return null;
  return slug;
}

// ============================================================
// HTML parse (ld+json Product → fallback og/title)
// ============================================================

function findProduct(json: any): any | null {
  if (!json || typeof json !== "object") return null;
  if (Array.isArray(json)) {
    for (const x of json) {
      const f = findProduct(x);
      if (f) return f;
    }
    return null;
  }
  if (json["@graph"]) {
    const f = findProduct(json["@graph"]);
    if (f) return f;
  }
  const t = json["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return json;
  return null;
}

function extractLdProduct(html: string): any | null {
  const blocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const b of blocks) {
    let json: any;
    try {
      json = JSON.parse(b[1].trim());
    } catch {
      continue; // 1 block lỗi không chặn block khác
    }
    const found = findProduct(json);
    if (found) return found;
  }
  return null;
}

function extractMeta(html: string, prop: string): string | null {
  const p = escapeRe(prop);
  // property=...content=...  (cả 2 thứ tự thuộc tính)
  const m1 = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']+)["']`, "i"),
  );
  if (m1) return m1[1];
  const m2 = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${p}["']`, "i"),
  );
  return m2 ? m2[1] : null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function pickImage(img: any): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) return pickImage(img[0]);
  if (typeof img === "object" && typeof img.url === "string") return img.url;
  return null;
}

function parsePrice(offers: any): number | null {
  if (!offers) return null;
  const o = Array.isArray(offers) ? offers[0] : offers;
  const raw = o?.price ?? o?.lowPrice ?? null;
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

async function parseProduct(slug: string): Promise<MonMinSupplement | null> {
  const url = `${SITE}/san-pham/${slug}/`;
  const html = await fetchText(url);

  let name = "";
  let description = "";
  let image: string | null = null;
  let price: number | null = null;
  let category: string | null = null;

  const ld = extractLdProduct(html);
  if (ld) {
    name = String(ld.name || "").trim();
    description = String(ld.description || "").trim();
    image = pickImage(ld.image);
    price = parsePrice(ld.offers);
    category = ld.category ? String(ld.category).trim() : null;
  }

  // Fallback khi thiếu ld+json Product
  if (!name) name = (extractMeta(html, "og:title") || extractTitle(html) || "").trim();
  if (!description) description = (extractMeta(html, "og:description") || "").trim();
  if (!image) image = extractMeta(html, "og:image");
  if (!image) image = `${SITE}/images/products/${slug}.png`; // pattern xác nhận recon

  if (!name) return null; // không xác định nổi tên → SKIP slug

  return {
    slug,
    name,
    description,
    image,
    url,
    price,
    category,
    matchedConditions: matchConditions(name, description),
  };
}

// ============================================================
// Enumerate + concurrency-capped fetch
// ============================================================

async function collectProductSlugs(): Promise<string[]> {
  const indexXml = await fetchText(SITEMAP_INDEX);
  const locs = extractLocs(indexXml);
  const slugs = new Set<string>();
  const childSitemaps: string[] = [];

  for (const loc of locs) {
    const slug = productSlugFromUrl(loc);
    if (slug) slugs.add(slug);
    else if (/sitemap[^/]*\.xml/i.test(loc)) childSitemaps.push(loc);
  }

  // Index trỏ tới child sitemap(s) (vd sitemap-0.xml) → lấy product URLs ở đó
  for (const sm of childSitemaps) {
    try {
      const xml = await fetchText(sm);
      for (const loc of extractLocs(xml)) {
        const slug = productSlugFromUrl(loc);
        if (slug) slugs.add(slug);
      }
    } catch (err: any) {
      console.warn(`[monmin-supplements] child sitemap fail ${sm}: ${err?.message || err}`);
    }
  }

  return [...slugs];
}

async function fetchAllProducts(slugs: string[]): Promise<MonMinSupplement[]> {
  const out: MonMinSupplement[] = [];
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const chunk = slugs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((s) =>
        parseProduct(s).catch((err: any) => {
          console.warn(`[monmin-supplements] skip ${s}: ${err?.message || err}`);
          return null;
        }),
      ),
    );
    for (const r of results) if (r) out.push(r);
  }
  return out;
}

// ============================================================
// Public loader (cache 6h, defensive)
// ============================================================

export async function loadMonMinSupplements(force = false): Promise<MonMinSupplement[]> {
  const now = Date.now();
  if (!force && supplementsCache && supplementsCache.expires_at > now) {
    return supplementsCache.data;
  }

  try {
    const slugs = await collectProductSlugs();
    if (slugs.length === 0) throw new Error("sitemap có 0 product slug");

    const data = await fetchAllProducts(slugs);
    if (data.length === 0) throw new Error("tất cả product page parse fail");

    supplementsCache = { data, expires_at: now + SUPPLEMENTS_CACHE_TTL_MS };
    console.log(
      `[monmin-supplements] loaded ${data.length}/${slugs.length} products (cache 6h)`,
    );
    return data;
  } catch (err: any) {
    console.error(`[monmin-supplements] load failed: ${err?.message || err}`);
    if (supplementsCache) {
      console.warn("[monmin-supplements] serving STALE cache");
      return supplementsCache.data; // stale OK hơn rỗng; KHÔNG ghi đè cache
    }
    return []; // không cache → trả rỗng, KHÔNG throw (đừng sập route)
  }
}
