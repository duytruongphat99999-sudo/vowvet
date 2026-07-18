/**
 * CONVERSATIONS — chat support/foster (KHÔNG liên quan telehealth chat cũ ở lib/chat.ts).
 * Bảng conversations (724) + messages (725). Polling 5s ở FE; cleanup message > 30 ngày.
 */
import { listRows, getRow, createRow, updateRow, deleteRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";

const CONVERSATIONS = "conversations" as TableName;
const MESSAGES = "messages" as TableName;
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;
const MAX_CONTENT = 2000;

export type ConversationType = "admin_support" | "foster" | "matchmaking" | "direct";

export interface Conversation {
  id: number;
  type: ConversationType;
  user1_id: number;
  user2_id: number;
  context_id: number;
  context_type: string;
  last_msg_at: string;
  created_at: string;
  // enriched (không lưu DB)
  otherUserName?: string;
  lastMessage?: string;
  unreadCount?: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  created_at: string;
  read_at: string;
}

/** single_select / long_text / text → giá trị phẳng (string). */
function flat(v: any): string {
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  return v == null ? "" : String(v);
}

/**
 * Hàm 1 — tìm hoặc tạo conversation. Khớp: type + cặp user (2 chiều) + context_id (khi > 0).
 */
export async function findOrCreateConversation(
  type: ConversationType,
  user1_id: number,
  user2_id: number,
  context_id = 0,
  context_type = ""
): Promise<number> {
  const res = await listRows<any>(CONVERSATIONS, { size: 200 });
  const matches = res.results.filter((c) => {
    if (String(c.type) !== type) return false;
    if (context_id > 0 && Number(c.context_id) !== context_id) return false;
    const a = Number(c.user1_id), b = Number(c.user2_id);
    return (a === user1_id && b === user2_id) || (a === user2_id && b === user1_id);
  });
  if (matches.length > 0) {
    // N5: nếu race đã đẻ >1 phòng trùng cặp, LUÔN hội tụ về phòng CŨ NHẤT (created_at asc,
    // tiebreak id) để mọi request sau vào cùng 1 phòng — KHÔNG .find() tuỳ thứ tự Baserow trả.
    matches.sort((a, b) => {
      const t = String(a.created_at || "").localeCompare(String(b.created_at || ""));
      return t !== 0 ? t : Number(a.id) - Number(b.id);
    });
    return matches[0].id;
  }

  const now = new Date().toISOString();
  const row = await createRow<any>(CONVERSATIONS, {
    type, user1_id, user2_id, context_id, context_type, last_msg_at: now, created_at: now,
  });
  return row.id;
}

/**
 * Hàm 2 — conversations của 1 user, enrich tên người kia + last message + unread.
 */
export async function getConversations(userId: number): Promise<Conversation[]> {
  const [res, usersRes] = await Promise.all([
    listRows<any>(CONVERSATIONS, { size: 200 }),
    listRows<any>("users", { size: 200 }),
  ]);
  const nameById = new Map<number, string>();
  for (const u of usersRes.results) nameById.set(u.id, u.name || u.phone || u.email || `user ${u.id}`);

  const mine = res.results
    .filter((c) => Number(c.user1_id) === userId || Number(c.user2_id) === userId)
    .sort((a, b) => String(b.last_msg_at || "").localeCompare(String(a.last_msg_at || "")));

  const out: Conversation[] = [];
  for (const c of mine) {
    const otherId = Number(c.user1_id) === userId ? Number(c.user2_id) : Number(c.user1_id);
    const msgs = await listRows<any>(MESSAGES, {
      filter: { conversation_id__equal: String(c.id) },
      size: 200,
      orderBy: "-created_at",
    });
    const last = msgs.results[0];
    const unread = msgs.results.filter((m) => !flat(m.read_at) && Number(m.sender_id) !== userId).length;
    out.push({
      id: c.id,
      type: flat(c.type) as ConversationType,
      user1_id: Number(c.user1_id),
      user2_id: Number(c.user2_id),
      context_id: Number(c.context_id),
      context_type: flat(c.context_type),
      last_msg_at: flat(c.last_msg_at),
      created_at: flat(c.created_at),
      otherUserName: otherId === 0 ? "Admin VowVet" : nameById.get(otherId) || `user ${otherId}`,
      lastMessage: last ? flat(last.content) : "",
      unreadCount: unread,
    });
  }
  return out;
}

/**
 * Hàm 3 — messages của conversation. afterId → chỉ id lớn hơn (polling). Chỉ < 30 ngày.
 */
export async function getMessages(conversationId: number, afterId = 0): Promise<Message[]> {
  const res = await listRows<any>(MESSAGES, {
    filter: { conversation_id__equal: String(conversationId) },
    size: 200,
    orderBy: "created_at",
  });
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  return res.results
    .filter((m) => (afterId ? m.id > afterId : true))
    .filter((m) => {
      const t = m.created_at ? new Date(m.created_at).getTime() : 0;
      return t >= cutoff;
    })
    .map((m) => ({
      id: m.id,
      conversation_id: Number(m.conversation_id),
      sender_id: Number(m.sender_id),
      content: flat(m.content),
      created_at: flat(m.created_at),
      read_at: flat(m.read_at),
    }));
}

/**
 * Hàm 4 — gửi message + bump last_msg_at. Validate 1..2000 ký tự.
 */
export async function sendMessage(conversationId: number, senderId: number, content: string): Promise<Message> {
  const text = (content || "").trim();
  if (text.length === 0) throw new Error("Nội dung tin nhắn trống");
  if (text.length > MAX_CONTENT) throw new Error(`Nội dung quá dài (>${MAX_CONTENT} ký tự)`);

  const now = new Date().toISOString();
  const row = await createRow<any>(MESSAGES, {
    conversation_id: conversationId, sender_id: senderId, content: text, created_at: now, read_at: "",
  });
  await updateRow(CONVERSATIONS, conversationId, { last_msg_at: now });
  return { id: row.id, conversation_id: conversationId, sender_id: senderId, content: text, created_at: now, read_at: "" };
}

/**
 * Hàm 5 — mark đã đọc tin của người KIA trong conversation (tối đa 20 rows/lần).
 */
export async function markMessagesRead(conversationId: number, readerId: number): Promise<void> {
  const res = await listRows<any>(MESSAGES, {
    filter: { conversation_id__equal: String(conversationId) },
    size: 200,
  });
  const toMark = res.results
    .filter((m) => !flat(m.read_at) && Number(m.sender_id) !== readerId)
    .slice(0, 20);
  const now = new Date().toISOString();
  for (const m of toMark) await updateRow(MESSAGES, m.id, { read_at: now });
}

/**
 * Hàm 6 — tổng unread mọi conversation của user (badge).
 */
export async function getTotalUnread(userId: number): Promise<number> {
  const convs = await getConversations(userId);
  return convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
}

/**
 * Hàm 7 — xoá message > 30 ngày (tối đa 20 rows/lần). Trả số đã xoá.
 */
export async function cleanupOldMessages(): Promise<number> {
  const res = await listRows<any>(MESSAGES, { size: 200 });
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const old = res.results
    .filter((m) => {
      const t = m.created_at ? new Date(m.created_at).getTime() : 0;
      return t && t < cutoff;
    })
    .slice(0, 20);
  for (const m of old) await deleteRow(MESSAGES, m.id);
  return old.length;
}

/** Membership check dùng ở route (session.sub ∈ conversation). */
export async function getConversationRow(conversationId: number): Promise<any | null> {
  try {
    return await getRow<any>(CONVERSATIONS, conversationId);
  } catch {
    return null;
  }
}

/**
 * ADMIN badge — tổng tin CHƯA ĐỌC trong các hội thoại admin_support.
 * Đếm tin do USER THƯỜNG gửi & chưa đọc (read_at="" && sender_id === conv.user1_id).
 * FIX (đa-admin): trước đây lọc `sender_id !== adminId` → khi có NHIỀU admin, admin A
 * thấy tin do admin B gửi là "chưa đọc". Trong admin_support, user1_id LUÔN là user
 * thường (user2_id = 0 = admin, xem findOrCreateConversation("admin_support", s.sub, 0)),
 * nên đếm theo user1_id là chuẩn và an toàn với nhiều admin.
 * `adminId` giữ nguyên trong signature (không đổi caller) dù không còn dùng để lọc.
 */
export async function getAdminSupportUnread(adminId: number): Promise<number> {
  const res = await listRows<any>(CONVERSATIONS, { size: 200 });
  const supportConvs = res.results.filter((c) => flat(c.type) === "admin_support");
  let total = 0;
  for (const conv of supportConvs) {
    const msgs = await listRows<any>(MESSAGES, {
      filter: { conversation_id__equal: String(conv.id) },
      size: 200,
    });
    total += msgs.results.filter(
      (m) => !flat(m.read_at) && Number(m.sender_id) === Number(conv.user1_id)
    ).length;
  }
  return total;
}

/** ADMIN — TẤT CẢ conversations, enrich cặp tên + last message + unread. Sort last_msg_at desc. */
export async function getAllConversations(): Promise<Conversation[]> {
  const [res, usersRes] = await Promise.all([
    listRows<any>(CONVERSATIONS, { size: 200 }),
    listRows<any>("users", { size: 200 }),
  ]);
  const nameById = new Map<number, string>();
  for (const u of usersRes.results) nameById.set(u.id, u.name || u.phone || u.email || `user ${u.id}`);
  const nm = (id: number) => (id === 0 ? "Admin VowVet" : nameById.get(id) || `user ${id}`);

  const all = res.results
    .filter((c) => flat(c.type)) // bỏ 2 row trống mặc định (type rỗng)
    .sort((a, b) => String(b.last_msg_at || "").localeCompare(String(a.last_msg_at || "")));

  const out: Conversation[] = [];
  for (const c of all) {
    const msgs = await listRows<any>(MESSAGES, {
      filter: { conversation_id__equal: String(c.id) },
      size: 200,
      orderBy: "-created_at",
    });
    const last = msgs.results[0];
    out.push({
      id: c.id,
      type: flat(c.type) as ConversationType,
      user1_id: Number(c.user1_id),
      user2_id: Number(c.user2_id),
      context_id: Number(c.context_id),
      context_type: flat(c.context_type),
      last_msg_at: flat(c.last_msg_at),
      created_at: flat(c.created_at),
      otherUserName: `${nm(Number(c.user1_id))} ↔ ${nm(Number(c.user2_id))}`,
      lastMessage: last ? flat(last.content) : "",
      unreadCount: msgs.results.filter((m) => !flat(m.read_at)).length,
    });
  }
  return out;
}
