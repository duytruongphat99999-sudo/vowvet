import { z } from "zod";

/** Bảng allergies_diet — dị ứng và thực phẩm cấm/khuyến nghị. */
export const AllergyDietSchema = z.object({
  id: z.number().int().optional(),
  item: z.string().min(1),
  pet_id: z.array(z.number()).optional(),
  type: z.enum(["Dị ứng", "Không dung nạp", "Khuyến nghị", "Cấm"]),
  severity: z.enum(["Nhẹ", "Trung bình", "Nặng"]).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type AllergyDiet = z.infer<typeof AllergyDietSchema>;
