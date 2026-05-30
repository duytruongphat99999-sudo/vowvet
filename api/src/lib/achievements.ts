/**
 * Achievements service.
 *
 * checkAndUnlockAchievements({userId, petId, trigger, data?}) → unlock matching defs,
 * persist user_achievements row, bump user.pet_score_bonus, invalidate Pet Score cache,
 * send push.
 *
 * Conventions (mirroring VowVet codebase):
 *   - listRows returns {results, count}
 *   - filter syntax: {field__op: 'value'} (strings)
 *   - link_row write: [petId] (plain int array)
 *   - link_row filter: field__link_row_has: String(petId)
 */
import { listRows, createRow, updateRow, getRow } from "@shared/baserow.ts";
import { findUserById } from "./users.ts";
import { invalidatePetScore } from "./pet-score.ts";
import { sendPush } from "./web-push.ts";

// ============================================================
// Types
// ============================================================
export type AchievementCategory = "health" | "social" | "milestone" | "hero" | "completion" | "secret";
export type AchievementTier = "bronze" | "silver" | "gold" | "platinum" | "secret";

export interface AchievementDef {
  id: number;
  code: string;
  name: string;
  description: string;
  emoji: string;
  category: AchievementCategory;
  tier: AchievementTier;
  pet_score_bonus: number;
  unlock_condition_type: string;
  unlock_condition_value: string;
  is_active: boolean;
  is_secret: boolean;
}

export interface UserAchievement {
  id: number;
  user_id: number;
  pet_id: Array<{ id: number; value: string }>;
  achievement_code: string;
  unlocked_at: string;
  viewed: boolean;
}

export interface UnlockContext {
  userId: number;
  petId: number;
  trigger: string;
  data?: any;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function defToApi(row: any): AchievementDef {
  return {
    id: row.id,
    code: row.code || "",
    name: row.name || "",
    description: row.description || "",
    emoji: row.emoji || "",
    category: (flatVal<AchievementCategory>(row.category) || "completion") as AchievementCategory,
    tier: (flatVal<AchievementTier>(row.tier) || "bronze") as AchievementTier,
    pet_score_bonus: Number(row.pet_score_bonus) || 0,
    unlock_condition_type: flatVal<string>(row.unlock_condition_type) || "",
    unlock_condition_value: row.unlock_condition_value || "",
    is_active: row.is_active === true,
    is_secret: row.is_secret === true,
  };
}

// ============================================================
// List + getters
// ============================================================
export async function listActiveAchievementDefs(): Promise<AchievementDef[]> {
  const res = await listRows<any>("achievement_defs", {
    filter: { is_active__boolean: "true" },
    size: 200,
  });
  return res.results.filter((r) => r.code).map(defToApi);
}

export async function listUserAchievements(userId: number, petId: number): Promise<UserAchievement[]> {
  const res = await listRows<any>("user_achievements", {
    filter: {
      user_id__equal: String(userId),
      pet_id__link_row_has: String(petId),
    },
    size: 200,
  });
  return res.results.filter((r) => r.achievement_code) as UserAchievement[];
}

// ============================================================
// Signal helpers — call existing tables
// ============================================================
async function countCompletedVaccines(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("vaccines", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 200,
    });
    return res.results.filter((v) => flatVal<string>(v.status) === "completed").length;
  } catch {
    return 0;
  }
}

async function getCurrentStreak(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("routine_streaks", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 5,
    });
    const row = res.results[0];
    return Number(row?.current_streak) || 0;
  } catch {
    return 0;
  }
}

async function countPetPhotos(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("pet_photos", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 200,
    });
    return res.results.length;
  } catch {
    return 0;
  }
}

async function countUserMatches(userId: number): Promise<number> {
  try {
    const [aRes, bRes] = await Promise.all([
      listRows<any>("playdate_matches", {
        filter: { user_a_id__equal: String(userId) },
        size: 100,
      }),
      listRows<any>("playdate_matches", {
        filter: { user_b_id__equal: String(userId) },
        size: 100,
      }),
    ]);
    return aRes.results.length + bRes.results.length;
  } catch {
    return 0;
  }
}

