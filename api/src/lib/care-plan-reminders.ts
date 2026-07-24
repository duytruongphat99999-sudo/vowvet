/**
 * Care Plan daily reminder cron job (Phase 4D — FINAL deferred feature).
 *
 * Runs daily 7:15 AM Asia/Ho_Chi_Minh — 15 minutes after `runDailyForecastJob`
 * (which also runs at 7:00 and may invalidate care plan caches when severe
 * weather is detected). The 15-minute offset gives forecast time to finish +
 * any care-plan-affected caches to be flushed before this reminder fires.
 *
 * Mirrors `vaccine-reminders.ts` pattern exactly:
 *   - listRows("users", size: 200) → iterate
 *   - parsePrefs(user.notification_preferences) — respects per-user toggle
 *   - hasPushAndPref gate (has push_subscription + prefs.care_plan_reminders)
 *   - Fetch pets via user_id__link_row_has (link_row filter)
 *   - **One push per user** (not per-pet) to avoid spam:
 *       single pet  → "Bé {name} cần Care Plan hôm nay"
 *       multi-pet   → "Bé {firstName} + {N-1} bé khác cần Care Plan"
 *   - Deep link: /pets/{id}/care-plan (single) or /dashboard (multi, user picks)
 *   - sendPush type "care_plan_reminder" (registered in web-push.ts type union)
 *   - Returns CarePlanReminderReport for admin trigger endpoint
 *
 * Does NOT pre-generate care plans — that's expensive (Gemini call per pet)
 * and unnecessary; the dashboard / /care-plan page auto-generates on first view
 * with cache-or-generate via the existing v2 endpoint.
 */
import { listRows } from "@shared/baserow.ts";
import { sendPush } from "./web-push.ts";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@shared/zod-schemas/m5.ts";

interface UserRow {
  id: number;
  phone?: string;
  push_subscription?: string | null;
  notification_preferences?: string | null;
  deleted_at?: string | null;
}

interface PetRow {
  id: number;
  name: string;
  user_id?: Array<{ id: number; value: string }>;
}

function parsePrefs(raw: string | null | undefined): NotificationPreferences {
  if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export interface CarePlanReminderReport {
  users_processed: number;
  users_skipped_pref_off: number;
  users_skipped_no_push: number;
  users_skipped_no_pet: number;
  pushes_sent: number;
  pushes_skipped: number;
  errors: number;
  duration_ms: number;
}

/** Build the one-per-user push payload (single vs multi-pet copy). */
function buildPush(pets: PetRow[]): { title: string; body: string; url: string } {
  if (pets.length === 1) {
    const p = pets[0];
    return {
      title: `${p.name} - Care Plan hôm nay`,
      body: `Bé ${p.name} cần làm 3 việc hôm nay. Tap để xem.`,
      url: `/pets/${p.id}/care-plan`,
    };
  }
  // Multi-pet: name the first + count of others
  const first = pets[0];
  const othersCount = pets.length - 1;
  return {
    title: `${pets.length} bé - Care Plan hôm nay`,
    body: `Bé ${first.name} + ${othersCount} bé khác cần Care Plan hôm nay.`,
    url: "/dashboard",
  };
}

/**
 * Main job — called by scheduler at 7:15 AM VN daily, plus admin test trigger.
 */
export async function runCarePlanRemindersJob(): Promise<CarePlanReminderReport> {
  const t0 = Date.now();
  const report: CarePlanReminderReport = {
    users_processed: 0,
    users_skipped_pref_off: 0,
    users_skipped_no_push: 0,
    users_skipped_no_pet: 0,
    pushes_sent: 0,
    pushes_skipped: 0,
    errors: 0,
    duration_ms: 0,
  };

  console.log("[care-plan-reminders] start");

  let users: UserRow[];
  try {
    const res = await listRows<UserRow>("users", { size: 200 });
    users = res.results;
  } catch (err) {
    console.error("[care-plan-reminders] load users failed:", err);
    report.errors++;
    report.duration_ms = Date.now() - t0;
    return report;
  }

  for (const user of users) {
    // Skip soft-deleted users
    if (user.deleted_at) continue;

    report.users_processed++;
    try {
      const prefs = parsePrefs(user.notification_preferences);
      if (!prefs.care_plan_reminders) {
        report.users_skipped_pref_off++;
        continue;
      }
      if (!user.push_subscription) {
        report.users_skipped_no_push++;
        continue;
      }

      // Fetch pets for this user (link_row filter)
      const petsRes = await listRows<PetRow>("pets", {
        filter: { user_id__link_row_has: String(user.id), deleted_at__empty: "" },
        size: 50,
      });
      const pets = petsRes.results;
      if (pets.length === 0) {
        report.users_skipped_no_pet++;
        continue;
      }

      // One push per user (single payload describes 1 or N pets)
      const payload = buildPush(pets);
      const result = await sendPush(
        user.id,
        user.push_subscription,
        {
          title: payload.title,
          body: payload.body,
          icon: "/favicon.svg",
          data: { url: payload.url, pet_count: pets.length, first_pet_id: pets[0].id },
        },
        { type: "care_plan_reminder" }
      );
      if (result.ok) report.pushes_sent++;
      else report.pushes_skipped++;
    } catch (err) {
      console.error(`[care-plan-reminders] user ${user.id} failed:`, err);
      report.errors++;
    }
  }

  report.duration_ms = Date.now() - t0;
  console.log("[care-plan-reminders] done:", report);
  return report;
}
