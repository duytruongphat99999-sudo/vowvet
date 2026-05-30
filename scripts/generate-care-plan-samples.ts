/**
 * Generate sample Care Plans for clinical safety review.
 *
 * ⚠️ EXECUTION REQUIREMENTS (read before running):
 *   1. Costs ~10× Gemini Flash API calls (~$0.05–$0.15 USD total at current pricing)
 *   2. Requires existing pet IDs in Baserow — does NOT seed fake test pets
 *   3. The real `generateCarePlanV2(petId, userId, options)` signature reads
 *      pet attributes (species, breed, dob, weight_kg, …) from the live `pets`
 *      table — it does NOT accept a mock pet-profile object as input.
 *
 * To get full clinical coverage (kitten / senior / pregnant / diabetic / etc),
 * seed diverse test pets first via the onboarding flow OR via direct Baserow
 * inserts, then list their petIds in PET_IDS_TO_SAMPLE below.
 *
 * The fallback is to run on whatever pets exist in the system today — useful
 * for "sanity check the engine still works" but NOT comprehensive coverage.
 *
 * Run:
 *   docker exec vowvet-api bun run /tmp/generate-care-plan-samples.ts > samples.json
 *   docker cp vowvet-api:/tmp/samples.json ./samples.json
 */
// Note: must use relative paths (not @shared/* alias) because bun resolves
// path aliases from the tsconfig.json closest to the SCRIPT FILE — and this
// file lives at /app/scripts/ inside the container, which has no tsconfig.
// The @shared/* alias only works for files under /app/api/ where tsconfig.json
// declares paths: { "@shared/*": ["../shared/*"] }.
import { listRows } from "../shared/baserow.ts";
import { generateCarePlanV2 } from "../api/src/lib/care-planner-v2.ts";
import { validateCarePlanSafety } from "../shared/care-plan-safety.ts";

// EDIT THIS LIST to target specific test pets. Set to `[]` to auto-pick the
// first 10 pets in the database.
const PET_IDS_TO_SAMPLE: number[] = [];
const FALLBACK_LIMIT = 10;

interface SampleResult {
  pet_id: number;
  pet_name: string;
  species: string;
  breed: string | null;
  age_label: string;
  generated_plan: any;
  safety_validation: any;
  duration_ms: number;
  timestamp: string;
  error?: string;
}

const results: SampleResult[] = [];

// Fetch pets directly — first listRows result already contains user_id link_row.
let pets: any[] = [];
if (PET_IDS_TO_SAMPLE.length === 0) {
  console.log(`[samples] PET_IDS_TO_SAMPLE empty — auto-picking first ${FALLBACK_LIMIT} pets...`);
  const res = await listRows<any>("pets", { size: FALLBACK_LIMIT });
  pets = res.results;
} else {
  // Targeted IDs — fetch ALL pets then filter (simpler than per-id queries).
  const res = await listRows<any>("pets", { size: 200 });
  pets = res.results.filter((p: any) => PET_IDS_TO_SAMPLE.includes(p.id));
}

console.log(`[samples] Generating care plans for ${pets.length} pets...`);

for (const pet of pets) {
  const t0 = Date.now();
  const petId = pet.id;
  console.log(`[samples] pet ${petId} (${pet.name}) ...`);
  try {
    const userIdLink = Array.isArray(pet.user_id) ? pet.user_id[0]?.id : null;
    if (!userIdLink) {
      results.push({
        pet_id: petId, pet_name: pet.name || "?", species: String(pet.species?.value || pet.species || "?"),
        breed: pet.breed || null, age_label: pet.dob || "?",
        generated_plan: null, safety_validation: null,
        duration_ms: Date.now() - t0, timestamp: new Date().toISOString(),
        error: "Pet has no user_id link",
      });
      continue;
    }

    const plan = await generateCarePlanV2(petId, userIdLink, { force_refresh: true });
    const speciesStr = String(pet.species?.value || pet.species || "other").toLowerCase();
    const validation = validateCarePlanSafety(plan, speciesStr);

    results.push({
      pet_id: petId,
      pet_name: pet.name || "?",
      species: speciesStr,
      breed: pet.breed || null,
      age_label: pet.dob || "?",
      generated_plan: plan,
      safety_validation: validation,
      duration_ms: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
    console.log(`  ✓ done in ${Date.now() - t0}ms`);
  } catch (err: any) {
    console.error(`  ✗ error:`, err?.message || err);
    results.push({
      pet_id: petId, pet_name: "?", species: "?", breed: null, age_label: "?",
      generated_plan: null, safety_validation: null,
      duration_ms: Date.now() - t0, timestamp: new Date().toISOString(),
      error: String(err?.message || err),
    });
  }
}

console.log(`\n[samples] Done. ${results.length} plans generated. Total errors: ${results.filter(r => r.error).length}`);

// Print results as JSON for piping to file
console.log(JSON.stringify(results, null, 2));
