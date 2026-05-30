/**
 * Insurance waitlist migration — single table `insurance_waitlist`.
 *
 * Idempotent. Persists table id + field ids to baserow-config.json.
 *
 * Fields:
 *   - email                text             (required, unique-ish enforced in API)
 *   - phone                text             (optional — Zalo / SĐT)
 *   - pet_count            number(int)
 *   - pet_species          single_select    dog | cat | both
 *   - pet_age_range        single_select    puppy | adult | senior | mixed
 *   - interest_level       single_select    just_curious | comparing | ready_to_buy
 *   - pet_score_avg        number(int)      (filled later from VowVet pet score)
 *   - referred_from        text             (UTM / referrer)
 *   - notes                long_text        (admin notes)
 *   - contacted            boolean          (default false)
 *   - contacted_at         text             (ISO timestamp, set when admin contacts)
 *   - created_at           text             (ISO timestamp)
 */
import { writeFileSync, readFileSync } from "node:fs";
const configPath = Bun.env.BASEROW_CONFIG_IN || "/app/baserow-config.json";
const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD"); process.exit(1); }

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

const DATABASE_ID = (existingConfig as any).database_id;
const opt = (value: string, color = "blue") => ({ value, color });

async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
  let t = tables.find((x) => x.name === name);
  if (!t) {
    console.log(`🔄 Creating ${name}...`);
    t = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
      method: "POST", body: JSON.stringify({ name }),
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
      await api<FieldDef>(`/database/fields/table/${t.id}/`, { method: "POST", body: JSON.stringify(f) });
      added++;
    } catch (err) {
      console.warn(`  ⚠ ${name}.${f.name} skipped:`, String(err).slice(0, 120));
    }
  }
  console.log(`  ${name}: +${added} fields (id=${t.id})`);
  return t;
}

const INSURANCE_WAITLIST_FIELDS = [
  { name: "email", type: "text" },
  { name: "phone", type: "text" },
  { name: "pet_count", type: "number", number_decimal_places: 0 },
  {
    name: "pet_species",
    type: "single_select",
    select_options: [opt("dog", "blue"), opt("cat", "pink"), opt("both", "purple")],
  },
  {
    name: "pet_age_range",
    type: "single_select",
    select_options: [opt("puppy", "green"), opt("adult", "blue"), opt("senior", "orange"), opt("mixed", "gray")],
  },
  {
    name: "interest_level",
    type: "single_select",
    select_options: [opt("just_curious", "gray"), opt("comparing", "blue"), opt("ready_to_buy", "green")],
  },
  { name: "pet_score_avg", type: "number", number_decimal_places: 0 },
  { name: "referred_from", type: "text" },
  { name: "notes", type: "long_text" },
  { name: "contacted", type: "boolean" },
  { name: "contacted_at", type: "text" },
  { name: "created_at", type: "text" },
];

const created: Array<[string, TableDef]> = [];
const t = await ensureTable("insurance_waitlist", INSURANCE_WAITLIST_FIELDS);
created.push(["insurance_waitlist", t]);

// Persist config (matches gamification migration pattern)
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const [name, table] of created) {
  const fresh = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
  if (!config.tables[name]) config.tables[name] = { id: table.id, fields: {} };
  config.tables[name].id = table.id;
  for (const f of fresh) {
    if (f.name) config.tables[name].fields[f.name] = f.id;
  }
}
// Write to a temp path (config is mounted :ro in container).
// Use BASEROW_CONFIG_OUT env to override (default: /tmp/baserow-config.new.json)
const outPath = Bun.env.BASEROW_CONFIG_OUT || "/tmp/baserow-config.new.json";
writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`\n✅ insurance_waitlist migration done. New config → ${outPath}`);
console.log(`   Run: docker cp vowvet-api:${outPath} <host-path>/baserow-config.json`);
