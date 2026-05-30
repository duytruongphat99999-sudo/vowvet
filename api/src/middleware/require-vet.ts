/**
 * M9.2 — Middleware require vet role.
 *
 * Pattern: gọi SAU requireAuth. Đọc session.sub → query users.is_vet.
 * Set c.set("vetUser", BaserowUser) cho downstream handlers dùng.
 *
 * Reject:
 *   - 401 nếu chưa requireAuth (defensive — không nên xảy ra)
 *   - 403 nếu user.is_vet !== true
 *   - 403 nếu user.deleted_at (soft-deleted)
 */
import type { MiddlewareHandler } from "hono";
import { findUserById, type BaserowUser } from "../lib/users.ts";

// Mở rộng context cho TS hint
declare module "hono" {
  interface ContextVariableMap {
    vetUser: BaserowUser;
  }
}

export const requireVet: MiddlewareHandler = async (c, next) => {
  const session = c.get("user");
  if (!session?.sub) {
    return c.json(
      { error: { code: "UNAUTHENTICATED", message: "Vui lòng đăng nhập" } },
      401
    );
  }

  const user = await findUserById(session.sub);
  if (!user || user.deleted_at) {
    return c.json(
      { error: { code: "USER_NOT_FOUND", message: "Phiên đã hết hạn" } },
      401
    );
  }

  // Baserow boolean field returns true/false directly với user_field_names=true
  if ((user as any).is_vet !== true) {
    return c.json(
      {
        error: {
          code: "FORBIDDEN_NOT_VET",
          message: "Chỉ bác sĩ thú y có quyền truy cập",
        },
      },
      403
    );
  }

  c.set("vetUser", user);
  await next();
};
