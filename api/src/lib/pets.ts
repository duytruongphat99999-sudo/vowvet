/**
 * Pet repository — CRUD + ownership check.
 * Tách riêng từ users.ts để rõ scope.
 */
import { getRow, updateRow, deleteRow, listRows } from "@shared/baserow.ts";
import type { BaserowPet } from "./users.ts";

/** Trích user IDs từ link_row field (Baserow trả về dạng [{id, value}]). */
export function ownerIds(pet: BaserowPet): number[] {
  if (!pet.user_id) return [];
  return pet.user_id.map((u) => u.id);
}

/** Lỗi ownership/not-found với HTTP status. Caller bắt và return JSON tương ứng. */
export class PetAccessError extends Error {
  constructor(public status: 404 | 403, public code: string, message: string) {
    super(message);
  }
}

/**
 * Lấy pet theo id và verify user là chủ.
 * Throw 404 nếu không tìm thấy, 403 nếu không phải owner.
 */
export async function getOwnedPet(petId: number, userId: number): Promise<BaserowPet> {
  let pet: BaserowPet;
  try {
    pet = await getRow<BaserowPet>("pets", petId);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("404")) {
      throw new PetAccessError(404, "PET_NOT_FOUND", "Không tìm thấy thú cưng");
    }
    throw err;
  }
  if (!ownerIds(pet).includes(userId)) {
    throw new PetAccessError(403, "FORBIDDEN", "Bạn không có quyền với thú cưng này");
  }
  return pet;
}

/** Cập nhật pet (caller đã verify ownership). */
export async function patchPet(petId: number, data: Record<string, unknown>): Promise<BaserowPet> {
  return updateRow<BaserowPet>("pets", petId, data);
}

/** Xoá hẳn pet (Phase 0: hard delete, schema không có deleted_at). */
export async function hardDeletePet(petId: number): Promise<void> {
  await deleteRow("pets", petId);
}

/** Tìm pet theo qr_code (cho public passport). Không filter theo owner. */
export async function findPetByQrCode(qrCode: string): Promise<BaserowPet | null> {
  const res = await listRows<BaserowPet>("pets", {
    filter: { qr_code__equal: qrCode },
    size: 1,
  });
  return res.results[0] || null;
}

/** Mask phone +84xxxxxxxxx → "+84***xxx" (giữ 3 đầu + 3 cuối). */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return "***";
  return phone.slice(0, 3) + "***" + phone.slice(-3);
}
