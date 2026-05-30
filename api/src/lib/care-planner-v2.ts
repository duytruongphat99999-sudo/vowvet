/**
 * Care Planner v2 orchestrator (M4.1 Phase 2).
 *
 * Flow:
 *   1. Check cache → return nếu hit
 *   2. Gather 20+ inputs (pet, history, weather, festival, breed)
 *   3. Build prompt v2
 *   4. Call Gemini Flash với responseSchema
 *   5. Validate Zod
 *   6. Merge server-fill (weather/breed/festival) + AI output
 *   7. Save Baserow care_plans (plan_json với schema_version=v2)
 *   8. Log AI cost feature=care_plan_v2
 *   9. Set cache 24h
 *
 * KHÔNG thay thế care-plan-engine.ts (v1) — chạy song song để rollback dễ.
 */
import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { listRows, createRow, updateRow, getRow } from "@shared/baserow.ts";
import { notifyAdmins } from "./admin-alerts.ts";
import {
  CarePlanV2AiOutput,
  type CarePlanV2Full,
  type CarePlanV2Type,
} from "@shared/care-plan-v2-types.ts";
import {
  buildUserPrompt,
  SYSTEM_PROMPT,
  GEMINI_RESPONSE_SCHEMA,
  type CarePlannerV2Input,
} from "@shared/prompts/care-planner-v2.ts";
import { getActiveFestival } from "@shared/festival-detector.ts";
import { getBreedWarning } from "@shared/breed-warnings.ts";
import { getWeather } from "./weather.ts";
import { computePetAirIndex } from "./petair-index.ts";
import { getCached, setCached, todayVN } from "./care-plan-cache.ts";
import { ageInYears } from "@shared/senior.ts";
import { getOwnedPet } from "./pets.ts";
import type { BaserowPet } from "./users.ts";
import { validateCarePlanSafety } from "@shared/care-plan-safety.ts";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const USAGE_LOG_PATH = process.env.GEMINI_USAGE_LOG || "/app/data/gemini-usage.log.jsonl";

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Flash pricing
const PRICE_INPUT_PER_M = 0.3;
const PRICE_OUTPUT_PER_M = 2.5;

function calculateCost(inputTok: number, outputTok: number): number {
  const cost = (inputTok / 1_000_000) * PRICE_INPUT_PER_M + (outputTok / 1_000_000) * PRICE_OUTPUT_PER_M;
  return Math.round(cost * 10_000) / 10_000;
}

async function appendUsageLog(entry: any): Promise<void> {
  try {
    await mkdir(dirname(USAGE_LOG_PATH), { recursive: true });
    await appendFile(USAGE_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.error("[care-planner-v2] usage log fail:", err);
  }
}

// ============================================================
// Gather inputs
// ============================================================

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function formatAgeLabel(dob: string | null | undefined): string {
  if (!dob) return "không rõ tuổi";
  const yrs = ageInYears(dob);
  if (yrs === null) return "không rõ tuổi";
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return `${yrs} tuổi`;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const months = Math.floor((now.getTime() - birth.getTime()) / (30.44 * 24 * 3600 * 1000));
  if (months < 12) return `${months} tháng tuổi`;
  const y = Math.floor(months / 12);
  const m2 = months % 12;
  return m2 === 0 ? `${y} tuổi` : `${y} tuổi ${m2} tháng`;
}

async function summarizeRecentCheckins(petId: number): Promise<string> {
  try {
    const res = await listRows<any>("daily_check_ins", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 7,
      orderBy: "-created_at",
    });
    const rows = res.results.filter((r: any) => r.appetite || r.energy);
    if (rows.length === 0) return "(chưa có check-in)";
    // Top-line averages
    const appetiteAvg = rows.reduce((s, r) => s + (Number(r.appetite) || 0), 0) / rows.length;
    const energyAvg = rows.reduce((s, r) => s + (Number(r.energy) || 0), 0) / rows.length;
    const symptomCounts = new Map<string, number>();
    for (const r of rows) {
      const syms = Array.isArray(r.symptoms) ? r.symptoms : [];
      for (const s of syms) {
        const v = typeof s === "object" ? s.value : s;
        if (v) symptomCounts.set(v, (symptomCounts.get(v) || 0) + 1);
      }
    }
    const topSyms = [...symptomCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const symptomStr = topSyms.length > 0 ? `, symptoms: ${topSyms.map(([s, c]) => `${s}×${c}`).join("; ")}` : "";
    return `${rows.length} check-ins: appetite avg ${appetiteAvg.toFixed(1)}/5, energy avg ${energyAvg.toFixed(1)}/5${symptomStr}`;
  } catch {
    return "(không load được check-in)";
  }
}

async function getLastTriage(petId: number): Promise<{ urgency: number; days_ago: number; symptoms: string[] } | null> {
  try {
    const res = await listRows<any>("triage_sessions", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 5,
    });
    const rows = res.results.filter((r: any) => r.ai_urgency_level);
    if (rows.length === 0) return null;
    rows.sort((a: any, b: any) => b.id - a.id);
    const latest = rows[0];
    // Triage không có created_at field — dùng id-based proxy
    let symptoms: string[] = [];
    try {
      if (latest.symptoms_json) {
        const parsed = JSON.parse(latest.symptoms_json);
        if (Array.isArray(parsed)) symptoms = parsed.filter((x) => typeof x === "string");
      }
    } catch {}
    return {
      urgency: Number(latest.ai_urgency_level),
      days_ago: 0, // Phase 0: id-based, no proper timestamp
      symptoms,
    };
  } catch {
    return null;
  }
}

