/**
 * Water Intake routes (M25).
 * Mount: app.route("/api/v1/pets", waterRoute)
 *
 *   POST   /:id/water       body: {log_date, amount_ml, method?, weather_celsius?, notes?}
 *                          → auto-calc expected range from pet.weight_kg
 *   GET    /:id/water?days=30
 *   GET    /:id/water/latest
 *   GET    /:id/water/expected  — preview expected range without logging
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { logWater, listWater, getLatestWater, calculateExpectedRange } from "../lib/water-intake.ts";

export const waterRoute = new Hono();
waterRoute.use("*", requireAuth);

function petWeight(pet: any): number {
  const w = pet.weight_kg || pet.target_weight_kg;
  return Number(w) || 0;
}

waterRoute.get("/:id{[0-9]+}/water", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const days = Math.min(90, Math.max(1, Number(c.req.query("days")) || 30));
  try {
    await getOwnedPet(petId, session.sub);
    const list = await listWater(petId, days);
    return c.json({ logs: list, total: list.length, days });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

waterRoute.get("/:id{[0-9]+}/water/latest", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    return c.json({ latest: await getLatestWater(petId) });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

waterRoute.get("/:id{[0-9]+}/water/expected", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const weather = c.req.query("weather") ? Number(c.req.query("weather")) : null;
  try {
    const pet = await getOwnedPet(petId, session.sub);
    const wt = petWeight(pet);
    const range = calculateExpectedRange(wt, weather);
    return c.json({ weight_kg: wt, weather_celsius: weather, expected_min_ml: range.min, expected_max_ml: range.max });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

waterRoute.post("/:id{[0-9]+}/water", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const log_date = String(body.log_date || "").slice(0, 10);
  const amount_ml = Number(body.amount_ml) || 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
    return c.json({ error: { code: "BAD_DATE", message: "log_date phải YYYY-MM-DD" } }, 400);
  }
  if (amount_ml <= 0 || amount_ml > 10000) {
    return c.json({ error: { code: "BAD_AMOUNT", message: "amount_ml phải 1-10000" } }, 400);
  }

  try {
    const pet = await getOwnedPet(petId, session.sub);
    const wt = petWeight(pet);
    if (!wt) {
      return c.json({ error: { code: "NO_WEIGHT", message: "Cần thông tin cân nặng để tính expected. Cập nhật weight_kg ở hồ sơ bé." } }, 400);
    }
    const logged = await logWater({
      petId,
      log_date,
      amount_ml,
      method: body.method === "smart_bowl" ? "smart_bowl" : "manual",
      weather_celsius: body.weather_celsius != null ? Number(body.weather_celsius) : null,
      weight_kg: wt,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 200) : undefined,
    });

    // Quest hook: real water log
    let completedQuests: any[] = [];
    try {
      const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
      completedQuests = await trackQuestTrigger(session.sub, petId, "check_water");
    } catch (err) {
      console.error("[water/log] quest track failed:", err);
    }

    return c.json({ ...logged, completed_quests: completedQuests }, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    console.error("[water/log] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi log" } }, 500);
  }
});
