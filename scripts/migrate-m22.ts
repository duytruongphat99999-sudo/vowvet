/**
 * M22 — BCS AI Vision (Body Condition Score).
 * Single table bcs_assessments. Idempotent.
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

interface FieldDef { id: number; name: string; type: string; }
interface TableDef { id: number; name: string; }

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;
const opt = (value: string, color = "blue") => ({ value, color });

const FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "side_photo_key", type: "text" },
  { name: "top_photo_key", type: "text" },
  { name: "side_photo_url", type: "url" },
  { name: "top_photo_url", type: "url" },
  { name: "bcs_score", type: "number", number_decimal_places: 0 },
  {
    name: "bcs_category",
    type: "single_select",
    select_options: [
      opt("underweight", "yellow"),
      opt("ideal", "green"),
      opt("overweight", "orange"),
      opt("obese", "red"),
    ],
  },
  { name: "ai_analysis", type: "long_text" },
  { name: "ai_confidence", type: "number", number_decimal_places: 0 },
  { name: "recommended_action", type: "long_text" },
  { name: "needs_vet_review", type: "boolean" },
  { name: "vet_reviewed_by", type: "number", number_decimal_places: 0 },
  { name: "vet_reviewed_at", type: "text" },
  { name: "vet_override_score", type: "number", number_decimal_places: 0 },
  { name: "vet_notes", type: "long_text" },
  { name: "assessed_at", type: "text" },
  { name: "is_mock", type: "boolean" },
];

const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
let table = tables.find((t) => t.name === "bcs_assessments");
if (!table) {
  console.log("🔄 Creating bcs_assessments...");
  table = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
    method: "POST", body: JSON.stringify({ name: "bcs_assessments" }),
  });
}

const existing = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
const have = new Set(existing.map((f) => f.name));
let added = 0;
for (const f of FIELDS) {
  if (have.has(f.name)) continue;
  await api<FieldDef>(`/database/fields/table/${table.id}/`, { method: "POST", body: JSON.stringify(f) });
  added++;
}
console.log(`bcs_assessments: +${added} fields (id=${table.id})`);

const fresh = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
const config: any = JSON.parse(JSON.stringify(existingConfig));
if (!config.tables.bcs_assessments) config.tables.bcs_assessments = { id: table.id, fields: {} };
config.tables.bcs_assessments.id = table.id;
for (const f of fresh) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.bcs_assessments.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log(`✅ M22 done.`);