async function getAllergies(petId: number): Promise<string[]> {
  try {
    const res = await listRows<any>("allergies_diet", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 50,
    });
    return res.results
      .filter((r: any) => {
        const t = flatVal<string>(r.type);
        return t === "allergy" || t === "forbidden";
      })
      .map((r: any) => r.item)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getVaccineDueDays(petId: number): Promise<number | null> {
  try {
    const res = await listRows<any>("vaccines", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 50,
    });
    const upcoming = res.results
      .filter((v: any) => {
        const status = flatVal<string>(v.status);
        return status === "scheduled" || status === "overdue";
      })
      .map((v: any) => v.due_date)
      .filter(Boolean)
      .sort();
    if (upcoming.length === 0) return null;
    const next = new Date(upcoming[0]);
    const days = Math.ceil((next.getTime() - Date.now()) / (24 * 3600 * 1000));
    return days;
  } catch {
    return null;
  }
}

function birthdayInDays(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, day);
  if (target < now) target = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 3600 * 1000));
}

async function gatherInputs(pet: BaserowPet, citySlug = "ho_chi_minh"): Promise<CarePlannerV2Input> {
  const petId = pet.id;
  const speciesRaw = flatVal<string>(pet.species) || "other";
  const species: "dog" | "cat" | "other" =
    speciesRaw === "dog" || speciesRaw === "cat" ? speciesRaw : "other";
  const ageLabel = formatAgeLabel(pet.dob);

  const [checkinsSummary, lastTriage, allergies, vaccineDays] = await Promise.all([
    summarizeRecentCheckins(petId),
    getLastTriage(petId),
    getAllergies(petId),
    getVaccineDueDays(petId),
  ]);

  // Weather + PetAir
  let weather: any = { feels_like: 28, temp: 28, humidity: 70, aqi: 2, city: "Hồ Chí Minh", condition_vi: "không rõ" };
  try {
    const w = await getWeather(citySlug);
    weather = {
      feels_like: w.feels_like,
      temp: w.temp,
      humidity: w.humidity,
      aqi: w.aqi,
      city: w.city,
      condition_vi: w.aqi_label_vn || "thường",
    };
  } catch (err) {
    console.warn("[care-planner-v2] weather fetch fail, using defaults:", err);
  }
  const petair = computePetAirIndex(weather);

  // Festival
  const fp = getActiveFestival(new Date());
  // Breed warning
  const breedWarning = getBreedWarning(pet.breed || null, species === "cat" ? "cat" : "dog");

  const today = todayVN();

  return {
    pet: {
      id: petId,
      name: pet.name,
      species,
      breed: pet.breed || null,
      age_label: ageLabel,
      weight_kg: pet.weight_kg ? Number(pet.weight_kg) : null,
      bcs: (pet as any).body_condition_score ? Number((pet as any).body_condition_score) : (pet as any).bcs ? Number((pet as any).bcs) : null,
      sex: flatVal<string>((pet as any).gender),
      neutered: (pet as any).neutered === true ? true : (pet as any).neutered === false ? false : null,
      allergies,
      medical_conditions: [], // Phase 0 — chưa có dedicated field
      personality_type: (pet as any).personality_type || null,
    },
    history: {
      last_7_checkins_summary: checkinsSummary,
      last_triage: lastTriage,
      vaccine_due_in_days: vaccineDays,
      deworm_due_in_days: null, // Phase 0 — defer
      birthday_in_days: birthdayInDays(pet.dob),
    },
    climate: {
      city: weather.city,
      feels_like: weather.feels_like,
      temp: weather.temp,
      condition_vi: weather.condition_vi,
      aqi: weather.aqi,
      humidity: weather.humidity,
      petair_index: petair.score,
      safe_hours_today: petair.safe_hours_today,
      forecast_summary: `Hôm nay ${weather.temp}°C, ${weather.condition_vi}`, // Phase 0: simplified, future M4.2 = real forecast
    },
    festival: fp ? { festival: fp.festival, phase: fp.phase, days_until: fp.days_until } : null,
    breed_warning: breedWarning,
    owner: {},
    date: today,
  };
}

