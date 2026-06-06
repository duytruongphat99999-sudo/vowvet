/**
 * Nutrition engine — pure logic (M7).
 *
 * Calorie calc (RER + DER + life stage + activity + reproductive + weather adjust).
 * Meal plan generation.
 * Life stage auto-detect from age + species.
 * BCS-based weight adjustment recommendations.
 */
import { ageInYears } from "./senior.ts";
import { isBrachycephalic } from "./brachycephalic.ts";
import type { AllergenCode } from "./allergen-normalizer.ts";

// ============================================================
// Types
// ============================================================

export type LifeStage = "puppy" | "junior" | "adult" | "senior" | "geriatric";
export type ActivityLevel = "sedentary" | "low" | "moderate" | "active" | "very_active";
export type ReproductiveStatus = "neutered" | "intact" | "pregnant" | "lactating";

export interface PetForNutrition {
  id: number;
  species: "dog" | "cat" | string;
  breed?: string | null;
  dob?: string | null;
  weight_kg?: number | string | null;
  target_weight_kg?: number | string | null;
  body_condition_score?: number | string | null;
  activity_level?: ActivityLevel | string | null;
  life_stage?: LifeStage | string | null;
  neutered?: boolean | null;
}

export interface WeatherContext {
  feels_like?: number | null;
  aqi?: number | null;
}

export interface CalorieBreakdown {
  rer: number;
  base_multiplier: number;
  life_stage_modifier: number;
  reproductive_modifier: number;
  life_stage_override?: number | null;
  weather_adjust: number;
  bcs_adjust: number;
  der_raw: number;
  der_final: number;
  life_stage: LifeStage;
  activity_level: ActivityLevel;
  ageingNote: string | null; // warning for senior/geriatric (null otherwise)
}

// ============================================================
// Life stage auto-detect
// ============================================================

/**
 * Calculate life_stage từ species + dob.
 * Dog:   <12m=puppy / 12-24m=junior / 2-7y=adult / 7-10y=senior / >10y=geriatric
 * Cat:   <12m=puppy / 12-24m=junior / 2-10y=adult / 10-15y=senior / >15y=geriatric
 */
export function calculateLifeStage(species: string | null | undefined, dob: string | null | undefined, now: Date = new Date()): LifeStage {
  const years = ageInYears(dob, now);
  if (years === null) return "adult"; // default cho pet không có dob
  const sp = species?.toLowerCase();
  const isCat = sp === "cat" || sp === "mèo";

  if (years < 1) return "puppy"; // puppy/kitten
  if (years < 2) return "junior";
  if (isCat) {
    if (years < 10) return "adult";
    if (years < 15) return "senior";
    return "geriatric";
  }
  // Dog
  if (years < 7) return "adult";
  if (years < 10) return "senior";
  return "geriatric";
}

/** Tháng tuổi cho puppy fine-grained detect (<4m vs 4-12m). */
function ageInMonths(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  return months;
}

// ============================================================
// Calorie engine
// ============================================================

const ACTIVITY_BASE: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  low: 1.4,
  moderate: 1.6, // default
  active: 2.0,
  very_active: 2.5,
};

const LIFE_STAGE_MODIFIER: Record<LifeStage, number> = {
  puppy: 1.0, // override applies separately
  junior: 1.0, // override applies separately
  adult: 1.0,
  senior: 1.0, // AAHA/WSAVA: no sub-maintenance penalty (was 0.9)
  geriatric: 1.0, // AAHA/WSAVA: no penalty; senior cats often need MORE (was 0.85)
};

/**
 * Calculate daily energy requirement (DER) — pure logic.
 *
 * Formula:
 *   RER = 70 × weight_kg ^ 0.75
 *   IF puppy <4 months: DER = RER × 3.0 (override)
 *   ELSE IF puppy 4-12 months OR junior: DER = RER × 2.0 (override)
 *   ELSE: DER = RER × activity_base × life_stage_modifier × reproductive_modifier
 *   Apply weather adjust: × 0.9 if feels>35, × 1.1 if feels<15, × 0.95 if AQI≥4 + brachy
 *   Apply BCS adjust: BCS≥7 → -20%, BCS≤3 → +15%
 */
