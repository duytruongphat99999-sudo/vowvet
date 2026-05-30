import { z } from "zod";

/** Bảng users — chủ thú cưng. */
export const UserSchema = z.object({
  id: z.number().int().optional(),
  phone: z.string().regex(/^0\d{9}$/, "Số điện thoại VN phải bắt đầu bằng 0 và đủ 10 số"),
  name: z.string().min(1).max(100),
  zalo_user_id: z.string().nullable().optional(),
  plan_tier: z.enum(["free", "premium"]).default("free"),
  premium_until: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  referral_code: z.string().nullable().optional(),
  last_login_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export type User = z.infer<typeof UserSchema>;
