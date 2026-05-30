/**
 * Vet routes (M9.2).
 *
 * Mount tại /api/v1/vet. Tất cả require requireAuth + requireVet.
 *
 * Endpoints:
 *   GET   /threads/queue?limit=20            — FIFO waiting_vet threads
 *   POST  /threads/:id/claim                 — vet pick up thread
 *   GET   /threads/mine?status=open|closed   — vet's handled threads
 *   POST  /threads/:id/messages              — vet send message
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { requireVet } from "../middleware/require-vet.ts";
import { findUserById } from "../lib/users.ts";
import {
  listVetQueue,
  claimThread,
  listVetMine,
  getThread,
  sendMessage,
  computeThreadPermission,
  checkMessageSendRate,
  type ThreadStatus,
} from "../lib/chat.ts";
import {
  notifyOwnerVetClaimed,
  notifyOwnerVetReplied,
} from "../lib/chat-notifications.ts";
import { MessageSendSchema } from "@shared/zod-schemas/chat.ts";
import { getRow } from "@shared/baserow.ts";
import { vetWorkloadSummary } from "../lib/analytics.ts";

export const vetRoutes = new Hono();
vetRoutes.use("*", requireAuth);
vetRoutes.use("*", requireVet);

// ============================================================
// GET /my-stats (M10) — vet personal workload
// ============================================================
vetRoutes.get("/my-stats", async (c) => {
  const vet = c.get("vetUser");
  try {
    const summary = await vetWorkloadSummary(vet.id);
    return c.json({ stats: summary, vet: { id: vet.id, name: (vet as any).name, credentials: (vet as any).vet_credentials } });
  } catch (err: any) {
    console.error("[vet/my-stats] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load stats" } }, 500);
  }
});

// ============================================================
// GET /threads/queue — FIFO waiting_vet
// ============================================================
vetRoutes.get("/threads/queue", async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "20")));
  try {
    const threads = await listVetQueue(limit);
    return c.json({ threads, total: threads.length });
  } catch (err: any) {
    console.error("[vet/queue] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load queue" } }, 500);
  }
});

// ============================================================
// POST /threads/:id/claim — vet pick up thread
// ============================================================
vetRoutes.post("/threads/:id{[0-9]+}/claim", async (c) => {
  const vet = c.get("vetUser");
  const threadId = Number(c.req.param("id"));

  try {
    const { thread } = await claimThread(threadId, vet.id);
    // Notify owner (fire-and-forget)
    notifyOwnerVetClaimed(thread, vet).catch((err) =>
      console.error("[vet/claim] notify err:", err)
    );
    return c.json({ thread });
  } catch (err: any) {
    const status = err?.status || 500;
    if (status === 404 || status === 403 || status === 409) {
      return c.json({ error: { code: err.code, message: err.message } }, status);
    }
    console.error("[vet/claim] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi nhận thread" } }, 500);
  }
});

// ============================================================
// GET /threads/mine?status= — vet's threads
// ============================================================
vetRoutes.get("/threads/mine", async (c) => {
  const vet = c.get("vetUser");
  const statusRaw = c.req.query("status");
  const validStatuses: ThreadStatus[] = ["open", "closed", "waiting_vet"];
  const statusFilter =
    statusRaw && validStatuses.includes(statusRaw as ThreadStatus)
      ? (statusRaw as ThreadStatus)
      : undefined;
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));

  try {
    const threads = await listVetMine(vet.id, statusFilter, limit);
    return c.json({ threads, total: threads.length });
  } catch (err: any) {
    console.error("[vet/mine] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load mine" } }, 500);
  }
});

// ============================================================
// POST /threads/:id/messages — vet send message
// ============================================================
vetRoutes.post(
  "/threads/:id{[0-9]+}/messages",
  zValidator("json", MessageSendSchema),
  async (c) => {
    const vet = c.get("vetUser");
    const threadId = Number(c.req.param("id"));
    const data = c.req.valid("json");

    if (!checkMessageSendRate(threadId)) {
      return c.json(
        {
          error: { code: "RATE_LIMITED", message: "Gửi quá nhanh. Thử lại sau ít phút." },
        },
        429
      );
    }

    try {
      const thread = await getThread(threadId);
      if (!thread) {
        return c.json({ error: { code: "NOT_FOUND", message: "Thread không tồn tại" } }, 404);
      }

      const perm = computeThreadPermission(thread, vet);
      if (!perm.canSendAsVet) {
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message:
                thread.status === "closed"
                  ? "Thread đã đóng"
                  : thread.vet_user_id === null
                  ? "Bạn chưa claim thread này. Dùng /claim trước."
                  : "Thread đã được bác sĩ khác phụ trách",
            },
          },
          403
        );
      }

      const message = await sendMessage({
        threadId,
        thread,
        senderId: vet.id,
        senderRole: "vet",
        content: data.content,
        attachmentUrl: data.attachment_url,
      });

      // Notify owner (fire-and-forget)
      notifyOwnerVetReplied(thread, vet, message).catch((err) =>
        console.error("[vet/messages POST] notify err:", err)
      );

      return c.json({ message }, 201);
    } catch (err: any) {
      console.error("[vet/messages POST] error:", err);
      return c.json(
        { error: { code: "INTERNAL", message: err?.message || "Lỗi gửi tin nhắn" } },
        500
      );
    }
  }
);
