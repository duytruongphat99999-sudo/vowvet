/**
 * Routine service lib (M19).
 *
 * CRUD for routines, completions, streaks.
 * Streak logic with monthly freeze budget.
 * Badge unlock detection.
 */
import { listRows, createRow, updateRow, getRow, deleteRow } from "@shared/baserow.ts";
import {
  ROUTINE_BADGES,
  STREAK_MIN_COMPLETION_RATE,
  MONTHLY_FREEZE_BUDGET,
  type RoutineBadgeId,
  type RoutineTask,
  type RoutineScheduleType,
} from "@shared/routine-badges.ts";

// ================================================================
// Types
// ================================================================

export interface RoutineRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  name: string;
  icon: string | null;
  color: string | null;
  schedule_type: string | { id: number; value: string } | null;
  custom_days: string | null;
  start_time: string | null;
  tasks: string | null; // JSON
  active: boolean;
  push_reminder: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoutineApi {
  id: number;
  pet_id: number;
  name: string;
  icon: string;
  color: string;
  schedule_type: RoutineScheduleType;
  custom_days: string[];
  start_time: string;
  tasks: RoutineTask[];
  active: boolean;
  push_reminder: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompletionRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  routine_id: number;
  completion_date: string;
  tasks_completed: string | null;
  tasks_total: number;
  tasks_completion_rate: number;
  points_earned: number;
  streak_count_at_time: number;
  completed_at: string;
  notes: string | null;
}

export interface CompletionApi {
  id: number;
  pet_id: number;
  routine_id: number;
  completion_date: string;
  tasks_completed: string[];
  tasks_total: number;
  tasks_completion_rate: number;
  points_earned: number;
  streak_count_at_time: number;
  completed_at: string;
  notes: string | null;
}

export interface StreakRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  total_points: number;
  last_completion_date: string | null;
  streak_freezes_available: number;
  badges_earned: string | null;
  morning_completions: number;
  evening_completions: number;
  triple_days_count: number;
  updated_at: string;
}

export interface StreakApi {
  pet_id: number;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  total_points: number;
  last_completion_date: string | null;
  streak_freezes_available: number;
  badges_earned: RoutineBadgeId[];
  morning_completions: number;
  evening_completions: number;
  triple_days_count: number;
  updated_at: string;
}

