/**
 * Chat notifications (M9.2).
 *
 * 4 hooks:
 *   notifyVetsNewThread       → fanout cho all is_vet=true users (Zalo + push)
 *   notifyOwnerVetClaimed     → owner push khi vet pick up case
 *   notifyOwnerVetReplied     → owner push khi vet send message
 *   notifyVetOwnerReplied     → vet push khi owner reply (sau khi vet đã claim)
 *
 * Quy tắc:
 *   - KHÔNG throw (notification failure ≠ message send failure)
 *   - try-catch quanh mỗi notification, log error
 *   - Zalo mode mock → console.log; production → ZNS API (cùng pattern otp-sender)
 *   - Push reuse sendPush() từ M5 web-push.ts
 */
import { sendPush } from "./web-push.ts";
import { listAllVets, vetDisplayName, type ChatThread, type ChatMessage } from "./chat.ts";
import { findUserById, type BaserowUser } from "./users.ts";

// ============================================================
// Zalo vet alert (reuse otp-sender pattern, separate template)
// ============================================================

const ZALO_API_URL = "https://business.openapi.zalo.me/message/template";

function zaloMode(): "mock" | "production" {
  const raw = (process.env.ZALO_MODE || "mock").toLowerCase().trim();
  return raw === "production" ? "production" : "mock";
}

function phoneForZalo(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : phone;
}

/**
 * Gửi Zalo alert cho vet về thread mới.
 * Mock mode: console.log
 * Production: gọi ZNS với template VET_ALERT.
 * Graceful fallback console.log nếu API fail.
 */
async function sendZaloVetAlert(
  vetPhone: string,
  thread: ChatThread,
  petName: string
): Promise<{ sent: boolean; via: "console" | "zns"; error?: string }> {
  const mode = zaloMode();
  const dashboardUrl = "https://vowvet.monminpet.com/vet/dashboard";
  const summary = `${petName} — ${thread.subject}`;

  if (mode === "mock") {
    console.log(
      `[VET ALERT MOCK] phone=${vetPhone} thread=${thread.id} ` +
        `petName="${petName}" subject="${thread.subject}" url=${dashboardUrl}`
    );
    return { sent: true, via: "console" };
  }

  const accessToken = process.env.ZALO_OA_ACCESS_TOKEN;
  const templateId = process.env.ZALO_OA_VET_TEMPLATE_ID || process.env.ZALO_OA_TEMPLATE_ID;
  if (!accessToken || !templateId) {
    console.warn(
      `[VET ALERT FALLBACK] missing creds. Fallback console: phone=${vetPhone} ` +
        `thread=${thread.id} subject="${thread.subject}"`
    );
    return { sent: true, via: "console", error: "missing_credentials" };
  }

  try {
    const body = {
      phone: phoneForZalo(vetPhone),
      template_id: templateId,
      template_data: {
        pet_name: petName.slice(0, 50),
        subject: thread.subject.slice(0, 100),
        url: dashboardUrl,
      },
      tracking_id: `vowvet-vet-alert-${thread.id}-${Date.now()}`,
    };
    const res = await fetch(ZALO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: accessToken },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(
        `[VET ALERT FALLBACK] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}. ` +
          `Fallback console for ${vetPhone}: thread=${thread.id}`
      );
      return { sent: true, via: "console", error: `http_${res.status}` };
    }
    const json = (await res.json()) as { error?: number; message?: string };
    if (json.error !== 0) {
      console.warn(
        `[VET ALERT FALLBACK] Zalo error=${json.error} msg=${json.message}. ` +
          `Fallback console for ${vetPhone}: thread=${thread.id}`
      );
      return { sent: true, via: "console", error: `zalo_${json.error}` };
    }
    console.log(`[VET ALERT SENT] phone=${vetPhone} thread=${thread.id} via=zns`);
    return { sent: true, via: "zns" };
  } catch (err: any) {
    console.error(
      `[VET ALERT ERROR] ${err?.message || err}. Fallback console for ${vetPhone}: thread=${thread.id}`
    );
    return { sent: true, via: "console", error: `unexpected_${err?.message || "?"}` };
  }
}

// ============================================================
// Push helper — wrap sendPush() với try-catch + log
// ============================================================

async function safePush(
  userId: number,
  user: BaserowUser | null,
  title: string,
  body: string,
  url: string,
  context: string
): Promise<void> {
  const sub = (user as any)?.push_subscription;
  if (!sub) {
    console.log(`[CHAT PUSH SKIP] ${context} user=${userId} no push_subscription`);
    return;
  }
  try {
    await sendPush(
      userId,
      sub,
      {
        title,
        body,
        data: { url },
      },
      { type: "alert_push", bypassRateLimit: true }
    );
    console.log(`[CHAT PUSH SENT] ${context} user=${userId}`);
  } catch (err: any) {
    console.error(`[CHAT PUSH ERROR] ${context} user=${userId}: ${err?.message || err}`);
  }
}

