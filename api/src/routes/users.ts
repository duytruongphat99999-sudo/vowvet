/**
 * User self-service routes (M5):
 *   POST /api/v1/users/me/city               — update city
 *   POST /api/v1/users/me/push-subscribe     — save Web Push subscription
 *   POST /api/v1/users/me/push-unsubscribe   — clear subscription
 *   POST /api/v1/users/me/notification-preferences — update prefs
 *   GET  /api/v1/users/me/settings           — full settings snapshot (city + prefs + has_sub)
 *   POST /api/v1/push/test                    — test push (bypass rate limit)
 *   GET  /api/v1/push/vapid-public-key        — public key cho client subscribe
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import {
  findUserById,
  findUserByEmail,
  findUserByGoogleOauthId,
  linkUserToGoogle,
  unlinkGoogleFromUser,
  softDeleteUser,
  updateUserProfile,
  getAuthMethod,
  markOnboarded,
  type BaserowUser,
} from "../lib/users.ts";
import { setSessionCookie } from "../lib/session-cookie.ts";
import { signSession } from "@shared/jwt.ts";
import { listRows, updateRow } from "@shared/baserow.ts";
import {
  UpdateCitySchema,
  SubscribePushSchema,
  NotificationPreferencesSchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@shared/zod-schemas/m5.ts";
import { sendPush, getVapidPublicKey } from "../lib/web-push.ts";
import { CITIES, DEFAULT_CITY } from "@shared/cities.ts";
import { clearSessionCookie } from "../lib/session-cookie.ts";
import { markNotified, getReclaimEligible, getUnnotifiedResolved } from "../lib/reclaim-requests.ts";

export const usersRoute = new Hono();
usersRoute.use("*", requireAuth);

// ===== FOSTER Hướng B — data reclaim cho dashboard chủ cũ =====
//   eligible: bé đủ điều kiện gửi yêu cầu (card + countdown 72h)
//   resolved: yêu cầu đã được duyệt nhưng chưa báo (banner "bé đã về")
usersRoute.get("/me/reclaim-summary", async (c) => {
  const session = c.get("user");
  try {
    const [eligible, resolved] = await Promise.all([
      getReclaimEligible(session.sub),
      getUnnotifiedResolved(session.sub),
    ]);
    return c.json({ eligible, resolved });
  } catch (err) {
    console.error("[users/reclaim-summary] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== FOSTER #3 — bé user vừa NHẬN (receiver) trong 7 ngày → card dashboard "bé mới nhận" =====
// Chỉ listRows foster_handovers + users lookup (KHÔNG table/field mới). Nút card dùng B1 /conversations/foster.
usersRoute.get("/me/foster-received", async (c) => {
  const session = c.get("user");
  try {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000; // 7 ngày gần đây
    const hRes = await listRows<any>("foster_handovers" as any, { size: 200 });
    const mine = hRes.results.filter((h: any) => {
      if (Number(h.to_user_id) !== session.sub) return false;
      const t = h.created_at ? new Date(h.created_at).getTime() : 0;
      return t >= cutoff;
    });
    if (mine.length === 0) return c.json({ received: [] });

    // tên người trao — 1 listRows users, map id→tên (giống admin/reclaim)
    const uRes = await listRows<any>("users", { size: 200 });
    const nameById = new Map<number, string>();
    for (const u of uRes.results) nameById.set(u.id, u.name || u.phone || u.email || `user ${u.id}`);
    const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);

    const received = mine
      .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .map((h: any) => ({
        handover_id: h.id,
        pet_name: flat(h.pet_name) || "bé",
        giver_name: nameById.get(Number(h.from_user_id)) || `user ${h.from_user_id}`,
        created_at: h.created_at || null,
      }));
    return c.json({ received });
  } catch (err) {
    console.error("[users/foster-received] error:", err);
    return c.json({ received: [] });
  }
});

// ===== FOSTER Hướng B — chủ cũ tắt banner "yêu cầu đã được duyệt" trên dashboard =====
usersRoute.post("/me/notifications/mark-read", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { body = {}; }
  const requestId = Number(body?.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return c.json({ error: { code: "BAD_ID", message: "requestId không hợp lệ" } }, 400);
  }
  try {
    await markNotified(requestId);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[users/mark-read] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

/** Parse notification_preferences từ stored JSON (default nếu null). */
function parsePrefs(raw: string | null | undefined) {
  if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

// ===== GET /users/me/settings =====
usersRoute.get("/me/settings", async (c) => {
  const session = c.get("user");
  const user = await findUserById(session.sub);
  if (!user) {
    return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  }
  const u = user as any;
  const cityValue =
    typeof u.city === "object" ? (u.city as any)?.value : u.city;
  // M8: auth methods snapshot
  const authMethod = getAuthMethod(user) || (u.zalo_user_id ? "zalo_oauth" : "phone_otp");
  const hasGoogle = !!u.google_oauth_id;
  const hasPhone = !!user.phone;
  return c.json({
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: u.email || null,
      avatar_url: u.avatar_url || null,
    },
    auth: {
      method: authMethod,
      has_phone: hasPhone,
      has_google: hasGoogle,
      can_unlink_google: hasGoogle && hasPhone, // chỉ unlink được nếu còn phone fallback
    },
    city: cityValue || DEFAULT_CITY,
    timezone: u.timezone || "Asia/Ho_Chi_Minh",
    notification_preferences: parsePrefs(u.notification_preferences),
    has_push_subscription: !!u.push_subscription,
    vapid_public_key: getVapidPublicKey() || null,
  });
});

