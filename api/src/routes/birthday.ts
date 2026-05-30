/**
 * Birthday routes (M14.1).
 *
 * GET /api/v1/pets/:id/birthday — countdown + party suggestions + voucher
 * GET /api/v1/pets/:id/birthday-card.svg — auto-generated card image
 *
 * Mount: app.route("/api/v1/pets", birthdayRoute) — chia sẻ prefix với petsRoute.
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  getNextBirthday,
  getDaysUntilBirthday,
  isBirthdayWeek,
  getAgeTurning,
  getAgeLabel,
  generateVoucherCode,
  getVoucherWindow,
  formatLocalDate,
  PARTY_SUGGESTIONS,
} from "@shared/birthday-lib.ts";
import { getOrCreateEvent, ensureSlideshow, getPublicWall } from "../lib/birthday-events.ts";

export const birthdayRoute = new Hono();
birthdayRoute.use("*", requireAuth);

// ============================================================
// GET /pets/:id/birthday
// ============================================================
birthdayRoute.get("/:id{[0-9]+}/birthday", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = (await getOwnedPet(petId, session.sub)) as any;
    const today = new Date();

    if (!pet.dob) {
      return c.json({
        pet_id: petId,
        pet_name: pet.name,
        dob: null,
        message: "Pet chưa nhập ngày sinh. Vào /pets/:id để thêm.",
      });
    }

    const next = getNextBirthday(pet.dob, today);
    const days = getDaysUntilBirthday(pet.dob, today);
    const ageTurning = getAgeTurning(pet.dob, today);
    const ageLabel = getAgeLabel(pet.dob, today);
    const inWeek = isBirthdayWeek(pet.dob, today);
    const voucherWindow = getVoucherWindow(pet.dob, today);
    const birthdayYear = next ? next.getFullYear() : today.getFullYear();
    const voucherCode = generateVoucherCode(pet.name, birthdayYear);

    // Ensure event row exists for wall/wishes (only when birthday is within 30 days or today)
    if (days !== null && next && days <= 30) {
      getOrCreateEvent(pet.id, next.getFullYear(), formatLocalDate(next)).catch(() => {});
    }

    return c.json({
      pet_id: petId,
      pet_name: pet.name,
      dob: pet.dob,
      next_birthday: next ? formatLocalDate(next) : null,
      days_until: days,
      age_turning: ageTurning,
      is_birthday_week: inWeek,
      current_age_label: ageLabel,
      party_suggestions: PARTY_SUGGESTIONS,
      voucher_code: voucherCode,
      voucher_active_from: voucherWindow?.from || null,
      voucher_active_to: voucherWindow?.to || null,
      voucher_discount_pct: 15,
    });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[birthday/get] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load birthday" } }, 500);
  }
});

// ============================================================
// POST /pets/:id/birthday/slideshow
// Generate (or return cached) Gemini birthday narrative.
// Only succeeds on birthday day (days_until === 0).
// ============================================================
birthdayRoute.post("/:id{[0-9]+}/birthday/slideshow", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = (await getOwnedPet(petId, session.sub)) as any;
    if (!pet.dob) return c.json({ error: { code: "NO_DOB", message: "Pet chưa có ngày sinh" } }, 400);

    const days = getDaysUntilBirthday(pet.dob);
    const next = getNextBirthday(pet.dob);
    const ageTurning = getAgeTurning(pet.dob);

    if (days !== 0 || !next || ageTurning === null) {
      return c.json({ error: { code: "NOT_BIRTHDAY", message: "Chỉ tạo slideshow vào đúng ngày sinh nhật" } }, 400);
    }

    const species = typeof pet.species === "object" ? pet.species?.value : pet.species;
    const content = await ensureSlideshow(
      petId,
      next.getFullYear(),
      pet.name,
      ageTurning,
      pet.breed || null,
      species || null
    );
    return c.json({ content, cached: !!content });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[birthday/slideshow] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo slideshow" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/birthday/wall  — redirect to public wall
// ============================================================
birthdayRoute.get("/:id{[0-9]+}/birthday/wall-data", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const wall = await getPublicWall(petId);
    return c.json(wall);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[birthday/wall-data] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load wall" } }, 500);
  }
});
