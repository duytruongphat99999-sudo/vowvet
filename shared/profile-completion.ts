/**
 * Profile completion calculator cho pet (M3.5).
 *
 * Formula:
 *   section_pct = 60 × (required_filled / required_total)
 *               + 40 × (optional_filled / optional_total)
 *
 *   total_pct = round(Σ (section_pct × section_weight) / 100)
 *
 * "Section complete" badge = all required fields filled (regardless of optional).
 * Badge sàn:
 *   🥉 Basic:    total ≥ 40
 *   🥈 Health:   total ≥ 70 AND health section complete
 *   🥇 Complete: total ≥ 95 AND all 8 sections complete
 */

// Weights phải tổng = 100
export const SECTION_WEIGHTS = {
  identity: 25,
  appearance: 15,
  origin: 5,
  diet: 10,
  personality: 15,
  lifestyle: 5,
  emergency: 10,
  health: 15,
} as const;

export type SectionName = keyof typeof SECTION_WEIGHTS;
export const SECTION_NAMES: SectionName[] = [
  "identity",
  "appearance",
  "origin",
  "diet",
  "personality",
  "lifestyle",
  "emergency",
  "health",
];

export interface SectionResult {
  pct: number; // 0-100 (rounded)
  complete: boolean;
  missing_required: string[];
  filled_required: number;
  total_required: number;
  filled_optional: number;
  total_optional: number;
}

export interface CompletionResult {
  pct: number; // 0-100 total
  sections: Record<SectionName, SectionResult>;
  missing_required: string[]; // flatten across all sections
  next_section_suggested: SectionName | null;
  badge: "complete" | "health" | "basic" | null;
}

/** Pet object cần đủ field từ Baserow để check. Optional fields nullable. */
export interface PetData {
  // Core identity
  name?: string | null;
  species?: string | { value: string } | null;
  breed?: string | null;
  breed_secondary?: string | null;
  dob?: string | null;
  gender?: string | { value: string } | null;
  weight_kg?: number | string | null;

  // Identity ext
  nickname?: string | null;
  formal_name?: string | null;
  age_estimation_method?: string | { value: string } | null;
  neutered?: boolean | null;
  neutered_date?: string | null;
  microchip_id?: string | null;
  registration_id?: string | null;

  // Appearance
  coat_color?: string | null;
  coat_pattern?: string | { value: string } | null;
  eye_color?: string | null;
  distinguishing_marks?: string | null;

  // Origin
  origin_type?: string | { value: string } | null;
  arrival_date?: string | null;
  breeder_info?: string | null;
  has_pedigree?: boolean | null;
  adoption_story?: string | null;

  // Diet
  diet_type?: Array<{ value: string }> | string[] | null;
  diet_brand_primary?: string | null;
  meals_per_day?: number | string | null;
  portion_grams?: number | string | null;
  daily_water_ml?: number | string | null;

  // Personality
  personality_archetype?: Array<{ value: string }> | string[] | null;
  energy_level?: number | string | null;
  friendliness_strangers?: number | string | null;
  friendliness_other_pets?: number | string | null;
  noise_sensitivity?: number | string | null;
  handling_tolerance?: number | string | null;
  trainability?: number | string | null;
  separation_anxiety?: number | string | null;
  favorite_activities?: Array<{ value: string }> | string[] | null;
  favorite_toys?: string | null;
  fears?: Array<{ value: string }> | string[] | null;
  vocalization_notes?: string | null;

  // Lifestyle
  sleep_location?: string | { value: string } | null;
  has_fixed_meal_schedule?: boolean | null;
  bathroom_location?: string | { value: string } | null;
  walk_frequency?: string | { value: string } | null;
  bath_frequency?: string | { value: string } | null;
  travels_with_owner?: boolean | null;
  caregiver_when_away?: string | null;

  // Emergency
  primary_vet_name?: string | null;
  primary_clinic_name?: string | null;
  primary_vet_phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relation?: string | null;
  emergency_contact_phone?: string | null;
  special_notes_for_vet?: string | null;
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
}

export interface ExternalData {
  /** Set các photo_type đã upload cho pet này. */
  photoTypes: Set<string>;
  /** Số records trong các sub-tables. */
  healthCounts: { vaccines: number; dewormers: number; allergies: number; events: number };
}

// ============================================================
// Helpers
// ============================================================

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return !Number.isNaN(v);
  if (typeof v === "object" && "value" in (v as any)) {
    return isFilled((v as any).value);
  }
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function ratingFilled(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return !Number.isNaN(n) && n >= 1 && n <= 5;
}

