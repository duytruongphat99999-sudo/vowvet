/**
 * Dev-only routes — CHỈ hoạt động ở môi trường non-production.
 * Production (NODE_ENV=production) → 404 (coi như không tồn tại).
 *
 * POST /reset-onboarding
 *   Reset CHÍNH account đang gọi (self, đọc từ JWT) về "user mới toanh":
 *     · Xóa toàn bộ pet của user đó (hard delete)
 *     · onboarded = false
 *     · Re-sign JWT is_onboarded=false → middleware chặn dashboard ngay
 *   KHÔNG nhận user-id từ client → không thể reset hộ account khác.
 *   KHÔNG có chế độ "reset tất cả account".
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { listUserPets } from "../lib/users.ts";
import { hardDeletePet } from "../lib/pets.ts";
import { updateRow } from "@shared/baserow.ts";
import { setSessionCookie } from "../lib/session-cookie.ts";
import { signSession } from "@shared/jwt.ts";

export const devRoute = new Hono();

function isProduction(): boolean {
  return (process.env.NODE_ENV || "").toLowerCase() === "production";
}

// Hard gate: ở production mọi route /dev đều như không tồn tại.
devRoute.use("*", async (c, next) => {
  if (isProduction()) return c.json({ error: { message: "Not found" } }, 404);
  return next();
});

// Bắt buộc đăng nhập (self-only — không nhận user-id từ client).
devRoute.use("*", requireAuth);

devRoute.post("/reset-onboarding", async (c) => {
  const session = c.get("user");
  const userId = session.sub;

  // 1) Xóa toàn bộ pet của CHÍNH user đang gọi
  const pets = await listUserPets(userId, 200);
  let deleted = 0;
  for (const p of pets) {
    try {
      await hardDeletePet(p.id);
      deleted++;
    } catch (_) {
      /* bỏ qua pet lỗi, tiếp tục */
    }
  }

  // 2) onboarded = false
  let updated: any = null;
  try {
    updated = await updateRow<any>("users", userId, { onboarded: false });
  } catch (_) {
    /* không chặn flow nếu update field lỗi */
  }

  // 3) Re-sign JWT is_onboarded=false → middleware chặn dashboard tức thì
  const refreshed = signSession({
    sub: userId,
    phone: (updated?.phone ?? session.phone) || undefined,
    email: (updated?.email ?? session.email) || undefined,
    zalo_user_id: ((updated as any)?.zalo_user_id ?? session.zalo_user_id) || undefined, // giữ định danh Zalo (dev reset)
    is_onboarded: false,
  });
  setSessionCookie(c, refreshed);

  console.log(
    `[dev/reset-onboarding] uid=${userId} → deleted ${deleted} pets, onboarded=false`
  );
  return c.json({ success: true, deleted_pets: deleted });
});
