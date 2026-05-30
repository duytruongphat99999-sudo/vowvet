/**
 * Decision-tree Triage routes (M31).
 *
 * Mount: app.route("/api/v1/triage-tree", triageTreeRoute)
 *
 * Public (no auth) — the tree itself, so people can browse before signing up:
 *   GET    /triage-tree/tree              — full tree
 *   GET    /triage-tree/node/:nodeId      — single node
 *
 * Auth required:
 *   POST   /triage-tree/session                 — save completed session
 *   GET    /triage-tree/pets/:petId/history     — past sessions
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  getTreeNode,
  getRootNode,
  getFullTree,
  saveTriageSession,
  listTriageHistory,
  type TriageAnswer,
} from "../lib/triage-tree.ts";
import { isValidTier } from "@shared/triage-tree.ts";

export const triageTreeRoute = new Hono();

// ============================================================
// PUBLIC: tree access
// ============================================================
triageTreeRoute.get("/tree", (c) => {
  return c.json({ tree: getFullTree(), root: getRootNode().id });
});

triageTreeRoute.get("/node/:nodeId", (c) => {
  const nodeId = c.req.param("nodeId");
  const node = getTreeNode(nodeId);
  if (!node) return c.json({ error: { code: "NOT_FOUND", message: "Node không tồn tại" } }, 404);
  return c.json({ node });
});

// ============================================================
// Auth required: persistence
// ============================================================
triageTreeRoute.post("/session", requireAuth, async (c) => {
  const session = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  const petId = Number(body.petId || body.pet_id);
  if (!petId) return c.json({ error: { code: "PET_REQUIRED", message: "Cần petId" } }, 400);

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  const finalTier = body.finalTier || body.final_tier;
  if (!isValidTier(finalTier)) {
    return c.json({ error: { code: "BAD_TIER", message: "Tier không hợp lệ" } }, 400);
  }

  const answers: TriageAnswer[] = Array.isArray(body.answers) ? body.answers.slice(0, 20) : [];

  try {
    const saved = await saveTriageSession({
      petId,
      userId: session.sub,
      primarySymptom: String(body.primarySymptom || body.primary_symptom || "").slice(0, 200),
      answers,
      finalTier,
      finalRecommendation: String(body.finalRecommendation || body.final_recommendation || "").slice(0, 2000),
    });
    return c.json({ session: saved }, 201);
  } catch (err: any) {
    console.error("[triage-tree/session/save] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi lưu session" } }, 500);
  }
});

triageTreeRoute.get("/pets/:petId{[0-9]+}/history", requireAuth, async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const sessions = await listTriageHistory(petId);
    return c.json({ sessions, total: sessions.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load history" } }, 500);
  }
});
