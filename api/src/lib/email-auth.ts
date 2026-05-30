/**
 * Email + Password auth (M20-auth).
 *
 * Uses Bun.password (argon2id) built-in — no external dep needed.
 * Password requirements: min 8 chars, at least 1 letter + 1 number.
 *
 * Reset token: random UUID v4, 1-hour TTL stored in users.password_reset_*.
 */
import { listRows, createRow, updateRow } from "@shared/baserow.ts";
import { findUserByEmail, type BaserowUser } from "./users.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MS = 60 * 60 * 1000; // 1h

export interface AuthError extends Error {
  status: number;
  code: string;
}

function authError(status: number, code: string, message: string): AuthError {
  const err = new Error(message) as AuthError;
  err.status = status;
  err.code = code;
  return err;
}

// ================================================================
// Validation
// ================================================================

export function validateEmail(email: string): string {
  const e = String(email || "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(e)) throw authError(400, "INVALID_EMAIL", "Email không hợp lệ");
  if (e.length > 100) throw authError(400, "INVALID_EMAIL", "Email quá dài");
  return e;
}

export function validatePassword(password: string): string {
  const p = String(password || "");
  if (p.length < 8) throw authError(400, "WEAK_PASSWORD", "Mật khẩu cần ít nhất 8 ký tự");
  if (p.length > 200) throw authError(400, "WEAK_PASSWORD", "Mật khẩu quá dài");
  if (!/[A-Za-z]/.test(p)) throw authError(400, "WEAK_PASSWORD", "Mật khẩu cần ít nhất 1 chữ cái");
  if (!/\d/.test(p)) throw authError(400, "WEAK_PASSWORD", "Mật khẩu cần ít nhất 1 chữ số");
  return p;
}

// ================================================================
// Hash + verify (Bun built-in argon2id)
// ================================================================

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: "argon2id" });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
}

// ================================================================
// Auth methods string helper
// ================================================================

export function getAuthMethods(user: BaserowUser): string[] {
  const raw = (user as any).auth_methods;
  if (typeof raw === "string" && raw.length > 0) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  // Fallback to legacy auth_method field
  const legacy = (user as any).auth_method;
  const legacyVal = typeof legacy === "object" ? legacy?.value : legacy;
  if (legacyVal === "phone_otp") return ["phone"];
  if (legacyVal === "google_oauth") return ["google"];
  if (legacyVal === "both") return ["phone", "google"];
  return [];
}

export function setAuthMethods(methods: string[]): string {
  return [...new Set(methods)].sort().join(",");
}

// ================================================================
// Register (email + password)
// ================================================================

export interface RegisterInput {
  email: string;
  password: string;
  name?: string | null;
}

export async function registerEmailUser(input: RegisterInput): Promise<BaserowUser> {
  const email = validateEmail(input.email);
  validatePassword(input.password);

  const existing = await findUserByEmail(email);
  if (existing) {
    if ((existing as any).deleted_at) {
      throw authError(403, "USER_DELETED", "Tài khoản đã bị xóa");
    }
    throw authError(409, "EMAIL_EXISTS", "Email đã được đăng ký. Đăng nhập hoặc dùng quên mật khẩu.");
  }

  const hash = await hashPassword(input.password);
  const user = await createRow<BaserowUser>("users", {
    email,
    phone: null,
    name: input.name ? String(input.name).trim().slice(0, 60) : null,
    password_hash: hash,
    email_verified: false,
    auth_methods: setAuthMethods(["email"]),
    last_login_method: "email_password",
    auth_method: null,
    plan_tier: "free",
    last_login_at: new Date().toISOString(),
  } as any);
  return user;
}

// ================================================================
// Login (email + password)
// ================================================================

export async function loginEmailUser(emailRaw: string, passwordPlain: string): Promise<BaserowUser> {
  const email = validateEmail(emailRaw);
  if (!passwordPlain) throw authError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");

  const user = await findUserByEmail(email);
  if (!user) throw authError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
  if ((user as any).deleted_at) throw authError(403, "USER_DELETED", "Tài khoản đã bị xóa");

  const hash = (user as any).password_hash;
  if (!hash) {
    throw authError(401, "NO_PASSWORD", "Tài khoản này chưa thiết lập mật khẩu. Vui lòng dùng Google hoặc OTP SĐT để đăng nhập.");
  }

  const ok = await verifyPassword(passwordPlain, hash);
  if (!ok) throw authError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");

  // Touch last_login_at + method
  try {
    await updateRow("users", user.id, {
      last_login_at: new Date().toISOString(),
      last_login_method: "email_password",
    });
  } catch {}

  return user;
}

