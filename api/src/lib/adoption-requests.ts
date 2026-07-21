/**
 * ADOPTION-REQUESTS (W-G foster-care) — user xin nhận nuôi bé đang foster (từ browse).
 * Chủ pet HOẶC admin duyệt → route gọi transferPet (đổi chủ) → gỡ pet khỏi pool foster.
 *
 * Bảng adoption_requests (727): pet_id(NUMBER), requester_user_id(number),
 *   status(pending|approved|rejected|cancelled), message(long_text nullable),
 *   created_at, decided_at?, decided_by?, deleted_at?.
 *
 * Pattern copy reclaim-requests.ts (idempotent + guard-pending). GATE (owner|admin) Ở ROUTE.
 * KHÔNG sửa reclaim-requests / foster-transfer (FROZEN, chỉ gọi từ route).
 */
import { listRows, getRow, createRow, updateRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";

const ADOPTION = "adoption_requests" as TableName; // chưa nằm trong union — cast, runtime đọc config
const flat = (v: any): string => (v && typeof v === "object" && "value" in v ? String(v.value) : v == null ? "" : String(v));

export interface AdoptionRequest {
  id: number;
  pet_id: number;
  requester_user_id: number;
  status: string;
  message: string;
  created_at: string;
  decided_at: string | null;
  decided_by: number | null;
}

function mapRow(r: any): AdoptionRequest {
  return {
    id: r.id,
    pet_id: Number(r.pet_id) || 0,
    requester_user_id: Number(r.requester_user_id) || 0,
    status: flat(r.status),
    message: r.message || "",
    created_at: r.created_at || "",
    decided_at: r.decided_at || null,
    decided_by: r.decided_by != null ? Number(r.decided_by) : null,
  };
}

/** Tạo yêu cầu xin nhận. Guard chống spam: 1 pending/user/pet → { ok:false }. */
export async function createAdoptionRequest(
  petId: number,
  requesterSub: number,
  message?: string | null
): Promise<{ ok: boolean; reason?: string; id?: number }> {
  const pend = await listRows<any>(ADOPTION, {
    filter: { pet_id__equal: String(petId), requester_user_id__equal: String(requesterSub), status__equal: "pending" },
    size: 1,
  });
  if (pend.results.length > 0) {
    return { ok: false, reason: "Bạn đã gửi yêu cầu xin nhận bé này rồi" };
  }
  const row = await createRow<any>(ADOPTION, {
    pet_id: petId,
    requester_user_id: requesterSub,
    status: "pending",
    message: (message || "").trim(),
    created_at: new Date().toISOString(),
  });
  return { ok: true, id: row.id };
}

/** Request pending của 1 pet (chủ xem trước khi duyệt). */
export async function listPendingForPet(petId: number): Promise<AdoptionRequest[]> {
  const res = await listRows<any>(ADOPTION, {
    filter: { pet_id__equal: String(petId), status__equal: "pending" },
    size: 200,
    orderBy: "-created_at",
  });
  return res.results.map(mapRow);
}

/** Tất cả request pending (admin queue). */
export async function listAllPending(): Promise<AdoptionRequest[]> {
  const res = await listRows<any>(ADOPTION, {
    filter: { status__equal: "pending" },
    size: 200,
    orderBy: "-created_at",
  });
  return res.results.map(mapRow);
}

/** 1 request theo id (null nếu không có). */
export async function getAdoptionRequestById(reqId: number): Promise<AdoptionRequest | null> {
  const r = await getRow<any>(ADOPTION, reqId).catch(() => null);
  return r ? mapRow(r) : null;
}

/**
 * Duyệt/từ chối. IDEMPOTENT: status≠pending → no-op ("đã xử lý", không trao 2 lần).
 * approve → onApprove() (route lo transfer + gỡ pool) chạy TRƯỚC set approved
 *   → throw thì KHÔNG set approved (giữ pending để thử lại). reject → set rejected.
 * GATE (owner|admin) Ở ROUTE — hàm này KHÔNG tự check quyền.
 */
export async function decideAdoptionRequest(
  reqId: number,
  approverSub: number,
  action: "approve" | "reject",
  onApprove?: (req: AdoptionRequest) => Promise<void>
): Promise<{ ok: boolean; reason?: string; already?: boolean; status?: string }> {
  const req = await getAdoptionRequestById(reqId);
  if (!req) return { ok: false, reason: "Không tìm thấy yêu cầu" };
  if (req.status !== "pending") return { ok: false, already: true, reason: "Yêu cầu đã được xử lý" };

  const decided = { decided_by: approverSub, decided_at: new Date().toISOString() };
  if (action === "approve") {
    if (onApprove) await onApprove(req); // transfer + applyFosterDisable — throw → dừng, GIỮ pending
    await updateRow(ADOPTION, reqId, { status: "approved", ...decided });
    return { ok: true, status: "approved" };
  }
  await updateRow(ADOPTION, reqId, { status: "rejected", ...decided });
  return { ok: true, status: "rejected" };
}
