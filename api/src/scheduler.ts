// node-cron scheduler bootstrap cho VowVet.
//
// Schedules (timezone Asia/Ho_Chi_Minh):
//   Job 1:  cron '0 7 * * *'      — daily 7AM forecast (M5)
//   Job 2:  cron '0 8 * * *'      — daily 8AM vaccine reminders (M6)
//   Job 3:  cron '0 * * * *'      — hourly severe weather watch (M5)
//   Job 4:  cron '0 3 * * 0'      — Sunday 3AM cleanup (M5)
//   Job 5:  cron 'every-30-min'   — SLA breach check (M10)
//   Job 6:  cron '30 8 * * *'     — daily 8:30AM birthday reminders (M11)
//   Job 7:  cron 'every-15-min'   — routine reminders (M19)
//   Job 8:  cron '0 0 1 * *'      — monthly day-1 00:00 refill streak freezes (M19)
//   Job 9:  cron '55 23 * * *'    — daily 23:55 EOD streak warning (M19)
//   Job 10: cron 'every 6 hours'  — expire pending playdate matches (M27)
//   Job 11: cron '0 9 * * *'      — daily 9AM memorial anniversary reminders (M30)
//   Job 12: cron 'every 2h 7-21'  — smart nudges (Session B)
//   Job 13: cron '0 7 * * *'      — assign daily quests (Session B) (runs alongside Job 1, no conflict)
//   Job 14: cron '0 1 1 * *'      — monthly Pet Score leaderboard snapshot, day-1 1AM (Session B)
//
// IMPORTANT: do NOT write cron expressions containing the "*/N" prefix inside any
// /** ... */ JSDoc block — the "*/" sequence terminates the comment early and breaks
// the file. Use line comments (//) here, or paraphrase as "every-N-min" above. The
// actual cron strings are inside cron.schedule(...) calls below where they are safe.

import cron from "node-cron";
import { runDailyForecastJob, runHourlySevereWatchJob, runCleanupJob } from "./lib/scheduler-jobs.ts";
import { runVaccineRemindersJob } from "./lib/vaccine-reminders.ts";
import { runCarePlanRemindersJob } from "./lib/care-plan-reminders.ts";
import { runBirthdayReminderJob } from "./lib/birthday-events.ts";
import { runRoutineReminderJob, runFreezeRefillJob, runEndOfDayStreakWarnJob } from "./lib/routine-reminders.ts";
import { runAnniversaryReminderJob } from "./lib/memorial-reminders.ts";
import { runPlaydateExpiryJob } from "./lib/playdate-expiry.ts";
import { runDueNudges } from "./lib/nudges.ts";
import { assignDailyQuestsForAllPets } from "./lib/daily-quests.ts";
import { generateMonthlySnapshot } from "./lib/pet-leaderboard.ts";
import { checkSlaBreaches } from "./lib/analytics.ts";
import { findUserByPhone } from "./lib/users.ts";
import { sendPush } from "./lib/web-push.ts";

const ADMIN_PHONES_SLA = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);

const TZ = process.env.TZ || "Asia/Ho_Chi_Minh";

let initialized = false;

