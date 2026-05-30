/**
 * M24 — Cognitive CCDS assessments table.
 * Idempotent.
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("❌ Missing creds"); process.exit(1); }

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: { Authorization: `JWT ${JWT}`, "Content-Type": "application/json", Host: "localhost:8888", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;

interface FieldDef { id: number; name: string; type: string; }
interface TableDef { id: number; name: string; }

const opt = (value: string, color = "blue") => ({ value, color });

const FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "assessed_at", type: "text" },
  { name: "total_score", type: "number", number_decimal_places: 0 },
  {
    name: "category",
    type: "single_select",
    select_options: [
      opt("normal", "green"),
      opt("mild", "yellow"),
      opt("moderate", "orange"),
      opt("severe", "red"),
    ],
  },
  { name: "disorientation_score", type: "number", number_decimal_places: 0 },
  { name: "interaction_score", type: "number", number_decimal_places: 0 },
  { name: "sleep_wake_score", type: "number", number_decimal_places: 0 },
  { name: "house_soiling_score", type: "number", number_decimal_places: 0 },
  { name: "activity_score", type: "number", number_decimal_places: 0 },
  { name: "anxiety_score", type: "number", number_decimal_places: 0 },
  { name: "raw_answers", type: "long_text" },
  { name: "notes", type: "long_text" },
  { name: "needs_vet", type: "boolean" },
  { name: "created_at", type: "text" },
];

const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
let table = tables.find((t) => t.name === "cognitive_assessments");
if (!table) {
  console.log("🔄 Creating cognitive_assessments...");
  table = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
    method: "POST", body: JSON.stringify({ name: "cognitive_assessments" }),
  });
}

const existing = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
const have = new Set(existing.map((f) => f.name));
let added = 0;
for (const f of FIELDS) {
  if (have.has(f.name)) continue;
  await api<FieldDef>(`/database/fields/table/${table.id}/`, { method: "POST", body: JSON.stringify(f) });
  added++;
  console.log(`  + ${f.name}`);
}
console.log(`cognitive_assessments: +${added} fields\n`);

// Sync baserow-config.json
const fresh = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
const config: any = JSON.parse(JSON.stringify(existingConfig));
if (!config.tables.cognitive_assessments) config.tables.cognitive_assessments = { id: table.id, fields: {} };
config.tables.cognitive_assessments.id = table.id;
for (const f of fresh) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.cognitive_assessments.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log(`✅ M24 done. cognitive_assessments id=${table.id}`);
