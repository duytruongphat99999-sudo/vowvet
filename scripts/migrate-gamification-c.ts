/**
 * Session C — Polish layer migration.
 *
 * 1 new table: community_events (real-time activity feed)
 *
 * Idempotent.
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

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

const DATABASE_ID = existingConfig.database_id;
const PETS_TABLE = existingConfig.tables.pets.id;
const opt = (value: string, color = "blue") => ({ value, color });

async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
  let t = tables.find((x) => x.name === name);
  if (!t) {
    console.log(`🔄 Creating ${name}...`);
    t = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
      method: "POST", body: JSON.stringify({ name }),
    });
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

const COMMUNITY_EVENTS_FIELDS = [
  {
    name: "event_type",
    type: "single_select",
    select_options: [
      opt("tier_up", "yellow"),
      opt("achievement_unlock", "violet"),
      opt("hero_action", "purple"),
      opt("new_match", "pink"),
      opt("birthday", "orange"),
    ],
  },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "pet_name", type: "text" },
  { name: "pet_avatar_url", type: "text" },
  { name: "event_data", type: "long_text" }, // JSON
  { name: "is_public", type: "boolean" },
  { name: "created_at", type: "text" },
];

console.log("\n=== Session C migration ===");
const t = await ensureTable("community_events", COMMUNITY_EVENTS_FIELDS);

const config: any = JSON.parse(JSON.stringify(existingConfig));
const fresh = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
if (!config.tables.community_events) config.tables.community_events = { id: t.id, fields: {} };
config.tables.community_events.id = t.id;
for (const f of fresh) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.community_events.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n✅ Session C migration done.");
