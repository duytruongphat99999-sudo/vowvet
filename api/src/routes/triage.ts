/**
 * Triage routes (M9.1).
 *
 * Mount points (registered in api/src/index.ts):
 *   GET  /api/v1/triage/symptoms              — list (public-ish, auth required vẫn để tránh scraping)
 *   POST /api/v1/pets/:id/triage              — start triage cho pet
 *   GET  /api/v1/pets/:id/triage/history      — past sessions
 *   GET  /api/v1/triage/sessions/:id          — get one session detail
 *   POST /api/v1/triage/sessions/:id/feedback — user action (after seeing result)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { TriageStartSchema, TriageFeedbackSchema } from "@shared/zod-schemas/triage.ts";
import { EscalateTriageSchema } from "@shared/zod-schemas/chat.ts";
import {
  runTriage,
  listTriageHistory,
  getTriageSession,
  updateUserAction,
} from "../lib/triage.ts";
import { escalateTriageToChat } from "../lib/chat.ts";
import { notifyVetsNewThread } from "../lib/chat-notifications.ts";
import { invalidate as invalidateCarePlanV2 } from "../lib/care-plan-cache.ts";
import { invalidatePetScore } from "../lib/pet-score.ts";
import {
  listSymptoms,
  CATEGORY_LABEL_VI,
  type SymptomCategory,
} from "@shared/triage-symptoms.ts";

// ============================================================
// /api/v1/triage/symptoms (auth required)
// ============================================================
export const triageSymptomsRoute = new Hono();
triageSymptomsRoute.use("*", requireAuth);

triageSymptomsRoute.get("/symptoms", (c) => {
  const species = c.req.query("species") as "dog" | "cat" | undefined;
  const category = c.req.query("category") as SymptomCategory | undefined;
  const speciesFilter = species === "dog" || species === "cat" ? species : undefined;
  const symptoms = listSymptoms({ species: speciesFilter, category });

  // Group by category for UI step 1 convenience
  const byCategory: Record<string, typeof symptoms> = {};
  for (const s of symptoms) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  }

  return c.json({
    symptoms,
    by_category: byCategory,
    categories: Object.entries(CATEGORY_LABEL_VI).map(([key, label]) => ({
      key,
      label,
      count: byCategory[key]?.length || 0,
    })),
    total: symptoms.length,
  });
});

// ============================================================
// Pet-scoped triage routes (auth + ownership)
// Mount at /api/v1/pets, Hono merges by path
// ============================================================
export const petTriageRoute = new Hono();
petTriageRoute.use("*", requireAuth);

// POST /pets/:id/triage
petTriageRoute.post(
  "/:id{[0-9]+}/triage",
  zValidator("json", TriageStartSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const data = c.req.valid("json");

    try {
      const pet = await getOwnedPet(petId, session.sub);
      const result = await runTriage({
        petId,
        pet,
        symptomIds: data.symptoms,
        durationHours: data.duration_hours,
        userNotes: data.notes,
        userPhone: session.phone || "",
        userId: session.sub,
      });
      // M4.1: triage tạo signal → invalidate care plan v2 cache
      invalidateCarePlanV2(petId);
      // M14.2: triage thay đổi recent_emergency signal
      invalidatePetScore(petId);
      return c.json({ session: result });
    } catch (err: any) {
      const status = err?.status || 500;
      if (status === 404 || status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      if (status === 400) {
        return c.json({ error: { code: err.code, message: err.message } }, 400);
      }
      console.error("[triage/start] error:", err);
      return c.json(
        { error: { code: "TRIAGE_FAIL", message: err?.message || "Lỗi sinh triage" } },
        500
      );
    }
  }
);

// GET /pets/:id/triage/history
petTriageRoute.get("/:id{[0-9]+}/triage/history", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") || "50")));
  try {
    await getOwnedPet(petId, session.sub);
    const sessions = await listTriageHistory(petId, limit);
    return c.json({ pet_id: petId, sessions });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[triage/history] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load history" } }, 500);
  }
});

// ============================================================
// /api/v1/triage/sessions/:id — view + feedback
// ============================================================
export const triageSessionRoute = new Hono();
triageSessionRoute.use("*", requireAuth);

triageSessionRoute.get("/sessions/:id{[0-9]+}", async (c) => {
  const session = c.get("user");
  const sid = Number(c.req.param("id"));
  try {
    const triage = await getTriageSession(sid);
    if (!triage) {
      return c.json({ error: { code: "NOT_FOUND", message: "Session không tồn tại" } }, 404);
    }
    // Ownership check qua pet
    await getOwnedPet(triage.pet_id, session.sub);
    return c.json({ session: triage });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[triage/session] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load session" } }, 500);
  }
});

triageSessionRoute.post(
  "/sessions/:id{[0-9]+}/feedback",
  zValidator("json", TriageFeedbackSchema),
  async (c) => {
    const session = c.get("user");
    const sid = Number(c.req.param("id"));
    const { user_action_taken } = c.req.valid("json");
    try {
      const triage = await getTriageSession(sid);
      if (!triage) {
        return c.json({ error: { code: "NOT_FOUND", message: "Session không tồn tại" } }, 404);
      }
      await getOwnedPet(triage.pet_id, session.sub);
      await updateUserAction(sid, user_action_taken);
      return c.json({ success: true });
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status);
      }
      console.error("[triage/feedback] error:", err);
      return c.json({ error: { code: "INTERNAL", message: "Lỗi lưu feedback" } }, 500);
    }
  }
);

// ============================================================
// M9.2: POST /sessions/:id/escalate-to-chat
// Idempotent: nếu đã có thread, return existing thread_id.
// ============================================================
triageSessionRoute.post(
  "/sessions/:id{[0-9]+}/escalate-to-chat",
  zValidator("json", EscalateTriageSchema),
  async (c) => {
    const session = c.get("user");
    const sid = Number(c.req.param("id"));
    const data = c.req.valid("json");

    try {
      const triage = await getTriageSession(sid);
      if (!triage) {
        return c.json(
          { error: { code: "TRIAGE_NOT_FOUND", message: "Triage session không tồn tại" } },
          404
        );
      }

      // Ownership + load pet
      const pet = await getOwnedPet(triage.pet_id, session.sub);

      const { thread, created } = await escalateTriageToChat(sid, session.sub, pet, {
        subjectOverride: data.subject_override,
      });

      // Notify vets fanout chỉ khi mới tạo (tránh spam re-notify nếu user click lần 2)
      if (created) {
        notifyVetsNewThread(thread, pet.name).catch((err) =>
          console.error("[triage/escalate] notify err:", err)
        );
      }

      return c.json({
        thread_id: thread.id,
        thread,
        created,
        message: created
          ? "Đã tạo cuộc chat với bác sĩ. Bác sĩ sẽ phản hồi sớm."
          : "Đã có cuộc chat sẵn cho triage này.",
      });
    } catch (err: any) {
      const status = err?.status || 500;
      if (status === 404 || status === 403 || status === 400) {
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      console.error("[triage/escalate] error:", err);
      return c.json(
        { error: { code: "INTERNAL", message: err?.message || "Lỗi escalate" } },
        500
      );
    }
  }
);
