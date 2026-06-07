/**
 * Nutrition repository (M7) — orchestrate Baserow + nutrition-engine.
 *
 * Layered:
 *   shared/nutrition-engine.ts    → pure DER + meal plan + allergy guard logic
 *   shared/allergen-normalizer.ts → VN ↔ EN allergen map
 *   api/lib/nutrition.ts          → DB read/write + cache + weather plumbing
 *   api/routes/nutrition.ts       → HTTP layer
 *
 * Caching:
 *   - calorieCache: per-pet, 12h TTL, invalidated on weight/activity update
 *   - brandsCache: 24h TTL (brands rarely change Phase 0)
 */
import { listRows, createRow, updateRow } from "@shared/baserow.ts";
import {
  calculateDER,
  generateMealPlan,
  checkAllergyConflicts,
  calculateLifeStage,
  type PetForNutrition,
  type WeatherContext,
  type CalorieBreakdown,
  type MealPlan,
  type LifeStage,
} from "@shared/nutrition-engine.ts";
import { normalizeAllergens, type AllergenCode } from "@shared/allergen-normalizer.ts";
import { getWeather } from "./weather.ts";
import type { BaserowPet } from "./users.ts";

// ============================================================
// Helpers
// ============================================================

function flat<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

// ============================================================
// Calorie cache (12h per pet)
// ============================================================
interface CachedCalorie {
  breakdown: CalorieBreakdown;
  city_slug: string;
  expires_at: number;
}
const calorieCache = new Map<number, CachedCalorie>();
const CALORIE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function invalidateCalorieCache(petId: number): void {
  calorieCache.delete(petId);
}

// ============================================================
// Food brand cache (24h)
// ============================================================
interface BaserowFoodBrand {
  id: number;
  brand_name?: string | null;
  product_line?: string | null;
  species?: string | { value: string } | null;
  life_stage?: string | { value: string } | null;
  protein_pct?: number | string | null;
  fat_pct?: number | string | null;
  fiber_pct?: number | string | null;
  carb_pct_calculated?: number | string | null;
  calories_per_100g?: number | string | null;
  price_vnd_per_kg?: number | string | null;
  contains_allergens?: string | null;
  mon_min_recommended?: boolean;
  vn_availability?: boolean;
  image_url?: string | null;
  product_url?: string | null;
}

export interface FoodBrand {
  brand_id: number;
  brand_name: string;
  product_line: string | null;
  species: "dog" | "cat" | "both";
  life_stage: "puppy" | "adult" | "senior" | "all";
  protein_pct: number | null;
  fat_pct: number | null;
  fiber_pct: number | null;
  carb_pct_calculated: number | null;
  calories_per_100g: number | null;
  price_vnd_per_kg: number | null;
  contains_allergens: AllergenCode[];
  mon_min_recommended: boolean;
  vn_availability: boolean;
  image_url: string | null;
  product_url: string | null;
}

let brandsCache: { data: FoodBrand[]; expires_at: number } | null = null;
const BRANDS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseAllergens(raw: string | null | undefined): AllergenCode[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is AllergenCode => typeof x === "string");
  } catch {
    return [];
  }
}

function flatBrand(r: BaserowFoodBrand): FoodBrand {
  return {
    brand_id: r.id,
    brand_name: r.brand_name || "",
    product_line: r.product_line || null,
    species: (flat<string>(r.species) as any) || "both",
    life_stage: (flat<string>(r.life_stage) as any) || "all",
    protein_pct: r.protein_pct != null ? Number(r.protein_pct) : null,
    fat_pct: r.fat_pct != null ? Number(r.fat_pct) : null,
    fiber_pct: r.fiber_pct != null ? Number(r.fiber_pct) : null,
    carb_pct_calculated: r.carb_pct_calculated != null ? Number(r.carb_pct_calculated) : null,
    calories_per_100g: r.calories_per_100g != null ? Number(r.calories_per_100g) : null,
    price_vnd_per_kg: r.price_vnd_per_kg != null ? Number(r.price_vnd_per_kg) : null,
    contains_allergens: parseAllergens(r.contains_allergens),
    mon_min_recommended: r.mon_min_recommended === true,
    vn_availability: r.vn_availability !== false,
    image_url: r.image_url || null,
    product_url: r.product_url || null,
  };
}

