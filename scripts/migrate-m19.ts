/**
 * M19 migration: Pet Routine Builder.
 *
 * Idempotent — re-run an toàn.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m19.ts
 *
 * Tables (3 NEW):
 *   1. routines (12 fields)
 *   2. routine_completions (10 fields)
 *   3. routine_streaks (10 fields, 1 row per pet)
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD. See header comment.");
  process.exit(1);
}

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
console.log("[migrate-m19] Logged in.\n");

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

interface FieldDef { id: number; name: string; type: string; }
interface TableDef { id: number; name: string; }

const listFields = (tid: number) => api<FieldDef[]>(`/database/fields/table/${tid}/`);
const createField = (tid: number, d: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tid}/`, { method: "POST", body: JSON.stringify(d) });
const listTables = (dbId: number) => api<TableDef[]>(`/database/tables/database/${dbId}/`);
const createTable = (dbId: number, name: string) =>
  api<TableDef>(`/database/tables/database/${dbId}/`, { method: "POST", body: JSON.stringify({ name }) });

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;

const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// Define schemas
// ============================================================

const ROUTINES_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "name", type: "text" },
  { name: "icon", type: "text" },
  { name: "color", type: "text" },
  {
    name: "schedule_type",
    type: "single_select",
    select_options: [
      opt("daily", "green"),
      opt("weekdays", "blue"),
      opt("weekends", "orange"),
      opt("custom", "purple"),
    ],
  },
  { name: "custom_days", type: "text" },
  { name: "start_time", type: "text" },
  { name: "tasks", type: "long_text" },
  { name: "active", type: "boolean" },
  { name: "push_reminder", type: "boolean" },
  { name: "created_at", type: "text" },
  { name: "updated_at", type: "text" },
];

const COMPLETIONS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "routine_id", type: "number", number_decimal_places: 0 },
  { name: "completion_date", type: "date", date_format: "ISO" },
  { name: "tasks_completed", type: "long_text" },
  { name: "tasks_total", type: "number", number_decimal_places: 0 },
  { name: "tasks_completion_rate", type: "number", number_decimal_places: 0 },
  { name: "points_earned", type: "number", number_decimal_places: 0 },
  { name: "streak_count_at_time", type: "number", number_decimal_places: 0 },
  { name: "completed_at", type: "text" },
  { name: "notes", type: "text" },
];

const STREAKS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "current_streak", type: "number", number_decimal_places: 0 },
  { name: "longest_streak", type: "number", number_decimal_places: 0 },
  { name: "total_completions", type: "number", number_decimal_places: 0 },
  { name: "total_points", type: "number", number_decimal_places: 0 },
  { name: "last_completion_date", type: "date", date_format: "ISO" },
  { name: "streak_freezes_available", type: "number", number_decimal_places: 0 },
  { name: "badges_earned", type: "long_text" },
  { name: "morning_completions", type: "number", number_decimal_places: 0 },
  { name: "evening_completions", type: "number", number_decimal_places: 0 },
  { name: "triple_days_count", type: "number", number_decimal_places: 0 },
  { name: "updated_at", type: "text" },
];

// ============================================================
// Generic table+field ensure helper
// ============================================================
async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const allTables = await listTables(DATABASE_ID);
  let table = allTables.find((t) => t.name === name);
  if (!table) {
    console.log(`🔄 Creating ${name} table...`);
    table = await createTable(DATABASE_ID, name);
    console.log(`  Created: id=${table.id}\n`);
  } else {
    console.log(`⊙ ${name} already exists (id=${table.id})`);
  }
  const existing = await listFields(table.id);
  const existingNames = new Set(existing.map((f) => f.name));
  let added = 0, skipped = 0;
  for (const f of fields) {
    if (existingNames.has(f.name)) {
      skipped++;
      continue;
    }
    await createField(table.id, f);
    added++;
    console.log(`  + ${f.name}`);
  }
  console.log(`  ${name}: +${added} added, ${skipped} skipped\n`);
  return table;
}

// ============================================================
// Run
// ============================================================
const routinesTable = await ensureTable("routines", ROUTINES_FIELDS);
const completionsTable = await ensureTable("routine_completions", COMPLETIONS_FIELDS);
const streaksTable = await ensureTable("routine_streaks", STREAKS_FIELDS);

// ============================================================
// Update baserow-config.json
// ============================================================
console.log("🔄 Updating baserow-config.json...");
const config: any = JSON.parse(JSON.stringify(existingConfig));

async function syncConfig(name: string, table: TableDef) {
  const fresh = await listFields(table.id);
  if (!config.tables[name]) config.tables[name] = { id: table.id, fields: {} };
  config.tables[name].id = table.id;
  for (const f of fresh) {
    if (f.name && !["Notes", "Active"].includes(f.name)) {
      config.tables[name].fields[f.name] = f.id;
    }
  }
}

await syncConfig("routines", routinesTable);
await syncConfig("routine_completions", completionsTable);
await syncConfig("routine_streaks", streaksTable);

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("  baserow-config.json updated.\n");

console.log("✅ M19 routines + routine_completions + routine_streaks tables created");
console.log(`   routines: id=${routinesTable.id}`);
console.log(`   routine_completions: id=${completionsTable.id}`);
console.log(`   routine_streaks: id=${streaksTable.id}`);
console.log("\nRestart vowvet-api:\n  docker compose up -d --force-recreate vowvet-api");
