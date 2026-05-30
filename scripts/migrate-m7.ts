/**
 * M7 migration: Nutrition Profiler.
 *
 * Idempotent.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m7.ts
 *
 * Changes:
 *   pets table: +6 fields (target_weight_kg, body_condition_score, activity_level,
 *                          life_stage, food_intolerance_severity, daily_calorie_target)
 *   weight_logs: NEW table (5 fields + auto created_on)
 *   food_brands: NEW table (13 fields) + seed 14 brands (2 Mon Min + 7 dog + 5 cat)
 *   Backfill: pets có weight_kg → tính initial daily_calorie_target, default activity_level/life_stage
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL hoặc BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      "  bun run scripts/migrate-m7.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m7] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate-m7] Logged in.\n");

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
  if (!res.ok) throw new Error(`API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tokenApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!TOKEN) throw new Error("BASEROW_TOKEN cần thiết cho row CRUD");
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Token API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef {
  id: number;
  name: string;
  type: string;
  primary?: boolean;
}
interface TableDef {
  id: number;
  name: string;
}

const listFields = (tableId: number) => api<FieldDef[]>(`/database/fields/table/${tableId}/`);
const createField = (tableId: number, data: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(data) });
const listTables = (databaseId: number) => api<TableDef[]>(`/database/tables/database/${databaseId}/`);
const createTable = (databaseId: number, name: string) =>
  api<TableDef>(`/database/tables/database/${databaseId}/`, { method: "POST", body: JSON.stringify({ name }) });
const listRowsToken = (tableId: number) =>
  tokenApi<{ count: number; results: any[] }>(`/database/rows/table/${tableId}/?user_field_names=true&size=200`);
const createRowToken = (tableId: number, data: Record<string, unknown>) =>
  tokenApi(`/database/rows/table/${tableId}/?user_field_names=true`, {
    method: "POST",
    body: JSON.stringify(data),
  });
const updateRowToken = (tableId: number, rowId: number, data: Record<string, unknown>) =>
  tokenApi(`/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;

const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// PRE-COUNT
// ============================================================
const petsPre = await listRowsToken(PETS_TABLE);
console.log(`📊 Pre-migration:`);
console.log(`  pets: ${petsPre.count} rows\n`);

// ============================================================
// 1. ADD FIELDS TO pets TABLE
// ============================================================
console.log("🔄 Adding 6 fields to pets table...");

const NEW_PETS_FIELDS = [
  { name: "target_weight_kg", type: "number", number_decimal_places: 2, number_negative: false },
  { name: "body_condition_score", type: "number", number_decimal_places: 0, number_negative: false },
  {
    name: "activity_level",
    type: "single_select",
    select_options: [
      opt("sedentary", "gray"),
      opt("low", "light-blue"),
      opt("moderate", "blue"),
      opt("active", "orange"),
      opt("very_active", "red"),
    ],
  },
  {
    name: "life_stage",
    type: "single_select",
    select_options: [
      opt("puppy", "pink"),
      opt("junior", "yellow"),
      opt("adult", "green"),
      opt("senior", "orange"),
      opt("geriatric", "red"),
    ],
  },
  {
    name: "food_intolerance_severity",
    type: "single_select",
    select_options: [opt("mild", "yellow"), opt("moderate", "orange"), opt("severe", "red")],
  },
  { name: "daily_calorie_target", type: "number", number_decimal_places: 0, number_negative: false },
];

const existingPetsFields = await listFields(PETS_TABLE);
const existingNames = new Set(existingPetsFields.map((f) => f.name));
let addedP = 0;
let skippedP = 0;
for (const fieldDef of NEW_PETS_FIELDS) {
  if (existingNames.has(fieldDef.name as string)) {
    skippedP++;
    continue;
  }
  await createField(PETS_TABLE, fieldDef);
  addedP++;
  console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
}
console.log(`  pets: +${addedP} added, ${skippedP} skipped\n`);

// ============================================================
// 2. CREATE weight_logs TABLE
// ============================================================
const tables = await listTables(DATABASE_ID);
let weightLogsTable = tables.find((t) => t.name === "weight_logs");

const WEIGHT_LOGS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "weight_kg", type: "number", number_decimal_places: 2, number_negative: false },
  { name: "body_condition_score", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "logged_at", type: "created_on" },
  { name: "notes", type: "text" },
  {
    name: "logged_by",
    type: "single_select",
    select_options: [opt("owner", "blue"), opt("vet", "green"), opt("auto_clinic", "purple")],
  },
];

if (!weightLogsTable) {
  console.log("🆕 Creating weight_logs table...");
  weightLogsTable = await createTable(DATABASE_ID, "weight_logs");
  for (const fieldDef of WEIGHT_LOGS_FIELDS) {
    await createField(weightLogsTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 weight_logs đã tồn tại (id=${weightLogsTable.id}). Ensuring fields...`);
  const existing = await listFields(weightLogsTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of WEIGHT_LOGS_FIELDS) {
    if (!existingN.has(fieldDef.name as string)) {
      await createField(weightLogsTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 3. CREATE food_brands TABLE
// ============================================================
let foodBrandsTable = tables.find((t) => t.name === "food_brands");

const FOOD_BRANDS_FIELDS = [
  // brand_name = primary text (Baserow auto-creates Name primary, rename below)
  { name: "product_line", type: "text" },
  {
    name: "species",
    type: "single_select",
    select_options: [opt("dog", "orange"), opt("cat", "pink"), opt("both", "purple")],
  },
  {
    name: "life_stage",
    type: "single_select",
    select_options: [
      opt("puppy", "pink"),
      opt("adult", "green"),
      opt("senior", "orange"),
      opt("all", "blue"),
    ],
  },
  { name: "protein_pct", type: "number", number_decimal_places: 1, number_negative: false },
  { name: "fat_pct", type: "number", number_decimal_places: 1, number_negative: false },
  { name: "fiber_pct", type: "number", number_decimal_places: 1, number_negative: false },
  { name: "carb_pct_calculated", type: "number", number_decimal_places: 1, number_negative: false },
  { name: "calories_per_100g", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "price_vnd_per_kg", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "contains_allergens", type: "long_text" }, // JSON array string
  { name: "mon_min_recommended", type: "boolean", boolean_default: false },
  { name: "vn_availability", type: "boolean", boolean_default: true },
];

if (!foodBrandsTable) {
  console.log("🆕 Creating food_brands table...");
  foodBrandsTable = await createTable(DATABASE_ID, "food_brands");
  // Rename primary "Name" → "brand_name"
  const initFields = await listFields(foodBrandsTable.id);
  const primary = initFields.find((f) => (f as any).primary === true) || initFields[0];
  if (primary && primary.name !== "brand_name") {
    await api(`/database/fields/${primary.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ name: "brand_name", type: "text" }),
    });
    console.log(`  ✓ renamed primary → brand_name`);
  }
  for (const fieldDef of FOOD_BRANDS_FIELDS) {
    await createField(foodBrandsTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 food_brands đã tồn tại (id=${foodBrandsTable.id}). Ensuring fields...`);
  const existing = await listFields(foodBrandsTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of FOOD_BRANDS_FIELDS) {
    if (!existingN.has(fieldDef.name as string)) {
      await createField(foodBrandsTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 4. UPDATE baserow-config.json
// ============================================================
const newPetsFields = await listFields(PETS_TABLE);
const newWLFields = await listFields(weightLogsTable!.id);
const newFBFields = await listFields(foodBrandsTable!.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of newPetsFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pets.fields[f.name] = f.id;
  }
}
if (!config.tables.weight_logs) config.tables.weight_logs = { id: weightLogsTable!.id, fields: {} };
config.tables.weight_logs.id = weightLogsTable!.id;
for (const f of newWLFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.weight_logs.fields[f.name] = f.id;
  }
}
if (!config.tables.food_brands) config.tables.food_brands = { id: foodBrandsTable!.id, fields: {} };
config.tables.food_brands.id = foodBrandsTable!.id;
for (const f of newFBFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.food_brands.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m7] baserow-config.json updated.\n");

// ============================================================
// 5. SEED food_brands (14 brands)
// ============================================================
const existingBrands = await listRowsToken(foodBrandsTable!.id);
const realBrands = existingBrands.results.filter((r) => r.brand_name);

if (realBrands.length >= 13) {
  console.log(`[migrate-m7] food_brands đã seed (${realBrands.length} brands). Skip.\n`);
} else {
  console.log(`🌱 Seeding 14 food brands...`);

  const SEED_BRANDS: Record<string, unknown>[] = [
    // ===== MON MIN CURATED (2) — Phase 0 placeholders =====
    {
      brand_name: "Mon Min Dry Dog Premium",
      product_line: "Mon Min Premium Line",
      species: "dog",
      life_stage: "adult",
      protein_pct: 28.0,
      fat_pct: 14.0,
      fiber_pct: 6.0,
      carb_pct_calculated: 45.0,
      calories_per_100g: 360,
      price_vnd_per_kg: 250000,
      contains_allergens: "[]",
      mon_min_recommended: true,
      vn_availability: true,
    },
    {
      brand_name: "Mon Min Wet Cat Pate",
      product_line: "Mon Min Premium Line",
      species: "cat",
      life_stage: "adult",
      protein_pct: 30.0,
      fat_pct: 12.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 15.0,
      calories_per_100g: 95,
      price_vnd_per_kg: 950000, // ~80k/85g can → ~950k/kg
      contains_allergens: "[]",
      mon_min_recommended: true,
      vn_availability: true,
    },
    // ===== DOGS (6) =====
    {
      brand_name: "Royal Canin Maxi Adult",
      product_line: "Royal Canin Size",
      species: "dog",
      life_stage: "adult",
      protein_pct: 26.0,
      fat_pct: 14.0,
      fiber_pct: 5.0,
      carb_pct_calculated: 45.0,
      calories_per_100g: 350,
      price_vnd_per_kg: 280000,
      contains_allergens: '["chicken","grain"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "Royal Canin Mini Adult",
      product_line: "Royal Canin Size",
      species: "dog",
      life_stage: "adult",
      protein_pct: 25.0,
      fat_pct: 16.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 45.0,
      calories_per_100g: 380,
      price_vnd_per_kg: 320000,
      contains_allergens: '["chicken","grain"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "Pedigree Adult",
      product_line: "Pedigree Standard",
      species: "dog",
      life_stage: "adult",
      protein_pct: 21.0,
      fat_pct: 10.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 55.0,
      calories_per_100g: 340,
      price_vnd_per_kg: 150000,
      contains_allergens: '["chicken","grain","soy"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "SmartHeart Adult",
      product_line: "SmartHeart Standard",
      species: "dog",
      life_stage: "adult",
      protein_pct: 22.0,
      fat_pct: 12.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 53.0,
      calories_per_100g: 350,
      price_vnd_per_kg: 120000,
      contains_allergens: '["chicken","grain"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "Reflex Adult",
      product_line: "Reflex Standard",
      species: "dog",
      life_stage: "adult",
      protein_pct: 25.0,
      fat_pct: 14.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 50.0,
      calories_per_100g: 360,
      price_vnd_per_kg: 180000,
      contains_allergens: '["chicken","grain"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "ANF 30/15 Adult",
      product_line: "ANF",
      species: "dog",
      life_stage: "adult",
      protein_pct: 30.0,
      fat_pct: 15.0,
      fiber_pct: 3.5,
      carb_pct_calculated: 45.0,
      calories_per_100g: 380,
      price_vnd_per_kg: 250000,
      contains_allergens: '["chicken","fish"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    // ===== PUPPY (1) =====
    {
      brand_name: "Royal Canin Puppy",
      product_line: "Royal Canin Size",
      species: "dog",
      life_stage: "puppy",
      protein_pct: 30.0,
      fat_pct: 20.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 40.0,
      calories_per_100g: 410,
      price_vnd_per_kg: 350000,
      contains_allergens: '["chicken","grain","dairy"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    // ===== CATS (5) =====
    {
      brand_name: "Royal Canin Indoor Cat",
      product_line: "Royal Canin Indoor",
      species: "cat",
      life_stage: "adult",
      protein_pct: 25.0,
      fat_pct: 13.0,
      fiber_pct: 7.0,
      carb_pct_calculated: 45.0,
      calories_per_100g: 380,
      price_vnd_per_kg: 350000,
      contains_allergens: '["chicken","grain"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "Royal Canin Persian Adult",
      product_line: "Royal Canin Breed",
      species: "cat",
      life_stage: "adult",
      protein_pct: 30.0,
      fat_pct: 18.0,
      fiber_pct: 5.0,
      carb_pct_calculated: 40.0,
      calories_per_100g: 400,
      price_vnd_per_kg: 400000,
      contains_allergens: '["chicken"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "Whiskas Adult Cat",
      product_line: "Whiskas Standard",
      species: "cat",
      life_stage: "adult",
      protein_pct: 28.0,
      fat_pct: 11.0,
      fiber_pct: 3.0,
      carb_pct_calculated: 50.0,
      calories_per_100g: 360,
      price_vnd_per_kg: 140000,
      contains_allergens: '["fish","grain","dairy"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "Me-O Adult",
      product_line: "Me-O Standard",
      species: "cat",
      life_stage: "adult",
      protein_pct: 25.0,
      fat_pct: 10.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 55.0,
      calories_per_100g: 350,
      price_vnd_per_kg: 120000,
      contains_allergens: '["fish","grain"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
    {
      brand_name: "Reflex Plus Cat",
      product_line: "Reflex Plus",
      species: "cat",
      life_stage: "adult",
      protein_pct: 28.0,
      fat_pct: 14.0,
      fiber_pct: 4.0,
      carb_pct_calculated: 50.0,
      calories_per_100g: 380,
      price_vnd_per_kg: 200000,
      contains_allergens: '["chicken","grain"]',
      mon_min_recommended: false,
      vn_availability: true,
    },
  ];

  for (const b of SEED_BRANDS) {
    await createRowToken(foodBrandsTable!.id, b);
    console.log(`  + ${b.brand_name}`);
  }
  console.log(`  Seeded ${SEED_BRANDS.length} brands\n`);
}

// ============================================================
// 6. BACKFILL existing pets: daily_calorie_target + life_stage + activity_level default
// ============================================================
console.log("🔄 Backfilling existing pets nutrition fields...");

// Inline life_stage + DER calc (avoid import dep, simple version)
function backfillLifeStage(species: string | null | undefined, dob: string | null | undefined): string {
  if (!dob) return "adult";
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "adult";
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const years = (now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const sp = species?.toLowerCase();
  const isCat = sp === "cat" || sp === "mèo";
  if (years < 1) return "puppy";
  if (years < 2) return "junior";
  if (isCat) {
    if (years < 10) return "adult";
    if (years < 15) return "senior";
    return "geriatric";
  }
  if (years < 7) return "adult";
  if (years < 10) return "senior";
  return "geriatric";
}

function backfillCalories(weightKg: number, lifeStage: string, activity = "moderate"): number {
  const rer = 70 * Math.pow(weightKg, 0.75);
  const activityBase: Record<string, number> = { sedentary: 1.2, low: 1.4, moderate: 1.6, active: 2.0, very_active: 2.5 };
  let base = activityBase[activity] || 1.6;
  let lsMod = 1.0;
  if (lifeStage === "puppy") base = 2.5; // simple — assumed >4mo
  else if (lifeStage === "junior") base = 2.0;
  else if (lifeStage === "senior") lsMod = 0.9;
  else if (lifeStage === "geriatric") lsMod = 0.85;
  return Math.round(rer * base * lsMod);
}

let backfilled = 0;
let backfillSkipped = 0;
for (const row of petsPre.results) {
  const r = row as any;
  const updates: Record<string, unknown> = {};

  const weight = r.weight_kg ? Number(r.weight_kg) : null;
  if (!weight) {
    backfillSkipped++;
    continue;
  }

  const speciesValue = typeof r.species === "object" ? r.species?.value : r.species;
  const currentLifeStage = typeof r.life_stage === "object" ? r.life_stage?.value : r.life_stage;
  const currentActivity = typeof r.activity_level === "object" ? r.activity_level?.value : r.activity_level;
  const currentCalorie = r.daily_calorie_target;

  // Life stage
  if (!currentLifeStage) {
    updates.life_stage = backfillLifeStage(speciesValue, r.dob);
  }
  const useLifeStage = currentLifeStage || updates.life_stage || "adult";

  // Activity
  if (!currentActivity) {
    updates.activity_level = "moderate";
  }
  const useActivity = currentActivity || "moderate";

  // Calorie
  if (!currentCalorie) {
    updates.daily_calorie_target = backfillCalories(weight, useLifeStage as string, useActivity as string);
  }

  if (Object.keys(updates).length > 0) {
    try {
      await updateRowToken(PETS_TABLE, row.id, updates);
      console.log(`  ✓ pet ${row.id} "${r.name}": ${JSON.stringify(updates)}`);
      backfilled++;
    } catch (err: any) {
      console.error(`  ✗ pet ${row.id} backfill: ${err.message}`);
      backfillSkipped++;
    }
  } else {
    backfillSkipped++;
  }
}
console.log(`  Backfilled: ${backfilled}, Skipped: ${backfillSkipped}\n`);

// ============================================================
// 7. POST-COUNT
// ============================================================
const petsPost = await listRowsToken(PETS_TABLE);
const wlCount = await listRowsToken(weightLogsTable!.id);
const fbCount = await listRowsToken(foodBrandsTable!.id);

console.log(`📊 Post-migration:`);
console.log(`  pets: ${petsPost.count} rows ${petsPost.count === petsPre.count ? "✓ MATCH" : "✗ MISMATCH"}`);
console.log(`  weight_logs: ${wlCount.count} rows (mostly stubs Phase 0)`);
console.log(`  food_brands: ${fbCount.count} rows (incl 2 stubs + 14 real)`);

if (petsPost.count !== petsPre.count) {
  console.error("\n❌ Pet count mismatch — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M7 migration hoàn tất an toàn. Nutrition profiler ready.");
