/**
 * Auth middleware đọc JWT từ cookie HTTP-only.
 * Set c.set("user", payload) cho route handlers dùng.
 * Trả 401 nếu thiếu/invalid token.
 *
 * M8: route-level check soft-deleted user qua findUserById trong từng handler
 *     (middleware không hit DB để giữ tốc độ, deleted_at check làm khi cần state).
 */
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession, type SessionPayload } from "@shared/jwt.ts";
import { SESSION_COOKIE } from "@shared/auth.ts";

// Mở rộng Variables để TS hiểu c.get("user")
declare module "hono" {
  interface ContextVariableMap {
    user: SessionPayload;
  }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const payload = verifySession(token);
  if (!payload) {
    return c.json({ error: { code: "UNAUTHENTICATED", message: "Vui lòng đăng nhập" } }, 401);
  }
  c.set("user", payload);
  await next();
};