function combine(filledRequired: number, totalRequired: number, filledOptional: number, totalOptional: number): number {
  const reqPct = totalRequired > 0 ? filledRequired / totalRequired : 1;
  const optPct = totalOptional > 0 ? filledOptional / totalOptional : 0;
  return Math.round(reqPct * 60 + optPct * 40);
}

function makeSection(
  required: Array<{ name: string; filled: boolean }>,
  optional: Array<{ name: string; filled: boolean }>
): SectionResult {
  const filledRequired = required.filter((r) => r.filled).length;
  const filledOptional = optional.filter((o) => o.filled).length;
  return {
    pct: combine(filledRequired, required.length, filledOptional, optional.length),
    complete: filledRequired === required.length,
    missing_required: required.filter((r) => !r.filled).map((r) => r.name),
    filled_required: filledRequired,
    total_required: required.length,
    filled_optional: filledOptional,
    total_optional: optional.length,
  };
}

// ============================================================
// Per-section calculators
// ============================================================

function calcIdentity(pet: PetData): SectionResult {
  const required = [
    { name: "name", filled: isFilled(pet.name) },
    { name: "species", filled: isFilled(pet.species) },
    { name: "gender", filled: isFilled(pet.gender) },
    {
      name: "dob_or_age_estimation",
      filled: isFilled(pet.dob) || isFilled(pet.age_estimation_method),
    },
  ];
  const optional: Array<{ name: string; filled: boolean }> = [
    { name: "nickname", filled: isFilled(pet.nickname) },
    { name: "formal_name", filled: isFilled(pet.formal_name) },
    { name: "breed", filled: isFilled(pet.breed) },
    { name: "weight_kg", filled: isFilled(pet.weight_kg) },
    { name: "neutered_flag", filled: pet.neutered != null }, // boolean set = filled
    { name: "microchip_id", filled: isFilled(pet.microchip_id) },
    { name: "registration_id", filled: isFilled(pet.registration_id) },
  ];
  if (pet.neutered === true) {
    optional.push({ name: "neutered_date", filled: isFilled(pet.neutered_date) });
  }
  return makeSection(required, optional);
}

function calcAppearance(pet: PetData, ext: ExternalData): SectionResult {
  const required = [
    { name: "coat_color", filled: isFilled(pet.coat_color) },
    { name: "photo_face", filled: ext.photoTypes.has("face") },
  ];
  const optional = [
    { name: "coat_pattern", filled: isFilled(pet.coat_pattern) },
    { name: "eye_color", filled: isFilled(pet.eye_color) },
    { name: "distinguishing_marks", filled: isFilled(pet.distinguishing_marks) },
  ];
  return makeSection(required, optional);
}

function calcOrigin(pet: PetData): SectionResult {
  const required = [
    { name: "origin_type", filled: isFilled(pet.origin_type) },
    { name: "arrival_date", filled: isFilled(pet.arrival_date) },
  ];
  const optional = [
    { name: "breeder_info", filled: isFilled(pet.breeder_info) },
    { name: "has_pedigree_flag", filled: pet.has_pedigree != null },
    { name: "adoption_story", filled: isFilled(pet.adoption_story) },
  ];
  return makeSection(required, optional);
}

function calcDiet(pet: PetData): SectionResult {
  const required = [
    { name: "diet_type", filled: isFilled(pet.diet_type) },
    { name: "diet_brand_primary", filled: isFilled(pet.diet_brand_primary) },
  ];
  const optional = [
    { name: "meals_per_day", filled: isFilled(pet.meals_per_day) },
    { name: "portion_grams", filled: isFilled(pet.portion_grams) },
    { name: "daily_water_ml", filled: isFilled(pet.daily_water_ml) },
  ];
  return makeSection(required, optional);
}

function calcPersonality(pet: PetData): SectionResult {
  // 7 ratings — required >= 4
  const ratings = [
    pet.energy_level,
    pet.friendliness_strangers,
    pet.friendliness_other_pets,
    pet.noise_sensitivity,
    pet.handling_tolerance,
    pet.trainability,
    pet.separation_anxiety,
  ];
  const ratingsFilledCount = ratings.filter(ratingFilled).length;

  const required = [
    { name: "personality_archetype", filled: isFilled(pet.personality_archetype) },
    { name: "ratings_min_4", filled: ratingsFilledCount >= 4 },
  ];
  const optional = [
    { name: "all_ratings_filled", filled: ratingsFilledCount === 7 },
    { name: "favorite_activities", filled: isFilled(pet.favorite_activities) },
    { name: "favorite_toys", filled: isFilled(pet.favorite_toys) },
    { name: "fears", filled: isFilled(pet.fears) },
    { name: "vocalization_notes", filled: isFilled(pet.vocalization_notes) },
  ];
  return makeSection(required, optional);
}

