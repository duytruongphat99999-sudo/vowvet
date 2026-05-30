import { z } from "zod";

/** Bảng vaccines — lịch sử tiêm phòng của thú cưng. */
export const VaccineSchema = z.object({
  id: z.number().int().optional(),
  vaccine_type: z.string().min(1),
  pet_id: z.array(z.number()).optional(),
  brand: z.string().nullable().optional(),
  dose_number: z.number().int().positive().nullable().optional(),
  administered_date: z.string(),
  next_due_date: z.string().nullable().optional(),
  clinic_name: z.string().nullable().optional(),
  batch_number: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type Vaccine = z.infer<typeof VaccineSchema>;
