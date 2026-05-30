/**
 * Mon Min Pet Score data gatherer + cache (M14.2).
 *
 * Loads signals from multiple Baserow tables:
 *   - vaccines (M6)
 *   - pets.body_condition_score (M7) hoặc pets.bcs (M3.5 fallback)
 *   - daily_check_ins (M4)
 *   - chat_threads status=closed với vet_user_id NOT NULL → last vet visit
 *   - triage_sessions urgency=5 trong 90 ngày
 *   - allergies_diet count
 *
 * Cache 6h in-memory. Invalidate khi user check-in/vaccine/triage/BCS update.
 */
import { listRows } from "@shared/baserow.ts";
import {
  computePetScore,
  buildRecommendations,
  getScoreLevel,
  type ScoreInputs,
  type ScoreBreakdown,
  type ScoreRecommendation,
  type ScoreLevel,
} from "@shared/pet-score-formula.ts";
import type { BaserowPet } from "./users.ts";
import { ageInYears } from "@shared/senior.ts";
import { getStreak as getRoutineStreak } from "./routines.ts";
import { getLatestPain, getLatestMobility } from "./pain-mobility.ts";
import { getLatest as getLatestCognitive } from "./cognitive.ts";
import { getLatestWater } from "./water-intake.ts";
import { findUserById } from "./users.ts";
import { getPersonalityKMeta } from "@shared/personality-types.ts";

// ============================================================
// Cache
// ============================================================
interface CacheEntry {
  value: PetScoreResult;
  expires_at: number;
}
const cache = new Map<number, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function invalidatePetScore(petId: number): void {
  if (cache.delete(petId)) {
    console.log(`[pet-score] cache invalidated pet=${petId}`);
  }
}

export interface PetScoreResult {
  pet_id: number;
  score: number;
  level: ScoreLevel;
  breakdown: ScoreBreakdown;
  recommendations: ScoreRecommendation[];
  computed_at: string;
  cache_hit: boolean;
}

// ============================================================
// Signal gatherers
// ============================================================

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

async function getVaccineCounts(petId: number): Promise<{ total: number; up_to_date: number; expired: number }> {
  try {
    const res = await listRows<any>("vaccines", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 100,
    });
    const rows = res.results.filter((v: any) => v.vaccine_code || v.vaccine_type);
    let upToDate = 0;
    let expired = 0;
    for (const v of rows) {
      const status = flatVal<string>(v.status);
      if (status === "completed") upToDate++;
      else if (status === "overdue") expired++;
    }
    return { total: rows.length, up_to_date: upToDate, expired };
  } catch {
    return { total: 0, up_to_date: 0, expired: 0 };
  }
}

async function getCheckinStreak(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("daily_check_ins", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 60,
    });
    const rows = res.results.filter((c: any) => c.check_date);
    if (rows.length === 0) return 0;
    // Sort by check_date desc (string ISO sortable)
    rows.sort((a: any, b: any) => b.check_date.localeCompare(a.check_date));
    // Count consecutive days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let streak = 0;
    let cursor = today;
    for (const row of rows) {
      const d = new Date(row.check_date + "T00:00:00");
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((cursor.getTime() - d.getTime()) / (24 * 3600 * 1000));
      if (diff === 0 || diff === 1) {
        streak++;
        cursor = d;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  } catch {
    return 0;
  }
}

async function getLastVetVisit(petId: number): Promise<number | null> {
  try {
    // Strategy: tìm chat_threads với pet_id link_row + status=closed + vet_user_id set
    // Sort by id desc (proxy created_at)
    const res = await listRows<any>("chat_threads", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 50,
    });
    const closed = res.results.filter((t: any) => {
      const status = flatVal<string>(t.status);
      const hasVet = Array.isArray(t.vet_user_id) && t.vet_user_id.length > 0;
      return status === "closed" && hasVet;
    });
    if (closed.length === 0) return null;
    closed.sort((a: any, b: any) => b.id - a.id);
    const latest = closed[0];
    const createdAt = latest.created_at;
    if (!createdAt) return null;
    const ts = new Date(createdAt).getTime();
    if (Number.isNaN(ts)) return null;
    return Math.round((Date.now() - ts) / (24 * 3600 * 1000));
  } catch {
    return null;
  }
}

