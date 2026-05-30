/**
 * M27 — Pet Playdate (Tinder matching).
 * 5 tables: playdate_profiles, playdate_swipes, playdate_matches, playdate_messages, playdate_reports.
 * Idempotent: skip table/field if exists.
 *
 * Schema overview:
 *   - playdate_profiles: opt-in profile per pet, vaccine gate ≥2, hidden when ≥3 reports
 *   - playdate_swipes: every swipe action (like/pass), rate-limited 50/day by user
 *   - playdate_matches: mutual likes → match → expires in 7d if no chat
 *   - playdate_messages: chat per match
 *   - playdate_reports: abuse reports, auto-hide profile at ≥3
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

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;
const opt = (value: string, color = "blue") => ({ value, color });

const PROFILES_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "bio", type: "long_text" },
  { name: "max_distance_km", type: "number", number_decimal_places: 0 },
  {
    name: "looking_for",
    type: "single_select",
    select_options: [
      opt("play_buddy", "green"),
      opt("walking_partner", "blue"),
      opt("breeding", "pink"),
      opt("all", "purple"),
    ],
  },
  { name: "play_styles", type: "long_text" }, // JSON array
  { name: "active", type: "boolean" },
  { name: "vaccinated", type: "boolean" }, // cached vaccine eligibility
  { name: "report_count", type: "number", number_decimal_places: 0 },
  { name: "hidden_at", type: "text" }, // set when report_count ≥3
  { name: "lat", type: "number", number_decimal_places: 6, number_negative: true },
  { name: "lng", type: "number", number_decimal_places: 6, number_negative: true },
  { name: "created_at", type: "text" },
  { name: "updated_at", type: "text" },
];

const SWIPES_FIELDS = [
  { name: "from_pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "to_pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  {
    name: "direction",
    type: "single_select",
    select_options: [opt("like", "green"), opt("pass", "gray")],
  },
  { name: "created_at", type: "text" },
];

const MATCHES_FIELDS = [
  { name: "pet_a_id", type: "link_row", link_row_table_id: PETS_TABLE }, // lower pet id
  { name: "pet_b_id", type: "link_row", link_row_table_id: PETS_TABLE }, // higher pet id
  { name: "user_a_id", type: "number", number_decimal_places: 0 },
  { name: "user_b_id", type: "number", number_decimal_places: 0 },
  {
    name: "status",
    type: "single_select",
    select_options: [
      opt("pending", "yellow"),
      opt("active", "green"),
      opt("expired", "gray"),
      opt("blocked", "red"),
    ],
  },
  { name: "matched_at", type: "text" },
  { name: "last_message_at", type: "text" },
  { name: "last_message_by_user", type: "number", number_decimal_places: 0 },
  { name: "block_reason", type: "text" },
  { name: "blocked_by_user", type: "number", number_decimal_places: 0 },
];

const MESSAGES_FIELDS = [
  { name: "match_id", type: "number", number_decimal_places: 0 },
  { name: "sender_user_id", type: "number", number_decimal_places: 0 },
  { name: "sender_pet_id", type: "number", number_decimal_places: 0 },
  { name: "body", type: "long_text" },
  { name: "sent_at", type: "text" },
];

const REPORTS_FIELDS = [
  { name: "reporter_user_id", type: "number", number_decimal_places: 0 },
  { name: "reported_pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "reported_user_id", type: "number", number_decimal_places: 0 },
  {
    name: "reason",
    type: "single_select",
    select_options: [
      opt("spam", "orange"),
      opt("harassment", "red"),
      opt("inappropriate", "pink"),
      opt("fake", "purple"),
      opt("other", "gray"),
    ],
  },
  { name: "notes", type: "long_text" },
  { name: "reviewed", type: "boolean" },
  { name: "admin_notes", type: "long_text" },
  { name: "created_at", type: "text" },
];

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
      console.warn(`  ⚠ field ${f.name} skipped:`, String(err).slice(0, 120));
    }
  }
  console.log(`  ${name}: +${added} fields (id=${t.id})`);
  return t;
}

const profilesTable = await ensureTable("playdate_profiles", PROFILES_FIELDS);
const swipesTable = await ensureTable("playdate_swipes", SWIPES_FIELDS);
const matchesTable = await ensureTable("playdate_matches", MATCHES_FIELDS);
const messagesTable = await ensureTable("playdate_messages", MESSAGES_FIELDS);
const reportsTable = await ensureTable("playdate_reports", REPORTS_FIELDS);

const config: any = JSON.parse(JSON.stringify(existingConfig));
const newTables: Array<[string, TableDef]> = [
  ["playdate_profiles", profilesTable],
  ["playdate_swipes", swipesTable],
  ["playdate_matches", matchesTable],
  ["playdate_messages", messagesTable],
  ["playdate_reports", reportsTable],
];

for (const [name, t] of newTables) {
  const fresh = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  if (!config.tables[name]) config.tables[name] = { id: t.id, fields: {} };
  config.tables[name].id = t.id;
  for (const f of fresh) {
    if (f.name && !["Notes", "Active"].includes(f.name)) {
      config.tables[name].fields[f.name] = f.id;
    }
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n✅ M27 done. 5 playdate tables created.");
