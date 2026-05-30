/**
 * Zod schemas cho 7 profile sections của M3.5.
 * Mỗi section là partial — tất cả optional (vì user có thể skip & quay lại sau).
 * Backend validate input theo section_name param.
 */
import { z } from "zod";

// ===== Section 1: Identity =====
export const IdentitySectionSchema = z.object({
  nickname: z.string().trim().max(100).nullable().optional(),
  formal_name: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().min(1).max(100).optional(), // overlap với core, optional
  species: z.enum(["Chó", "Mèo"]).optional(),
  breed: z.string().trim().max(100).nullable().optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  age_estimation_method: z.enum(["exact", "vet_estimated", "owner_guess"]).nullable().optional(),
  gender: z.enum(["Đực", "Cái"]).nullable().optional(),
  neutered: z.boolean().nullable().optional(),
  neutered_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  weight_kg: z.number().positive().max(200).nullable().optional(),
  microchip_id: z.string().trim().max(50).nullable().optional(),
  registration_id: z.string().trim().max(50).nullable().optional(),
});

// ===== Section 2: Appearance =====
export const AppearanceSectionSchema = z.object({
  coat_color: z.string().trim().max(100).nullable().optional(),
  coat_pattern: z.enum(["solid", "spotted", "striped", "multicolor", "other"]).nullable().optional(),
  eye_color: z.string().trim().max(50).nullable().optional(),
  distinguishing_marks: z.string().trim().max(2000).nullable().optional(),
});

// ===== Section 3: Origin =====
export const OriginSectionSchema = z.object({
  origin_type: z.enum(["rescue", "pet_shop", "breeder", "friend", "found", "own_litter", "other"]).nullable().optional(),
  arrival_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  breeder_info: z.string().trim().max(200).nullable().optional(),
  has_pedigree: z.boolean().nullable().optional(),
  adoption_story: z.string().trim().max(5000).nullable().optional(),
});

// ===== Section 4: Health — uses separate sub-resource endpoints =====
// (vaccines, dewormers, allergies, health_events have their own POST/DELETE)
// Section save chỉ tham khảo, không lưu trực tiếp ở section endpoint.

// ===== Section 5: Diet =====
export const DietSectionSchema = z.object({
  diet_type: z.array(z.enum(["dry", "wet", "raw", "homemade", "mixed"])).max(5).nullable().optional(),
  diet_brand_primary: z.string().trim().max(100).nullable().optional(),
  meals_per_day: z.number().int().min(1).max(6).nullable().optional(),
  portion_grams: z.number().int().min(1).max(2000).nullable().optional(),
  daily_water_ml: z.number().int().min(0).max(10000).nullable().optional(),
});

// ===== Section 6: Personality =====
const RatingField = z.number().int().min(1).max(5).nullable().optional();

export const PersonalitySectionSchema = z.object({
  personality_archetype: z
    .array(z.enum(["explorer", "friendly", "shy", "lazy", "smart", "stubborn", "cuddler", "athlete"]))
    .max(3)
    .nullable()
    .optional(),
  energy_level: RatingField,
  friendliness_strangers: RatingField,
  friendliness_other_pets: RatingField,
  noise_sensitivity: RatingField,
  handling_tolerance: RatingField,
  trainability: RatingField,
  separation_anxiety: RatingField,
  favorite_activities: z
    .array(
      z.enum([
        "play_human",
        "run_outdoor",
        "swim",
        "dig",
        "window_watch",
        "chase_insects",
        "sleep",
        "sunbathe",
        "hide",
        "scratch_post",
      ])
    )
    .max(10)
    .nullable()
    .optional(),
  favorite_toys: z.string().trim().max(2000).nullable().optional(),
  fears: z
    .array(z.enum(["fireworks", "thunder", "vacuum", "bath", "vet", "car_rides", "alone", "strangers", "children", "other"]))
    .max(10)
    .nullable()
    .optional(),
  vocalization_notes: z.string().trim().max(2000).nullable().optional(),
});

