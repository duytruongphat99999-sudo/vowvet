/**
 * VN-market vaccine grouping helper.
 *
 * **Why this exists**: VN clinics overwhelmingly sell multi-disease combo vaccines
 * (Nobivac Tricat for cats covers 4 diseases in one shot; Eurican DHPPi-Lmulti
 * for dogs covers 7). Showing the legacy clinical breakdown ("FVRCP, FCV, FeLV,
 * FIV — 4 separate cards") confuses owners. Group them: "Mũi 4-bệnh + Mũi dại"
 * is what owners actually understand and what clinics actually inject.
 *
 * Pure functions — no DB calls. Safe to import from both API (Bun) and Web (Astro
 * SSR). Brand-safe: no `text-vv-gold` token (doesn't exist); UI maps urgency_color
 * symbols (red/amber/emerald/gray) to real Tailwind classes.
 *
 * Legacy aliases match against `vaccine_code`, `vaccine_name`, `vaccine_name_vn`
 * fields returned by `/api/v1/pets/:id/vaccine-calendar`. No DB migration needed.
 */

export type VaccineUrgency = "red" | "amber" | "emerald" | "gray";

export type GroupStatus =
  | "not_done"      // no matching record at all → red
  | "overdue"       // due in the past, not yet given → red
  | "due_soon"      // ≤ 14 days to due → amber
  | "done_recent"   // completed within last 60 days → emerald
  | "up_to_date";   // completed > 60 days ago, next due > 60 days out → emerald

export type SpeciesInput = "cat" | "dog" | "Mèo" | "Chó" | string;

export interface VaccineGroup {
  /** Stable key for analytics + future DB column. */
  key: string;
  /** Display name on the card header. */
  name: string;
  /** One-line user-facing description. */
  description: string;
  /** Diseases this combo covers (UI chips). */
  diseases_covered: string[];
  /** Popular brand names in VN market — set as suggestions in the log modal. */
  vaccine_brands: string[];
  /** Plain-text schedule for the FAQ row. */
  schedule: { first_dose_age: string; booster: string; annual: string };
  /** Required by VN law (animal vaccination decree) — shown as red "Bắt buộc" pill. */
  is_legally_required?: boolean;
  /** Which species this group applies to. */
  species: "cat" | "dog";
  /** Aliases checked against `vaccine_code` / `vaccine_name` / `vaccine_name_vn`. */
  legacy_aliases: string[];
}

// ─── Group definitions ──────────────────────────────────────────────────────

export const VACCINE_GROUPS_VN: VaccineGroup[] = [
  {
    key: "cat_core_4in1",
    name: "Mũi 4-bệnh cho mèo",
    description: "Vaccine đa giá phòng 4 bệnh nguy hiểm phổ biến ở mèo VN",
    diseases_covered: [
      "Viêm mũi–họng (FVR)",
      "Viêm ruột (FCV)",
      "Giảm bạch cầu (FPV)",
      "Bạch cầu mèo (FeLV)",
    ],
    vaccine_brands: ["Nobivac Tricat Trio", "Purevax RCP", "Felocell CVR"],
    schedule: { first_dose_age: "8–9 tuần", booster: "3–4 tuần sau mũi đầu", annual: "1 năm/lần" },
    species: "cat",
    legacy_aliases: [
      "FVRCP", "FVR", "FCV", "FPV", "FeLV", "FIV",
      "feline_panleukopenia", "feline_calicivirus", "feline_rhinotracheitis",
      "Bạch cầu", "Giảm bạch cầu", "Viêm mũi",
    ],
  },
  {
    key: "cat_rabies",
    name: "Mũi dại cho mèo",
    description: "Bắt buộc theo luật VN — bảo vệ bé và người trong gia đình",
    diseases_covered: ["Bệnh dại (Rabies)"],
    vaccine_brands: ["Nobivac Rabies", "Rabisin", "Defensor"],
    schedule: { first_dose_age: "12 tuần", booster: "không cần", annual: "1 năm/lần" },
    is_legally_required: true,
    species: "cat",
    legacy_aliases: ["Rabies", "rabies", "Dại", "dại"],
  },
  {
    key: "dog_core_7in1",
    name: "Mũi 7-bệnh cho chó",
    description: "Vaccine đa giá phòng 7 bệnh nguy hiểm nhất ở chó VN",
    diseases_covered: [
      "Care (Distemper)",
      "Parvo virus",
      "Viêm gan (Adenovirus)",
      "Parainfluenza",
      "Lepto (2 chủng)",
    ],
    vaccine_brands: ["Vanguard Plus 7", "Eurican DHPPi-Lmulti", "Nobivac DHP+L4"],
    schedule: {
      first_dose_age: "6–8 tuần",
      booster: "3–4 tuần sau (3 mũi liên tiếp)",
      annual: "1 năm/lần",
    },
    species: "dog",
    legacy_aliases: [
      "DHPPi", "DHPP", "DA2PP", "DAPP", "Lepto", "Leptospirosis",
      "Parvo", "Distemper", "Adenovirus", "Parainfluenza", "Care",
    ],
  },
  {
    key: "dog_rabies",
    name: "Mũi dại cho chó",
    description: "Bắt buộc theo luật VN — bảo vệ bé và người trong gia đình",
    diseases_covered: ["Bệnh dại (Rabies)"],
    vaccine_brands: ["Nobivac Rabies", "Rabisin", "Defensor"],
    schedule: { first_dose_age: "12 tuần", booster: "không cần", annual: "1 năm/lần" },
    is_legally_required: true,
    species: "dog",
    legacy_aliases: ["Rabies", "rabies", "Dại", "dại"],
  },
];

