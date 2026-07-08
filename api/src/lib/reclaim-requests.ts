/**
 * RECLAIM-REQUESTS (Hướng B) — user gửi yêu cầu lấy lại bé, admin duyệt.
 *
 * Bảng reclaim_requests (id 723): pet_id(num), pet_name, passport_code,
 *   requester_id(num), requester_name, handover_id(num),
 *   status(pending|resolved|expired), notified(bool), created_at(ISO text).
 *
 * KHÔNG đụng logic reclaim — approveRequest gọi reclaimPet() (FROZEN) nguyên trạng.
 */
import { listRows, getRow, createRow, updateRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";
import { reclaimPet } from "./foster-reclaim.ts";

const RECLAIM = "reclaim_requests" as TableName; // chưa nằm trong union — cast, runtime đọc config
const HANDOVERS = "foster_handovers" as TableName;

const WINDOW_MS = 72 * 3600 * 1000; // 72 giờ kể từ lúc trao

export interface ReclaimRequest {
  id: number;
  pet_id: number;
  pet_name: string;
  passport_code: string;
  requester_id: number;
  requester_name: string;
  handover_id: number;
  status: string;
  notified: boolean;
  created_at: string;
}

/** link_row pet_id ([{id}] hoặc [id]) chứa petId không? (foster_handovers.pet_id = link_row) */
function linkHasPet(petIdField: any, petId: number): boolean {
  if (!Array.isArray(petIdField)) return false;
  return petIdField.some((v) => (v && typeof v === "object" ? v.id : v) === petId);
}

/** link_row → id đầu tiên (pet.user_id đơn / handover.pet_id đơn). */
function firstLinkId(f: any): number | null {
  if (Array.isArray(f) && f.length > 0) {
    const v = f[0];
    if (v && typeof v === "object") return typeof v.id === "number" ? v.id : null;
    return typeof v === "number" ? v : null;
  }
  return null;
}

/** single_select / text → giá trị phẳng. */
function flat(v: any): string {
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  return v == null ? "" : String(v);
}

/** Tìm handover MỚI NHẤT của petId (loại 2 row trống: from_user_id null). */
async function latestHandover(petId: number): Promise<any | null> {
  const res = await listRows<any>(HANDOVERS, { size: 200 });
  const hs = res.results
    .filter((h) => h.from_user_id != null && linkHasPet(h.pet_id, petId))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return hs[0] || null;
}

export interface CreateReclaimParams {
  petId: number;
  petName: string;
  passportCode: string;
  requesterId: number;
  requesterName: string;
}

/**
 * Tạo yêu cầu lấy lại. handover_id DẪN XUẤT từ handover mới nhất (không nhận từ ngoài).
 * Guard fail → { ok:false, reason }.
 */
export async function createReclaimRequest(
  p: CreateReclaimParams
): Promise<{ ok: boolean; reason?: string }> {
  // 1) handover mới nhất tồn tại + đúng người trao
  const h = await latestHandover(p.petId);
  if (!h) return { ok: false, reason: "Bé này chưa từng được trao đi" };
  if (Number(h.from_user_id) !== p.requesterId) {
    return { ok: false, reason: "Bạn không phải người đã trao bé này" };
  }

  // 2) trong vòng 72 giờ
  const createdMs = new Date(String(h.created_at || "")).getTime();
  if (!createdMs || Date.now() - createdMs >= WINDOW_MS) {
    return { ok: false, reason: "Đã quá 72 giờ kể từ khi trao — không thể yêu cầu lấy lại" };
  }

  // 3) chưa có request pending cho pet này
  const pend = await listRows<any>(RECLAIM, {
    filter: { pet_id__equal: String(p.petId), status__equal: "pending" },
    size: 1,
  });
  if (pend.results.length > 0) {
    return { ok: false, reason: "Đã có yêu cầu đang chờ duyệt cho bé này" };
  }

  // 4) tạo row pending
  await createRow(RECLAIM, {
    pet_id: p.petId,
    pet_name: p.petName,
    passport_code: p.passportCode,
    requester_id: p.requesterId,
    requester_name: p.requesterName,
    handover_id: Number(h.id),
    status: "pending",
    notified: false,
    created_at: new Date().toISOString(),
  });
  return { ok: true };
}

/** Danh sách request pending, mới nhất trước. */
export async function getPendingRequests(): Promise<ReclaimRequest[]> {
  const res = await listRows<any>(RECLAIM, {
    filter: { status__equal: "pending" },
    size: 200,
    orderBy: "-created_at",
  });
  return res.results as ReclaimRequest[];
}

/**
 * Admin duyệt: gọi reclaimPet(pet_id) (FROZEN). OK → status=resolved, notified=false
 * (để dashboard chủ cũ hiện banner). Fail → trả reason từ reclaimPet.
 */
export async function approveRequest(
  requestId: number
): Promise<{ ok: boolean; reason?: string }> {
  const req: any = await getRow<any>(RECLAIM, requestId).catch(() => null);
  if (!req) return { ok: false, reason: "Không tìm thấy yêu cầu" };
  if (String(req.status) !== "pending") {
    return { ok: false, reason: "Yêu cầu đã được xử lý" };
  }

  const result = await reclaimPet(Number(req.pet_id));
  if (!result.ok) return { ok: false, reason: result.reason };

  await updateRow(RECLAIM, requestId, { status: "resolved", notified: false });
  return { ok: true };
}

/** Request đã resolved nhưng chưa báo cho chủ cũ (userId). Lọc notified ở JS (boolean). */
export async function getUnnotifiedResolved(userId: number): Promise<ReclaimRequest[]> {
  const res = await listRows<any>(RECLAIM, {
    filter: { requester_id__equal: String(userId), status__equal: "resolved" },
    size: 200,
    orderBy: "-created_at",
  });
  return res.results.filter((r: any) => !r.notified) as ReclaimRequest[];
}

/** Đánh dấu đã báo (tắt banner). */
export async function markNotified(requestId: number): Promise<void> {
  await updateRow(RECLAIM, requestId, { notified: true });
}

export interface ReclaimEligible {
  pet_id: number;
  pet_name: string;
  passport_code: string;
  hours_left: number;
}

/**
 * Danh sách bé mà userId ĐỦ ĐIỀU KIỆN gửi yêu cầu lấy lại (hiện card ở dashboard chủ cũ):
 *   - handover MỚI NHẤT của bé do userId trao (from_user_id === userId)
 *   - còn trong 72h
 *   - bé chưa về lại tay userId
 *   - chưa có request pending cho bé
 */
export async function getReclaimEligible(userId: number): Promise<ReclaimEligible[]> {
  const res = await listRows<any>(HANDOVERS, { size: 200 });
  const now = Date.now();

  // handover mới nhất theo từng pet
  const byPet = new Map<number, any>();
  for (const h of res.results) {
    if (h.from_user_id == null) continue;
    const pid = firstLinkId(h.pet_id);
    if (pid == null) continue;
    const prev = byPet.get(pid);
    if (!prev || String(h.created_at || "") > String(prev.created_at || "")) byPet.set(pid, h);
  }

  const out: ReclaimEligible[] = [];
  for (const [pid, h] of byPet) {
    if (Number(h.from_user_id) !== userId) continue; // latest phải do user này trao
    const createdMs = new Date(String(h.created_at || "")).getTime();
    if (!createdMs) continue;
    const elapsed = now - createdMs;
    if (elapsed >= WINDOW_MS) continue; // quá 72h

    const pet: any = await getRow<any>("pets", pid).catch(() => null);
    if (!pet) continue;
    if (firstLinkId(pet.user_id) === userId) continue; // bé đã về tay user rồi

    const pend = await listRows<any>(RECLAIM, {
      filter: { pet_id__equal: String(pid), status__equal: "pending" },
      size: 1,
    });
    if (pend.results.length > 0) continue; // đã có request chờ

    out.push({
      pet_id: pid,
      pet_name: flat(pet.name),
      passport_code: flat(pet.qr_code),
      hours_left: Math.max(0, Math.ceil((WINDOW_MS - elapsed) / 3600000)),
    });
  }
  return out;
}
