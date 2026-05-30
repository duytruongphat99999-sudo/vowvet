/**
 * Email + Password auth routes (M20-auth).
 *
 * Mount: app.route("/api/v1/auth/email", authEmailRoute)
 *
 * Endpoints:
 *   POST /register         body: {email, password, name?}      → session cookie
 *   POST /login            body: {email, password}             → session cookie
 *   POST /forgot-password  body: {email}                       → emails reset link (mock console)
 *   POST /reset-password   body: {token, new_password}         → updates hash
 *   POST /set-password     body: {password, email?}            → set password for current logged-in user (auth)
 *   DELETE /password                                            → unlink password from current account (auth)
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { signSession } from "@shared/jwt.ts";
import { setSessionCookie } from "../lib/session-cookie.ts";
import { requireAuth } from "../middleware/auth.ts";
import {
  registerEmailUser,
  loginEmailUser,
  issueResetToken,
  resetPasswordWithToken,
  setPasswordOnExistingUser,
  removePasswordFromUser,
  mockSendEmail,
} from "../lib/email-auth.ts";
import { getIsOnboarded, findUserById } from "../lib/users.ts";

export const authEmailRoute = new Hono();

const APP_DOMAIN = process.env.APP_DOMAIN || "https://vowvet.monminpet.com";

// ============================================================
// POST /register
// ============================================================
const registerSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  name: z.string().optional().nullable(),
});

authEmailRoute.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, password, name } = c.req.valid("json");
  try {
    const user = await registerEmailUser({ email, password, name: name ?? null });
    const token = signSession({
      sub: user.id,
      phone: user.phone || undefined,
      email: (user as any).email,
      is_onboarded: false,
    });
    setSessionCookie(c, token);
    console.log(`[auth/email/register] uid=${user.id} email=${(user as any).email}`);

    // Send verification email (mock)
    mockSendEmail(
      (user as any).email,
      "Chào mừng tới VowVet",
      `Tài khoản đã tạo thành công. Verify link: ${APP_DOMAIN}/account/verify?uid=${user.id}`
    );

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: (user as any).email,
        phone: user.phone || null,
        name: user.name,
        avatar_url: (user as any).avatar_url || null,
        onboarded: false,
        onboarding_completed: false,
      },
      is_new_user: true,
      redirect_to: "/onboarding",
    }, 201);
  } catch (err: any) {
    if (err?.status) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[auth/email/register] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi đăng ký" } }, 500);
  }
});

// ============================================================
// POST /login
// ============================================================
const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

authEmailRoute.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  try {
    const user = await loginEmailUser(email, password);
    const is_onboarded = await getIsOnboarded(user.id);
    const token = signSession({
      sub: user.id,
      phone: user.phone || undefined,
      email: (user as any).email,
      is_onboarded,
    });
    setSessionCookie(c, token);
    console.log(`[auth/email/login] uid=${user.id} email=${(user as any).email}`);
    return c.json({
      success: true,
      user: {
        id: user.id,
        email: (user as any).email,
        phone: user.phone,
        name: user.name,
        avatar_url: (user as any).avatar_url || null,
        onboarded: is_onboarded,
        onboarding_completed: is_onboarded,
      },
      is_new_user: false,
      redirect_to: is_onboarded ? "/dashboard" : "/onboarding",
    });
  } catch (err: any) {
    if (err?.status) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[auth/email/login] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi đăng nhập" } }, 500);
  }
});

// ============================================================
// POST /forgot-password
// ============================================================
const forgotSchema = z.object({ email: z.string().min(1) });

authEmailRoute.post("/forgot-password", zValidator("json", forgotSchema), async (c) => {
  const { email } = c.req.valid("json");
  // Always return success to avoid email enumeration
  try {
    const result = await issueResetToken(email);
    if (result.ok && result.token) {
      mockSendEmail(
        email,
        "Đặt lại mật khẩu VowVet",
        `Mở link để đặt lại mật khẩu (1 giờ):\n${APP_DOMAIN}/account/reset-password?token=${result.token}`
      );
    }
  } catch (err) {
    console.error("[auth/email/forgot] error:", err);
  }
  return c.json({ success: true });
});

// ============================================================
// POST /reset-password
// ============================================================
const resetSchema = z.object({
  token: z.string().min(8),
  new_password: z.string().min(1),
});

authEmailRoute.post("/reset-password", zValidator("json", resetSchema), async (c) => {
  const { token, new_password } = c.req.valid("json");
  try {
    const user = await resetPasswordWithToken(token, new_password);
    const is_onboarded = await getIsOnboarded(user.id);
    const sess = signSession({
      sub: user.id,
      phone: user.phone || undefined,
      email: (user as any).email,
      is_onboarded,
    });
    setSessionCookie(c, sess);
    return c.json({
      success: true,
      user: {
        id: user.id,
        email: (user as any).email,
        phone: user.phone,
        name: user.name,
        onboarding_completed: is_onboarded,
      },
    });
  } catch (err: any) {
    if (err?.status) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[auth/email/reset] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi đặt lại" } }, 500);
  }
});

// ============================================================
// POST /set-password — for logged-in user (link email/password)
// ============================================================
const setPwSchema = z.object({
  password: z.string().min(1),
  email: z.string().optional(),
});

authEmailRoute.post("/set-password", requireAuth, zValidator("json", setPwSchema), async (c) => {
  const session = c.get("user");
  const { password, email } = c.req.valid("json");
  try {
    await setPasswordOnExistingUser(session.sub, password, email);
    const user = await findUserById(session.sub);
    return c.json({ success: true, email: (user as any)?.email || null });
  } catch (err: any) {
    if (err?.status) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[auth/email/set-password] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// DELETE /password — unlink password from account
// ============================================================
authEmailRoute.delete("/password", requireAuth, async (c) => {
  const session = c.get("user");
  try {
    await removePasswordFromUser(session.sub);
    return c.json({ success: true });
  } catch (err: any) {
    if (err?.status) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi unlink" } }, 500);
  }
});
