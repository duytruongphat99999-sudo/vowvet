/**
 * Cognitive CCDS routes (M24).
 * Mount: app.route("/api/v1/pets", cognitiveRoute)
 *
 *   GET    /:id/cognitive          — list assessments
 *   GET    /:id/cognitive/latest   — single most recent
 *   POST   /:id/cognitive          — submit answers {answers, notes?}
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { createAssessment, listAssessments, getLatest } from "../lib/cognitive.ts";

export const cognitiveRoute = new Hono();
cognitiveRoute.use("*", requireAuth);

cognitiveRoute.get("/:id{[0-9]+}/cognitive", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const list = await listAssessments(petId);
    return c.json({ assessments: list, total: list.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[cognitive/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

cognitiveRoute.get("/:id{[0-9]+}/cognitive/latest", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const latest = await getLatest(petId);
    return c.json({ latest });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

cognitiveRoute.post("/:id{[0-9]+}/cognitive", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }
  if (!body.answers || typeof body.answers !== "object") {
    return c.json({ error: { code: "MISSING_ANSWERS", message: "Thiếu answers" } }, 400);
  }
  try {
    await getOwnedPet(petId, session.sub);
    const assessment = await createAssessment(petId, body.answers, body.notes);
    return c.json(assessment, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[cognitive/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi lưu" } }, 500);
  }
});
