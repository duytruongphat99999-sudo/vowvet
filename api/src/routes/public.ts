/**
 * Public routes — KHÔNG cần auth.
 *
 * - /public/pets/:qr_code      — lost-and-found passport (M3, M8 giữ nguyên)
 * - /public/p/:slug            — M12 public shareable pet card
 * - /public/p/:slug/share-click — M12 share counter
 * - /public/food-brands        — SEO catalogue (M8)
 * - /public/stats              — landing page stats (M8)
 *
 * Rate limit 30 req/min/IP để chống scrape mass.
 * Trả về MASKED phone, KHÔNG trả dob/weight/health/address.
 */
import { Hono } from "hono";
import { ipRateLimit } from "../lib/rate-limit.ts";
import { findPetByQrCode, maskPhone } from "../lib/pets.ts";
import { findUserByPhone } from "../lib/users.ts";
import { speciesEnToVi } from "@shared/enum-mappers.ts";
import { listRows } from "@shared/baserow.ts";
import { loadFoodBrands } from "../lib/nutrition.ts";
import { loadMonMinSupplements } from "../lib/monmin-supplements.ts";
import { getPublicPetBySlug, incrementViewCount, incrementShareCount, listFosterPets } from "../lib/public-pets.ts";

export const publicRoute = new Hono();

publicRoute.use("*", ipRateLimit("public-passport", 30, 60));