export async function loadFoodBrands(force = false): Promise<FoodBrand[]> {
  if (!force && brandsCache && brandsCache.expires_at > Date.now()) {
    return brandsCache.data;
  }
  const res = await listRows<BaserowFoodBrand>("food_brands", { size: 200 });
  // Filter out stub rows (Baserow auto-creates 2 empty rows khi table mới tạo)
  const data = res.results.filter((r) => r.brand_name && r.brand_name.trim().length > 0).map(flatBrand);
  brandsCache = { data, expires_at: Date.now() + BRANDS_CACHE_TTL_MS };
  return data;
}

export function invalidateBrandsCache(): void {
  brandsCache = null;
}

// ============================================================
// Pet → engine input + allergy codes
// ============================================================

/** Map raw Baserow pet row → nutrition-engine input. */
export function toPetForNutrition(pet: BaserowPet | any): PetForNutrition {
  // Prefer M7 body_condition_score, fallback M3.5 bcs field
  const bcs = (pet as any).body_condition_score ?? (pet as any).bcs;
  const neuteredRaw = (pet as any).neutered;
  return {
    id: pet.id,
    species: (flat<string>((pet as any).species) as any) || "other",
    breed: pet.breed,
    dob: pet.dob,
    weight_kg: pet.weight_kg,
    target_weight_kg: (pet as any).target_weight_kg,
    body_condition_score: bcs,
    activity_level: flat<string>((pet as any).activity_level) as any,
    life_stage: flat<string>((pet as any).life_stage) as any,
    neutered: neuteredRaw === true ? true : neuteredRaw === false ? false : null,
  };
}

/** Lấy allergy codes của pet (đã normalize EN). */
export async function getPetAllergyCodes(petId: number): Promise<{
  codes: AllergenCode[];
  raw_entries: Array<{ item: string; severity: string | null; type: string | null }>;
}> {
  try {
    const res = await listRows<any>("allergies_diet", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 50,
    });
    const entries = res.results
      .filter((r) => {
        const t = flat<string>(r.type);
        return t === "allergy" || t === "forbidden";
      })
      .map((r) => ({
        item: r.item || "",
        severity: flat<string>(r.severity),
        type: flat<string>(r.type),
      }));
    const codes = normalizeAllergens(entries.map((e) => e.item));
    return { codes, raw_entries: entries };
  } catch {
    return { codes: [], raw_entries: [] };
  }
}

// ============================================================
// Calorie target (cached)
// ============================================================

export interface CalorieTargetResult {
  pet_id: number;
  breakdown: CalorieBreakdown;
  weather: { feels_like: number | null; aqi: number | null; city: string } | null;
  cached: boolean;
  cached_until: string;
}

export async function getCalorieTarget(
  petId: number,
  pet: BaserowPet,
  citySlug = "ho_chi_minh"
): Promise<CalorieTargetResult | null> {
  const cached = calorieCache.get(petId);
  if (cached && cached.expires_at > Date.now() && cached.city_slug === citySlug) {
    return {
      pet_id: petId,
      breakdown: cached.breakdown,
      weather: null,
      cached: true,
      cached_until: new Date(cached.expires_at).toISOString(),
    };
  }

  const petForN = toPetForNutrition(pet);
  let weatherContext: WeatherContext = {};
  let weatherDisplay: CalorieTargetResult["weather"] = null;
  try {
    const w = await getWeather(citySlug);
    weatherContext = { feels_like: w.feels_like, aqi: w.aqi };
    weatherDisplay = { feels_like: w.feels_like, aqi: w.aqi, city: w.city };
  } catch (err) {
    console.warn("[nutrition] weather fetch failed, dùng base DER:", err);
  }

  const breakdown = calculateDER(petForN, weatherContext);
  if (!breakdown) return null;

  const expires_at = Date.now() + CALORIE_CACHE_TTL_MS;
  calorieCache.set(petId, { breakdown, city_slug: citySlug, expires_at });

  return {
    pet_id: petId,
    breakdown,
    weather: weatherDisplay,
    cached: false,
    cached_until: new Date(expires_at).toISOString(),
  };
}

