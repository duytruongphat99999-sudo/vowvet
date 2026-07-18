/**
 * Pet Heroes — record helpful acts + leaderboard + tier badges.
 *
 * Hero tiers (count thresholds):
 *   helper   ≥ 1
 *   hero     ≥ 3
 *   legend   ≥ 10
 *   guardian ≥ 50
 *
 * Hero acts go to `hero_acts` table; the user's running counters/tier on `users` row.
 * Pet Score gets a bonus signal via `pet_score_bonus` accumulator.
 */
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";
import { findUserById, isDeleted } from "./users.ts";
import { sendPush } from "./web-push.ts";

export type HeroTier = "none" | "helper" | "hero" | "legend" | "guardian";
export type ActType = "sighting_confirmed" | "broadcast_shared" | "direct_rescue";

export const HERO_TIERS: Record<HeroTier, {
  label_vi: string;
  emoji: string;
  color_class: string;
  min: number;
}> = {
  none:     { label_vi: "",             emoji: "",   color_class: "",                                                                  min: 0  },
  helper:   { label_vi: "Pet Helper",   emoji: "🤝", color_class: "bg-blue-100 text-blue-700",                                          min: 1  },
  hero:     { label_vi: "Pet Hero",     emoji: "🦸", color_class: "bg-violet-100 text-violet-700",                                      min: 3  },
  legend:   { label_vi: "Pet Legend",   emoji: "🏆", color_class: "bg-amber-100 text-amber-700",                                        min: 10 },
  guardian: { label_vi: "Pet Guardian", emoji: "👑", color_class: "bg-gradient-to-r from-amber-500 to-yellow-500 text-white",            min: 50 },
};

export function calculateHeroTier(count: number): HeroTier {
  if (count >= 50) return "guardian";
  if (count >= 10) return "legend";
  if (count >= 3) return "hero";
  if (count >= 1) return "helper";
  return "none";
}

// ============================================================
// Next-tier derive — READ-ONLY, chỉ phục vụ thanh tiến độ ở profile.
// KHÔNG dùng cho ghi điểm/tier (đó là recordHeroAct — Phần 3).
// Ngưỡng hero ĐỌC từ HERO_TIERS có sẵn (không hardcode lại).
// Ngưỡng foster là const display 1/3/7/15 (chưa có cơ chế ghi — Phần 3).
// ============================================================
export const FOSTER_TIER_MIN: Record<string, number> = {
  foster_helper: 1,
  foster_caring: 3,
  foster_devoted: 7,
  foster_angel: 15,
};

const HERO_TIER_STEPS: Array<{ tier: string; min: number }> =
  (["helper", "hero", "legend", "guardian"] as HeroTier[]).map((t) => ({ tier: t, min: HERO_TIERS[t].min }));
const FOSTER_TIER_STEPS: Array<{ tier: string; min: number }> =
  (["foster_helper", "foster_caring", "foster_devoted", "foster_angel"]).map((t) => ({ tier: t, min: FOSTER_TIER_MIN[t] }));

export interface NextTier {
  tier: string;     // tier kế tiếp cần đạt
  at: number;       // ngưỡng count của tier kế
  from: number;     // ngưỡng count của tier hiện tại (đầu band) — để vẽ % bar
  remaining: number; // còn bao nhiêu bé nữa
}

function deriveNextTier(count: number, steps: Array<{ tier: string; min: number }>): NextTier | null {
  let from = 0;
  for (const s of steps) {
    if (count < s.min) return { tier: s.tier, at: s.min, from, remaining: s.min - count };
    from = s.min;
  }
  return null; // đã đạt cấp cao nhất
}

/** Tính foster tier theo ngưỡng FOSTER_TIER_MIN (1/3/7/15). null = chưa đạt cấp nào. */
export function calculateFosterTier(count: number): string | null {
  if (count >= FOSTER_TIER_MIN.foster_angel) return "foster_angel";
  if (count >= FOSTER_TIER_MIN.foster_devoted) return "foster_devoted";
  if (count >= FOSTER_TIER_MIN.foster_caring) return "foster_caring";
  if (count >= FOSTER_TIER_MIN.foster_helper) return "foster_helper";
  return null;
}

