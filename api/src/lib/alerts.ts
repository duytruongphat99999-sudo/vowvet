/**
 * climate_alerts repo — create + list + dismiss với dedup logic.
 */
import { listRows, createRow, updateRow } from "@shared/baserow.ts";
import type { EvaluatedAlert } from "@shared/alert-rules.ts";
import type { AlertType, Severity } from "@shared/zod-schemas/m5.ts";

export interface BaserowAlert {
  id: number;
  pet_id?: Array<{ id: number; value: string }>;
  user_id?: Array<{ id: number; value: string }>;
  alert_type?: string | { id: number; value: string };
  severity?: string | { id: number; value: string };
  title?: string;
  message?: string;
  body?: string;
  weather_snapshot?: string;
  triggered_at?: string;
  sent_push?: boolean;
  dismissed_at?: string | null;
  pet_factors?: string;
}

const DEDUP_WINDOW_HOURS = 6;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tìm alert active (chưa dismiss + trong DEDUP_WINDOW_HOURS) cùng type/pet → dedup. */
async function findActiveDuplicate(
  petId: number,
  alertType: AlertType
): Promise<BaserowAlert | null> {
  // Baserow date filter granularity là DAY → unreliable cho 6h window.
  // Lấy last 20 alerts của pet, filter client-side theo timestamp exact.
  const res = await listRows<BaserowAlert>("climate_alerts", {
    filter: { pet_id__link_row_has: String(petId) },
    orderBy: "-triggered_at",
    size: 20,
  });

  const cutoffMs = Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000;

  return (
    res.results.find((r) => {
      if (r.dismissed_at) return false;
      const t = typeof r.alert_type === "object" ? r.alert_type?.value : r.alert_type;
      if (t !== alertType) return false;
      if (!r.triggered_at) return false;
      const ts = new Date(r.triggered_at).getTime();
      return ts >= cutoffMs;
    }) || null
  );
}

/**
 * Create alert nếu chưa có duplicate trong 6h.
 * Trả về row hoặc null nếu skipped do dedup.
 */
export async function createAlertIfNew(
  petId: number,
  userId: number,
  alert: EvaluatedAlert
): Promise<BaserowAlert | null> {
  const existing = await findActiveDuplicate(petId, alert.alert_type);
  if (existing) {
    return null; // skipped
  }
  const created = await createRow<BaserowAlert>("climate_alerts", {
    pet_id: [petId],
    user_id: [userId],
    alert_type: alert.alert_type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    weather_snapshot: JSON.stringify(alert.weather_snapshot),
    pet_factors: JSON.stringify(alert.pet_factors),
    sent_push: false,
  });
  return created;
}

/** List active alerts (chưa dismiss, < 24h) cho user, sort triggered_at desc. */
export async function listActiveAlertsForUser(userId: number, limit = 50): Promise<BaserowAlert[]> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const res = await listRows<BaserowAlert>("climate_alerts", {
    filter: {
      user_id__link_row_has: String(userId),
      triggered_at__date_after_or_equal: cutoffIso,
    },
    orderBy: "-triggered_at",
    size: limit,
  });
  return res.results.filter((r) => !r.dismissed_at);
}

/** List history N days, group sẽ làm ở route layer. */
export async function listAlertsHistory(userId: number, days: number): Promise<BaserowAlert[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const res = await listRows<BaserowAlert>("climate_alerts", {
    filter: {
      user_id__link_row_has: String(userId),
      triggered_at__date_after_or_equal: cutoffIso,
    },
    orderBy: "-triggered_at",
    size: 500,
  });
  return res.results;
}

/** Verify alert thuộc user trước khi dismiss. */
export async function getAlertIfOwned(alertId: number, userId: number): Promise<BaserowAlert | null> {
  try {
    const { getRow } = await import("@shared/baserow.ts");
    const row = await getRow<BaserowAlert>("climate_alerts", alertId);
    const ownerIds = (row.user_id || []).map((u) => u.id);
    if (!ownerIds.includes(userId)) return null;
    return row;
  } catch {
    return null;
  }
}

/** Dismiss alert (set dismissed_at = now). */
export async function dismissAlert(alertId: number): Promise<void> {
  await updateRow("climate_alerts", alertId, { dismissed_at: new Date().toISOString() });
}

/** Mark sent_push=true sau khi web push thành công. */
export async function markPushSent(alertId: number): Promise<void> {
  await updateRow("climate_alerts", alertId, { sent_push: true });
}

/** API shape converter. */
export function toApiAlert(row: BaserowAlert) {
  const at = typeof row.alert_type === "object" ? row.alert_type?.value : row.alert_type;
  const sv = typeof row.severity === "object" ? row.severity?.value : row.severity;
  let weather: any = null;
  let factors: any = null;
  try {
    if (row.weather_snapshot) weather = JSON.parse(row.weather_snapshot);
  } catch {}
  try {
    if (row.pet_factors) factors = JSON.parse(row.pet_factors);
  } catch {}
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? null,
    pet_name: (row.pet_id || [])[0]?.value ?? null,
    alert_type: at,
    severity: sv,
    title: row.title,
    message: row.message,
    weather_snapshot: weather,
    pet_factors: factors,
    triggered_at: row.triggered_at,
    dismissed_at: row.dismissed_at,
    sent_push: row.sent_push === true,
  };
}
