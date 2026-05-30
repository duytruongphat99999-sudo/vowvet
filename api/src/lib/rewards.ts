/**
 * Rewards service.
 *
 * - evaluateUnlockableRewards: returns { unlockable[], locked[] } for owner UI
 * - claimReward: generates voucher code, persists user_rewards, bumps counter
 * - listClaimedRewards: history for a user
 * - markRedeemed: admin marks a voucher as used in-clinic
 *
 * Reward conditions:
 *   pet_score_tier   — uses ScoreLevel.id (bronze/silver/gold/platinum/diamond)
 *   streak_days      — routine_streaks.current_streak
 *   hero_count       — user.pet_heroes_count
 *   achievement_code — user_achievements row exists
 *   manual_admin     — never auto-unlocks; admin must grant
 */
import { listRows, createRow, updateRow, getRow } from "@shared/baserow.ts";
import { findUserById } from "./users.ts";
import { getPetScore } from "./pet-score.ts";
import { sendPush } from "./web-push.ts";
import { listUserAchievements } from "./achievements.ts";
import { getPersonalityKMeta } from "@shared/personality-types.ts";

// VowVet has 5 tiers per shared/pet-score-formula.ts SCORE_LEVELS:
// bronze 0-300, silver 301-500, gold 501-700, platinum 701-850, diamond 851-1000
export const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
export type Tier = typeof TIER_ORDER[number];

export const TIER_THRESHOLDS: Record<Tier, number> = {
  bronze: 0,
  silver: 301,
  gold: 501,
  platinum: 701,
  diamond: 851,
};

export interface RewardDef {
  id: number;
  code: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  unlock_condition_type: string;
  unlock_condition_value: string;
  reward_type: string;
  reward_value: string;
  reward_provider: string;
  partner_name: string;
  voucher_code_pattern: string;
  voucher_validity_days: number;
  max_redemptions_per_user: number;
  max_total_redemptions: number;
  current_redemptions: number;
  redemption_instructions: string;
  terms: string;
  is_active: boolean;
  display_order: number;
  season_start: string;
  season_end: string;
}

export interface UserReward {
  id: number;
  user_id: number;
  pet_id: number;
  reward_code: string;
  claimed_at: string;
  voucher_code: string;
  expires_at: string;
  status: "pending" | "active" | "redeemed" | "expired" | "cancelled";
  redeemed_at: string | null;
  notes: string;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function defToApi(row: any): RewardDef {
  return {
    id: row.id,
    code: row.code || "",
    name: row.name || "",
    description: row.description || "",
    emoji: row.emoji || "",
    category: flatVal<string>(row.category) || "",
    unlock_condition_type: flatVal<string>(row.unlock_condition_type) || "",
    unlock_condition_value: row.unlock_condition_value || "",
    reward_type: flatVal<string>(row.reward_type) || "badge_only",
    reward_value: row.reward_value || "",
    reward_provider: flatVal<string>(row.reward_provider) || "platform",
    partner_name: row.partner_name || "",
    voucher_code_pattern: row.voucher_code_pattern || "",
    voucher_validity_days: Number(row.voucher_validity_days) || 0,
    max_redemptions_per_user: Number(row.max_redemptions_per_user) || 0,
    max_total_redemptions: Number(row.max_total_redemptions) || -1,
    current_redemptions: Number(row.current_redemptions) || 0,
    redemption_instructions: row.redemption_instructions || "",
    terms: row.terms || "",
    is_active: row.is_active === true,
    display_order: Number(row.display_order) || 0,
    season_start: row.season_start || "",
    season_end: row.season_end || "",
  };
}

function userRewardToApi(row: any): UserReward {
  return {
    id: row.id,
    user_id: Number(row.user_id) || 0,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    reward_code: row.reward_code || "",
    claimed_at: row.claimed_at || "",
    voucher_code: row.voucher_code || "",
    expires_at: row.expires_at || "",
    status: (flatVal<string>(row.status) || "active") as UserReward["status"],
    redeemed_at: row.redeemed_at || null,
    notes: row.notes || "",
    created_at: row.created_at || "",
  };
}

// ============================================================
// Voucher code generation
// ============================================================
const VOUCHER_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1 for clarity
export function generateVoucherCode(pattern: string): string {
  return (pattern || "VV-{random8}").replace(/\{random(\d+)\}/g, (_, lenStr) => {
    const len = parseInt(lenStr, 10);
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    let out = "";
    for (let i = 0; i < len; i++) out += VOUCHER_CHARS[bytes[i] % VOUCHER_CHARS.length];
    return out;
  });
}

// ============================================================
// Helpers
// ============================================================
async function getCurrentStreak(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("routine_streaks", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 5,
    });
    return Number(res.results[0]?.current_streak) || 0;
  } catch { return 0; }
}

