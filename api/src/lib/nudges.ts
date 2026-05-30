/**
 * Smart nudges — find opportunities to gently nudge users.
 *
 * Nudge types:
 *   tier_close          — Pet Score ≥ 80% of next tier threshold (motivate finish)
 *   streak_at_risk      — streak ≥ 3 active, but no check-in today after 6pm
 *   achievement_close   — achievement at ≥ 70% progress (currently only for streak/vaccine/hero)
 *   reward_expiring     — claimed voucher expires in ≤ 3 days
 *   profile_completion  — TIERED encouragement based on % completed:
 *                          •  0–29% → SKIP (user vừa đăng ký, đang setup — không spam)
 *                          • 30–59% → gentle "Bắt đầu hoàn thiện" (priority 3)
 *                          • 60–89% → medium "Còn X% rồi!"        (priority 5)
 *                          • 90–99% → urgent "Sắp xong — unlock"   (priority 8)
 *                          •  100% → SKIP (đã đầy đủ)
 *                         nudge_key uses BUCKET names (profile_30_59 / profile_60_89 /
 *                         profile_90_99) so logging more fields within the same bucket
 *                         doesn't re-fire — only crossing a bucket boundary does.
 *
 * findNudgeOpportunities(userId, petId) — read-only, returns sorted opportunities
 * sendNudgeIfNew(userId, petId, opp) — dedupes by (user, pet, nudge_key, day) and sends push
 * runDueNudges() — cron entry: scan all opted-in pets, send 1 nudge each (highest priority)
 */
import { listRows, createRow, getRow } from "@shared/baserow.ts";
import { findUserById } from "./users.ts";
import { getPetScore } from "./pet-score.ts";
import { sendPush } from "./web-push.ts";

export type NudgeType = "tier_close" | "streak_at_risk" | "achievement_close" | "reward_expiring" | "profile_completion";

