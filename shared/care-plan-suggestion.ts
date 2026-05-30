/**
 * Care Plan Suggestion + Progress helpers (pure logic, no DB).
 *
 * Powers the 3-layer Care Plan UX:
 *   - Layer 1: "Bây giờ làm gì?" hero — picks the most relevant task
 *     based on current VN local time (urgent / upcoming / overdue / all_done).
 *   - Layer 2: per-category progress (feeding / exercise / monitoring).
 *
 * Pure functions — same input always yields same output. Safe to import
 * from both API (Bun) and Web (Astro SSR) without bundling concerns.
 *
 * Brand-safe: NO `text-vv-gold` (token doesn't exist); urgency_color is a
 * symbolic key ("gold" / "red" / "emerald" / "gray") that the UI maps to
 * real Tailwind classes — keeping the color contract explicit and centralized.
 */

export type CarePlanTaskType = "feeding" | "exercise" | "monitoring";

export interface CarePlanTask {
  /** Stable key matching server-side item_key (e.g. "feeding_07_00"). */
  key: string;
  /** HH:MM 24h time string from the AI care-plan. */
  time: string;
  /** Friendly Vietnamese description shown to user (1 line). */
  description: string;
  /** Optional second-line context (reason / location / duration). */
  note?: string;
  type: CarePlanTaskType;
  completed: boolean;
}

export type SuggestionStatus =
  | "urgent"      // task within ±60 minutes — primary CTA
  | "upcoming"    // next task is >60 minutes in the future
  | "overdue"     // past task >60 minutes ago, still actionable
  | "all_done"    // every task today completed
  | "starting";   // no tasks yet (care plan generating)

export type UrgencyColor = "red" | "gold" | "gray" | "emerald";

export interface CurrentSuggestion {
  status: SuggestionStatus;
  task: CarePlanTask | null;
  /** Signed minutes from now: positive = future, negative = past. */
  diff_minutes: number;
  /** Human-readable VN status ("Còn 12 phút", "Trễ 1h — vẫn nên làm", …). */
  message: string;
  /** CTA label for the primary button. Empty when nothing to do. */
  cta_label: string;
  urgency_color: UrgencyColor;
}

export interface ProgressByCategory {
  completed: number;
  total: number;
}