// ===== GET /public/foster — board bé foster công khai (FOSTER L4a) =====
publicRoute.get("/foster", async (c) => {
  try {
    const pets = await listFosterPets();
    c.header("Cache-Control", "public, max-age=120");
    return c.json({ pets });
  } catch (err) {
    console.error("[public/foster] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== GET /public/pets/:qr_code =====
publicRoute.get("/pets/:qr_code", async (c) => {
  const qrCode = c.req.param("qr_code");
  if (!qrCode || qrCode.length > 30) {
    return c.json({ error: { code: "BAD_CODE", message: "Mã QR không hợp lệ" } }, 400);
  }

  const pet = await findPetByQrCode(qrCode);
  if (!pet) {
    return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy passport này" } }, 404);
  }

  // Lookup owner phone qua user_id link_row
  const ownerLink = (pet.user_id || [])[0];
  let ownerPhoneMasked = "***";
  if (ownerLink) {
    // ownerLink có dạng { id, value } — value thường là display name của row link
    // Để chắc, query lại user record
    // Note: ta đã có user.id từ ownerLink.id. Cần phone từ user record.
    // findUserByPhone lookup ngược không tối ưu — chỉ Phase 0.
    // Thay vào đó, dùng getRow trực tiếp:
    const { getRow } = await import("@shared/baserow.ts");
    try {
      const owner = await getRow<{ phone: string }>("users", ownerLink.id);
      ownerPhoneMasked = maskPhone(owner.phone);
    } catch {
      // Owner đã bị xoá hoặc lỗi — vẫn hiện passport nhưng owner_phone_masked rỗng
      ownerPhoneMasked = "***";
    }
  }

  const species = typeof pet.species === "object" ? pet.species?.value : pet.species;

  // Chỉ public các field public-safe
  return c.json({
    name: pet.name,
    species: speciesEnToVi(species as string),
    breed: pet.breed || null,
    photo_url: pet.photo_url || null,
    owner_phone_masked: ownerPhoneMasked,
  });
});

// ============================================================
// M12: PUBLIC SHAREABLE PET CARD (/p/:slug)
// ============================================================

// Stricter rate limit cho slug lookups (anti-scrape)
const publicSlugLimit = ipRateLimit("public-slug", 60, 60); // 60/min/IP
const shareClickLimit = ipRateLimit("public-share-click", 10, 60); // 10/min/IP

publicRoute.get("/p/:slug", publicSlugLimit, async (c) => {
  const slug = c.req.param("slug");
  // Allow both lowercase M12 slugs AND uppercase M3 QR codes (format XXXXXXXX-XX)
  // QR codes generated bằng uppercase alphabet (qr.ts) — không lowercase ở đây.
  if (!slug || slug.length < 3 || slug.length > 60 || !/^[A-Za-z0-9-]+$/.test(slug)) {
    return c.json({ error: { code: "BAD_SLUG", message: "Slug không hợp lệ" } }, 400);
  }

  try {
    const pet = await getPublicPetBySlug(slug);
    if (!pet) {
      // 404 — KHÔNG reveal existence (đừng trả "exists but private")
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy profile" } }, 404);
    }

    // Fire-and-forget view counter
    incrementViewCount(slug);

    // CDN cache 5 phút
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ pet });
  } catch (err: any) {
    console.error("[public/p/:slug] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

publicRoute.post("/p/:slug/share-click", shareClickLimit, async (c) => {
  const slug = c.req.param("slug");
  if (!slug || slug.length < 3 || slug.length > 60) {
    return c.body(null, 204); // graceful — don't error on bad input
  }
  incrementShareCount(slug);
  return c.body(null, 204);
});

// ============================================================
// M8: PUBLIC FOOD-BRANDS CATALOGUE
// ============================================================

/**
 * GET /public/food-brands?species=&life_stage=&page=&size=
 * Returns same brands as authenticated endpoint, không cần login.
 * Pagination: 20/page mặc định.
 * Cache 1h tại nutrition.loadFoodBrands().
 */
publicRoute.get("/food-brands", async (c) => {
  const species = c.req.query("species") || null; // "dog" | "cat" | null
  const lifeStage = c.req.query("life_stage") || null; // "puppy" | "adult" | "senior" | "all" | null
  const monMin = c.req.query("mon_min") === "1";
  const page = Math.max(1, Number(c.req.query("page") || "1"));
  const size = Math.min(50, Math.max(1, Number(c.req.query("size") || "20")));

  try {
    let brands = await loadFoodBrands();
    // Filter
    if (species === "dog" || species === "cat") {
      brands = brands.filter((b) => b.species === species || b.species === "both");
    }
    if (lifeStage && ["puppy", "adult", "senior", "all"].includes(lifeStage)) {
      brands = brands.filter((b) => b.life_stage === lifeStage || b.life_stage === "all");
    }
    if (monMin) {
      brands = brands.filter((b) => b.mon_min_recommended);
    }
    // Only show vn_availability=true
    brands = brands.filter((b) => b.vn_availability);
    // Sort: mon_min recommended first, then alphabetical
    brands.sort((a, b) => {
      if (a.mon_min_recommended !== b.mon_min_recommended) return a.mon_min_recommended ? -1 : 1;
      return a.brand_name.localeCompare(b.brand_name, "vi");
    });

    const total = brands.length;
    const start = (page - 1) * size;
    const paged = brands.slice(start, start + size);

    return c.json({
      brands: paged,
      pagination: {
        page,
        size,
        total,
        total_pages: Math.max(1, Math.ceil(total / size)),
      },
      filters_applied: { species, life_stage: lifeStage, mon_min: monMin },
    });
  } catch (err: any) {
    console.error("[public/food-brands] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load brands" } }, 500);
  }
});

// ===== GET /public/monmin-supplements =====
// Live fetch+parse từ monminpet.com, cache 6h (loadMonMinSupplements). No-auth, thừa kế rate-limit *.
// Trả nguyên object (gồm matchedConditions) — KHÔNG whitelist.
publicRoute.get("/monmin-supplements", async (c) => {
  try {
    const supplements = await loadMonMinSupplements();
    return c.json({ supplements, total: supplements.length });
  } catch (err: any) {
    console.error("[public/monmin-supplements] error:", err?.message || err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load supplements" } }, 500);
  }
});

// ============================================================
// M8: PUBLIC STATS (landing page)
// ============================================================
interface CachedStats {
  data: Record<string, number>;
  expires_at: number;
}
let statsCache: CachedStats | null = null;
const STATS_TTL_MS = 10 * 60 * 1000; // 10 min

/**
 * GET /public/stats — cho landing page "Trusted by X clinics" + counters.
 * Aggregated counts, KHÔNG leak user info.
 * Cache 10 min để giảm Baserow load.
 */
publicRoute.get("/stats", async (c) => {
  if (statsCache && statsCache.expires_at > Date.now()) {
    return c.json({ ...statsCache.data, cached: true });
  }

  try {
    const [petsRes, usersRes, alertsRes, vaccinesRes] = await Promise.all([
      listRows("pets", { size: 1 }),
      listRows("users", { size: 1 }),
      listRows("climate_alerts", { size: 1 }),
      listRows("vaccines", { size: 1 }),
    ]);

    const data = {
      total_pets: petsRes.count || 0,
      total_users: usersRes.count || 0,
      total_alerts: alertsRes.count || 0,
      total_vaccines: vaccinesRes.count || 0,
      partner_clinics: 1, // Placeholder Phase 0: Mon Min Pet
    };
    statsCache = { data, expires_at: Date.now() + STATS_TTL_MS };
    return c.json({ ...data, cached: false });
  } catch (err: any) {
    console.error("[public/stats] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load stats" } }, 500);
  }
});