// ===== POST /users/me/complete-onboarding (M21) =====
// Explicit marker — frontend calls khi user hoàn thành wizard onboarding.
// Refreshes session cookie so next request has is_onboarded=true in JWT immediately.
usersRoute.post("/me/complete-onboarding", async (c) => {
  const session = c.get("user");
  try {
    const user = await markOnboarded(session.sub);
    const refreshed = signSession({
      sub: user.id,
      phone: user.phone || undefined,
      email: (user as any).email || undefined,
      is_onboarded: true,
    });
    setSessionCookie(c, refreshed);
    console.log(`[users/complete-onboarding] uid=${user.id} marked onboarded=true`);
    return c.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        email: (user as any).email || null,
        name: user.name,
        onboarded: true,
      },
      redirect_to: "/dashboard",
    });
  } catch (err: any) {
    console.error("[users/complete-onboarding] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi đánh dấu onboarded" } }, 500);
  }
});

// ===== GET /users/me/care-plan-consent (A5 Pre-Launch) =====
// Returns whether the user has ack'd the AI Care Plan disclaimer.
// Used by web SSR before mounting /care-plan page — if NULL, modal blocks view.
usersRoute.get("/me/care-plan-consent", async (c) => {
  const session = c.get("user");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  return c.json({
    consented_at: (user as any).care_plan_consented_at || null,
    version: (user as any).care_plan_consent_version || null,
  });
});

// ===== POST /users/me/care-plan-consent (A5 Pre-Launch) =====
const ConsentAckSchema = z.object({
  version: z.string().min(1).max(50).default("v1-2026-05"),
});
usersRoute.post(
  "/me/care-plan-consent",
  zValidator("json", ConsentAckSchema),
  async (c) => {
    const session = c.get("user");
    const { version } = c.req.valid("json");
    const user = await findUserById(session.sub);
    if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
    const nowIso = new Date().toISOString();
    await updateRow("users", user.id, {
      care_plan_consented_at: nowIso,
      care_plan_consent_version: version,
    });
    console.log(`[users/care-plan-consent] uid=${user.id} acked v=${version}`);
    return c.json({ success: true, consented_at: nowIso, version });
  }
);

// ===== POST /users/me/seen-food-brands (Đợt 2b) =====
// Đánh dấu user đã xem trang food-brands hôm nay → popup nhắc cân chỉ hiện 1 lần/ngày/user.
// Lưu ngày theo giờ VN (UTC+7) để khớp "hôm nay" của người dùng.
usersRoute.post("/me/seen-food-brands", async (c) => {
  const session = c.get("user");
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  await updateRow("users", session.sub, { last_seen_food_brands: today });
  return c.json({ success: true, date: today });
});

// ===== POST /users/me/city =====
usersRoute.post("/me/city", zValidator("json", UpdateCitySchema), async (c) => {
  const session = c.get("user");
  const { city } = c.req.valid("json");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  await updateRow("users", user.id, { city });
  return c.json({ success: true, city, city_name: CITIES[city].name_vn });
});

// ===== POST /users/me/push-subscribe =====
usersRoute.post("/me/push-subscribe", zValidator("json", SubscribePushSchema), async (c) => {
  const session = c.get("user");
  const { subscription } = c.req.valid("json");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  await updateRow("users", user.id, { push_subscription: JSON.stringify(subscription) });
  // Gửi test notification chào mừng (bypass rate limit)
  await sendPush(
    user.id,
    JSON.stringify(subscription),
    {
      title: "✅ VowVet đã sẵn sàng",
      body: `Bạn sẽ nhận cảnh báo khí hậu cho ${(user as any).name || "thú cưng của bạn"}.`,
      data: { url: "/alerts" },
    },
    { type: "alert_push", bypassRateLimit: true }
  );
  return c.json({ success: true });
});

