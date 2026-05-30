/**
 * Pain + Mobility routes (M23).
 * Mount: app.route("/api/v1/pets", painMobilityRoute)
 *
 *   GET    /:id/pain               — list
 *   GET    /:id/pain/latest        — latest
 *   POST   /:id/pain                — submit {answers, notes?}
 *
 *   GET    /:id/mobility            — list
 *   GET    /:id/mobility/latest     — latest
 *   POST   /:id/mobility            — submit {answers, notes?}
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  createPain, listPain, getLatestPain,
  createMobility, listMobility, getLatestMobility,
} from "../lib/pain-mobility.ts";

export const painMobilityRoute = new Hono();
painMobilityRoute.use("*", requireAuth);

// ─── Pain ───
painMobilityRoute.get("/:id{[0-9]+}/pain", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const list = await listPain(petId);
    return c.json({ assessments: list, total: list.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

painMobilityRoute.get("/:id{[0-9]+}/pain/latest", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    return c.json({ latest: await getLatestPain(petId) });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

painMobilityRoute.post("/:id{[0-9]+}/pain", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }
  if (!body.answers) return c.json({ error: { code: "MISSING_ANSWERS", message: "Thiếu answers" } }, 400);
  try {
    await getOwnedPet(petId, session.sub);
    const a = await createPain(petId, body.answers, body.notes);
    return c.json(a, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    console.error("[pain/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi lưu" } }, 500);
  }
});

// ─── Mobility ───
painMobilityRoute.get("/:id{[0-9]+}/mobility", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const list = await listMobility(petId);
    return c.json({ assessments: list, total: list.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

painMobilityRoute.get("/:id{[0-9]+}/mobility/latest", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    return c.json({ latest: await getLatestMobility(petId) });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

painMobilityRoute.post("/:id{[0-9]+}/mobility", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }
  if (!body.answers) return c.json({ error: { code: "MISSING_ANSWERS", message: "Thiếu answers" } }, 400);
  try {
    await getOwnedPet(petId, session.sub);
    const m = await createMobility(petId, body.answers, body.notes);
    return c.json(m, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    console.error("[mobility/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi lưu" } }, 500);
  }
});
