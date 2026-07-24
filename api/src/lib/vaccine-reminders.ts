/**
 * Vaccine reminder cron job (M6).
 * Run daily 8AM: query scheduled vaccines, send push tại 14d/7d/1d/overdue mark.
 *
 * Reuse M5 web-push + notification_log.
 */
import { listRows, updateRow } from "@shared/baserow.ts";
import { sendPush } from "./web-push.ts";
import { listPetVaccines, loadTemplates } from "./vaccines.ts";
import { daysToDue } from "@shared/vaccine-scheduler.ts";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@shared/zod-schemas/m5.ts";

interface UserRow {
  id: number;
  phone?: string;
  push_subscription?: string | null;
  notification_preferences?: string | null;
}

interface PetRow {
  id: number;
  name: string;
  species?: string | { value: string } | null;
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

export interface VaccineReminderReport {
  users_processed: number;
  vaccines_checked: number;
  pushes_sent: number;
  pushes_skipped: number;
  status_updated_overdue: number;
  errors: number;
  duration_ms: number;
}

/** Build push payload tiếng Việt. */
function buildReminderPush(
  petName: string,
  vaccineNameVn: string,
  daysLeft: number
): { title: string; body: string } {
  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      title: `⚠️ ${petName} - Trễ lịch tiêm`,
      body: `Bé đã trễ ${overdueDays} ngày mũi ${vaccineNameVn}. Đặt lịch tiêm ngay.`,
    };
  }
  if (daysLeft === 0) {
    return {
      title: `💉 ${petName} - Tiêm hôm nay`,
      body: `Hôm nay là lịch tiêm ${vaccineNameVn} cho bé ${petName}.`,
    };
  }
  if (daysLeft === 1) {
    return {
      title: `💉 ${petName} - Tiêm ngày mai`,
      body: `Sáng mai bé cần tiêm ${vaccineNameVn}. Chuẩn bị đưa đi.`,
    };
  }
  if (daysLeft === 7) {
    return {
      title: `💉 ${petName} - Còn 7 ngày`,
      body: `Mũi ${vaccineNameVn} còn 7 ngày. Đặt lịch với bác sĩ ngay.`,
    };
  }
  return {
    title: `💉 ${petName} - Còn ${daysLeft} ngày`,
    body: `Mũi ${vaccineNameVn} sắp đến hạn (${daysLeft} ngày nữa).`,
  };
}

/**
 * Main job: check all users, find scheduled vaccines hitting reminder windows.
 */
export async function runVaccineRemindersJob(): Promise<VaccineReminderReport> {
  const t0 = Date.now();
  const report: VaccineReminderReport = {
    users_processed: 0,
    vaccines_checked: 0,
    pushes_sent: 0,
    pushes_skipped: 0,
    status_updated_overdue: 0,
    errors: 0,
    duration_ms: 0,
  };

  console.log("[vaccine-reminders] start");

  let users: UserRow[];
  try {
    const res = await listRows<UserRow>("users", { size: 200 });
    users = res.results;
  } catch (err) {
    console.error("[vaccine-reminders] load users failed:", err);
    report.errors++;
    report.duration_ms = Date.now() - t0;
    return report;
  }

  const templates = await loadTemplates();

  for (const user of users) {
    report.users_processed++;
    try {
      const prefs = parsePrefs(user.notification_preferences);
      // KHÔNG check push_subscription ở đây — vẫn flag overdue trong DB cho user view in-app
      const hasPushAndPref = !!user.push_subscription && prefs.vaccine_reminders;

      // Get pets của user
      const petsRes = await listRows<PetRow>("pets", {
        filter: { user_id__link_row_has: String(user.id), deleted_at__empty: "" },
        size: 100,
      });
      const pets = petsRes.results;

      for (const pet of pets) {
        // Get scheduled vaccines của pet
        const vacs = await listPetVaccines(pet.id);
        const scheduled = vacs.filter((v) => {
          const status = typeof v.status === "object" ? v.status?.value : v.status;
          return status === "scheduled" || status === "overdue";
        });

        for (const vac of scheduled) {
          report.vaccines_checked++;
          if (!vac.due_date) continue;
          const dLeft = daysToDue(vac.due_date);

          // Determine which reminder window to send
          let windowKey: "14d" | "7d" | "1d" | "overdue" | null = null;
          if (dLeft < 0 && !vac.reminder_sent_overdue) {
            windowKey = "overdue";
          } else if (dLeft === 1 && !vac.reminder_sent_1d) {
            windowKey = "1d";
          } else if (dLeft === 7 && !vac.reminder_sent_7d) {
            windowKey = "7d";
          } else if (dLeft === 14 && !vac.reminder_sent_14d) {
            windowKey = "14d";
          }

          if (!windowKey) continue;

          // Update status overdue + flag immediately, ngay cả khi không có push
          const updates: Record<string, unknown> = {};
          updates[`reminder_sent_${windowKey}`] = true;
          if (windowKey === "overdue") {
            updates.status = "overdue";
            report.status_updated_overdue++;
          }

          try {
            await updateRow("vaccines", vac.id, updates);
          } catch (err) {
            console.error(`[vaccine-reminders] update vac ${vac.id} failed:`, err);
            report.errors++;
          }

          // Send push nếu user có sub + bật vaccine_reminders pref
          if (hasPushAndPref) {
            const code = typeof vac.vaccine_code === "object" ? vac.vaccine_code?.value : vac.vaccine_code;
            const template = templates.find((t) => t.vaccine_code === code);
            const vaccineNameVn = template?.vaccine_name || code || "vaccine";

            const payload = buildReminderPush(pet.name, vaccineNameVn, dLeft);
            const result = await sendPush(
              user.id,
              user.push_subscription,
              {
                title: payload.title,
                body: payload.body,
                icon: "/favicon.svg",
                data: { url: `/pets/${pet.id}?tab=vaccine`, vaccine_id: vac.id },
              },
              { type: "vaccine_reminder" }
            );
            if (result.ok) report.pushes_sent++;
            else report.pushes_skipped++;
          }
        }
      }
    } catch (err) {
      console.error(`[vaccine-reminders] user ${user.id} failed:`, err);
      report.errors++;
    }
  }

  report.duration_ms = Date.now() - t0;
  console.log("[vaccine-reminders] done:", report);
  return report;
}