function calcLifestyle(pet: PetData): SectionResult {
  const required = [
    { name: "sleep_location", filled: isFilled(pet.sleep_location) },
    { name: "bathroom_location", filled: isFilled(pet.bathroom_location) },
  ];
  const optional = [
    { name: "has_fixed_meal_schedule_flag", filled: pet.has_fixed_meal_schedule != null },
    { name: "walk_frequency", filled: isFilled(pet.walk_frequency) },
    { name: "bath_frequency", filled: isFilled(pet.bath_frequency) },
    { name: "travels_with_owner_flag", filled: pet.travels_with_owner != null },
    { name: "caregiver_when_away", filled: isFilled(pet.caregiver_when_away) },
  ];
  return makeSection(required, optional);
}

function calcEmergency(pet: PetData): SectionResult {
  const required = [
    {
      name: "vet_phone_or_emergency_phone",
      filled: isFilled(pet.primary_vet_phone) || isFilled(pet.emergency_contact_phone),
    },
  ];
  const optional = [
    { name: "primary_vet_name", filled: isFilled(pet.primary_vet_name) },
    { name: "primary_clinic_name", filled: isFilled(pet.primary_clinic_name) },
    { name: "emergency_contact_name", filled: isFilled(pet.emergency_contact_name) },
    { name: "emergency_contact_relation", filled: isFilled(pet.emergency_contact_relation) },
    { name: "special_notes_for_vet", filled: isFilled(pet.special_notes_for_vet) },
    { name: "insurance_provider", filled: isFilled(pet.insurance_provider) },
    { name: "insurance_policy_number", filled: isFilled(pet.insurance_policy_number) },
  ];
  return makeSection(required, optional);
}

function calcHealth(ext: ExternalData): SectionResult {
  const total = ext.healthCounts.vaccines + ext.healthCounts.dewormers + ext.healthCounts.allergies + ext.healthCounts.events;
  const required = [{ name: "any_health_record", filled: total >= 1 }];
  const optional = [
    { name: "vaccine_recorded", filled: ext.healthCounts.vaccines >= 1 },
    { name: "dewormer_recorded", filled: ext.healthCounts.dewormers >= 1 },
    { name: "allergy_recorded", filled: ext.healthCounts.allergies >= 1 },
    { name: "event_recorded", filled: ext.healthCounts.events >= 1 },
  ];
  return makeSection(required, optional);
}

// ============================================================
// Main calculator
// ============================================================

export function calculateCompletion(pet: PetData, ext: ExternalData): CompletionResult {
  const sections: Record<SectionName, SectionResult> = {
    identity: calcIdentity(pet),
    appearance: calcAppearance(pet, ext),
    origin: calcOrigin(pet),
    diet: calcDiet(pet),
    personality: calcPersonality(pet),
    lifestyle: calcLifestyle(pet),
    emergency: calcEmergency(pet),
    health: calcHealth(ext),
  };

  // Weighted total
  let total = 0;
  for (const name of SECTION_NAMES) {
    total += (sections[name].pct * SECTION_WEIGHTS[name]) / 100;
  }
  const pct = Math.round(total);

  // Aggregate missing required (prefix with section name)
  const missing_required: string[] = [];
  for (const name of SECTION_NAMES) {
    for (const m of sections[name].missing_required) {
      missing_required.push(`${name}.${m}`);
    }
  }

  // Next section suggestion: lowest pct that is not complete
  let next: SectionName | null = null;
  let lowestPct = 101;
  for (const name of SECTION_NAMES) {
    if (!sections[name].complete && sections[name].pct < lowestPct) {
      lowestPct = sections[name].pct;
      next = name;
    }
  }

  // Badge
  let badge: CompletionResult["badge"] = null;
  if (pct >= 95 && SECTION_NAMES.every((n) => sections[n].complete)) {
    badge = "complete";
  } else if (pct >= 70 && sections.health.complete) {
    badge = "health";
  } else if (pct >= 40) {
    badge = "basic";
  }

  return {
    pct,
    sections,
    missing_required,
    next_section_suggested: next,
    badge,
  };
}
