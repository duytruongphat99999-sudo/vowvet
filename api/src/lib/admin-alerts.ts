/**
 * Admin alert routing — fire-and-forget push to ADMIN_PHONES users.
 * Never throws (caller doesn't await it). Used for safety violations,
 * (future) cron failures, R2 outage escalation.
 */
import { listRows } from "@shared/baserow.ts";
import { sendPush } from "./web-push.ts";

const ADMIN_PHONES = (process.env.ADMIN_PHONES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface AdminUserRow {
  id: number;
  push_subscription?: string | null;
}

export async function notifyAdmins(
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  if (ADMIN_PHONES.length === 0) {
    console.warn("[admin-alerts] ADMIN_PHONES env empty — alert dropped:", title);
    return;
  }
  for (const phone of ADMIN_PHONES) {
    try {
      const res = await listRows<AdminUserRow>("users", {
        filter: { phone__equal: phone },
        size: 1,
      });
      const admin = res.results[0];
      if (!admin?.push_subscription) {
        console.log(`[admin-alerts] admin ${phone} no push subscription, skip`);
        continue;
      }
      await sendPush(
        admin.id,
        admin.push_subscription,
        { title, body, data },
        { type: "alert_push", bypassRateLimit: true }
      );
      console.log(`[admin-alerts] sent to ${phone}: "${title}"`);
    } catch (err) {
      console.error(`[admin-alerts] failed for ${phone}:`, err);
    }
  }
}
