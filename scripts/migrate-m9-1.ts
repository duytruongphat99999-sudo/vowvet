/**
 * M9.1 migration: Symptom Triage AI.
 *
 * Idempotent.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m9-1.ts
 *
 * Changes:
 *   triage_sessions: NEW table (12 fields)
 *   (Symptom library hardcoded ở shared/triage-symptoms.ts, KHÔNG seed DB)
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
      "  bun run scripts/migrate-m9-1.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m9-1] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate-m9-1] Logged in.\n");

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
// 1. CREATE triage_sessions TABLE
// ============================================================
const tables = await listTables(DATABASE_ID);
let triageTable = tables.find((t) => t.name === "triage_sessions");

const TRIAGE_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  // symptoms_json: array of symptom IDs (slug) lưu dạng JSON string trong long_text
  { name: "symptoms_json", type: "long_text" },
  { name: "duration_hours", type: "number", number_decimal_places: 1, number_negative: false },
  // ai_urgency_level: 1-5 int
  { name: "ai_urgency_level", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "ai_reasoning_text", type: "long_text" },
  { name: "ai_recommended_action", type: "long_text" },
  // user_action_taken: single_select
  {
    name: "user_action_taken",
    type: "single_select",
    select_options: [
      opt("monitor", "blue"),
      opt("book_clinic", "orange"),
      opt("emergency", "red"),
      opt("ignored", "gray"),
    ],
  },
  // vet_review_status: single_select
  {
    name: "vet_review_status",
    type: "single_select",
    select_options: [
      opt("pending", "yellow"),
      opt("reviewed", "green"),
      opt("disagree", "red"),
    ],
  },
  { name: "vet_review_notes", type: "long_text" },
  // user_id stored as text (phone string from JWT) for audit. Not link to avoid complexity.
  { name: "user_phone", type: "text" },
  // user_notes free text user nhập step 3
  { name: "user_notes", type: "long_text" },
  // ai_cost_usd tracking để admin xem cost per triage
  { name: "ai_cost_usd", type: "number", number_decimal_places: 4, number_negative: false },
];

if (!triageTable) {
  console.log("🆕 Creating triage_sessions table...");
  triageTable = await createTable(DATABASE_ID, "triage_sessions");
  for (const fieldDef of TRIAGE_FIELDS) {
    await createField(triageTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 triage_sessions đã tồn tại (id=${triageTable.id}). Ensuring fields...`);
  const existing = await listFields(triageTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of TRIAGE_FIELDS) {
    if (!existingN.has(fieldDef.name as string)) {
      await createField(triageTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 2. UPDATE baserow-config.json
// ============================================================
const newTriageFields = await listFields(triageTable!.id);
const config: any = JSON.parse(JSON.stringify(existingConfig));
if (!config.tables.triage_sessions) config.tables.triage_sessions = { id: triageTable!.id, fields: {} };
config.tables.triage_sessions.id = triageTable!.id;
for (const f of newTriageFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.triage_sessions.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m9-1] baserow-config.json updated.\n");

// ============================================================
// 3. POST-COUNT
// ============================================================
const petsPost = await listRowsToken(PETS_TABLE);
const triageCount = await listRowsToken(triageTable!.id);

console.log(`📊 Post-migration:`);
console.log(`  pets: ${petsPost.count} rows ${petsPost.count === petsPre.count ? "✓ MATCH" : "✗ MISMATCH"}`);
console.log(`  triage_sessions: ${triageCount.count} rows (mostly Baserow stubs Phase 0)`);

if (petsPost.count !== petsPre.count) {
  console.error("\n❌ Pet count mismatch — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M9.1 migration hoàn tất an toàn. Symptom triage table ready.");
console.log("   Symptom library: shared/triage-symptoms.ts (72 symptoms hardcoded).");
