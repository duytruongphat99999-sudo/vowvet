import { z } from "zod";

/** Bảng pets — thú cưng được chủ nuôi. */
export const PetSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(100),
  user_id: z.array(z.number()).optional(),
  species: z.enum(["Chó", "Mèo", "Khác"]),
  breed: z.string().nullable().optional(),
  breed_secondary: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  gender: z.enum(["Đực", "Cái", "Không rõ"]).nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  bcs: z.number().int().min(1).max(9).nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  nose_print_hash: z.string().nullable().optional(),
  qr_code: z.string().nullable().optional(),
  personality_type: z.string().nullable().optional(),
  climate_sensitivity: z.enum(["Thấp", "Trung bình", "Cao"]).nullable().optional(),
  onboarding_completed: z.boolean().default(false),
  created_at: z.string().optional(),
});

export type Pet = z.infer<typeof PetSchema>;