// ============================================================
// Types
// ============================================================

export interface HeroActRow {
  id: number;
  user_id: number;
  pet_id: Array<{ id: number; value: string }>;
  report_id: number;
  sighting_id: number;
  act_type: string | { id: number; value: string };
  reward_received: number;
  bonus_score: number;
  created_at: string;
}

export interface HeroActApi {
  id: number;
  user_id: number;
  pet_id: number;
  pet_name: string;
  report_id: number;
  sighting_id: number;
  act_type: ActType;
  reward_received: number;
  bonus_score: number;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toActApi(row: HeroActRow): HeroActApi {
  const link = (row.pet_id || [])[0];
  return {
    id: row.id,
    user_id: Number(row.user_id) || 0,
    pet_id: link?.id ?? 0,
    pet_name: link?.value || "",
    report_id: Number(row.report_id) || 0,
    sighting_id: Number(row.sighting_id) || 0,
    act_type: (flatVal<ActType>(row.act_type) || "sighting_confirmed") as ActType,
    reward_received: Number(row.reward_received) || 0,
    bonus_score: Number(row.bonus_score) || 0,
    created_at: row.created_at || "",
  };
}

// ============================================================
// Public profile slug
// ============================================================
const SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
function genSlug(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) out += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
  return out;
}

// ============================================================
// Record an act
// ============================================================

export interface RecordHeroActInput {
  userId: number;
  petId: number;
  reportId: number;
  sightingId?: number;
  actType: ActType;
  rewardReceived?: number;
}

export async function recordHeroAct(input: RecordHeroActInput): Promise<HeroActApi> {
  const bonusScore =
    input.actType === "direct_rescue"      ? 1000 :
    input.actType === "sighting_confirmed" ? 500  :
                                             100;

  const row = await createRow<HeroActRow>("hero_acts", {
    user_id: input.userId,
    pet_id: [input.petId],
    report_id: input.reportId,
    sighting_id: input.sightingId || 0,
    act_type: input.actType,
    reward_received: input.rewardReceived || 0,
    bonus_score: bonusScore,
    created_at: new Date().toISOString(),
  });

  // Update user counters + tier
  const user: any = await findUserById(input.userId);
  if (!user) return toActApi(row);
  const newCount = (Number(user.pet_heroes_count) || 0) + 1;
  const newTier = calculateHeroTier(newCount);
  const oldTier = flatVal<HeroTier>(user.hero_badge_tier) || "none";
  const newBonus = (Number(user.pet_score_bonus) || 0) + bonusScore;
  const userUpdates: any = {
    pet_heroes_count: newCount,
    pet_score_bonus: newBonus,
    hero_badge_tier: newTier,
    hero_last_at: new Date().toISOString(),
  };
  // First time becoming a hero: opt-in to public profile by default (they can toggle off later)
  if (!user.hero_first_at) {
    userUpdates.hero_first_at = new Date().toISOString();
    userUpdates.public_profile_enabled = true; // default public on first hero act
  }
  if (!user.public_profile_slug) userUpdates.public_profile_slug = genSlug();
  await updateRow("users", input.userId, userUpdates);

  // Tier-up push
  if (newTier !== oldTier && newTier !== "none") {
    try {
      const sub = user.push_subscription;
      if (sub) {
        const t = HERO_TIERS[newTier];
        await sendPush(
          input.userId,
          sub,
          {
            title: `🎉 Bạn lên cấp ${t.emoji} ${t.label_vi}!`,
            body: `Đã giúp ${newCount} bé tìm về nhà. Cảm ơn ${user.name || "bạn"}!`,
            data: { url: `/heroes/profile/${input.userId}`, hero_tier_up: true },
          },
          { type: "vaccine_reminder" }
        );
      }
    } catch (err) {
      console.error("[pet-heroes] tier-up push failed:", err);
    }
  }

  return toActApi(row);
}