// ============================================================
// Meal plan
// ============================================================

export interface MealPlanResult {
  pet_id: number;
  plan: MealPlan;
  suggested_brand: FoodBrand | null;
}

export async function generatePlanForPet(
  petId: number,
  pet: BaserowPet,
  opts: { citySlug?: string; mealsPerDay?: number; brandId?: number | null } = {}
): Promise<MealPlanResult | null> {
  const { citySlug = "ho_chi_minh", mealsPerDay = 3, brandId = null } = opts;

  const petForN = toPetForNutrition(pet);
  let weatherContext: WeatherContext = {};
  try {
    const w = await getWeather(citySlug);
    weatherContext = { feels_like: w.feels_like, aqi: w.aqi };
  } catch (err) {
    console.warn("[nutrition] weather fetch failed:", err);
  }

  // Suggested brand: explicit hoặc auto-pick top match
  let suggestedBrand: FoodBrand | null = null;
  if (brandId) {
    const brands = await loadFoodBrands();
    suggestedBrand = brands.find((b) => b.brand_id === brandId) || null;
  } else {
    const recs = await getCompatibleBrandRecommendations(petId, pet, 1);
    suggestedBrand = recs[0] || null;
  }

  const plan = generateMealPlan(
    petForN,
    weatherContext,
    suggestedBrand?.calories_per_100g || null,
    mealsPerDay
  );
  if (!plan) return null;

  return { pet_id: petId, plan, suggested_brand: suggestedBrand };
}

// ============================================================
// Brand compatibility check
// ============================================================

export interface CompatibilityResult {
  brand_id: number;
  brand_name: string;
  pet_id: number;
  safe: boolean;
  suitable: boolean;
  conflicts: Array<{ pet_allergen: string; pet_severity: string | null; food_allergen: string }>;
  warnings: string[];
}

export async function checkBrandCompatibility(
  petId: number,
  pet: BaserowPet,
  brandId: number
): Promise<CompatibilityResult | null> {
  const brands = await loadFoodBrands();
  const brand = brands.find((b) => b.brand_id === brandId);
  if (!brand) return null;

  const petForN = toPetForNutrition(pet);
  const { codes: petCodes, raw_entries } = await getPetAllergyCodes(petId);
  const guard = checkAllergyConflicts(petCodes, brand.contains_allergens, raw_entries);

  const warnings: string[] = [];
  const petSpecies = typeof petForN.species === "string" ? petForN.species.toLowerCase() : "";
  const isCat = petSpecies === "cat" || petSpecies === "mèo";
  const isDog = petSpecies === "dog" || petSpecies === "chó";

  let suitable = true;
  if (brand.species === "dog" && !isDog) {
    warnings.push("Sản phẩm dành cho chó, không phù hợp pet hiện tại.");
    suitable = false;
  } else if (brand.species === "cat" && !isCat) {
    warnings.push("Sản phẩm dành cho mèo, không phù hợp pet hiện tại.");
    suitable = false;
  }

  const petLifeStage = (petForN.life_stage as LifeStage) || calculateLifeStage(petForN.species, petForN.dob);
  if (brand.life_stage !== "all") {
    if (brand.life_stage === "puppy" && !["puppy", "junior"].includes(petLifeStage)) {
      warnings.push("Sản phẩm puppy/kitten — quá nhiều calorie cho pet trưởng thành.");
      suitable = false;
    } else if (brand.life_stage === "senior" && !["senior", "geriatric"].includes(petLifeStage)) {
      warnings.push("Sản phẩm senior, không phù hợp pet trẻ tuổi.");
      suitable = false;
    } else if (brand.life_stage === "adult" && ["puppy", "junior"].includes(petLifeStage)) {
      warnings.push("Sản phẩm adult, không đủ dinh dưỡng cho puppy/junior đang phát triển.");
      suitable = false;
    }
  }

  if (!brand.vn_availability) {
    warnings.push("Sản phẩm này có thể không phân phối tại Việt Nam.");
  }

  return {
    brand_id: brandId,
    brand_name: brand.brand_name,
    pet_id: petId,
    safe: guard.safe,
    suitable,
    conflicts: guard.conflicts,
    warnings,
  };
}

