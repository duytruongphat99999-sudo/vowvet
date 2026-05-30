/**
 * M16 migration: Vet Bill Tracker.
 *
 * Idempotent — re-run an toàn.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m16.ts
 *
 * Changes:
 *   vet_bills: NEW table (14 fields)
 *     - pet_id (link_row → pets)
 *     - bill_date (date)
 *     - clinic_name (text)
 *     - total_amount (number)
 *     - category (single_select)
 *     - items (long_text) — JSON [{name, qty, unit_price, total}]
 *     - photo_key (text)
 *     - photo_url (text)
 *     - ocr_raw (long_text)
 *     - ocr_confidence (number)
 *     - verified (boolean)
 *     - notes (text)
 *     - huhipet_claimed (boolean)
 *     - created_at (text) — ISO string
 *
 *   pets: +3 fields (also fix missing M13 personality fields)
 *     - personality_secondary_type (text)
 *     - personality_completed_at (text)
 *     - personality_scores (long_text)
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
      "  bun run scripts/migrate-m16.ts"
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
console.log("[migrate-m16] Logged in.\n");

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

const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// PRE-COUNT
// ============================================================
let petsPre = { count: 0 };
if (TOKEN) {
  petsPre = await countRows(PETS_TABLE);
  console.log(`📊 Pre: pets=${petsPre.count}\n`);
}

// ============================================================
// 1. FIX MISSING M13 PERSONALITY FIELDS IN pets TABLE
// ============================================================
console.log("🔄 Checking M13 personality fields in pets...");
const PERSONALITY_FIELDS = [
  { name: "personality_secondary_type", type: "text" },
  { name: "personality_completed_at", type: "text" },
  { name: "personality_scores", type: "long_text" },
];

const petsFields = await listFields(PETS_TABLE);
const petsFieldNames = new Set(petsFields.map((f) => f.name));
let pAdded = 0, pSkipped = 0;
for (const f of PERSONALITY_FIELDS) {
  if (petsFieldNames.has(f.name)) {
    pSkipped++;
    console.log(`  ⊙ ${f.name} already exists`);
    continue;
  }
  await createField(PETS_TABLE, f);
  pAdded++;
  console.log(`  + ${f.name}`);
}
console.log(`  personality: +${pAdded} added, ${pSkipped} skipped\n`);

// ============================================================
// 2. CREATE vet_bills TABLE
// ============================================================
const allTables = await listTables(DATABASE_ID);
let vetBillsTable = allTables.find((t) => t.name === "vet_bills");

const VET_BILLS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "bill_date", type: "date", date_format: "ISO" },
  { name: "clinic_name", type: "text" },
  { name: "total_amount", type: "number", number_decimal_places: 0 },
  {
    name: "category",
    type: "single_select",
    select_options: [
      opt("vaccine", "green"),
      opt("kham_benh", "blue"),
      opt("phau_thuat", "red"),
      opt("thuoc", "orange"),
      opt("grooming", "pink"),
      opt("xet_nghiem", "purple"),
      opt("other", "gray"),
    ],
  },
  { name: "items", type: "long_text" },
  { name: "photo_key", type: "text" },
  { name: "photo_url", type: "url" },
  { name: "ocr_raw", type: "long_text" },
  { name: "ocr_confidence", type: "number", number_decimal_places: 0 },
  { name: "verified", type: "boolean" },
  { name: "notes", type: "long_text" },
  { name: "huhipet_claimed", type: "boolean" },
  { name: "created_at", type: "text" },
];

if (!vetBillsTable) {
  console.log("🔄 Creating vet_bills table...");
  vetBillsTable = await createTable(DATABASE_ID, "vet_bills");
  console.log(`  Created: id=${vetBillsTable.id}\n`);
} else {
  console.log(`⊙ vet_bills already exists (id=${vetBillsTable.id})\n`);
}

// Add missing fields to vet_bills
const vetBillsExisting = await listFields(vetBillsTable.id);
const vetBillsNames = new Set(vetBillsExisting.map((f) => f.name));
let bAdded = 0, bSkipped = 0;

for (const f of VET_BILLS_FIELDS) {
  if (vetBillsNames.has(f.name)) {
    bSkipped++;
    console.log(`  ⊙ ${f.name} already exists`);
    continue;
  }
  await createField(vetBillsTable.id, f);
  bAdded++;
  console.log(`  + ${f.name}`);
}
console.log(`  vet_bills: +${bAdded} added, ${bSkipped} skipped\n`);

// ============================================================
// 3. UPDATE baserow-config.json
// ============================================================
console.log("🔄 Updating baserow-config.json...");
const freshPetsFields = await listFields(PETS_TABLE);
const freshBillsFields = await listFields(vetBillsTable.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));

// Update pets fields
for (const f of freshPetsFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pets.fields[f.name] = f.id;
  }
}

// Add vet_bills table
if (!config.tables.vet_bills) {
  config.tables.vet_bills = { id: vetBillsTable.id, fields: {} };
}
config.tables.vet_bills.id = vetBillsTable.id;
for (const f of freshBillsFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.vet_bills.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("  baserow-config.json updated.\n");

// ============================================================
// 4. POST-COUNT VERIFY
// ============================================================
if (TOKEN) {
  const petsPost = await countRows(PETS_TABLE);
  const ok = petsPost.count === petsPre.count;
  console.log(`📊 Post: pets=${petsPost.count} ${ok ? "✓" : "✗ MISMATCH"}`);
  console.log(`  vet_bills table: id=${vetBillsTable.id}`);
  if (!ok) {
    console.error("\n❌ Row count mismatch!");
    process.exit(1);
  }
}

console.log("\n✅ M16 migration done.");
console.log("   - personality_secondary_type, personality_completed_at, personality_scores added to pets");
console.log("   - vet_bills table created with 14 fields");
console.log("\nRestart vowvet-api để app nhận schema mới:\n  docker compose up -d --force-recreate vowvet-api");