// ============================================================
// Foster act — GHI ĐIỂM cho NGƯỜI TRAO bé (carer). HÀM MỚI, tách hẳn recordHeroAct.
// +1 foster_acts_count, tính lại foster_badge_tier, log 1 row hero_acts act_type="foster_care".
// KHÔNG đụng pet_heroes_count / hero_badge_tier / pet_score_bonus (không lẫn hero cứu hộ).
// ============================================================
export async function recordFosterAct(
  fromUserId: number,
  petId: number,
  petName: string
): Promise<{ foster_acts_count: number; foster_badge_tier: string | null }> {
  const user: any = await findUserById(fromUserId);
  const newCount = (Number(user?.foster_acts_count) || 0) + 1;
  const newTier = calculateFosterTier(newCount);

  await updateRow("users", fromUserId, {
    foster_acts_count: newCount,
    foster_badge_tier: newTier, // single_select value ("foster_helper"…) hoặc null
  });

  await createRow<HeroActRow>("hero_acts", {
    user_id: fromUserId,
    pet_id: [petId],
    report_id: 0,
    sighting_id: 0,
    act_type: "foster_care",
    reward_received: 0,
    bonus_score: 0,
    created_at: new Date().toISOString(),
  } as any);

  return { foster_acts_count: newCount, foster_badge_tier: newTier };
}

// ============================================================
// Reads
// ============================================================

export interface HeroStats {
  user_id: number;
  name: string;
  avatar_url: string | null;
  heroes_count: number;
  total_rewards: number;
  badge_tier: HeroTier;
  public_slug: string | null;
  hero_first_at: string | null;
  hero_last_at: string | null;
  foster_acts_count: number;        // pass-through (Phần 2); scoring wired in Phần 3
  foster_badge_tier: string | null; // pass-through; null = chưa có badge foster
  hero_next: NextTier | null;       // derive READ-ONLY cho thanh tiến độ
  foster_next: NextTier | null;     // derive READ-ONLY cho thanh tiến độ
}

export async function getHeroProfile(userId: number, viewerId?: number): Promise<HeroStats | null> {
  const user: any = await findUserById(userId);
  if (!user) return null;
  // N4: nick đã soft-delete (deleted_at) KHÔNG lộ hồ sơ Hero công khai — kể cả chính chủ.
  if (isDeleted(user)) return null;
  // Chủ (viewerId===userId) xem được profile private của chính mình; khách/người khác vẫn ẩn.
  if (user.public_profile_enabled === false && viewerId !== userId) return null;
  const actsRes = await listRows<HeroActRow>("hero_acts", {
    filter: { user_id__equal: String(userId) },
    size: 200,
  });
  const totalRewards = actsRes.results.reduce((s, a) => s + (Number(a.reward_received) || 0), 0);
  return {
    user_id: userId,
    name: user.name || "Pet Hero ẩn danh",
    avatar_url: user.avatar_url || null,
    heroes_count: Number(user.pet_heroes_count) || 0,
    total_rewards: totalRewards,
    badge_tier: (flatVal<HeroTier>(user.hero_badge_tier) || "none") as HeroTier,
    public_slug: user.public_profile_slug || null,
    hero_first_at: user.hero_first_at || null,
    hero_last_at: user.hero_last_at || null,
    foster_acts_count: Number(user.foster_acts_count) || 0,
    foster_badge_tier: flatVal<string>(user.foster_badge_tier) || null,
    hero_next: deriveNextTier(Number(user.pet_heroes_count) || 0, HERO_TIER_STEPS),
    foster_next: deriveNextTier(Number(user.foster_acts_count) || 0, FOSTER_TIER_STEPS),
  };
}

