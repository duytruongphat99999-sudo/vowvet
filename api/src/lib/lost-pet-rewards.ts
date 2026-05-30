/**
 * Lost Pet reward system (5 tiers + custom).
 *
 * Amounts are VND. VowVet does NOT hold money — owner self-disburses on retrieval.
 * Reward is a public commitment, not an escrow.
 */
import { updateRow } from "@shared/baserow.ts";

export type RewardTier = "none" | "bronze" | "silver" | "gold" | "diamond" | "custom";
export type RewardStatus = "promised" | "paid_out" | "unclaimed";

export const REWARD_TIERS: Record<Exclude<RewardTier, "custom">, {
  amount: number;
  label: string;
  emoji: string;
  color_class: string;
}> = {
  none:    { amount: 0,       label: "Cảm ơn từ tâm",  emoji: "🤝", color_class: "bg-slate-100 text-slate-700" },
  bronze:  { amount: 100000,  label: "100k",            emoji: "🥉", color_class: "bg-amber-100 text-amber-800" },
  silver:  { amount: 500000,  label: "500k",            emoji: "🥈", color_class: "bg-slate-200 text-slate-800" },
  gold:    { amount: 1000000, label: "1tr",             emoji: "🥇", color_class: "bg-yellow-100 text-yellow-800" },
  diamond: { amount: 5000000, label: "5tr",             emoji: "💎", color_class: "bg-cyan-100 text-cyan-800" },
};

export function getRewardBadge(tier: RewardTier, customAmount?: number): { amount: number; label: string; emoji: string; color_class: string } {
  if (tier === "custom") {
    const amt = customAmount || 0;
    return {
      amount: amt,
      label: amt >= 1_000_000 ? `${(amt / 1_000_000).toFixed(1)}tr` : `${(amt / 1000).toFixed(0)}k`,
      emoji: "💰",
      color_class: "bg-purple-100 text-purple-800",
    };
  }
  return REWARD_TIERS[tier as Exclude<RewardTier, "custom">] || REWARD_TIERS.none;
}

export function isValidTier(t: any): t is RewardTier {
  return ["none", "bronze", "silver", "gold", "diamond", "custom"].includes(t);
}

export interface SetRewardInput {
  reportId: number;
  tier: RewardTier;
  customAmount?: number;
}

export async function setReward(input: SetRewardInput): Promise<{ tier: RewardTier; amount: number }> {
  const amount = input.tier === "custom"
    ? Math.max(0, Math.min(100_000_000, Number(input.customAmount) || 0))
    : REWARD_TIERS[input.tier as Exclude<RewardTier, "custom">]?.amount || 0;
  await updateRow("lost_pet_reports", input.reportId, {
    reward_tier: input.tier,
    reward_amount: amount,
    reward_status: amount > 0 ? "promised" : "unclaimed",
  });
  return { tier: input.tier, amount };
}

export async function markRewardPaid(reportId: number, recipientUserId: number): Promise<void> {
  await updateRow("lost_pet_reports", reportId, {
    reward_status: "paid_out",
    reward_recipient_id: recipientUserId,
    reward_paid_at: new Date().toISOString(),
  });
}

/** Compact push-body suffix when reward is set. */
export function getRewardPushSuffix(amount: number): string {
  if (amount <= 0) return "";
  if (amount >= 1_000_000) return ` · 💰 Thưởng ${(amount / 1_000_000).toFixed(1)}tr`;
  return ` · 💰 Thưởng ${(amount / 1000).toFixed(0)}k`;
}
