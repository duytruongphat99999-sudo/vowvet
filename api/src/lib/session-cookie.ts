/**
 * Helper set/clear session cookie với config phù hợp dev/prod.
 *
 * Secure flag tự bật khi request đến qua HTTPS:
 *   - Prod: nginx-proxy forward x-forwarded-proto=https → Secure=true
 *   - Dev local (http://127.0.0.1:4322): không có header → Secure=false để cookie work qua HTTP
 */
import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { SESSION_COOKIE, SESSION_EXPIRES_SEC } from "@shared/auth.ts";

function isSecureRequest(c: Context): boolean {
  const proto = c.req.header("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
  return new URL(c.req.url).protocol === "https:";
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_EXPIRES_SEC,
  });
}

export function clearSessionCookie(c: Context): void {
  // Browser delete cookie requires matching path + secure flag. SameSite Lax must
  // match the original Set-Cookie. Without this, some browsers ignore the Max-Age=0
  // header and keep the old cookie → user stays "logged in" after logout.
  deleteCookie(c, SESSION_COOKIE, {
    path: "/",
    secure: isSecureRequest(c),
    sameSite: "Lax",
  });
}
