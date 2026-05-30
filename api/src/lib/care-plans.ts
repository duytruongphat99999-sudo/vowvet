/**
 * care_plans repo — upsert theo (pet_id, plan_date=today) + history + feedback.
 *
 * Storage layout:
 *   plan_json         = JSON.stringify(CarePlanContentType) — display data
 *   weather_snapshot  = JSON.stringify(CarePlanMetadataType) — cost, model, tokens, weather
 *   alerts            = string[] (Baserow array field) — duplicate của plan.alerts cho query
 *   urgency_level     = single_select EN (sau migration M4)
 *   user_feedback     = "helpful" | "unhelpful" | null
 *
 * In-memory state cho "in-progress generation" (status processing):
 *   processingMap: Map<pet_id, started_at_unix_sec>
 *
 * Refresh rate limit:
 *   refreshMap: Map<`${pet_id}:${date}`, count>  — 3 lần/ngày/pet
 */
import { listRows, createRow, updateRow, getRow } from "@shared/baserow.ts";
import type { CarePlanContentType, CarePlanMetadataType, UrgencyLevelType } from "@shared/care-plan-types.ts";

export interface BaserowCarePlan {
  id: number;
  plan_date: string;
  pet_id?: Array<{ id: number; value: string }>;
  plan_json: string | null;
  weather_snapshot: string | null;
  alerts: string[] | null;
  sent_zalo?: boolean;
  user_feedback?: string | null;
  urgency_level?: string | { id: number; value: string } | null;
  created_at?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const MAX_REFRESH_PER_DAY = 3;
const processingMap = new Map<number, number>(); // pet_id → started_at
const refreshMap = new Map<string, number>(); // `${pet_id}:${date}` → count

/** Đánh dấu pet đang generating. Caller phải clear khi done/fail. */
export function setProcessing(petId: number): void {
  processingMap.set(petId, Math.floor(Date.now() / 1000));
}
export function clearProcessing(petId: number): void {
  processingMap.delete(petId);
}
export function isProcessing(petId: number): boolean {
  const started = processingMap.get(petId);
  if (!started) return false;
  // Stale: nếu > 60s mà chưa clear → coi như fail, clear
  if (Math.floor(Date.now() / 1000) - started > 60) {
    processingMap.delete(petId);
    return false;
  }
  return true;
}

/** Check refresh limit. Trả {ok, remaining}. */
export function checkRefreshLimit(petId: number, date = todayIso()): { ok: boolean; used: number; remaining: number } {
  const key = `${petId}:${date}`;
  const used = refreshMap.get(key) || 0;
  return { ok: used < MAX_REFRESH_PER_DAY, used, remaining: Math.max(0, MAX_REFRESH_PER_DAY - used) };
}
/** Increment refresh count. */
export function bumpRefreshCount(petId: number, date = todayIso()): number {
  const key = `${petId}:${date}`;
  const next = (refreshMap.get(key) || 0) + 1;
  refreshMap.set(key, next);
  return next;
}

/** Tìm care plan hôm nay. Null nếu chưa có. */
export async function findTodayCarePlan(petId: number, date = todayIso()): Promise<BaserowCarePlan | null> {
  const res = await listRows<BaserowCarePlan>("care_plans", {
    filter: {
      pet_id__link_row_has: String(petId),
      plan_date__date_equal: date,
    },
    size: 1,
  });
  return res.results[0] || null;
}

/** N care plans gần nhất, desc theo plan_date. */
export async function listRecentCarePlans(petId: number, days: number): Promise<BaserowCarePlan[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const res = await listRows<BaserowCarePlan>("care_plans", {
    filter: {
      pet_id__link_row_has: String(petId),
      plan_date__date_after_or_equal: cutoffIso,
    },
    orderBy: "-plan_date",
    size: days + 10,
  });
  return res.results;
}

/** Upsert plan cho (pet, today). Trả rowId. */
export async function upsertCarePlan(
  petId: number,
  plan: CarePlanContentType,
  metadata: CarePlanMetadataType
): Promise<number> {
  const existing = await findTodayCarePlan(petId);
  const data = {
    plan_json: JSON.stringify(plan),
    weather_snapshot: JSON.stringify(metadata),
    // alerts field là text — store as JSON array string (frontend parse khi cần)
    alerts: JSON.stringify(plan.alerts),
    urgency_level: plan.urgency_level,
  };
  if (existing) {
    await updateRow("care_plans", existing.id, data);
    return existing.id;
  }
  const row = await createRow<BaserowCarePlan>("care_plans", {
    ...data,
    pet_id: [petId],
    plan_date: todayIso(),
    sent_zalo: false,
  });
  return row.id;
}

/** Set user feedback. Baserow single_select options: "helpful" | "not_helpful". */
export async function setFeedback(rowId: number, feedback: "helpful" | "not_helpful" | null): Promise<void> {
  await updateRow("care_plans", rowId, { user_feedback: feedback });
}

/** Parse plan_json từ row (defensive). Null nếu malformed. */
export function parsePlanJson(row: BaserowCarePlan): CarePlanContentType | null {
  if (!row.plan_json) return null;
  try {
    return JSON.parse(row.plan_json) as CarePlanContentType;
  } catch {
    return null;
  }
}
/** Parse metadata từ weather_snapshot field. Null nếu malformed. */
export function parseMetadata(row: BaserowCarePlan): CarePlanMetadataType | null {
  if (!row.weather_snapshot) return null;
  try {
    return JSON.parse(row.weather_snapshot) as CarePlanMetadataType;
  } catch {
    return null;
  }
}