export interface TodayProgress {
  completed: number;
  total: number;
  percent: number;
  by_category: Record<CarePlanTaskType, ProgressByCategory>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseHHMM(time: string): number {
  // Returns minutes-from-midnight, or NaN if malformed.
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return NaN;
  return h * 60 + mm;
}

function ctaLabelFor(type: CarePlanTaskType): string {
  switch (type) {
    case "feeding":    return "Đã cho ăn";
    case "exercise":   return "Đã chơi với bé";
    case "monitoring": return "Đã kiểm tra";
    default:           return "Đã làm";
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Picks the most relevant task for "right now" based on local clock.
 *
 * Selection rules (priority order):
 *   1. URGENT — any incomplete task within ±60 min (closest absolute diff wins)
 *   2. OVERDUE — incomplete task >60 min in the past (most-recent wins)
 *   3. UPCOMING — incomplete task >60 min in the future (closest wins)
 *   4. ALL_DONE — every task in the list is marked completed
 *   5. STARTING — empty task list (plan still generating)
 *
 * @param tasks Flat list of all today's tasks across categories.
 * @param now Override clock — useful for testing. Defaults to `new Date()`.
 */
export function getCurrentSuggestion(
  tasks: CarePlanTask[],
  now: Date = new Date()
): CurrentSuggestion {
  if (!tasks || tasks.length === 0) {
    return {
      status: "starting",
      task: null,
      diff_minutes: 0,
      message: "Care Plan đang chuẩn bị…",
      cta_label: "",
      urgency_color: "gray",
    };
  }

  const allCompleted = tasks.every((t) => t.completed);
  if (allCompleted) {
    return {
      status: "all_done",
      task: null,
      diff_minutes: 0,
      message: "Hoàn thành 100% hôm nay — Trifecta +30đ đã cộng vào Pet Score.",
      cta_label: "Xem Pet Score",
      urgency_color: "emerald",
    };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let urgent: CarePlanTask | null = null;
  let upcoming: CarePlanTask | null = null;
  let overdue: CarePlanTask | null = null;
  let urgentBestAbs = Infinity;
  let upcomingBestDiff = Infinity;
  let overdueBestDiff = -Infinity;
  let urgentDiff = 0;
  let upcomingDiff = 0;
  let overdueDiff = 0;

  for (const task of tasks) {
    if (task.completed) continue;
    const taskMinutes = parseHHMM(task.time);
    if (Number.isNaN(taskMinutes)) continue;
    const diff = taskMinutes - nowMinutes;
    const absDiff = Math.abs(diff);

    if (absDiff <= 60) {
      if (absDiff < urgentBestAbs) {
        urgent = task;
        urgentBestAbs = absDiff;
        urgentDiff = diff;
      }
    } else if (diff > 60) {
      if (diff < upcomingBestDiff) {
        upcoming = task;
        upcomingBestDiff = diff;
        upcomingDiff = diff;
      }
    } else if (diff < -60) {
      if (diff > overdueBestDiff) {
        overdue = task;
        overdueBestDiff = diff;
        overdueDiff = diff;
      }
    }
  }

  if (urgent) {
    const minsLeft = Math.abs(urgentDiff);
    const isPast = urgentDiff < 0;
    return {
      status: "urgent",
      task: urgent,
      diff_minutes: urgentDiff,
      message: isPast
        ? `Trễ ${minsLeft} phút — vẫn làm được`
        : minsLeft === 0
          ? "Đúng giờ rồi"
          : `Còn ${minsLeft} phút`,
      cta_label: ctaLabelFor(urgent.type),
      urgency_color: "gold",
    };
  }

  if (overdue) {
    const minsPast = Math.abs(overdueDiff);
    const hoursPast = Math.floor(minsPast / 60);
    const mins = minsPast % 60;
    const msg = hoursPast > 0
      ? `Trễ ${hoursPast}h${mins ? ` ${mins}p` : ""} — vẫn nên làm`
      : `Trễ ${mins} phút — vẫn nên làm`;
    return {
      status: "overdue",
      task: overdue,
      diff_minutes: overdueDiff,
      message: msg,
      cta_label: ctaLabelFor(overdue.type),
      urgency_color: "red",
    };
  }

  if (upcoming) {
    const hours = Math.floor(upcomingDiff / 60);
    const mins = upcomingDiff % 60;
    return {
      status: "upcoming",
      task: upcoming,
      diff_minutes: upcomingDiff,
      message: hours > 0 ? `Còn ${hours}h${mins ? ` ${mins}p` : ""}` : `Còn ${mins} phút`,
      cta_label: "Sẵn sàng?",
      urgency_color: "gray",
    };
  }

  // Should not reach — but defensive fallback.
  return {
    status: "starting",
    task: null,
    diff_minutes: 0,
    message: "Care Plan đang chuẩn bị…",
    cta_label: "",
    urgency_color: "gray",
  };
}

/**
 * Compute total + per-category completion stats.
 *
 * @param tasks Flat list across categories (feeding / exercise / monitoring).
 */
export function calculateTodayProgress(tasks: CarePlanTask[]): TodayProgress {
  const byCategory: Record<CarePlanTaskType, ProgressByCategory> = {
    feeding:    { completed: 0, total: 0 },
    exercise:   { completed: 0, total: 0 },
    monitoring: { completed: 0, total: 0 },
  };

  for (const task of tasks) {
    const cat = task.type as CarePlanTaskType;
    if (!byCategory[cat]) continue;
    byCategory[cat].total++;
    if (task.completed) byCategory[cat].completed++;
  }

  const completed = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent, by_category: byCategory };
}
