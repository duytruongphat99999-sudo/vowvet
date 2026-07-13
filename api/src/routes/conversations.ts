/**
 * Chat support/foster routes — mount /api/v1/conversations (KHÔNG đụng /api/v1/chat telehealth).
 * Membership: session.sub ∈ {user1_id, user2_id} HOẶC admin (phone ∈ ADMIN_PHONES).
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getRow } from "@shared/baserow.ts";
import { findUserById } from "../lib/users.ts";
import { isAdminIdentity } from "@shared/admin.ts";
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage,
  markMessagesRead,
  getTotalUnread,
  getConversationRow,
} from "../lib/conversations.ts";

export const conversationsRoute = new Hono();
conversationsRoute.use("*", requireAuth);

function isAdmin(c: any): boolean {
  const s = c.get("user");
  return isAdminIdentity(s?.phone, s?.email);
}

/** Trả conversation row nếu session là thành viên hoặc admin, null nếu không. */
async function memberOrAdmin(c: any, convId: number): Promise<any | null> {
  const s = c.get("user");
  const row = await getConversationRow(convId);
  if (!row) return null;
  if (isAdmin(c)) return row;
  if (Number(row.user1_id) === s.sub || Number(row.user2_id) === s.sub) return row;
  return null;
}

// GET /conversations — của tôi
conversationsRoute.get("/", async (c) => {
  const s = c.get("user");
  try {
    return c.json({ conversations: await getConversations(s.sub) });
  } catch (err) {
    console.error("[conversations/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// GET /conversations/unread-count — badge
conversationsRoute.get("/unread-count", async (c) => {
  const s = c.get("user");
  try {
    return c.json({ count: await getTotalUnread(s.sub) });
  } catch (err) {
    console.error("[conversations/unread] error:", err);
    return c.json({ count: 0 });
  }
});

// POST /conversations/support — tìm/tạo hội thoại hỗ trợ admin
conversationsRoute.post("/support", async (c) => {
  const s = c.get("user");
  try {
    const conversationId = await findOrCreateConversation("admin_support", s.sub, 0, 0, "admin_support");
    return c.json({ conversationId });
  } catch (err) {
    console.error("[conversations/support] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// POST /conversations/foster — tìm/tạo hội thoại foster người trao ↔ người nhận.
// Input: { handover_id } (suy giver/receiver từ foster_handovers). Idempotent:
// findOrCreateConversation match theo cặp user + context_id=handoverId → gọi lại trả conv cũ,
// đồng thời VÁ ca transfer cũ fire-and-forget lỡ chưa tạo conv. Chỉ giver/receiver/admin gọi được.
conversationsRoute.post("/foster", async (c) => {
  const s = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch { body = {}; }
  const handoverId = Number(body?.handover_id);
  if (!Number.isInteger(handoverId) || handoverId <= 0) {
    return c.json({ error: { code: "BAD_INPUT", message: "Thiếu handover_id hợp lệ" } }, 400);
  }
  try {
    let handover: any = null;
    try { handover = await getRow<any>("foster_handovers" as any, handoverId); } catch { handover = null; }
    if (!handover) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lượt trao bé" } }, 404);
    }
    const giverId = Number(handover.from_user_id);
    const receiverId = Number(handover.to_user_id);
    if (!giverId || !receiverId) {
      return c.json({ error: { code: "BAD_HANDOVER", message: "Lượt trao thiếu thông tin người dùng" } }, 422);
    }
    if (!isAdmin(c) && s.sub !== giverId && s.sub !== receiverId) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền mở hội thoại này" } }, 403);
    }
    const conversationId = await findOrCreateConversation("foster", giverId, receiverId, handoverId, "foster_handover");
    return c.json({ conversationId });
  } catch (err) {
    console.error("[conversations/foster] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// POST /conversations/direct — tìm/tạo hội thoại nhắn trực tiếp từ profile.
// Input: { targetUserId: number } — user muốn nhắn trực tiếp. Idempotent:
// findOrCreateConversation match cặp user (type "direct", context_id 0) → gọi lại trả conv cũ.
// Response: { conversationId: number }.
conversationsRoute.post("/direct", async (c) => {
  const s = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch { body = {}; }
  const targetUserId = Number(body?.targetUserId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return c.json({ error: { code: "BAD_INPUT", message: "Thiếu targetUserId hợp lệ" } }, 400);
  }
  if (s.sub === targetUserId) {
    return c.json({ error: { code: "SELF", message: "Không thể tự nhắn chính mình" } }, 400);
  }
  try {
    const target = await findUserById(targetUserId);
    if (!target) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy người dùng" } }, 404);
    }
    const conversationId = await findOrCreateConversation("direct", s.sub, targetUserId, 0, "direct");
    return c.json({ conversationId });
  } catch (err) {
    console.error("[conversations/direct] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// GET /conversations/:id/messages?after=0 — auto mark-read
conversationsRoute.get("/:id{[0-9]+}/messages", async (c) => {
  const s = c.get("user");
  const id = Number(c.req.param("id"));
  const after = Number(c.req.query("after") || "0") || 0;
  try {
    const row = await memberOrAdmin(c, id);
    if (!row) return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền xem hội thoại này" } }, 403);
    const messages = await getMessages(id, after);
    await markMessagesRead(id, s.sub);
    return c.json({ messages });
  } catch (err) {
    console.error("[conversations/messages] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// POST /conversations/:id/messages — gửi
conversationsRoute.post("/:id{[0-9]+}/messages", async (c) => {
  const s = c.get("user");
  const id = Number(c.req.param("id"));
  let body: any;
  try { body = await c.req.json(); } catch { body = {}; }
  try {
    const row = await memberOrAdmin(c, id);
    if (!row) return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền gửi vào hội thoại này" } }, 403);
    const message = await sendMessage(id, s.sub, String(body?.content ?? ""));
    return c.json({ message });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("trống") || msg.includes("quá dài")) {
      return c.json({ error: { code: "BAD_CONTENT", message: err.message } }, 400);
    }
    console.error("[conversations/send] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});