/**
 * Top brand recommendations cho pet:
 *   filter: species match (or both) + life_stage match (or all) + vn_availability + no allergen conflict
 *   rank: mon_min_recommended → life_stage exact match → giá VND tăng dần
 */
export async function getCompatibleBrandRecommendations(
  petId: number,
  pet: BaserowPet,
  max = 5
): Promise<FoodBrand[]> {
  const petForN = toPetForNutrition(pet);
  const { codes: petCodes } = await getPetAllergyCodes(petId);
  const brands = await loadFoodBrands();

  const petSpecies = typeof petForN.species === "string" ? petForN.species.toLowerCase() : "";
  const isCat = petSpecies === "cat" || petSpecies === "mèo";
  const isDog = petSpecies === "dog" || petSpecies === "chó";
  const speciesCode = isCat ? "cat" : isDog ? "dog" : null;
  const petLifeStage = (petForN.life_stage as LifeStage) || calculateLifeStage(petForN.species, petForN.dob);

  const compatible = brands.filter((b) => {
    if (!b.vn_availability) return false;
    if (speciesCode && b.species !== speciesCode && b.species !== "both") return false;
    if (b.life_stage !== "all") {
      if (b.life_stage === "puppy" && !["puppy", "junior"].includes(petLifeStage)) return false;
      if (b.life_stage === "adult" && petLifeStage !== "adult") return false;
      if (b.life_stage === "senior" && !["senior", "geriatric"].includes(petLifeStage)) return false;
    }
    // Allergen exclusion
    for (const a of b.contains_allergens) {
      if (petCodes.includes(a)) return false;
    }
    return true;
  });

  compatible.sort((a, b) => {
    if (a.mon_min_recommended !== b.mon_min_recommended) return a.mon_min_recommended ? -1 : 1;
    const aExact = a.life_stage === petLifeStage ? 0 : 1;
    const bExact = b.life_stage === petLifeStage ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return (a.price_vnd_per_kg ?? Infinity) - (b.price_vnd_per_kg ?? Infinity);
  });

  return compatible.slice(0, max);
}

// ============================================================
// Weight logs
// ============================================================

export interface WeightLogEntry {
  id: number;
  weight_kg: number;
  body_condition_score: number | null;
  logged_at: string;
  notes: string | null;
  logged_by: string;
}

function flatWeightLog(r: any): WeightLogEntry {
  return {
    id: r.id,
    weight_kg: Number(r.weight_kg),
    body_condition_score: r.body_condition_score != null ? Number(r.body_condition_score) : null,
    logged_at: r.logged_at,
    notes: r.notes || null,
    logged_by: flat<string>(r.logged_by) || "owner",
  };
}

/**
 * Tạo weight log row + sync pets.weight_kg + invalidate calorie cache.
 * Pet update nằm trong cùng flow → caller không cần invalidate riêng.
 */
export async function logWeight(
  petId: number,
  data: { weight_kg: number; body_condition_score?: number | null; notes?: string | null }
): Promise<WeightLogEntry> {
  const row = await createRow<any>("weight_logs", {
    pet_id: [petId],
    weight_kg: data.weight_kg,
    body_condition_score: data.body_condition_score ?? null,
    notes: data.notes ?? null,
    logged_by: "owner",
  });

  const petUpdates: Record<string, unknown> = { weight_kg: data.weight_kg };
  if (data.body_condition_score !== undefined && data.body_condition_score !== null) {
    petUpdates.body_condition_score = data.body_condition_score;
  }
  await updateRow("pets", petId, petUpdates);

  invalidateCalorieCache(petId);
  return flatWeightLog(row);
}

