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
import { createFosterOrder, getFosterLeaderboard, FosterOrderError, markOrderPaid, getOrderByPayosCode } from "../lib/foster-orders.ts";
import { FosterOrderSchema } from "@shared/zod-schemas/public-pet.ts";
import { PAYOS_MODE, verifyThuWebhook, verifyChiWebhook, __setMockPayoutStatus } from "../lib/payos.ts";
import { settleFosterPayout } from "./admin.ts";
import { requireAuth } from "../middleware/auth.ts";

export const publicRoute = new Hono();

publicRoute.use("*", ipRateLimit("public-passport", 30, 60));

// ===== GET /public/foster — board bé foster công khai (FOSTER L4a) =====
publicRoute.get("/foster", async (c) => {
  try {
    const [pets, leaderboard] = await Promise.all([listFosterPets(), getFosterLeaderboard()]);
    c.header("Cache-Control", "public, max-age=120");
    return c.json({ pets, leaderboard });
  } catch (err) {
    console.error("[public/foster] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== FOSTER W5 — chủ bé xem donor của bé mình. AUTH-GATED per-route =====
// ⚠ KHÁC các route /public/* khác: route NÀY qua requireAuth (publicRoute không auth mặc định).
// Privacy: CHỈ đơn paid mà pet_owner_id == user.sub (owner check server-side, không tin client) +
//   deleted_at null. Map WHITELIST field tay — CẤM lộ beneficiary_*/approved_by/pay_ref/payout_ref/payos_order_code.
publicRoute.get("/foster/my-supporters", requireAuth, async (c) => {
  const session = c.get("user");
  const uid = Number(session.sub);
  try {
    const r = await listRows<any>("foster_orders" as any, { size: 200 });
    const flat = (v: any): string => (v && typeof v === "object" && "value" in v ? String(v.value) : v == null ? "" : String(v));
    const petName = (f: any): string | null => (Array.isArray(f) && f[0] ? (typeof f[0] === "object" ? f[0].value || null : null) : null);
    const supporters = r.results
      .filter(
        (o: any) =>
          o.order_code &&
          Number(o.pet_owner_id) === uid && // OWNER check — chỉ đơn của pet do user này sở hữu
          flat(o.payment_status) === "paid" && // chỉ đơn đã trả tiền (pending/bỏ giỏ KHÔNG hiện)
          !o.deleted_at
      )
      .map((o: any) => ({
        // WHITELIST — map tay, KHÔNG dump row nhạy cảm.
        donor_name: o.donor_name || "Ẩn danh",
        amount_paid: Number(o.amount_paid) || 0,
        package_title: o.package_title || null,
        paid_at: o.paid_at || null,
        payout_status: flat(o.payout_status) || "none", // để chủ bé biết đã chuyển cho mình chưa
        pet_name: petName(o.pet_id), // bé của CHÍNH chủ (không nhạy cảm)
      }))
      .sort((a, b) => String(b.paid_at || "").localeCompare(String(a.paid_at || "")));
    return c.json({ supporters });
  } catch (err) {
    console.error("[public/foster/my-supporters] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== POST /public/foster-order — ghi đơn góp (FOSTER L5a, public) =====
publicRoute.post("/foster-order", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400); }
  const parsed = FosterOrderSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION", message: "Dữ liệu đơn không hợp lệ" } }, 400);
  try {
    const result = await createFosterOrder(parsed.data);
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof FosterOrderError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 403 | 404 | 500);
    console.error("[public/foster-order] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== PAYOS WEBHOOK THU (epic foster-payment W2) — MOUNT LUÔN (cần cho live) =====
// LIVE: verifyThuWebhook = checksum PAYOS_CHECKSUM_KEY. Endpoint public trên internet →
//   sai/thiếu chữ ký = 401, KHÔNG cho ai cũng POST "paid" lấy foster free.
// MOCK: verifyThuWebhook passthrough (chủ đích).
// ACK 200 kể cả already/mismatch/not-found → PayOS ngừng retry-storm; đã log/cờ nội bộ.
publicRoute.post("/payos/webhook-thu", async (c) => {
  let payload: any;
  try { payload = await c.req.json(); } catch { return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400); }
  const sig = c.req.header("x-payos-signature") || c.req.header("x-signature") || undefined;
  const ev = verifyThuWebhook(payload, sig);
  if (!ev) return c.json({ error: { code: "BAD_SIGNATURE", message: "Chữ ký không hợp lệ" } }, 401);
  try {
    const result = await markOrderPaid(ev);
    return c.json({ received: true, result }, 200);
  } catch (err) {
    console.error("[public/payos/webhook-thu] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== DEV MOCK PAY (epic foster-payment W2) — CHỈ khi mock VÀ cờ opt-in PAYOS_ALLOW_MOCK_HTTP=1 =====
// Giả PayOS: dựng payload ĐÚNG package_price rồi gọi CÙNG markOrderPaid mà webhook-thu dùng.
// SECURITY: cờ opt-in tường minh → prod (KHÔNG set cờ) không phát route mock, kể cả lỡ để mode=mock.
if (PAYOS_MODE === "mock" && process.env.PAYOS_ALLOW_MOCK_HTTP === "1") {
  publicRoute.post("/dev/mock-pay/:orderCode", async (c) => {
    const orderCode = Number(c.req.param("orderCode"));
    if (!orderCode || Number.isNaN(orderCode)) {
      return c.json({ error: { code: "BAD_CODE", message: "orderCode không hợp lệ" } }, 400);
    }
    const order = await getOrderByPayosCode(orderCode);
    if (!order) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy đơn" } }, 404);
    // mock gửi ĐÚNG package_price (Lock 3) → đi qua amount-guard giống live.
    const ev = { orderCode, amount: Number(order.package_price) || 0, ref: `mock-thu-${orderCode}` };
    const result = await markOrderPaid(ev);
    return c.json({ mock: true, result }, 200);
  });
}

// ===== PAYOS WEBHOOK CHI (epic foster-payment W4) — MOUNT LUÔN (cho live) =====
// PayOS đẩy kết quả lệnh chi. Parse order_code từ ref → settle qua CÙNG mutex W3 (admin.ts).
// LIVE: verifyChiWebhook = checksum → sai chữ ký 401. MOCK: passthrough.
// ACK 200 kể cả already/not-found → PayOS ngừng retry.
publicRoute.post("/payos/webhook-chi", async (c) => {
  let payload: any;
  try { payload = await c.req.json(); } catch { return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400); }
  const sig = c.req.header("x-payos-signature") || c.req.header("x-signature") || undefined;
  const ev = verifyChiWebhook(payload, sig);
  if (!ev) return c.json({ error: { code: "BAD_SIGNATURE", message: "Chữ ký không hợp lệ" } }, 401);
  const orderCode = ev.ref.replace(/^foster-/, ""); // ref = "foster-<order_code>"
  try {
    const out = await settleFosterPayout(orderCode, ev.status);
    return c.json({ received: true, result: out.body }, 200);
  } catch (err) {
    console.error("[public/payos/webhook-chi] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== DEV MOCK PAYOUT RESULT (epic foster-payment W4) — CHỈ khi mock VÀ cờ PAYOS_ALLOW_MOCK_HTTP=1 =====
// Test-only: đặt kết quả getPayoutStatus(ref) để verify nhánh success/failed. Prod (KHÔNG cờ) → route vắng.
if (PAYOS_MODE === "mock" && process.env.PAYOS_ALLOW_MOCK_HTTP === "1") {
  publicRoute.post("/dev/mock-payout-result", async (c) => {
    let b: any;
    try { b = await c.req.json(); } catch { return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400); }
    const ref = String(b?.ref || "").trim();
    const status = String(b?.status || "");
    if (!ref || (status !== "sent" && status !== "success" && status !== "failed")) {
      return c.json({ error: { code: "BAD", message: "cần ref + status(sent|success|failed)" } }, 400);
    }
    __setMockPayoutStatus(ref, status as any);
    return c.json({ ok: true, ref, status }, 200);
  });
}

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