// ===== POST /users/me/push-unsubscribe =====
usersRoute.post("/me/push-unsubscribe", async (c) => {
  const session = c.get("user");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  await updateRow("users", user.id, { push_subscription: null });
  return c.json({ success: true });
});

// ===== POST /users/me/notification-preferences =====
usersRoute.post(
  "/me/notification-preferences",
  zValidator("json", NotificationPreferencesSchema),
  async (c) => {
    const session = c.get("user");
    const prefs = c.req.valid("json");
    const user = await findUserById(session.sub);
    if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
    await updateRow("users", user.id, { notification_preferences: JSON.stringify(prefs) });
    return c.json({ success: true, preferences: prefs });
  }
);

// ===== POST /users/me/update-profile (M8) =====
const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
});

usersRoute.post("/me/update-profile", zValidator("json", UpdateProfileSchema), async (c) => {
  const session = c.get("user");
  const data = c.req.valid("json");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  await updateUserProfile(user.id, {
    name: data.name === undefined ? undefined : data.name,
    avatar_url: data.avatar_url === undefined ? undefined : data.avatar_url,
  });
  return c.json({
    success: true,
    user: {
      id: user.id,
      name: data.name !== undefined ? data.name : user.name,
      avatar_url: data.avatar_url !== undefined ? data.avatar_url : (user as any).avatar_url || null,
    },
  });
});

// ===== POST /users/me/delete-account (M8) — soft delete =====
const DeleteAccountSchema = z.object({
  confirm: z.literal("XOA"), // user phải nhập "XOA" để confirm — chống mis-click
});

usersRoute.post("/me/delete-account", zValidator("json", DeleteAccountSchema), async (c) => {
  const session = c.get("user");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  await softDeleteUser(user.id);
  // Log to console (Phase 0 — defer email confirmation)
  console.log(
    `[users] SOFT_DELETE user=${user.id} phone=${user.phone} email=${(user as any).email} at=${new Date().toISOString()}`
  );
  // Clear session cookie
  clearSessionCookie(c);
  return c.json({ success: true, message: "Tài khoản đã được xóa. Dữ liệu giữ 30 ngày trước khi xóa vĩnh viễn." });
});

// ===== POST /users/me/unlink-google (M8) =====
usersRoute.post("/me/unlink-google", async (c) => {
  const session = c.get("user");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  const u = user as any;
  if (!u.google_oauth_id) {
    return c.json({ error: { code: "NOT_LINKED", message: "Tài khoản chưa link Google" } }, 400);
  }
  if (!user.phone) {
    return c.json(
      {
        error: {
          code: "PHONE_REQUIRED",
          message: "Không thể bỏ liên kết Google vì đây là phương thức đăng nhập duy nhất. Hãy thêm số điện thoại trước.",
        },
      },
      400
    );
  }
  await unlinkGoogleFromUser(user.id);
  return c.json({ success: true });
});

// ===== POST /push/test — gửi test push ngay (bypass rate limit) =====
export const pushRoute = new Hono();
pushRoute.use("*", requireAuth);

pushRoute.post("/test", async (c) => {
  const session = c.get("user");
  const user = await findUserById(session.sub);
  if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: "User không tồn tại" } }, 404);
  const sub = (user as any).push_subscription;
  if (!sub) {
    return c.json(
      { error: { code: "NO_SUBSCRIPTION", message: "Chưa subscribe push. Vào /settings bật thông báo trước." } },
      400
    );
  }
  const result = await sendPush(
    user.id,
    sub,
    {
      title: "🔔 VowVet — Test thông báo",
      body: "Hệ thống đang hoạt động. Bạn sẽ nhận được cảnh báo thật khi cần.",
      data: { url: "/alerts", test: true },
    },
    { bypassRateLimit: true }
  );
  return c.json({ success: result.ok, result });
});

pushRoute.get("/vapid-public-key", async (c) => {
  const key = getVapidPublicKey();
  if (!key) {
    return c.json({ error: { code: "VAPID_MISSING", message: "VAPID chưa cấu hình ở server" } }, 503);
  }
  return c.json({ public_key: key });
});