export function calculateDER(pet: PetForNutrition, weather?: WeatherContext): CalorieBreakdown | null {
  const weight = pet.weight_kg ? Number(pet.weight_kg) : null;
  if (!weight || weight <= 0) return null;

  const lifeStage = (pet.life_stage as LifeStage) || calculateLifeStage(pet.species, pet.dob);
  const activity = (pet.activity_level as ActivityLevel) || "sedentary"; // AAHA/WSAVA: safer default when activity unknown (was "moderate")
  const months = ageInMonths(pet.dob) ?? 999;
  const bcs = pet.body_condition_score ? Number(pet.body_condition_score) : null;

  const rer = 70 * Math.pow(weight, 0.75);

  // Life stage override cho puppy/junior
  let lifeStageOverride: number | null = null;
  if (lifeStage === "puppy") {
    lifeStageOverride = months < 4 ? 3.0 : 2.0;
  } else if (lifeStage === "junior") {
    lifeStageOverride = 2.0;
  }

  let baseMultiplier: number;
  let lifeStageMod: number;
  let reproductiveMod: number;

  if (lifeStageOverride !== null) {
    baseMultiplier = lifeStageOverride;
    lifeStageMod = 1.0;
    reproductiveMod = 1.0;
  } else {
    baseMultiplier = ACTIVITY_BASE[activity] || ACTIVITY_BASE.moderate;
    lifeStageMod = LIFE_STAGE_MODIFIER[lifeStage] || 1.0;
    // Reproductive: chỉ apply nếu adult/senior — puppy/junior dùng override
    if (pet.neutered === false) reproductiveMod = 1.1; // intact adult slightly higher
    else reproductiveMod = 1.0; // neutered or unknown
  }

  let der = rer * baseMultiplier * lifeStageMod * reproductiveMod;

  // Weather adjust
  let weatherAdjust = 1.0;
  const feels = weather?.feels_like;
  const aqi = weather?.aqi;
  if (feels != null) {
    if (feels > 35) weatherAdjust *= 0.9;
    else if (feels < 15) weatherAdjust *= 1.1;
  }
  if (aqi != null && aqi >= 4 && isBrachycephalic(pet.breed)) {
    weatherAdjust *= 0.95;
  }
  der *= weatherAdjust;

  // BCS-based adjust
  let bcsAdjust = 1.0;
  if (bcs != null) {
    if (bcs >= 7) bcsAdjust = 0.8; // overweight → -20%
    else if (bcs <= 3) bcsAdjust = 1.15; // underweight → +15%
  }
  der *= bcsAdjust;

  const ageingNote =
    lifeStage === "senior" || lifeStage === "geriatric"
      ? "Thú lớn tuổi — theo dõi cân & cơ; mèo già thường cần nhiều hơn, hỏi bác sĩ"
      : null;

  return {
    rer: Math.round(rer),
    base_multiplier: baseMultiplier,
    life_stage_modifier: lifeStageMod,
    reproductive_modifier: reproductiveMod,
    life_stage_override: lifeStageOverride,
    weather_adjust: Math.round(weatherAdjust * 100) / 100,
    bcs_adjust: Math.round(bcsAdjust * 100) / 100,
    der_raw: Math.round(rer * baseMultiplier * lifeStageMod * reproductiveMod),
    der_final: Math.round(der),
    life_stage: lifeStage,
    activity_level: activity,
    ageingNote,
  };
}

// ============================================================
// Meal plan
// ============================================================

export interface MealEntry {
  time: string; // "07:00"
  type: "breakfast" | "lunch" | "dinner" | "snack";
  calories: number;
  grams: number; // calculated from suggested brand
}

export interface MealPlan {
  daily_calories: number;
  meals: MealEntry[];
  treat_budget_kcal: number;
  water_target_ml: number;
  warnings: Array<{ type: string; severity: string; message: string }>;
  breakdown: CalorieBreakdown;
}

/**
 * Generate meal plan dựa trên DER + pet preferences.
 * brand_calories_per_100g optional — nếu pet có brand chính trong DB, dùng để calc grams.
 * Otherwise grams = null (frontend hiện "~kcal").
 */
