/**
 * Profile orchestration: fetch full data + calculate completion + save back.
 *
 * Nguyên tắc:
 *   - Mỗi lần user PATCH section → backend save fields → recalc completion → save profile_completion_pct.
 *   - GET /completion endpoint cũng dùng function này (luôn fresh).
 */
import { getRow, updateRow } from "@shared/baserow.ts";
import {
  calculateCompletion,
  type PetData,
  type ExternalData,
  type CompletionResult,
} from "@shared/profile-completion.ts";
import { getPhotoTypes } from "./photos.ts";
import { countAllHealth } from "./health-records.ts";

/** Load full pet + external data và tính completion. */
export async function computeCompletion(petId: number): Promise<CompletionResult> {
  const pet = await getRow<PetData>("pets", petId);
  const [photoTypes, healthCounts] = await Promise.all([
    getPhotoTypes(petId),
    countAllHealth(petId),
  ]);
  const ext: ExternalData = { photoTypes, healthCounts };
  return calculateCompletion(pet, ext);
}

/** Tính + save profile_completion_pct field vào Baserow. Idempotent. */
export async function recalcAndSave(petId: number): Promise<CompletionResult> {
  const result = await computeCompletion(petId);
  try {
    await updateRow("pets", petId, { profile_completion_pct: result.pct });
  } catch (err) {
    console.error("[profile] save completion_pct failed:", err);
    // Không throw — completion display vẫn dùng được từ caller
  }
  return result;
}
