/**
 * Telehealth Chat repository (M9.2).
 *
 * Layered:
 *   - shared/zod-schemas/chat.ts → input validation
 *   - api/lib/chat.ts            → DB CRUD + business logic
 *   - api/lib/chat-notifications  → side effects (Zalo + push)
 *   - api/routes/chat.ts          → HTTP owner
 *   - api/routes/vet.ts           → HTTP vet
 *
 * Date fields lưu dạng ISO 8601 text (Baserow text field) — sortable lex
 * khi order_by="-last_message_at" hoặc "-created_at".
 *
 * Ownership matrix (enforced trong handlers/lib):
 *   - getThread: owner OR vet đang handle OR any vet (read-only queue context)
 *   - sendMessage: owner OR thread.vet_user_id (strict)
 *   - claimThread: vet AND status=waiting_vet AND not self-care of own pet
 *   - closeThread: owner OR thread.vet_user_id
 */
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";
import { findUserById, type BaserowUser } from "./users.ts";
import {
  getSymptom,
  type TriageSymptom,
} from "@shared/triage-symptoms.ts";
import { getTriageSession } from "./triage.ts";
import type { UrgencyLevel } from "@shared/zod-schemas/triage.ts";

// ============================================================
// Types
// ============================================================

export type ThreadStatus = "open" | "closed" | "waiting_vet";
export type SenderRole = "owner" | "vet" | "system";

export interface ChatThread {
  id: number;
  subject: string;
  pet_id: number | null;
  owner_user_id: number;
  vet_user_id: number | null;
  status: ThreadStatus;
  last_message_at: string;
  last_message_preview: string;
  escalated_from_triage_session_id: number | null;
  unread_count_owner: number;
  unread_count_vet: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  thread_id: number;
  sender_user_id: number;
  sender_role: SenderRole;
  content: string;
  attachment_url: string | null;
  is_system_message: boolean;
  created_at: string;
}

// ============================================================
// Helpers
// ============================================================

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function flatLink(v: any): number | null {
  if (!v) return null;
  if (Array.isArray(v) && v[0]?.id) return v[0].id;
  return null;
}

function flatThread(r: any): ChatThread {
  return {
    id: r.id,
    subject: r.subject || "",
    pet_id: flatLink(r.pet_id),
    owner_user_id: flatLink(r.owner_user_id) || 0,
    vet_user_id: flatLink(r.vet_user_id),
    status: (flatVal<ThreadStatus>(r.status) as ThreadStatus) || "open",
    last_message_at: r.last_message_at || r.created_at || "",
    last_message_preview: r.last_message_preview || "",
    escalated_from_triage_session_id: flatLink(r.escalated_from_triage_session_id),
    unread_count_owner: Number(r.unread_count_owner) || 0,
    unread_count_vet: Number(r.unread_count_vet) || 0,
    created_at: r.created_at || "",
  };
}

function flatMessage(r: any): ChatMessage {
  return {
    id: r.id,
    thread_id: flatLink(r.thread_id) || 0,
    sender_user_id: flatLink(r.sender_user_id) || 0,
    sender_role: (flatVal<SenderRole>(r.sender_role) as SenderRole) || "owner",
    content: r.content || "",
    attachment_url: r.attachment_url || null,
    is_system_message: r.is_system_message === true,
    created_at: r.created_at || "",
  };
}

function previewOf(content: string, max = 100): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

// ============================================================
// Permission helpers
// ============================================================

/** True nếu user là vet (read user.is_vet boolean). */
export function isVet(user: BaserowUser | null | undefined): boolean {
  if (!user) return false;
  return (user as any).is_vet === true;
}

export interface ThreadPermission {
  canRead: boolean;
  canSendAsOwner: boolean;
  canSendAsVet: boolean;
  canClaim: boolean;
  canClose: boolean;
  reason?: string;
}

