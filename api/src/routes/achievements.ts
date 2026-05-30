/**
 * Achievements routes.
 *
 * Mount: app.route("/api/v1/achievements", achievementsRoute)
 *
 * Endpoints:
 *   GET    /achievements/pets/:petId               — list defs + unlock status
 *   GET    /achievements/pets/:petId/unviewed      — unviewed-only summary
 *   POST   /achievements/pets/:petId/:code/mark-viewed
 *
 * All auth required.
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { listRows } from "@shared/baserow.ts";
import {
  listActiveAchievementDefs,
  listUserAchievements,
  markAchievementViewed,
  countUnviewedAchievements,
} from "../lib/achievements.ts";

export const achievementsRoute = new Hono();
// Auth gate only for pet-scoped routes; /:code/social-proof stays public for community visibility
achievementsRoute.use("/pets/*", requireAuth);

achievementsRoute.get("/pets/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }

  try {
    const [defs, userUnlocked] = await Promise.all([
      listActiveAchievementDefs(),
      listUserAchievements(session.sub, petId),
    ]);

    const unlockedMap = new Map(userUnlocked.map((u) => [u.achievement_code, u]));

    const achievements = defs.map((def) => {
      const user = unlockedMap.get(def.code);
      const base: any = {
        code: def.code,
        name: def.name,
        description: def.description,
        emoji: def.emoji,
        category: def.category,
        tier: def.tier,
        pet_score_bonus: def.pet_score_bonus,
        is_secret: def.is_secret,
        unlocked: !!user,
        unlocked_at: user?.unlocked_at || null,
        viewed: user?.viewed || false,
      };
      // Hide secret content when locked
      if (def.is_secret && !user) {
        base.name = "???";
        base.description = "Bí mật — unlock để biết";
        base.emoji = "❓";
      }
      return base;
    });

    const summary = {
      total: defs.length,
      unlocked_count: userUnlocked.length,
      by_category: {} as Record<string, { total: number; unlocked: number }>,
      by_tier: {} as Record<string, { total: number; unlocked: number }>,
      total_bonus_earned: 0,
    };
    for (const def of defs) {
      if (!summary.by_category[def.category]) summary.by_category[def.category] = { total: 0, unlocked: 0 };
      if (!summary.by_tier[def.tier]) summary.by_tier[def.tier] = { total: 0, unlocked: 0 };
      summary.by_category[def.category].total++;
      summary.by_tier[def.tier].total++;
      const u = unlockedMap.get(def.code);
      if (u) {
        summary.by_category[def.category].unlocked++;
        summary.by_tier[def.tier].unlocked++;
        summary.total_bonus_earned += def.pet_score_bonus;
      }
    }

    return c.json({ achievements, summary });
  } catch (err) {
    console.error("[achievements/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load" } }, 500);
  }
});

achievementsRoute.get("/pets/:petId{[0-9]+}/unviewed", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const count = await countUnviewedAchievements(session.sub, petId);
    return c.json({ count });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// Session C: PUBLIC social proof — count how many pets unlocked this achievement
// No auth required (just counts, no PII)
achievementsRoute.get("/:code/social-proof", async (c) => {
  const code = c.req.param("code");
  if (!code || code.length > 100) return c.json({ error: { code: "BAD_CODE" } }, 400);
  try {
    const all = await listRows<any>("user_achievements", {
      filter: { achievement_code__equal: code },
      size: 200,
    });
    const total = all.results.length;

    // Recent 7d count
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const recent = all.results.filter((r) => (r.unlocked_at || "").slice(0, 10) >= sevenDaysAgo);
    const recentCount = recent.length;

    // Pull 3 pet names (denormalized via pet_id link)
    const namesSet = new Set<string>();
    for (const r of recent.slice(0, 10)) {
      const link = (r.pet_id || [])[0];
      if (link?.value) namesSet.add(String(link.value));
      if (namesSet.size >= 3) break;
    }

    return c.json({
      achievement_code: code,
      total_unlocks: total,
      recent_count_7d: recentCount,
      unlocked_recently_pets: [...namesSet],
    });
  } catch (err) {
    console.error("[achievements/social-proof] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

achievementsRoute.post("/pets/:petId{[0-9]+}/:code/mark-viewed", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  const code = c.req.param("code");
  try {
    await getOwnedPet(petId, session.sub);
    await markAchievementViewed(session.sub, petId, code);
    return c.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
