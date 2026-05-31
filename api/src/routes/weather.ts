/**
 * Weather endpoints (M5 multi-city):
 *   GET /api/v1/weather/current?city=ho_chi_minh
 *   GET /api/v1/weather/forecast?city=ho_chi_minh&days=7
 *
 * Backward compat: GET /api/v1/weather?city=... → forward sang /current.
 * Auth required (cookie session).
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getWeather, getForecast } from "../lib/weather.ts";
import { CITY_SLUGS } from "@shared/cities.ts";

export const weatherRoute = new Hono();
weatherRoute.use("*", requireAuth);

/** M4 backward compat: /api/v1/weather?city=... */
weatherRoute.get("/", async (c) => {
  const city = (c.req.query("city") || "ho_chi_minh").toLowerCase();
  if (!CITY_SLUGS.includes(city as any)) {
    return c.json(
      {
        error: { code: "BAD_CITY", message: `City không hợp lệ. Chấp nhận: ${CITY_SLUGS.join(", ")}` },
      },
      400
    );
  }
  try {
    return c.json(await getWeather(city));
  } catch (err: any) {
    console.error("[weather] error:", err);
    return c.json({ error: { code: "WEATHER_FAIL", message: err.message } }, 500);
  }
});

/** M5: GET /weather/current?city=X */
weatherRoute.get("/current", async (c) => {
  const city = (c.req.query("city") || "ho_chi_minh").toLowerCase();
  if (!CITY_SLUGS.includes(city as any)) {
    return c.json(
      {
        error: { code: "BAD_CITY", message: `City không hợp lệ. Chấp nhận: ${CITY_SLUGS.join(", ")}` },
      },
      400
    );
  }
  try {
    return c.json(await getWeather(city));
  } catch (err: any) {
    console.error("[weather/current] error:", err);
    return c.json({ error: { code: "WEATHER_FAIL", message: err.message } }, 500);
  }
});

/** M5: GET /weather/forecast?city=X&days=7 */
weatherRoute.get("/forecast", async (c) => {
  const city = (c.req.query("city") || "ho_chi_minh").toLowerCase();
  const daysRaw = Number(c.req.query("days") || "7");
  const days = Math.max(1, Math.min(7, Number.isNaN(daysRaw) ? 7 : daysRaw));

  if (!CITY_SLUGS.includes(city as any)) {
    return c.json(
      {
        error: { code: "BAD_CITY", message: `City không hợp lệ. Chấp nhận: ${CITY_SLUGS.join(", ")}` },
      },
      400
    );
  }

  try {
    const forecast = await getForecast(city, days);
    return c.json(forecast);
  } catch (err: any) {
    console.error("[weather/forecast] error:", err);
    return c.json({ error: { code: "FORECAST_FAIL", message: err.message } }, 500);
  }
});
