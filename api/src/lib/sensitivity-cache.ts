/**
 * In-memory cache cho climate sensitivity scores.
 * TTL 24h. Invalidate khi pet profile section update (via invalidate()).
 *
 * Phase 0: container restart wipe cache → recalculate on next request.
 */
import {
  calculateSensitivity,
  type SensitivityResult,
  type PetSensitivityInput,
} from "@shared/climate-sensitivity.ts";

interface CachedEntry {
  result: SensitivityResult;
  expires_at: number;
}
const cache = new Map<number, CachedEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

/** Get sensitivity cho pet, cache 24h. */
export function getSensitivity(petId: number, pet: PetSensitivityInput): SensitivityResult {
  const cached = cache.get(petId);
  if (cached && cached.expires_at > Date.now()) return cached.result;
  const result = calculateSensitivity(pet);
  cache.set(petId, { result, expires_at: Date.now() + TTL_MS });
  return result;
}

/** Force recalc + cache (caller: profile section save). */
export function recalcSensitivity(petId: number, pet: PetSensitivityInput): SensitivityResult {
  const result = calculateSensitivity(pet);
  cache.set(petId, { result, expires_at: Date.now() + TTL_MS });
  return result;
}

/** Invalidate cache cho pet (sau profile update). */
export function invalidateSensitivity(petId: number): void {
  cache.delete(petId);
}
