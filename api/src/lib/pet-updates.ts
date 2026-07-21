/**
 * FOSTER-CARE W-C — feed update per-pet (bảng pet_updates 726).
 * Chủ đăng 1 lần, owner + MỌI sponsor của pet xem chung (feed, KHÔNG chat 1-1).
 * GATE Ở ROUTE (postUpdate=getOwnedPet owner-only · listUpdates=canViewPet owner+sponsor).
 * media_url/media_type để sẵn nullable (W-D wire upload).
 */
import { listRows, createRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";

const UPDATES = "pet_updates" as TableName;
const sel = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);

export interface PetUpdate {
  id: number;
  content: string;
  author_user_id: number | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
}

/** Chủ đăng update. GATE owner-only Ở ROUTE (getOwnedPet trước khi gọi). */
export async function postUpdate(petId: number, authorSub: number, content: string): Promise<PetUpdate> {
  const now = new Date().toISOString();
  const text = content.trim();
  const row = await createRow<any>(UPDATES, {
    pet_id: [petId], // link_row = mảng row id (khớp foster_orders)
    author_user_id: authorSub,
    content: text,
    created_at: now,
  });
  return { id: row.id, content: text, author_user_id: authorSub, media_url: null, media_type: null, created_at: now };
}

/** Feed của pet, mới nhất trước. Bỏ soft-delete + row trống. GATE owner+sponsor Ở ROUTE (canViewPet). */
export async function listUpdates(petId: number): Promise<PetUpdate[]> {
  const r = await listRows<any>(UPDATES, {
    filter: { pet_id__link_row_has: String(petId) },
    size: 200,
    orderBy: "-created_at",
  });
  return r.results
    .filter((u) => sel(u.content) && !u.deleted_at) // bỏ row trống mặc định + soft-delete
    .map((u) => ({
      id: u.id,
      content: sel(u.content) || "",
      author_user_id: u.author_user_id != null ? Number(u.author_user_id) : null,
      media_url: u.media_url || null,
      media_type: sel(u.media_type) || null,
      created_at: u.created_at || "",
    }));
}