// ================================================================
// Helpers
// ================================================================

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateAddDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toRoutineApi(row: RoutineRow): RoutineApi {
  const petLink = (row.pet_id || [])[0];
  let tasks: RoutineTask[] = [];
  try { tasks = JSON.parse(row.tasks || "[]"); } catch {}
  const schedRaw = flatVal<string>(row.schedule_type);
  const sched: RoutineScheduleType = (["daily", "weekdays", "weekends", "custom"].includes(schedRaw as any) ? schedRaw : "daily") as RoutineScheduleType;
  const customDays = (row.custom_days || "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    id: row.id,
    pet_id: petLink?.id ?? 0,
    name: row.name || "Routine",
    icon: row.icon || "📋",
    color: row.color || "#6366F1",
    schedule_type: sched,
    custom_days: customDays,
    start_time: row.start_time || "08:00",
    tasks,
    active: row.active !== false,
    push_reminder: row.push_reminder !== false,
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

export function toCompletionApi(row: CompletionRow): CompletionApi {
  const petLink = (row.pet_id || [])[0];
  let taskIds: string[] = [];
  try { taskIds = JSON.parse(row.tasks_completed || "[]"); } catch {}
  return {
    id: row.id,
    pet_id: petLink?.id ?? 0,
    routine_id: Number(row.routine_id) || 0,
    completion_date: row.completion_date || "",
    tasks_completed: taskIds,
    tasks_total: Number(row.tasks_total) || 0,
    tasks_completion_rate: Number(row.tasks_completion_rate) || 0,
    points_earned: Number(row.points_earned) || 0,
    streak_count_at_time: Number(row.streak_count_at_time) || 0,
    completed_at: row.completed_at || "",
    notes: row.notes || null,
  };
}

export function toStreakApi(row: StreakRow): StreakApi {
  const petLink = (row.pet_id || [])[0];
  let badges: RoutineBadgeId[] = [];
  try {
    const arr = JSON.parse(row.badges_earned || "[]");
    if (Array.isArray(arr)) badges = arr.filter((b) => b in ROUTINE_BADGES);
  } catch {}
  return {
    pet_id: petLink?.id ?? 0,
    current_streak: Number(row.current_streak) || 0,
    longest_streak: Number(row.longest_streak) || 0,
    total_completions: Number(row.total_completions) || 0,
    total_points: Number(row.total_points) || 0,
    last_completion_date: row.last_completion_date || null,
    streak_freezes_available: Number(row.streak_freezes_available ?? MONTHLY_FREEZE_BUDGET),
    badges_earned: badges,
    morning_completions: Number(row.morning_completions) || 0,
    evening_completions: Number(row.evening_completions) || 0,
    triple_days_count: Number(row.triple_days_count) || 0,
    updated_at: row.updated_at || "",
  };
}

// ================================================================
// Routine CRUD
// ================================================================

export async function listRoutines(petId: number, includeInactive = false): Promise<RoutineApi[]> {
  const res = await listRows<RoutineRow>("routines", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 100,
  });
  return res.results
    .filter((r) => r.name)
    .filter((r) => includeInactive || r.active !== false)
    .map(toRoutineApi);
}

export async function getRoutineById(routineId: number): Promise<RoutineApi | null> {
  try {
    const row = await getRow<RoutineRow>("routines", routineId);
    return toRoutineApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export interface CreateRoutineInput {
  petId: number;
  name: string;
  icon?: string;
  color?: string;
  schedule_type?: RoutineScheduleType;
  custom_days?: string[];
  start_time?: string;
  tasks: RoutineTask[];
  push_reminder?: boolean;
}

export async function createRoutine(input: CreateRoutineInput): Promise<RoutineApi> {
  const now = new Date().toISOString();
  const row = await createRow<RoutineRow>("routines", {
    pet_id: [input.petId],
    name: input.name.slice(0, 80),
    icon: input.icon || "📋",
    color: input.color || "#6366F1",
    schedule_type: input.schedule_type || "daily",
    custom_days: (input.custom_days || []).join(","),
    start_time: input.start_time || "08:00",
    tasks: JSON.stringify(input.tasks || []),
    active: true,
    push_reminder: input.push_reminder !== false,
    created_at: now,
    updated_at: now,
  });
  return toRoutineApi(row);
}

export async function updateRoutineRow(routineId: number, patch: Partial<CreateRoutineInput> & { active?: boolean }): Promise<RoutineApi> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updates.name = patch.name.slice(0, 80);
  if (patch.icon !== undefined) updates.icon = patch.icon;
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.schedule_type !== undefined) updates.schedule_type = patch.schedule_type;
  if (patch.custom_days !== undefined) updates.custom_days = (patch.custom_days || []).join(",");
  if (patch.start_time !== undefined) updates.start_time = patch.start_time;
  if (patch.tasks !== undefined) updates.tasks = JSON.stringify(patch.tasks);
  if (patch.push_reminder !== undefined) updates.push_reminder = patch.push_reminder;
  if (patch.active !== undefined) updates.active = patch.active;
  const row = await updateRow<RoutineRow>("routines", routineId, updates);
  return toRoutineApi(row);
}

/** Soft delete: set active=false. */
export async function softDeleteRoutine(routineId: number): Promise<void> {
  await updateRow("routines", routineId, { active: false, updated_at: new Date().toISOString() });
}

// ================================================================
// Schedule check
// ================================================================

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function isRoutineActiveToday(routine: RoutineApi, date: Date = new Date()): boolean {
  if (!routine.active) return false;
  const dow = date.getDay(); // 0 = Sunday
  switch (routine.schedule_type) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekends":
      return dow === 0 || dow === 6;
    case "custom":
      return routine.custom_days.includes(WEEKDAY_KEYS[dow]);
    default:
      return false;
  }
}

export async function getTodayScheduledRoutines(petId: number, date: Date = new Date()): Promise<RoutineApi[]> {
  const all = await listRoutines(petId);
  return all.filter((r) => isRoutineActiveToday(r, date));
}

// ================================================================
// Completions
// ================================================================

export async function getTodayCompletions(petId: number, date?: string): Promise<CompletionApi[]> {
  const d = date || todayIso();
  const res = await listRows<CompletionRow>("routine_completions", {
    filter: {
      pet_id__link_row_has: String(petId),
      completion_date__date_equal: d,
    },
    size: 100,
  });
  return res.results.filter((r) => r.completion_date).map(toCompletionApi);
}

export async function getCompletionsByMonth(petId: number, year: number, month: number): Promise<CompletionApi[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const res = await listRows<CompletionRow>("routine_completions", {
    filter: {
      pet_id__link_row_has: String(petId),
      completion_date__date_after_or_equal: from,
      completion_date__date_before_or_equal: to,
    },
    size: 200,
  });
  return res.results.filter((r) => r.completion_date).map(toCompletionApi);
}

