/**
 * FOSTER P3 — chuyển giao bé A→B (transfer ownership) + ghi điểm foster cho NGƯỜI TRAO.
 *
 * IRREVERSIBLE: đổi pets.user_id. Thứ tự PHÒNG THỦ:
 *   validate → ghi lịch sử foster_handovers TRƯỚC → đổi chủ → recordFosterAct.
 * Lịch sử giữ dấu chủ cũ (from_user_id) — không mất khi ghi đè user_id.
 */
import { getRow, createRow, updateRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";
import { recordFosterAct } from "./pet-heroes.ts";
import { findUserById } from "./users.ts";

// foster_handovers chưa nằm trong union TableName (typing) — cast; runtime đọc theo config.
const HANDOVERS = "foster_handovers" as TableName;

export class TransferError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** pet.user_id link_row ([{id,value}] hoặc [id]) → numeric owner id. */
function extractUserId(userIdField: any): number | null {
  if (Array.isArray(userIdField) && userIdField.length > 0) {
    const v = userIdField[0];
    if (v && typeof v === "object") return typeof v.id === "number" ? v.id : null;
    return typeof v === "number" ? v : null;
  }
  return null;
}

export interface TransferResult {
  pet_id: number;
  new_owner: number;
  handover_id: number;
  foster: { count: number; tier: string | null };
}

/**
 * Chuyển bé từ fromUserId sang toUserId. Caller (route) đã auth + xác định toUserId.
 * Tự validate lại đầy đủ (defense in depth — vùng irreversible).
 */
export async function transferPet(
  petId: number,
  fromUserId: number,
  toUserId: number
): Promise<TransferResult> {
  // 1. VALIDATE — sai bất kỳ → throw, KHÔNG mutate gì.
  if (toUserId === fromUserId) {
    throw new TransferError("SAME_USER", "Không thể trao bé cho chính mình", 400);
  }
  let pet: any = null;
  try { pet = await getRow<any>("pets", petId); } catch { pet = null; }
  if (!pet) throw new TransferError("PET_NOT_FOUND", "Không tìm thấy bé", 404);

  const ownerId = extractUserId(pet.user_id);
  if (ownerId !== fromUserId) {
    throw new TransferError("NOT_OWNER", "Bạn không phải chủ của bé này", 403);
  }

  const toUser = await findUserById(toUserId);
  if (!toUser) {
    throw new TransferError("RECIPIENT_NOT_FOUND", "Người nhận chưa có tài khoản VowVet", 404);
  }

  const petName: string = pet.name || "";
  const now = new Date().toISOString();

  // 2. GHI LỊCH SỬ TRƯỚC (giữ dấu chủ cũ kể cả nếu bước sau lỗi).
  const handover = await createRow<any>(HANDOVERS, {
    pet_id: [petId],
    from_user_id: fromUserId,
    to_user_id: toUserId,
    pet_name: petName,
    created_at: now,
  });

  // 3. ĐỔI CHỦ (irreversible).
  await updateRow("pets", petId, { user_id: [toUserId] });

  // 4. +1 foster cho NGƯỜI TRAO.
  const foster = await recordFosterAct(fromUserId, petId, petName);

  return {
    pet_id: petId,
    new_owner: toUserId,
    handover_id: handover.id,
    foster: { count: foster.foster_acts_count, tier: foster.foster_badge_tier },
  };
}
