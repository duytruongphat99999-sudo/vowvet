/**
 * Water Intake service (M25).
 *
 * Expected intake calc:
 *   normal: ~50ml/kg body weight per day
 *   max:    ~100ml/kg (hot weather, lactation)
 *   ≥100ml/kg = excessive (polydipsia — possible diabetes/kidney issue)
 *   <30ml/kg = critically low (dehydration risk)
 *
 * Weather adjustment: each +5°C above 25°C → +10% expected min.
 */
import { listRows, createRow } from "@shared/baserow.ts";

export interface WaterRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  log_date: string;
  amount_ml: number;
  method: string | { id: number; value: string };
  weather_celsius: number | null;
  expected_min_ml: number;
  expected_max_ml: number;
  status: string | { id: number; value: string };
  notes: string | null;
  created_at: string;
}

export type WaterStatus = "low" | "normal" | "high";

export interface WaterApi {
  id: number;
  pet_id: number;
  log_date: string;
  amount_ml: number;
  expected_min_ml: number;
  expected_max_ml: number;
  status: WaterStatus;
  weather_celsius: number | null;
  notes: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toApi(row: WaterRow): WaterApi {
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    log_date: row.log_date,
    amount_ml: Number(row.amount_ml) || 0,
    expected_min_ml: Number(row.expected_min_ml) || 0,
    expected_max_ml: Number(row.expected_max_ml) || 0,
    status: (flatVal<WaterStatus>(row.status) || "normal") as WaterStatus,
    weather_celsius: row.weather_celsius != null ? Number(row.weather_celsius) : null,
    notes: row.notes || "",
  };
}

export function calculateExpectedRange(
  weightKg: number,
  weatherCelsius: number | null
): { min: number; max: number } {
  if (!weightKg || weightKg <= 0) return { min: 0, max: 0 };
  let min = weightKg * 50;
  let max = weightKg * 100;
  // Hot weather adjustment
  if (weatherCelsius != null && weatherCelsius > 25) {
    const extraDeg = weatherCelsius - 25;
    const bump = 1 + (extraDeg / 5) * 0.1; // +10% per 5°C
    min = Math.round(min * bump);
    max = Math.round(max * bump);
  }
  return { min: Math.round(min), max: Math.round(max) };
}

export function categorizeWater(amount: number, expectedMin: number, expectedMax: number): WaterStatus {
  if (expectedMin <= 0) return "normal";
  if (amount < expectedMin * 0.7) return "low";
  if (amount > expectedMax * 1.3) return "high";
  return "normal";
}

export interface LogWaterInput {
  petId: number;
  log_date: string;
  amount_ml: number;
  method: "manual" | "smart_bowl";
  weather_celsius?: number | null;
  weight_kg: number;
  notes?: string;
}

export async function logWater(input: LogWaterInput): Promise<WaterApi> {
  const { min, max } = calculateExpectedRange(input.weight_kg, input.weather_celsius ?? null);
  const status = categorizeWater(input.amount_ml, min, max);
  const row = await createRow<WaterRow>("water_intake_logs", {
    pet_id: [input.petId],
    log_date: input.log_date,
    amount_ml: input.amount_ml,
    method: input.method || "manual",
    weather_celsius: input.weather_celsius ?? null,
    expected_min_ml: min,
    expected_max_ml: max,
    status,
    notes: input.notes || null,
    created_at: new Date().toISOString(),
  });
  return toApi(row);
}

export async function listWater(petId: number, days = 30): Promise<WaterApi[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);
  const res = await listRows<WaterRow>("water_intake_logs", {
    filter: {
      pet_id__link_row_has: String(petId),
      log_date__date_after_or_equal: sinceIso,
    },
    size: 100,
    orderBy: "-log_date",
  });
  return res.results.filter((r) => r.log_date && r.amount_ml).map(toApi);
}

export async function getLatestWater(petId: number): Promise<WaterApi | null> {
  const all = await listWater(petId, 7);
  return all[0] || null;
}

/** Check if pet has 3 consecutive low days (concerning trend). */
export async function checkLowTrend(petId: number): Promise<boolean> {
  const logs = await listWater(petId, 7);
  if (logs.length < 3) return false;
  const sorted = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date));
  return sorted.slice(0, 3).every((l) => l.status === "low");
}
