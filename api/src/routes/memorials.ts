/**
 * Memorial Hall routes (M30).
 *
 * Mount:
 *   app.route("/api/v1/pets", petMemorialRoute)         — auth, owner
 *   app.route("/api/v1/memorials", memorialAuthRoute)   — auth (manage / interest)
 *   app.route("/api/v1/public", memorialPublicRoute)    — no auth (visit, candle, message)
 *
 * Endpoints:
 *   POST   /pets/:id/memorial                        — create
 *   GET    /pets/:id/memorial                        — get owner's memorial
 *   PATCH  /memorials/:mid                           — update
 *   DELETE /memorials/:mid                           — delete
 *   POST   /memorials/:mid/interest                  — register premium tier interest (no payment)
 *   GET    /memorials/my                             — list my memorials
 *
 *   GET    /public/memorial/:slug                    — public memorial view (logs visit if visitor_name)
 *   POST   /public/memorial/:slug/candle             — light a candle (anonymous OK)
 *   POST   /public/memorial/:slug/message            — leave message + optional candle
 *   GET    /public/memorial/:slug/visits             — public visit/candle wall
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  createMemorial,
  getMemorial,
  getMemorialByPet,
  getMemorialBySlug,
  updateMemorial,
  deleteMemorialRow,
  listUserMemorials,
  logVisit,
  listVisits,
  refreshMemorialStats,
  registerInterest,
  listInterestForUser,
  type MemorialStatus,
  type MemorialTier,
} from "../lib/memorials.ts";

// ============================================================
// /pets/:id/memorial (auth required, owner only)
// ============================================================
export const petMemorialRoute = new Hono();
petMemorialRoute.use("*", requireAuth);

petMemorialRoute.post("/:id{[0-9]+}/memorial", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  // Only one memorial per pet
  const existing = await getMemorialByPet(petId);
  if (existing) {
    return c.json({ error: { code: "ALREADY_EXISTS", message: "Bé đã có memorial. Dùng PATCH để cập nhật." }, memorial: existing }, 409);
  }

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  try {
    const m = await createMemorial({
      petId,
      userId: session.sub,
      passed_away_date: body.passed_away_date || null,
      tribute_message: typeof body.tribute_message === "string" ? body.tribute_message : "",
      cover_photo_url: body.cover_photo_url || null,
      photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls : [],
      music_url: body.music_url || null,
      memorial_status: (body.memorial_status as MemorialStatus) || "active",
    });
    return c.json({ memorial: m }, 201);
  } catch (err: any) {
    console.error("[memorial/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo memorial" } }, 500);
  }
});

petMemorialRoute.get("/:id{[0-9]+}/memorial", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const m = await getMemorialByPet(petId);
    return c.json({ memorial: m });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// /memorials/* (auth required)
// ============================================================
export const memorialAuthRoute = new Hono();
memorialAuthRoute.use("*", requireAuth);

memorialAuthRoute.get("/my", async (c) => {
  const session = c.get("user");
  try {
    const list = await listUserMemorials(session.sub);
    return c.json({ memorials: list, total: list.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load" } }, 500);
  }
});

memorialAuthRoute.patch("/:mid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const mid = Number(c.req.param("mid"));
  const existing = await getMemorial(mid);
  if (!existing) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
  if (existing.user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  try {
    const updated = await updateMemorial(mid, {
      passed_away_date: body.passed_away_date,
      tribute_message: body.tribute_message,
      cover_photo_url: body.cover_photo_url,
      photo_urls: body.photo_urls,
      music_url: body.music_url,
      memorial_status: body.memorial_status,
    });
    return c.json({ memorial: updated });
  } catch (err: any) {
    console.error("[memorial/patch] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi update" } }, 500);
  }
});

memorialAuthRoute.delete("/:mid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const mid = Number(c.req.param("mid"));
  const existing = await getMemorial(mid);
  if (!existing) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
  if (existing.user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }
  try {
    await deleteMemorialRow(mid);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xoá" } }, 500);
  }
});

memorialAuthRoute.post("/:mid{[0-9]+}/interest", async (c) => {
  const session = c.get("user");
  const mid = Number(c.req.param("mid"));
  const existing = await getMemorial(mid);
  if (!existing) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy memorial" } }, 404);
  if (existing.user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  const tier = String(body.tier || "");
  if (!["tribute", "lifetime", "pro"].includes(tier)) {
    return c.json({ error: { code: "BAD_TIER", message: "Tier phải là tribute/lifetime/pro" } }, 400);
  }
  const phone = String(body.contact_phone || "").trim();
  if (!phone) {
    return c.json({ error: { code: "PHONE_REQUIRED", message: "Cần số điện thoại để Mon Min liên hệ" } }, 400);
  }

  try {
    const interest = await registerInterest({
      userId: session.sub,
      petId: existing.pet_id,
      memorialId: mid,
      tier: tier as any,
      contact_phone: phone,
      contact_preferred_time: body.contact_preferred_time || "",
      notes: body.notes || "",
    });
    return c.json({
      interest,
      message: "VowVet đã ghi nhận. Đội ngũ sẽ liên hệ lại trong 1-2 ngày làm việc. Không có phí trả trước. Nếu cần hỗ trợ gấp, chat Zalo https://zalo.me/1136810892220003266 hoặc gọi 0779 029 133.",
    }, 201);
  } catch (err: any) {
    console.error("[memorial/interest] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi gửi đăng ký" } }, 500);
  }
});

memorialAuthRoute.get("/my-interest", async (c) => {
  const session = c.get("user");
  try {
    const list = await listInterestForUser(session.sub);
    return c.json({ interests: list, total: list.length });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// /public/memorial/:slug (no auth)
// ============================================================
export const memorialPublicRoute = new Hono();

memorialPublicRoute.get("/memorial/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!slug || slug.length < 5 || slug.length > 30) {
    return c.json({ error: { code: "BAD_SLUG", message: "Slug không hợp lệ" } }, 400);
  }
  try {
    const m = await getMemorialBySlug(slug);
    if (!m || m.memorial_status === "private" || m.memorial_status === "archived") {
      return c.json({ error: { code: "NOT_FOUND", message: "Memorial không khả dụng" } }, 404);
    }
    return c.json({ memorial: m });
  } catch (err: any) {
    console.error("[memorial/public] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

memorialPublicRoute.get("/memorial/:slug/visits", async (c) => {
  const slug = c.req.param("slug");
  try {
    const m = await getMemorialBySlug(slug);
    if (!m || m.memorial_status !== "active") {
      return c.json({ error: { code: "NOT_FOUND", message: "Memorial không khả dụng" } }, 404);
    }
    const visits = await listVisits(m.id, 50);
    return c.json({ visits, total: visits.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

memorialPublicRoute.post("/memorial/:slug/candle", async (c) => {
  const slug = c.req.param("slug");
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  try {
    const m = await getMemorialBySlug(slug);
    if (!m || m.memorial_status !== "active") {
      return c.json({ error: { code: "NOT_FOUND", message: "Memorial không khả dụng" } }, 404);
    }
    const visit = await logVisit({
      memorialId: m.id,
      visitor_name: body.visitor_name || "",
      candle_lit: true,
    });
    refreshMemorialStats(m.id).catch((e) => console.error("[memorial] stats:", e));
    return c.json({ visit }, 201);
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi thắp nến" } }, 500);
  }
});

memorialPublicRoute.post("/memorial/:slug/message", async (c) => {
  const slug = c.req.param("slug");
  let body: any = {};
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }
  const message = String(body.message || "").trim();
  if (!message) {
    return c.json({ error: { code: "EMPTY", message: "Cần lời nhắn" } }, 400);
  }
  try {
    const m = await getMemorialBySlug(slug);
    if (!m || m.memorial_status !== "active") {
      return c.json({ error: { code: "NOT_FOUND", message: "Memorial không khả dụng" } }, 404);
    }
    const visit = await logVisit({
      memorialId: m.id,
      visitor_name: body.visitor_name || "Ẩn danh",
      visitor_email: body.visitor_email || "",
      message,
      candle_lit: body.candle_lit === true,
    });
    refreshMemorialStats(m.id).catch((e) => console.error("[memorial] stats:", e));
    return c.json({ visit }, 201);
  } catch (err: any) {
    console.error("[memorial/message] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi gửi lời nhắn" } }, 500);
  }
});
