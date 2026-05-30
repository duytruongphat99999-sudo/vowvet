/**
 * Climate sensitivity score per pet (M5).
 *
 * Rules (additive, cap at 100):
 *   +30  Brachycephalic breed (heat_sensitive)
 *   +20  Senior pet (dog>=7, cat>=10)        (general_sensitive)
 *   +15  fears includes "thunder" OR "fireworks" (storm_sensitive)
 *   +10  Weight > breed_average × 1.3        (heat_sensitive)
 *   +5   separation_anxiety >= 4              (general_sensitive)
 *   +15  Long-coat breed                       (heat_sensitive)
 *
 * Levels:
 *   0-29   LOW       (default monitoring)
 *   30-59  MEDIUM    (alert moderate weather events)
 *   60-89  HIGH      (alert minor events + proactive push)
 *   90+    CRITICAL  (alert mọi event, daily summary push)
 */
import { isBrachycephalic, brachycephalicMatch } from "./brachycephalic.ts";
import { isSenior, ageInYears } from "./senior.ts";
import { isLongCoat, longCoatMatch } from "./coat.ts";

export type SensitivityLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FactorCategory = "heat_sensitive" | "general_sensitive" | "storm_sensitive";

export interface Factor {
  key: string;
  label_vn: string;
  impact: number;
  category: FactorCategory;
}

export interface SensitivityResult {
  score: number;
  level: SensitivityLevel;
  factors: Factor[];
}

/** Pet data cần thiết cho calc (lấy từ Baserow row sau khi flatten). */
export interface PetSensitivityInput {
  species?: string | null; // EN "dog" | "cat" | "other"
  breed?: string | null;
  dob?: string | null;
  weight_kg?: number | string | null;
  fears?: string[] | null; // EN slugs
  separation_anxiety?: number | string | null;
}

/** Average weight per breed type (rough estimates kg). */
function getBreedAverageWeight(species: string | null | undefined, breed: string | null | undefined): number | null {
  if (!species) return null;
  const s = species.toLowerCase();
  const b = (breed || "").toLowerCase();
  // Rough heuristic — refine sau khi có data thật M9
  if (s === "cat" || s === "mèo") return 4.0; // 3-5kg typical
  if (s === "dog" || s === "chó") {
    if (b.includes("chihuahua") || b.includes("pomeranian") || b.includes("maltese")) return 3.0;
    if (b.includes("pug") || b.includes("shih tzu") || b.includes("yorkshire")) return 6.5;
    if (b.includes("phú quốc") || b.includes("corgi") || b.includes("bulldog")) return 12.0;
    if (b.includes("husky") || b.includes("labrador") || b.includes("golden")) return 28.0;
    if (b.includes("malamute") || b.includes("saint bernard")) return 50.0;
    return 12.0; // default medium dog
  }
  return null;
}

export function calculateSensitivity(pet: PetSensitivityInput, now: Date = new Date()): SensitivityResult {
  const factors: Factor[] = [];
  let score = 0;

  // Rule 1: Brachycephalic
  if (isBrachycephalic(pet.breed)) {
    const m = brachycephalicMatch(pet.breed);
    factors.push({
      key: "brachycephalic",
      label_vn: `Giống mặt ngắn${m ? ` (${m})` : ""}`,
      impact: 30,
      category: "heat_sensitive",
    });
    score += 30;
  }

  // Rule 2: Senior
  if (isSenior(pet.species, pet.dob, now)) {
    const yrs = ageInYears(pet.dob, now);
    factors.push({
      key: "senior",
      label_vn: `Cao tuổi (${yrs} năm)`,
      impact: 20,
      category: "general_sensitive",
    });
    score += 20;
  }

  // Rule 3: Fears thunder/fireworks
  const fears = pet.fears || [];
  const stormFears = fears.filter((f) => f === "thunder" || f === "fireworks");
  if (stormFears.length > 0) {
    factors.push({
      key: "storm_fears",
      label_vn: `Sợ ${stormFears.map((f) => (f === "thunder" ? "sấm" : "pháo")).join(" + ")}`,
      impact: 15,
      category: "storm_sensitive",
    });
    score += 15;
  }

  // Rule 4: Overweight (>30% above breed average)
  const weight = pet.weight_kg ? Number(pet.weight_kg) : null;
  const avg = getBreedAverageWeight(pet.species, pet.breed);
  if (weight && avg && weight > avg * 1.3) {
    factors.push({
      key: "overweight",
      label_vn: `Thừa cân (${weight}kg > avg ${avg}kg × 1.3)`,
      impact: 10,
      category: "heat_sensitive",
    });
    score += 10;
  }

  // Rule 5: Separation anxiety
  const sepAnx = pet.separation_anxiety ? Number(pet.separation_anxiety) : 0;
  if (sepAnx >= 4) {
    factors.push({
      key: "separation_anxiety",
      label_vn: `Lo xa chủ cao (${sepAnx}/5)`,
      impact: 5,
      category: "general_sensitive",
    });
    score += 5;
  }

  // Rule 6: Long coat
  if (isLongCoat(pet.breed)) {
    const m = longCoatMatch(pet.breed);
    factors.push({
      key: "long_coat",
      label_vn: `Lông dài${m ? ` (${m})` : ""}`,
      impact: 15,
      category: "heat_sensitive",
    });
    score += 15;
  }

  score = Math.min(100, score);

  let level: SensitivityLevel;
  if (score >= 90) level = "CRITICAL";
  else if (score >= 60) level = "HIGH";
  else if (score >= 30) level = "MEDIUM";
  else level = "LOW";

  return { score, level, factors };
}

/** Tổng hợp category flags từ factors (helper cho alert rules). */
export function summarizeCategories(result: SensitivityResult): {
  heat_sensitive: boolean;
  general_sensitive: boolean;
  storm_sensitive: boolean;
} {
  return {
    heat_sensitive: result.factors.some((f) => f.category === "heat_sensitive"),
    general_sensitive: result.factors.some((f) => f.category === "general_sensitive"),
    storm_sensitive: result.factors.some((f) => f.category === "storm_sensitive"),
  };
}
