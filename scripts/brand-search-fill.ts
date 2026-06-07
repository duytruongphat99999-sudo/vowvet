/**
 * brand-search-fill — auto-fill product_url = Shopee search cho brand NGOẠI trong food_brands.
 *
 * CHỈ data. KHÔNG đụng: MonMin row (mon_min_recommended=true) · image_url · product_url đã có (anti-clobber) · schema.
 *
 * Logic:
 *   listRows food_brands → lọc row mon_min_recommended !== true (brand ngoại) VÀ product_url rỗng
 *   → product_url = "https://shopee.vn/search?keyword=" + encodeURIComponent(brand_name)
 *     (brand_name nguyên: "Royal Canin Maxi Adult" → ...keyword=Royal%20Canin%20Maxi%20Adult)
 *   DRY-RUN mặc định (in bảng row_id · brand_name · product_url OLD→NEW). Cần --write mới PATCH.
 *   Anti-clobber: CHỈ PATCH khi product_url rỗng. Idempotent (chạy lại → 0 target).
 *   CHỈ ghi product_url — KHÔNG đụng image_url.
 *
 * Reuse: shared/baserow.ts (Token client, user_field_names, host header, env). KHÔNG hardcode/in token.
 *
 * Run (repo root; Bun TỰ nạp .env; ép localhost:8888 vì host không có host.docker.internal):
 *   BASEROW_URL=http://localhost:8888 bun run scripts/brand-search-fill.ts            # DRY-RUN
 *   BASEROW_URL=http://localhost:8888 bun run scripts/brand-search-fill.ts --write    # PATCH thật
 *
 * Đổi sàn (Lazada/Tiki) → sửa SEARCH_BASE.
 */
import { listRows, updateRow } from "../shared/baserow.ts";

const BASEROW_URL = (process.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const HOST_HEADER = process.env.BASEROW_HOST_HEADER || "localhost:8888";
const SEARCH_BASE = "https://shopee.vn/search?keyword=";

const WRITE = new Set(process.argv.slice(2)).has("--write");

function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

interface BrandRow {
  id: number;
  brand_name: string;
  mon_min: boolean;
  product_url: string;
}

async function fetchAllBrands(): Promise<BrandRow[]> {
  const out: BrandRow[] = [];
  let page = 1;
  let count = Infinity;
  while (out.length < count) {
    const res = await listRows<Record<string, unknown>>("food_brands", { size: 200, page });
    count = res.count;
    for (const r of res.results) {
      const name = strVal(r.brand_name).trim();
      if (!name) continue; // bỏ stub rows Baserow
      out.push({
        id: r.id as number,
        brand_name: name,
        mon_min: r.mon_min_recommended === true,
        product_url: strVal(r.product_url),
      });
    }
    if (!res.next) break;
    page++;
  }
  return out;
}

// ============================================================
console.log(
  `brand-search-fill · ${WRITE ? "WRITE (ghi thật)" : "DRY-RUN (không ghi)"} · Baserow ${BASEROW_URL} (Host: ${HOST_HEADER})\n`,
);

const all = await fetchAllBrands();

const monMinRows = all.filter((b) => b.mon_min); // skip — MonMin (Duy giữ/xoá riêng)
const hasUrlRows = all.filter((b) => !b.mon_min && b.product_url.trim() !== ""); // skip — anti-clobber
const targets = all.filter((b) => !b.mon_min && b.product_url.trim() === ""); // brand ngoại + url rỗng

const plan = targets.map((b) => ({
  id: b.id,
  brand_name: b.brand_name,
  old: b.product_url,
  next: SEARCH_BASE + encodeURIComponent(b.brand_name),
}));

console.log(
  `Tổng ${all.length} brand · TARGET (ngoại + url rỗng): ${plan.length} · skip MonMin: ${monMinRows.length} · skip đã-có-url: ${hasUrlRows.length}\n`,
);

if (plan.length === 0) {
  console.log("✅ Không có brand ngoại nào cần fill (đều đã có product_url hoặc là MonMin). Idempotent OK.");
} else {
  console.log("row_id · brand_name · product_url (OLD → NEW)");
  console.log("─".repeat(64));
  for (const p of plan) {
    console.log(`#${p.id}  ${p.brand_name}`);
    console.log(`      ${p.old === "" ? "(trống)" : p.old}  →  ${p.next}`);
  }
  console.log(`\nTổng: ${plan.length} brand ngoại sẽ set product_url.`);
}

if (monMinRows.length) {
  console.log(`\nSkip MonMin: ${monMinRows.map((b) => `#${b.id} ${b.brand_name}`).join(" · ")}`);
}
if (hasUrlRows.length) {
  console.log(`Skip đã-có-url: ${hasUrlRows.map((b) => `#${b.id} ${b.brand_name}`).join(" · ")}`);
}

if (!WRITE) {
  console.log(`\nĐây là DRY-RUN. Ghi thật: BASEROW_URL=${BASEROW_URL} bun run scripts/brand-search-fill.ts --write`);
} else if (plan.length) {
  console.log("\n=== WRITE ===");
  let ok = 0;
  let errs = 0;
  for (const p of plan) {
    try {
      await updateRow("food_brands", p.id, { product_url: p.next }); // CHỈ product_url, KHÔNG đụng image_url
      ok++;
      console.log(`  ✓ PATCH #${p.id} ${p.brand_name}`);
    } catch (e: any) {
      errs++;
      console.error(`  ✗ #${p.id}: ${e?.message || e}`);
    }
  }
  console.log(`\n✅ Ghi xong: ${ok} brand PATCH OK${errs ? `, ${errs} lỗi` : ""}. Chạy lại (dry) để verify idempotent (0 target).`);
}
