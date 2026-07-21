/**
 * Public Pet Card repository (M12).
 *
 * Lookup by slug → sanitize via PUBLIC_PET_FIELDS whitelist.
 * Owner-only enable/disable/update.
 * View + share counter increment (fire-and-forget).
 */
import { listRows, getRow, updateRow } from "@shared/baserow.ts";
import {
  sanitizePetPublic,
  sanitizePetFoster,
  pickFosterChild,
  FOSTER_VACCINE_FIELDS,
  FOSTER_WEIGHTLOG_FIELDS,
  FOSTER_DAILY_FIELDS,
} from "@shared/public-pet-fields.ts";
import { ensureUniqueSlug, findPetBySlug } from "./slug.ts";
import { getOwnedPet, PetAccessError } from "./pets.ts";
import { countFosterOrders, countFosterOrdersByPetIds } from "./foster-orders.ts";

export interface PublicPetData {
  public_slug: string;
  name: string;
  species: string | null;
  breed: string | null;
  gender: string | null;
  photo_url: string | null;
  dob_yearmonth: string | null;
  public_bio: string | null;
  public_quote: string | null;
  personality_type: string | null;
  personality_secondary_type: string | null;
  public_view_count: number;
}

/**
 * GET public pet by slug — return null nếu not found HOẶC is_public=false.
 * (KHÔNG reveal existence cho client.)
 */
export async function getPublicPetBySlug(slug: string): Promise<PublicPetData | Record<string, any> | null> {
  const pet = await findPetBySlug(slug);
  if (!pet) return null;
  if (pet.is_public !== true) return null;

  // Bé THƯỜNG → whitelist gốc (medical vẫn giấu). KHÔNG đổi.
  if ((pet as any).foster_public !== true) {
    return sanitizePetPublic(pet) as PublicPetData;
  }

  // FOSTER → whitelist mở rộng + fetch dữ liệu chứng minh chăm sóc (CHỈ cột whitelist).
  const base = sanitizePetFoster(pet) as Record<string, any>;
  base.is_foster_public = true; // cờ cho FE chọn layout (L2)

  const petId = (pet as any).id;
  const [vac, wlogs, daily, donationCount] = await Promise.all([
    listRows<any>("vaccines", { filter: { pet_id__link_row_has: String(petId) }, size: 200 })
      .then((r) => r.results).catch(() => []),
    listRows<any>("weight_logs", { filter: { pet_id__link_row_has: String(petId) }, size: 200 })
      .then((r) => r.results).catch(() => []),
    listRows<any>("daily_check_ins", { filter: { pet_id__link_row_has: String(petId) }, size: 200 })
      .then((r) => r.results).catch(() => []),
    countFosterOrders(petId).catch(() => 0),   // ← L5c THÊM
  ]);
  base.foster_vaccines = vac.map((v: any) => pickFosterChild(v, FOSTER_VACCINE_FIELDS));
  base.foster_weight_logs = wlogs.map((w: any) => pickFosterChild(w, FOSTER_WEIGHTLOG_FIELDS));
  base.foster_daily = daily.map((d: any) => pickFosterChild(d, FOSTER_DAILY_FIELDS));
  base.donation_count = donationCount;         // ← L5c THÊM
  return base;
}

/**
 * FOSTER L4a — list bé foster công khai (foster_public=true) cho board /foster.
 * Sanitize bằng FOSTER_PUBLIC_FIELDS (KHÔNG leak field cấm). Double-guard is_public.
 * KHÔNG fetch child tables (vaccine/weight/daily) — tránh N+1; card chỉ cần field pet,
 * chi tiết + chart ở /p/[slug].
 */
export async function listFosterPets(): Promise<Record<string, any>[]> {
  const res = await listRows<any>("pets", { filter: { foster_public__boolean: "true" }, size: 200 });
  const valid = res.results.filter((p) => p.foster_public === true && p.is_public === true);
  const counts = await countFosterOrdersByPetIds(valid.map((p) => p.id)); // 1 query, no N+1
  return valid.map((p) => {
    const card = sanitizePetFoster(p) as Record<string, any>;
    card.donation_count = counts[p.id] || 0;
    return card;
  });
}

/** Increment view counter (fire-and-forget — don't await). */
export function incrementViewCount(slug: string): void {
  (async () => {
    try {
      const pet = await findPetBySlug(slug);
      if (!pet || pet.is_public !== true) return;
      const current = Number(pet.public_view_count) || 0;
      await updateRow("pets", pet.id, { public_view_count: current + 1 });
    } catch (err) {
      console.error(`[public-pets] view count increment failed slug=${slug}:`, err);
    }
  })();
}