async function findCompletion(petId: number, routineId: number, date: string): Promise<CompletionApi | null> {
  const res = await listRows<CompletionRow>("routine_completions", {
    filter: {
      pet_id__link_row_has: String(petId),
      completion_date__date_equal: date,
    },
    size: 50,
  });
  const row = res.results.find((r) => Number(r.routine_id) === routineId);
  return row ? toCompletionApi(row) : null;
}

// ================================================================
// Streak helpers
// ================================================================

async function findStreakRow(petId: number): Promise<StreakRow | null> {
  const res = await listRows<StreakRow>("routine_streaks", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 1,
  });
  return res.results[0] || null;
}

export async function getStreak(petId: number): Promise<StreakApi> {
  const row = await findStreakRow(petId);
  if (row) return toStreakApi(row);
  // Bootstrap empty streak row for first use (does NOT persist — caller will create on first completion)
  return {
    pet_id: petId,
    current_streak: 0,
    longest_streak: 0,
    total_completions: 0,
    total_points: 0,
    last_completion_date: null,
    streak_freezes_available: MONTHLY_FREEZE_BUDGET,
    badges_earned: [],
    morning_completions: 0,
    evening_completions: 0,
    triple_days_count: 0,
    updated_at: "",
  };
}

async function ensureStreakRow(petId: number): Promise<StreakRow> {
  const existing = await findStreakRow(petId);
  if (existing) return existing;
  return createRow<StreakRow>("routine_streaks", {
    pet_id: [petId],
    current_streak: 0,
    longest_streak: 0,
    total_completions: 0,
    total_points: 0,
    last_completion_date: null,
    streak_freezes_available: MONTHLY_FREEZE_BUDGET,
    badges_earned: JSON.stringify([]),
    morning_completions: 0,
    evening_completions: 0,
    triple_days_count: 0,
    updated_at: new Date().toISOString(),
  });
}