export function initScheduler(): void {
  if (initialized) return;
  if (process.env.SCHEDULER_DISABLED === "1") {
    console.log("[scheduler] DISABLED via SCHEDULER_DISABLED=1");
    return;
  }

  console.log(`[scheduler] init (TZ=${TZ})`);

  // Job 1: Daily 7AM weather forecast
  cron.schedule(
    "0 7 * * *",
    async () => {
      try {
        await runDailyForecastJob();
      } catch (err) {
        console.error("[scheduler] daily job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 2 (M6): Daily 8AM vaccine reminders
  cron.schedule(
    "0 8 * * *",
    async () => {
      try {
        await runVaccineRemindersJob();
      } catch (err) {
        console.error("[scheduler] vaccine reminders error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 2.5 (Phase 4D): Daily 7:15AM care plan reminder
  // 15 min after runDailyForecastJob (which may invalidate care plan caches
  // when severe weather is detected). Same Baserow-burst-avoidance pattern
  // used by birthday at 8:30 (after vaccine at 8:00).
  cron.schedule(
    "15 7 * * *",
    async () => {
      try {
        await runCarePlanRemindersJob();
      } catch (err) {
        console.error("[scheduler] care plan reminders error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 3: Hourly severe watch (at top of each hour)
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        await runHourlySevereWatchJob();
      } catch (err) {
        console.error("[scheduler] hourly job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 4: Cleanup Sunday 3AM
  cron.schedule(
    "0 3 * * 0",
    async () => {
      try {
        await runCleanupJob();
      } catch (err) {
        console.error("[scheduler] cleanup job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 6 (M11): Daily 8:30AM birthday reminders (30s after vaccine job to avoid Baserow burst)
  cron.schedule(
    "30 8 * * *",
    async () => {
      try {
        await runBirthdayReminderJob();
      } catch (err) {
        console.error("[scheduler] birthday reminder job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 5 (M10/Pilot): SLA breach check mỗi 30 phút
  // Threads chờ vet >2h → push notification cho admin(s)
  cron.schedule(
    "*/30 * * * *",
    async () => {
      try {
        await runSlaBreachJob();
      } catch (err) {
        console.error("[scheduler] SLA breach job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 7 (M19): Routine reminder mỗi 15 phút
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        await runRoutineReminderJob();
      } catch (err) {
        console.error("[scheduler] routine reminder job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 8 (M19): Refill streak freezes ngày 1 mỗi tháng
  cron.schedule(
    "0 0 1 * *",
    async () => {
      try {
        await runFreezeRefillJob();
      } catch (err) {
        console.error("[scheduler] freeze refill job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 9 (M19): EOD warning 23:55 cho streak holders chưa complete
  cron.schedule(
    "55 23 * * *",
    async () => {
      try {
        await runEndOfDayStreakWarnJob();
      } catch (err) {
        console.error("[scheduler] EOD streak warn job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 11 (M30): Daily 9AM memorial anniversary reminders
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        await runAnniversaryReminderJob();
      } catch (err) {
        console.error("[scheduler] anniversary reminder job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 10 (M27): every 6 hours expire pending playdate matches with no chat
  cron.schedule(
    "0 */6 * * *",
    async () => {
      try {
        await runPlaydateExpiryJob();
      } catch (err) {
        console.error("[scheduler] playdate expiry job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 12 (Session B): Smart nudges every 2h within waking window (7am-9pm)
  // Runs at 7,9,11,13,15,17,19,21 — node-cron handles list syntax
  cron.schedule(
    "0 7,9,11,13,15,17,19,21 * * *",
    async () => {
      try {
        const r = await runDueNudges();
        if (r.sent > 0) console.log(`[scheduler] nudges: scanned=${r.scanned} sent=${r.sent}`);
      } catch (err) {
        console.error("[scheduler] nudges job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 13 (Session B): Assign daily quests 7:05 AM (5 min after Job 1 to avoid Baserow burst)
  cron.schedule(
    "5 7 * * *",
    async () => {
      try {
        const r = await assignDailyQuestsForAllPets();
        console.log(`[scheduler] daily quests assigned=${r.assigned} skipped=${r.skipped}`);
      } catch (err) {
        console.error("[scheduler] daily quests job error:", err);
      }
    },
    { timezone: TZ }
  );

  // Job 14 (Session B): Monthly leaderboard snapshot (1st of month, 1AM)
  cron.schedule(
    "0 1 1 * *",
    async () => {
      try {
        const r = await generateMonthlySnapshot();
        console.log(`[scheduler] monthly snapshot inserted=${r.inserted}`);
      } catch (err) {
        console.error("[scheduler] monthly snapshot job error:", err);
      }
    },
    { timezone: TZ }
  );

  initialized = true;
  console.log("[scheduler] 15 jobs scheduled");
}

/**
 * Job 5: SLA breach scan.
 * Lấy threads waiting_vet >2h, gửi push cho admin(s).
 * KHÔNG re-notify cho thread đã alert trước đó (deduped by in-memory Set per process).
 */
const slaAlertedThreads = new Set<number>();

export async function runSlaBreachJob(): Promise<void> {
  console.log("[scheduler] SLA breach scan start");
  const breaches = await checkSlaBreaches(120);
  if (breaches.length === 0) {
    console.log("[scheduler] SLA breach scan: 0 breaches");
    return;
  }

  // Filter — only new breaches (chưa alert trong process này)
  const newBreaches = breaches.filter((b) => !slaAlertedThreads.has(b.thread_id));
  if (newBreaches.length === 0) {
    console.log(`[scheduler] SLA breach scan: ${breaches.length} breaches, all already alerted`);
    return;
  }

  // Build push message
  const summary =
    newBreaches.length === 1
      ? `Thread "${newBreaches[0].subject}" chờ ${newBreaches[0].waiting_minutes} phút`
      : `${newBreaches.length} thread chờ vet >2h`;

  for (const adminPhone of ADMIN_PHONES_SLA) {
    try {
      const admin = await findUserByPhone(adminPhone);
      if (!admin) continue;
      const sub = (admin as any).push_subscription;
      if (!sub) {
        console.log(`[scheduler] SLA: admin ${adminPhone} no push subscription, skip`);
        continue;
      }
      await sendPush(
        admin.id,
        sub,
        {
          title: `⏰ SLA BREACH: ${newBreaches.length} thread chờ vet`,
          body: summary,
          data: { url: "/admin", sla: true },
        },
        { type: "alert_push", bypassRateLimit: true }
      );
      console.log(`[scheduler] SLA breach push sent to admin ${adminPhone} (${newBreaches.length} threads)`);
    } catch (err) {
      console.error(`[scheduler] SLA breach push fail admin=${adminPhone}:`, err);
    }
  }

  // Mark as alerted
  for (const b of newBreaches) slaAlertedThreads.add(b.thread_id);

  // Cleanup memory: nếu set >100 entries, reset (admin đã thấy rồi)
  if (slaAlertedThreads.size > 100) {
    slaAlertedThreads.clear();
  }
}
