/**
 * Pet Mood routes (Session B).
 *
 * Mount: app.route("/api/v1/mood", moodRoute)
 *
 *   GET /mood/pets/:petId  — current mood (state + emoji + label + message + signals)
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { calculatePetMood } from "../lib/pet-mood.ts";

export const moodRoute = new Hono();
moodRoute.use("*", requireAuth);

moodRoute.get("/pets/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const mood = await calculatePetMood(petId, session.sub);
    return c.json({ mood });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