async function getUserClaimCounts(userId: number): Promise<Map<string, number>> {
  const res = await listRows<any>("user_rewards", {
    filter: { user_id__equal: String(userId) },
    size: 200,
  });
  const m = new Map<string, number>();
  for (const r of res.results) {
    const code = r.reward_code;
    if (!code) continue;
    m.set(code, (m.get(code) || 0) + 1);
  }
  return m;
}

// ============================================================
// Evaluate
// ============================================================
export interface ProgressInfo {
  current: number | string;
  required: number | string;
  percent: number;
}

export interface EvalRewardItem extends RewardDef {
  progress: ProgressInfo;
  voucher?: string; // not used here
  // M15: derived — true nếu reward.category match pet's personality voucher_category
  is_personality_match?: boolean;
  personality_hint?: string; // vd: "Hợp Triết Gia Ngủ Ngon"
}

export async function evaluateUnlockableRewards(userId: number, petId: number): Promise<{
  unlockable: EvalRewardItem[];
  locked: EvalRewardItem[];
  claimed_counts: Record<string, number>;
}> {
  const [defsRes, claimMap, scoreResult, user, achievements, petRow] = await Promise.all([
    listRows<any>("reward_definitions", { filter: { is_active__boolean: "true" }, size: 200, orderBy: "display_order" }),
    getUserClaimCounts(userId),
    getPetForScore(petId),
    findUserById(userId) as Promise<any>,
    listUserAchievements(userId, petId),
    getRow<any>("pets", petId).catch(() => null),
  ]);

  const score = scoreResult.score;
  const tier = scoreResult.tier as Tier;
  const tierIdx = TIER_ORDER.indexOf(tier);
  const heroCount = Number(user?.pet_heroes_count) || 0;
  const achievementCodes = new Set(achievements.map((a) => a.achievement_code));

  // M15: read pet's personality → derive voucher_category for filtering
  const personalityTypeRaw = petRow ? flatVal<string>((petRow as any).personality_type) : null;
  const personalityKMeta = personalityTypeRaw ? getPersonalityKMeta(personalityTypeRaw) : null;
  // Normalize for fuzzy match (case-insensitive, no diacritics on simple word match)
  const personalityCategory = personalityKMeta ? personalityKMeta.voucher_category.toLowerCase() : null;
  const personalityBadge = personalityKMeta ? personalityKMeta.badge_vi : null;

  const defs = defsRes.results.filter((r) => r.code).map(defToApi);
  const unlockable: EvalRewardItem[] = [];
  const locked: EvalRewardItem[] = [];

  const now = new Date();

  for (const def of defs) {
    // Max-per-user
    const claimed = claimMap.get(def.code) || 0;
    if (def.max_redemptions_per_user > 0 && claimed >= def.max_redemptions_per_user) continue;
    if (def.max_total_redemptions > 0 && def.current_redemptions >= def.max_total_redemptions) continue;

    // Season window
    if (def.season_start) {
      const start = new Date(def.season_start);
      if (!Number.isNaN(start.getTime()) && start > now) continue;
    }
    if (def.season_end) {
      const end = new Date(def.season_end);
      if (!Number.isNaN(end.getTime()) && end < now) continue;
    }

    // Condition
    let isUnlocked = false;
    let progress: ProgressInfo = { current: 0, required: 0, percent: 0 };

    switch (def.unlock_condition_type) {
      case "pet_score_tier": {
        const reqTier = def.unlock_condition_value as Tier;
        const reqIdx = TIER_ORDER.indexOf(reqTier);
        isUnlocked = reqIdx >= 0 && tierIdx >= reqIdx;
        const reqScore = TIER_THRESHOLDS[reqTier] || 0;
        progress = {
          current: score,
          required: reqScore,
          percent: Math.min(100, Math.round((score / Math.max(1, reqScore)) * 100)),
        };
        break;
      }
      case "streak_days": {
        const streak = await getCurrentStreak(petId);
        const reqDays = parseInt(def.unlock_condition_value) || 0;
        isUnlocked = streak >= reqDays;
        progress = { current: streak, required: reqDays, percent: Math.min(100, Math.round((streak / Math.max(1, reqDays)) * 100)) };
        break;
      }
      case "hero_count": {
        const reqHero = parseInt(def.unlock_condition_value) || 0;
        isUnlocked = heroCount >= reqHero;
        progress = { current: heroCount, required: reqHero, percent: Math.min(100, Math.round((heroCount / Math.max(1, reqHero)) * 100)) };
        break;
      }
      case "achievement_code": {
        isUnlocked = achievementCodes.has(def.unlock_condition_value);
        progress = { current: isUnlocked ? 1 : 0, required: 1, percent: isUnlocked ? 100 : 0 };
        break;
      }
      case "manual_admin":
        isUnlocked = false;
        progress = { current: "manual", required: "manual", percent: 0 };
        break;
    }

    // M15: tag reward with is_personality_match if reward.category matches pet's
    // personality voucher_category (case-insensitive substring both ways).
    let isPersonalityMatch = false;
    let personalityHint: string | undefined = undefined;
    if (personalityCategory && def.category) {
      const cat = def.category.toLowerCase();
      // Match if either contains the other (handles partial overlap)
      if (cat.includes(personalityCategory) || personalityCategory.includes(cat)) {
        isPersonalityMatch = true;
        personalityHint = personalityBadge ? `Hợp ${personalityBadge}` : "Hợp tính cách";
      }
    }

    const item: EvalRewardItem = { ...def, progress, is_personality_match: isPersonalityMatch, personality_hint: personalityHint };
    if (isUnlocked) unlockable.push(item);
    else locked.push(item);
  }

  // Sort: personality-matched first within each group, then by display_order / progress
  unlockable.sort((a, b) => {
    if (!!b.is_personality_match !== !!a.is_personality_match) {
      return b.is_personality_match ? 1 : -1;
    }
    return a.display_order - b.display_order;
  });
  locked.sort((a, b) => {
    if (!!b.is_personality_match !== !!a.is_personality_match) {
      return b.is_personality_match ? 1 : -1;
    }
    return b.progress.percent - a.progress.percent;
  });

  const claimedCountsObj: Record<string, number> = {};
  claimMap.forEach((v, k) => { claimedCountsObj[k] = v; });

  return { unlockable, locked, claimed_counts: claimedCountsObj };
}

