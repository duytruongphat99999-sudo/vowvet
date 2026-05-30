/**
 * Vaccine repository (M6) — orchestrate templates + scheduled rows + mark complete + skip.
 *
 * Layered:
 *   shared/vaccine-scheduler.ts → pure logic
 *   api/lib/vaccines.ts          → DB read/write
 *   api/lib/vaccine-reminders.ts → cron job sending push
 */
import { listRows, getRow, createRow, updateRow } from "@shared/baserow.ts";
import {
  generateScheduleForPet,
  type VaccineTemplate,
  type ExistingVaccine,
  type PetForSchedule,
  type PlannedVaccine,
  type VaccineStatus,
  daysToDue,
} from "@shared/vaccine-scheduler.ts";

// ============================================================
// Templates cache (24h, KHÔNG đổi sau seed)
// ============================================================
let templatesCache: { data: VaccineTemplate[]; expires_at: number } | null = null;
const TEMPLATES_TTL_MS = 24 * 60 * 60 * 1000;

export async function loadTemplates(force = false): Promise<VaccineTemplate[]> {
  if (!force && templatesCache && templatesCache.expires_at > Date.now()) {
    return templatesCache.data;
  }
  const res = await listRows<any>("vaccine_schedules", { size: 200 });
  // Filter out stub rows (Baserow auto-creates 2 empty rows khi table mới)
  const data: VaccineTemplate[] = res.results
    .filter((r) => r.species && r.vaccine_code && r.vaccine_name)
    .map((r) => ({
      id: r.id,
      species: (typeof r.species === "object" ? r.species.value : r.species) as "dog" | "cat",
      vaccine_name: r.vaccine_name,
      vaccine_code: typeof r.vaccine_code === "object" ? r.vaccine_code.value : r.vaccine_code,
      is_core: r.is_core === true,
      first_dose_age_weeks: Number(r.first_dose_age_weeks) || 6,
      doses_count: Number(r.doses_count) || 1,
      interval_weeks_between: Number(r.interval_weeks_between) || 0,
      booster_interval_months: Number(r.booster_interval_months) || 12,
      description_vn: r.description_vn || "",
      importance_level: (typeof r.importance_level === "object"
        ? r.importance_level.value
        : r.importance_level) as "critical" | "recommended" | "optional",
    }));
  templatesCache = { data, expires_at: Date.now() + TEMPLATES_TTL_MS };
  return data;
}

export function invalidateTemplatesCache(): void {
  templatesCache = null;
}

// ============================================================
// List existing vaccines for pet (raw + flattened)
// ============================================================
export interface BaserowVaccine {
  id: number;
  vaccine_code?: string | { value: string } | null;
  vaccine_type?: string | { value: string } | null;
  status?: string | { value: string } | null;
  administered_date?: string | null;
  due_date?: string | null;
  next_due_date?: string | null;
  series_type?: string | { value: string } | null;
  dose_number?: number | string | null;
  brand?: string | null;
  clinic_name?: string | null;
  batch_number?: string | null;
  notes?: string | null;
  pet_id?: Array<{ id: number; value: string }>;
  is_custom?: boolean;
  reminder_sent_14d?: boolean;
  reminder_sent_7d?: boolean;
  reminder_sent_1d?: boolean;
  reminder_sent_overdue?: boolean;
  // Phase 2A — vaccine photo passport (paper booklet + invoice receipt URLs)
  proof_photo_url?: string | null;
  invoice_photo_url?: string | null;
}

function flatField<T>(v: T | { value: T } | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in (v as any)) return (v as any).value;
  return v as T;
}

export async function listPetVaccines(petId: number): Promise<BaserowVaccine[]> {
  const res = await listRows<BaserowVaccine>("vaccines", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 200,
  });
  return res.results;
}

/** Flatten cho passing vào shared/vaccine-scheduler. */
export function toExistingVaccine(row: BaserowVaccine): ExistingVaccine {
  return {
    id: row.id,
    vaccine_code: flatField(row.vaccine_code),
    status: flatField(row.status) as VaccineStatus | null,
    administered_date: row.administered_date || null,
    due_date: row.due_date || null,
    series_type: flatField(row.series_type) as any,
    pet_id: row.pet_id?.[0]?.id || 0,
  };
}

// ============================================================
// Generate + upsert schedule (idempotent)
// ============================================================

/**
 * Đánh giá pet, gen plans, persist các plans CHƯA có row trong DB.
 * Idempotent: nếu (pet_id, vaccine_code, series_type) đã có scheduled/overdue row → KHÔNG tạo dup.
 * Pet có thể có nhiều rows scheduled khác nhau (mỗi vaccine_code 1 row tiếp theo).
 */