async function hasRecentEmergencyTriage(petId: number): Promise<boolean> {
  try {
    const res = await listRows<any>("triage_sessions", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 50,
    });
    const rows = res.results.filter((s: any) => Number(s.ai_urgency_level) === 5);
    if (rows.length === 0) return false;
    // Phase 0 — triage_sessions không có proper created_at field
    // Approximation: nếu có L5 trong 50 records gần nhất, coi như "recent"
    // Future: filter by id range hoặc add timestamp field
    return true;
  } catch {
    return false;
  }
}

async function getAllergiesCount(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("allergies_diet", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 50,
    });
    return res.results.filter((a: any) => {
      const t = flatVal<string>(a.type);
      return t === "allergy" || t === "forbidden";
    }).length;
  } catch {
    return 0;
  }
}

// ============================================================
// Main compute (with cache)
// ============================================================

export async function getPetScore(pet: BaserowPet, options: { force_refresh?: boolean } = {}): Promise<PetScoreResult> {
  const petId = pet.id;
  if (!options.force_refresh) {
    const cached = cache.get(petId);
    if (cached && cached.expires_at > Date.now()) {
      console.log(`[pet-score] cache HIT pet=${petId}`);
      return { ...cached.value, cache_hit: true };
    }
  }
  console.log(`[pet-score] cache MISS pet=${petId}`);

  // Owner id (first link in pet.user_id)
  const ownerId = (pet.user_id || [])[0]?.id || 0;

  // Gather all signals in parallel
  const [
    vaccineCounts, streak, lastVet, recentEmer, allergiesN,
    routineStreak, latestPain, latestMobility, latestCognitive, latestWater,
    ownerUser,
  ] = await Promise.all([
    getVaccineCounts(petId),
    getCheckinStreak(petId),
    getLastVetVisit(petId),
    hasRecentEmergencyTriage(petId),
    getAllergiesCount(petId),
    getRoutineStreak(petId).catch(() => ({ current_streak: 0 })),
    getLatestPain(petId).catch(() => null),
    getLatestMobility(petId).catch(() => null),
    getLatestCognitive(petId).catch(() => null),
    getLatestWater(petId).catch(() => null),
    ownerId ? findUserById(ownerId).catch(() => null) : Promise.resolve(null),
  ]);

  const speciesRaw = flatVal<string>(pet.species);
  const species: "dog" | "cat" | "other" =
    speciesRaw === "dog" || speciesRaw === "cat" ? speciesRaw : "other";
  const bcs = (pet as any).body_condition_score
    ? Number((pet as any).body_condition_score)
    : (pet as any).bcs
    ? Number((pet as any).bcs)
    : null;
  const age = ageInYears(pet.dob || undefined);

  // M15: read personality type + lookup k_factor (1.0 if no quiz yet)
  const personalityTypeId = flatVal<string>((pet as any).personality_type) || null;
  const personalityKMeta = personalityTypeId ? getPersonalityKMeta(personalityTypeId) : null;
  const personalityKFactor = personalityKMeta?.k ?? 1.0;

  const inputs: ScoreInputs = {
    vaccines_total: vaccineCounts.total,
    vaccines_up_to_date: vaccineCounts.up_to_date,
    vaccines_expired: vaccineCounts.expired,
    bcs,
    checkin_streak_days: streak,
    last_vet_visit_days_ago: lastVet,
    chronic_conditions_count: 0, // Phase 0: dedicated field chưa có
    age_years: age,
    species,
    recent_emergency_triage: recentEmer,
    allergies_count: allergiesN,
    routine_streak_days: routineStreak.current_streak || 0,
    pain_level: latestPain?.pain_level ?? null,
    mobility_pct: latestMobility?.pct_score ?? null,
    cognitive_category: latestCognitive?.category ?? null,
    water_status: latestWater?.status ?? null,
    pet_hero_bonus_raw: Number((ownerUser as any)?.pet_score_bonus) || 0,
    personality_k_factor: personalityTypeId ? personalityKFactor : undefined,
  };

  const breakdown = computePetScore(inputs);
  const level = getScoreLevel(breakdown.total);
  const recommendations = buildRecommendations(breakdown, petId, 3);

  const result: PetScoreResult = {
    pet_id: petId,
    score: breakdown.total,
    level,
    breakdown,
    recommendations,
    computed_at: new Date().toISOString(),
    cache_hit: false,
  };

  cache.set(petId, { value: result, expires_at: Date.now() + TTL_MS });
  return result;
}
