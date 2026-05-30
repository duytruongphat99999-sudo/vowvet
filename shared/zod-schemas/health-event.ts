import { z } from "zod";

/** Bảng health_events — biến cố sức khỏe lớn (khám, mổ, bệnh nặng). */
export const HealthEventSchema = z.object({
  id: z.number().int().optional(),
  description: z.string().min(1),
  pet_id: z.array(z.number()).optional(),
  event_type: z.enum(["Khám", "Tiêm", "Mổ", "Bệnh", "Tai nạn", "Khác"]),
  event_date: z.string(),
  vet_name: z.string().nullable().optional(),
  clinic_name: z.string().nullable().optional(),
  cost_vnd: z.number().nonnegative().nullable().optional(),
  photos_urls: z.array(z.string().url()).nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
});

export type HealthEvent = z.infer<typeof HealthEventSchema>;
