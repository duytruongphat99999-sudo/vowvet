/**
 * M30 — Memorial Hall (placeholder).
 * 3 tables: memorials, memorial_visits, memorial_interest.
 * Idempotent.
 *
 * IMPORTANT: Free tier hoạt động đầy đủ. Premium tiers chỉ thu thập "interest"
 * — KHÔNG xử lý payment, KHÔNG cam kết dịch vụ hỏa táng.
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

const MEMORIAL_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "passed_away_date", type: "date", date_format: "ISO" },
  { name: "tribute_message", type: "long_text" },
  { name: "cover_photo_url", type: "url" },
  { name: "photo_urls", type: "long_text" },
  { name: "music_url", type: "url" },
  {
    name: "memorial_status",
    type: "single_select",
    select_options: [opt("active", "green"), opt("private", "yellow"), opt("archived", "gray")],
  },
  {
    name: "tier",
    type: "single_select",
    select_options: [opt("free", "green"), opt("tribute", "purple"), opt("lifetime", "orange"), opt("pro", "red")],
  },
  { name: "public_slug", type: "text" },
  { name: "visitor_count", type: "number", number_decimal_places: 0 },
  { name: "candles_lit_count", type: "number", number_decimal_places: 0 },
  { name: "anniversary_reminder_year", type: "number", number_decimal_places: 0 },
  { name: "created_at", type: "text" },
];

const VISITS_FIELDS = [
  { name: "memorial_id", type: "number", number_decimal_places: 0 },
  { name: "visitor_name", type: "text" },
  { name: "visitor_email", type: "text" },
  { name: "message", type: "long_text" },
  { name: "candle_lit", type: "boolean" },
  { name: "visited_at", type: "text" },
];

const INTEREST_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "memorial_id", type: "number", number_decimal_places: 0 },
  {
    name: "tier_interested",
    type: "single_select",
    select_options: [opt("tribute", "purple"), opt("lifetime", "orange"), opt("pro", "red")],
  },
  { name: "contact_phone", type: "text" },
  { name: "contact_preferred_time", type: "text" },
  { name: "notes", type: "long_text" },
  { name: "contacted_back", type: "boolean" },
  { name: "contacted_at", type: "text" },
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
    await api<FieldDef>(`/database/fields/table/${t.id}/`, { method: "POST", body: JSON.stringify(f) });
    added++;
  }
  console.log(`  ${name}: +${added} fields (id=${t.id})`);
  return t;
}

const memorialsTable = await ensureTable("memorials", MEMORIAL_FIELDS);
const visitsTable = await ensureTable("memorial_visits", VISITS_FIELDS);
const interestTable = await ensureTable("memorial_interest", INTEREST_FIELDS);

const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const [name, t] of [["memorials", memorialsTable], ["memorial_visits", visitsTable], ["memorial_interest", interestTable]] as const) {
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
console.log("\n✅ M30 done. memorials/visits/interest tables created.");
