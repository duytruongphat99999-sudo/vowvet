/**
 * M20 Lost Pet Network migration.
 *
 * Idempotent. Tables created:
 *   1. lost_pet_reports
 *   2. lost_pet_sightings
 *   3. vet_partners (with Mon Min HCMC seed)
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m20-lost-pets.ts
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD.");
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
console.log("[migrate-m20-lost-pets] Logged in.\n");

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

async function tokenPost<T = any>(path: string, body: any): Promise<T> {
  if (!TOKEN) throw new Error("BASEROW_TOKEN required for seed");
  const res = await fetch(`${BASEROW_URL}/api${path}?user_field_names=true`, {
    method: "POST",
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Token POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function tokenList<T = any>(path: string): Promise<{ count: number; results: T[] }> {
  if (!TOKEN) throw new Error("BASEROW_TOKEN required");
  const res = await fetch(`${BASEROW_URL}/api${path}?user_field_names=true&size=10`, {
    headers: { Authorization: `Token ${TOKEN}`, Host: "localhost:8888" },
  });
  if (!res.ok) throw new Error(`Token GET ${path} → ${res.status}`);
  return res.json() as Promise<{ count: number; results: T[] }>;
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

const REPORTS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "reporter_user_id", type: "number", number_decimal_places: 0 },
  {
    name: "status",
    type: "single_select",
    select_options: [
      opt("active", "red"),
      opt("found", "green"),
      opt("cancelled", "gray"),
      opt("resolved_no_match", "yellow"),
    ],
  },
  { name: "last_seen_location", type: "text" },
  { name: "last_seen_lat", type: "number", number_decimal_places: 6 },
  { name: "last_seen_lng", type: "number", number_decimal_places: 6 },
  { name: "last_seen_at", type: "text" },
  { name: "circumstances", type: "long_text" },
  { name: "distinguishing_features", type: "long_text" },
  { name: "contact_phone", type: "text" },
  { name: "contact_phone_public", type: "boolean" },
  { name: "reward_amount", type: "number", number_decimal_places: 0 },
  { name: "broadcast_radius_km", type: "number", number_decimal_places: 0 },
  { name: "broadcast_count", type: "number", number_decimal_places: 0 },
  { name: "sighting_count", type: "number", number_decimal_places: 0 },
  { name: "created_at", type: "text" },
  { name: "resolved_at", type: "text" },
  { name: "public_url_slug", type: "text" },
];

const SIGHTINGS_FIELDS = [
  { name: "report_id", type: "number", number_decimal_places: 0 },
  { name: "spotter_user_id", type: "number", number_decimal_places: 0 },
  { name: "spotter_name", type: "text" },
  { name: "spotter_phone", type: "text" },
  { name: "sighting_lat", type: "number", number_decimal_places: 6 },
  { name: "sighting_lng", type: "number", number_decimal_places: 6 },
  { name: "sighting_address", type: "text" },
  { name: "sighting_at", type: "text" },
  { name: "description", type: "long_text" },
  { name: "photo_key", type: "text" },
  { name: "photo_url", type: "url" },
  { name: "verified", type: "boolean" },
  { name: "created_at", type: "text" },
];

const VET_PARTNERS_FIELDS = [
  { name: "name", type: "text" },
  { name: "address", type: "text" },
  { name: "lat", type: "number", number_decimal_places: 6 },
  { name: "lng", type: "number", number_decimal_places: 6 },
  { name: "phone", type: "text" },
  { name: "email", type: "text" },
  { name: "can_scan_qr", type: "boolean" },
  { name: "can_scan_nose_print", type: "boolean" },
  { name: "verified", type: "boolean" },
  { name: "active", type: "boolean" },
  { name: "created_at", type: "text" },
];

async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const allTables = await listTables(DATABASE_ID);
  let table = allTables.find((t) => t.name === name);
  if (!table) {
    console.log(`🔄 Creating ${name}...`);
    table = await createTable(DATABASE_ID, name);
  } else {
    console.log(`⊙ ${name} exists (id=${table.id})`);
  }
  const existing = await listFields(table.id);
  const existingNames = new Set(existing.map((f) => f.name));
  let added = 0;
  for (const f of fields) {
    if (existingNames.has(f.name)) continue;
    await createField(table.id, f);
    added++;
    console.log(`  + ${f.name}`);
  }
  console.log(`  ${name}: +${added}\n`);
  return table;
}

const reportsTable = await ensureTable("lost_pet_reports", REPORTS_FIELDS);
const sightingsTable = await ensureTable("lost_pet_sightings", SIGHTINGS_FIELDS);
const vetPartnersTable = await ensureTable("vet_partners", VET_PARTNERS_FIELDS);

// ============================================================
// Update baserow-config.json
// ============================================================
console.log("🔄 Updating baserow-config.json...");
const config: any = JSON.parse(JSON.stringify(existingConfig));
async function syncTable(name: string, table: TableDef) {
  const fresh = await listFields(table.id);
  if (!config.tables[name]) config.tables[name] = { id: table.id, fields: {} };
  config.tables[name].id = table.id;
  for (const f of fresh) {
    if (f.name && !["Notes", "Active"].includes(f.name)) {
      config.tables[name].fields[f.name] = f.id;
    }
  }
}
await syncTable("lost_pet_reports", reportsTable);
await syncTable("lost_pet_sightings", sightingsTable);
await syncTable("vet_partners", vetPartnersTable);
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("  baserow-config.json updated.\n");

// ============================================================
// Seed Mon Min HCMC vet partner
// ============================================================
if (TOKEN) {
  try {
    const existing = await tokenList<any>(`/database/rows/table/${vetPartnersTable.id}/`);
    if ((existing.count || 0) === 0) {
      console.log("🔄 Seeding Mon Min HCMC vet partner...");
      await tokenPost(`/database/rows/table/${vetPartnersTable.id}/`, {
        name: "Mon Min Pet Clinic - HCMC",
        address: "Quận 1, TP. Hồ Chí Minh",
        lat: 10.7769,
        lng: 106.7009,
        phone: "+84779029133",
        email: "vowvet@monminpet.com",
        can_scan_qr: true,
        can_scan_nose_print: false,
        verified: true,
        active: true,
        created_at: new Date().toISOString(),
      });
      console.log("  ✓ Seeded Mon Min clinic\n");
    } else {
      console.log(`⊙ vet_partners already has ${existing.count} rows — skipping seed\n`);
    }
  } catch (err) {
    console.warn("⚠️ Seed vet partner failed (non-fatal):", err);
  }
}

console.log("✅ M20 Lost Pet migration done.");
console.log(`   lost_pet_reports: id=${reportsTable.id}`);
console.log(`   lost_pet_sightings: id=${sightingsTable.id}`);
console.log(`   vet_partners: id=${vetPartnersTable.id}`);
console.log("\nRestart vowvet-api:\n  docker compose up -d --force-recreate vowvet-api");
