/**
 * Pet Heroes routes.
 *
 * Mount: app.route("/api/v1/heroes", heroesRoute)
 *
 * Endpoints:
 *   GET    /heroes/leaderboard?period=week|month|all       — PUBLIC
 *   GET    /heroes/profile/:userId                          — PUBLIC (if public_profile_enabled)
 *   GET    /heroes/profile/slug/:slug                       — PUBLIC
 *   GET    /heroes/profile/:userId/acts                     — PUBLIC, recent hero acts
 *   GET    /heroes/my-stats                                  — AUTH
 *   POST   /heroes/toggle-public                             — AUTH (body: {enabled: bool})
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import {
  getLeaderboard,
  getHeroProfile,
  getHeroProfileBySlug,
  listHeroActsForUser,
  togglePublicProfile,
  type Period,
} from "../lib/pet-heroes.ts";

export const heroesRoute = new Hono();

// ============================================================
// PUBLIC
// ============================================================
heroesRoute.get("/leaderboard", async (c) => {
  const period = (c.req.query("period") as Period) || "all";
  if (!["week", "month", "all"].includes(period)) {
    return c.json({ error: { code: "BAD_PERIOD", message: "period phải là week/month/all" } }, 400);
  }
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") || 20)));
  try {
    const entries = await getLeaderboard(period, limit);
    return c.json({ entries, total: entries.length, period });
  } catch (err) {
    console.error("[heroes/leaderboard] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load leaderboard" } }, 500);
  }
});

heroesRoute.get("/profile/:userId{[0-9]+}", async (c) => {
  const userId = Number(c.req.param("userId"));
  try {
    const profile = await getHeroProfile(userId);
    if (!profile) return c.json({ error: { code: "NOT_FOUND", message: "Profile riêng tư hoặc không tồn tại" } }, 404);
    return c.json({ profile });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

heroesRoute.get("/profile/slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const profile = await getHeroProfileBySlug(slug);
    if (!profile) return c.json({ error: { code: "NOT_FOUND", message: "Profile không tồn tại" } }, 404);
    return c.json({ profile });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

heroesRoute.get("/profile/:userId{[0-9]+}/acts", async (c) => {
  const userId = Number(c.req.param("userId"));
  try {
    const profile = await getHeroProfile(userId);
    if (!profile) return c.json({ error: { code: "NOT_FOUND", message: "Profile riêng tư hoặc không tồn tại" } }, 404);
    const acts = await listHeroActsForUser(userId, 20);
    return c.json({ acts, total: acts.length });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// AUTH
// ============================================================
heroesRoute.get("/my-stats", requireAuth, async (c) => {
  const session = c.get("user");
  try {
    const profile = await getHeroProfile(session.sub);
    return c.json({ profile });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

heroesRoute.post("/toggle-public", requireAuth, async (c) => {
  const session = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  const enabled = body.enabled !== false;
  try {
    const profile = await togglePublicProfile(session.sub, enabled);
    return c.json({ profile, enabled });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
