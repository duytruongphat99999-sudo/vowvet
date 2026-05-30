/**
 * Care Plan completions migration — single table `care_plan_completions`.
 *
 * Idempotent. Persists table id + field ids to baserow-config.json.
 *
 * **What it stores**: each Care Plan item (meal, exercise, water, monitor) that
 * the user has marked "Đã làm" today. Read by the dashboard CarePlanProgress
 * widget + the per-item checkbox on /pets/[id]/care-plan.
 *
 * Fields:
 *   - user_id              number(int)       — owner (FK to users by value)
 *   - pet_id               link_row → pets
 *   - care_plan_date       text              — "YYYY-MM-DD" (matches todayVN())
 *   - item_key             text              — "feeding_07_00" / "exercise_06_30" / "water_morning" / etc
 *   - item_type            single_select     — feeding | exercise | water | training | monitoring | other
 *   - completed_at         text              — ISO timestamp
 *   - notes                long_text         — optional user note
 *   - created_at           text              — ISO timestamp (for orderBy)
 *
 * Run:
 *   docker compose exec vowvet-api bun run scripts/migrate-care-plan-completions.ts
 *   docker cp vowvet-api:/tmp/baserow-config.new.json ./baserow-config.json
 *   docker compose restart vowvet-api
 */
import { writeFileSync, readFileSync } from "node:fs";

const configPath = Bun.env.BASEROW_CONFIG_IN || "/app/baserow-config.json";
const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD env.");
  process.exit(1);
}

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`❌ Baserow login failed: ${loginRes.status}`);
  process.exit(1);
}
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };

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
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef { id: number; name: string; type: string; }
interface TableDef { id: number; name: string; }

const DATABASE_ID = (existingConfig as any).database_id;
if (!DATABASE_ID) {
  console.error("❌ database_id missing from baserow-config.json");
  process.exit(1);
}

const opt = (value: string, color = "blue") => ({ value, color });

async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
  let t = tables.find((x) => x.name === name);
  if (!t) {
    console.log(`🔄 Creating ${name}...`);
    t = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } else {
    console.log(`  ↳ ${name} table already exists (id=${t.id})`);
  }
  const existing = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  const have = new Set(existing.map((f) => f.name));
  let added = 0;
  for (const f of fields) {
    if (have.has(f.name)) continue;
    try {
      await api<FieldDef>(`/database/fields/table/${t.id}/`, {
        method: "POST",
        body: JSON.stringify(f),
      });
      added++;
    } catch (err) {
      console.warn(`  ⚠ ${name}.${f.name} skipped:`, String(err).slice(0, 120));
    }
  }
  console.log(`  ${name}: +${added} fields (id=${t.id})`);
  return t;
}

// ─── care_plan_completions ─────────────────────────────────────────
const petsTableId = (existingConfig as any).tables?.pets?.id;
if (!petsTableId) {
  console.error("❌ tables.pets.id missing from baserow-config.json — cannot create link_row field");
  process.exit(1);
}

const CARE_PLAN_COMPLETIONS_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: petsTableId },
  { name: "care_plan_date", type: "text" },
  { name: "item_key", type: "text" },
  {
    name: "item_type",
    type: "single_select",
    select_options: [
      opt("feeding", "orange"),
      opt("exercise", "green"),
      opt("water", "blue"),
      opt("training", "purple"),
      opt("monitoring", "yellow"),
      opt("other", "gray"),
    ],
  },
  { name: "completed_at", type: "text" },
  { name: "notes", type: "long_text" },
  { name: "created_at", type: "text" },
];

const created: Array<[string, TableDef]> = [];
const t = await ensureTable("care_plan_completions", CARE_PLAN_COMPLETIONS_FIELDS);
created.push(["care_plan_completions", t]);

// ─── Persist config ────────────────────────────────────────────────
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const [name, table] of created) {
  const fresh = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
  if (!config.tables[name]) config.tables[name] = { id: table.id, fields: {} };
  config.tables[name].id = table.id;
  for (const f of fresh) {
    if (f.name) config.tables[name].fields[f.name] = f.id;
  }
}

const outPath = Bun.env.BASEROW_CONFIG_OUT || "/tmp/baserow-config.new.json";
writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`\n✅ care_plan_completions migration done. New config → ${outPath}`);
console.log(`   Run on host:`);
console.log(`     docker cp vowvet-api:${outPath} ./baserow-config.json`);
console.log(`     docker compose restart vowvet-api`);