export function computeThreadPermission(
  thread: ChatThread,
  user: BaserowUser
): ThreadPermission {
  const userId = user.id;
  const isOwner = thread.owner_user_id === userId;
  const isHandlingVet = thread.vet_user_id !== null && thread.vet_user_id === userId;
  const userIsVet = isVet(user);

  return {
    canRead: isOwner || isHandlingVet || userIsVet,
    canSendAsOwner: isOwner && thread.status !== "closed",
    canSendAsVet: isHandlingVet && thread.status !== "closed",
    canClaim:
      userIsVet &&
      thread.status === "waiting_vet" &&
      !isOwner /* prevent vet claiming own thread */,
    canClose: (isOwner || isHandlingVet) && thread.status !== "closed",
  };
}

// ============================================================
// Thread CRUD
// ============================================================

export interface CreateThreadInput {
  petId: number | null;
  subject: string;
  initialMessage: string;
  ownerId: number;
  escalatedFromTriageSessionId?: number | null;
}

/** Tạo thread + first message (owner). Status=waiting_vet, unread_vet=1. */
export async function createThread(input: CreateThreadInput): Promise<{
  thread: ChatThread;
  firstMessage: ChatMessage;
}> {
  const now = new Date().toISOString();
  const preview = previewOf(input.initialMessage);

  // 1. Create thread
  // Baserow link_row fields KHÔNG accept null — phải dùng [] cho empty
  const threadRow = await createRow<any>("chat_threads", {
    subject: input.subject,
    pet_id: input.petId ? [input.petId] : [],
    owner_user_id: [input.ownerId],
    vet_user_id: [],
    status: "waiting_vet",
    last_message_at: now,
    last_message_preview: preview,
    escalated_from_triage_session_id: input.escalatedFromTriageSessionId
      ? [input.escalatedFromTriageSessionId]
      : [],
    unread_count_owner: 0,
    unread_count_vet: 1,
    created_at: now,
  });

  const thread = flatThread(threadRow);

  // 2. Create first message (owner role)
  const msgRow = await createRow<any>("chat_messages", {
    thread_id: [thread.id],
    sender_user_id: [input.ownerId],
    sender_role: "owner",
    content: input.initialMessage,
    attachment_url: null,
    is_system_message: false,
    created_at: now,
  });

  return { thread, firstMessage: flatMessage(msgRow) };
}

/** List threads của owner — sort id desc (mới nhất trước). */
export async function listOwnerThreads(
  ownerId: number,
  limit = 50
): Promise<ChatThread[]> {
  const res = await listRows<any>("chat_threads", {
    filter: { owner_user_id__link_row_has: String(ownerId) },
    size: Math.min(200, limit),
  });
  const threads = res.results.filter((r: any) => r.subject).map(flatThread);
  // Sort by last_message_at DESC (newest first), fallback id desc
  threads.sort((a, b) => {
    const cmp = b.last_message_at.localeCompare(a.last_message_at);
    return cmp !== 0 ? cmp : b.id - a.id;
  });
  return threads.slice(0, limit);
}

