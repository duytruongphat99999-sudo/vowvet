/**
 * Zod schemas + types cho AI care plan response.
 * Validate output Gemini TRƯỚC khi save Baserow để tránh malformed AI break UI.
 */
import { z } from "zod";

/** 5 mức độ khẩn cấp theo spec M4. */
export const UrgencyLevel = z.enum(["normal", "monitor", "consult", "urgent", "emergency"]);
export type UrgencyLevelType = z.infer<typeof UrgencyLevel>;

/** 1 recommendation card (4 cards per plan, 2x2 grid). */
export const Recommendation = z.object({
  icon: z.string().min(1).max(8), // emoji 1 ký tự thường nhưng cho phép 8 (compound emoji)
  title: z.string().min(1).max(60),
  advice: z.string().min(1).max(300),
});
export type RecommendationType = z.infer<typeof Recommendation>;

/** Plan content trả ra UI. Lưu vào care_plans.plan_json (stringify). */
export const CarePlanContent = z.object({
  urgency_level: UrgencyLevel,
  summary: z.string().min(10).max(500),
  concerns: z.array(z.string().min(1).max(200)).max(5).default([]),
  recommendations: z.array(Recommendation).length(4),
  alerts: z.array(z.string().min(1).max(200)).max(2).default([]),
});
export type CarePlanContentType = z.infer<typeof CarePlanContent>;

/** Snapshot weather kèm context khi gọi AI — lưu vào weather_snapshot field. */
export const WeatherSnapshot = z.object({
  temp: z.number(),
  feels_like: z.number(),
  humidity: z.number(),
  aqi: z.number().int().min(1).max(5),
  aqi_label_vn: z.string(),
  city: z.string(),
  fetched_at: z.string(),
  mocked: z.boolean().optional(),
});
export type WeatherSnapshotType = z.infer<typeof WeatherSnapshot>;

/** Metadata lưu trong care_plans.weather_snapshot (JSON string, gộp weather + AI stats). */
export const CarePlanMetadata = z.object({
  cost_usd: z.number().nonnegative(),
  model: z.enum(["gemini-2.5-flash", "gemini-2.5-pro"]),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  weather: WeatherSnapshot,
  generated_at: z.string(),
  escalation_reason: z.string().nullable().optional(),
});
export type CarePlanMetadataType = z.infer<typeof CarePlanMetadata>;

/** Label tiếng Việt cho urgency (dùng frontend hard-code; backend chỉ trả enum EN). */
export const URGENCY_LABEL_VI: Record<UrgencyLevelType, string> = {
  normal: "Khoẻ mạnh",
  monitor: "Cần theo dõi",
  consult: "Nên hỏi bác sĩ",
  urgent: "Cần khám gấp",
  emergency: "CẤP CỨU",
};

/** Disclaimer cố định — KHÔNG AI generate. */
export const CARE_PLAN_DISCLAIMER_VI =
  "VowVet không thay thế bác sĩ thú y. Mọi quyết định điều trị, hãy gặp bác sĩ Mon Min hoặc bác sĩ thú y gần nhất.";