async function getPetForScore(petId: number): Promise<{ score: number; tier: Tier }> {
  try {
    const pet = await getRow<any>("pets", petId);
    const result = await getPetScore(pet);
    return { score: result.score, tier: result.level.id as Tier };
  } catch (err) {
    console.error(`[rewards] getPetForScore pet=${petId}:`, err);
    return { score: 0, tier: "bronze" };
  }
}

// ============================================================
// Claim
// ============================================================
export async function claimReward(userId: number, petId: number, rewardCode: string): Promise<UserReward> {
  const { unlockable } = await evaluateUnlockableRewards(userId, petId);
  const def = unlockable.find((r) => r.code === rewardCode);
  if (!def) {
    throw Object.assign(new Error("Reward không có sẵn để claim"), { status: 400, code: "NOT_UNLOCKABLE" });
  }

  const voucher_code = generateVoucherCode(def.voucher_code_pattern);
  const expiresAt = new Date();
  if (def.voucher_validity_days > 0) {
    expiresAt.setDate(expiresAt.getDate() + def.voucher_validity_days);
  } else {
    expiresAt.setFullYear(expiresAt.getFullYear() + 10); // effectively no expiry
  }

  const initialStatus: UserReward["status"] = def.reward_type === "feature_unlock" || def.reward_type === "badge_only"
    ? "redeemed" // instant — no clinic visit needed
    : "active";

  const row = await createRow<any>("user_rewards", {
    user_id: userId,
    pet_id: [petId],
    reward_code: rewardCode,
    claimed_at: new Date().toISOString(),
    voucher_code,
    expires_at: expiresAt.toISOString(),
    status: initialStatus,
    redeemed_at: initialStatus === "redeemed" ? new Date().toISOString() : null,
    notes: "",
    created_at: new Date().toISOString(),
  });

  // Bump counter
  try {
    await updateRow("reward_definitions", def.id, {
      current_redemptions: def.current_redemptions + 1,
    });
  } catch (err) {
    console.error(`[rewards] counter bump failed ${def.code}:`, err);
  }

  // Push notify
  try {
    const user: any = await findUserById(userId);
    if (user?.push_subscription) {
      await sendPush(
        userId,
        user.push_subscription,
        {
          title: `🎁 Nhận thưởng: ${def.emoji} ${def.name}`,
          body: def.voucher_validity_days > 0
            ? `Voucher: ${voucher_code} · Hạn ${def.voucher_validity_days} ngày`
            : `Đã kích hoạt ${def.name}`,
          data: { url: `/rewards/${row.id}`, reward_code: rewardCode },
        },
        { type: "vaccine_reminder" }
      );
    }
  } catch (err) {
    console.error("[rewards] push failed:", err);
  }

  return userRewardToApi(row);
}