// ============================================================
// Gemini call
// ============================================================

async function invokeGemini(systemPrompt: string, userPrompt: string): Promise<{
  output: any;
  input_tokens: number;
  output_tokens: number;
}> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY chưa cấu hình");

  const response: GenerateContentResponse = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA as any,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini empty response");

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini JSON malformed: ${text.slice(0, 200)}`);
  }

  const usage = response.usageMetadata;
  return {
    output: parsed,
    input_tokens: usage?.promptTokenCount ?? 0,
    output_tokens: usage?.candidatesTokenCount ?? 0,
  };
}

// ============================================================
// Main orchestrator
// ============================================================

export async function generateCarePlanV2(
  petId: number,
  ownerId: number,
  options: { force_refresh?: boolean; city_slug?: string } = {}
): Promise<CarePlanV2Full> {
  const startMs = Date.now();
  // Verify ownership
  const pet = await getOwnedPet(petId, ownerId);
  const today = todayVN();

  // 1. Cache check
  if (!options.force_refresh) {
    const cached = getCached(petId, today);
    if (cached) {
      console.log(`[care-plan-v2] cache HIT pet=${petId} date=${today}`);
      return { ...cached, meta: { ...cached.meta, cache_hit: true } };
    }
  }
  console.log(`[care-plan-v2] cache MISS pet=${petId} date=${today} force_refresh=${!!options.force_refresh}`);

  // 2. Gather inputs
  const input = await gatherInputs(pet, options.city_slug);

  // 3. Build prompt
  const userPrompt = buildUserPrompt(input);

  // 4. Call Gemini
  const { output, input_tokens, output_tokens } = await invokeGemini(SYSTEM_PROMPT, userPrompt);

  // 5. Validate AI output (Zod schema)
  const aiValidated = CarePlanV2AiOutput.parse(output);

  // 5b. SAFETY GATE — hardcoded toxic blacklist + dangerous-activity check.
  //     Runs AFTER schema validate but BEFORE we trust the plan for the user.
  //     Violations are logged + a sanitized warning is added to summary, but we
  //     do NOT silently kill the response — we just neutralize toxic mentions
  //     by appending a warning. Future task: full fallback skeleton.
  const species = (typeof pet.species === "object" ? (pet.species as any)?.value : (pet.species as any)) || "dog";
  const safety = validateCarePlanSafety(aiValidated, String(species));
  if (!safety.safe) {
    console.error(
      `[care-plan-v2] SAFETY VIOLATION pet=${petId} species=${species} violations=${JSON.stringify(safety.violations)}`
    );
    // Fire-and-forget admin push — don't await (don't block care plan response).
    void notifyAdmins(
      "🚨 VowVet Safety Alert",
      `Phát hiện vi phạm an toàn y khoa tại Pet ID: ${petId} (${input.pet.name}) — Vi phạm: ${safety.violations.join(", ")}`,
      { url: `/admin?safety_violation=${petId}`, pet_id: petId, violations: safety.violations }
    );
    // Append the violations as a warning in summary so user + admin see it
    const flag = ` ⚠️ AI output bị safety check flag (${safety.violations.length} cảnh báo) — tham khảo BS trước khi áp dụng.`;
    aiValidated.summary = (aiValidated.summary || "") + flag;
    // Fire-and-forget logging to a future care_plan_safety_log table (table not yet migrated).
    // For now console.error above is the audit trail.
  }

  // 6. Merge server-fill + AI output
  const fullPlan: CarePlanV2Type = {
    schema_version: "v2",
    date: input.date,
    pet_name: input.pet.name,
    pet_breed: input.pet.breed,
    pet_age_label: input.pet.age_label,
    weather: {
      city: input.climate.city,
      temp_celsius: input.climate.temp,
      feels_like_celsius: input.climate.feels_like,
      condition_vi: input.climate.condition_vi,
      aqi: input.climate.aqi,
      petair_index: input.climate.petair_index,
      safe_hours_today: input.climate.safe_hours_today,
    },
    breed_warning: input.breed_warning
      ? `${input.breed_warning.breed_name_vi} — ${input.breed_warning.critical_warnings[0]}`
      : null,
    festival_warning: input.festival
      ? {
          festival_name: input.festival.festival.name_vi,
          phase: input.festival.phase,
          days_until: input.festival.days_until,
          key_warnings: input.festival.festival.pet_warnings.slice(0, 3),
        }
      : null,
    eating: aiValidated.eating,
    exercise: aiValidated.exercise,
    training: aiValidated.training ?? null,
    monitoring: aiValidated.monitoring ?? [],
    upcoming: aiValidated.upcoming ?? [],
    urgency_level: aiValidated.urgency_level,
    summary: aiValidated.summary,
  };

  const cost = calculateCost(input_tokens, output_tokens);
  const meta = {
    model: "gemini-2.5-flash",
    cost_usd: cost,
    input_tokens,
    output_tokens,
    cache_hit: false,
    generated_at: new Date().toISOString(),
  };

  const result: CarePlanV2Full = { ...fullPlan, meta };

  // 7. Log usage
  await appendUsageLog({
    ts: meta.generated_at,
    model: "gemini-2.5-flash",
    input_tokens,
    output_tokens,
    cost_usd: cost,
    pet_id: petId,
    user_id: ownerId,
    feature: "care_plan_v2",
  });

  // 8. Save Baserow (upsert by pet_id + plan_date)
  try {
    const existing = await listRows<any>("care_plans", {
      filter: { pet_id__link_row_has: String(petId), plan_date__date_equal: today },
      size: 1,
    });
    const planJson = JSON.stringify(fullPlan);
    const metaJson = JSON.stringify(meta);
    if (existing.results.length > 0) {
      await updateRow("care_plans", existing.results[0].id, {
        plan_json: planJson,
        weather_snapshot: metaJson, // reuse field for meta
      });
    } else {
      await createRow("care_plans", {
        pet_id: [petId],
        plan_date: today,
        plan_json: planJson,
        weather_snapshot: metaJson,
        sent_zalo: false,
      });
    }
  } catch (err) {
    console.error("[care-plan-v2] save Baserow fail:", err);
    // Non-fatal — return plan anyway
  }

  // 9. Set cache
  setCached(petId, result, today);

  const elapsedMs = Date.now() - startMs;
  console.log(
    `[care-plan-v2] generated pet=${petId} cost=$${cost.toFixed(4)} tok=${input_tokens}/${output_tokens} elapsed=${elapsedMs}ms`
  );

  return result;
}

/** Public lookup helper cho dashboard preview (cache-only, KHÔNG trigger gen). */
export function getCachedOnly(petId: number): CarePlanV2Full | null {
  return getCached(petId);
}
