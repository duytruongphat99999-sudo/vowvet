/**
 * Lost Pet Network upgrade migration (4 features).
 *
 * Adds fields to existing tables:
 *   - lost_pet_reports: reference_photo_urls + reward_tier/status/recipient/paid_at
 *   - lost_pet_sightings: AI match fields + status + confirmed_at + geocoded_method
 *   - users: pet_heroes_count + pet_score_bonus + hero_badge_tier + hero_first/last_at + public_profile_*
 *
 * Creates:
 *   - hero_acts (NEW table) — 8 fields, link_row to pets/reports/sightings
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
const REPORTS_TABLE = existingConfig.tables.lost_pet_reports.id;
const SIGHTINGS_TABLE = existingConfig.tables.lost_pet_sightings.id;
const USERS_TABLE = existingConfig.tables.users.id;

const opt = (value: string, color = "blue") => ({ value, color });

async function ensureFields(tableId: number, label: string, fields: any[]): Promise<void> {
  const existing = await api<FieldDef[]>(`/database/fields/table/${tableId}/`);
  const have = new Set(existing.map((f) => f.name));
  let added = 0;
  for (const f of fields) {
    if (have.has(f.name)) continue;
    try {
      await api<FieldDef>(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(f) });
      added++;
    } catch (err) {
      console.warn(`  ⚠ ${label}.${f.name} skipped:`, String(err).slice(0, 120));
    }
  }
  console.log(`  ${label}: +${added} fields (existing: ${existing.length})`);
}

async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
  let t = tables.find((x) => x.name === name);
  if (!t) {
    console.log(`🔄 Creating ${name}...`);
    t = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
      method: "POST", body: JSON.stringify({ name }),
    });
  }
  await ensureFields(t.id, name, fields);
  return t;
}

// ============================================================
// 1) lost_pet_reports — extend
// ============================================================
console.log("\n=== Extending lost_pet_reports ===");
await ensureFields(REPORTS_TABLE, "lost_pet_reports", [
  { name: "reference_photo_urls", type: "long_text" }, // JSON array of URLs (R2)
  {
    name: "reward_tier",
    type: "single_select",
    select_options: [
      opt("none", "gray"),
      opt("bronze", "orange"),
      opt("silver", "gray"),
      opt("gold", "yellow"),
      opt("diamond", "blue"),
      opt("custom", "purple"),
    ],
  },
  {
    name: "reward_status",
    type: "single_select",
    select_options: [
      opt("promised", "yellow"),
      opt("paid_out", "green"),
      opt("unclaimed", "gray"),
    ],
  },
  { name: "reward_recipient_id", type: "number", number_decimal_places: 0 },
  { name: "reward_paid_at", type: "text" }, // ISO
]);

// ============================================================
// 2) lost_pet_sightings — extend
// ============================================================
console.log("\n=== Extending lost_pet_sightings ===");
await ensureFields(SIGHTINGS_TABLE, "lost_pet_sightings", [
  { name: "reporter_user_id", type: "number", number_decimal_places: 0 }, // for auth-tracked sightings (separate from spotter_user_id which is vet-scan only)
  { name: "ai_match_score", type: "number", number_decimal_places: 0 },
  {
    name: "ai_match_confidence",
    type: "single_select",
    select_options: [
      opt("high", "green"),
      opt("medium", "yellow"),
      opt("low", "orange"),
      opt("failed", "gray"),
    ],
  },
  { name: "ai_match_analysis", type: "long_text" },
  { name: "ai_processed_at", type: "text" }, // ISO
  { name: "ai_is_mock", type: "boolean" },
  { name: "match_threshold_passed", type: "boolean" },
  {
    name: "status",
    type: "single_select",
    select_options: [
      opt("pending", "yellow"),
      opt("confirmed_by_owner", "green"),
      opt("dismissed_by_owner", "red"),
      opt("resolved", "blue"),
    ],
  },
  { name: "confirmed_at", type: "text" },
  {
    name: "geocoded_method",
    type: "single_select",
    select_options: [
      opt("user_pick", "green"),
      opt("address_lookup", "yellow"),
      opt("none", "gray"),
    ],
  },
]);

// ============================================================
// 3) users — extend with hero fields
// ============================================================
console.log("\n=== Extending users (hero fields) ===");
await ensureFields(USERS_TABLE, "users", [
  { name: "pet_heroes_count", type: "number", number_decimal_places: 0 },
  { name: "pet_score_bonus", type: "number", number_decimal_places: 0 },
  {
    name: "hero_badge_tier",
    type: "single_select",
    select_options: [
      opt("none", "gray"),
      opt("helper", "blue"),
      opt("hero", "purple"),
      opt("legend", "orange"),
      opt("guardian", "yellow"),
    ],
  },
  { name: "hero_first_at", type: "text" },
  { name: "hero_last_at", type: "text" },
  { name: "public_profile_enabled", type: "boolean" },
  { name: "public_profile_slug", type: "text" },
]);

// ============================================================
// 4) hero_acts — NEW table
// ============================================================
console.log("\n=== Creating hero_acts ===");
const HERO_ACTS_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "report_id", type: "number", number_decimal_places: 0 }, // FK without link_row to avoid cascade reciprocal field
  { name: "sighting_id", type: "number", number_decimal_places: 0 },
  {
    name: "act_type",
    type: "single_select",
    select_options: [
      opt("sighting_confirmed", "green"),
      opt("broadcast_shared", "blue"),
      opt("direct_rescue", "purple"),
    ],
  },
  { name: "reward_received", type: "number", number_decimal_places: 0 },
  { name: "bonus_score", type: "number", number_decimal_places: 0 },
  { name: "created_at", type: "text" },
];
const heroActsTable = await ensureTable("hero_acts", HERO_ACTS_FIELDS);

// ============================================================
// Persist updated config
// ============================================================
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const [name, tid] of [
  ["lost_pet_reports", REPORTS_TABLE],
  ["lost_pet_sightings", SIGHTINGS_TABLE],
  ["users", USERS_TABLE],
  ["hero_acts", heroActsTable.id],
] as const) {
  const fresh = await api<FieldDef[]>(`/database/fields/table/${tid}/`);
  if (!config.tables[name]) config.tables[name] = { id: tid, fields: {} };
  config.tables[name].id = tid;
  for (const f of fresh) {
    if (f.name && !["Notes", "Active"].includes(f.name)) {
      config.tables[name].fields[f.name] = f.id;
    }
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n✅ Lost Pet upgrade migration done.");
