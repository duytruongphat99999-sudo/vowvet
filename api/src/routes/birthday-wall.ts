/**
 * Public Birthday Wall routes (M11).
 * No auth required.
 *
 * GET  /api/v1/public/birthday-wall/:petId   — pet info + countdown + wishes
 * POST /api/v1/public/birthday-wall/:petId/wish — submit a wish
 *
 * Mount: app.route("/api/v1/public", birthdayWallRoute)
 */
import { Hono } from "hono";
import { ipRateLimit } from "../lib/rate-limit.ts";
import { getRow, listRows } from "@shared/baserow.ts";
import { ownerIds } from "../lib/pets.ts";
import { getDaysUntilBirthday, getAgeTurning, getAgeLabel, getNextBirthday, formatLocalDate } from "@shared/birthday-lib.ts";
import { getPublicWall, addWish, getOrCreateEvent } from "../lib/birthday-events.ts";

export const birthdayWallRoute = new Hono();

birthdayWallRoute.use("*", ipRateLimit("birthday-wall", 60, 60));

const WISH_EMOJIS = ["🎂", "🎉", "🐾", "❤️", "🎊", "🌟", "🥰", "🐶", "🐱", "🦴", "🐟", "🎁"];

// ============================================================
// GET /birthday-wall/:petId
// ============================================================
birthdayWallRoute.get("/birthday-wall/:petId{[0-9]+}", async (c) => {
  const petId = Number(c.req.param("petId"));

  try {
    const pet = await getRow<any>("pets", petId);

    // N2: chặn enumerate PII — chỉ chủ pet (owner-only) xem được wall. Route public nên parse cookie thủ công.
    let uid: number | null = null;
    try {
      const { verifySession } = await import("@shared/jwt.ts");
      const { SESSION_COOKIE } = await import("@shared/auth.ts");
      const cookieHeader = c.req.header("cookie") || "";
      const m = cookieHeader.split(/;\s*/).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
      if (m) {
        const token = m.slice(SESSION_COOKIE.length + 1);
        const s = verifySession(token);
        if (s?.sub) uid = Number(s.sub);
      }
    } catch { /* không có session hợp lệ → coi như guest */ }
    if (uid === null || !ownerIds(pet).includes(uid)) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy thú cưng" } }, 404);
    }

    const species = typeof pet.species === "object" ? pet.species?.value : pet.species;
    const days = pet.dob ? getDaysUntilBirthday(pet.dob) : null;
    const ageTurning = pet.dob ? getAgeTurning(pet.dob) : null;
    const ageLabel = pet.dob ? getAgeLabel(pet.dob) : null;
    const next = pet.dob ? getNextBirthday(pet.dob) : null;

    // Ensure event row exists (idempotent) so wishes can be submitted
    if (days !== null && next && days <= 30) {
      getOrCreateEvent(petId, next.getFullYear(), formatLocalDate(next)).catch(() => {});
    }

    const wall = await getPublicWall(petId);

    return c.json({
      pet: {
        id: petId,
        name: pet.name,
        species,
        breed: pet.breed || null,
        photo_url: pet.photo_url || null,
        dob: pet.dob || null,
      },
      birthday: {
        days_until: days,
        age_turning: ageTurning,
        age_label: ageLabel,
        next_birthday: next ? formatLocalDate(next) : null,
      },
      wishes: wall.wishes,
      event_id: wall.event?.id ?? null,
      wall_enabled: wall.event?.wall_enabled ?? true,
      current_year: wall.current_year,
      allowed_emojis: WISH_EMOJIS,
    });
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy thú cưng" } }, 404);
    }
    console.error("[birthday-wall/get] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load wall" } }, 500);
  }
});

// ============================================================
// POST /birthday-wall/:petId/wish
// ============================================================
birthdayWallRoute.post("/birthday-wall/:petId{[0-9]+}/wish", async (c) => {
  const petId = Number(c.req.param("petId"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải là JSON" } }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 50);
  const message = String(body.message || "").trim().slice(0, 200);
  const emoji = WISH_EMOJIS.includes(body.emoji) ? body.emoji : "🎂";

  if (!name || name.length < 2) {
    return c.json({ error: { code: "NAME_REQUIRED", message: "Tên phải có ít nhất 2 ký tự" } }, 400);
  }
  if (!message || message.length < 3) {
    return c.json({ error: { code: "MESSAGE_REQUIRED", message: "Lời chúc phải có ít nhất 3 ký tự" } }, 400);
  }

  try {
    // Verify pet exists
    await getRow("pets", petId);

    const year = new Date().getFullYear();
    const { event, added } = await addWish(petId, year, { name, message, emoji });

    if (!added) {
      return c.json({ error: { code: "ALREADY_WISHED", message: "Bạn đã gửi lời chúc rồi nhé!" } }, 409);
    }

    return c.json({ ok: true, wishes_count: event?.wishes_count ?? 1 }, 201);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy thú cưng" } }, 404);
    }
    console.error("[birthday-wall/wish] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi gửi lời chúc" } }, 500);
  }
});
