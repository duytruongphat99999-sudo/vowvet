/**
 * Chat support/foster routes — mount /api/v1/conversations (KHÔNG đụng /api/v1/chat telehealth).
 * Membership: session.sub ∈ {user1_id, user2_id} HOẶC admin (phone ∈ ADMIN_PHONES).
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage,
  markMessagesRead,
  getTotalUnread,
  getConversationRow,
} from "../lib/conversations.ts";

const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);

export const conversationsRoute = new Hono();
conversationsRoute.use("*", requireAuth);

function isAdmin(c: any): boolean {
  const s = c.get("user");
  return !!s?.phone && ADMIN_PHONES.includes(s.phone);
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
