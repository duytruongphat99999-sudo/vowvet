/**
 * Web Push wrapper — gửi notification, log notification_log, rate limit 3/day/user.
 */
import webpush from "web-push";
import { createRow, listRows } from "@shared/baserow.ts";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@monminpet.com";

let initialized = false;
function initVapid() {
  if (initialized) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[web-push] VAPID keys chưa cấu hình — push sẽ fail. Run scripts/generate-vapid.ts trước.");
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  initialized = true;
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const MAX_PUSH_PER_DAY = 3;

/** Đếm push gửi hôm nay cho user (từ notification_log). */
async function countPushToday(userId: number): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const res = await listRows("notification_log", {
    filter: {
      user_id__link_row_has: String(userId),
      sent_at__date_equal: today,
    },
    size: 1,
  });
  return res.count;
}

/** Log push send vào notification_log table. */
async function logNotification(
  userId: number,
  type: "alert_push" | "daily_summary" | "vaccine_reminder" | "care_plan_reminder" | "routine_reminder",
  payload: PushPayload,
  delivered: boolean
): Promise<void> {
  try {
    await createRow("notification_log", {
      user_id: [userId],
      type,
      payload: JSON.stringify(payload),
      delivered,
    });
  } catch (err) {
    console.error("[web-push] notification_log create failed:", err);
  }
}

export interface SendPushResult {
  ok: boolean;
  reason?: "no_subscription" | "rate_limited" | "invalid_subscription" | "send_failed";
  detail?: string;
}

/**
 * Gửi web push tới user. Tự log notification_log.
 * Rate limit 3/day (override = true cho test/system).
 *
 * Trả {ok, reason}. ok=false không phải lỗi fatal — caller có thể tiếp tục.
 */
export async function sendPush(
  userId: number,
  subscriptionRaw: string | null | undefined,
  payload: PushPayload,
  options: { type?: "alert_push" | "daily_summary" | "vaccine_reminder" | "care_plan_reminder" | "routine_reminder"; bypassRateLimit?: boolean } = {}
): Promise<SendPushResult> {
  initVapid();
  if (!VAPID_PRIVATE_KEY) return { ok: false, reason: "send_failed", detail: "VAPID chưa cấu hình" };

  if (!subscriptionRaw) return { ok: false, reason: "no_subscription" };
  let sub: PushSubscription;
  try {
    sub = JSON.parse(subscriptionRaw);
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("invalid shape");
  } catch {
    return { ok: false, reason: "invalid_subscription" };
  }

  const type = options.type || "alert_push";

  // Rate limit check
  if (!options.bypassRateLimit) {
    const count = await countPushToday(userId);
    if (count >= MAX_PUSH_PER_DAY) {
      console.log(`[web-push] Rate limit: user ${userId} đã có ${count} push hôm nay`);
      return { ok: false, reason: "rate_limited", detail: `${count}/${MAX_PUSH_PER_DAY} per day` };
    }
  }

  // Send
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 24 * 60 * 60 });
    await logNotification(userId, type, payload, true);
    return { ok: true };
  } catch (err: any) {
    const status = err?.statusCode;
    // 410 Gone hoặc 404 → subscription invalid (user unsubscribed/cleared browser)
    if (status === 410 || status === 404) {
      console.warn(`[web-push] subscription expired cho user ${userId} (status ${status})`);
      await logNotification(userId, type, payload, false);
      return { ok: false, reason: "invalid_subscription", detail: `HTTP ${status}` };
    }
    console.error("[web-push] send failed:", err?.body || err?.message || err);
    await logNotification(userId, type, payload, false);
    return { ok: false, reason: "send_failed", detail: err?.message || "unknown" };
  }
}
