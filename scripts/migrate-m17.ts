/**
 * M17 migration: Birthday Events.
 *
 * Idempotent — re-run an toàn.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m17.ts
 *
 * Changes:
 *   birthday_events: NEW table (13 fields)
 *     - pet_id (link_row → pets)
 *     - birthday_year (number) — 2025, 2026…
 *     - event_date (text) — YYYY-MM-DD actual birthday for this year
 *     - push_sent_30d (boolean)
 *     - push_sent_7d (boolean)
 *     - push_sent_1d (boolean)
 *     - push_sent_today (boolean)
 *     - wishes (long_text) — JSON [{name, message, emoji, created_at}]
 *     - wishes_count (number)
 *     - slideshow_content (long_text) — Gemini-generated narrative
 *     - slideshow_generated (boolean)
 *     - wall_enabled (boolean)
 *     - created_at (text) — ISO string
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      '  $env:BASEROW_TOKEN = "..."\n' +
      "  bun run scripts/migrate-m17.ts"
  );
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
console.log("[migrate-m17] Logged in.\n");

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

async function tokenApi<T = any>(path: string): Promise<T> {
  if (!TOKEN) throw new Error("BASEROW_TOKEN required");
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    headers: { Authorization: `Token ${TOKEN}`, Host: "localhost:8888" },
  });
  if (!res.ok) throw new Error(`Token API ${path} → ${res.status}`);
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
const countRows = (tid: number) =>
  TOKEN
    ? tokenApi<{ count: number }>(`/database/rows/table/${tid}/?size=1`)
    : Promise.resolve({ count: -1 });

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;

// ============================================================
// 1. CREATE birthday_events TABLE
// ============================================================
const allTables = await listTables(DATABASE_ID);
let birthdayEventsTable = allTables.find((t) => t.name === "birthday_events");

const BIRTHDAY_EVENTS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "birthday_year", type: "number", number_decimal_places: 0 },
  { name: "event_date", type: "text" },
  { name: "push_sent_30d", type: "boolean" },
  { name: "push_sent_7d", type: "boolean" },
  { name: "push_sent_1d", type: "boolean" },
  { name: "push_sent_today", type: "boolean" },
  { name: "wishes", type: "long_text" },
  { name: "wishes_count", type: "number", number_decimal_places: 0 },
  { name: "slideshow_content", type: "long_text" },
  { name: "slideshow_generated", type: "boolean" },
  { name: "wall_enabled", type: "boolean" },
  { name: "created_at", type: "text" },
];

if (!birthdayEventsTable) {
  console.log("🔄 Creating birthday_events table...");
  birthdayEventsTable = await createTable(DATABASE_ID, "birthday_events");
  console.log(`  Created: id=${birthdayEventsTable.id}\n`);
} else {
  console.log(`⊙ birthday_events already exists (id=${birthdayEventsTable.id})\n`);
}

// Add missing fields
const existingFields = await listFields(birthdayEventsTable.id);
const existingNames = new Set(existingFields.map((f) => f.name));
let added = 0, skipped = 0;

for (const f of BIRTHDAY_EVENTS_FIELDS) {
  if (existingNames.has(f.name)) {
    skipped++;
    console.log(`  ⊙ ${f.name} already exists`);
    continue;
  }
  await createField(birthdayEventsTable.id, f);
  added++;
  console.log(`  + ${f.name}`);
}
console.log(`  birthday_events: +${added} added, ${skipped} skipped\n`);

// ============================================================
// 2. UPDATE baserow-config.json
// ============================================================
console.log("🔄 Updating baserow-config.json...");
const freshFields = await listFields(birthdayEventsTable.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));

if (!config.tables.birthday_events) {
  config.tables.birthday_events = { id: birthdayEventsTable.id, fields: {} };
}
config.tables.birthday_events.id = birthdayEventsTable.id;
for (const f of freshFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.birthday_events.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("  baserow-config.json updated.\n");

// ============================================================
// 3. VERIFY
// ============================================================
if (TOKEN) {
  const cnt = await countRows(birthdayEventsTable.id);
  console.log(`📊 birthday_events rows: ${cnt.count}`);
}

console.log("\n✅ M17 migration done.");
console.log("   - birthday_events table created with 13 fields");
console.log("\nRestart vowvet-api:\n  docker compose up -d --force-recreate vowvet-api");
