/**
 * Pet Score trend — 30-day approximation + percentile vs HCM community.
 *
 * We don't store daily Pet Score history, but we can estimate trend from
 * signals that DO have timestamps:
 *   - daily check-ins (date) — contributes to checkin_streak component
 *   - vaccines completed (administered_date) — contributes to vaccine_compliance
 *   - bcs_assessments (assessed_at) — contributes to bcs_optimal
 *   - achievements (unlocked_at) — contributes to user.pet_score_bonus
 *
 * For now, return current Pet Score for "today" + a synthesized trend
 * (current - num_days × delta_per_event) so the chart has data.
 * Future: store daily snapshots in a new table.
 *
 * Percentile compares pet's current score against all opted-in leaderboard pets.
 */
import { listRows, getRow } from "@shared/baserow.ts";
import { getPetScore } from "./pet-score.ts";
import { getLeaderboard } from "./pet-leaderboard.ts";

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  score: number;
  estimated: boolean;
}

export interface TrendResult {
  points: TrendPoint[];
  current_score: number;
  current_tier: string;
  delta_30d: number;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

/**
 * Get 30-day trend (best-effort approximation).
 * Iterates back day-by-day, decrementing score by an estimate of "events that
 * happened on that day". This gives a rising curve toward today.
 */
export async function getPetScoreTrend(petId: number, days = 30): Promise<TrendResult> {
  const pet: any = await getRow("pets", petId);
  const current = await getPetScore(pet);

  // Pull dated events for the pet to estimate which day contributed what
  const [checkins, vaccines, bcs] = await Promise.all([
    listRows<any>("daily_check_ins", { filter: { pet_id__link_row_has: String(petId) }, size: 200 }),
    listRows<any>("vaccines", { filter: { pet_id__link_row_has: String(petId) }, size: 200 }),
    listRows<any>("bcs_assessments", { filter: { pet_id__link_row_has: String(petId) }, size: 100 }),
  ]);

  // Map of YYYY-MM-DD → estimated score contribution that day (rough)
  const eventScoreByDay = new Map<string, number>();
  function addToDay(day: string, contribution: number) {
    if (!day) return;
    eventScoreByDay.set(day, (eventScoreByDay.get(day) || 0) + contribution);
  }
  // Daily check-in: ~+5 per day toward streak score (best-effort)
  for (const c of checkins.results) {
    const day = (c.check_date || c.created_at || "").slice(0, 10);
    if (day) addToDay(day, 5);
  }
  // Vaccine completed: ~+25 contribution that day
  for (const v of vaccines.results) {
    if (flatVal<string>(v.status) !== "completed") continue;
    const day = (v.administered_date || v.created_at || "").slice(0, 10);
    if (day) addToDay(day, 25);
  }
  // BCS assessment: ~+15 that day
  for (const b of bcs.results) {
    if (!b.bcs_score) continue;
    const day = (b.assessed_at || b.created_at || "").slice(0, 10);
    if (day) addToDay(day, 15);
  }

  // Walk back from today building cumulative score
  const points: TrendPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Sort event-day contributions
  const sortedDays = [...eventScoreByDay.keys()].sort();

  // Algorithm: assume current score is "today". For each day going back, subtract
  // events that occurred AFTER that day. Floor at 0, cap at current.
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayKey = d.toISOString().slice(0, 10);

    // Sum events that happened AFTER this day
    let lostFromFuture = 0;
    for (const ek of sortedDays) {
      if (ek > dayKey) lostFromFuture += eventScoreByDay.get(ek) || 0;
    }
    const estimated = Math.max(0, Math.min(current.score, current.score - lostFromFuture));
    points.push({
      date: dayKey,
      score: estimated,
      estimated: true,
    });
  }

  const first = points[0]?.score ?? current.score;
  const delta = current.score - first;

  return {
    points,
    current_score: current.score,
    current_tier: current.level.id,
    delta_30d: delta,
  };
}

/**
 * Percentile rank vs all opted-in leaderboard pets.
 * Returns 0-100 (higher = better).
 */
export async function getPercentileVsCommunity(petId: number): Promise<{
  pet_score: number;
  percentile: number;
  rank_in_lb: number | null;
  total_opted_in: number;
  community_avg: number;
}> {
  const pet: any = await getRow("pets", petId);
  const my = await getPetScore(pet);

  const lb = await getLeaderboard({ period: "all_time", limit: 100 });
  if (lb.length === 0) {
    return { pet_score: my.score, percentile: 50, rank_in_lb: null, total_opted_in: 0, community_avg: 420 };
  }

  const total = lb.length;
  const below = lb.filter((e) => e.pet_score <= my.score).length;
  const percentile = Math.round((below / total) * 100);
  const sum = lb.reduce((s, e) => s + e.pet_score, 0);
  const avg = Math.round(sum / total);
  const myRank = lb.find((e) => e.pet_id === petId)?.rank || null;

  return {
    pet_score: my.score,
    percentile,
    rank_in_lb: myRank,
    total_opted_in: total,
    community_avg: avg,
  };
}
