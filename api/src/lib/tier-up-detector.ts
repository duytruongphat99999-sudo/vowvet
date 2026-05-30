/**
 * Tier-up detector — used by endpoints that modify Pet Score signals.
 *
 * Usage:
 *   const before = await peekTier(petId);  // call BEFORE the mutation
 *   // ... do the work that affects Pet Score (vaccine complete, BCS, check-in, etc.)
 *   invalidatePetScore(petId);
 *   const result = await detectTierChange(petId, userId, before);  // emits community event if tier-up
 *   // return { tier_changed, before, after } to client so frontend can redirect ?celebrate=1
 *
 * Cache-friendly: peekTier uses getPetScore which respects the 6h cache.
 */
import { getRow } from "@shared/baserow.ts";
import { getPetScore } from "./pet-score.ts";

const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
type Tier = typeof TIER_ORDER[number];

export interface TierState {
  tier: Tier;
  score: number;
}

export async function peekTier(petId: number): Promise<TierState> {
  try {
    const pet: any = await getRow("pets", petId);
    const r = await getPetScore(pet);
    return { tier: r.level.id as Tier, score: r.score };
  } catch {
    return { tier: "bronze", score: 0 };
  }
}

export async function detectTierChange(
  petId: number,
  userId: number,
  before: TierState
): Promise<{ tier_changed: boolean; before: Tier; after: Tier; score_before: number; score_after: number }> {
  const after = await peekTier(petId);
  const beforeIdx = TIER_ORDER.indexOf(before.tier);
  const afterIdx = TIER_ORDER.indexOf(after.tier);
  const tier_changed = afterIdx > beforeIdx;

  if (tier_changed) {
    try {
      const { createCommunityEvent } = await import("./community-feed.ts");
      await createCommunityEvent({
        eventType: "tier_up",
        userId,
        petId,
        eventData: {
          before_tier: before.tier,
          after_tier: after.tier,
          before_score: before.score,
          after_score: after.score,
        },
      });
    } catch (err) {
      console.error("[tier-up-detector] community event failed:", err);
    }
  }

  return {
    tier_changed,
    before: before.tier,
    after: after.tier,
    score_before: before.score,
    score_after: after.score,
  };
}