export async function generateAndPersistSchedule(petForSched: PetForSchedule): Promise<{
  plans: PlannedVaccine[];
  created: number;
  skipped: number;
}> {
  const templates = await loadTemplates();
  const existing = await listPetVaccines(petForSched.id);
  const existingFlat = existing.map(toExistingVaccine);
  const plans = generateScheduleForPet(petForSched, templates, existingFlat);

  let created = 0;
  let skipped = 0;

  for (const plan of plans) {
    // Đã có row "scheduled" hoặc "overdue" cho code này + chưa completed?
    const matching = existing.find((e) => {
      const code = flatField(e.vaccine_code);
      const status = flatField(e.status);
      return code === plan.vaccine_code && (status === "scheduled" || status === "overdue" || status === "skipped");
    });

    if (matching) {
      // Đã có row tương ứng — update due_date + status + series_type + dose_number
      const mStatus = flatField(matching.status);
      const mSeries = flatField(matching.series_type);
      if (
        mStatus !== plan.status ||
        matching.due_date !== plan.due_date ||
        mSeries !== plan.series_type ||
        Number(matching.dose_number) !== plan.dose_number
      ) {
        try {
          await updateRow("vaccines", matching.id, {
            status: plan.status,
            due_date: plan.due_date,
            series_type: plan.series_type,
            dose_number: plan.dose_number,
          });
          created++;
        } catch (err) {
          console.error(`[vaccines] update scheduled row failed:`, err);
          skipped++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    // Tạo row mới
    try {
      await createRow("vaccines", {
        pet_id: [petForSched.id],
        vaccine_code: plan.vaccine_code,
        status: plan.status,
        due_date: plan.due_date,
        series_type: plan.series_type,
        dose_number: plan.dose_number,
        notes: plan.skip_reason ? `Auto-skip: ${plan.skip_reason}` : null,
      });
      created++;
    } catch (err) {
      console.error(`[vaccines] create scheduled row failed for ${plan.vaccine_code}:`, err);
      skipped++;
    }
  }

  return { plans, created, skipped };
}

// ============================================================
// Mark completed / skip
// ============================================================

/**
 * Mark scheduled vaccine as completed.
 * Reset reminder flags. Auto-trigger next schedule via regenerate.
 */
export async function markVaccineCompleted(
  petId: number,
  vaccineId: number,
  data: {
    administered_date: string;
    brand?: string | null;
    clinic_name?: string | null;
    batch_number?: string | null;
    notes?: string | null;
  }
): Promise<BaserowVaccine> {
  const updated = await updateRow<BaserowVaccine>("vaccines", vaccineId, {
    status: "completed",
    administered_date: data.administered_date,
    brand: data.brand ?? null,
    clinic_name: data.clinic_name ?? null,
    batch_number: data.batch_number ?? null,
    notes: data.notes ?? null,
    reminder_sent_14d: false,
    reminder_sent_7d: false,
    reminder_sent_1d: false,
    reminder_sent_overdue: false,
  });
  return updated;
}

export async function skipVaccine(
  petId: number,
  vaccineId: number,
  reason: string
): Promise<BaserowVaccine> {
  return updateRow<BaserowVaccine>("vaccines", vaccineId, {
    status: "skipped",
    notes: `Bỏ qua: ${reason}`,
  });
}

/**
 * Add custom vaccine (is_custom=true, không auto-generate next).
 * Phase 2A: now persists proof_photo_url + invoice_photo_url when provided.
 */
export async function addCustomVaccine(
  petId: number,
  data: {
    vaccine_name: string;
    administered_date: string;
    brand?: string | null;
    clinic_name?: string | null;
    notes?: string | null;
    proof_photo_url?: string | null;
    invoice_photo_url?: string | null;
  }
): Promise<BaserowVaccine> {
  return createRow<BaserowVaccine>("vaccines", {
    pet_id: [petId],
    vaccine_code: null,
    status: "completed",
    is_custom: true,
    administered_date: data.administered_date,
    brand: data.brand ?? null,
    clinic_name: data.clinic_name ?? null,
    notes: `[Custom] ${data.vaccine_name}${data.notes ? ` — ${data.notes}` : ""}`,
    proof_photo_url: data.proof_photo_url || null,
    invoice_photo_url: data.invoice_photo_url || null,
  });
}

// ============================================================
// Helpers cho route layer
// ============================================================

export interface VaccineCalendarItem {
  vaccine_code: string;
  vaccine_name: string;
  vaccine_name_vn: string;
  status: VaccineStatus;
  due_date: string | null;
  administered_date: string | null;
  series_type: string | null;
  dose_number: number;
  doses_total: number;
  doses_completed: number;
  days_to_due: number | null;
  is_core: boolean;
  importance_level: string;
  description_vn: string;
  /** Row id nếu vaccine này đã persist (scheduled, overdue, completed). null nếu chỉ plan in-memory. */
  vaccine_row_id: number | null;
  reminder_flags?: {
    sent_14d: boolean;
    sent_7d: boolean;
    sent_1d: boolean;
    sent_overdue: boolean;
  };
  // Phase 2A — photo proof URLs (paper booklet + invoice). Empty/null when not uploaded.
  proof_photo_url?: string | null;
  invoice_photo_url?: string | null;
  brand?: string | null;
  clinic_name?: string | null;
  notes?: string | null;
}

/**
 * Calendar view: merge persisted rows + future plans.
 * Result chỉ chứa các row có trong vaccines table (scheduled/completed/skipped) +
 * NEW plans từ engine chưa có row.
 */
export async function buildCalendar(petForSched: PetForSchedule): Promise<VaccineCalendarItem[]> {
  await generateAndPersistSchedule(petForSched); // ensure scheduled rows up-to-date

  const templates = await loadTemplates();
  const existing = await listPetVaccines(petForSched.id);
  const items: VaccineCalendarItem[] = [];

  // Group existing rows by vaccine_code để biết doses_completed
  const completedByCode = new Map<string, BaserowVaccine[]>();
  for (const row of existing) {
    const code = flatField(row.vaccine_code);
    const status = flatField(row.status);
    if (!code) continue;
    if (status === "completed") {
      const arr = completedByCode.get(code) || [];
      arr.push(row);
      completedByCode.set(code, arr);
    }
  }

  // Build items từ all existing rows
  for (const row of existing) {
    const code = flatField(row.vaccine_code);
    if (!code) continue;
    const status = flatField(row.status) as VaccineStatus | null;
    if (!status) continue;
    const template = templates.find((t) => t.vaccine_code === code);
    const completed = completedByCode.get(code) || [];

    items.push({
      vaccine_code: code,
      vaccine_name: template?.vaccine_name || code,
      vaccine_name_vn: template?.vaccine_name || code,
      status,
      due_date: row.due_date || null,
      administered_date: row.administered_date || null,
      series_type: flatField(row.series_type),
      dose_number: Number(row.dose_number) || 1,
      doses_total: template?.doses_count || 1,
      doses_completed: completed.length,
      days_to_due: row.due_date ? daysToDue(row.due_date) : null,
      is_core: template?.is_core || false,
      importance_level: template?.importance_level || "optional",
      description_vn: template?.description_vn || "",
      vaccine_row_id: row.id,
      reminder_flags: {
        sent_14d: row.reminder_sent_14d === true,
        sent_7d: row.reminder_sent_7d === true,
        sent_1d: row.reminder_sent_1d === true,
        sent_overdue: row.reminder_sent_overdue === true,
      },
      proof_photo_url: row.proof_photo_url || null,
      invoice_photo_url: row.invoice_photo_url || null,
      brand: row.brand || null,
      clinic_name: row.clinic_name || null,
      notes: row.notes || null,
    });
  }

  items.sort((a, b) => {
    // Sort: overdue first → scheduled by due_date asc → completed by date desc → skipped last
    const order: Record<string, number> = { overdue: 0, scheduled: 1, completed: 2, skipped: 3 };
    const dA = order[a.status] ?? 99;
    const dB = order[b.status] ?? 99;
    if (dA !== dB) return dA - dB;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    return 0;
  });

  return items;
}

/** Aggregate vaccine summary cho user (all pets). */
export async function buildUserVaccineSummary(userId: number, listUserPets: (uid: number) => Promise<Array<{ id: number }>>): Promise<{
  overdue_count: number;
  due_soon_count: number; // <= 14 days
  scheduled_count: number;
  completed_this_year: number;
}> {
  const pets = await listUserPets(userId);
  let overdue = 0;
  let dueSoon = 0;
  let scheduled = 0;
  let completedYear = 0;
  const today = new Date();
  const yearStart = `${today.getFullYear()}-01-01`;

  for (const pet of pets) {
    const vacs = await listPetVaccines(pet.id);
    for (const v of vacs) {
      const status = flatField(v.status);
      if (status === "overdue") overdue++;
      else if (status === "scheduled") {
        if (v.due_date && daysToDue(v.due_date) <= 14) dueSoon++;
        else scheduled++;
      } else if (status === "completed") {
        if (v.administered_date && v.administered_date >= yearStart) completedYear++;
      }
    }
  }

  return {
    overdue_count: overdue,
    due_soon_count: dueSoon,
    scheduled_count: scheduled,
    completed_this_year: completedYear,
  };
}
