/**
 * M3.5 migration: Comprehensive Pet Profile schema.
 *
 * Idempotent — re-run an toàn (skip nếu field/table đã tồn tại).
 * Pre/post count rows pets để verify không mất data.
 *
 * Yêu cầu env (set tạm khi run, KHÔNG commit):
 *   BASEROW_USER_EMAIL, BASEROW_USER_PASSWORD
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-pets-v2.ts
 *   Remove-Item Env:BASEROW_USER_EMAIL
 *   Remove-Item Env:BASEROW_USER_PASSWORD
 *
 * Changes:
 *   pets table:        thêm 50 fields mới (Identity ext + Appearance + Origin +
 *                      Diet + Personality + Lifestyle + Emergency + completion)
 *   pet_photos table:  tạo mới với 6 fields
 *   profile_completion_pct: re-calc cho rows hiện có (legacy → low %)
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL hoặc BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      "  bun run scripts/migrate-pets-v2.ts"
  );
  process.exit(1);
}

console.log(`[migrate-v2] Logging in to ${BASEROW_URL}...`);
const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error("❌ Login failed:", await loginRes.text());
  process.exit(1);
}
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };
console.log("[migrate-v2] Logged in.\n");

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `JWT ${JWT}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${init.method || "GET"} ${path} → ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef {
  id: number;
  name: string;
  type: string;
  primary?: boolean;
  select_options?: Array<{ id: number; value: string; color: string }>;
}

interface TableDef {
  id: number;
  name: string;
}

async function listFields(tableId: number): Promise<FieldDef[]> {
  return api<FieldDef[]>(`/database/fields/table/${tableId}/`);
}

async function createField(tableId: number, data: Record<string, unknown>): Promise<FieldDef> {
  return api<FieldDef>(`/database/fields/table/${tableId}/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function patchField(fieldId: number, data: Record<string, unknown>): Promise<FieldDef> {
  return api<FieldDef>(`/database/fields/${fieldId}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

async function listTables(databaseId: number): Promise<TableDef[]> {
  return api<TableDef[]>(`/database/tables/database/${databaseId}/`);
}

async function createTable(databaseId: number, name: string): Promise<TableDef> {
  return api<TableDef>(`/database/tables/database/${databaseId}/`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

async function listRows(tableId: number): Promise<{ count: number; results: any[] }> {
  return api(`/database/rows/table/${tableId}/?user_field_names=true&size=200`);
}

async function updateRow(tableId: number, rowId: number, data: Record<string, unknown>): Promise<any> {
  return api(`/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ============================================================
// FIELD SPECS
// ============================================================

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;

const opt = (value: string, color = "blue") => ({ value, color });

// Mỗi entry: name, baserow field type, options nếu single/multi_select
const NEW_PETS_FIELDS: Array<Record<string, unknown>> = [
  // ===== Identity Extension =====
  { name: "nickname", type: "text" },
  { name: "formal_name", type: "text" },
  {
    name: "age_estimation_method",
    type: "single_select",
    select_options: [opt("exact", "green"), opt("vet_estimated", "blue"), opt("owner_guess", "orange")],
  },
  { name: "neutered", type: "boolean", boolean_default: false },
  { name: "neutered_date", type: "date" },
  { name: "microchip_id", type: "text" },
  { name: "registration_id", type: "text" },

  // ===== Appearance =====
  { name: "coat_color", type: "text" },
  {
    name: "coat_pattern",
    type: "single_select",
    select_options: [
      opt("solid", "light-blue"),
      opt("spotted", "yellow"),
      opt("striped", "orange"),
      opt("multicolor", "purple"),
      opt("other", "gray"),
    ],
  },
  { name: "eye_color", type: "text" },
  { name: "distinguishing_marks", type: "long_text" },

  // ===== Origin =====
  {
    name: "origin_type",
    type: "single_select",
    select_options: [
      opt("rescue", "green"),
      opt("pet_shop", "pink"),
      opt("breeder", "blue"),
      opt("friend", "yellow"),
      opt("found", "orange"),
      opt("own_litter", "purple"),
      opt("other", "gray"),
    ],
  },
  { name: "arrival_date", type: "date" },
  { name: "breeder_info", type: "text" },
  { name: "has_pedigree", type: "boolean", boolean_default: false },
  { name: "adoption_story", type: "long_text" },

  // ===== Diet =====
  {
    name: "diet_type",
    type: "multiple_select",
    select_options: [
      opt("dry", "yellow"),
      opt("wet", "blue"),
      opt("raw", "red"),
      opt("homemade", "green"),
      opt("mixed", "purple"),
    ],
  },
  { name: "diet_brand_primary", type: "text" },
  { name: "meals_per_day", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "portion_grams", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "daily_water_ml", type: "number", number_decimal_places: 0, number_negative: false },

  // ===== Personality =====
  {
    name: "personality_archetype",
    type: "multiple_select",
    select_options: [
      opt("explorer", "orange"),
      opt("friendly", "pink"),
      opt("shy", "gray"),
      opt("lazy", "blue"),
      opt("smart", "purple"),
      opt("stubborn", "red"),
      opt("cuddler", "light-pink"),
      opt("athlete", "green"),
    ],
  },
  { name: "energy_level", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "friendliness_strangers", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "friendliness_other_pets", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "noise_sensitivity", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "handling_tolerance", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "trainability", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "separation_anxiety", type: "number", number_decimal_places: 0, number_negative: false },
  {
    name: "favorite_activities",
    type: "multiple_select",
    select_options: [
      opt("play_human", "pink"),
      opt("run_outdoor", "green"),
      opt("swim", "blue"),
      opt("dig", "brown"),
      opt("window_watch", "yellow"),
      opt("chase_insects", "orange"),
      opt("sleep", "gray"),
      opt("sunbathe", "yellow"),
      opt("hide", "purple"),
      opt("scratch_post", "red"),
    ],
  },
  { name: "favorite_toys", type: "long_text" },
  {
    name: "fears",
    type: "multiple_select",
    select_options: [
      opt("fireworks", "red"),
      opt("thunder", "gray"),
      opt("vacuum", "blue"),
      opt("bath", "light-blue"),
      opt("vet", "orange"),
      opt("car_rides", "yellow"),
      opt("alone", "purple"),
      opt("strangers", "pink"),
      opt("children", "green"),
      opt("other", "gray"),
    ],
  },
  { name: "vocalization_notes", type: "long_text" },

  // ===== Lifestyle =====
  {
    name: "sleep_location",
    type: "single_select",
    select_options: [
      opt("owner_bed", "pink"),
      opt("sofa", "yellow"),
      opt("own_bed", "blue"),
      opt("kennel", "orange"),
      opt("outdoor", "green"),
    ],
  },
  { name: "has_fixed_meal_schedule", type: "boolean", boolean_default: false },
  {
    name: "bathroom_location",
    type: "single_select",
    select_options: [
      opt("indoor_pad", "blue"),
      opt("outdoor", "green"),
      opt("litter_box", "orange"),
      opt("mixed", "purple"),
    ],
  },
  {
    name: "walk_frequency",
    type: "single_select",
    select_options: [
      opt("daily", "green"),
      opt("weekly_few", "yellow"),
      opt("rarely", "orange"),
      opt("never", "gray"),
    ],
  },
  {
    name: "bath_frequency",
    type: "single_select",
    select_options: [
      opt("weekly", "green"),
      opt("biweekly", "yellow"),
      opt("monthly", "orange"),
      opt("rarely", "gray"),
    ],
  },
  { name: "travels_with_owner", type: "boolean", boolean_default: false },
  { name: "caregiver_when_away", type: "text" },

  // ===== Emergency =====
  { name: "primary_vet_name", type: "text" },
  { name: "primary_clinic_name", type: "text" },
  { name: "primary_vet_phone", type: "text" },
  { name: "emergency_contact_name", type: "text" },
  { name: "emergency_contact_relation", type: "text" },
  { name: "emergency_contact_phone", type: "text" },
  { name: "special_notes_for_vet", type: "long_text" },
  { name: "insurance_provider", type: "text" },
  { name: "insurance_policy_number", type: "text" },

  // ===== Computed =====
  {
    name: "profile_completion_pct",
    type: "number",
    number_decimal_places: 0,
    number_negative: false,
  },
];

// Fields cho pet_photos table mới
const PET_PHOTOS_FIELDS: Array<Record<string, unknown>> = [
  // photo_url sẽ là primary field, rename auto-created field
  {
    name: "photo_type",
    type: "single_select",
    select_options: [
      opt("face", "pink"),
      opt("profile", "blue"),
      opt("full_body", "green"),
      opt("marks", "yellow"),
      opt("eye_close_up", "purple"),
      opt("nose_print", "orange"),
      opt("general", "gray"),
    ],
  },
  { name: "caption", type: "text" },
  { name: "uploaded_at", type: "created_on" },
  { name: "is_primary", type: "boolean", boolean_default: false },
];

// ============================================================
// MIGRATION EXECUTION
// ============================================================

// Step 1: Pre-count
const preCount = await listRows(PETS_TABLE);
console.log(`Pre-migration: ${preCount.count} pets rows`);
const existingPetIds = preCount.results.map((r: any) => ({
  id: r.id,
  name: r.name,
}));
console.log(`  existing: ${existingPetIds.map((p) => `id=${p.id} "${p.name}"`).join(", ")}\n`);

// Step 2: Add fields to pets (idempotent)
console.log("[migrate-v2] Adding fields to pets table...");
const existingPetsFields = await listFields(PETS_TABLE);
const existingPetsFieldNames = new Set(existingPetsFields.map((f) => f.name));

let added = 0;
let skipped = 0;
for (const fieldDef of NEW_PETS_FIELDS) {
  const name = fieldDef.name as string;
  if (existingPetsFieldNames.has(name)) {
    skipped++;
    continue;
  }
  await createField(PETS_TABLE, fieldDef);
  added++;
  console.log(`  + ${name} (${fieldDef.type})`);
}
console.log(`[migrate-v2] pets fields: +${added} added, ${skipped} skipped (already exist)\n`);

// Step 3: Create pet_photos table (idempotent)
const tables = await listTables(DATABASE_ID);
let petPhotosTable = tables.find((t) => t.name === "pet_photos");
if (!petPhotosTable) {
  console.log("[migrate-v2] Creating pet_photos table...");
  petPhotosTable = await createTable(DATABASE_ID, "pet_photos");
  console.log(`  table id=${petPhotosTable.id}`);

  // Baserow auto-creates a primary field "Name" — rename to photo_url
  const initialFields = await listFields(petPhotosTable.id);
  const primary = initialFields.find((f) => (f as any).primary === true) || initialFields[0];
  if (primary && primary.name !== "photo_url") {
    await patchField(primary.id, { name: "photo_url", type: "text" });
    console.log(`  ✓ renamed primary field → photo_url`);
  }

  // Add pet_id link_row (linking back to pets table)
  await createField(petPhotosTable.id, {
    name: "pet_id",
    type: "link_row",
    link_row_table_id: PETS_TABLE,
  });
  console.log(`  + pet_id (link_row → pets)`);

  // Add remaining fields
  for (const fieldDef of PET_PHOTOS_FIELDS) {
    await createField(petPhotosTable.id, fieldDef);
    console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
  }
} else {
  console.log(`[migrate-v2] pet_photos table already exists (id=${petPhotosTable.id})`);
  // Ensure all fields exist (idempotent for partial-prior runs)
  const existing = await listFields(petPhotosTable.id);
  const existingNames = new Set(existing.map((f) => f.name));
  for (const fieldDef of PET_PHOTOS_FIELDS) {
    const name = fieldDef.name as string;
    if (!existingNames.has(name)) {
      await createField(petPhotosTable.id, fieldDef);
      console.log(`  + adding missing field ${name}`);
    }
  }
  // Ensure pet_id link_row exists
  if (!existingNames.has("pet_id")) {
    await createField(petPhotosTable.id, {
      name: "pet_id",
      type: "link_row",
      link_row_table_id: PETS_TABLE,
    });
    console.log(`  + adding missing pet_id link_row`);
  }
}
console.log();

// Step 4: Re-read field IDs để cập nhật baserow-config.json
const newPetsFields = await listFields(PETS_TABLE);
const newPhotosFields = await listFields(petPhotosTable!.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of newPetsFields) {
  // Skip auto fields như Notes/Active mà Baserow tự tạo
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pets.fields[f.name] = f.id;
  }
}
// Tạo entry mới cho pet_photos nếu chưa có
if (!config.tables.pet_photos) {
  config.tables.pet_photos = { id: petPhotosTable!.id, fields: {} };
}
config.tables.pet_photos.id = petPhotosTable!.id;
for (const f of newPhotosFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pet_photos.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-v2] baserow-config.json updated.\n");

// Step 5: Re-calc profile_completion_pct cho legacy pets
// Phase 0 simple: legacy pet đã có name/species/breed/dob/gender → Identity section ~80%
// → total ~20% (Identity = 25 weight × 0.8 = 20%)
console.log("[migrate-v2] Setting legacy profile_completion_pct = 20 cho rows hiện có...");
for (const pet of preCount.results) {
  const current = (pet as any).profile_completion_pct;
  if (current === null || current === undefined || current === 0) {
    await updateRow(PETS_TABLE, pet.id, { profile_completion_pct: 20 });
    console.log(`  ✓ pet id=${pet.id} "${pet.name}" → 20%`);
  } else {
    console.log(`  → pet id=${pet.id} "${pet.name}" giữ ${current}%`);
  }
}
console.log();

// Step 6: Post-count verify
const postCount = await listRows(PETS_TABLE);
const verifyPass = postCount.count === preCount.count;
console.log(
  `Post-migration: ${postCount.count} pets rows ${
    verifyPass ? "✓ MATCH pre-count" : "✗ MISMATCH (was " + preCount.count + ")"
  }`
);

if (!verifyPass) {
  console.error("❌ Row count thay đổi — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M3.5 migration hoàn tất.");
console.log(`   pets fields total: ${(await listFields(PETS_TABLE)).length}`);
console.log(`   pet_photos table:  id=${petPhotosTable!.id}, ${(await listFields(petPhotosTable!.id)).length} fields`);
