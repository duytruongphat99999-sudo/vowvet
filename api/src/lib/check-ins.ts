/**
 * daily_check_ins repo — Baserow CRUD + upsert theo (pet_id, check_date=today).
 */
import { listRows, createRow, updateRow, getRow } from "@shared/baserow.ts";

export interface BaserowCheckIn {
  id: number;
  check_date: string;
  pet_id?: Array<{ id: number; value: string }>;
  appetite: number | null;
  energy: number | null;
  stool_quality: string | { id: number; value: string } | null;
  water_ml: number | null;
  photo_url: string | null;
  notes: string | null;
  symptoms: Array<{ id: number; value: string }> | string[] | null;
  ai_summary?: string | null;
  urgency_level?: string | { id: number; value: string } | null;
  created_at?: string;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tìm check-in hôm nay của pet. Null nếu chưa có. */
export async function findTodayCheckIn(petId: number, date = todayIso()): Promise<BaserowCheckIn | null> {
  const res = await listRows<BaserowCheckIn>("daily_check_ins", {
    filter: {
      pet_id__link_row_has: String(petId),
      check_date__date_equal: date,
    },
    size: 1,
  });
  return res.results[0] || null;
}

/** Tạo mới check-in. */
export async function createCheckIn(petId: number, data: Partial<BaserowCheckIn>): Promise<BaserowCheckIn> {
  return createRow<BaserowCheckIn>("daily_check_ins", {
    ...data,
    pet_id: [petId],
    check_date: data.check_date || todayIso(),
  });
}

/** Cập nhật check-in hiện có. */
export async function updateCheckIn(rowId: number, data: Partial<BaserowCheckIn>): Promise<BaserowCheckIn> {
  return updateRow<BaserowCheckIn>("daily_check_ins", rowId, data);
}

/** Upsert: nếu pet đã có check-in hôm nay → update, không thì create. */
export async function upsertCheckIn(petId: number, data: Partial<BaserowCheckIn>): Promise<{ row: BaserowCheckIn; wasUpdate: boolean }> {
  const existing = await findTodayCheckIn(petId);
  if (existing) {
    const row = await updateCheckIn(existing.id, data);
    return { row, wasUpdate: true };
  }
  const row = await createCheckIn(petId, data);
  return { row, wasUpdate: false };
}

/** History N ngày gần nhất, desc theo check_date. */
export async function listCheckInsHistory(petId: number, days: number): Promise<BaserowCheckIn[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const res = await listRows<BaserowCheckIn>("daily_check_ins", {
    filter: {
      pet_id__link_row_has: String(petId),
      check_date__date_after_or_equal: cutoffIso,
    },
    orderBy: "-check_date",
    size: days + 10, // buffer
  });
  return res.results;
}
