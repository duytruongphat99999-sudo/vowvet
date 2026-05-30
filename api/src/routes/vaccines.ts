/**
 * Vaccine calendar routes (M6).
 *
 * Mount points:
 *   /api/v1/vaccine-schedules           — public template list (no auth)
 *   /api/v1/pets/:id/vaccine-calendar   — per-pet calendar (auth + ownership)
 *   /api/v1/pets/:id/vaccines/:vid/mark-completed
 *   /api/v1/pets/:id/vaccines/:vid/skip
 *   /api/v1/pets/:id/vaccines/custom
 *   /api/v1/pets/:id/vaccines/upcoming?days=30
 *   /api/v1/users/me/vaccine-summary
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { listUserPets, findUserByPhone } from "../lib/users.ts";
import {
  loadTemplates,
  buildCalendar,
  markVaccineCompleted,
  skipVaccine,
  addCustomVaccine,
  listPetVaccines,
  buildUserVaccineSummary,
  toExistingVaccine,
  type VaccineCalendarItem,
} from "../lib/vaccines.ts";
import { daysToDue, type PetForSchedule } from "@shared/vaccine-scheduler.ts";
import { vaccineCodeEnToVi } from "@shared/enum-mappers.ts";
// Phase 2A — vaccine photo upload deps
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import { updateRow, getRow, deleteRow } from "@shared/baserow.ts";
import { invalidatePetScore } from "../lib/pet-score.ts";
import type { BaserowVaccine } from "../lib/vaccines.ts";

// ============================================================
// /vaccine-schedules — public template list
// ============================================================
export const vaccineSchedulesRoute = new Hono();

vaccineSchedulesRoute.get("/", async (c) => {
  const species = c.req.query("species");
  const templates = await loadTemplates();
  const filtered = species
    ? templates.filter((t) => t.species === species.toLowerCase())
    : templates;
  return c.json({
    templates: filtered.map((t) => ({
      ...t,
      vaccine_name_vn: vaccineCodeEnToVi(t.vaccine_code) || t.vaccine_name,
    })),
  });
});

// ============================================================
// Pet vaccine routes — auth required (mounted via pets.ts)
// ============================================================
export const petVaccinesRoute = new Hono();
petVaccinesRoute.use("*", requireAuth);

// Helper: convert pet → PetForSchedule
function toPetForSchedule(pet: any): PetForSchedule {
  const sp = typeof pet.species === "object" ? pet.species?.value : pet.species;
  return {
    id: pet.id,
    species: sp || "other",
    dob: pet.dob || null,
    age_estimation_method:
      typeof pet.age_estimation_method === "object"
        ? pet.age_estimation_method?.value
        : pet.age_estimation_method || null,
    travels_with_owner: pet.travels_with_owner === true ? true : pet.travels_with_owner === false ? false : null,
    bathroom_location:
      typeof pet.bathroom_location === "object"
        ? pet.bathroom_location?.value
        : pet.bathroom_location || null,
  };
}

// Enrich item với VN labels for frontend
function enrichItem(item: VaccineCalendarItem) {
  return {
    ...item,
    vaccine_name_vn: vaccineCodeEnToVi(item.vaccine_code) || item.vaccine_name,
  };
}

// ===== GET /pets/:id/vaccine-calendar =====
petVaccinesRoute.get("/:id{[0-9]+}/vaccine-calendar", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    const calendar = await buildCalendar(toPetForSchedule(pet));
    return c.json({ pet_id: petId, calendar: calendar.map(enrichItem) });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[vaccine-calendar] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi sinh lịch" } }, 500);
  }
});

// ===== GET /pets/:id/vaccines/upcoming?days=30 =====
petVaccinesRoute.get("/:id{[0-9]+}/vaccines/upcoming", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const days = Math.min(365, Math.max(1, Number(c.req.query("days") || "30")));

  try {
    const pet = await getOwnedPet(petId, session.sub);
    const calendar = await buildCalendar(toPetForSchedule(pet));
    const upcoming = calendar.filter((it) => {
      if (it.status !== "scheduled" && it.status !== "overdue") return false;
      if (!it.due_date) return false;
      const d = daysToDue(it.due_date);
      return d <= days;
    });
    return c.json({ pet_id: petId, days, vaccines: upcoming.map(enrichItem) });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ===== POST /pets/:id/vaccines/:vid/mark-completed =====
const markCompletedSchema = z.object({
  administered_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  brand: z.string().trim().max(100).nullable().optional(),
  clinic_name: z.string().trim().max(200).nullable().optional(),
  batch_number: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

petVaccinesRoute.post(
  "/:id{[0-9]+}/vaccines/:vid{[0-9]+}/mark-completed",
  zValidator("json", markCompletedSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const vaccineId = Number(c.req.param("vid"));
    const data = c.req.valid("json");
    try {
      const pet = await getOwnedPet(petId, session.sub);
      // Verify vaccine row belongs to pet
      const vacs = await listPetVaccines(petId);
      const target = vacs.find((v) => v.id === vaccineId);
      if (!target) {
        return c.json({ error: { code: "NOT_FOUND", message: "Vaccine không tồn tại" } }, 404);
      }
      const updated = await markVaccineCompleted(petId, vaccineId, {
        administered_date: data.administered_date,
        brand: data.brand,
        clinic_name: data.clinic_name,
        batch_number: data.batch_number,
        notes: data.notes,
      });
      // Session C: peek tier BEFORE re-gen + invalidate
      let tierBefore: any = null;
      try {
        const { peekTier } = await import("../lib/tier-up-detector.ts");
        tierBefore = await peekTier(petId);
      } catch (_) {}

      // Re-generate schedule để tạo mũi tiếp / booster
      const { generateAndPersistSchedule } = await import("../lib/vaccines.ts");
      await generateAndPersistSchedule(toPetForSchedule(pet));

      // Hook: achievement check (vaccine_count + vaccine_master)
      let newAchievements: any[] = [];
      try {
        const { checkAndUnlockAchievements } = await import("../lib/achievements.ts");
        newAchievements = await checkAndUnlockAchievements({
          userId: session.sub, petId, trigger: "vaccine_added",
        });
      } catch (err) {
        console.error("[mark-completed] achievement check failed:", err);
      }

      // Session C: detect tier-up
      let tierChange: any = null;
      if (tierBefore) {
        try {
          const { detectTierChange } = await import("../lib/tier-up-detector.ts");
          tierChange = await detectTierChange(petId, session.sub, tierBefore);
        } catch (_) {}
      }

      return c.json({ success: true, vaccine: updated, new_achievements: newAchievements, pet_score: tierChange });
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status);
      }
      console.error("[mark-completed] error:", err);
      return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
    }
  }
);

// ===== POST /pets/:id/vaccines/:vid/skip =====
const skipSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

petVaccinesRoute.post(
  "/:id{[0-9]+}/vaccines/:vid{[0-9]+}/skip",
  zValidator("json", skipSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const vaccineId = Number(c.req.param("vid"));
    const { reason } = c.req.valid("json");
    try {
      await getOwnedPet(petId, session.sub);
      const vacs = await listPetVaccines(petId);
      const target = vacs.find((v) => v.id === vaccineId);
      if (!target) {
        return c.json({ error: { code: "NOT_FOUND", message: "Vaccine không tồn tại" } }, 404);
      }
      const updated = await skipVaccine(petId, vaccineId, reason);
      return c.json({ success: true, vaccine: updated });
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status);
      }
      return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
    }
  }
);

// ===== POST /pets/:id/vaccines/custom — add custom vaccine =====
// Phase 2A: now accepts proof_photo_url + invoice_photo_url (from R2 upload
// endpoint below) and awards Pet Score bonus (+10 base, +30 with photo proof).
const customVaccineSchema = z.object({
  vaccine_name: z.string().trim().min(1).max(200),
  administered_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  brand: z.string().trim().max(100).nullable().optional(),
  clinic_name: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  proof_photo_url: z.string().url().max(500).nullable().optional(),
  invoice_photo_url: z.string().url().max(500).nullable().optional(),
});

petVaccinesRoute.post(
  "/:id{[0-9]+}/vaccines/custom",
  zValidator("json", customVaccineSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    try {
      await getOwnedPet(petId, session.sub);
      const created = await addCustomVaccine(petId, data);

      // Pet Score bonus: +10 base, +30 when at least one photo proof attached.
      const hasPhoto = Boolean((data.proof_photo_url || "").trim() || (data.invoice_photo_url || "").trim());
      const BONUS = hasPhoto ? 30 : 10;
      let petScoreBonus = 0;
      try {
        const { findUserById } = await import("../lib/users.ts");
        const user: any = await findUserById(session.sub);
        if (user) {
          const newBonus = (Number(user.pet_score_bonus) || 0) + BONUS;
          await updateRow("users", session.sub, { pet_score_bonus: newBonus });
          invalidatePetScore(petId);
          petScoreBonus = BONUS;
        }
      } catch (err) {
        console.error("[vaccines/custom] pet score bonus failed:", err);
      }

      return c.json({ success: true, vaccine: created, pet_score_bonus: petScoreBonus, has_photo: hasPhoto });
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status);
      }
      console.error("[vaccines/custom] error:", err);
      return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
    }
  }
);

// ===== POST /pets/:id/vaccines/photo-upload =====
// Phase 2A: upload-only endpoint for vaccine paper booklet / invoice photos.
// Returns the R2 URL — frontend includes it in the next /vaccines/custom POST.
// Does NOT write to pet_photos (those are pet identity photos — different domain).
// Does NOT write to vaccines table — that happens via /vaccines/custom.
const MAX_VACCINE_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

petVaccinesRoute.post("/:id{[0-9]+}/vaccines/photo-upload", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400);
  }
  const photo = formData.get("photo");
  const kindRaw = formData.get("kind");

  if (!(photo instanceof File)) {
    return c.json({ error: { code: "MISSING_PHOTO", message: "Thiếu file ảnh" } }, 400);
  }
  const kind = typeof kindRaw === "string" && (kindRaw === "proof" || kindRaw === "invoice") ? kindRaw : null;
  if (!kind) {
    return c.json({ error: { code: "BAD_KIND", message: "kind phải là 'proof' hoặc 'invoice'" } }, 400);
  }
  if (photo.size > MAX_VACCINE_PHOTO_SIZE) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Ảnh quá 5MB" } }, 413);
  }
  const ext = imageExtFromMime(photo.type);
  if (!ext) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ JPEG/PNG/WebP" } }, 415);
  }

  try {
    const key = `pets/${session.sub}/${petId}/vaccines/${kind}-${Date.now()}.${ext}`;
    const buffer = new Uint8Array(await photo.arrayBuffer());
    const url = await uploadObject(key, buffer, photo.type);
    return c.json({ success: true, kind, url });
  } catch (err: any) {
    console.error("[vaccines/photo-upload] R2 error:", err);
    return c.json({ error: { code: "R2_FAIL", message: err?.message || "Upload thất bại" } }, 500);
  }
});

// =========================================================
// Phase 2C — PATCH + DELETE for vaccine records.
//
// Ownership model: vaccines table has NO user_id column (only pet_id link_row),
// so we cannot filter "by current user" directly. The robust check is:
//   1. getOwnedPet(petId, session.sub) — confirms user owns the URL pet
//   2. Read the vaccine row by id
//   3. Verify row.pet_id includes this petId — prevents PATCH/DELETE on
//      another user's vaccine even if the recordId is guessed (defense in depth)
//
// Matches the bcs.ts:245 pattern exactly.
// =========================================================

function vaccineRowBelongsToPet(row: BaserowVaccine, petId: number): boolean {
  if (!row || !row.pet_id) return false;
  // pet_id is link_row → array of { id, value }
  return row.pet_id.some((link) => Number(link.id) === petId);
}

const patchVaccineSchema = z.object({
  // vaccine_name is intentionally NOT editable here — for custom rows the name
  // lives inside the `notes` field as `[Custom] {name}` prefix, and for
  // templated rows the name comes from vaccine_code. Rewriting either is risky
  // for the slim scope; user can delete + re-create to rename.
  administered_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  clinic_name: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  proof_photo_url: z.string().url().max(500).nullable().optional(),
  invoice_photo_url: z.string().url().max(500).nullable().optional(),
});

petVaccinesRoute.patch(
  "/:id{[0-9]+}/vaccines/:recordId{[0-9]+}",
  zValidator("json", patchVaccineSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const recordId = Number(c.req.param("recordId"));
    const data = c.req.valid("json");
    try {
      await getOwnedPet(petId, session.sub);
      const row = await getRow<BaserowVaccine>("vaccines", recordId).catch(() => null);
      if (!row) {
        return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy vaccine record" } }, 404);
      }
      if (!vaccineRowBelongsToPet(row, petId)) {
        return c.json({ error: { code: "FORBIDDEN", message: "Vaccine không thuộc bé này" } }, 403);
      }

      // Build update map — only fields actually present in the request.
      const updates: Record<string, unknown> = {};
      if (data.administered_date !== undefined)  updates.administered_date  = data.administered_date;
      if (data.brand !== undefined)              updates.brand              = data.brand;
      if (data.clinic_name !== undefined)        updates.clinic_name        = data.clinic_name;
      if (data.notes !== undefined) {
        // For [Custom] records, preserve the `[Custom] {name}` prefix that
        // addCustomVaccine() set on create. We only rewrite the free-form
        // suffix after " — ".
        const existingNotes = typeof row.notes === "string" ? row.notes : "";
        const customMatch = existingNotes.match(/^\[Custom\]\s+(.+?)(?:\s+—\s+(.*))?$/);
        if (customMatch) {
          const name = customMatch[1] || "Custom";
          updates.notes = data.notes ? `[Custom] ${name} — ${data.notes}` : `[Custom] ${name}`;
        } else {
          updates.notes = data.notes;
        }
      }
      if (data.proof_photo_url !== undefined)    updates.proof_photo_url    = data.proof_photo_url;
      if (data.invoice_photo_url !== undefined)  updates.invoice_photo_url  = data.invoice_photo_url;

      if (Object.keys(updates).length === 0) {
        return c.json({ error: { code: "NO_UPDATES", message: "Không có field nào để cập nhật" } }, 400);
      }

      const updated = await updateRow<BaserowVaccine>("vaccines", recordId, updates);
      return c.json({ success: true, vaccine: updated });
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status);
      }
      console.error("[vaccines/PATCH] error:", err);
      return c.json({ error: { code: "INTERNAL", message: "Lỗi cập nhật" } }, 500);
    }
  }
);

petVaccinesRoute.delete("/:id{[0-9]+}/vaccines/:recordId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const recordId = Number(c.req.param("recordId"));
  try {
    await getOwnedPet(petId, session.sub);
    const row = await getRow<BaserowVaccine>("vaccines", recordId).catch(() => null);
    if (!row) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy vaccine record" } }, 404);
    }
    if (!vaccineRowBelongsToPet(row, petId)) {
      return c.json({ error: { code: "FORBIDDEN", message: "Vaccine không thuộc bé này" } }, 403);
    }
    await deleteRow("vaccines", recordId);
    // NOTE: Do NOT refund Pet Score bonus — would allow log/delete farming.
    // NOTE: R2 photos (proof_photo_url / invoice_photo_url) are NOT explicitly
    // deleted here — R2 lifecycle policy reaps orphans. Keeping them around
    // briefly is harmless and lets undo flows work later if we add them.
    return c.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[vaccines/DELETE] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xoá" } }, 500);
  }
});

// ===== GET /users/me/vaccine-summary =====
export const userVaccineSummaryRoute = new Hono();
userVaccineSummaryRoute.use("*", requireAuth);

userVaccineSummaryRoute.get("/me/vaccine-summary", async (c) => {
  const session = c.get("user");
  try {
    const summary = await buildUserVaccineSummary(session.sub, (uid) => listUserPets(uid));
    return c.json(summary);
  } catch (err) {
    console.error("[vaccine-summary] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
