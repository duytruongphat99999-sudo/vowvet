import { z } from "zod";

/** Bảng dewormers — lịch sử tẩy giun. */
export const DewormerSchema = z.object({
  id: z.number().int().optional(),
  product_name: z.string().min(1),
  pet_id: z.array(z.number()).optional(),
  type: z.enum(["Nội ký sinh", "Ngoại ký sinh", "Cả hai"]),
  administered_date: z.string(),
  next_due_date: z.string().nullable().optional(),
  dosage: z.string().nullable().optional(),
});

export type Dewormer = z.infer<typeof DewormerSchema>;
