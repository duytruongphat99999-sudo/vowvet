/**
 * Care Plan v2 types + Zod schema (M4.1).
 *
 * 7-section output match Master Plan spec:
 *   weather, breed_warning, eating, exercise, training, monitoring, upcoming, festival_warning.
 *
 * Distinct file từ care-plan-types.ts (v1) cho rollback safety.
 */
import { z } from "zod";

export const UrgencyLevelV2 = z.enum(["normal", "monitor", "consult", "urgent", "emergency"]);
export type UrgencyLevelV2Type = z.infer<typeof UrgencyLevelV2>;

export const WeatherSectionV2 = z.object({
  city: z.string(),
  temp_celsius: z.number(),
  feels_like_celsius: z.number(),
  condition_vi: z.string(),
  aqi: z.number().nullable(),
  petair_index: z.number().int().min(0).max(100),
  safe_hours_today: z.string(), // VD: "5h30-7h, 19h-21h"
});

export const EatingItemV2 = z.object({
  time: z.string(), // HH:MM
  what: z.string(), // VD: "80g pate Royal Canin Mini"
  reason: z.string().optional(),
});

export const ExerciseItemV2 = z.object({
  time: z.string(), // HH:MM
  activity: z.string(), // VD: "dạo công viên Tao Đàn"
  duration_min: z.number().int().min(0).max(240),
  location_type: z.string().optional(),
});

export const TrainingV2 = z.object({
  focus_this_week: z.string(), // VD: "Dạy lệnh 'Đợi'"
  sessions: z.string(), // VD: "3 lượt × 5 phút"
});

export const MonitoringItemV2 = z.object({
  metric: z.string(), // VD: "Cân nặng"
  current_value: z.string(), // VD: "12.5kg"
  recommendation: z.string(), // VD: "Giữ portion hiện tại"
});

export const UpcomingItemV2 = z.object({
  days_until: z.number().int(),
  event: z.string(),
  emoji: z.string().optional(),
});

export const FestivalWarningV2 = z.object({
  festival_name: z.string(),
  phase: z.enum(["pre", "during", "post"]),
  days_until: z.number().int(),
  key_warnings: z.array(z.string()).min(1).max(5),
});

export const CarePlanV2Schema = z.object({
  schema_version: z.literal("v2"),
  date: z.string(), // YYYY-MM-DD
  pet_name: z.string(),
  pet_breed: z.string().nullable(),
  pet_age_label: z.string(),

  weather: WeatherSectionV2,
  breed_warning: z.string().nullable(), // free-text breed warning summary, null nếu không có data
  festival_warning: FestivalWarningV2.nullable(),

  eating: z.object({
    items: z.array(EatingItemV2).min(1).max(6),
    water_note: z.string(),
  }),
  exercise: z.object({
    items: z.array(ExerciseItemV2).min(1).max(4),
    warning: z.string().optional(),
  }),
  training: TrainingV2.nullable(),
  monitoring: z.array(MonitoringItemV2).max(5).default([]),
  upcoming: z.array(UpcomingItemV2).max(5).default([]),

  urgency_level: UrgencyLevelV2,
  summary: z.string().min(10).max(400),
});
export type CarePlanV2Type = z.infer<typeof CarePlanV2Schema>;

/** Phần AI generate (KHÔNG bao gồm meta + weather/breed/festival do server fill).
 *  training/monitoring/upcoming optional vì Gemini có thể omit thay vì trả null/[].
 */
export const CarePlanV2AiOutput = z.object({
  eating: z.object({
    items: z.array(EatingItemV2).min(1).max(6),
    water_note: z.string(),
  }),
  exercise: z.object({
    items: z.array(ExerciseItemV2).min(1).max(4),
    warning: z.string().optional(),
  }),
  training: TrainingV2.nullable().optional(),
  monitoring: z.array(MonitoringItemV2).max(5).optional(),
  upcoming: z.array(UpcomingItemV2).max(5).optional(),
  urgency_level: UrgencyLevelV2,
  summary: z.string().min(10).max(400),
});
export type CarePlanV2AiOutputType = z.infer<typeof CarePlanV2AiOutput>;

export const CarePlanV2Meta = z.object({
  model: z.string(),
  cost_usd: z.number().nonnegative(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_hit: z.boolean(),
  generated_at: z.string(),
});
export type CarePlanV2MetaType = z.infer<typeof CarePlanV2Meta>;

export interface CarePlanV2Full extends CarePlanV2Type {
  meta: CarePlanV2MetaType;
}

// ============================================================
// Section emoji + color helpers cho frontend
// ============================================================
export const SECTION_EMOJI = {
  weather: "☀️",
  breed_warning: "⚠️",
  festival: "🎉",
  eating: "🍽️",
  exercise: "🚶",
  training: "🎓",
  monitoring: "📊",
  upcoming: "⏰",
} as const;

export const SECTION_LABEL_VI = {
  weather: "THỜI TIẾT",
  breed_warning: "CẢNH BÁO BREED",
  festival: "LỄ HỘI",
  eating: "ĂN UỐNG",
  exercise: "VẬN ĐỘNG",
  training: "TRAINING",
  monitoring: "THEO DÕI",
  upcoming: "SẮP TỚI",
} as const;
