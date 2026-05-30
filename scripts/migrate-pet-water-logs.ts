/**
 * pet_water_logs migration — single table.
 *
 * Idempotent. Persists table id + field ids to baserow-config.json.
 * Clone of migrate-pet-exercise-logs.ts — same JWT pattern, different fields.
 *
 * **What it stores**: each water intake measurement the user logs from the
 * Care Plan "Ghi nhận lượng nước" modal next to the eating.water_note. The
 * endpoint also mirror-writes a `water_main` row to care_plan_completions
 * (item_type="water") so the progress bar reflects logged hydration; trifecta
 * detection only counts feeding+exercise+monitoring so water doesn't gate it.
 *
 * Fields:
 *   - pet_id        link_row → pets
 *   - user_id       number(int)
 *   - log_date      text       "YYYY-MM-DD" (todayVN())
 *   - amount_ml     number(int) — what owner reports (50..2000)
 *   - target_ml     number(int) — what AI recommended for the day
 *   - frequency     single_select — little | normal | much | unknown
 *   - notes         long_text
 *   - item_key      text       — "water_main" (single daily slot for now)
 *   - created_at    text       — ISO timestamp
 *
 * Run:
 *   cat scripts/migrate-pet-water-logs.ts | docker exec -i vowvet-api sh -c 'cat > /tmp/migrate-pet-water-logs.ts'
 *   docker exec vowvet-api bun run /tmp/migrate-pet-water-logs.ts
 *   docker exec vowvet-api cat /tmp/baserow-config.new.json > baserow-config.json
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

// ─── pet_water_logs ────────────────────────────────────────────────
const petsTableId = (existingConfig as any).tables?.pets?.id;
if (!petsTableId) {
  console.error("❌ tables.pets.id missing from baserow-config.json — cannot create link_row field");
  process.exit(1);
}

const PET_WATER_LOGS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: petsTableId },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "log_date", type: "text" },
  { name: "amount_ml", type: "number", number_decimal_places: 0 },
  { name: "target_ml", type: "number", number_decimal_places: 0 },
  {
    name: "frequency",
    type: "single_select",
    select_options: [
      opt("little", "red"),
      opt("normal", "green"),
      opt("much", "blue"),
      opt("unknown", "gray"),
    ],
  },
  { name: "notes", type: "long_text" },
  { name: "item_key", type: "text" },
  { name: "created_at", type: "text" },
];

const created: Array<[string, TableDef]> = [];
const t = await ensureTable("pet_water_logs", PET_WATER_LOGS_FIELDS);
created.push(["pet_water_logs", t]);

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
console.log(`\n✅ pet_water_logs migration done. New config → ${outPath}`);
console.log(`   Run on host:`);
console.log(`     docker cp vowvet-api:${outPath} ./baserow-config.json`);
console.log(`     docker compose restart vowvet-api`);
