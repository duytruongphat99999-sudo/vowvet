/**
 * M15 migration: Voice Diary + Routine Builder + Water Intake.
 *
 * Idempotent.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m15.ts
 *
 * Changes:
 *   pets: +4 fields (routine_streak_days, routine_longest_streak,
 *                    voice_diary_streak, water_intake_target_ml)
 *   voice_diary_entries: NEW table (13 fields incl primary entry_label)
 *   pet_routines: NEW table (10 fields incl primary task_name)
 *   routine_completions: NEW table (6 fields)
 *   water_intake_logs: NEW table (7 fields)
 *
 *   No row seeding — pilot starts with empty tables, owners create live.
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
      '  $env:BASEROW_TOKEN = "..."\n' +
      "  bun run scripts/migrate-m15.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m15] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate-m15] Logged in.\n");

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
const renamePrimary = (fieldId: number, newName: string) =>
  api(`/database/fields/${fieldId}/`, {
    method: "PATCH",
    body: JSON.stringify({ name: newName, type: "text" }),
  });
const listTables = (databaseId: number) => api<TableDef[]>(`/database/tables/database/${databaseId}/`);
const createTable = (databaseId: number, name: string) =>
  api<TableDef>(`/database/tables/database/${databaseId}/`, { method: "POST", body: JSON.stringify({ name }) });
const listRowsToken = (tableId: number) =>
  tokenApi<{ count: number; results: any[] }>(`/database/rows/table/${tableId}/?user_field_names=true&size=200`);

const PETS_TABLE = existingConfig.tables.pets.id;
const USERS_TABLE = existingConfig.tables.users.id;
const DATABASE_ID = existingConfig.database_id;

const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// PRE-COUNT
// ============================================================
const petsPre = await listRowsToken(PETS_TABLE);
console.log(`📊 Pre-migration:`);
console.log(`  pets: ${petsPre.count} rows\n`);

// ============================================================
// 1. ADD 4 FIELDS TO pets TABLE
// ============================================================
console.log("🔄 Adding 4 fields to pets (M15 streaks + water target)...");

const NEW_PETS_FIELDS = [
  { name: "routine_streak_days", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "routine_longest_streak", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "voice_diary_streak", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "water_intake_target_ml", type: "number", number_decimal_places: 0, number_negative: false },
];

const existingPetsFields = await listFields(PETS_TABLE);
const existingPetNames = new Set(existingPetsFields.map((f) => f.name));
let addedP = 0;
let skippedP = 0;
for (const fieldDef of NEW_PETS_FIELDS) {
  if (existingPetNames.has(fieldDef.name)) {
    skippedP++;
    console.log(`  ⊙ ${fieldDef.name} đã tồn tại`);
    continue;
  }
  await createField(PETS_TABLE, fieldDef);
  addedP++;
  console.log(`  + ${fieldDef.name}`);
}
console.log(`  pets: +${addedP} added, ${skippedP} skipped\n`);

// ============================================================
// 2. CREATE voice_diary_entries TABLE
// ============================================================
const tables = await listTables(DATABASE_ID);
let voiceDiaryTable = tables.find((t) => t.name === "voice_diary_entries");

const VOICE_DIARY_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "owner_user_id", type: "link_row", link_row_table_id: USERS_TABLE },
  { name: "entry_date", type: "text" }, // YYYY-MM-DD (local VN)
  { name: "owner_input", type: "long_text" }, // 50-2000 chars validated app-side
  { name: "pet_pov_output", type: "long_text" }, // ≤1500 chars from AI
  { name: "ai_cost_usd", type: "number", number_decimal_places: 6, number_negative: false },
  { name: "ai_model", type: "text" }, // "gemini-2.5-flash" etc
  {
    name: "mood_tag",
    type: "single_select",
    select_options: [
      opt("happy", "green"),
      opt("neutral", "blue"),
      opt("worried", "orange"),
      opt("tired", "gray"),
      opt("playful", "pink"),
    ],
  },
  { name: "weather_snapshot", type: "long_text" }, // JSON {temp_c, weather, city}
  { name: "compiled_in_month", type: "text" }, // YYYY-MM khi đã include vào monthly compile, else empty
  { name: "created_at", type: "text" }, // ISO
  { name: "updated_at", type: "text" }, // ISO
];

if (!voiceDiaryTable) {
  console.log("🆕 Creating voice_diary_entries table...");
  voiceDiaryTable = await createTable(DATABASE_ID, "voice_diary_entries");
  const initFields = await listFields(voiceDiaryTable.id);
  const primary = initFields.find((f) => (f as any).primary === true) || initFields[0];
  if (primary && primary.name !== "entry_label") {
    await renamePrimary(primary.id, "entry_label");
    console.log(`  ✓ renamed primary → entry_label`);
  }
  for (const fieldDef of VOICE_DIARY_FIELDS) {
    await createField(voiceDiaryTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 voice_diary_entries đã tồn tại (id=${voiceDiaryTable.id}). Ensuring fields...`);
  const existing = await listFields(voiceDiaryTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of VOICE_DIARY_FIELDS) {
    if (!existingN.has(fieldDef.name)) {
      await createField(voiceDiaryTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 3. CREATE pet_routines TABLE
// ============================================================
let petRoutinesTable = tables.find((t) => t.name === "pet_routines");

const PET_ROUTINES_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "owner_user_id", type: "link_row", link_row_table_id: USERS_TABLE },
  {
    name: "block",
    type: "single_select",
    select_options: [
      opt("morning", "yellow"),
      opt("noon", "orange"),
      opt("afternoon", "blue"),
      opt("evening", "purple"),
      opt("night", "dark-blue"),
    ],
  },
  { name: "task_emoji", type: "text" },
  { name: "target_time", type: "text" }, // HH:MM string
  { name: "duration_minutes", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "is_active", type: "boolean", boolean_default: true },
  { name: "sort_order", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "created_at", type: "text" },
];

if (!petRoutinesTable) {
  console.log("🆕 Creating pet_routines table...");
  petRoutinesTable = await createTable(DATABASE_ID, "pet_routines");
  const initFields = await listFields(petRoutinesTable.id);
  const primary = initFields.find((f) => (f as any).primary === true) || initFields[0];
  if (primary && primary.name !== "task_name") {
    await renamePrimary(primary.id, "task_name");
    console.log(`  ✓ renamed primary → task_name`);
  }
  for (const fieldDef of PET_ROUTINES_FIELDS) {
    await createField(petRoutinesTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 pet_routines đã tồn tại (id=${petRoutinesTable.id}). Ensuring fields...`);
  const existing = await listFields(petRoutinesTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of PET_ROUTINES_FIELDS) {
    if (!existingN.has(fieldDef.name)) {
      await createField(petRoutinesTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 4. CREATE routine_completions TABLE
// ============================================================
let routineCompletionsTable = tables.find((t) => t.name === "routine_completions");

// Need petRoutinesTable.id for the link — must be present after step 3
const ROUTINE_COMPLETIONS_FIELDS = [
  { name: "routine_id", type: "link_row", link_row_table_id: petRoutinesTable!.id },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "completion_date", type: "text" }, // YYYY-MM-DD
  { name: "completed_at", type: "text" }, // ISO timestamp
  { name: "notes", type: "text" },
];

if (!routineCompletionsTable) {
  console.log("🆕 Creating routine_completions table...");
  routineCompletionsTable = await createTable(DATABASE_ID, "routine_completions");
  const initFields = await listFields(routineCompletionsTable.id);
  const primary = initFields.find((f) => (f as any).primary === true) || initFields[0];
  if (primary && primary.name !== "completion_label") {
    await renamePrimary(primary.id, "completion_label");
    console.log(`  ✓ renamed primary → completion_label`);
  }
  for (const fieldDef of ROUTINE_COMPLETIONS_FIELDS) {
    await createField(routineCompletionsTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 routine_completions đã tồn tại (id=${routineCompletionsTable.id}). Ensuring fields...`);
  const existing = await listFields(routineCompletionsTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of ROUTINE_COMPLETIONS_FIELDS) {
    if (!existingN.has(fieldDef.name)) {
      await createField(routineCompletionsTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 5. CREATE water_intake_logs TABLE
// ============================================================
let waterIntakeTable = tables.find((t) => t.name === "water_intake_logs");

const WATER_INTAKE_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "log_date", type: "text" }, // YYYY-MM-DD
  { name: "amount_ml", type: "number", number_decimal_places: 0, number_negative: false },
  {
    name: "source",
    type: "single_select",
    select_options: [
      opt("bowl", "blue"),
      opt("fountain", "light-blue"),
      opt("wet_food", "green"),
      opt("treats", "orange"),
      opt("other", "gray"),
    ],
  },
  { name: "logged_at", type: "text" }, // ISO timestamp
  { name: "notes", type: "text" },
];

if (!waterIntakeTable) {
  console.log("🆕 Creating water_intake_logs table...");
  waterIntakeTable = await createTable(DATABASE_ID, "water_intake_logs");
  const initFields = await listFields(waterIntakeTable.id);
  const primary = initFields.find((f) => (f as any).primary === true) || initFields[0];
  if (primary && primary.name !== "log_label") {
    await renamePrimary(primary.id, "log_label");
    console.log(`  ✓ renamed primary → log_label`);
  }
  for (const fieldDef of WATER_INTAKE_FIELDS) {
    await createField(waterIntakeTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 water_intake_logs đã tồn tại (id=${waterIntakeTable.id}). Ensuring fields...`);
  const existing = await listFields(waterIntakeTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of WATER_INTAKE_FIELDS) {
    if (!existingN.has(fieldDef.name)) {
      await createField(waterIntakeTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 6. UPDATE baserow-config.json
// ============================================================
const newPetsFields = await listFields(PETS_TABLE);
const newVDFields = await listFields(voiceDiaryTable!.id);
const newPRFields = await listFields(petRoutinesTable!.id);
const newRCFields = await listFields(routineCompletionsTable!.id);
const newWIFields = await listFields(waterIntakeTable!.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));

for (const f of newPetsFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pets.fields[f.name] = f.id;
  }
}

if (!config.tables.voice_diary_entries) config.tables.voice_diary_entries = { id: voiceDiaryTable!.id, fields: {} };
config.tables.voice_diary_entries.id = voiceDiaryTable!.id;
for (const f of newVDFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.voice_diary_entries.fields[f.name] = f.id;
  }
}

if (!config.tables.pet_routines) config.tables.pet_routines = { id: petRoutinesTable!.id, fields: {} };
config.tables.pet_routines.id = petRoutinesTable!.id;
for (const f of newPRFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pet_routines.fields[f.name] = f.id;
  }
}

if (!config.tables.routine_completions) config.tables.routine_completions = { id: routineCompletionsTable!.id, fields: {} };
config.tables.routine_completions.id = routineCompletionsTable!.id;
for (const f of newRCFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.routine_completions.fields[f.name] = f.id;
  }
}

if (!config.tables.water_intake_logs) config.tables.water_intake_logs = { id: waterIntakeTable!.id, fields: {} };
config.tables.water_intake_logs.id = waterIntakeTable!.id;
for (const f of newWIFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.water_intake_logs.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m15] baserow-config.json updated.\n");

// ============================================================
// 7. POST-COUNT
// ============================================================
const petsPost = await listRowsToken(PETS_TABLE);
const vdCount = await listRowsToken(voiceDiaryTable!.id);
const prCount = await listRowsToken(petRoutinesTable!.id);
const rcCount = await listRowsToken(routineCompletionsTable!.id);
const wiCount = await listRowsToken(waterIntakeTable!.id);

console.log(`📊 Post-migration:`);
console.log(`  pets: ${petsPost.count} rows ${petsPost.count === petsPre.count ? "✓ MATCH" : "✗ MISMATCH"}`);
console.log(`  voice_diary_entries: ${vdCount.count} rows (expected 0-1 stub Phase 0)`);
console.log(`  pet_routines: ${prCount.count} rows (expected 0-1 stub Phase 0)`);
console.log(`  routine_completions: ${rcCount.count} rows (expected 0-1 stub Phase 0)`);
console.log(`  water_intake_logs: ${wiCount.count} rows (expected 0-1 stub Phase 0)`);

if (petsPost.count !== petsPre.count) {
  console.error("\n❌ Pet count mismatch — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M15 migration hoàn tất. Voice Diary + Routine + Water schema ready.\n");
console.log("Next: bun run scripts/migrate-m15.ts đã xong → tiếp Phase 2 (Water Intake feature).");
