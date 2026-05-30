/**
 * M5 migration: Climate Sentinel schema.
 *
 * Idempotent — re-run an toàn.
 * Pre/post count rows users + pets để verify.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m5.ts
 *   Remove-Item Env:BASEROW_USER_EMAIL
 *   Remove-Item Env:BASEROW_USER_PASSWORD
 *
 * Changes:
 *   users table:        thêm 4 fields (city, push_subscription, notification_preferences, timezone)
 *   climate_alerts:     tạo bảng mới 11 fields
 *   notification_log:   tạo bảng mới 6 fields
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL hoặc BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      "  bun run scripts/migrate-m5.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m5] Logging in to ${BASEROW_URL}...`);
const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error("❌ Login failed:", await loginRes.text());
  process.exit(1);
}
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };
console.log("[migrate-m5] Logged in.\n");

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
  if (!res.ok) throw new Error(`API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef {
  id: number;
  name: string;
  type: string;
  primary?: boolean;
}
interface TableDef {
  id: number;
  name: string;
}

const listFields = (tableId: number) => api<FieldDef[]>(`/database/fields/table/${tableId}/`);
const createField = (tableId: number, data: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(data) });
const listTables = (databaseId: number) => api<TableDef[]>(`/database/tables/database/${databaseId}/`);
const createTable = (databaseId: number, name: string) =>
  api<TableDef>(`/database/tables/database/${databaseId}/`, { method: "POST", body: JSON.stringify({ name }) });
const listRows = (tableId: number) =>
  api<{ count: number; results: any[] }>(`/database/rows/table/${tableId}/?user_field_names=true&size=200`);

const USERS_TABLE = existingConfig.tables.users.id;
const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;

const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// PRE-COUNT
// ============================================================
const usersPre = await listRows(USERS_TABLE);
const petsPre = await listRows(PETS_TABLE);
console.log(`📊 Pre-migration:`);
console.log(`  users: ${usersPre.count} rows`);
console.log(`  pets:  ${petsPre.count} rows\n`);

// ============================================================
// 1. ADD FIELDS TO users TABLE
// ============================================================
console.log("🔄 Adding 4 fields to users table...");
const NEW_USERS_FIELDS = [
  {
    name: "city",
    type: "single_select",
    select_options: [
      opt("ho_chi_minh", "orange"),
      opt("da_lat", "green"),
      opt("ha_noi", "red"),
      opt("da_nang", "blue"),
    ],
  },
  { name: "push_subscription", type: "long_text" },
  { name: "notification_preferences", type: "long_text" },
  { name: "timezone", type: "text" },
];

const usersFields = await listFields(USERS_TABLE);
const usersFieldNames = new Set(usersFields.map((f) => f.name));
let added = 0, skipped = 0;
for (const fieldDef of NEW_USERS_FIELDS) {
  if (usersFieldNames.has(fieldDef.name)) {
    skipped++;
    continue;
  }
  await createField(USERS_TABLE, fieldDef);
  added++;
  console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
}
console.log(`  users: +${added} added, ${skipped} skipped\n`);

// ============================================================
// 2. CREATE climate_alerts TABLE
// ============================================================
const tables = await listTables(DATABASE_ID);
let climateAlertsTable = tables.find((t) => t.name === "climate_alerts");

const CLIMATE_ALERTS_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "user_id", type: "link_row", link_row_table_id: USERS_TABLE },
  {
    name: "alert_type",
    type: "single_select",
    select_options: [
      opt("heat_warning", "red"),
      opt("aqi_warning", "yellow"),
      opt("storm_warning", "purple"),
      opt("cold_warning", "blue"),
      opt("sun_warning", "orange"),
    ],
  },
  {
    name: "severity",
    type: "single_select",
    select_options: [
      opt("info", "light-blue"),
      opt("warning", "yellow"),
      opt("urgent", "orange"),
      opt("critical", "red"),
    ],
  },
  { name: "title", type: "text" },
  { name: "message", type: "long_text" },
  { name: "weather_snapshot", type: "long_text" },
  { name: "triggered_at", type: "created_on" },
  { name: "sent_push", type: "boolean", boolean_default: false },
  { name: "dismissed_at", type: "date", date_include_time: true, date_time_format: "24", date_format: "ISO" },
  { name: "pet_factors", type: "long_text" },
];

if (!climateAlertsTable) {
  console.log("🆕 Creating climate_alerts table...");
  climateAlertsTable = await createTable(DATABASE_ID, "climate_alerts");
  console.log(`  table id=${climateAlertsTable.id}`);
  for (const fieldDef of CLIMATE_ALERTS_FIELDS) {
    await createField(climateAlertsTable.id, fieldDef);
    console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
  }
} else {
  console.log(`🔄 climate_alerts đã tồn tại (id=${climateAlertsTable.id}). Ensuring fields...`);
  const existing = await listFields(climateAlertsTable.id);
  const existingNames = new Set(existing.map((f) => f.name));
  for (const fieldDef of CLIMATE_ALERTS_FIELDS) {
    if (!existingNames.has(fieldDef.name)) {
      await createField(climateAlertsTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 3. CREATE notification_log TABLE
// ============================================================
let notificationLogTable = tables.find((t) => t.name === "notification_log");

const NOTIFICATION_LOG_FIELDS = [
  { name: "user_id", type: "link_row", link_row_table_id: USERS_TABLE },
  {
    name: "type",
    type: "single_select",
    select_options: [
      opt("alert_push", "red"),
      opt("daily_summary", "blue"),
      opt("vaccine_reminder", "green"),
    ],
  },
  { name: "payload", type: "long_text" },
  { name: "sent_at", type: "created_on" },
  { name: "delivered", type: "boolean", boolean_default: false },
  { name: "opened_at", type: "date", date_include_time: true, date_time_format: "24", date_format: "ISO" },
];

if (!notificationLogTable) {
  console.log("🆕 Creating notification_log table...");
  notificationLogTable = await createTable(DATABASE_ID, "notification_log");
  console.log(`  table id=${notificationLogTable.id}`);
  for (const fieldDef of NOTIFICATION_LOG_FIELDS) {
    await createField(notificationLogTable.id, fieldDef);
    console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
  }
} else {
  console.log(`🔄 notification_log đã tồn tại (id=${notificationLogTable.id}). Ensuring fields...`);
  const existing = await listFields(notificationLogTable.id);
  const existingNames = new Set(existing.map((f) => f.name));
  for (const fieldDef of NOTIFICATION_LOG_FIELDS) {
    if (!existingNames.has(fieldDef.name)) {
      await createField(notificationLogTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 4. UPDATE baserow-config.json
// ============================================================
console.log("[migrate-m5] Reading new field IDs...");
const newUsersFields = await listFields(USERS_TABLE);
const newCaFields = await listFields(climateAlertsTable!.id);
const newNlFields = await listFields(notificationLogTable!.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of newUsersFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.users.fields[f.name] = f.id;
  }
}

if (!config.tables.climate_alerts) {
  config.tables.climate_alerts = { id: climateAlertsTable!.id, fields: {} };
}
config.tables.climate_alerts.id = climateAlertsTable!.id;
for (const f of newCaFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.climate_alerts.fields[f.name] = f.id;
  }
}

if (!config.tables.notification_log) {
  config.tables.notification_log = { id: notificationLogTable!.id, fields: {} };
}
config.tables.notification_log.id = notificationLogTable!.id;
for (const f of newNlFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.notification_log.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m5] baserow-config.json updated.\n");

// ============================================================
// 5. POST-COUNT VERIFY
// ============================================================
const usersPost = await listRows(USERS_TABLE);
const petsPost = await listRows(PETS_TABLE);
const usersOk = usersPost.count === usersPre.count;
const petsOk = petsPost.count === petsPre.count;

console.log(`📊 Post-migration:`);
console.log(`  users: ${usersPost.count} rows ${usersOk ? "✓ MATCH" : "✗ MISMATCH"}`);
console.log(`  pets:  ${petsPost.count} rows ${petsOk ? "✓ MATCH" : "✗ MISMATCH"}`);
console.log(`  climate_alerts:   id=${climateAlertsTable!.id}, ${newCaFields.length} fields`);
console.log(`  notification_log: id=${notificationLogTable!.id}, ${newNlFields.length} fields`);

if (!usersOk || !petsOk) {
  console.error("\n❌ Row count mismatch — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M5 migration hoàn tất an toàn. Schema climate ready.");
