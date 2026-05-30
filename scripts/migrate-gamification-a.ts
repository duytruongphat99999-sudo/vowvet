/**
 * Session A — Gamification foundation migration.
 *
 * 5 new tables:
 *   - achievement_defs       — catalog of unlockable achievements
 *   - user_achievements      — user × pet unlocks (with link_row to pets)
 *   - reward_definitions     — catalog of claimable rewards (admin editable in Baserow)
 *   - user_rewards           — claimed vouchers with status lifecycle
 *   - feature_gates          — feature_key → unlock condition (Pet Score / tier / hero count)
 *
 * Idempotent. Re-run safe.
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

// ============================================================
// 1) achievement_defs
// ============================================================
const ACHIEVEMENT_DEFS_FIELDS = [
  { name: "code", type: "text" },
  { name: "name", type: "text" },
  { name: "description", type: "long_text" },
  { name: "emoji", type: "text" },
  {
    name: "category",
    type: "single_select",
    select_options: [
      opt("health", "green"),
      opt("social", "pink"),
      opt("milestone", "orange"),
      opt("hero", "purple"),
      opt("completion", "blue"),
      opt("secret", "gray"),
    ],
  },
  {
    name: "tier",
    type: "single_select",
    select_options: [
      opt("bronze", "orange"),
      opt("silver", "gray"),
      opt("gold", "yellow"),
      opt("platinum", "blue"),
      opt("secret", "purple"),
    ],
  },
  { name: "pet_score_bonus", type: "number", number_decimal_places: 0 },
  {
    name: "unlock_condition_type",
    type: "single_select",
    select_options: [
      opt("vaccine_count"),
      opt("streak_days"),
      opt("bcs_done"),
      opt("photo_count"),
      opt("personality_done"),
      opt("nutrition_done"),
      opt("first_match"),
      opt("mutual_matches"),
      opt("hero_count"),
      opt("profile_completion"),
      opt("midnight_checkin"),
      opt("first_birthday"),
    ],
  },
  { name: "unlock_condition_value", type: "text" },
  { name: "is_active", type: "boolean" },
  { name: "is_secret", type: "boolean" },
  { name: "created_at", type: "text" },
];

// ============================================================
// 2) user_achievements
// ============================================================
const USER_ACHIEVEMENTS_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "achievement_code", type: "text" },
  { name: "unlocked_at", type: "text" },
  { name: "viewed", type: "boolean" },
];

// ============================================================
// 3) reward_definitions
// ============================================================
const REWARD_DEFS_FIELDS = [
  { name: "code", type: "text" },
  { name: "name", type: "text" },
  { name: "description", type: "long_text" },
  { name: "emoji", type: "text" },
  {
    name: "category",
    type: "single_select",
    select_options: [
      opt("tier_reward", "yellow"),
      opt("streak_reward", "orange"),
      opt("hero_reward", "purple"),
      opt("event_reward", "blue"),
      opt("seasonal", "pink"),
    ],
  },
  {
    name: "unlock_condition_type",
    type: "single_select",
    select_options: [
      opt("pet_score_tier"),
      opt("streak_days"),
      opt("hero_count"),
      opt("achievement_code"),
      opt("manual_admin"),
    ],
  },
  { name: "unlock_condition_value", type: "text" },
  {
    name: "reward_type",
    type: "single_select",
    select_options: [
      opt("voucher_discount", "green"),
      opt("free_service", "blue"),
      opt("physical_gift", "pink"),
      opt("feature_unlock", "purple"),
      opt("badge_only", "gray"),
      opt("banner_feature", "yellow"),
    ],
  },
  { name: "reward_value", type: "text" },
  {
    name: "reward_provider",
    type: "single_select",
    select_options: [
      opt("mon_min", "blue"),
      opt("external_partner", "orange"),
      opt("platform", "purple"),
    ],
  },
  { name: "partner_name", type: "text" },
  { name: "voucher_code_pattern", type: "text" },
  { name: "voucher_validity_days", type: "number", number_decimal_places: 0 },
  { name: "season_start", type: "text" },
  { name: "season_end", type: "text" },
  { name: "max_redemptions_per_user", type: "number", number_decimal_places: 0, number_negative: true },
  { name: "max_total_redemptions", type: "number", number_decimal_places: 0, number_negative: true },
  { name: "current_redemptions", type: "number", number_decimal_places: 0 },
  { name: "redemption_instructions", type: "long_text" },
  { name: "terms", type: "long_text" },
  { name: "is_active", type: "boolean" },
  { name: "display_order", type: "number", number_decimal_places: 0 },
  { name: "created_at", type: "text" },
  { name: "updated_at", type: "text" },
];

// ============================================================
// 4) user_rewards
// ============================================================
const USER_REWARDS_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "reward_code", type: "text" },
  { name: "claimed_at", type: "text" },
  { name: "voucher_code", type: "text" },
  { name: "expires_at", type: "text" },
  {
    name: "status",
    type: "single_select",
    select_options: [
      opt("pending", "yellow"),
      opt("active", "green"),
      opt("redeemed", "blue"),
      opt("expired", "gray"),
      opt("cancelled", "red"),
    ],
  },
  { name: "redeemed_at", type: "text" },
  { name: "redeemed_by_admin_id", type: "number", number_decimal_places: 0 },
  { name: "notes", type: "long_text" },
  { name: "created_at", type: "text" },
];

// ============================================================
// 5) feature_gates
// ============================================================
const FEATURE_GATES_FIELDS = [
  { name: "feature_key", type: "text" },
  { name: "feature_name", type: "text" },
  {
    name: "gate_type",
    type: "single_select",
    select_options: [
      opt("pet_score_min"),
      opt("tier_min"),
      opt("achievement_required"),
      opt("hero_count_min"),
    ],
  },
  { name: "gate_value", type: "text" },
  { name: "benefit_description", type: "long_text" },
  { name: "locked_message", type: "long_text" },
  { name: "next_action", type: "text" },
  { name: "is_active", type: "boolean" },
  { name: "created_at", type: "text" },
];

const tables = [
  ["achievement_defs", ACHIEVEMENT_DEFS_FIELDS],
  ["user_achievements", USER_ACHIEVEMENTS_FIELDS],
  ["reward_definitions", REWARD_DEFS_FIELDS],
  ["user_rewards", USER_REWARDS_FIELDS],
  ["feature_gates", FEATURE_GATES_FIELDS],
] as const;

const created: Array<[string, TableDef]> = [];
for (const [name, fields] of tables) {
  const t = await ensureTable(name, fields as any[]);
  created.push([name, t]);
}

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
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n✅ Session A migration done.");
