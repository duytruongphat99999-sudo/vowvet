/**
 * Personality quiz routes (M13).
 *
 * Mount tại /api/v1.
 *
 * Endpoints:
 *   GET  /personality/types              — list 12 types với metadata (public-ish, auth required)
 *   GET  /personality/questions          — list 20 questions
 *   GET  /pets/:id/personality           — current state (ownership)
 *   POST /pets/:id/personality/submit    — score + save (ownership)
 *   POST /pets/:id/personality/reset     — clear (ownership)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet, patchPet } from "../lib/pets.ts";
import { PersonalitySubmitSchema } from "@shared/zod-schemas/personality.ts";
import {
  calculateType,
  buildResultPayload,
} from "../lib/personality-scoring.ts";
import {
  PERSONALITY_TYPES,
  ALL_TYPE_IDS,
  getPersonalityType,
} from "@shared/personality-types.ts";
import { PERSONALITY_QUESTIONS } from "@shared/personality-questions.ts";

const APP_DOMAIN = process.env.APP_DOMAIN || "https://vowvet.monminpet.com";

// ============================================================
// /api/v1/personality/* — public-ish (auth required, no ownership)
// ============================================================
export const personalityRoutes = new Hono();
personalityRoutes.use("*", requireAuth);

personalityRoutes.get("/types", (c) => {
  return c.json({
    types: ALL_TYPE_IDS.map((id) => PERSONALITY_TYPES[id]),
    total: ALL_TYPE_IDS.length,
  });
});

personalityRoutes.get("/questions", (c) => {
  return c.json({
    questions: PERSONALITY_QUESTIONS,
    total: PERSONALITY_QUESTIONS.length,
    dimensions: ["energy", "social", "food", "independence", "communication", "stress"],
  });
});

// ============================================================
// /api/v1/pets/:id/personality/* — owner only
// ============================================================
export const petPersonalityRoutes = new Hono();
petPersonalityRoutes.use("*", requireAuth);

// GET current state
petPersonalityRoutes.get("/:id{[0-9]+}/personality", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = (await getOwnedPet(petId, session.sub)) as any;
    const typeId = pet.personality_type || null;
    const secondary = pet.personality_secondary_type || null;
    if (!typeId) {
      return c.json({
        completed: false,
        type: null,
        secondary_type: null,
        completed_at: null,
      });
    }
    const typeMeta = getPersonalityType(typeId);
    const secondaryMeta = secondary ? getPersonalityType(secondary) : null;
    let scores: Record<string, number> | null = null;
    try {
      if (pet.personality_scores) scores = JSON.parse(pet.personality_scores);
    } catch {}
    return c.json({
      completed: true,
      type: typeId,
      secondary_type: secondary,
      type_meta: typeMeta,
      secondary_meta: secondaryMeta,
      scores,
      completed_at: pet.personality_completed_at || null,
      pet: {
        id: pet.id,
        name: pet.name,
        public_slug: pet.public_slug || null,
        is_public: pet.is_public === true,
      },
    });
  } catch (err: any) {
    const status = err?.status || 500;
    if (status === 404 || status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, status);
    }
    console.error("[personality/get] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load" } }, 500);
  }
});

// POST submit
petPersonalityRoutes.post(
  "/:id{[0-9]+}/personality/submit",
  zValidator("json", PersonalitySubmitSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const { answers } = c.req.valid("json");

    try {
      const pet = (await getOwnedPet(petId, session.sub)) as any;

      // Score
      const result = calculateType(answers);

      // Save to Baserow
      await patchPet(petId, {
        personality_type: result.primary,
        personality_secondary_type: result.secondary || null,
        personality_completed_at: new Date().toISOString(),
        personality_scores: JSON.stringify(result.scores),
      });

      // Build response payload
      const payload = buildResultPayload(
        result,
        pet.name,
        pet.public_slug || null,
        APP_DOMAIN
      );
      return c.json({
        success: true,
        ...payload,
        pet: {
          id: pet.id,
          name: pet.name,
          public_slug: pet.public_slug || null,
          is_public: pet.is_public === true,
        },
      });
    } catch (err: any) {
      const status = err?.status || 500;
      if (status === 404 || status === 403 || status === 400) {
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
      console.error("[personality/submit] error:", err);
      return c.json({ error: { code: "INTERNAL", message: err?.message || "Lỗi" } }, 500);
    }
  }
);

// POST reset
petPersonalityRoutes.post("/:id{[0-9]+}/personality/reset", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    await patchPet(petId, {
      personality_type: null,
      personality_secondary_type: null,
      personality_completed_at: null,
      personality_scores: null,
    });
    return c.json({ success: true });
  } catch (err: any) {
    const status = err?.status || 500;
    if (status === 404 || status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi reset" } }, 500);
  }
});