export function generateMealPlan(
  pet: PetForNutrition,
  weather: WeatherContext | undefined,
  brandCaloriesPer100g: number | null = null,
  mealsPerDay: number = 3
): MealPlan | null {
  const breakdown = calculateDER(pet, weather);
  if (!breakdown) return null;

  const der = breakdown.der_final;
  const meals_count = Math.max(1, Math.min(6, mealsPerDay));

  // Distribute calories across meals
  // Standard: breakfast 40%, lunch 20%, dinner 40% (cho 3 meals)
  // Cho 2: bf 50% / dinner 50%
  // Cho 1: 100% lunch
  const distributions: Record<number, number[]> = {
    1: [1.0],
    2: [0.5, 0.5],
    3: [0.4, 0.2, 0.4],
    4: [0.3, 0.2, 0.2, 0.3],
    5: [0.25, 0.15, 0.2, 0.15, 0.25],
    6: [0.2, 0.15, 0.15, 0.15, 0.15, 0.2],
  };
  const dist = distributions[meals_count];
  const times = ["07:00", "12:00", "18:00", "21:00", "10:00", "15:00"].slice(0, meals_count);
  const types: MealEntry["type"][] =
    meals_count === 1
      ? ["lunch"]
      : meals_count === 2
      ? ["breakfast", "dinner"]
      : meals_count === 3
      ? ["breakfast", "lunch", "dinner"]
      : ["breakfast", "lunch", "dinner", ...Array(meals_count - 3).fill("snack")];

  const meals: MealEntry[] = [];
  for (let i = 0; i < meals_count; i++) {
    const calories = Math.round(der * dist[i]);
    const grams = brandCaloriesPer100g
      ? Math.round((calories / brandCaloriesPer100g) * 100)
      : 0;
    meals.push({
      time: times[i],
      type: types[i] as MealEntry["type"],
      calories,
      grams,
    });
  }

  const weight = Number(pet.weight_kg) || 0;
  const water_ml = Math.round(weight * 50); // ~50 ml/kg/day baseline

  const warnings: MealPlan["warnings"] = [];
  const bcs = pet.body_condition_score ? Number(pet.body_condition_score) : null;
  if (bcs != null && bcs >= 7) {
    warnings.push({
      type: "bcs_high",
      severity: "warning",
      message: `BCS ${bcs}/9 — overweight. Áp dụng kế hoạch giảm cân (đã giảm 20% calorie).`,
    });
  }
  if (bcs != null && bcs <= 3) {
    warnings.push({
      type: "bcs_low",
      severity: "warning",
      message: `BCS ${bcs}/9 — underweight. Tăng 15% calorie + tư vấn vet kiểm tra nguyên nhân.`,
    });
  }
  const feels = weather?.feels_like;
  if (feels != null && feels > 35) {
    warnings.push({
      type: "heat",
      severity: "info",
      message: `Nóng (cảm ${feels}°C) — giảm 10% portion dry, tăng wet pate + nước.`,
    });
  }

  return {
    daily_calories: der,
    meals,
    treat_budget_kcal: Math.round(der * 0.1),
    water_target_ml: water_ml,
    warnings,
    breakdown,
  };
}

// ============================================================
// Allergy guard
// ============================================================

export interface AllergyConflict {
  pet_allergen: string;
  pet_severity: string | null;
  food_allergen: AllergenCode;
}

export function checkAllergyConflicts(
  petAllergenCodes: AllergenCode[],
  foodContainsAllergens: AllergenCode[],
  petAllergies: Array<{ item: string; severity?: string | null }> = []
): { safe: boolean; conflicts: AllergyConflict[] } {
  const conflicts: AllergyConflict[] = [];
  const foodSet = new Set(foodContainsAllergens);

  for (const code of petAllergenCodes) {
    if (foodSet.has(code)) {
      // Find original pet allergy entry for severity
      const orig = petAllergies.find((a) => {
        const lowerItem = (a.item || "").toLowerCase();
        return lowerItem.includes(code) ||
          (code === "chicken" && lowerItem.includes("gà")) ||
          (code === "beef" && lowerItem.includes("bò")) ||
          (code === "fish" && (lowerItem.includes("cá") || lowerItem.includes("ngừ"))) ||
          (code === "dairy" && lowerItem.includes("sữa")) ||
          (code === "egg" && lowerItem.includes("trứng")) ||
          (code === "grain" && (lowerItem.includes("lúa") || lowerItem.includes("ngũ"))) ||
          (code === "soy" && lowerItem.includes("đậu nành")) ||
          (code === "shellfish" && (lowerItem.includes("tôm") || lowerItem.includes("cua"))) ||
          (code === "peanut" && (lowerItem.includes("đậu phộng") || lowerItem.includes("lạc")));
      });
      conflicts.push({
        pet_allergen: orig?.item || code,
        pet_severity: orig?.severity || null,
        food_allergen: code,
      });
    }
  }

  return { safe: conflicts.length === 0, conflicts };
}

// ============================================================
// VN labels for UI
// ============================================================

export const LIFE_STAGE_LABEL_VI: Record<LifeStage, string> = {
  puppy: "Con (puppy/kitten)",
  junior: "Trẻ (junior)",
  adult: "Trưởng thành",
  senior: "Cao tuổi",
  geriatric: "Lão (geriatric)",
};

export const ACTIVITY_LABEL_VI: Record<ActivityLevel, string> = {
  sedentary: "Ít vận động",
  low: "Vận động nhẹ",
  moderate: "Vận động vừa",
  active: "Năng động",
  very_active: "Rất năng động",
};

export function lifeStageVi(stage: string | null | undefined): string {
  if (!stage) return "—";
  return LIFE_STAGE_LABEL_VI[stage as LifeStage] || stage;
}

export function activityLevelVi(level: string | null | undefined): string {
  if (!level) return "—";
  return ACTIVITY_LABEL_VI[level as ActivityLevel] || level;
}
