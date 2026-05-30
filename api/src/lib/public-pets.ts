/**
 * Public Pet Card repository (M12).
 *
 * Lookup by slug → sanitize via PUBLIC_PET_FIELDS whitelist.
 * Owner-only enable/disable/update.
 * View + share counter increment (fire-and-forget).
 */
import { listRows, getRow, updateRow } from "@shared/baserow.ts";
import { sanitizePetPublic } from "@shared/public-pet-fields.ts";
import { ensureUniqueSlug, findPetBySlug } from "./slug.ts";
import { getOwnedPet, PetAccessError } from "./pets.ts";

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
export async function getPublicPetBySlug(slug: string): Promise<PublicPetData | null> {
  const pet = await findPetBySlug(slug);
  if (!pet) return null;
  if (pet.is_public !== true) return null;
  return sanitizePetPublic(pet) as PublicPetData;
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
 * Owner enable public profile.
 * Idempotent: nếu đã có slug, KHÔNG regenerate (giữ link cũ).
 * Set is_public=true + public_enabled_at=now + optional bio/quote.
 */
export async function enablePublicProfile(
  petId: number,
  ownerId: number,
  data: { public_bio?: string | null; public_quote?: string | null } = {}
): Promise<{ slug: string; pet: any }> {
  const pet = await getOwnedPet(petId, ownerId);

  // Ensure slug — reuse existing nếu có (link không đổi khi re-enable)
  let slug: string = (pet as any).public_slug || "";
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

  const updated = await updateRow("pets", petId, updates);
  return { slug, pet: updated };
}

/** Owner disable — set is_public=false, giữ slug để re-enable không đổi link. */
export async function disablePublicProfile(petId: number, ownerId: number): Promise<void> {
  await getOwnedPet(petId, ownerId); // verify ownership
  await updateRow("pets", petId, { is_public: false });
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
