/**
 * Pet Score leaderboard (opt-in, public).
 *
 * Different from M27 /heroes/leaderboard (which ranks by helping count).
 * This one ranks pets by Pet Score for users who opt-in via `users.show_in_leaderboard`.
 *
 * - getLeaderboard({period, species, district, limit}) — current rankings
 * - generateMonthlySnapshot(monthISO) — cron-called, persists ranks to leaderboard_snapshots
 * - optIn(userId, petId, displayName?) / optOut(userId)
 */
import { listRows, getRow, updateRow, createRow } from "@shared/baserow.ts";
import { findUserById } from "./users.ts";
import { getPetScore } from "./pet-score.ts";
import type { BaserowPet } from "./users.ts";

export type LeaderboardPeriod = "this_month" | "all_time" | "last_month";

export interface LeaderboardEntry {
  rank: number;
  pet_id: number;
  pet_name: string;
  pet_species: string;
  pet_avatar_url: string | null;
  user_id: number;
  display_name: string;
  pet_score: number;
  tier: string;
  tier_emoji: string;
  achievements_count: number;
  hero_count: number;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

/**
 * Current live leaderboard — opt-in users only.
 * For period=this_month or all_time, ranks by current Pet Score.
 * For last_month, reads from leaderboard_snapshots.
 */
export async function getLeaderboard(params: {
  period?: LeaderboardPeriod;
  species?: string;
  limit?: number;
} = {}): Promise<LeaderboardEntry[]> {
  const period = params.period || "this_month";
  const limit = Math.min(100, params.limit || 50);

  if (period === "last_month") {
    return getSnapshotLeaderboard(prevMonthKey(), params.species, limit);
  }

  // Live ranking: scan opted-in users → their leaderboard_pet_id → score
  const usersRes = await listRows<any>("users", {
    filter: { show_in_leaderboard__boolean: "true" },
    size: 200,
  });

  const entries: LeaderboardEntry[] = [];
  for (const u of usersRes.results) {
    // Decide which pet to feature
    let petId: number | null = null;
    const lbPetField = u.leaderboard_pet_id;
    if (Array.isArray(lbPetField) && lbPetField[0]?.id) {
      petId = lbPetField[0].id;
    } else {
      // Fall back to first owned pet
      try {
        const pets = await listRows<any>("pets", {
          filter: { user_id__link_row_has: String(u.id), deleted_at__empty: "" },
          size: 1,
        });
        petId = pets.results[0]?.id || null;
      } catch {}
    }
    if (!petId) continue;

    let pet: BaserowPet;
    try {
      pet = await getRow<BaserowPet>("pets", petId);
    } catch { continue; }

    // Filter by species if requested
    const speciesValue = flatVal<string>(pet.species) || "";
    if (params.species && speciesValue !== params.species) continue;

    let score = 0;
    let tier = "bronze";
    let tierEmoji = "🥉";
    try {
      const r = await getPetScore(pet);
      score = r.score;
      tier = r.level.id;
      tierEmoji = r.level.emoji;
    } catch (err) {
      console.error(`[pet-leaderboard] score pet=${petId}:`, err);
      continue;
    }

    // Count achievements (best-effort)
    let achievementsCount = 0;
    try {
      const ar = await listRows<any>("user_achievements", {
        filter: { user_id__equal: String(u.id), pet_id__link_row_has: String(petId) },
        size: 100,
      });
      achievementsCount = ar.results.length;
    } catch {}

    entries.push({
      rank: 0, // assigned after sort
      pet_id: petId,
      pet_name: pet.name || "Bé ẩn danh",
      pet_species: speciesValue,
      pet_avatar_url: (pet as any).photo_url || null,
      user_id: u.id,
      display_name: u.public_display_name || u.name || "Chủ bé ẩn danh",
      pet_score: score,
      tier,
      tier_emoji: tierEmoji,
      achievements_count: achievementsCount,
      hero_count: Number(u.pet_heroes_count) || 0,
    });
  }

  entries.sort((a, b) => b.pet_score - a.pet_score);
  for (let i = 0; i < entries.length; i++) entries[i].rank = i + 1;
  return entries.slice(0, limit);
}

async function getSnapshotLeaderboard(monthKey: string, species: string | undefined, limit: number): Promise<LeaderboardEntry[]> {
  const res = await listRows<any>("leaderboard_snapshots", {
    filter: { snapshot_month__equal: monthKey },
    size: 200,
    orderBy: "rank_overall",
  });
  const entries: LeaderboardEntry[] = [];
  for (const snap of res.results) {
    const petLink = (snap.pet_id || [])[0];
    if (!petLink?.id) continue;
    try {
      const pet = await getRow<BaserowPet>("pets", petLink.id);
      const speciesValue = flatVal<string>(pet.species) || "";
      if (species && speciesValue !== species) continue;
      const user: any = await findUserById(Number(snap.user_id));
      entries.push({
        rank: Number(snap.rank_overall) || 0,
        pet_id: petLink.id,
        pet_name: pet.name || "",
        pet_species: speciesValue,
        pet_avatar_url: (pet as any).photo_url || null,
        user_id: Number(snap.user_id) || 0,
        display_name: user?.public_display_name || user?.name || "Chủ bé ẩn danh",
        pet_score: Number(snap.pet_score) || 0,
        tier: "bronze", // historical — tier label not stored, recompute from score
        tier_emoji: tierEmojiFor(Number(snap.pet_score) || 0),
        achievements_count: Number(snap.achievements_count) || 0,
        hero_count: Number(user?.pet_heroes_count) || 0,
      });
    } catch {}
  }
  // Re-fill tier label from score using same thresholds as Pet Score formula
  for (const e of entries) {
    e.tier = tierFromScore(e.pet_score);
  }
  return entries.slice(0, limit);
}

function tierFromScore(s: number): string {
  if (s >= 851) return "diamond";
  if (s >= 701) return "platinum";
  if (s >= 501) return "gold";
  if (s >= 301) return "silver";
  return "bronze";
}

function tierEmojiFor(s: number): string {
  return ({ bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "✨", diamond: "👑" } as Record<string, string>)[tierFromScore(s)] || "🥉";
}

function prevMonthKey(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function thisMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ============================================================
// Opt-in / opt-out
// ============================================================
export async function optInLeaderboard(userId: number, petId: number, displayName?: string): Promise<void> {
  const patch: any = {
    show_in_leaderboard: true,
    leaderboard_pet_id: [petId],
  };
  if (displayName) patch.public_display_name = displayName.slice(0, 60);
  await updateRow("users", userId, patch);
}

export async function optOutLeaderboard(userId: number): Promise<void> {
  await updateRow("users", userId, { show_in_leaderboard: false });
}

// ============================================================
// Monthly snapshot — cron job
// ============================================================
export async function generateMonthlySnapshot(monthKey?: string): Promise<{ inserted: number }> {
  const month = monthKey || prevMonthKey();
  // Skip if snapshot already exists for this month
  const existingRes = await listRows<any>("leaderboard_snapshots", {
    filter: { snapshot_month__equal: month }, size: 1,
  });
  if (existingRes.results.length > 0) {
    console.log(`[pet-leaderboard] snapshot for ${month} already exists`);
    return { inserted: 0 };
  }

  const entries = await getLeaderboard({ period: "this_month", limit: 100 });
  const snapshotDate = new Date().toISOString();
  let inserted = 0;

  // Compute species sub-rank
  const bySpecies = new Map<string, LeaderboardEntry[]>();
  for (const e of entries) {
    const list = bySpecies.get(e.pet_species) || [];
    list.push(e);
    bySpecies.set(e.pet_species, list);
  }
  const speciesRankMap = new Map<number, number>();
  for (const list of bySpecies.values()) {
    list.sort((a, b) => b.pet_score - a.pet_score);
    list.forEach((e, idx) => speciesRankMap.set(e.pet_id, idx + 1));
  }

  for (const e of entries) {
    try {
      await createRow("leaderboard_snapshots", {
        snapshot_month: month,
        pet_id: [e.pet_id],
        user_id: e.user_id,
        pet_score: e.pet_score,
        rank_overall: e.rank,
        rank_species: speciesRankMap.get(e.pet_id) || 0,
        rank_district: 0, // not implemented yet — would need user district field
        achievements_count: e.achievements_count,
        snapshot_date: snapshotDate,
      });
      inserted++;
    } catch (err) {
      console.error(`[pet-leaderboard] snapshot insert pet=${e.pet_id}:`, String(err).slice(0, 120));
    }
  }
  console.log(`[pet-leaderboard] snapshot ${month}: inserted ${inserted}`);
  return { inserted };
}
