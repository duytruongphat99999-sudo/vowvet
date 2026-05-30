/**
 * Session B — Engagement layer migration.
 *
 * 4 new tables + 3 users fields.
 *
 *   user_nudges_sent       — track which nudges fired to which user (rate-limit + analytics)
 *   leaderboard_snapshots  — monthly Pet Score rankings (for "rank last month")
 *   quest_definitions      — catalog of daily quest templates (admin-editable in Baserow)
 *   user_daily_quests      — assigned quests per user × pet × date
 *
 *   users.show_in_leaderboard (boolean) — opt-in for privacy
 *   users.leaderboard_pet_id (link_row → pets) — which pet to feature
 *   users.public_display_name (text) — alias instead of real name
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
  console.log(`  ${label}: +${added} fields`);
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
// 1) user_nudges_sent
// ============================================================
const NUDGES_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  {
    name: "nudge_type",
    type: "single_select",
    select_options: [
      opt("tier_close", "yellow"),
      opt("streak_at_risk", "orange"),
      opt("achievement_close", "purple"),
      opt("reward_expiring", "red"),
      opt("profile_completion", "blue"),
    ],
  },
  { name: "nudge_key", type: "text" }, // dedupe within day
  { name: "sent_at", type: "text" },
  {
    name: "response",
    type: "single_select",
    select_options: [
      opt("clicked", "green"),
      opt("dismissed", "red"),
      opt("ignored", "gray"),
      opt("unknown", "gray"),
    ],
  },
  { name: "created_at", type: "text" },
];

// ============================================================
// 2) leaderboard_snapshots
// ============================================================
const LB_SNAPSHOT_FIELDS = [
  { name: "snapshot_month", type: "text" }, // '2026-05'
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_score", type: "number", number_decimal_places: 0 },
  { name: "rank_overall", type: "number", number_decimal_places: 0 },
  { name: "rank_species", type: "number", number_decimal_places: 0 },
  { name: "rank_district", type: "number", number_decimal_places: 0 },
  { name: "achievements_count", type: "number", number_decimal_places: 0 },
  { name: "snapshot_date", type: "text" },
];

// ============================================================
// 3) quest_definitions
// ============================================================
const QUEST_DEF_FIELDS = [
  { name: "code", type: "text" },
  { name: "name", type: "text" },
  { name: "description", type: "long_text" },
  { name: "emoji", type: "text" },
  {
    name: "difficulty",
    type: "single_select",
    select_options: [
      opt("easy", "green"),
      opt("medium", "yellow"),
      opt("hard", "red"),
    ],
  },
  { name: "pet_score_bonus", type: "number", number_decimal_places: 0 },
  {
    name: "trigger_condition",
    type: "single_select",
    select_options: [
      opt("checkin"),
      opt("upload_photo"),
      opt("read_faq"),
      opt("view_pet_score"),
      opt("log_meal"),
      opt("voice_diary"),
      opt("check_water"),
      opt("routine_complete"),
      opt("check_weather"),
      opt("place_checkin"),
      opt("playdate_swipe"),
      opt("bcs_check"),
      opt("share_pet"),
      opt("help_hero"),
      opt("pet_score_increase"),
    ],
  },
  { name: "is_active", type: "boolean" },
  { name: "created_at", type: "text" },
];

// ============================================================
// 4) user_daily_quests
// ============================================================
const USER_DAILY_QUEST_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "quest_code", type: "text" },
  { name: "assigned_date", type: "text" }, // YYYY-MM-DD
  { name: "completed", type: "boolean" },
  { name: "completed_at", type: "text" },
  { name: "created_at", type: "text" },
];

// ============================================================
// users extension (3 new fields)
// ============================================================
const USERS_NEW_FIELDS = [
  { name: "show_in_leaderboard", type: "boolean" },
  { name: "leaderboard_pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "public_display_name", type: "text" },
];

// ============================================================
// Execute
// ============================================================
console.log("\n=== Session B migration ===");

const created: Array<[string, TableDef]> = [];
for (const [name, fields] of [
  ["user_nudges_sent", NUDGES_FIELDS],
  ["leaderboard_snapshots", LB_SNAPSHOT_FIELDS],
  ["quest_definitions", QUEST_DEF_FIELDS],
  ["user_daily_quests", USER_DAILY_QUEST_FIELDS],
] as const) {
  const t = await ensureTable(name, fields as any[]);
  created.push([name, t]);
}

await ensureFields(USERS_TABLE, "users", USERS_NEW_FIELDS);

// Persist config
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const [name, t] of created) {
  const fresh = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  if (!config.tables[name]) config.tables[name] = { id: t.id, fields: {} };
  config.tables[name].id = t.id;
  for (const f of fresh) {
    if (f.name && !["Notes", "Active"].includes(f.name)) {
      config.tables[name].fields[f.name] = f.id;
    }
  }
}
// Refresh users fields too
const freshUsers = await api<FieldDef[]>(`/database/fields/table/${USERS_TABLE}/`);
for (const f of freshUsers) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.users.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n✅ Session B migration done.");