// ─── Species normalization (VN + EN) ────────────────────────────────────────

function normalizeSpecies(s: SpeciesInput): "cat" | "dog" | null {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  if (v === "cat" || v === "mèo" || v === "meo") return "cat";
  if (v === "dog" || v === "chó" || v === "cho") return "dog";
  return null;
}

export function getVaccineGroupsForSpecies(species: SpeciesInput): VaccineGroup[] {
  const norm = normalizeSpecies(species);
  if (!norm) return [];
  return VACCINE_GROUPS_VN.filter((g) => g.species === norm);
}

// ─── Legacy matching ────────────────────────────────────────────────────────

/**
 * Decide whether a calendar item belongs to this group. Checks vaccine_code,
 * vaccine_name, vaccine_name_vn fields against the group's aliases (case-
 * insensitive substring match). Rabies aliases are species-aware so a dog's
 * rabies record won't match `cat_rabies`.
 */
export function matchesGroup(item: any, group: VaccineGroup, itemSpecies?: SpeciesInput): boolean {
  // For rabies groups: only match items of the matching species.
  if (group.key === "cat_rabies" || group.key === "dog_rabies") {
    if (itemSpecies) {
      const speciesNorm = normalizeSpecies(itemSpecies);
      if (speciesNorm && speciesNorm !== group.species) return false;
    }
  }
  const haystack = [
    item.vaccine_code,
    item.vaccine_name,
    item.vaccine_name_vn,
    item.name,
    item.vaccine_type,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
  if (!haystack) return false;
  return group.legacy_aliases.some((a) => haystack.includes(a.toLowerCase()));
}

// ─── Per-group status calculation ───────────────────────────────────────────

export interface GroupStatusInfo {
  status: GroupStatus;
  /** Worst status across matching items, used to color the group card. */
  urgency_color: VaccineUrgency;
  /** Short VN label shown on the status pill. */
  urgency_label: string;
  /** ISO date of the most recent completed record (null if never done). */
  last_administered_date: string | null;
  /** ISO date of the next due item (null if not_done with no scheduled item). */
  next_due_date: string | null;
  /** Signed days from today to next_due_date; negative = overdue. */
  days_until_due: number | null;
  /** Subset of items used to compute this — the UI shows these as "matched records". */
  matched_items: any[];
}

function dateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  // Treat as midnight VN; this is fine for day-count math.
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
}

function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 3600 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

/**
 * Compute the per-group status from the pet's vaccine-calendar response.
 *
 * Algorithm:
 *   1. Filter calendar items that match this group via `matchesGroup()`.
 *   2. If zero matches → `not_done`.
 *   3. If any matching item has status === "overdue" → `overdue`.
 *   4. Else if any scheduled item with due_date ≤ 14 days from now → `due_soon`.
 *   5. Else use the most recent completed (administered_date). If ≤ 60 days ago
 *      → `done_recent`, else `up_to_date`.
 *
 * @param items calendar items from `/api/v1/pets/:id/vaccine-calendar`
 */
