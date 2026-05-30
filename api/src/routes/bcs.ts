/**
 * BCS AI Vision routes (M22).
 *
 * Mount: app.route("/api/v1/pets", bcsRoute)
 *
 * Endpoints:
 *   POST   /pets/:id/bcs/assess              — multipart 2 photos (side_photo + top_photo) → AI assess
 *   GET    /pets/:id/bcs/history             — list assessments (newest first)
 *   GET    /pets/:id/bcs/latest              — latest assessment hoặc null
 *   GET    /pets/:id/bcs/:assessId           — detail single assessment
 *   DELETE /pets/:id/bcs/:assessId           — xoá assessment
 *   POST   /pets/:id/bcs/:assessId/vet-review — vet override score (vet/admin only)
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import { updateRow } from "@shared/baserow.ts";
import { invalidatePetScore } from "../lib/pet-score.ts";
import {
  assessBCS,
  createAssessment,
  listAssessments,
  getAssessment,
  getLatest,
  deleteAssessment,
  type BcsApi,
} from "../lib/bcs-vision.ts";

const MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8MB per photo

export const bcsRoute = new Hono();
bcsRoute.use("*", requireAuth);

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

// ============================================================
// POST /pets/:id/bcs/assess — upload 2 photos + AI assess
// ============================================================
bcsRoute.post("/:id{[0-9]+}/bcs/assess", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  let pet: any;
  try {
    pet = await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400);
  }

  const sideFile = formData.get("side_photo");
  const topFile = formData.get("top_photo");

  if (!(sideFile instanceof File)) {
    return c.json({ error: { code: "MISSING_SIDE", message: "Thiếu ảnh nhìn nghiêng (side_photo)" } }, 400);
  }
  if (!(topFile instanceof File)) {
    return c.json({ error: { code: "MISSING_TOP", message: "Thiếu ảnh nhìn trên (top_photo)" } }, 400);
  }
  if (sideFile.size > MAX_PHOTO_SIZE || topFile.size > MAX_PHOTO_SIZE) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Mỗi ảnh tối đa 8MB" } }, 413);
  }
  const sideExt = imageExtFromMime(sideFile.type);
  const topExt = imageExtFromMime(topFile.type);
  if (!sideExt || !topExt) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ chấp nhận JPEG/PNG/WebP" } }, 415);
  }

  try {
    // Upload both photos to R2 in parallel
    const ts = Date.now();
    const sideKey = `bcs/${petId}/${ts}-side.${sideExt}`;
    const topKey = `bcs/${petId}/${ts}-top.${topExt}`;
    const [sideBuf, topBuf] = await Promise.all([
      sideFile.arrayBuffer(),
      topFile.arrayBuffer(),
    ]);
    const [sidePhotoUrl, topPhotoUrl] = await Promise.all([
      uploadObject(sideKey, new Uint8Array(sideBuf), sideFile.type),
      uploadObject(topKey, new Uint8Array(topBuf), topFile.type),
    ]);

    // Gather pet info for AI prompt
    const speciesRaw = flatVal<string>(pet.species);
    const species: string | null = speciesRaw || null;
    const breedRaw = pet.breed;
    const breed: string | null = breedRaw ? String(breedRaw) : null;
    const ageYears = pet.dob
      ? Math.floor((Date.now() - new Date(pet.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
      : null;

    // Call AI (mock fallback inside)
    const result = await assessBCS({
      petName: pet.name || "bé",
      breed,
      ageYears,
      species,
      sidePhotoUrl,
      topPhotoUrl,
    });

    // Persist assessment
    const assessment = await createAssessment({
      petId,
      sidePhotoKey: sideKey,
      sidePhotoUrl,
      topPhotoKey: topKey,
      topPhotoUrl,
      result,
    });

    // Session C: peek tier BEFORE invalidate so we can detect tier-up
    let tierBefore: any = null;
    try {
      const { peekTier } = await import("../lib/tier-up-detector.ts");
      tierBefore = await peekTier(petId);
    } catch (_) {}

    // Sync pet.body_condition_score for Pet Score consumption
    if (!result.is_mock) {
      updateRow("pets", petId, { body_condition_score: result.bcs_score })
        .catch((err) => console.error(`[bcs] sync pet.body_condition_score pet=${petId}:`, err));
      invalidatePetScore(petId);
    }

    // Hook: achievement check (bcs_first + ideal_weight if score 4-5)
    let newAchievements: any[] = [];
    let completedQuests: any[] = [];
    try {
      const { checkAndUnlockAchievements } = await import("../lib/achievements.ts");
      newAchievements = await checkAndUnlockAchievements({
        userId: session.sub,
        petId,
        trigger: "bcs_done",
        data: { score: result.bcs_score },
      });
    } catch (err) {
      console.error("[bcs/assess] achievement check failed:", err);
    }
    try {
      const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
      completedQuests = await trackQuestTrigger(session.sub, petId, "bcs_check");
    } catch (err) {
      console.error("[bcs/assess] quest track failed:", err);
    }

    // Session C: detect tier-up + emit community event
    let tierChange: any = null;
    if (tierBefore) {
      try {
        const { detectTierChange } = await import("../lib/tier-up-detector.ts");
        tierChange = await detectTierChange(petId, session.sub, tierBefore);
      } catch (_) {}
    }

    return c.json({
      assessment,
      new_achievements: newAchievements,
      completed_quests: completedQuests,
      pet_score: tierChange,
    }, 201);
  } catch (err: any) {
    console.error("[bcs/assess] error:", err);
    return c.json({ error: { code: "ASSESS_FAILED", message: "Đánh giá BCS thất bại" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/bcs/history
// ============================================================
bcsRoute.get("/:id{[0-9]+}/bcs/history", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const assessments = await listAssessments(petId);
    return c.json({ assessments, total: assessments.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[bcs/history] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load history" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/bcs/latest
// ============================================================
bcsRoute.get("/:id{[0-9]+}/bcs/latest", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const latest = await getLatest(petId);
    return c.json({ assessment: latest });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/bcs/:assessId
// ============================================================
bcsRoute.get("/:id{[0-9]+}/bcs/:assessId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const assessId = Number(c.req.param("assessId"));
  try {
    await getOwnedPet(petId, session.sub);
    const a = await getAssessment(assessId);
    if (!a) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy assessment" } }, 404);
    if (a.pet_id !== petId) {
      return c.json({ error: { code: "FORBIDDEN", message: "Assessment không thuộc bé này" } }, 403);
    }
    return c.json({ assessment: a });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// DELETE /pets/:id/bcs/:assessId
// ============================================================
bcsRoute.delete("/:id{[0-9]+}/bcs/:assessId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const assessId = Number(c.req.param("assessId"));
  try {
    await getOwnedPet(petId, session.sub);
    const a = await getAssessment(assessId);
    if (!a) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    if (a.pet_id !== petId) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
    }
    await deleteAssessment(assessId);
    invalidatePetScore(petId);
    return c.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xoá" } }, 500);
  }
});

// ============================================================
// POST /pets/:id/bcs/:assessId/vet-review — vet override
// ============================================================
bcsRoute.post("/:id{[0-9]+}/bcs/:assessId{[0-9]+}/vet-review", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const assessId = Number(c.req.param("assessId"));

  // Vet role check: session.role must include "vet" or "admin"
  const role = (session as any).role || "owner";
  if (role !== "vet" && role !== "admin") {
    return c.json({ error: { code: "VET_ONLY", message: "Chỉ vet/admin được phép" } }, 403);
  }

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const overrideScore = body.vet_override_score != null ? Number(body.vet_override_score) : null;
  const notes = typeof body.vet_notes === "string" ? body.vet_notes.slice(0, 1000) : null;

  if (overrideScore != null && (overrideScore < 1 || overrideScore > 9)) {
    return c.json({ error: { code: "BAD_SCORE", message: "Score phải 1-9" } }, 400);
  }

  try {
    const existing = await getAssessment(assessId);
    if (!existing) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    if (existing.pet_id !== petId) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không thuộc bé này" } }, 403);
    }

    await updateRow("bcs_assessments", assessId, {
      vet_reviewed_by: session.sub,
      vet_reviewed_at: new Date().toISOString(),
      vet_override_score: overrideScore,
      vet_notes: notes,
      needs_vet_review: false,
    });

    // If vet overrode, sync pet.body_condition_score with vet's score
    if (overrideScore != null) {
      updateRow("pets", petId, { body_condition_score: overrideScore })
        .catch((err) => console.error(`[bcs] vet override sync pet=${petId}:`, err));
      invalidatePetScore(petId);
    }

    const updated = await getAssessment(assessId);
    return c.json({ assessment: updated });
  } catch (err: any) {
    console.error("[bcs/vet-review] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi vet review" } }, 500);
  }
});