export async function getHeroProfileBySlug(slug: string): Promise<HeroStats | null> {
  const res = await listRows<any>("users", {
    filter: { public_profile_slug__equal: slug },
    size: 1,
  });
  const u = res.results[0];
  if (!u) return null;
  // public-only: cố ý KHÔNG truyền viewerId — slug = link công khai, tắt public phải chết link.
  return getHeroProfile(u.id);
}

export async function listHeroActsForUser(userId: number, limit = 20): Promise<HeroActApi[]> {
  const res = await listRows<HeroActRow>("hero_acts", {
    filter: { user_id__equal: String(userId) },
    size: Math.min(limit, 200),
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.user_id).map(toActApi);
}

// ============================================================
// Leaderboard
// ============================================================

export type Period = "week" | "month" | "all";

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  name: string;
  avatar_url: string | null;
  heroes_count: number;        // count within period
  total_rewards: number;       // within period
  lifetime_count: number;      // total ever (from user.pet_heroes_count)
  pet_heroes_count: number;    // alias of lifetime count — dùng cho FE sort 3 tab
  badge_tier: HeroTier;
  public_slug: string | null;
  foster_acts_count: number;        // pass-through (Phần 2)
  foster_badge_tier: string | null; // pass-through; null = chưa có badge foster
}

export async function getLeaderboard(period: Period = "all", limit = 20): Promise<LeaderboardEntry[]> {
  let cutoff: string | null = null;
  if (period !== "all") {
    const now = new Date();
    if (period === "week") now.setDate(now.getDate() - 7);
    if (period === "month") now.setMonth(now.getMonth() - 1);
    cutoff = now.toISOString();
  }

  // Pull recent acts (up to 200 — Baserow page limit)
  const filter: Record<string, string> = {};
  if (cutoff) filter.created_at__date_after_or_equal = cutoff.slice(0, 10);
  const res = await listRows<HeroActRow>("hero_acts", {
    filter,
    size: 200,
    orderBy: "-created_at",
  });

  // Aggregate by user
  const stats = new Map<number, { count: number; rewards: number }>();
  for (const a of res.results) {
    const uid = Number(a.user_id);
    if (!uid) continue;
    const s = stats.get(uid) || { count: 0, rewards: 0 };
    s.count++;
    s.rewards += Number(a.reward_received) || 0;
    stats.set(uid, s);
  }

  const sorted = [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const [userId, st] = sorted[i];
    const user: any = await findUserById(userId);
    if (!user) continue;
    if (isDeleted(user)) continue; // N4: nick đã xoá không lên bảng xếp hạng
    if (user.public_profile_enabled === false) continue;
    entries.push({
      rank: i + 1,
      user_id: userId,
      name: user.name || "Pet Hero ẩn danh",
      avatar_url: user.avatar_url || null,
      heroes_count: st.count,
      total_rewards: st.rewards,
      lifetime_count: Number(user.pet_heroes_count) || 0,
      pet_heroes_count: Number(user.pet_heroes_count) || 0,
      badge_tier: (flatVal<HeroTier>(user.hero_badge_tier) || "none") as HeroTier,
      public_slug: user.public_profile_slug || null,
      foster_acts_count: Number(user.foster_acts_count) || 0,
      foster_badge_tier: flatVal<string>(user.foster_badge_tier) || null,
    });
  }
  return entries;
}

// ============================================================
// Owner toggle
// ============================================================
export async function togglePublicProfile(userId: number, enabled: boolean): Promise<HeroStats | null> {
  const user: any = await findUserById(userId);
  if (!user) return null;
  const updates: any = { public_profile_enabled: enabled };
  if (enabled && !user.public_profile_slug) updates.public_profile_slug = genSlug();
  await updateRow("users", userId, updates);
  // chủ vừa toggle → trả profile của chính chủ (viewerId===userId), KHÔNG null kể cả khi tắt public.
  return getHeroProfile(userId, userId);
}
