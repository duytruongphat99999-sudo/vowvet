/**
 * Manual trigger scheduler jobs (cho test).
 *
 * Run from host:
 *   bun run scripts/run-scheduler-now.ts [job]
 *
 * Args:
 *   daily     → runDailyForecastJob (M5)
 *   vaccines  → runVaccineRemindersJob (M6)
 *   hourly    → runHourlySevereWatchJob (M5)
 *   cleanup   → runCleanupJob (M5)
 *   all       → run cả 4 sequentially
 */
import {
  runDailyForecastJob,
  runHourlySevereWatchJob,
  runCleanupJob,
} from "../api/src/lib/scheduler-jobs.ts";
import { runVaccineRemindersJob } from "../api/src/lib/vaccine-reminders.ts";

const job = (process.argv[2] || "daily").toLowerCase();

console.log(`[run-scheduler-now] job=${job}\n`);

if (job === "daily" || job === "all") {
  console.log("--- DAILY FORECAST JOB (M5) ---");
  await runDailyForecastJob();
}
if (job === "vaccines" || job === "all") {
  console.log("\n--- VACCINE REMINDERS JOB (M6) ---");
  await runVaccineRemindersJob();
}
if (job === "hourly" || job === "all") {
  console.log("\n--- HOURLY SEVERE WATCH (M5) ---");
  await runHourlySevereWatchJob();
}
if (job === "cleanup" || job === "all") {
  console.log("\n--- CLEANUP JOB (M5) ---");
  await runCleanupJob();
}
if (!["daily", "vaccines", "hourly", "cleanup", "all"].includes(job)) {
  console.error("❌ Unknown job. Use: daily | vaccines | hourly | cleanup | all");
  process.exit(1);
}

console.log("\n✅ Done.");