// ================================================================
// Forgot password — issue reset token
// ================================================================

export async function issueResetToken(emailRaw: string): Promise<{ ok: boolean; token?: string; userId?: number }> {
  let email: string;
  try { email = validateEmail(emailRaw); } catch { return { ok: false }; }

  const user = await findUserByEmail(email);
  if (!user || (user as any).deleted_at) return { ok: false };

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  await updateRow("users", user.id, {
    password_reset_token: token,
    password_reset_expires: expiresAt,
  });

  return { ok: true, token, userId: user.id };
}

// ================================================================
// Reset password via token
// ================================================================

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<BaserowUser> {
  if (!token || token.length < 16) throw authError(400, "INVALID_TOKEN", "Token không hợp lệ");
  validatePassword(newPassword);

  const res = await listRows<BaserowUser>("users", {
    filter: { password_reset_token__equal: token },
    size: 1,
  });
  const user = res.results[0];
  if (!user) throw authError(400, "INVALID_TOKEN", "Token không hợp lệ hoặc đã dùng");

  const expires = (user as any).password_reset_expires as string | undefined;
  if (!expires || new Date(expires).getTime() < Date.now()) {
    throw authError(400, "TOKEN_EXPIRED", "Token đã hết hạn. Vui lòng yêu cầu lại.");
  }
  if ((user as any).deleted_at) throw authError(403, "USER_DELETED", "Tài khoản đã bị xóa");

  const hash = await hashPassword(newPassword);
  const methods = getAuthMethods(user);
  if (!methods.includes("email")) methods.push("email");

  const updated = await updateRow<BaserowUser>("users", user.id, {
    password_hash: hash,
    password_reset_token: null,
    password_reset_expires: null,
    auth_methods: setAuthMethods(methods),
    last_login_at: new Date().toISOString(),
    last_login_method: "email_password",
  });
  return updated;
}

// ================================================================
// Link/unlink helpers (for /account/connections)
// ================================================================

export async function setPasswordOnExistingUser(userId: number, newPassword: string, emailIfMissing?: string): Promise<void> {
  validatePassword(newPassword);
  const { findUserById } = await import("./users.ts");
  const user = await findUserById(userId);
  if (!user) throw authError(404, "USER_NOT_FOUND", "Tài khoản không tồn tại");

  let email = (user as any).email as string | null;
  if (!email) {
    if (!emailIfMissing) throw authError(400, "EMAIL_REQUIRED", "Cần email để thiết lập mật khẩu");
    email = validateEmail(emailIfMissing);
    // Check email not taken
    const collision = await findUserByEmail(email);
    if (collision && collision.id !== userId) {
      throw authError(409, "EMAIL_TAKEN", "Email đã được dùng cho tài khoản khác");
    }
  }

  const hash = await hashPassword(newPassword);
  const methods = getAuthMethods(user);
  if (!methods.includes("email")) methods.push("email");

  await updateRow("users", userId, {
    email,
    password_hash: hash,
    auth_methods: setAuthMethods(methods),
  });
}

export async function removePasswordFromUser(userId: number): Promise<void> {
  const { findUserById } = await import("./users.ts");
  const user = await findUserById(userId);
  if (!user) throw authError(404, "USER_NOT_FOUND", "Tài khoản không tồn tại");

  const methods = getAuthMethods(user).filter((m) => m !== "email");
  if (methods.length === 0) {
    throw authError(400, "LAST_METHOD", "Không thể bỏ phương thức cuối — thêm SĐT hoặc Google trước");
  }

  await updateRow("users", userId, {
    password_hash: null,
    auth_methods: setAuthMethods(methods),
  });
}

// ================================================================
// Mock email sender (logs to console for Phase 0)
// ================================================================

export function mockSendEmail(to: string, subject: string, body: string): void {
  console.log(`[EMAIL_MOCK] To: ${to}`);
  console.log(`[EMAIL_MOCK] Subject: ${subject}`);
  console.log(`[EMAIL_MOCK] Body: ${body}`);
}
