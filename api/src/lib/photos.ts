/**
 * pet_photos repo — CRUD + auto-primary logic.
 *
 * pet_photos rows linked tới pets qua pet_id (link_row).
 * 6 type-specific slots + 1 general multi.
 * Auto is_primary=true cho photo type=face đầu tiên per pet.
 */
import { listRows, createRow, deleteRow, updateRow } from "@shared/baserow.ts";
import { deleteObject } from "@shared/r2.ts";

export type PhotoType = "face" | "profile" | "full_body" | "marks" | "eye_close_up" | "nose_print" | "general";

export const TYPE_SPECIFIC: PhotoType[] = ["face", "profile", "full_body", "marks", "eye_close_up", "nose_print"];

const GENERAL_MAX = 10;

export interface BaserowPhoto {
  id: number;
  photo_url: string;
  pet_id?: Array<{ id: number; value: string }>;
  photo_type?: string | { id: number; value: string };
  caption?: string | null;
  uploaded_at?: string;
  is_primary?: boolean;
}

export function ownerIdsFromPhoto(p: BaserowPhoto): number[] {
  return (p.pet_id || []).map((r) => r.id);
}

/** List photos của pet, desc theo uploaded_at. */
export async function listPetPhotos(petId: number): Promise<BaserowPhoto[]> {
  const res = await listRows<BaserowPhoto>("pet_photos", {
    filter: { pet_id__link_row_has: String(petId) },
    orderBy: "-uploaded_at",
    size: 200,
  });
  return res.results;
}

/** Tập hợp các photo_type đã có cho pet (dùng cho completion calc). */
export async function getPhotoTypes(petId: number): Promise<Set<string>> {
  const photos = await listPetPhotos(petId);
  const types = new Set<string>();
  for (const p of photos) {
    const t = typeof p.photo_type === "object" ? p.photo_type?.value : p.photo_type;
    if (t) types.add(t);
  }
  return types;
}

/** Tìm photo theo id, return null nếu không tồn tại. */
export async function getPhotoById(photoId: number): Promise<BaserowPhoto | null> {
  // Baserow filter không hỗ trợ trên row id — dùng getRow trực tiếp + catch 404
  try {
    const { getRow } = await import("@shared/baserow.ts");
    return await getRow<BaserowPhoto>("pet_photos", photoId);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

/** Số lượng photo "general" hiện có cho pet (để giới hạn upload). */
async function countGeneralPhotos(petId: number): Promise<number> {
  const photos = await listPetPhotos(petId);
  return photos.filter((p) => {
    const t = typeof p.photo_type === "object" ? p.photo_type?.value : p.photo_type;
    return t === "general";
  }).length;
}

/** Trả về photo cùng type đang là is_primary (nếu có). */
async function findByType(petId: number, type: PhotoType): Promise<BaserowPhoto | null> {
  const photos = await listPetPhotos(petId);
  return (
    photos.find((p) => {
      const t = typeof p.photo_type === "object" ? p.photo_type?.value : p.photo_type;
      return t === type;
    }) || null
  );
}

/**
 * Extract R2 object key từ public URL.
 * VD: "https://pub-xxx.r2.dev/pets/4/3/photos/face-1234.jpg" → "pets/4/3/photos/face-1234.jpg"
 */
export function extractR2Key(photoUrl: string): string | null {
  if (!photoUrl) return null;
  try {
    const u = new URL(photoUrl);
    return u.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

/**
 * Create photo row.
 * - Nếu type ∈ TYPE_SPECIFIC và đã có 1 photo cùng type → REPLACE (xoá row + R2 cũ trước).
 * - Nếu type = "general" → append (max GENERAL_MAX, reject vượt).
 * - Auto is_primary=true nếu là photo "face" đầu tiên cho pet.
 */
export async function createPetPhoto(
  petId: number,
  type: PhotoType,
  photoUrl: string,
  caption: string | null
): Promise<BaserowPhoto> {
  // Replace logic cho type-specific
  if (TYPE_SPECIFIC.includes(type)) {
    const existing = await findByType(petId, type);
    if (existing) {
      // Delete R2 + Baserow row cũ
      const oldKey = extractR2Key(existing.photo_url);
      if (oldKey) {
        try {
          await deleteObject(oldKey);
        } catch (err) {
          console.warn(`[photos] failed to delete old R2 object ${oldKey}:`, err);
        }
      }
      await deleteRow("pet_photos", existing.id);
    }
  } else if (type === "general") {
    const count = await countGeneralPhotos(petId);
    if (count >= GENERAL_MAX) {
      const err = new Error(`Đã đạt giới hạn ${GENERAL_MAX} ảnh "khác". Vui lòng xoá ảnh cũ.`);
      (err as any).code = "GENERAL_LIMIT";
      throw err;
    }
  }

  // Auto is_primary cho photo face đầu tiên
  let isPrimary = false;
  if (type === "face") {
    const allPhotos = await listPetPhotos(petId);
    const hasFace = allPhotos.some((p) => {
      const t = typeof p.photo_type === "object" ? p.photo_type?.value : p.photo_type;
      return t === "face";
    });
    // Nếu chưa từng có face (sau khi replace ở trên → chưa có) → set primary
    isPrimary = !hasFace;
  }

  const created = await createRow<BaserowPhoto>("pet_photos", {
    photo_url: photoUrl,
    pet_id: [petId],
    photo_type: type,
    caption: caption || null,
    is_primary: isPrimary,
  });
  return created;
}

/** Delete photo: xoá R2 object + Baserow row. */
export async function deletePetPhoto(photo: BaserowPhoto): Promise<void> {
  const key = extractR2Key(photo.photo_url);
  if (key) {
    try {
      await deleteObject(key);
    } catch (err) {
      console.warn(`[photos] R2 delete failed for ${key}:`, err);
      // Tiếp tục xoá row Baserow để không lệch state
    }
  }
  await deleteRow("pet_photos", photo.id);
}

/** Get primary photo (is_primary=true) cho pet, fallback face mới nhất, fallback bất kỳ. */
export async function getPrimaryPhoto(petId: number): Promise<BaserowPhoto | null> {
  const photos = await listPetPhotos(petId);
  const primary = photos.find((p) => p.is_primary === true);
  if (primary) return primary;
  const face = photos.find((p) => {
    const t = typeof p.photo_type === "object" ? p.photo_type?.value : p.photo_type;
    return t === "face";
  });
  return face || photos[0] || null;
}