/** Increment share counter (fire-and-forget). */
export function incrementShareCount(slug: string): void {
  (async () => {
    try {
      const pet = await findPetBySlug(slug);
      if (!pet || pet.is_public !== true) return;
      const current = Number(pet.public_share_count) || 0;
      await updateRow("pets", pet.id, { public_share_count: current + 1 });
    } catch (err) {
      console.error(`[public-pets] share count increment failed slug=${slug}:`, err);
    }
  })();
}

/**
 * CORE bật public/foster — KHÔNG check owner (dùng chung: owner path SAU getOwnedPet + admin W-F).
 * Idempotent: đã có slug → reuse (link không đổi). Set is_public + public_enabled_at + foster_public
 * + VÁ W-E (foster_public bật mà chưa có foster_status → "cần tài trợ").
 * @param prefetched pet đã fetch sẵn (owner path truyền từ getOwnedPet → không fetch 2 lần).
 */
export async function applyFosterEnable(
  petId: number,
  data: { public_bio?: string | null; public_quote?: string | null; foster_public?: boolean } = {},
  prefetched?: any
): Promise<{ slug: string; pet: any }> {
  const pet: any = prefetched ?? (await getRow<any>("pets", petId));

  // Ensure slug — reuse existing nếu có (link không đổi khi re-enable)
  let slug: string = pet.public_slug || "";
  if (!slug) {
    slug = await ensureUniqueSlug(pet.name || "pet");
  }

  const updates: Record<string, unknown> = {
    public_slug: slug,
    is_public: true,
    public_enabled_at: new Date().toISOString(),
  };
  if (data.public_bio !== undefined) updates.public_bio = data.public_bio || null;
  if (data.public_quote !== undefined) updates.public_quote = data.public_quote || null;
  // FOSTER L1: bật/tắt cờ khoe bệnh án (default DB false). Chỉ ghi khi client gửi rõ.
  if (data.foster_public !== undefined) updates.foster_public = data.foster_public === true;

  // W-E vá: bật foster_public mà pet CHƯA có foster_status → default "cần tài trợ"
  // (để pet lên được danh sách /foster/browse). Đã có status → GIỮ nguyên, KHÔNG đè.
  if (data.foster_public === true) {
    const cur = pet.foster_status;
    const curVal = cur && typeof cur === "object" && "value" in cur ? cur.value : cur;
    if (!curVal) updates.foster_status = "cần tài trợ";
  }

  const updated = await updateRow("pets", petId, updates);
  return { slug, pet: updated };
}

/** CORE tắt public/foster — KHÔNG check owner. Tắt is_public + foster_public (không để cờ treo). */
export async function applyFosterDisable(petId: number): Promise<void> {
  await updateRow("pets", petId, { is_public: false, foster_public: false });
}

/**
 * Owner enable public profile — check owner RỒI gọi core (hành vi y hệt, gồm vá W-E).
 * Idempotent: nếu đã có slug, KHÔNG regenerate (giữ link cũ).
 */
export async function enablePublicProfile(
  petId: number,
  ownerId: number,
  data: { public_bio?: string | null; public_quote?: string | null; foster_public?: boolean } = {}
): Promise<{ slug: string; pet: any }> {
  const pet = await getOwnedPet(petId, ownerId);
  return applyFosterEnable(petId, data, pet); // pet prefetch → owner path chạy y như trước
}

/** Owner disable — check owner RỒI gọi core (giữ slug để re-enable không đổi link). */
export async function disablePublicProfile(petId: number, ownerId: number): Promise<void> {
  await getOwnedPet(petId, ownerId); // verify ownership
  await applyFosterDisable(petId);
}

/** Owner update public_bio + public_quote. */
export async function updatePublicProfile(
  petId: number,
  ownerId: number,
  data: { public_bio?: string | null; public_quote?: string | null }
): Promise<any> {
  await getOwnedPet(petId, ownerId);
  const updates: Record<string, unknown> = {};
  if (data.public_bio !== undefined) updates.public_bio = data.public_bio || null;
  if (data.public_quote !== undefined) updates.public_quote = data.public_quote || null;
  return updateRow("pets", petId, updates);
}

/** Stats for owner share page. */
export async function getPublicStats(
  petId: number,
  ownerId: number
): Promise<{
  is_public: boolean;
  public_slug: string | null;
  view_count: number;
  share_count: number;
  enabled_at: string | null;
  public_bio: string | null;
  public_quote: string | null;
}> {
  const pet = (await getOwnedPet(petId, ownerId)) as any;
  return {
    is_public: pet.is_public === true,
    public_slug: pet.public_slug || null,
    view_count: Number(pet.public_view_count) || 0,
    share_count: Number(pet.public_share_count) || 0,
    enabled_at: pet.public_enabled_at || null,
    public_bio: pet.public_bio || null,
    public_quote: pet.public_quote || null,
  };
}