export interface NudgeOpportunity {
  type: NudgeType;
  priority: number;        // higher = more urgent
  title: string;
  body: string;
  url: string;
  nudge_key: string;       // dedupe key
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

const TIER_THRESHOLDS: Record<string, number> = {
  bronze: 0, silver: 301, gold: 501, platinum: 701, diamond: 851,
};
const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"];

// ============================================================
// Detectors
// ============================================================
async function detectTierClose(petId: number): Promise<NudgeOpportunity | null> {
  try {
    const pet: any = await getRow("pets", petId);
    const r = await getPetScore(pet);
    const currentTier = r.level.id;
    const idx = TIER_ORDER.indexOf(currentTier);
    if (idx < 0 || idx === TIER_ORDER.length - 1) return null;
    const nextTier = TIER_ORDER[idx + 1];
    const nextThreshold = TIER_THRESHOLDS[nextTier];
    const pct = r.score / nextThreshold;
    if (pct < 0.80) return null;
    const pointsToNext = nextThreshold - r.score;
    return {
      type: "tier_close",
      priority: 80,
      title: `${r.level.emoji} Sắp lên ${nextTier}!`,
      body: `Pet Score ${r.score}/${nextThreshold} — chỉ còn ${pointsToNext} điểm để lên tier mới.`,
      url: `/pets/${petId}/pet-score`,
      nudge_key: `tier_close:${nextTier}`,
    };
  } catch { return null; }
}

async function detectStreakAtRisk(petId: number): Promise<NudgeOpportunity | null> {
  try {
    const sRes = await listRows<any>("routine_streaks", {
      filter: { pet_id__link_row_has: String(petId) }, size: 1,
    });
    const streak = Number(sRes.results[0]?.current_streak) || 0;
    if (streak < 3) return null;
    // Check today's check-in
    const today = new Date().toISOString().slice(0, 10);
    const cRes = await listRows<any>("daily_check_ins", {
      filter: { pet_id__link_row_has: String(petId), check_date__equal: today }, size: 1,
    });
    if (cRes.results.length > 0) return null; // already checked in
    // Only nudge late afternoon (after 4pm)
    if (new Date().getHours() < 16) return null;
    return {
      type: "streak_at_risk",
      priority: 100,
      title: `🔥 Chuỗi ${streak} ngày sắp đứt!`,
      body: "Vào check-in nhanh để giữ streak — chỉ tốn 20 giây.",
      url: `/pets/${petId}`,
      nudge_key: `streak_at_risk:${streak}`,
    };
  } catch { return null; }
}

async function detectAchievementClose(userId: number, petId: number): Promise<NudgeOpportunity | null> {
  try {
    // Currently best signal: streak/vaccine/hero progress
    const [vRes, sRes, user] = await Promise.all([
      listRows<any>("vaccines", { filter: { pet_id__link_row_has: String(petId) }, size: 200 }),
      listRows<any>("routine_streaks", { filter: { pet_id__link_row_has: String(petId) }, size: 1 }),
      findUserById(userId) as Promise<any>,
    ]);
    const vCount = vRes.results.filter((v) => flatVal<string>(v.status) === "completed").length;
    const streak = Number(sRes.results[0]?.current_streak) || 0;
    const heroes = Number(user?.pet_heroes_count) || 0;

    // Check user achievements to see which are NOT unlocked
    const uaRes = await listRows<any>("user_achievements", {
      filter: { user_id__equal: String(userId), pet_id__link_row_has: String(petId) }, size: 100,
    });
    const have = new Set(uaRes.results.map((r) => r.achievement_code));

    type Candidate = { code: string; name: string; emoji: string; current: number; required: number };
    const candidates: Candidate[] = [];
    if (!have.has("vaccine_pro")    && vCount < 5  && vCount >= 4)  candidates.push({ code: "vaccine_pro",    name: "Vaccine Pro",     emoji: "💉", current: vCount, required: 5 });
    if (!have.has("vaccine_master") && vCount < 9  && vCount >= 7)  candidates.push({ code: "vaccine_master", name: "Vaccine Master",  emoji: "💉", current: vCount, required: 9 });
    if (!have.has("streak_7")       && streak < 7  && streak >= 5)  candidates.push({ code: "streak_7",       name: "7-day Streak",    emoji: "🔥", current: streak, required: 7 });
    if (!have.has("streak_30")      && streak < 30 && streak >= 21) candidates.push({ code: "streak_30",      name: "30-day Streak",   emoji: "🔥", current: streak, required: 30 });
    if (!have.has("streak_100")     && streak < 100 && streak >= 70) candidates.push({ code: "streak_100",   name: "100-day Streak",  emoji: "🔥", current: streak, required: 100 });
    if (!have.has("pet_hero")       && heroes < 3  && heroes >= 2)  candidates.push({ code: "pet_hero",       name: "Pet Hero",        emoji: "🦸", current: heroes, required: 3 });
    if (!have.has("pet_guardian")   && heroes < 10 && heroes >= 7)  candidates.push({ code: "pet_guardian",   name: "Pet Guardian",    emoji: "👑", current: heroes, required: 10 });

    if (candidates.length === 0) return null;
    const best = candidates.sort((a, b) => (b.current / b.required) - (a.current / a.required))[0];
    return {
      type: "achievement_close",
      priority: 70,
      title: `${best.emoji} Sắp unlock ${best.name}!`,
      body: `${best.current}/${best.required} — chỉ còn ${best.required - best.current} bước nữa.`,
      url: `/pets/${petId}/achievements`,
      nudge_key: `achievement_close:${best.code}`,
    };
  } catch { return null; }
}

async function detectRewardExpiring(userId: number): Promise<NudgeOpportunity | null> {
  try {
    const res = await listRows<any>("user_rewards", {
      filter: { user_id__equal: String(userId), status__contains: "active" }, size: 50,
    });
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 3600 * 1000;
    const close = res.results
      .map((r) => {
        if (!r.expires_at) return null;
        try {
          const exp = new Date(r.expires_at).getTime();
          if (Number.isNaN(exp)) return null;
          const remaining = exp - now;
          if (remaining < 0 || remaining > threeDaysMs) return null;
          return { id: r.id, voucher_code: r.voucher_code, reward_code: r.reward_code, remaining };
        } catch { return null; }
      })
      .filter((x) => x);
    if (close.length === 0) return null;
    const soonest = close.sort((a, b) => a!.remaining - b!.remaining)[0]!;
    const days = Math.max(0, Math.floor(soonest.remaining / (24 * 3600 * 1000)));
    return {
      type: "reward_expiring",
      priority: 90,
      title: `⏰ Voucher sắp hết hạn`,
      body: `Voucher ${soonest.voucher_code} còn ${days === 0 ? "< 1 ngày" : `${days} ngày`}. Đem đến Mon Min Clinic sớm!`,
      url: `/rewards/${soonest.id}`,
      nudge_key: `reward_expiring:${soonest.id}`,
    };
  } catch { return null; }
}

/**
 * Compute pet profile completion % from the 17 Pet Passport core fields.
 * Returns null if it can't fetch the pet (so detectProfileCompletion can fail-soft).
 *
 * A field counts as "filled" when value is:
 *   - not null/undefined, AND
 *   - if string: trimmed non-empty, AND
 *   - if array: length > 0
 * (Baserow returns objects for single_select / arrays for link_row; we keep the
 *  strict any-truthy-string check but extend with array handling for robustness.)
 */
async function computeProfileCompletionPct(petId: number): Promise<{ pct: number; petName: string } | null> {
  try {
    const pet: any = await getRow("pets", petId);
    const coreFields = [
      "name", "species", "breed", "dob", "gender", "weight_kg", "color",
      "photo_url", "personality_type", "microchip_id",
      "owner_emergency_phone", "vet_name", "vet_phone", "primary_diet",
      "allergies", "behavior_notes", "qr_code", "address",
    ];
    let filled = 0;
    for (const f of coreFields) {
      const v = pet[f];
      if (v === null || v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      filled++;
    }
    const pct = Math.round((filled / coreFields.length) * 100);
    const petName = (typeof pet.name === "string" ? pet.name : "bé") || "bé";
    return { pct, petName };
  } catch (err) {
    console.error(`[nudges] computeProfileCompletionPct pet=${petId} failed:`, String(err).slice(0, 120));
    return null;
  }
}

/**
 * Tiered profile-completion nudge. Returns null when:
 *   - pct < 30  (new user — give them breathing room, don't spam)
 *   - pct >= 100 (already complete)
 *
 * Within the active range, splits into 3 buckets with distinct tone, priority,
 * and a BUCKET-BASED nudge_key so logging more fields within the same bucket
 * does NOT re-fire (anti-spam) — only crossing a bucket boundary does.
 */
async function detectProfileCompletion(_userId: number, petId: number): Promise<NudgeOpportunity | null> {
  const r = await computeProfileCompletionPct(petId);
  if (!r) return null;
  const { pct, petName } = r;

  // ──────────────────────────────────────────────────────────
  // SKIP zones
  // ──────────────────────────────────────────────────────────
  if (pct < 30)  return null;  // user mới — đang setup, không spam
  if (pct >= 100) return null; // đã đầy đủ

  // ──────────────────────────────────────────────────────────
  // Tier-specific messaging + priority + bucket key
  // ──────────────────────────────────────────────────────────
  let priority: number;
  let title: string;
  let body: string;
  let bucket: string;

  if (pct >= 90) {
    // 90-99% — gần xong, push mạnh để chốt nốt
    priority = 8;
    title = `🎯 Sắp xong rồi! Hồ sơ ${petName} đã ${pct}%`;
    body = `Còn ${100 - pct}% nữa để mở khoá huy hiệu Profile Master + 80 điểm Pet Score.`;
    bucket = "profile_90_99";
  } else if (pct >= 60) {
    // 60-89% — medium push, friendly nhắc nhở
    priority = 5;
    title = `📋 Hồ sơ ${petName} đã được ${pct}%`;
    body = `Hoàn thiện thêm ${100 - pct}% nữa để BSTY Mon Min Pet hiểu bé hơn khi cần thiết.`;
    bucket = "profile_60_89";
  } else {
    // 30-59% — gentle encourage, tone khuyến khích nhẹ
    priority = 3;
    title = `📋 Bắt đầu hoàn thiện hồ sơ ${petName}`;
    body = `Hồ sơ mới ${pct}% — thêm vài thông tin nữa để Mon Min Pet chăm sóc bé tốt nhất.`;
    bucket = "profile_30_59";
  }

  return {
    type: "profile_completion",
    priority,
    title,
    body,
    url: `/pets/${petId}/profile/complete`,
    // Anti-spam dùng BUCKET, không phải exact pct.
    // User log thêm 1 field trong cùng bucket (44% → 48%) → cùng key → dedupe 24h.
    // User cross bucket (58% → 62%) → key mới (profile_30_59 → profile_60_89)
    // → có thể fire lại (đúng — đây là milestone mới).
    nudge_key: `${bucket}:pet${petId}`,
  };
}

// ============================================================
// Find all opportunities
// ============================================================
export async function findNudgeOpportunities(userId: number, petId: number): Promise<NudgeOpportunity[]> {
  const all = await Promise.all([
    detectTierClose(petId),
    detectStreakAtRisk(petId),
    detectAchievementClose(userId, petId),
    detectRewardExpiring(userId),
    detectProfileCompletion(userId, petId),
  ]);
  return all.filter((x): x is NudgeOpportunity => !!x).sort((a, b) => b.priority - a.priority);
}

// ============================================================
// Send + dedupe
// ============================================================
async function alreadySentToday(userId: number, petId: number, nudgeKey: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const res = await listRows<any>("user_nudges_sent", {
      filter: {
        user_id__equal: String(userId),
        pet_id__link_row_has: String(petId),
        nudge_key__equal: nudgeKey,
        sent_at__date_after_or_equal: today,
      },
      size: 1,
    });
    return res.results.length > 0;
  } catch { return false; }
}

export async function sendNudgeIfNew(userId: number, petId: number, opp: NudgeOpportunity): Promise<boolean> {
  if (await alreadySentToday(userId, petId, opp.nudge_key)) return false;

  let pushSent = false;
  try {
    const user: any = await findUserById(userId);
    if (user?.push_subscription) {
      const r = await sendPush(
        userId,
        user.push_subscription,
        { title: opp.title, body: opp.body, data: { url: opp.url, nudge_type: opp.type } },
        { type: "vaccine_reminder" }
      );
      pushSent = !!r.ok;
    }
  } catch (err) {
    console.error("[nudges] push failed:", err);
  }

  // Persist nudge regardless (so we don't re-send today, even if push silently failed)
  try {
    await createRow("user_nudges_sent", {
      user_id: userId,
      pet_id: [petId],
      nudge_type: opp.type,
      nudge_key: opp.nudge_key,
      sent_at: new Date().toISOString(),
      response: "unknown",
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[nudges] persist failed:", err);
  }
  return pushSent;
}

// ============================================================
// Cron entry — every 2h within waking window (7am-9pm)
// ============================================================
export async function runDueNudges(): Promise<{ scanned: number; sent: number }> {
  // Skip if outside waking window
  const hour = new Date().getHours();
  if (hour < 7 || hour > 21) {
    console.log(`[nudges] skip — outside window (hour=${hour})`);
    return { scanned: 0, sent: 0 };
  }

  // Find candidates: pets whose owner has push_subscription set (rough proxy for "active")
  const pets = await listRows<any>("pets", { size: 200 });
  let scanned = 0, sent = 0;

  for (const pet of pets.results) {
    const link = (pet.user_id || [])[0];
    const userId = link?.id;
    if (!userId) continue;
    scanned++;

    try {
      const user: any = await findUserById(userId);
      if (!user?.push_subscription) continue;
    } catch { continue; }

    try {
      const opps = await findNudgeOpportunities(userId, pet.id);
      if (opps.length === 0) continue;
      // Send the highest-priority one
      const top = opps[0];
      const ok = await sendNudgeIfNew(userId, pet.id, top);
      if (ok) sent++;
    } catch (err) {
      console.error(`[nudges] pet=${pet.id}:`, String(err).slice(0, 120));
    }
  }
  return { scanned, sent };
}
