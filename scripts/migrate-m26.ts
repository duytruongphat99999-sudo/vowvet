/**
 * M26 — Pet Map + Pet-Friendly Places.
 * 2 tables: places + place_checkins. Idempotent.
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

const PLACES_FIELDS = [
  { name: "name", type: "text" },
  { name: "address", type: "text" },
  { name: "lat", type: "number", number_decimal_places: 6 },
  { name: "lng", type: "number", number_decimal_places: 6 },
  {
    name: "category",
    type: "single_select",
    select_options: [
      opt("cafe", "brown"), opt("restaurant", "orange"), opt("park", "green"),
      opt("hotel", "purple"), opt("grooming", "pink"), opt("vet", "red"),
      opt("pet_shop", "yellow"), opt("beach", "blue"), opt("other", "gray"),
    ],
  },
  {
    name: "pet_policy",
    type: "single_select",
    select_options: [
      opt("allowed", "green"), opt("leash_only", "yellow"),
      opt("small_pets_only", "blue"), opt("private_only", "orange"),
      opt("by_request", "gray"),
    ],
  },
  { name: "amenities", type: "long_text" },
  { name: "avg_rating", type: "number", number_decimal_places: 2 },
  { name: "total_checkins", type: "number", number_decimal_places: 0 },
  { name: "total_reviews", type: "number", number_decimal_places: 0 },
  { name: "contact_phone", type: "text" },
  { name: "contact_website", type: "url" },
  { name: "photo_urls", type: "long_text" },
  { name: "created_by", type: "number", number_decimal_places: 0 },
  { name: "verified", type: "boolean" },
  { name: "active", type: "boolean" },
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

const placesTable = await ensureTable("places", PLACES_FIELDS);

const CHECKINS_FIELDS = [
  { name: "place_id", type: "link_row", link_row_table_id: placesTable.id },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "visited_at", type: "text" },
  { name: "rating", type: "number", number_decimal_places: 0 },
  { name: "review", type: "long_text" },
  { name: "photo_urls", type: "long_text" },
  { name: "created_at", type: "text" },
];

const checkinsTable = await ensureTable("place_checkins", CHECKINS_FIELDS);

// Sync config
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const [name, t] of [["places", placesTable], ["place_checkins", checkinsTable]] as const) {
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

console.log(`\n✅ M26 schema done. places id=${placesTable.id}, place_checkins id=${checkinsTable.id}`);
console.log(`Run seed script next: bun run scripts/seed-m26-places.ts`);
