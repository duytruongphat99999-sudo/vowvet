/**
 * Zod schemas cho M5: settings, push subscription, alert dismiss, notification preferences.
 */
import { z } from "zod";

// ===== City update =====
// Expanded từ 4 → 32 tỉnh/thành phố (Bắc 10 + Trung 12 + Nam 10).
// Source of truth: shared/cities.ts CITIES record. Giữ slug cũ để backward-compat.
export const CitySchema = z.enum([
  // North
  "ha_noi", "hai_phong", "ha_long", "sapa", "lang_son",
  "thai_nguyen", "bac_ninh", "nam_dinh", "thanh_hoa", "ninh_binh",
  // Central
  "vinh", "hue", "da_nang", "hoi_an", "quang_ngai",
  "quy_nhon", "tuy_hoa", "nha_trang", "phan_thiet", "da_lat",
  "buon_ma_thuot", "pleiku",
  // South
  "ho_chi_minh", "bien_hoa", "thu_dau_mot", "vung_tau", "my_tho",
  "can_tho", "long_xuyen", "rach_gia", "ca_mau", "phu_quoc",
]);
export const UpdateCitySchema = z.object({
  city: CitySchema,
});

// ===== Push subscription (Web Push API) =====
export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20),
    auth: z.string().min(20),
  }),
});

export const SubscribePushSchema = z.object({
  subscription: PushSubscriptionSchema,
});

// ===== Notification preferences =====
// M6: thêm vaccine_reminders. Phase 4D: thêm care_plan_reminders.
// Backward compat: missing key → assume true (true defaults).
export const NotificationPreferencesSchema = z.object({
  heat_warning: z.boolean().default(true),
  aqi_warning: z.boolean().default(true),
  storm_warning: z.boolean().default(true),
  daily_summary: z.boolean().default(false),
  vaccine_reminders: z.boolean().default(true),
  care_plan_reminders: z.boolean().default(true),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  heat_warning: true,
  aqi_warning: true,
  storm_warning: true,
  daily_summary: false,
  vaccine_reminders: true,
  care_plan_reminders: true,
};

// ===== Alert dismiss (no body, just path param) =====

// ===== Alert types + severity =====
export const AlertTypeSchema = z.enum([
  "heat_warning",
  "aqi_warning",
  "storm_warning",
  "cold_warning",
  "sun_warning",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const SeveritySchema = z.enum(["info", "warning", "urgent", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_RANK: Record<z.infer<typeof SeveritySchema>, number> = {
  info: 0,
  warning: 1,
  urgent: 2,
  critical: 3,
};

export const ALERT_TYPE_LABEL_VI: Record<AlertType, string> = {
  heat_warning: "Cảnh báo nóng",
  aqi_warning: "Cảnh báo không khí",
  storm_warning: "Cảnh báo bão",
  cold_warning: "Cảnh báo lạnh",
  sun_warning: "Cảnh báo UV",
};

export const SEVERITY_LABEL_VI: Record<Severity, string> = {
  info: "Thông tin",
  warning: "Cảnh báo",
  urgent: "Khẩn cấp",
  critical: "Nguy hiểm",
};