// ============================================================
// 1. notifyVetsNewThread — fanout cho all vets
// ============================================================

export async function notifyVetsNewThread(
  thread: ChatThread,
  petName: string
): Promise<void> {
  try {
    const vets = await listAllVets();
    if (vets.length === 0) {
      console.warn(`[CHAT NOTIFY] thread=${thread.id} no vets registered`);
      return;
    }

    let notifiedZalo = 0;
    let notifiedPush = 0;
    for (const vet of vets) {
      if (!vet.phone) continue;
      // Zalo (graceful fallback)
      try {
        const r = await sendZaloVetAlert(vet.phone, thread, petName);
        if (r.sent) notifiedZalo++;
      } catch (err) {
        console.error(`[CHAT NOTIFY] zalo fail vet=${vet.id}:`, err);
      }
      // Web push (if subscribed)
      const sub = (vet as any).push_subscription;
      if (sub) {
        await safePush(
          vet.id,
          vet,
          `🩺 Pet cần tư vấn: ${petName}`,
          thread.subject.slice(0, 80),
          `/vet/dashboard`,
          "vet-new-thread"
        );
        notifiedPush++;
      }
    }
    console.log(
      `[CHAT NOTIFY] thread=${thread.id} → ${vets.length} vets notified ` +
        `(zalo=${notifiedZalo}, push=${notifiedPush})`
    );
  } catch (err: any) {
    console.error(`[CHAT NOTIFY] notifyVetsNewThread thread=${thread.id} error:`, err?.message || err);
  }
}

// ============================================================
// 2. notifyOwnerVetClaimed — owner biết vet đã pickup
// ============================================================

export async function notifyOwnerVetClaimed(
  thread: ChatThread,
  vetUser: BaserowUser
): Promise<void> {
  try {
    const owner = await findUserById(thread.owner_user_id);
    if (!owner) {
      console.warn(`[CHAT NOTIFY] vet-claimed: owner ${thread.owner_user_id} not found`);
      return;
    }
    const vetName = vetDisplayName(vetUser);
    await safePush(
      owner.id,
      owner,
      "Bác sĩ đã phụ trách",
      `Bác sĩ ${vetName} đang xem case của bạn`,
      `/chat/${thread.id}`,
      "owner-vet-claimed"
    );
  } catch (err: any) {
    console.error(
      `[CHAT NOTIFY] notifyOwnerVetClaimed thread=${thread.id} error:`,
      err?.message || err
    );
  }
}

// ============================================================
// 3. notifyOwnerVetReplied — vet đã reply, owner cần biết
// ============================================================

export async function notifyOwnerVetReplied(
  thread: ChatThread,
  vetUser: BaserowUser,
  message: ChatMessage
): Promise<void> {
  try {
    const owner = await findUserById(thread.owner_user_id);
    if (!owner) return;
    const vetName = vetDisplayName(vetUser);
    const body = message.content.replace(/\s+/g, " ").trim().slice(0, 80);
    await safePush(
      owner.id,
      owner,
      `💬 Tin nhắn mới từ bác sĩ ${vetName}`,
      body || "Có tin nhắn mới",
      `/chat/${thread.id}`,
      "owner-vet-replied"
    );
  } catch (err: any) {
    console.error(
      `[CHAT NOTIFY] notifyOwnerVetReplied thread=${thread.id} error:`,
      err?.message || err
    );
  }
}

// ============================================================
// 4. notifyVetOwnerReplied — owner reply, vet đang handle cần biết
// ============================================================

export async function notifyVetOwnerReplied(
  thread: ChatThread,
  message: ChatMessage,
  petName: string
): Promise<void> {
  try {
    if (!thread.vet_user_id) {
      // No vet handling yet, fanout already happened via notifyVetsNewThread
      return;
    }
    const vet = await findUserById(thread.vet_user_id);
    if (!vet) return;
    const body = `${petName}: ${message.content.replace(/\s+/g, " ").trim().slice(0, 80)}`;
    await safePush(
      vet.id,
      vet,
      "💬 Owner trả lời",
      body,
      `/chat/${thread.id}`,
      "vet-owner-replied"
    );
  } catch (err: any) {
    console.error(
      `[CHAT NOTIFY] notifyVetOwnerReplied thread=${thread.id} error:`,
      err?.message || err
    );
  }
}
