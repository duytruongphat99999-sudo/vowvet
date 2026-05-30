/**
 * Vaccine scheduling pure logic (M6).
 * Date math + state transitions. KHÔNG truy cập DB — caller (api/lib/vaccines.ts) orchestrate.
 */
import { ageInYears } from "./senior.ts";

export type VaccineStatus = "scheduled" | "completed" | "skipped" | "overdue";
export type SeriesType = "puppy_primary" | "adult_catchup" | "booster" | "custom";

/** Template từ vaccine_schedules table (Baserow shape sau khi flatten). */
export interface VaccineTemplate {
  id: number;
  species: "dog" | "cat";
  vaccine_name: string;
  vaccine_code: string;
  is_core: boolean;
  first_dose_age_weeks: number;
  doses_count: number;
  interval_weeks_between: number;
  booster_interval_months: number;
  description_vn: string;
  importance_level: "critical" | "recommended" | "optional";
}

/** Existing vaccine record từ vaccines table. */
export interface ExistingVaccine {
  id: number;
  vaccine_code: string | null;
  status: VaccineStatus | null;
  administered_date: string | null; // YYYY-MM-DD
  due_date: string | null;
  series_type: SeriesType | null;
  pet_id: number;
}

/** Pet input cần thiết cho schedule. */
export interface PetForSchedule {
  id: number;
  species: "dog" | "cat" | string;
  dob: string | null;
  age_estimation_method: string | null;
  // Lifestyle cho FIV indoor check
  travels_with_owner: boolean | null;
  bathroom_location: string | null;
}

/** Output: vaccine cần schedule (chưa persist). */
export interface PlannedVaccine {
  vaccine_code: string;
  vaccine_name: string;
  template_id: number;
  due_date: string; // YYYY-MM-DD
  series_type: SeriesType;
  dose_number: number; // 1 = first dose của series
  doses_total: number;
  is_core: boolean;
  importance_level: "critical" | "recommended" | "optional";
  description_vn: string;
  status: VaccineStatus;
  skip_reason?: string;
}

// ============================================================
// Date helpers
// ============================================================

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number): Date {
  const r = new Date(date);
  r.setMonth(r.getMonth() + months);
  return r;
}

function petAgeYears(pet: PetForSchedule, now: Date = new Date()): number {
  const yrs = ageInYears(pet.dob, now);
  if (yrs !== null) return yrs;
  // No dob → default 1 year for unknown adults
  if (pet.age_estimation_method) return 1;
  return 1;
}

// ============================================================
// Indoor cat detection (cho FIV skip)
// ============================================================

export function isIndoorCat(pet: PetForSchedule): boolean {
  if (pet.species !== "cat") return false;
  const indoorBathroom = pet.bathroom_location === "litter_box" || pet.bathroom_location === "indoor_pad";
  const noTravel = pet.travels_with_owner === false;
  // Both must be true (defensive — if either unknown, không skip)
  return indoorBathroom && noTravel;
}

// ============================================================
// Plan engine — per template
// ============================================================

