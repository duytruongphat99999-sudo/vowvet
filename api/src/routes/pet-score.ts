/**
 * Pet Score routes (M14.2).
 *
 * GET  /api/v1/pets/:id/pet-score          — cached or compute
 * POST /api/v1/pets/:id/pet-score/refresh  — invalidate + recompute
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { getPetScore, invalidatePetScore } from "../lib/pet-score.ts";
import { SCORE_LEVELS } from "@shared/pet-score-formula.ts";

export const petScoreRoute = new Hono();
petScoreRoute.use("*", requireAuth);

petScoreRoute.get("/:id{[0-9]+}/pet-score", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    const result = await getPetScore(pet);
    return c.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[pet-score/get] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi compute score" } }, 500);
  }
});

petScoreRoute.post("/:id{[0-9]+}/pet-score/refresh", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    invalidatePetScore(petId);
    const result = await getPetScore(pet, { force_refresh: true });
    return c.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi refresh" } }, 500);
  }
});

// ============================================================
// Public-ish endpoint: list 5 levels (cho frontend reference page)
// ============================================================
petScoreRoute.get("/score-levels", (c) => {
  return c.json({ levels: SCORE_LEVELS });
});

// ============================================================
// Session C: 30-day trend + percentile vs community
// ============================================================
petScoreRoute.get("/:id{[0-9]+}/pet-score/trend", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const days = Math.min(90, Math.max(7, Number(c.req.query("days") || 30)));
  try {
    await getOwnedPet(petId, session.sub);
    const { getPetScoreTrend } = await import("../lib/pet-score-trend.ts");
    const trend = await getPetScoreTrend(petId, days);
    return c.json(trend);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[pet-score/trend] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

petScoreRoute.get("/:id{[0-9]+}/pet-score/percentile", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const { getPercentileVsCommunity } = await import("../lib/pet-score-trend.ts");
    const result = await getPercentileVsCommunity(petId);
    return c.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