export async function listWeightLogs(petId: number, limit = 50): Promise<WeightLogEntry[]> {
  const res = await listRows<any>("weight_logs", {
    filter: { pet_id__link_row_has: String(petId) },
    size: limit,
    orderBy: "-logged_at",
  });
  return res.results.filter((r) => r.weight_kg != null).map(flatWeightLog);
}

// ============================================================
// Weight insights — trend + recommendations
// ============================================================

export interface WeightInsights {
  pet_id: number;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  delta_to_target_kg: number | null;
  trend_30d: { direction: "gain" | "loss" | "stable" | "insufficient_data"; delta_kg: number | null };
  bcs_current: number | null;
  recommendations: Array<{ severity: "info" | "warning" | "critical"; message: string }>;
  recent_logs: WeightLogEntry[];
}

export async function getWeightInsights(petId: number, pet: BaserowPet): Promise<WeightInsights> {
  const logs = await listWeightLogs(petId, 50);
  const recentLogs = logs.slice(0, 10);

  const petForN = toPetForNutrition(pet);
  const currentWeight = petForN.weight_kg != null ? Number(petForN.weight_kg) : null;
  const targetWeight = petForN.target_weight_kg != null ? Number(petForN.target_weight_kg) : null;
  const bcs = petForN.body_condition_score != null ? Number(petForN.body_condition_score) : null;
  const deltaToTarget =
    currentWeight != null && targetWeight != null
      ? Math.round((currentWeight - targetWeight) * 10) / 10
      : null;

  let trendDirection: WeightInsights["trend_30d"]["direction"] = "insufficient_data";
  let deltaKg: number | null = null;
  if (logs.length >= 2) {
    const latest = logs[0];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const baseline = logs.find((l) => new Date(l.logged_at).getTime() <= cutoff) || logs[logs.length - 1];
    deltaKg = Math.round((latest.weight_kg - baseline.weight_kg) * 100) / 100;
    if (Math.abs(deltaKg) < 0.2) trendDirection = "stable";
    else if (deltaKg > 0) trendDirection = "gain";
    else trendDirection = "loss";
  }

  const recs: WeightInsights["recommendations"] = [];
  if (bcs != null && bcs >= 7) {
    recs.push({
      severity: "warning",
      message: `BCS ${bcs}/9 — pet thừa cân. Đã giảm 20% calorie tự động. Tăng vận động + theo dõi 4 tuần.`,
    });
  }
  if (bcs != null && bcs <= 3) {
    recs.push({
      severity: "warning",
      message: `BCS ${bcs}/9 — pet thiếu cân. Đã tăng 15% calorie. Đề nghị khám vet kiểm tra ký sinh trùng/răng.`,
    });
  }
  if (targetWeight != null && currentWeight != null) {
    const pct = ((currentWeight - targetWeight) / targetWeight) * 100;
    if (Math.abs(pct) >= 15) {
      recs.push({
        severity: "warning",
        message: `Lệch ${Math.abs(Math.round(pct))}% so với cân nặng mục tiêu (${targetWeight} kg). Cần kế hoạch dài hạn.`,
      });
    }
  }
  if (trendDirection === "gain" && deltaKg != null && deltaKg > 0.5) {
    recs.push({
      severity: "info",
      message: `Tăng ${deltaKg} kg trong 30 ngày qua. Theo dõi khẩu phần + treat budget (10% calo/ngày).`,
    });
  }
  if (trendDirection === "loss" && deltaKg != null && deltaKg < -0.5) {
    recs.push({
      severity: "warning",
      message: `Giảm ${Math.abs(deltaKg)} kg trong 30 ngày — kiểm tra vet nếu không cố ý giảm cân.`,
    });
  }
  if (logs.length === 0) {
    recs.push({
      severity: "info",
      message: "Chưa có lịch sử cân nặng. Nên log cân định kỳ 2 tuần/lần để theo dõi.",
    });
  }

  return {
    pet_id: petId,
    current_weight_kg: currentWeight,
    target_weight_kg: targetWeight,
    delta_to_target_kg: deltaToTarget,
    trend_30d: { direction: trendDirection, delta_kg: deltaKg },
    bcs_current: bcs,
    recommendations: recs,
    recent_logs: recentLogs,
  };
}