async function persistStreak(petId: number, patch: Record<string, any>): Promise<StreakApi> {
  const row = await ensureStreakRow(petId);
  const updated = await updateRow<StreakRow>("routine_streaks", row.id, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
  return toStreakApi(updated);
}

// ================================================================
// Streak recalculation
// ================================================================

/**
 * Recalculate consecutive-day streak from completions.
 * Streak day = any completion that day with completion_rate >= 50% OR a freeze applied.
 */
export async function recalculateStreak(petId: number): Promise<StreakApi> {
  const existing = await getStreak(petId);
  // Pull last 365 days of completions for streak calc
  const today = todayIso();
  const from = dateAddDays(today, -365);
  const res = await listRows<CompletionRow>("routine_completions", {
    filter: {
      pet_id__link_row_has: String(petId),
      completion_date__date_after_or_equal: from,
    },
    size: 400,
  });
  const completions = res.results.map(toCompletionApi).filter((c) => c.tasks_completion_rate >= STREAK_MIN_COMPLETION_RATE);

  if (completions.length === 0) {
    return persistStreak(petId, { current_streak: 0 });
  }

  // Group by date — any qualifying completion makes the day count
  const dayKeys = new Set<string>();
  for (const c of completions) dayKeys.add(c.completion_date);
  const sortedDays = [...dayKeys].sort((a, b) => b.localeCompare(a)); // DESC

  // Start streak from today (if completed today) or yesterday (still ongoing)
  let streak = 0;
  let cursor = today;
  if (!dayKeys.has(today)) {
    // Allow yesterday as cursor (don't reset if not yet completed today)
    cursor = dateAddDays(today, -1);
    if (!dayKeys.has(cursor)) {
      // Gap of 2+ days — streak broken (unless freeze)
      return persistStreak(petId, { current_streak: 0 });
    }
  }

  for (const d of sortedDays) {
    if (d === cursor) {
      streak++;
      cursor = dateAddDays(cursor, -1);
    } else if (d < cursor) {
      break;
    }
  }

  const longest = Math.max(existing.longest_streak, streak);
  const lastDate = sortedDays[0];

  return persistStreak(petId, {
    current_streak: streak,
    longest_streak: longest,
    last_completion_date: lastDate,
  });
}

// ================================================================
// Log completion + badges + streak update
// ================================================================

export interface LogCompletionResult {
  completion: CompletionApi;
  streak: StreakApi;
  badgesUnlocked: RoutineBadgeId[];
  pointsEarned: number;
}

export async function logCompletion(
  petId: number,
  routineId: number,
  completedTaskIds: string[],
  notes?: string
): Promise<LogCompletionResult> {
  const routine = await getRoutineById(routineId);
  if (!routine) throw Object.assign(new Error("Routine not found"), { status: 404, code: "ROUTINE_NOT_FOUND" });
  if (routine.pet_id !== petId) throw Object.assign(new Error("Routine không thuộc pet này"), { status: 403, code: "FORBIDDEN" });

  const totalTasks = routine.tasks.length;
  const validIds = new Set(routine.tasks.map((t) => t.id));
  const validCompleted = completedTaskIds.filter((id) => validIds.has(id));

  // Compute points (only from completed tasks)
  const pointMap = new Map(routine.tasks.map((t) => [t.id, t.points || 0]));
  const points = validCompleted.reduce((s, id) => s + (pointMap.get(id) || 0), 0);
  const rate = totalTasks > 0 ? Math.round((validCompleted.length / totalTasks) * 100) : 0;
  const today = todayIso();

  // Streak BEFORE this completion (for snapshot)
  const prevStreak = await getStreak(petId);

  // Upsert: check if existing completion for today
  const existing = await findCompletion(petId, routineId, today);
  let completionRow: CompletionRow;
  if (existing) {
    completionRow = await updateRow<CompletionRow>("routine_completions", existing.id, {
      tasks_completed: JSON.stringify(validCompleted),
      tasks_total: totalTasks,
      tasks_completion_rate: rate,
      points_earned: points,
      streak_count_at_time: prevStreak.current_streak,
      completed_at: new Date().toISOString(),
      notes: notes || null,
    });
  } else {
    completionRow = await createRow<CompletionRow>("routine_completions", {
      pet_id: [petId],
      routine_id: routineId,
      completion_date: today,
      tasks_completed: JSON.stringify(validCompleted),
      tasks_total: totalTasks,
      tasks_completion_rate: rate,
      points_earned: points,
      streak_count_at_time: prevStreak.current_streak,
      completed_at: new Date().toISOString(),
      notes: notes || null,
    });
  }
  const completion = toCompletionApi(completionRow);

  // Recalculate streak (will count today if rate >= 50%)
  const newStreak = await recalculateStreak(petId);

  // Update lifetime counters + time-of-day counters
  const [hour] = (routine.start_time || "12:00").split(":").map(Number);
  const isMorning = !Number.isNaN(hour) && hour < 9;
  const isEvening = !Number.isNaN(hour) && hour >= 18;

  // Was this routine previously completed (rate>=50) today? If yes, don't double-count lifetime
  const wasPerfectBefore = existing && existing.tasks_completion_rate >= STREAK_MIN_COMPLETION_RATE;
  const isPerfectNow = rate >= STREAK_MIN_COMPLETION_RATE;
  const incCompletions = !existing ? 1 : (!wasPerfectBefore && isPerfectNow ? 1 : 0);
  const incPoints = points - (existing?.points_earned || 0);
  const incMorning = isMorning && isPerfectNow && !wasPerfectBefore ? 1 : 0;
  const incEvening = isEvening && isPerfectNow && !wasPerfectBefore ? 1 : 0;

  // Check if today has 3+ routines completed (qualifying) — for triple_days counter
  const todayCompletions = await getTodayCompletions(petId, today);
  const qualifyingToday = todayCompletions.filter((c) => c.tasks_completion_rate >= STREAK_MIN_COMPLETION_RATE);
  const isTripleToday = qualifyingToday.length >= 3;
  // Only bump triple count once per day — check if streak row's triple_days_count covered today
  const row = await ensureStreakRow(petId);
  const updatedRow = await updateRow<StreakRow>("routine_streaks", row.id, {
    total_completions: (Number(row.total_completions) || 0) + incCompletions,
    total_points: (Number(row.total_points) || 0) + Math.max(0, incPoints),
    morning_completions: (Number(row.morning_completions) || 0) + incMorning,
    evening_completions: (Number(row.evening_completions) || 0) + incEvening,
    // Only bump triple counter if this is the routine that pushed it to 3 (first time today)
    triple_days_count: (isTripleToday && qualifyingToday.length === 3 ? (Number(row.triple_days_count) || 0) + 1 : (Number(row.triple_days_count) || 0)),
    updated_at: new Date().toISOString(),
  });
  const fullStreak = toStreakApi(updatedRow);

  // Check badges
  const badgesUnlocked = await checkAndUnlockBadges(petId, fullStreak, newStreak);
  const finalStreak = badgesUnlocked.length > 0 ? await getStreak(petId) : newStreak;

  return {
    completion,
    streak: finalStreak,
    badgesUnlocked,
    pointsEarned: points,
  };
}

// ================================================================
// Badge unlock
// ================================================================

async function checkAndUnlockBadges(petId: number, streakInfo: StreakApi, recalc: StreakApi): Promise<RoutineBadgeId[]> {
  const already = new Set(streakInfo.badges_earned);
  const newly: RoutineBadgeId[] = [];

  if (!already.has("starter") && streakInfo.total_completions >= 1) newly.push("starter");
  if (!already.has("week_warrior") && recalc.current_streak >= 7) newly.push("week_warrior");
  if (!already.has("month_master") && recalc.current_streak >= 30) newly.push("month_master");
  if (!already.has("century") && recalc.current_streak >= 100) newly.push("century");
  if (!already.has("early_bird") && streakInfo.morning_completions >= 30) newly.push("early_bird");
  if (!already.has("night_owl") && streakInfo.evening_completions >= 30) newly.push("night_owl");
  if (!already.has("triple_crown") && streakInfo.triple_days_count >= 7) newly.push("triple_crown");
  // perfectionist: earned on any single 100% completion
  // (we approximate by looking at the latest completion row — defer to caller if needed)

  if (newly.length === 0) return [];

  const merged = [...streakInfo.badges_earned, ...newly];
  const row = await ensureStreakRow(petId);
  await updateRow("routine_streaks", row.id, {
    badges_earned: JSON.stringify(merged),
    updated_at: new Date().toISOString(),
  });
  return newly;
}

/** Award perfectionist badge on a single 100% completion. */
export async function maybeUnlockPerfectionist(petId: number, rate: number): Promise<RoutineBadgeId[]> {
  if (rate < 100) return [];
  const streak = await getStreak(petId);
  if (streak.badges_earned.includes("perfectionist")) return [];
  const merged = [...streak.badges_earned, "perfectionist" as RoutineBadgeId];
  const row = await ensureStreakRow(petId);
  await updateRow("routine_streaks", row.id, {
    badges_earned: JSON.stringify(merged),
    updated_at: new Date().toISOString(),
  });
  return ["perfectionist"];
}

// ================================================================
// Streak freeze
// ================================================================

export async function useStreakFreeze(petId: number): Promise<{ ok: boolean; remaining: number }> {
  const row = await ensureStreakRow(petId);
  const remaining = Number(row.streak_freezes_available ?? MONTHLY_FREEZE_BUDGET);
  if (remaining <= 0) return { ok: false, remaining: 0 };
  // Manual freeze: bump streak by 1 and record fake last_completion_date as today
  const newRemaining = remaining - 1;
  const newCurrent = Math.max(1, Number(row.current_streak) + 1);
  const newLongest = Math.max(Number(row.longest_streak), newCurrent);
  await updateRow("routine_streaks", row.id, {
    streak_freezes_available: newRemaining,
    current_streak: newCurrent,
    longest_streak: newLongest,
    last_completion_date: todayIso(),
    updated_at: new Date().toISOString(),
  });
  return { ok: true, remaining: newRemaining };
}

/** Monthly cron: refill freezes for ALL streak rows. */
export async function refillAllFreezes(): Promise<number> {
  const res = await listRows<StreakRow>("routine_streaks", { size: 200 });
  let count = 0;
  for (const row of res.results) {
    if (!row.id) continue;
    try {
      await updateRow("routine_streaks", row.id, {
        streak_freezes_available: MONTHLY_FREEZE_BUDGET,
        updated_at: new Date().toISOString(),
      });
      count++;
    } catch (err) {
      console.error(`[routines] refill freeze pet=${row.id} failed:`, err);
    }
  }
  return count;
}

// ================================================================
// Bulk queries (for cron jobs)
// ================================================================

export async function listAllActiveRoutinesForReminders(): Promise<RoutineApi[]> {
  const all: RoutineApi[] = [];
  let page = 1;
  while (true) {
    const res = await listRows<RoutineRow>("routines", {
      filter: { active__boolean: "true", push_reminder__boolean: "true" },
      size: 200,
      page,
    });
    all.push(...res.results.filter((r) => r.name).map(toRoutineApi));
    if (!res.next) break;
    page++;
  }
  return all;
}

/** For end-of-day warning job. Returns pets that have an active streak. */
export async function listAllStreaks(): Promise<StreakApi[]> {
  const res = await listRows<StreakRow>("routine_streaks", { size: 200 });
  return res.results.filter((r) => r.id && Number(r.current_streak) > 0).map(toStreakApi);
}
