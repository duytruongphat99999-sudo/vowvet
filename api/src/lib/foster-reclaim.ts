/**
 * FOSTER P3b — ADMIN lấy lại bé trao nhầm (reclaim) = làm NGƯỢC transferPet.
 *
 * An toàn: RECON trong code (tìm handover + khớp chủ hiện tại) TRƯỚC khi mutate.
 * Chỉ hoàn tác ĐÚNG 1 BƯỚC: bé phải còn ở tay người vừa nhận (to_user_id của handover mới nhất),
 * nếu bé đã bị trao tiếp → KHÔNG tự hoàn tác (tránh ghi đè nhầm chủ).
 *
 * KHÔNG đụng transferPet / recordFosterAct (FROZEN) — chỉ import calculateFosterTier (read-only).
 */
import { getRow, listRows, updateRow, deleteRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";
import { calculateFosterTier, type HeroActRow } from "./pet-heroes.ts";
import { findUserById } from "./users.ts";
import { findPetByQrCode } from "./pets.ts";

// foster_handovers chưa nằm trong union TableName (typing) — cast; runtime đọc theo config.
const HANDOVERS = "foster_handovers" as TableName;

export interface ReclaimResult {
  ok: boolean;
  reason?: string;
  pet_id?: number;
  returned_to?: number;
  new_count?: number;
  new_tier?: string | null;
  // Enrich cho UI: tên bé + mã passport + tên chủ được trả về (thay ID số khô khan).
  pet_name?: string;
  passport_code?: string;
  previous_owner_name?: string;
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

/** link_row pet_id ([{id,value}] hoặc [id]) chứa petId không? */
function linkHasPet(petIdField: any, petId: number): boolean {
  if (!Array.isArray(petIdField)) return false;
  return petIdField.some((v) => (v && typeof v === "object" ? v.id : v) === petId);
}

/** single_select / string → giá trị phẳng. */
function flat(v: any): string {
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  return v == null ? "" : String(v);
}

/**
 * Hoàn tác việc trao bé petId (chủ vừa nhận → trả về chủ ngay trước).
 * Caller (route admin) đã auth + requireAdmin.
 */
export async function reclaimPet(petId: number): Promise<ReclaimResult> {
  // === RECON (anti-clobber) — KHÔNG mutate gì cho tới khi qua đủ guard ===

  // 1. Tìm handover MỚI NHẤT của bé (loại 2 row trống mặc định: from_user_id null).
  const res = await listRows<any>(HANDOVERS, { size: 200 });
  const handovers = res.results
    .filter((h) => h.from_user_id != null && linkHasPet(h.pet_id, petId))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  if (handovers.length === 0) {
    return { ok: false, reason: "Không có lịch sử trao để hoàn tác" };
  }
  const handover = handovers[0];
  const fromUserId = Number(handover.from_user_id); // chủ NGAY TRƯỚC (trả bé về đây)
  const toUserId = Number(handover.to_user_id); // người vừa nhận

  // 2. Bé hiện phải còn ở tay người vừa nhận (to_user_id). Lệch → đã trao tiếp, KHÔNG tự hoàn tác.
  let pet: any = null;
  try { pet = await getRow<any>("pets", petId); } catch { pet = null; }
  if (!pet) return { ok: false, reason: "Không tìm thấy bé" };
  const currentOwner = extractUserId(pet.user_id);
  if (currentOwner !== toUserId) {
    return { ok: false, reason: "Trạng thái bé không khớp handover mới nhất, không tự hoàn tác" };
  }

  // === MUTATE — làm NGƯỢC R5, thứ tự an toàn ===

  // 3. Trả bé về chủ ngay trước.
  await updateRow("pets", petId, { user_id: [fromUserId] });

  // 4. Trừ credit foster của NGƯỜI TRAO (clamp ≥ 0) + tính lại tier theo count mới.
  const user: any = await findUserById(fromUserId);
  const count = Number(user?.foster_acts_count) || 0;
  const newCount = Math.max(0, count - 1);
  const newTier = calculateFosterTier(newCount);
  await updateRow("users", fromUserId, {
    foster_acts_count: newCount,
    foster_badge_tier: newTier, // single_select value hoặc null
  });

  // 5. Xoá đúng 1 row hero_acts foster_care mới nhất của người trao cho bé này.
  const actsRes = await listRows<HeroActRow>("hero_acts", {
    filter: { user_id__equal: String(fromUserId) },
    size: 200,
    orderBy: "-created_at",
  });
  const fosterAct = actsRes.results.find(
    (a) => flat(a.act_type) === "foster_care" && linkHasPet(a.pet_id, petId)
  );
  if (fosterAct) {
    await deleteRow("hero_acts", fosterAct.id);
  }

  // 6. Xoá row lịch sử handover (quyết định: xoá hẳn, không giữ audit).
  await deleteRow(HANDOVERS, handover.id);

  return {
    ok: true,
    pet_id: petId,
    returned_to: fromUserId,
    new_count: newCount,
    new_tier: newTier,
    pet_name: flat(pet.name),
    passport_code: flat(pet.qr_code),
    previous_owner_name: flat(user?.name),
  };
}

/**
 * Reclaim theo MÃ PASSPORT (qr_code) thay vì ID số — admin biết mã passport,
 * không biết ID Baserow. Lookup qr_code → petId → gọi reclaimPet cũ (KHÔNG đổi logic).
 * Passport luôn UPPERCASE (xem qr.ts) → normalize input trước khi tra.
 */
export async function reclaimPetByPassport(passportCode: string): Promise<ReclaimResult> {
  const code = (passportCode || "").trim().toUpperCase();
  if (!code) return { ok: false, reason: "Thiếu mã passport" };
  const pet = await findPetByQrCode(code);
  if (!pet) return { ok: false, reason: "Không tìm thấy bé với mã passport này" };
  return reclaimPet(pet.id);
}
