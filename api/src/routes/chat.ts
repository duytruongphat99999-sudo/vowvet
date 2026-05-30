/**
 * Chat routes — Owner endpoints (M9.2).
 *
 * Mount tại /api/v1/chat. Tất cả require requireAuth.
 *
 * Endpoints:
 *   GET    /threads                       — list owner's threads
 *   POST   /threads                       — create thread + first message
 *   GET    /threads/:id                   — get thread + 50 messages mới nhất, mark read
 *   POST   /threads/:id/messages          — send message as owner
 *   POST   /threads/:id/close             — close thread
 *   GET    /threads/:id/messages?before=  — paginate older messages
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { findUserById, type BaserowUser } from "../lib/users.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  createThread,
  listOwnerThreads,
  getThread,
  listMessages,
  markThreadRead,
  sendMessage,
  closeThread,
  computeThreadPermission,
  checkThreadCreateRate,
  checkMessageSendRate,
  type ChatThread,
} from "../lib/chat.ts";
import {
  notifyVetsNewThread,
  notifyVetOwnerReplied,
} from "../lib/chat-notifications.ts";
import {
  ThreadCreateSchema,
  MessageSendSchema,
  ThreadCloseSchema,
} from "@shared/zod-schemas/chat.ts";
import { getRow } from "@shared/baserow.ts";

export const chatRoutes = new Hono();
chatRoutes.use("*", requireAuth);

// ============================================================
// GET /threads
// ============================================================
chatRoutes.get("/threads", async (c) => {
  const session = c.get("user");
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));
  try {
    const threads = await listOwnerThreads(session.sub, limit);
    return c.json({ threads });
  } catch (err: any) {
    console.error("[chat/threads list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load threads" } }, 500);
  }
});

// ============================================================
// POST /threads — create new thread
// ============================================================
chatRoutes.post("/threads", zValidator("json", ThreadCreateSchema), async (c) => {
  const session = c.get("user");
  const data = c.req.valid("json");

  // Rate limit
  if (!checkThreadCreateRate(session.sub)) {
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Bạn tạo thread quá nhanh. Thử lại sau vài phút.",
        },
      },
      429
    );
  }

  // Verify pet ownership nếu pet_id provided
  if (data.pet_id) {
    try {
      await getOwnedPet(data.pet_id, session.sub);
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json(
          { error: { code: err.code, message: err.message } },
          err.status
        );
      }
      throw err;
    }
  }

  try {
    const { thread, firstMessage } = await createThread({
      petId: data.pet_id || null,
      subject: data.subject,
      initialMessage: data.initial_message,
      ownerId: session.sub,
    });

    // Notify vets fanout (fire-and-forget — không block response)
    const petName = data.pet_id ? await fetchPetName(data.pet_id) : "(không gắn pet)";
    notifyVetsNewThread(thread, petName).catch((err) =>
      console.error("[chat/threads POST] notify err:", err)
    );

    return c.json({ thread, first_message: firstMessage }, 201);
  } catch (err: any) {
    console.error("[chat/threads POST] error:", err);
    return c.json(
      { error: { code: "INTERNAL", message: err?.message || "Lỗi tạo thread" } },
      500
    );
  }
});

// ============================================================
// GET /threads/:id — get + mark read
// ============================================================
chatRoutes.get("/threads/:id{[0-9]+}", async (c) => {
  const session = c.get("user");
  const threadId = Number(c.req.param("id"));

  try {
    const thread = await getThread(threadId);
    if (!thread) {
      return c.json({ error: { code: "NOT_FOUND", message: "Thread không tồn tại" } }, 404);
    }

    const user = await findUserById(session.sub);
    if (!user) {
      return c.json({ error: { code: "USER_NOT_FOUND", message: "Phiên hết hạn" } }, 401);
    }

    const perm = computeThreadPermission(thread, user);
    if (!perm.canRead) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Bạn không có quyền xem thread này" } },
        403
      );
    }

    // Mark read cho role tương ứng
    const isOwner = thread.owner_user_id === user.id;
    if (isOwner) {
      await markThreadRead(threadId, "owner");
      thread.unread_count_owner = 0;
    } else if (thread.vet_user_id === user.id) {
      await markThreadRead(threadId, "vet");
      thread.unread_count_vet = 0;
    }

    const messages = await listMessages(threadId, { limit: 50 });
    return c.json({ thread, messages, permission: perm });
  } catch (err: any) {
    console.error("[chat/threads GET] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load thread" } }, 500);
  }
});

// ============================================================
// POST /threads/:id/messages — owner send message
// ============================================================
chatRoutes.post(
  "/threads/:id{[0-9]+}/messages",
  zValidator("json", MessageSendSchema),
  async (c) => {
    const session = c.get("user");
    const threadId = Number(c.req.param("id"));
    const data = c.req.valid("json");

    // Rate limit per thread
    if (!checkMessageSendRate(threadId)) {
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Bạn gửi tin nhắn quá nhanh. Thử lại sau ít phút.",
          },
        },
        429
      );
    }

    try {
      const thread = await getThread(threadId);
      if (!thread) {
        return c.json({ error: { code: "NOT_FOUND", message: "Thread không tồn tại" } }, 404);
      }

      const user = await findUserById(session.sub);
      if (!user) {
        return c.json({ error: { code: "USER_NOT_FOUND", message: "Phiên hết hạn" } }, 401);
      }

      const perm = computeThreadPermission(thread, user);
      if (!perm.canSendAsOwner) {
        // Owner endpoint chỉ cho owner send. Vet phải dùng /api/v1/vet/threads/:id/messages.
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message: thread.status === "closed"
                ? "Thread đã đóng, không gửi được tin nhắn"
                : "Bạn không phải owner của thread này. Vet vui lòng dùng /api/v1/vet endpoints.",
            },
          },
          403
        );
      }

      const message = await sendMessage({
        threadId,
        thread,
        senderId: user.id,
        senderRole: "owner",
        content: data.content,
        attachmentUrl: data.attachment_url,
      });

      // Notify vet đang handle (nếu có)
      if (thread.vet_user_id) {
        const petName = thread.pet_id ? await fetchPetName(thread.pet_id) : "(không gắn pet)";
        notifyVetOwnerReplied(thread, message, petName).catch((err) =>
          console.error("[chat/messages POST] notify err:", err)
        );
      }

      return c.json({ message }, 201);
    } catch (err: any) {
      console.error("[chat/messages POST] error:", err);
      return c.json(
        { error: { code: "INTERNAL", message: err?.message || "Lỗi gửi tin nhắn" } },
        500
      );
    }
  }
);

// ============================================================
// POST /threads/:id/close — close thread
// ============================================================
chatRoutes.post(
  "/threads/:id{[0-9]+}/close",
  zValidator("json", ThreadCloseSchema),
  async (c) => {
    const session = c.get("user");
    const threadId = Number(c.req.param("id"));

    try {
      const thread = await getThread(threadId);
      if (!thread) {
        return c.json({ error: { code: "NOT_FOUND", message: "Thread không tồn tại" } }, 404);
      }

      const user = await findUserById(session.sub);
      if (!user) {
        return c.json({ error: { code: "USER_NOT_FOUND", message: "Phiên hết hạn" } }, 401);
      }

      const perm = computeThreadPermission(thread, user);
      if (!perm.canClose) {
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Bạn không có quyền đóng thread này",
            },
          },
          403
        );
      }

      const updated = await closeThread(threadId);
      return c.json({ thread: updated });
    } catch (err: any) {
      console.error("[chat/close] error:", err);
      return c.json({ error: { code: "INTERNAL", message: "Lỗi đóng thread" } }, 500);
    }
  }
);

// ============================================================
// GET /threads/:id/messages?before=:msgId&limit=50 — paginate older
// ============================================================
chatRoutes.get("/threads/:id{[0-9]+}/messages", async (c) => {
  const session = c.get("user");
  const threadId = Number(c.req.param("id"));
  const beforeId = c.req.query("before") ? Number(c.req.query("before")) : undefined;
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));

  try {
    const thread = await getThread(threadId);
    if (!thread) {
      return c.json({ error: { code: "NOT_FOUND", message: "Thread không tồn tại" } }, 404);
    }
    const user = await findUserById(session.sub);
    if (!user) {
      return c.json({ error: { code: "USER_NOT_FOUND", message: "Phiên hết hạn" } }, 401);
    }
    const perm = computeThreadPermission(thread, user);
    if (!perm.canRead) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
    }

    const messages = await listMessages(threadId, { beforeId, limit });
    return c.json({ messages, has_more: messages.length === limit });
  } catch (err: any) {
    console.error("[chat/messages list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load messages" } }, 500);
  }
});

// ============================================================
// Helpers
// ============================================================
async function fetchPetName(petId: number): Promise<string> {
  try {
    const pet = await getRow<any>("pets", petId);
    return pet?.name || `Pet #${petId}`;
  } catch {
    return `Pet #${petId}`;
  }
}
