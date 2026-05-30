/**
 * Routine reminder cron jobs (M19).
 *
 * Job 7: every 15 min — fire push 15 min before start_time
 * Job 8: monthly 1st 00:00 — refill streak freezes
 * Job 9: daily 23:55 — warn streak holders who haven't completed today
 */
import { listRows, getRow } from "@shared/baserow.ts";
import {
  listAllActiveRoutinesForReminders,
  listAllStreaks,
  getTodayCompletions,
  getTodayScheduledRoutines,
  isRoutineActiveToday,
  refillAllFreezes,
  type RoutineApi,
} from "./routines.ts";
import { sendPush } from "./web-push.ts";

interface PetOwnerLink {
  id: number;
  name: string;
  user_id?: Array<{ id: number; value: string }>;
}

interface UserPushRow {
  id: number;
  push_subscription?: string | null;
}

/** Cache user push subs for the run to avoid N+1. */
async function loadUserPushMap(userIds: number[]): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  if (userIds.length === 0) return map;
  // Pull users in chunks via getRow (Baserow doesn't accept array filter cleanly)
  for (const uid of userIds) {
    try {
      const u = await getRow<UserPushRow>("users", uid);
      map.set(uid, u.push_subscription || null);
    } catch (_) {
      map.set(uid, null);
    }
  }
  return map;
}

// Dedupe sent reminders within a single process — by routine_id + day
const sentReminders = new Set<string>();

/** Job 7 — 15-min push before routine start_time. */
export async function runRoutineReminderJob(): Promise<{ checked: number; sent: number; errors: number }> {
  const report = { checked: 0, sent: 0, errors: 0 };
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Local hour:min in Asia/Ho_Chi_Minh
  const TZ = process.env.TZ || "Asia/Ho_Chi_Minh";

  let routines: RoutineApi[] = [];
  try {
    routines = await listAllActiveRoutinesForReminders();
  } catch (err) {
    console.error("[routine-reminder] load routines failed:", err);
    return { ...report, errors: 1 };
  }

  // Cleanup stale dedup entries (older than 2 days)
  for (const key of sentReminders) {
    if (!key.includes(today) && !key.includes(yesterdayKey())) sentReminders.delete(key);
  }

  // Map routines → pets → owners
  const petIds = [...new Set(routines.map((r) => r.pet_id))];
  const petMap = new Map<number, PetOwnerLink>();
  for (const pid of petIds) {
    try {
      const pet = await getRow<PetOwnerLink>("pets", pid);
      petMap.set(pid, pet);
    } catch (_) {}
  }
  const userIds = [...new Set([...petMap.values()].flatMap((p) => (p.user_id || []).map((u) => u.id)))];
  const userMap = await loadUserPushMap(userIds);

  for (const routine of routines) {
    report.checked++;
    if (!isRoutineActiveToday(routine, now)) continue;

    const dedupKey = `${routine.id}-${today}`;
    if (sentReminders.has(dedupKey)) continue;

    const [h, m] = routine.start_time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;

    // Compute local time in TZ
    const localHm = nowLocalHm(TZ);
    const routineMinutes = h * 60 + m;
    const nowMinutes = localHm.hour * 60 + localHm.minute;
    const diff = routineMinutes - nowMinutes;

    // Fire when 14 < diff <= 15 (one-shot window)
    if (diff <= 14 || diff > 15) continue;

    const pet = petMap.get(routine.pet_id);
    if (!pet) continue;
    const ownerId = (pet.user_id || [])[0]?.id;
    if (!ownerId) continue;
    const sub = userMap.get(ownerId);
    if (!sub) {
      sentReminders.add(dedupKey);
      continue;
    }

    try {
      const result = await sendPush(
        ownerId,
        sub,
        {
          title: `${routine.icon} ${routine.name}`,
          body: `Còn 15 phút — bé ${pet.name} đã sẵn sàng chưa?`,
          icon: "/favicon.svg",
          data: { url: `/pets/${routine.pet_id}/routines`, routine_id: routine.id },
        },
        { type: "routine_reminder" }
      );
      if (result.ok) report.sent++;
      sentReminders.add(dedupKey);
    } catch (err) {
      console.error(`[routine-reminder] push fail routine=${routine.id}:`, err);
      report.errors++;
    }
  }

  return report;
}

/** Job 8 — refill streak freezes on day 1. */
export async function runFreezeRefillJob(): Promise<{ refilled: number }> {
  try {
    const count = await refillAllFreezes();
    console.log(`[freeze-refill] refilled ${count} pets`);
    return { refilled: count };
  } catch (err) {
    console.error("[freeze-refill] error:", err);
    return { refilled: 0 };
  }
}

/** Job 9 — end-of-day warning for streak holders. */
export async function runEndOfDayStreakWarnJob(): Promise<{ checked: number; warned: number }> {
  const report = { checked: 0, warned: 0 };
  let streaks;
  try {
    streaks = await listAllStreaks();
  } catch (err) {
    console.error("[eod-warn] load streaks failed:", err);
    return report;
  }

  // For each pet with streak >=3, check if today has any qualifying completion
  for (const s of streaks) {
    report.checked++;
    if (s.current_streak < 3) continue;

    try {
      const [scheduled, completions] = await Promise.all([
        getTodayScheduledRoutines(s.pet_id),
        getTodayCompletions(s.pet_id),
      ]);
      if (scheduled.length === 0) continue;
      const qualifying = completions.filter((c) => c.tasks_completion_rate >= 50);
      if (qualifying.length > 0) continue;

      // Load pet + owner
      const pet = await getRow<PetOwnerLink>("pets", s.pet_id).catch(() => null);
      if (!pet) continue;
      const ownerId = (pet.user_id || [])[0]?.id;
      if (!ownerId) continue;
      const owner = await getRow<UserPushRow>("users", ownerId).catch(() => null);
      if (!owner?.push_subscription) continue;

      const r = await sendPush(
        ownerId,
        owner.push_subscription,
        {
          title: `⚠️ Sắp mất streak ${s.current_streak} ngày!`,
          body: `Còn 5 phút — tick routine để giữ streak cho bé ${pet.name} nhé`,
          icon: "/favicon.svg",
          data: { url: `/pets/${s.pet_id}/routines`, pet_id: s.pet_id },
        },
        { type: "routine_reminder" }
      );
      if (r.ok) report.warned++;
    } catch (err) {
      console.error(`[eod-warn] pet ${s.pet_id} failed:`, err);
    }
  }
  return report;
}

// ============ helpers ============

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nowLocalHm(tz: string): { hour: number; minute: number } {
  // Use Intl.DateTimeFormat for timezone-aware hour/minute
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
    return { hour: hour % 24, minute };
  } catch {
    const d = new Date();
    return { hour: d.getHours(), minute: d.getMinutes() };
  }
}