async function getProfileCompletionPercent(petId: number): Promise<number> {
  // Lightweight version: count populated fields among a known core set
  try {
    const pet = await getRow<any>("pets", petId);
    const fields = [
      "name", "species", "breed", "dob", "gender", "weight_kg", "color",
      "photo_url", "personality_type", "microchip_id",
      "owner_emergency_phone", "vet_name", "vet_phone", "primary_diet",
      "allergies", "behavior_notes", "qr_code", "address",
    ];
    let filled = 0;
    for (const f of fields) {
      const v = (pet as any)[f];
      if (v != null && String(v).trim() !== "") filled++;
    }
    return Math.round((filled / fields.length) * 100);
  } catch {
    return 0;
  }
}

async function countMidnightCheckins(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("daily_check_ins", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 200,
    });
    return res.results.filter((c: any) => {
      // Check by check_date (date string) — best signal we have without timestamp
      // Fallback: assume 0 unless created_at hour 0-3
      const ts = c.created_at;
      if (!ts) return false;
      try {
        const h = new Date(ts).getHours();
        return h >= 0 && h < 3;
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

async function countCompletedBCS(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("bcs_assessments", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 100,
    });
    return res.results.filter((r) => r.bcs_score).length;
  } catch {
    return 0;
  }
}

// ============================================================
// Condition evaluation
// ============================================================
async function evaluateCondition(ctx: UnlockContext, def: AchievementDef): Promise<boolean> {
  const v = def.unlock_condition_value;

  switch (def.unlock_condition_type) {
    case "vaccine_count":
      return (await countCompletedVaccines(ctx.petId)) >= parseInt(v);

    case "streak_days":
      return (await getCurrentStreak(ctx.petId)) >= parseInt(v);

    case "bcs_done":
      if (v === "ideal") {
        // Either context provides it OR scan history
        if (ctx.trigger === "bcs_done" && ctx.data?.score >= 4 && ctx.data?.score <= 5) return true;
        const all = await listRows<any>("bcs_assessments", {
          filter: { pet_id__link_row_has: String(ctx.petId) }, size: 50,
        });
        return all.results.some((r) => {
          const s = Number(r.bcs_score);
          return s >= 4 && s <= 5;
        });
      }
      return (await countCompletedBCS(ctx.petId)) >= parseInt(v);

    case "photo_count":
      return (await countPetPhotos(ctx.petId)) >= parseInt(v);

    case "personality_done":
      // Trigger event OR pet has personality_type set
      if (ctx.trigger === "personality_done") return true;
      try {
        const pet = await getRow<any>("pets", ctx.petId);
        return !!(pet.personality_type && String(flatVal<string>(pet.personality_type) || "").length > 0);
      } catch { return false; }

    case "nutrition_done":
      // Trigger only — nutrition has many shapes
      return ctx.trigger === "nutrition_done";

    case "mutual_matches":
      return (await countUserMatches(ctx.userId)) >= parseInt(v);

    case "hero_count": {
      const user: any = await findUserById(ctx.userId);
      return (Number(user?.pet_heroes_count) || 0) >= parseInt(v);
    }

    case "profile_completion":
      return (await getProfileCompletionPercent(ctx.petId)) >= parseInt(v);

    case "midnight_checkin":
      return (await countMidnightCheckins(ctx.petId)) >= parseInt(v);

    case "first_birthday":
      return ctx.trigger === "first_birthday";

    case "first_match":
      return ctx.trigger === "first_match" || (await countUserMatches(ctx.userId)) >= 1;

    default:
      return false;
  }
}

// ============================================================
// Unlock
// ============================================================
async function unlockAchievement(ctx: UnlockContext, def: AchievementDef): Promise<{ achievement_code: string; def: AchievementDef } | null> {
  try {
    await createRow("user_achievements", {
      user_id: ctx.userId,
      pet_id: [ctx.petId],
      achievement_code: def.code,
      unlocked_at: new Date().toISOString(),
      viewed: false,
    });
  } catch (err) {
    console.error(`[achievements] persist failed ${def.code}:`, err);
    return null;
  }

  // Bump user.pet_score_bonus accumulator (reuse M27 field) + invalidate cache
  try {
    const user: any = await findUserById(ctx.userId);
    if (user) {
      const newBonus = (Number(user.pet_score_bonus) || 0) + def.pet_score_bonus;
      await updateRow("users", ctx.userId, { pet_score_bonus: newBonus });
      invalidatePetScore(ctx.petId);
    }
  } catch (err) {
    console.error(`[achievements] bonus update failed:`, err);
  }

  // Push notification (best-effort)
  try {
    const user: any = await findUserById(ctx.userId);
    if (user?.push_subscription) {
      await sendPush(
        ctx.userId,
        user.push_subscription,
        {
          title: `🎉 Huy hiệu mới: ${def.emoji} ${def.name}`,
          body: `${def.description} (+${def.pet_score_bonus} Pet Score)`,
          data: { url: `/pets/${ctx.petId}/achievements`, achievement_code: def.code },
        },
        { type: "vaccine_reminder" }
      );
    }
  } catch (err) {
    console.error(`[achievements] push failed:`, err);
  }

  // Session C: Community feed (skip secret achievements + skip badges that are pure progress markers like checkin_today)
  if (!def.is_secret) {
    try {
      const { createCommunityEvent } = await import("./community-feed.ts");
      await createCommunityEvent({
        eventType: "achievement_unlock",
        userId: ctx.userId,
        petId: ctx.petId,
        eventData: {
          achievement_code: def.code,
          name: def.name,
          emoji: def.emoji,
          tier: def.tier,
          category: def.category,
        },
      });
    } catch (err) {
      console.error("[achievements] community event failed:", err);
    }
  }

  return { achievement_code: def.code, def };
}

// ============================================================
// Main entry point — called from endpoint hooks
// ============================================================
export async function checkAndUnlockAchievements(ctx: UnlockContext): Promise<Array<{ achievement_code: string; def: AchievementDef }>> {
  let defs: AchievementDef[];
  let alreadyUnlocked: UserAchievement[];
  try {
    [defs, alreadyUnlocked] = await Promise.all([
      listActiveAchievementDefs(),
      listUserAchievements(ctx.userId, ctx.petId),
    ]);
  } catch (err) {
    console.error("[achievements] check failed:", err);
    return [];
  }

  const have = new Set(alreadyUnlocked.map((a) => a.achievement_code));
  const newly: Array<{ achievement_code: string; def: AchievementDef }> = [];

  for (const def of defs) {
    if (have.has(def.code)) continue;
    let matches = false;
    try {
      matches = await evaluateCondition(ctx, def);
    } catch (err) {
      console.error(`[achievements] eval ${def.code}:`, err);
    }
    if (!matches) continue;
    const result = await unlockAchievement(ctx, def);
    if (result) newly.push(result);
  }

  if (newly.length > 0) {
    console.log(`[achievements] user=${ctx.userId} pet=${ctx.petId} trigger=${ctx.trigger} → unlocked ${newly.map((n) => n.achievement_code).join(", ")}`);
  }
  return newly;
}

// ============================================================
// Mark viewed
// ============================================================
export async function markAchievementViewed(userId: number, petId: number, code: string): Promise<void> {
  const res = await listRows<any>("user_achievements", {
    filter: {
      user_id__equal: String(userId),
      pet_id__link_row_has: String(petId),
      achievement_code__equal: code,
    },
    size: 1,
  });
  const row = res.results[0];
  if (!row) return;
  await updateRow("user_achievements", row.id, { viewed: true });
}

export async function countUnviewedAchievements(userId: number, petId: number): Promise<number> {
  const res = await listRows<any>("user_achievements", {
    filter: {
      user_id__equal: String(userId),
      pet_id__link_row_has: String(petId),
      viewed__boolean: "false",
    },
    size: 100,
  });
  return res.results.length;
}
