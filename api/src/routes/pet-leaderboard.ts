/**
 * Pet Score Leaderboard routes (Session B).
 *
 * Mount: app.route("/api/v1/leaderboard", petLeaderboardRoute)
 *
 *   GET    /leaderboard?period=this_month|last_month|all_time&species=&limit=  — PUBLIC
 *   POST   /leaderboard/opt-in                                                  — auth, body {pet_id, display_name?}
 *   POST   /leaderboard/opt-out                                                  — auth
 *   GET    /leaderboard/my-status                                                — auth, opt-in state
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { findUserById } from "../lib/users.ts";
import {
  getLeaderboard,
  optInLeaderboard,
  optOutLeaderboard,
  type LeaderboardPeriod,
} from "../lib/pet-leaderboard.ts";

export const petLeaderboardRoute = new Hono();

// PUBLIC list endpoint — no requireAuth
petLeaderboardRoute.get("/", async (c) => {
  const period = (c.req.query("period") as LeaderboardPeriod) || "this_month";
  if (!["this_month", "last_month", "all_time"].includes(period)) {
    return c.json({ error: { code: "BAD_PERIOD", message: "period phải là this_month/last_month/all_time" } }, 400);
  }
  const species = c.req.query("species") || undefined;
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 50)));
  try {
    const entries = await getLeaderboard({ period, species, limit });
    return c.json({ entries, total: entries.length, period, species: species || null });
  } catch (err) {
    console.error("[leaderboard/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load leaderboard" } }, 500);
  }
});

// AUTH endpoints
petLeaderboardRoute.post("/opt-in", requireAuth, async (c) => {
  const session = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  const petId = Number(body.pet_id);
  if (!petId) return c.json({ error: { code: "PET_REQUIRED", message: "Cần pet_id" } }, 400);
  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực pet" } }, 500);
  }
  try {
    const displayName = typeof body.display_name === "string" ? body.display_name.slice(0, 60) : undefined;
    await optInLeaderboard(session.sub, petId, displayName);
    return c.json({ success: true, pet_id: petId, display_name: displayName });
  } catch (err) {
    console.error("[leaderboard/opt-in] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi opt-in" } }, 500);
  }
});

petLeaderboardRoute.post("/opt-out", requireAuth, async (c) => {
  const session = c.get("user");
  try {
    await optOutLeaderboard(session.sub);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi opt-out" } }, 500);
  }
});

petLeaderboardRoute.get("/my-status", requireAuth, async (c) => {
  const session = c.get("user");
  try {
    const user: any = await findUserById(session.sub);
    const leaderboardPetField = user?.leaderboard_pet_id;
    const leaderboardPetId = Array.isArray(leaderboardPetField) && leaderboardPetField[0]?.id
      ? leaderboardPetField[0].id : null;
    return c.json({
      opted_in: user?.show_in_leaderboard === true,
      leaderboard_pet_id: leaderboardPetId,
      public_display_name: user?.public_display_name || null,
    });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