function planForTemplate(
  template: VaccineTemplate,
  pet: PetForSchedule,
  existing: ExistingVaccine[]
): PlannedVaccine | null {
  // Filter existing vaccines của vaccine_code này, completed only
  const completed = existing
    .filter((v) => v.vaccine_code === template.vaccine_code && v.status === "completed" && v.administered_date)
    .sort((a, b) => (a.administered_date! < b.administered_date! ? -1 : 1));

  const dosesCompleted = completed.length;
  const lastGiven = completed[dosesCompleted - 1]?.administered_date;
  const today = new Date();
  const ageYears = petAgeYears(pet, today);

  // Indoor cat + FIV → SKIP
  if (template.vaccine_code === "fiv" && isIndoorCat(pet)) {
    return {
      vaccine_code: template.vaccine_code,
      vaccine_name: template.vaccine_name,
      template_id: template.id,
      due_date: todayIso(),
      series_type: "puppy_primary",
      dose_number: dosesCompleted + 1,
      doses_total: template.doses_count,
      is_core: template.is_core,
      importance_level: template.importance_level,
      description_vn: template.description_vn,
      status: "skipped",
      skip_reason: "indoor_only",
    };
  }

  // Đã hoàn thành full primary series → schedule booster
  if (dosesCompleted >= template.doses_count) {
    const lastDate = parseIso(lastGiven);
    if (!lastDate) return null;
    const nextDate = addMonths(lastDate, template.booster_interval_months);
    return {
      vaccine_code: template.vaccine_code,
      vaccine_name: template.vaccine_name,
      template_id: template.id,
      due_date: formatIso(nextDate),
      series_type: "booster",
      dose_number: dosesCompleted + 1, // booster đếm sau primary
      doses_total: template.doses_count + 1,
      is_core: template.is_core,
      importance_level: template.importance_level,
      description_vn: template.description_vn,
      status: nextDate < today ? "overdue" : "scheduled",
    };
  }

  // Đang trong primary series (có ít nhất 1 dose, chưa đủ)
  if (dosesCompleted > 0) {
    const lastDate = parseIso(lastGiven);
    if (!lastDate) return null;

    // EDGE: pet adult (≥1 năm) + last dose > 11 tháng trước → chuyển sang booster cycle
    // Logic: primary series cho puppy/kitten. Adult > 1 năm + incomplete primary
    // = thực tế đã ổn miễn dịch, chỉ cần annual booster.
    const monthsSinceLast = (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (ageYears >= 1 && monthsSinceLast >= 11) {
      const nextDate = addMonths(lastDate, template.booster_interval_months);
      return {
        vaccine_code: template.vaccine_code,
        vaccine_name: template.vaccine_name,
        template_id: template.id,
        due_date: formatIso(nextDate),
        series_type: "booster",
        dose_number: dosesCompleted + 1,
        doses_total: template.doses_count + 1,
        is_core: template.is_core,
        importance_level: template.importance_level,
        description_vn: `${template.description_vn} (Adult catchup: chỉ có ${dosesCompleted}/${template.doses_count} primary dose. Schedule booster annual.)`,
        status: nextDate < today ? "overdue" : "scheduled",
      };
    }

    // Puppy/kitten trong primary: tiếp tục protocol
    const nextDate = addWeeks(lastDate, template.interval_weeks_between);
    return {
      vaccine_code: template.vaccine_code,
      vaccine_name: template.vaccine_name,
      template_id: template.id,
      due_date: formatIso(nextDate),
      series_type: "puppy_primary",
      dose_number: dosesCompleted + 1,
      doses_total: template.doses_count,
      is_core: template.is_core,
      importance_level: template.importance_level,
      description_vn: template.description_vn,
      status: nextDate < today ? "overdue" : "scheduled",
    };
  }

  // Chưa có dose nào — quyết định primary vs adult_catchup
  if (ageYears >= 1) {
    // Adult catchup: tư vấn vet visit window 30 ngày tới
    const nextDate = addDays(today, 30);
    return {
      vaccine_code: template.vaccine_code,
      vaccine_name: template.vaccine_name,
      template_id: template.id,
      due_date: formatIso(nextDate),
      series_type: "adult_catchup",
      dose_number: 1,
      doses_total: 1, // adult catchup chỉ 1 mũi (vet quyết định protocol)
      is_core: template.is_core,
      importance_level: template.importance_level,
      description_vn: `${template.description_vn} (Pet adult, lịch tiêm catch-up. Tư vấn bác sĩ trước.)`,
      status: "scheduled",
    };
  }

  // Puppy primary từ dob + first_dose_age_weeks
  const birthDate = parseIso(pet.dob);
  if (!birthDate) return null; // edge: no dob and < 1 year → fallback below
  const nextDate = addWeeks(birthDate, template.first_dose_age_weeks);
  return {
    vaccine_code: template.vaccine_code,
    vaccine_name: template.vaccine_name,
    template_id: template.id,
    due_date: formatIso(nextDate),
    series_type: "puppy_primary",
    dose_number: 1,
    doses_total: template.doses_count,
    is_core: template.is_core,
    importance_level: template.importance_level,
    description_vn: template.description_vn,
    status: nextDate < today ? "overdue" : "scheduled",
  };
}

/**
 * Generate schedule cho pet dựa trên templates + existing vaccines.
 * Filter templates theo species. Return sorted by due_date asc.
 */
export function generateScheduleForPet(
  pet: PetForSchedule,
  templates: VaccineTemplate[],
  existing: ExistingVaccine[]
): PlannedVaccine[] {
  const sp = pet.species?.toLowerCase();
  const filtered = templates.filter((t) => t.species === sp);
  const plans: PlannedVaccine[] = [];
  for (const t of filtered) {
    const p = planForTemplate(t, pet, existing);
    if (p) plans.push(p);
  }
  plans.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return plans;
}

// ============================================================
// Days-to-due helpers (cho reminder + UI)
// ============================================================

export function daysToDue(dueDate: string, now: Date = new Date()): number {
  const due = parseIso(dueDate);
  if (!due) return 0;
  const diffMs = due.getTime() - new Date(now.toDateString()).getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** "Due soon" = trong 14 ngày tới (chưa overdue). */
export function isDueSoon(dueDate: string, now: Date = new Date()): boolean {
  const d = daysToDue(dueDate, now);
  return d >= 0 && d <= 14;
}
