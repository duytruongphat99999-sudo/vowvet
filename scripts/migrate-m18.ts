/**
 * M18 migration: Voice Diary.
 *
 * Idempotent — re-run an toàn.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m18.ts
 *
 * Changes:
 *   voice_diary_entries: NEW table (13 fields)
 *     - pet_id (link_row → pets)
 *     - entry_date (date)
 *     - audio_key (text)              — R2 key (optional)
 *     - audio_url (url)
 *     - duration_seconds (number)
 *     - owner_transcript (long_text)
 *     - pet_diary (long_text)         — AI POV (Vietnamese, first person)
 *     - pet_diary_title (text)
 *     - mood_detected (single_select) — happy/sad/funny/exciting/ordinary
 *     - word_count (number)
 *     - gemini_model_used (text)
 *     - created_at (text)             — ISO
 *     - photo_url (url)               — optional, mood-matching pet photo
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
console.log("[migrate-m18] Logged in.\n");

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
// 1. CREATE voice_diary_entries TABLE
// ============================================================
const allTables = await listTables(DATABASE_ID);
let table = allTables.find((t) => t.name === "voice_diary_entries");

const FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "entry_date", type: "date", date_format: "ISO" },
  { name: "audio_key", type: "text" },
  { name: "audio_url", type: "url" },
  { name: "duration_seconds", type: "number", number_decimal_places: 0 },
  { name: "owner_transcript", type: "long_text" },
  { name: "pet_diary", type: "long_text" },
  { name: "pet_diary_title", type: "text" },
  {
    name: "mood_detected",
    type: "single_select",
    select_options: [
      opt("happy", "green"),
      opt("sad", "blue"),
      opt("funny", "yellow"),
      opt("exciting", "red"),
      opt("ordinary", "gray"),
    ],
  },
  { name: "word_count", type: "number", number_decimal_places: 0 },
  { name: "gemini_model_used", type: "text" },
  { name: "created_at", type: "text" },
  { name: "photo_url", type: "url" },
];

if (!table) {
  console.log("🔄 Creating voice_diary_entries table...");
  table = await createTable(DATABASE_ID, "voice_diary_entries");
  console.log(`  Created: id=${table.id}\n`);
} else {
  console.log(`⊙ voice_diary_entries already exists (id=${table.id})\n`);
}

const existingFields = await listFields(table.id);
const existingNames = new Set(existingFields.map((f) => f.name));
let added = 0, skipped = 0;

for (const f of FIELDS) {
  if (existingNames.has(f.name)) {
    skipped++;
    console.log(`  ⊙ ${f.name} already exists`);
    continue;
  }
  await createField(table.id, f);
  added++;
  console.log(`  + ${f.name}`);
}
console.log(`  voice_diary_entries: +${added} added, ${skipped} skipped\n`);

// ============================================================
// 2. UPDATE baserow-config.json
// ============================================================
console.log("🔄 Updating baserow-config.json...");
const freshFields = await listFields(table.id);
const config: any = JSON.parse(JSON.stringify(existingConfig));
if (!config.tables.voice_diary_entries) {
  config.tables.voice_diary_entries = { id: table.id, fields: {} };
}
config.tables.voice_diary_entries.id = table.id;
for (const f of freshFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.voice_diary_entries.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("  baserow-config.json updated.\n");

console.log("✅ M18 voice_diary_entries table created (id: " + table.id + ")");
console.log("\nRestart vowvet-api:\n  docker compose up -d --force-recreate vowvet-api");
