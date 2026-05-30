/**
 * Feature gate check — uses feature_gates table.
 *
 * checkFeatureAccess(userId, petId, featureKey) → { allowed: boolean, [reason, progress, next_action, ...] }
 *
 * Gate types:
 *   pet_score_min   — current Pet Score ≥ value
 *   tier_min        — current tier index ≥ tier index of value (bronze<silver<gold<platinum<diamond)
 *   hero_count_min  — user.pet_heroes_count ≥ value
 *   achievement_required — user has achievement with code = value
 */
import { listRows, getRow } from "@shared/baserow.ts";
import { findUserById } from "./users.ts";
import { getPetScore } from "./pet-score.ts";
import { TIER_ORDER, TIER_THRESHOLDS, type Tier } from "./rewards.ts";

export interface FeatureAccessResult {
  allowed: boolean;
  feature_key: string;
  feature_name?: string;
  reason?: string;
  current_value?: number | string;
  required_value?: number | string;
  percent?: number;
  next_action?: string;
  benefit?: string;
  gate_type?: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export async function checkFeatureAccess(
  userId: number,
  petId: number,
  featureKey: string
): Promise<FeatureAccessResult> {
  let gate: any = null;
  try {
    const res = await listRows<any>("feature_gates", {
      filter: { feature_key__equal: featureKey, is_active__boolean: "true" },
      size: 1,
    });
    gate = res.results[0];
  } catch (err) {
    console.warn(`[feature-gates] lookup ${featureKey}:`, err);
  }
  if (!gate) {
    // No gate defined → open access
    return { allowed: true, feature_key: featureKey };
  }

  const gateType = flatVal<string>(gate.gate_type) || "";
  const gateValue = gate.gate_value || "";
  const baseMeta = {
    feature_key: featureKey,
    feature_name: gate.feature_name || featureKey,
    gate_type: gateType,
    benefit: gate.benefit_description || "",
    next_action: gate.next_action || "",
  };

  switch (gateType) {
    case "pet_score_min": {
      const req = parseInt(gateValue) || 0;
      const score = await currentPetScore(petId);
      if (score >= req) return { allowed: true, ...baseMeta };
      return {
        allowed: false,
        reason: gate.locked_message || `Cần Pet Score ≥ ${req}`,
        current_value: score,
        required_value: req,
        percent: Math.min(100, Math.round((score / Math.max(1, req)) * 100)),
        ...baseMeta,
      };
    }

    case "tier_min": {
      const reqTier = gateValue as Tier;
      const reqIdx = TIER_ORDER.indexOf(reqTier);
      const { score, tier } = await currentPetScoreFull(petId);
      const myIdx = TIER_ORDER.indexOf(tier);
      if (reqIdx >= 0 && myIdx >= reqIdx) return { allowed: true, ...baseMeta };
      const reqScore = TIER_THRESHOLDS[reqTier] || 0;
      return {
        allowed: false,
        reason: gate.locked_message || `Cần tier ${reqTier}`,
        current_value: tier,
        required_value: reqTier,
        percent: Math.min(100, Math.round((score / Math.max(1, reqScore)) * 100)),
        ...baseMeta,
      };
    }

    case "hero_count_min": {
      const req = parseInt(gateValue) || 0;
      const user: any = await findUserById(userId);
      const count = Number(user?.pet_heroes_count) || 0;
      if (count >= req) return { allowed: true, ...baseMeta };
      return {
        allowed: false,
        reason: gate.locked_message || `Cần ${req}+ pets được giúp`,
        current_value: count,
        required_value: req,
        percent: Math.min(100, Math.round((count / Math.max(1, req)) * 100)),
        ...baseMeta,
      };
    }

    case "achievement_required": {
      const res = await listRows<any>("user_achievements", {
        filter: {
          user_id__equal: String(userId),
          pet_id__link_row_has: String(petId),
          achievement_code__equal: gateValue,
        },
        size: 1,
      });
      if (res.results.length > 0) return { allowed: true, ...baseMeta };
      return {
        allowed: false,
        reason: gate.locked_message || `Cần unlock huy hiệu ${gateValue}`,
        current_value: 0,
        required_value: gateValue,
        percent: 0,
        ...baseMeta,
      };
    }

    default:
      return { allowed: true, ...baseMeta };
  }
}

async function currentPetScore(petId: number): Promise<number> {
  try {
    const pet = await getRow<any>("pets", petId);
    const r = await getPetScore(pet);
    return r.score;
  } catch {
    return 0;
  }
}

async function currentPetScoreFull(petId: number): Promise<{ score: number; tier: Tier }> {
  try {
    const pet = await getRow<any>("pets", petId);
    const r = await getPetScore(pet);
    return { score: r.score, tier: r.level.id as Tier };
  } catch {
    return { score: 0, tier: "bronze" };
  }
}

// List all active gates (for admin UI / pet-score page "next unlocks")
export async function listActiveFeatureGates(): Promise<any[]> {
  const res = await listRows<any>("feature_gates", {
    filter: { is_active__boolean: "true" },
    size: 100,
  });
  return res.results.filter((r) => r.feature_key);
}
