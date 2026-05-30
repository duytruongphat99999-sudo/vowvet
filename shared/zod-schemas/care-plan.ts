import { z } from "zod";

/** Bảng care_plans — kế hoạch chăm sóc hằng ngày do AI sinh. */
export const CarePlanSchema = z.object({
  id: z.number().int().optional(),
  plan_date: z.string(),
  pet_id: z.array(z.number()).optional(),
  plan_json: z.string(),
  weather_snapshot: z.string().nullable().optional(),
  alerts: z.array(z.string()).nullable().optional(),
  sent_zalo: z.boolean().default(false),
  user_feedback: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export type CarePlan = z.infer<typeof CarePlanSchema>;
