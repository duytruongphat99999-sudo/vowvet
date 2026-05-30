/**
 * Scheduler jobs cho Climate Sentinel (M5).
 *
 * Job 1: Daily 7AM — evaluate forecast + send push cho mỗi pet sensitive
 * Job 2: Hourly severe weather watch — check current weather, push nếu critical
 * Job 3: Sunday 3AM — cleanup old alerts/logs (> 30 / 90 ngày)
 *
 * Export functions có thể run riêng để test (scripts/run-scheduler-now.ts).
 */
import { listRows, deleteRow } from "@shared/baserow.ts";
import { CITIES, type CitySlug, DEFAULT_CITY, isValidCitySlug } from "@shared/cities.ts";
import {
  evaluateTodayAlerts,
  type PetForAlertInput,
  type ForecastDayInput,
} from "@shared/alert-rules.ts";
import { calculateSensitivity, type SensitivityResult } from "@shared/climate-sensitivity.ts";
import {
  type AlertType,
  SEVERITY_RANK,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@shared/zod-schemas/m5.ts";
import { getForecast, getWeather } from "./weather.ts";
import { sendPush } from "./web-push.ts";
import { createAlertIfNew, markPushSent } from "./alerts.ts";
// Phase 4D: invalidate care plan when severe weather alert fires so dashboard
// regenerates with fresh weather context on next view.
import { invalidate as invalidateCarePlanV2 } from "./care-plan-cache.ts";

interface UserRow {
  id: number;
  phone?: string;
  name?: string | null;
  city?: string | { value: string } | null;
  push_subscription?: string | null;
  notification_preferences?: string | null;
}

interface PetRow {
  id: number;
  name: string;
  species?: string | { value: string } | null;
  breed?: string | null;
  dob?: string | null;
  weight_kg?: number | string | null;
  fears?: Array<{ value: string } | string> | null;
  separation_anxiety?: number | string | null;
  user_id?: Array<{ id: number; value: string }>;
}

function extractCity(u: UserRow): CitySlug {
  const v = typeof u.city === "object" ? u.city?.value : u.city;
  return isValidCitySlug(v as string) ? (v as CitySlug) : DEFAULT_CITY;
}

function extractSpecies(p: PetRow): string {
  const v = typeof p.species === "object" ? p.species?.value : p.species;
  return v || "other";
}

function extractFears(p: PetRow): string[] {
  if (!Array.isArray(p.fears)) return [];
  return p.fears.map((f: any) => (typeof f === "object" ? f.value : f));
}

function parsePrefs(raw: string | null | undefined): NotificationPreferences {
  if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/** Check user preference cho từng alert type. */
function alertTypeAllowed(type: AlertType, prefs: NotificationPreferences): boolean {
  switch (type) {
    case "heat_warning":
    case "sun_warning":
      return prefs.heat_warning;
    case "aqi_warning":
      return prefs.aqi_warning;
    case "storm_warning":
      return prefs.storm_warning;
    case "cold_warning":
      return prefs.heat_warning; // cold dùng chung toggle heat (broad weather)
  }
}

/** Load all users from Baserow. Baserow size limit = 200. Phase 0 expect < 200 users total. */
async function loadAllUsers(): Promise<UserRow[]> {
  const res = await listRows<UserRow>("users", { size: 200 });
  return res.results;
}

/** Load pets của user qua link_row filter. */
async function loadPetsForUser(userId: number): Promise<PetRow[]> {
  const res = await listRows<PetRow>("pets", {
    filter: { user_id__link_row_has: String(userId) },
    size: 100,
  });
  return res.results;
}

// ============================================================
// JOB 1: Daily 7AM forecast evaluation
// ============================================================
export interface JobReport {
  users_processed: number;
  pets_processed: number;
  alerts_created: number;
  push_sent: number;
  push_skipped: number;
  errors: number;
  duration_ms: number;
}

export async function runDailyForecastJob(): Promise<JobReport> {
  const t0 = Date.now();
  const report: JobReport = {
    users_processed: 0,
    pets_processed: 0,
    alerts_created: 0,
    push_sent: 0,
    push_skipped: 0,
    errors: 0,
    duration_ms: 0,
  };

  console.log("[scheduler] runDailyForecastJob start");

  let users: UserRow[];
  try {
    users = await loadAllUsers();
  } catch (err) {
    console.error("[scheduler] loadAllUsers failed:", err);
    report.errors++;
    report.duration_ms = Date.now() - t0;
    return report;
  }

  // Group users by city để fetch forecast once per city
  const forecastByCity = new Map<CitySlug, ForecastDayInput[]>();

  for (const user of users) {
    report.users_processed++;
    try {
      const city = extractCity(user);

      // Fetch forecast if not cached locally per job
      if (!forecastByCity.has(city)) {
        try {
          const f = await getForecast(city, 7);
          forecastByCity.set(city, f.days);
        } catch (err) {
          console.error(`[scheduler] forecast fail city=${city}:`, err);
          forecastByCity.set(city, []);
        }
      }
      const days = forecastByCity.get(city) || [];
      if (days.length === 0) continue;

      const pets = await loadPetsForUser(user.id);
      const prefs = parsePrefs(user.notification_preferences);

      for (const pet of pets) {
        report.pets_processed++;
        const petInput: PetForAlertInput = {
          id: pet.id,
          name: pet.name,
          species: extractSpecies(pet),
          breed: pet.breed,
          dob: pet.dob,
          fears: extractFears(pet),
        };
        const sensitivity = calculateSensitivity({
          species: extractSpecies(pet),
          breed: pet.breed,
          dob: pet.dob,
          weight_kg: pet.weight_kg,
          fears: extractFears(pet),
          separation_anxiety: pet.separation_anxiety,
        });

        const alerts = evaluateTodayAlerts(petInput, days, sensitivity, city);

        for (const alert of alerts) {
          // Honor user preferences
          if (!alertTypeAllowed(alert.alert_type, prefs)) continue;

          // Create alert (dedup 6h check inside)
          const created = await createAlertIfNew(pet.id, user.id, alert);
          if (!created) continue;
          report.alerts_created++;

          // Phase 4D: when a warning+ alert fires, invalidate the care plan cache
          // so the dashboard's next render regens with the new weather context.
          // Safe to call even if no cached plan exists (no-op).
          if (SEVERITY_RANK[alert.severity] >= SEVERITY_RANK["warning"]) {
            try {
              invalidateCarePlanV2(pet.id);
            } catch (err) {
              console.warn(`[scheduler] invalidateCarePlanV2 pet=${pet.id} failed:`, err);
            }
          }

          // Push if severity >= warning AND user has subscription
          if (SEVERITY_RANK[alert.severity] >= SEVERITY_RANK["warning"] && user.push_subscription) {
            const result = await sendPush(
              user.id,
              user.push_subscription,
              {
                title: alert.title,
                body: alert.message.slice(0, 200),
                data: { url: `/alerts`, alert_id: created.id },
              },
              { type: "alert_push" }
            );
            if (result.ok) {
              report.push_sent++;
              await markPushSent(created.id);
            } else {
              report.push_skipped++;
            }
          }
        }
      }
    } catch (err) {
      console.error(`[scheduler] user ${user.id} failed:`, err);
      report.errors++;
    }
  }

  report.duration_ms = Date.now() - t0;
  console.log("[scheduler] runDailyForecastJob done:", report);
  return report;
}

// ============================================================
// JOB 2: Hourly severe weather watch
// ============================================================
export async function runHourlySevereWatchJob(): Promise<JobReport> {
  const t0 = Date.now();
  const report: JobReport = {
    users_processed: 0,
    pets_processed: 0,
    alerts_created: 0,
    push_sent: 0,
    push_skipped: 0,
    errors: 0,
    duration_ms: 0,
  };

  console.log("[scheduler] runHourlySevereWatchJob start");

  // Fetch current weather all 4 cities
  const currentByCity = new Map<CitySlug, ForecastDayInput | null>();
  for (const slug of Object.keys(CITIES) as CitySlug[]) {
    try {
      const w = await getWeather(slug);
      const today = new Date().toISOString().slice(0, 10);
      currentByCity.set(slug, {
        date: today,
        temp_min: w.temp,
        temp_max: w.temp,
        feels_like_max: w.feels_like,
        humidity: w.humidity,
        aqi: w.aqi,
        weather_id: 800, // current weather endpoint không trả weather_id chi tiết → default sunny
        description_vn: "",
      });
    } catch (err) {
      console.error(`[scheduler] current weather ${slug} fail:`, err);
      currentByCity.set(slug, null);
    }
  }

  // Check if any city has severe condition
  const severeCities: CitySlug[] = [];
  for (const [city, snap] of currentByCity) {
    if (!snap) continue;
    if (snap.feels_like_max > 38 || snap.aqi >= 5) severeCities.push(city);
  }

  if (severeCities.length === 0) {
    report.duration_ms = Date.now() - t0;
    console.log("[scheduler] no severe weather, skip");
    return report;
  }

  // Process users trong severe cities với pets sensitive
  let users: UserRow[];
  try {
    users = await loadAllUsers();
  } catch (err) {
    console.error("[scheduler] loadAllUsers failed:", err);
    report.errors++;
    report.duration_ms = Date.now() - t0;
    return report;
  }

  for (const user of users) {
    report.users_processed++;
    const city = extractCity(user);
    if (!severeCities.includes(city)) continue;
    const snap = currentByCity.get(city);
    if (!snap) continue;

    try {
      const pets = await loadPetsForUser(user.id);
      const prefs = parsePrefs(user.notification_preferences);

      for (const pet of pets) {
        report.pets_processed++;
        const sensitivity = calculateSensitivity({
          species: extractSpecies(pet),
          breed: pet.breed,
          dob: pet.dob,
          weight_kg: pet.weight_kg,
          fears: extractFears(pet),
          separation_anxiety: pet.separation_anxiety,
        });
        if (sensitivity.score < 60) continue; // chỉ alert pets HIGH/CRITICAL trong watch

        const petInput: PetForAlertInput = {
          id: pet.id,
          name: pet.name,
          species: extractSpecies(pet),
          breed: pet.breed,
          dob: pet.dob,
          fears: extractFears(pet),
        };

        const alerts = evaluateTodayAlerts(petInput, [snap], sensitivity, city);
        for (const alert of alerts) {
          if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK["urgent"]) continue;
          if (!alertTypeAllowed(alert.alert_type, prefs)) continue;
          const created = await createAlertIfNew(pet.id, user.id, alert);
          if (!created) continue;
          report.alerts_created++;
          if (user.push_subscription) {
            const result = await sendPush(
              user.id,
              user.push_subscription,
              {
                title: alert.title,
                body: alert.message.slice(0, 200),
                data: { url: "/alerts", alert_id: created.id },
              },
              { type: "alert_push" }
            );
            if (result.ok) {
              report.push_sent++;
              await markPushSent(created.id);
            } else {
              report.push_skipped++;
            }
          }
        }
      }
    } catch (err) {
      console.error(`[scheduler hourly] user ${user.id} failed:`, err);
      report.errors++;
    }
  }

  report.duration_ms = Date.now() - t0;
  console.log("[scheduler] runHourlySevereWatchJob done:", report);
  return report;
}

// ============================================================
// JOB 3: Cleanup old alerts/logs
// ============================================================
export async function runCleanupJob(): Promise<{ alerts_deleted: number; logs_deleted: number }> {
  const t0 = Date.now();
  console.log("[scheduler] runCleanupJob start");
  const result = { alerts_deleted: 0, logs_deleted: 0 };

  const alertCutoff = new Date();
  alertCutoff.setDate(alertCutoff.getDate() - 30);
  const alertCutoffIso = alertCutoff.toISOString().slice(0, 10);

  const logCutoff = new Date();
  logCutoff.setDate(logCutoff.getDate() - 90);
  const logCutoffIso = logCutoff.toISOString().slice(0, 10);

  try {
    // Delete climate_alerts dismissed > 30 days
    const oldAlerts = await listRows("climate_alerts", {
      filter: { triggered_at__date_before: alertCutoffIso },
      size: 500,
    });
    for (const row of oldAlerts.results) {
      try {
        await deleteRow("climate_alerts", (row as any).id);
        result.alerts_deleted++;
      } catch {}
    }

    // Delete notification_log > 90 days
    const oldLogs = await listRows("notification_log", {
      filter: { sent_at__date_before: logCutoffIso },
      size: 500,
    });
    for (const row of oldLogs.results) {
      try {
        await deleteRow("notification_log", (row as any).id);
        result.logs_deleted++;
      } catch {}
    }
  } catch (err) {
    console.error("[scheduler cleanup] failed:", err);
  }

  console.log("[scheduler] runCleanupJob done:", result, "duration", Date.now() - t0, "ms");
  return result;
}