/** Get single thread + verify permission (caller passes user). */
export async function getThread(threadId: number): Promise<ChatThread | null> {
  try {
    const row = await getRow<any>("chat_threads", threadId);
    if (!row.subject) return null;
    return flatThread(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

/** List messages của thread, sort id desc (mới nhất trước). Pagination cursor: beforeId. */
export async function listMessages(
  threadId: number,
  opts: { beforeId?: number; limit?: number } = {}
): Promise<ChatMessage[]> {
  const limit = Math.min(200, opts.limit || 50);
  const res = await listRows<any>("chat_messages", {
    filter: { thread_id__link_row_has: String(threadId) },
    size: 200, // fetch broadly then sort + slice
  });
  let messages = res.results.filter((r: any) => r.content).map(flatMessage);
  // Sort id desc
  messages.sort((a, b) => b.id - a.id);
  if (opts.beforeId) {
    messages = messages.filter((m) => m.id < opts.beforeId!);
  }
  return messages.slice(0, limit);
}

/** Mark thread read cho 1 role (set unread = 0). */
export async function markThreadRead(
  threadId: number,
  role: "owner" | "vet"
): Promise<void> {
  const field = role === "owner" ? "unread_count_owner" : "unread_count_vet";
  await updateRow("chat_threads", threadId, { [field]: 0 });
}

/** Close thread (set status=closed). */
export async function closeThread(threadId: number): Promise<ChatThread> {
  const row = await updateRow<any>("chat_threads", threadId, { status: "closed" });
  return flatThread(row);
}

// ============================================================
// Message send
// ============================================================

export interface SendMessageInput {
  threadId: number;
  thread: ChatThread; // pass pre-loaded để tránh extra fetch
  senderId: number;
  senderRole: SenderRole;
  content: string;
  attachmentUrl?: string | null;
  isSystem?: boolean;
}

/** Send message + update thread.last_message_at / preview / unread counter của ROLE đối diện. */
export async function sendMessage(input: SendMessageInput): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const preview = previewOf(input.content);

  // 1. Insert message
  const row = await createRow<any>("chat_messages", {
    thread_id: [input.threadId],
    sender_user_id: [input.senderId],
    sender_role: input.senderRole,
    content: input.content,
    attachment_url: input.attachmentUrl || null,
    is_system_message: input.isSystem === true,
    created_at: now,
  });

  // 2. Update thread aggregates
  const updates: Record<string, unknown> = {
    last_message_at: now,
    last_message_preview: preview,
  };
  // Increment unread cho role đối diện (system message → tăng cả 2 nếu cần, nhưng spec không yêu cầu)
  if (input.senderRole === "owner") {
    updates.unread_count_vet = (input.thread.unread_count_vet || 0) + 1;
  } else if (input.senderRole === "vet") {
    updates.unread_count_owner = (input.thread.unread_count_owner || 0) + 1;
  } else if (input.senderRole === "system") {
    // system message escalation → vet sẽ thấy queue → tăng unread_vet
    updates.unread_count_vet = (input.thread.unread_count_vet || 0) + 1;
  }
  await updateRow("chat_threads", input.threadId, updates);

  return flatMessage(row);
}

// ============================================================
// Vet queue + claim
// ============================================================

/** Vet queue: status=waiting_vet, sort id ASC (FIFO oldest first). */
export async function listVetQueue(limit = 50): Promise<ChatThread[]> {
  const res = await listRows<any>("chat_threads", {
    filter: { status__single_select_equal: "waiting_vet" },
    size: 200,
  });
  const threads = res.results.filter((r: any) => r.subject).map(flatThread);
  // Filter (defensive — Baserow filter có thể không strict)
  const waiting = threads.filter((t) => t.status === "waiting_vet");
  waiting.sort((a, b) => a.id - b.id); // FIFO: oldest id first
  return waiting.slice(0, limit);
}

/**
 * Vet claim thread.
 * Race condition guard:
 *   1. Read thread fresh
 *   2. Verify status === waiting_vet
 *   3. Verify owner_user_id !== vetId (block self-care)
 *   4. Update vet_user_id + status=open
 *   5. Re-read + verify vet_user_id === vetId (detect race lost)
 */
export async function claimThread(
  threadId: number,
  vetId: number
): Promise<{ thread: ChatThread; raceLost: boolean }> {
  const current = await getThread(threadId);
  if (!current) {
    const err = new Error("Thread không tồn tại");
    (err as any).status = 404;
    (err as any).code = "NOT_FOUND";
    throw err;
  }
  if (current.status !== "waiting_vet") {
    const err = new Error(
      `Thread không ở trạng thái chờ vet (status=${current.status})`
    );
    (err as any).status = 409;
    (err as any).code = "THREAD_NOT_WAITING";
    throw err;
  }
  if (current.owner_user_id === vetId) {
    const err = new Error("Bác sĩ không thể nhận case của chính mình");
    (err as any).status = 403;
    (err as any).code = "SELF_CARE_BLOCKED";
    throw err;
  }

  await updateRow("chat_threads", threadId, {
    vet_user_id: [vetId],
    status: "open",
  });

  // Re-read để verify race
  const after = await getThread(threadId);
  const raceLost = !after || after.vet_user_id !== vetId;
  if (raceLost) {
    const err = new Error("Thread đã được bác sĩ khác claim");
    (err as any).status = 409;
    (err as any).code = "CLAIM_RACE_LOST";
    throw err;
  }
  return { thread: after, raceLost: false };
}

/** Threads vet này đang/đã handle. Filter optional status. */
export async function listVetMine(
  vetId: number,
  statusFilter?: ThreadStatus,
  limit = 50
): Promise<ChatThread[]> {
  const res = await listRows<any>("chat_threads", {
    filter: { vet_user_id__link_row_has: String(vetId) },
    size: 200,
  });
  let threads = res.results.filter((r: any) => r.subject).map(flatThread);
  if (statusFilter) {
    threads = threads.filter((t) => t.status === statusFilter);
  }
  threads.sort((a, b) => {
    const cmp = b.last_message_at.localeCompare(a.last_message_at);
    return cmp !== 0 ? cmp : b.id - a.id;
  });
  return threads.slice(0, limit);
}

// ============================================================
// Triage escalation
// ============================================================

/** Tìm existing thread escalated từ triage session — nếu có, return id (prevent duplicate). */
export async function findThreadByTriageSession(
  sessionId: number
): Promise<ChatThread | null> {
  try {
    const res = await listRows<any>("chat_threads", {
      filter: { escalated_from_triage_session_id__link_row_has: String(sessionId) },
      size: 5,
    });
    const candidates = res.results.filter((r: any) => r.subject).map(flatThread);
    return candidates[0] || null;
  } catch {
    return null;
  }
}

const URGENCY_LABEL_VI: Record<number, string> = {
  1: "Bình thường",
  2: "Theo dõi 24h",
  3: "Gọi bác sĩ",
  4: "Khám trong 24h",
  5: "CẤP CỨU NGAY",
};

const SPECIES_VI: Record<string, string> = {
  dog: "Chó",
  cat: "Mèo",
  "Chó": "Chó",
  "Mèo": "Mèo",
  other: "Thú cưng",
};

function formatAgeVi(dob: string | null | undefined): string {
  if (!dob) return "không rõ tuổi";
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "không rõ tuổi";
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth.getTime())) return "không rõ tuổi";
  const months = Math.floor((Date.now() - birth.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months < 0) return "không rõ tuổi";
  if (months < 12) return `${months} tháng tuổi`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} tuổi ${rem} tháng` : `${years} tuổi`;
}

function buildEscalationSystemMessage(
  pet: any,
  symptoms: TriageSymptom[],
  durationHours: number,
  urgencyLevel: UrgencyLevel,
  reasoning: string,
  recommended: string
): string {
  const speciesRaw =
    typeof pet.species === "object" ? pet.species?.value : pet.species;
  const speciesVi = SPECIES_VI[speciesRaw] || "thú cưng";
  const ageStr = formatAgeVi(pet.dob);
  const weightStr = pet.weight_kg ? `${pet.weight_kg}kg` : "(chưa nhập cân nặng)";
  const symptomList = symptoms.map((s) => s.name_vi).join("; ");
  const urgencyLabel = URGENCY_LABEL_VI[urgencyLevel] || "—";

  return `[Tự động từ AI Triage]
Pet: ${pet.name}, ${speciesVi}, ${ageStr}, ${weightStr}
Triệu chứng: ${symptomList}
Thời gian: ${durationHours}h
Mức khẩn cấp: ${urgencyLevel}/5 (${urgencyLabel})

Phân tích AI:
${reasoning}

Đề xuất:
${recommended}`;
}

/**
 * Escalate triage session → chat thread.
 * Idempotent: nếu thread đã tồn tại cho session này, return existing.
 */
export async function escalateTriageToChat(
  sessionId: number,
  ownerId: number,
  pet: any,
  opts: { subjectOverride?: string } = {}
): Promise<{ thread: ChatThread; created: boolean }> {
  // 1. Load triage session
  const session = await getTriageSession(sessionId);
  if (!session) {
    const err = new Error("Triage session không tồn tại");
    (err as any).status = 404;
    (err as any).code = "TRIAGE_NOT_FOUND";
    throw err;
  }

  // 2. Verify ownership through pet — caller passed pet (already ownership-checked)
  if (session.pet_id !== pet.id) {
    const err = new Error("Session không thuộc pet này");
    (err as any).status = 403;
    (err as any).code = "FORBIDDEN";
    throw err;
  }

  // 3. Verify urgency >= 3
  if (session.ai_urgency_level < 3) {
    const err = new Error(
      `Mức khẩn cấp ${session.ai_urgency_level}/5 không cần escalate. Tự theo dõi tại nhà.`
    );
    (err as any).status = 400;
    (err as any).code = "ESCALATION_NOT_NEEDED";
    throw err;
  }

  // 4. Check existing thread (prevent duplicate)
  const existing = await findThreadByTriageSession(sessionId);
  if (existing) {
    return { thread: existing, created: false };
  }

  // 5. Build subject + system message
  const subject =
    opts.subjectOverride?.trim() ||
    `Triage cấp độ ${session.ai_urgency_level} — ${pet.name}`;

  const symptoms: TriageSymptom[] = [];
  for (const sid of session.symptoms_json) {
    const s = getSymptom(sid);
    if (s) symptoms.push(s);
  }

  const systemContent = buildEscalationSystemMessage(
    pet,
    symptoms,
    session.duration_hours,
    session.ai_urgency_level,
    session.ai_reasoning_text,
    session.ai_recommended_action
  );

  // 6. Create thread (without firstMessage so we can insert system message instead)
  const now = new Date().toISOString();
  const preview = previewOf(systemContent);
  const threadRow = await createRow<any>("chat_threads", {
    subject,
    pet_id: pet.id ? [pet.id] : [],
    owner_user_id: [ownerId],
    vet_user_id: [],
    status: "waiting_vet",
    last_message_at: now,
    last_message_preview: preview,
    escalated_from_triage_session_id: [sessionId],
    unread_count_owner: 0,
    unread_count_vet: 1,
    created_at: now,
  });
  const thread = flatThread(threadRow);

  // 7. Insert system message
  await createRow<any>("chat_messages", {
    thread_id: [thread.id],
    sender_user_id: [ownerId], // owner triggered, but flagged is_system_message
    sender_role: "system",
    content: systemContent,
    attachment_url: null,
    is_system_message: true,
    created_at: now,
  });

  return { thread, created: true };
}

// ============================================================
// Rate limiting (in-memory, simple Phase 0)
// ============================================================

const threadCreateLimits = new Map<number, number[]>(); // userId → timestamps
const messageSendLimits = new Map<number, number[]>(); // threadId → timestamps
const WINDOW_MS = 60 * 1000;

function pruneOld(arr: number[]): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return arr.filter((t) => t > cutoff);
}

/** Check thread create rate: max 5/min/user. Returns true nếu OK. */
export function checkThreadCreateRate(userId: number, max = 5): boolean {
  const recent = pruneOld(threadCreateLimits.get(userId) || []);
  if (recent.length >= max) {
    threadCreateLimits.set(userId, recent);
    return false;
  }
  recent.push(Date.now());
  threadCreateLimits.set(userId, recent);
  return true;
}

/** Check message send rate: max 30/min/thread. Returns true nếu OK. */
export function checkMessageSendRate(threadId: number, max = 30): boolean {
  const recent = pruneOld(messageSendLimits.get(threadId) || []);
  if (recent.length >= max) {
    messageSendLimits.set(threadId, recent);
    return false;
  }
  recent.push(Date.now());
  messageSendLimits.set(threadId, recent);
  return true;
}

// ============================================================
// Vet utility helpers
// ============================================================

/** List tất cả users với is_vet=true (cho notification fanout). */
export async function listAllVets(): Promise<BaserowUser[]> {
  const res = await listRows<BaserowUser>("users", {
    filter: { is_vet__boolean: "true" },
    size: 50,
  });
  return res.results.filter((u: any) => u.phone && !u.deleted_at && u.is_vet === true);
}

/** Tóm tắt vet info cho UI bubble: tên hoặc credentials. */
export function vetDisplayName(vet: BaserowUser | null | undefined): string {
  if (!vet) return "Bác sĩ";
  const v = vet as any;
  if (v.name) return v.name;
  if (v.vet_credentials) return v.vet_credentials;
  return v.phone || "Bác sĩ";
}
