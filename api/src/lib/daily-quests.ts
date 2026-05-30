/**
 * Daily quests — assign 3 random quests per pet per day, track completion.
 *
 * assignDailyQuests(userId, petId, dateISO?) — idempotent for a date; returns assigned quests
 * listTodayQuests(userId, petId) — list with completion status
 * completeQuest(userId, petId, code, trigger?) — mark complete + bump pet_score_bonus + push
 * trackQuestTrigger(userId, petId, triggerCondition) — generic event hook; auto-completes matching open quests
 *
 * Quest selection: 1 easy + 1 medium + 1 hard (with fallback to any active if pool short).
 */
import { listRows, createRow, updateRow } from "@shared/baserow.ts";
import { findUserById } from "./users.ts";
import { invalidatePetScore } from "./pet-score.ts";
import { sendPush } from "./web-push.ts";

export type QuestDifficulty = "easy" | "medium" | "hard";

export interface QuestDef {
  id: number;
  code: string;
  name: string;
  description: string;
  emoji: string;
  difficulty: QuestDifficulty;
  pet_score_bonus: number;
  trigger_condition: string;
  is_active: boolean;
}

export interface UserDailyQuest {
  id: number;
  user_id: number;
  pet_id: number;
  quest_code: string;
  assigned_date: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  definition?: QuestDef;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function defToApi(row: any): QuestDef {
  return {
    id: row.id,
    code: row.code || "",
    name: row.name || "",
    description: row.description || "",
    emoji: row.emoji || "",
    difficulty: (flatVal<QuestDifficulty>(row.difficulty) || "easy") as QuestDifficulty,
    pet_score_bonus: Number(row.pet_score_bonus) || 0,
    trigger_condition: flatVal<string>(row.trigger_condition) || "",
    is_active: row.is_active === true,
  };
}

function questToApi(row: any, defsMap?: Map<string, QuestDef>): UserDailyQuest {
  const code = row.quest_code || "";
  const link = (row.pet_id || [])[0];
  return {
    id: row.id,
    user_id: Number(row.user_id) || 0,
    pet_id: link?.id ?? 0,
    quest_code: code,
    assigned_date: row.assigned_date || "",
    completed: row.completed === true,
    completed_at: row.completed_at || null,
    created_at: row.created_at || "",
    definition: defsMap?.get(code),
  };
}

// ============================================================
// Listing
// ============================================================
export async function listActiveQuestDefs(): Promise<QuestDef[]> {
  const res = await listRows<any>("quest_definitions", {
    filter: { is_active__boolean: "true" },
    size: 100,
  });
  return res.results.filter((r) => r.code).map(defToApi);
}

async function getDefsMap(): Promise<Map<string, QuestDef>> {
  const defs = await listActiveQuestDefs();
  return new Map(defs.map((d) => [d.code, d]));
}

export async function listTodayQuests(userId: number, petId: number, dateISO?: string): Promise<UserDailyQuest[]> {
  const date = (dateISO || new Date().toISOString()).slice(0, 10);
  const [questsRes, defsMap] = await Promise.all([
    listRows<any>("user_daily_quests", {
      filter: {
        user_id__equal: String(userId),
        pet_id__link_row_has: String(petId),
        assigned_date__equal: date,
      },
      size: 10,
    }),
    getDefsMap(),
  ]);
  return questsRes.results.filter((r) => r.quest_code).map((r) => questToApi(r, defsMap));
}

export async function listQuestHistory(userId: number, petId: number, limit = 30): Promise<UserDailyQuest[]> {
  const [questsRes, defsMap] = await Promise.all([
    listRows<any>("user_daily_quests", {
      filter: {
        user_id__equal: String(userId),
        pet_id__link_row_has: String(petId),
      },
      size: Math.min(limit, 200),
      orderBy: "-assigned_date",
    }),
    getDefsMap(),
  ]);
  return questsRes.results.filter((r) => r.quest_code).map((r) => questToApi(r, defsMap));
}

// ============================================================
// Assignment
// ============================================================
function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

export async function assignDailyQuests(userId: number, petId: number, dateISO?: string): Promise<UserDailyQuest[]> {
  const date = (dateISO || new Date().toISOString()).slice(0, 10);
  // Top-up semantics (changed from early-return):
  //   - If 3+ quests already exist for today, return them (idempotent — cron-safe).
  //   - If 0/1/2 quests exist, fill the gap to 3, preferring missing difficulty tiers.
  //   - Never duplicates existing quest_code, never resets completed state.
  const existing = await listTodayQuests(userId, petId, date);
  if (existing.length >= 3) return existing.slice(0, 3);

  const defs = await listActiveQuestDefs();
  const usedCodes = new Set(existing.map((e) => e.definition?.code).filter(Boolean));
  const usedDiffs = new Set(existing.map((e) => e.definition?.difficulty).filter(Boolean));
  const available = defs.filter((d) => !usedCodes.has(d.code));

  const byDifficulty: Record<QuestDifficulty, QuestDef[]> = {
    easy:   available.filter((d) => d.difficulty === "easy"),
    medium: available.filter((d) => d.difficulty === "medium"),
    hard:   available.filter((d) => d.difficulty === "hard"),
  };

  // Prefer missing difficulty tiers first (variable-reward UX: 1 easy + 1 medium + 1 hard)
  const wantedDiffs: QuestDifficulty[] = (["easy", "medium", "hard"] as QuestDifficulty[]).filter(
    (d) => !usedDiffs.has(d)
  );
  const slotsNeeded = 3 - existing.length;
  const chosen: QuestDef[] = [];
  for (const diff of wantedDiffs) {
    if (chosen.length >= slotsNeeded) break;
    const picks = pickRandom(byDifficulty[diff], 1);
    if (picks.length) chosen.push(picks[0]);
  }
  // Fallback: fill any remaining slots from whatever's available (pool short edge case)
  while (chosen.length < slotsNeeded) {
    const remaining = available.filter((d) => !chosen.find((c) => c.code === d.code));
    if (remaining.length === 0) break;
    chosen.push(pickRandom(remaining, 1)[0]);
  }

  const now = new Date().toISOString();
  const created: UserDailyQuest[] = [];
  const defsMap = new Map(defs.map((d) => [d.code, d]));
  for (const def of chosen) {
    try {
      const row = await createRow<any>("user_daily_quests", {
        user_id: userId,
        pet_id: [petId],
        quest_code: def.code,
        assigned_date: date,
        completed: false,
        completed_at: null,
        created_at: now,
      });
      created.push(questToApi(row, defsMap));
    } catch (err) {
      console.error(`[daily-quests] assign ${def.code}:`, err);
    }
  }
  // Return EXISTING + newly created (caller expects full set of today's quests)
  return [...existing, ...created];
}

// ============================================================
// Completion
// ============================================================
export async function completeQuest(
  userId: number,
  petId: number,
  questCode: string,
  dateISO?: string
): Promise<{ quest: UserDailyQuest; bonus_awarded: number } | null> {
  const date = (dateISO || new Date().toISOString()).slice(0, 10);
  const res = await listRows<any>("user_daily_quests", {
    filter: {
      user_id__equal: String(userId),
      pet_id__link_row_has: String(petId),
      quest_code__equal: questCode,
      assigned_date__equal: date,
    },
    size: 1,
  });
  const row = res.results[0];
  if (!row || row.completed === true) return null;

  const defsMap = await getDefsMap();
  const def = defsMap.get(questCode);
  if (!def) return null;

  await updateRow("user_daily_quests", row.id, {
    completed: true,
    completed_at: new Date().toISOString(),
  });

  // Bump user.pet_score_bonus + invalidate cache
  try {
    const user: any = await findUserById(userId);
    if (user) {
      const newBonus = (Number(user.pet_score_bonus) || 0) + def.pet_score_bonus;
      await updateRow("users", userId, { pet_score_bonus: newBonus });
      invalidatePetScore(petId);
    }
  } catch (err) {
    console.error(`[daily-quests] bonus update failed:`, err);
  }

  // Push (low-key)
  try {
    const user: any = await findUserById(userId);
    if (user?.push_subscription) {
      await sendPush(
        userId,
        user.push_subscription,
        {
          title: `✅ Hoàn thành quest: ${def.emoji} ${def.name}`,
          body: `+${def.pet_score_bonus} Pet Score`,
          data: { url: `/pets/${petId}/quests`, quest_code: questCode },
        },
        { type: "vaccine_reminder" }
      );
    }
  } catch (err) {
    console.error("[daily-quests] push failed:", err);
  }

  // Cascade: completing any quest worth ≥10 points means today's Pet Score went up ≥10.
  // Fire pet_score_increase trigger (but NOT for itself — avoid recursion).
  if (questCode !== "pet_score_increase" && def.pet_score_bonus >= 10) {
    try {
      // Inline match logic (cannot call trackQuestTrigger — circular import would be fine but
      // we need to avoid infinite loop; trackQuestTrigger calls completeQuest which is THIS func).
      // Safe because completeQuest is idempotent (returns null if already completed).
      const todays = await listTodayQuests(userId, petId, date);
      const psiQuest = todays.find(
        (q) => !q.completed && q.definition?.trigger_condition === "pet_score_increase"
      );
      if (psiQuest) {
        await completeQuest(userId, petId, psiQuest.quest_code, date);
      }
    } catch (err) {
      console.error("[daily-quests] pet_score_increase cascade failed:", err);
    }
  }

  return {
    quest: questToApi({ ...row, completed: true, completed_at: new Date().toISOString() }, defsMap),
    bonus_awarded: def.pet_score_bonus,
  };
}

/**
 * Generic event hook — when something happens (e.g., user submitted check-in),
 * call this to auto-complete any matching open quest of trigger_condition.
 */
export async function trackQuestTrigger(
  userId: number,
  petId: number,
  triggerCondition: string,
  dateISO?: string
): Promise<UserDailyQuest[]> {
  const todays = await listTodayQuests(userId, petId, dateISO);
  const matches = todays.filter((q) => !q.completed && q.definition?.trigger_condition === triggerCondition);
  const completed: UserDailyQuest[] = [];
  for (const q of matches) {
    const r = await completeQuest(userId, petId, q.quest_code, dateISO);
    if (r) completed.push(r.quest);
  }
  return completed;
}

// ============================================================
// Bulk assign (for cron job)
// ============================================================
export async function assignDailyQuestsForAllPets(dateISO?: string): Promise<{ assigned: number; skipped: number }> {
  const date = (dateISO || new Date().toISOString()).slice(0, 10);
  // Find pets whose owner has push_subscription (proxy for "active user")
  const pets = await listRows<any>("pets", { size: 200 });
  let assigned = 0, skipped = 0;
  for (const pet of pets.results) {
    const link = (pet.user_id || [])[0];
    const userId = link?.id;
    if (!userId) continue;
    try {
      const created = await assignDailyQuests(userId, pet.id, date);
      if (created.length > 0) assigned++;
      else skipped++;
    } catch (err) {
      console.error(`[daily-quests/bulk] pet=${pet.id}:`, String(err).slice(0, 120));
    }
  }
  return { assigned, skipped };
}
