/**
 * Zod schemas cho M7 Nutrition.
 */
import { z } from "zod";

// Weight log create
export const WeightLogCreateSchema = z.object({
  weight_kg: z.number().positive().max(200),
  body_condition_score: z.number().int().min(1).max(9).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

// Activity level enum
export const ActivityLevelSchema = z.enum([
  "sedentary",
  "low",
  "moderate",
  "active",
  "very_active",
]);

// Life stage enum
export const LifeStageSchema = z.enum(["puppy", "junior", "adult", "senior", "geriatric"]);

// Food intolerance severity
export const FoodIntoleranceSeveritySchema = z.enum(["mild", "moderate", "severe"]);

// Body condition score
export const BCSSchema = z.number().int().min(1).max(9);

// Brand species filter
export const BrandSpeciesFilterSchema = z.enum(["dog", "cat", "both"]);

// Brand life_stage filter
export const BrandLifeStageFilterSchema = z.enum(["puppy", "adult", "senior", "all"]);

// Allergen codes (M7)
export const AllergenCodeSchema = z.enum([
  "chicken",
  "beef",
  "fish",
  "dairy",
  "egg",
  "soy",
  "grain",
  "shellfish",
  "peanut",
]);

// Brand check compatibility request (no body, just path params)

// Brand response shape
export const FoodBrandSchema = z.object({
  brand_id: z.number(),
  brand_name: z.string(),
  product_line: z.string().nullable(),
  species: z.enum(["dog", "cat", "both"]),
  life_stage: z.enum(["puppy", "adult", "senior", "all"]),
  protein_pct: z.number().nullable(),
  fat_pct: z.number().nullable(),
  fiber_pct: z.number().nullable(),
  carb_pct_calculated: z.number().nullable(),
  calories_per_100g: z.number().nullable(),
  price_vnd_per_kg: z.number().nullable(),
  contains_allergens: z.array(z.string()).default([]),
  mon_min_recommended: z.boolean(),
  vn_availability: z.boolean(),
});

export type WeightLogCreate = z.infer<typeof WeightLogCreateSchema>;
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;
export type LifeStage = z.infer<typeof LifeStageSchema>;