// ===== Section 7: Lifestyle =====
export const LifestyleSectionSchema = z.object({
  sleep_location: z.enum(["owner_bed", "sofa", "own_bed", "kennel", "outdoor"]).nullable().optional(),
  has_fixed_meal_schedule: z.boolean().nullable().optional(),
  bathroom_location: z.enum(["indoor_pad", "outdoor", "litter_box", "mixed"]).nullable().optional(),
  walk_frequency: z.enum(["daily", "weekly_few", "rarely", "never"]).nullable().optional(),
  bath_frequency: z.enum(["weekly", "biweekly", "monthly", "rarely"]).nullable().optional(),
  travels_with_owner: z.boolean().nullable().optional(),
  caregiver_when_away: z.string().trim().max(200).nullable().optional(),
});

// ===== Section 8: Emergency =====
export const EmergencySectionSchema = z.object({
  primary_vet_name: z.string().trim().max(200).nullable().optional(),
  primary_clinic_name: z.string().trim().max(200).nullable().optional(),
  primary_vet_phone: z.string().trim().max(30).nullable().optional(),
  emergency_contact_name: z.string().trim().max(200).nullable().optional(),
  emergency_contact_relation: z.string().trim().max(100).nullable().optional(),
  emergency_contact_phone: z.string().trim().max(30).nullable().optional(),
  special_notes_for_vet: z.string().trim().max(5000).nullable().optional(),
  insurance_provider: z.string().trim().max(200).nullable().optional(),
  insurance_policy_number: z.string().trim().max(100).nullable().optional(),
});

// ===== Photo upload =====
export const PhotoTypeSchema = z.enum([
  "face",
  "profile",
  "full_body",
  "marks",
  "eye_close_up",
  "nose_print",
  "general",
]);

// ===== Section name dispatcher =====
export const SECTION_SCHEMAS = {
  identity: IdentitySectionSchema,
  appearance: AppearanceSectionSchema,
  origin: OriginSectionSchema,
  diet: DietSectionSchema,
  personality: PersonalitySectionSchema,
  lifestyle: LifestyleSectionSchema,
  emergency: EmergencySectionSchema,
} as const;

export type SectionName = keyof typeof SECTION_SCHEMAS;

export type IdentitySection = z.infer<typeof IdentitySectionSchema>;
export type AppearanceSection = z.infer<typeof AppearanceSectionSchema>;
export type OriginSection = z.infer<typeof OriginSectionSchema>;
export type DietSection = z.infer<typeof DietSectionSchema>;
export type PersonalitySection = z.infer<typeof PersonalitySectionSchema>;
export type LifestyleSection = z.infer<typeof LifestyleSectionSchema>;
export type EmergencySection = z.infer<typeof EmergencySectionSchema>;

// ===== Sub-resource schemas (health records) =====
// Baserow schema dùng EN options từ setup-baserow.ts. API contract VN, mapper ở enum-mappers.ts.

// vaccines.vaccine_type Baserow options: 5-in-1, 7-in-1, rabies, feline-3, feline-4, felv
// Phase 0 chấp nhận EN values trực tiếp (frontend autocomplete map VN label → EN)
export const VaccineCreateSchema = z.object({
  vaccine_type: z.enum(["5-in-1", "7-in-1", "rabies", "feline-3", "feline-4", "felv"]),
  brand: z.string().trim().max(100).nullable().optional(),
  dose_number: z.number().int().min(1).max(20).nullable().optional(),
  administered_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  clinic_name: z.string().trim().max(200).nullable().optional(),
  batch_number: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

// dewormers.type Baserow: internal, external, both
export const DewormerCreateSchema = z.object({
  product_name: z.string().trim().min(1).max(100),
  type: z.enum(["internal", "external", "both"]),
  administered_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dosage: z.string().trim().max(100).nullable().optional(),
});

// allergies_diet.type Baserow: allergy, dislike, loves, forbidden
// allergies_diet.severity Baserow: mild, moderate, severe
export const AllergyCreateSchema = z.object({
  item: z.string().trim().min(1).max(200),
  type: z.enum(["allergy", "dislike", "loves", "forbidden"]),
  severity: z.enum(["mild", "moderate", "severe"]).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

// health_events.event_type Baserow: illness, injury, vet_visit, surgery, medication
export const HealthEventCreateSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  event_type: z.enum(["illness", "injury", "vet_visit", "surgery", "medication"]),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vet_name: z.string().trim().max(200).nullable().optional(),
  clinic_name: z.string().trim().max(200).nullable().optional(),
  cost_vnd: z.number().nonnegative().nullable().optional(),
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