export function getGroupStatus(
  group: VaccineGroup,
  items: any[],
  itemSpecies?: SpeciesInput,
  now: Date = new Date()
): GroupStatusInfo {
  const matched = (items || []).filter((it) => matchesGroup(it, group, itemSpecies));

  if (matched.length === 0) {
    return {
      status: "not_done",
      urgency_color: "red",
      urgency_label: "Chưa tiêm",
      last_administered_date: null,
      next_due_date: null,
      days_until_due: null,
      matched_items: [],
    };
  }

  // Pick overdue first
  const overdue = matched.filter((it) => it.status === "overdue");
  if (overdue.length > 0) {
    // Worst (oldest) overdue first
    overdue.sort((a, b) => {
      const da = dateOnly(a.due_date)?.getTime() || Infinity;
      const db = dateOnly(b.due_date)?.getTime() || Infinity;
      return da - db;
    });
    const top = overdue[0];
    const due = dateOnly(top.due_date);
    const daysOver = due ? Math.abs(daysBetween(now, due)) : null;
    return {
      status: "overdue",
      urgency_color: "red",
      urgency_label: daysOver != null ? `Trễ ${daysOver} ngày` : "Quá hạn",
      last_administered_date: matched
        .filter((it) => it.administered_date)
        .sort((a, b) => (dateOnly(b.administered_date)?.getTime() || 0) - (dateOnly(a.administered_date)?.getTime() || 0))[0]?.administered_date || null,
      next_due_date: top.due_date || null,
      days_until_due: due ? daysBetween(now, due) : null,
      matched_items: matched,
    };
  }

  // Due soon — scheduled within 14 days
  const dueSoon = matched
    .filter((it) => it.status === "scheduled" && it.due_date)
    .map((it) => ({ it, days: daysBetween(now, dateOnly(it.due_date)!) }))
    .filter((x) => x.days >= 0 && x.days <= 14)
    .sort((a, b) => a.days - b.days);
  if (dueSoon.length > 0) {
    const top = dueSoon[0];
    return {
      status: "due_soon",
      urgency_color: "amber",
      urgency_label: top.days === 0 ? "Hôm nay" : `Còn ${top.days} ngày`,
      last_administered_date: matched
        .filter((it) => it.administered_date)
        .sort((a, b) => (dateOnly(b.administered_date)?.getTime() || 0) - (dateOnly(a.administered_date)?.getTime() || 0))[0]?.administered_date || null,
      next_due_date: top.it.due_date || null,
      days_until_due: top.days,
      matched_items: matched,
    };
  }

  // Completed
  const completed = matched
    .filter((it) => it.status === "completed" && it.administered_date)
    .sort((a, b) => (dateOnly(b.administered_date)!.getTime()) - (dateOnly(a.administered_date)!.getTime()));

  if (completed.length > 0) {
    const last = completed[0];
    const lastDate = dateOnly(last.administered_date)!;
    const daysSince = daysBetween(lastDate, now);

    // Next due — prefer scheduled item if one exists for the same group, else +365 days
    const futureScheduled = matched
      .filter((it) => it.status === "scheduled" && it.due_date)
      .map((it) => ({ it, days: daysBetween(now, dateOnly(it.due_date)!) }))
      .filter((x) => x.days > 14)
      .sort((a, b) => a.days - b.days)[0];

    if (futureScheduled) {
      return {
        status: daysSince <= 60 ? "done_recent" : "up_to_date",
        urgency_color: "emerald",
        urgency_label: futureScheduled.days <= 60 ? `Còn ${futureScheduled.days} ngày` : `Hiệu lực ${futureScheduled.days} ngày`,
        last_administered_date: last.administered_date,
        next_due_date: futureScheduled.it.due_date,
        days_until_due: futureScheduled.days,
        matched_items: matched,
      };
    }

    // Fallback: assume annual booster
    const nextDue = new Date(lastDate);
    nextDue.setFullYear(nextDue.getFullYear() + 1);
    const daysUntil = daysBetween(now, nextDue);
    return {
      status: daysUntil <= 60 ? "done_recent" : "up_to_date",
      urgency_color: daysUntil <= 60 ? "emerald" : "emerald",
      urgency_label: daysUntil > 0 ? `Hiệu lực ${daysUntil} ngày` : "Sắp hết hạn",
      last_administered_date: last.administered_date,
      next_due_date: nextDue.toISOString().slice(0, 10),
      days_until_due: daysUntil,
      matched_items: matched,
    };
  }

  // Has matches but none completed and none scheduled in 14 days → treat as not_done
  return {
    status: "not_done",
    urgency_color: "red",
    urgency_label: "Chưa tiêm",
    last_administered_date: null,
    next_due_date: matched.find((it) => it.due_date)?.due_date || null,
    days_until_due: null,
    matched_items: matched,
  };
}

// ─── Hero state (aggregate across all groups across all pets) ───────────────

export type HeroState = "urgent" | "attention" | "good" | "perfect";

export interface HeroSummary {
  state: HeroState;
  total_groups: number;
  completed_groups: number;
  due_soon: number;
  overdue: number;
  not_done: number;
}

export function summarizeAcrossPets(
  perPet: Array<{ species: SpeciesInput; statuses: GroupStatusInfo[] }>
): HeroSummary {
  let total = 0, completed = 0, dueSoon = 0, overdue = 0, notDone = 0;
  for (const p of perPet) {
    for (const s of p.statuses) {
      total++;
      if (s.status === "overdue") overdue++;
      else if (s.status === "due_soon") dueSoon++;
      else if (s.status === "not_done") notDone++;
      else completed++;
    }
  }
  let state: HeroState;
  if (overdue > 0 || notDone > 0) state = "urgent";
  else if (dueSoon > 0) state = "attention";
  else if (total > 0 && completed === total) state = "perfect";
  else state = "good";
  return { state, total_groups: total, completed_groups: completed, due_soon: dueSoon, overdue, not_done: notDone };
}