// ============================================================
// History
// ============================================================
export async function listClaimedRewards(userId: number, petId?: number): Promise<UserReward[]> {
  const filter: Record<string, string> = { user_id__equal: String(userId) };
  if (petId) filter.pet_id__link_row_has = String(petId);
  const res = await listRows<any>("user_rewards", {
    filter, size: 100, orderBy: "-claimed_at",
  });
  // Auto-expire pass
  const now = new Date();
  const items: UserReward[] = [];
  for (const row of res.results) {
    if (!row.reward_code) continue;
    let status = flatVal<string>(row.status) || "active";
    if (status === "active" && row.expires_at) {
      try {
        if (new Date(row.expires_at) < now) {
          status = "expired";
          // Update lazily — fire and forget
          updateRow("user_rewards", row.id, { status: "expired" }).catch(() => {});
        }
      } catch {}
    }
    items.push({ ...userRewardToApi(row), status: status as UserReward["status"] });
  }
  return items;
}

export async function getClaimById(claimId: number): Promise<UserReward | null> {
  try {
    const row = await getRow<any>("user_rewards", claimId);
    return userRewardToApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function getRewardDefByCode(code: string): Promise<RewardDef | null> {
  const res = await listRows<any>("reward_definitions", {
    filter: { code__equal: code },
    size: 1,
  });
  const row = res.results[0];
  return row ? defToApi(row) : null;
}

// ============================================================
// Admin
// ============================================================
export async function markClaimRedeemed(claimId: number, adminUserId: number, notes?: string): Promise<UserReward> {
  const row = await updateRow<any>("user_rewards", claimId, {
    status: "redeemed",
    redeemed_at: new Date().toISOString(),
    redeemed_by_admin_id: adminUserId,
    notes: (notes || "").slice(0, 500),
  });
  return userRewardToApi(row);
}
