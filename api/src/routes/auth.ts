/**
 * Auth routes:
 *   POST /request-otp   — sinh OTP, console.log (mock Zalo Phase 0)
 *   POST /verify-otp    — verify, tạo/tìm user, set cookie session
 *   POST /logout        — xoá cookie
 *   GET  /me            — current user + pets (refresh-on-use JWT)
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { normalizePhone, VN_PHONE_REGEX } from "@shared/auth.ts";
import { signSession } from "@shared/jwt.ts";
import { getMeCache, setMeCache } from "../lib/me-cache.ts";
import { speciesEnToVi, genderEnToVi } from "@shared/enum-mappers.ts";
import { toApiPet } from "./pets.ts";   // v49: share mapper
import { requestOtp, verifyOtp } from "../lib/otp.ts";
import { sendOtp } from "../lib/otp-sender.ts";
import {
  findOrCreateUser,
  findUserByPhone,
  findUserById,
  getIsOnboarded,
  listUserPets,
} from "../lib/users.ts";
import { setSessionCookie, clearSessionCookie } from "../lib/session-cookie.ts";
import { requireAuth } from "../middleware/auth.ts";

export const authRoute = new Hono();

// ===== POST /request-otp =====
const requestOtpSchema = z.object({
  phone: z.string().min(1, "Vui lòng nhập số điện thoại"),
});

authRoute.post("/request-otp", zValidator("json", requestOtpSchema), async (c) => {
  const { phone: rawPhone } = c.req.valid("json");

  let phone: string;
  try {
    phone = normalizePhone(rawPhone);
  } catch {
    return c.json(
      { error: { code: "INVALID_PHONE", message: "Số điện thoại không hợp lệ. Ví dụ: 0901234567" } },
      400
    );
  }

  try {
    const { code, expires_in } = requestOtp(phone);
    // M8: gửi OTP qua sender (mock console.log hoặc Zalo ZNS, graceful fallback).
    await sendOtp(phone, code);
    console.log(`[auth/request-otp] phone=${phone} sent OK`);

    // Mã OTP KHÔNG BAO GIỜ ra HTTP response (bảo mật) — chỉ qua kênh gửi + log server.
    return c.json({ success: true, expires_in });
  } catch (err: any) {
    console.error(`[auth/request-otp] phone=${phone} error:`, err?.code, err?.message);
    const status = err.code === "OTP_LOCKED" || err.code === "RATE_LIMITED" ? 429 : 400;
    return c.json({ error: { code: err.code || "UNKNOWN", message: err.message } }, status);
  }
});

// ===== POST /verify-otp =====
const verifyOtpSchema = z.object({
  phone: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Mã OTP phải đủ 6 chữ số"),
});

authRoute.post("/verify-otp", zValidator("json", verifyOtpSchema), async (c) => {
  const { phone: rawPhone, code } = c.req.valid("json");

  let phone: string;
  try {
    phone = normalizePhone(rawPhone);
  } catch {
    return c.json({ error: { code: "INVALID_PHONE", message: "Số điện thoại không hợp lệ" } }, 400);
  }

  const result = verifyOtp(phone, code);
  if (!result.ok) {
    if (result.code === "OTP_WRONG") {
      return c.json(
        {
          error: {
            code: "OTP_WRONG",
            message: `Mã không đúng. Còn ${result.attempts_left} lần thử`,
            attempts_left: result.attempts_left,
          },
        },
        400
      );
    }
    if (result.code === "OTP_EXPIRED") {
      return c.json(
        { error: { code: "OTP_EXPIRED", message: "Mã đã hết hạn. Vui lòng gửi lại mã mới" } },
        400
      );
    }
    if (result.code === "OTP_LOCKED") {
      const min = Math.ceil((result.retry_after || 0) / 60);
      return c.json(
        { error: { code: "OTP_LOCKED", message: `Tài khoản tạm khoá. Thử lại sau ${min} phút` } },
        429
      );
    }
  }

  // OTP đúng — find or create user
  let user: any, is_new: boolean;
  try {
    const r = await findOrCreateUser(phone);
    user = r.user;
    is_new = r.is_new;
  } catch (err: any) {
    console.error(`[auth/verify-otp] findOrCreateUser failed phone=${phone}:`, err?.message || err);
    return c.json(
      { error: { code: "USER_CREATE_FAIL", message: "Lỗi tạo tài khoản. Liên hệ admin nếu lặp lại." } },
      500
    );
  }

  if ((user as any).deleted_at) {
    return c.json(
      { error: { code: "USER_DELETED", message: "Tài khoản đã bị xóa" } },
      403
    );
  }
  const is_onboarded = is_new ? false : await getIsOnboarded(user.id);

  let token: string;
  try {
    token = signSession({
      sub: user.id,
      phone: user.phone || undefined,
      email: (user as any).email || undefined,
      is_onboarded,
    });
  } catch (err: any) {
    console.error(`[auth/verify-otp] signSession failed (JWT_SECRET missing?):`, err?.message);
    return c.json(
      { error: { code: "SESSION_FAIL", message: "Lỗi tạo phiên đăng nhập (JWT_SECRET)" } },
      500
    );
  }
  setSessionCookie(c, token);
  console.log(`[auth/verify-otp] phone=${phone} login OK uid=${user.id} new=${is_new}`);

  // M21+: post-login routing
  //   - Chưa onboarded → /onboarding (wizard tạo pet đầu)
  //   - Onboarded + có phone nhưng KHÔNG có password và KHÔNG có Google → suggest /account/setup-password
  //     (Frontend có thể skip 30 ngày qua localStorage `vv_setup_password_skipped_at`)
  //   - Else → /dashboard
  const hasPassword = !!(user as any).password_hash;
  const hasGoogle = !!(user as any).google_oauth_id;
  const shouldSuggestSetup = is_onboarded && !hasPassword && !hasGoogle;
  const redirectTo = !is_onboarded
    ? "/onboarding"
    : shouldSuggestSetup
    ? "/account/setup-password"
    : "/dashboard";

  return c.json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      email: (user as any).email || null,
      name: user.name,
      avatar_url: (user as any).avatar_url || null,
      onboarded: is_onboarded,
      onboarding_completed: is_onboarded, // M2 legacy alias for frontend compatibility
      has_password: hasPassword,
      has_google: hasGoogle,
    },
    is_new_user: is_new,
    redirect_to: redirectTo,
    suggest_setup_password: shouldSuggestSetup, // frontend can skip via localStorage 30d
  });
});

// ===== POST /logout =====
authRoute.post("/logout", (c) => {
  clearSessionCookie(c);
  return c.json({ success: true });
});

// ===== GET /me  (protected, refresh-on-use) =====
// Admin check — dùng chung whitelist với admin.ts (env ADMIN_PHONES).
const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);

authRoute.get("/me", requireAuth, async (c) => {
  const session = c.get("user");
  // M8: lookup theo user_id thay vì phone (Google OAuth users không có phone)
  // v275: cache ngắn (12s) + song song hóa khi MISS. Invalidate khi user ghi (middleware index.ts)
  // → tránh query Baserow ~1.5s mỗi page SSR mà KHÔNG trả data cũ sau khi user vừa sửa.
  let user: any, pets: any[];
  const cached = getMeCache(session.sub);
  if (cached) {
    user = cached.user;
    pets = cached.pets;
  } else {
    [user, pets] = await Promise.all([
      findUserById(session.sub),
      listUserPets(session.sub),
    ]);
    if (!user || (user as any).deleted_at) {
      clearSessionCookie(c);
      return c.json({ error: { code: "USER_NOT_FOUND", message: "Phiên đã hết hạn" } }, 401);
    }
    setMeCache(session.sub, user, pets);
  }
  const is_onboarded = pets.length > 0;

  // Refresh-on-use: gia hạn cookie với is_onboarded mới nhất
  const refreshed = signSession({
    sub: user.id,
    phone: user.phone || undefined,
    email: (user as any).email || undefined,
    zalo_user_id: (user as any).zalo_user_id || undefined, // giữ định danh Zalo qua refresh-on-use
    is_onboarded,
  });
  setSessionCookie(c, refreshed);

  return c.json({
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      onboarding_completed: is_onboarded,
      is_admin: !!session.phone && ADMIN_PHONES.includes(session.phone),
      // Đợt 2b: popup nhắc cân 1 lần/ngày/user (food-brands đọc + so sánh ngày)
      last_seen_food_brands: (user as any).last_seen_food_brands ?? null,
    },
    pets: pets.map(toApiPet),    // v49: share mapper với /pets routes (single source of truth)
  });
});
