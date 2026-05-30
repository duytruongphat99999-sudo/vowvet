/**
 * Nudges routes (Session B).
 *
 * Mount: app.route("/api/v1/nudges", nudgesRoute)
 *
 * Endpoints (auth):
 *   GET    /nudges/pets/:petId             — list current opportunities (read-only)
 *   POST   /nudges/:nudgeId/dismiss        — mark response=dismissed (so analytics knows)
 *   POST   /nudges/:nudgeId/clicked        — mark response=clicked
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { findNudgeOpportunities } from "../lib/nudges.ts";
import { updateRow, getRow } from "@shared/baserow.ts";

export const nudgesRoute = new Hono();
nudgesRoute.use("*", requireAuth);

nudgesRoute.get("/pets/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const opps = await findNudgeOpportunities(session.sub, petId);
    return c.json({ opportunities: opps, total: opps.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

nudgesRoute.post("/:nudgeId{[0-9]+}/dismiss", async (c) => {
  const session = c.get("user");
  const nudgeId = Number(c.req.param("nudgeId"));
  try {
    const row: any = await getRow("user_nudges_sent", nudgeId);
    if (!row || Number(row.user_id) !== session.sub) {
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    }
    await updateRow("user_nudges_sent", nudgeId, { response: "dismissed" });
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

nudgesRoute.post("/:nudgeId{[0-9]+}/clicked", async (c) => {
  const session = c.get("user");
  const nudgeId = Number(c.req.param("nudgeId"));
  try {
    const row: any = await getRow("user_nudges_sent", nudgeId);
    if (!row || Number(row.user_id) !== session.sub) {
      return c.json({ error: { code: "NOT_FOUND" } }, 404);
    }
    await updateRow("user_nudges_sent", nudgeId, { response: "clicked" });
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
