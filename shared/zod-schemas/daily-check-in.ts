import { z } from "zod";

/** Bảng daily_check_ins — nhật ký sức khỏe hằng ngày. */
export const DailyCheckInSchema = z.object({
  id: z.number().int().optional(),
  check_date: z.string(),
  pet_id: z.array(z.number()).optional(),
  appetite: z.enum(["Bỏ ăn", "Ăn ít", "Bình thường", "Ăn nhiều"]).nullable().optional(),
  energy: z.enum(["Mệt mỏi", "Bình thường", "Năng động"]).nullable().optional(),
  stool_quality: z.enum(["Tiêu chảy", "Mềm", "Bình thường", "Khô cứng"]).nullable().optional(),
  water_ml: z.number().nonnegative().nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  symptoms: z.array(z.string()).nullable().optional(),
  ai_summary: z.string().nullable().optional(),
  urgency_level: z.enum(["Bình thường", "Theo dõi", "Khẩn cấp"]).nullable().optional(),
  created_at: z.string().optional(),
});

export type DailyCheckIn = z.infer<typeof DailyCheckInSchema>;
