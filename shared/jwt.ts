/**
 * JWT (HS256) sign + verify dùng chung cho api (Hono routes) và web (Astro middleware).
 * Tự implement bằng Node built-in crypto để tránh phụ thuộc khác nhau giữa 2 container.
 * Tokens sinh bởi file này verify được bởi hono/jwt và ngược lại (chuẩn HS256).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  console.warn("[jwt] JWT_SECRET không có trong env — sign/verify sẽ fail.");
}

/** Payload chuẩn dùng cho session VowVet.
 *  M8: phone optional (Google OAuth users chỉ có email).
 *      email optional (phone OTP users chưa nhập email).
 *      Ít nhất một trong hai phải tồn tại.
 */
export interface SessionPayload {
  sub: number; // user_id (Baserow row id) — luôn có
  phone?: string; // dạng chuẩn hoá +84xxx — null cho Google OAuth user
  email?: string; // M8 — null cho phone OTP user chưa nhập email
  is_onboarded: boolean; // đã có ít nhất 1 pet
  iat?: number;
  exp?: number;
}

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function hmac(message: string): Buffer {
  return createHmac("sha256", JWT_SECRET).update(message).digest();
}

/**
 * Sign JWT HS256.
 * @param payload — user_id (sub), phone, is_onboarded
 * @param expiresInSec — mặc định 30 ngày
 */
export function signSession(payload: Omit<SessionPayload, "iat" | "exp">, expiresInSec = 30 * 24 * 3600): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET trống — không thể sign token");

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = { ...payload, iat: now, exp: now + expiresInSec };
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = base64UrlEncode(hmac(`${encodedHeader}.${encodedPayload}`));
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/** Verify token, trả payload nếu hợp lệ, null nếu sai/hết hạn. */
export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token || !JWT_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSig] = parts;

  const expectedSig = hmac(`${encodedHeader}.${encodedPayload}`);
  const providedSig = base64UrlDecode(encodedSig);
  if (expectedSig.length !== providedSig.length) return null;
  if (!timingSafeEqual(expectedSig, providedSig)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf-8")) as SessionPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    // M8: sub luôn bắt buộc. phone hoặc email — ít nhất một.
    if (typeof payload.sub !== "number") return null;
    const hasPhone = typeof payload.phone === "string" && payload.phone.length > 0;
    const hasEmail = typeof payload.email === "string" && payload.email.length > 0;
    if (!hasPhone && !hasEmail) return null;
    return payload;
  } catch {
    return null;
  }
}
