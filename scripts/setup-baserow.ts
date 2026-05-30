/**
 * Setup Baserow database + 8 tables (JWT auth version)
 */
import { writeFileSync } from "fs";

const BASEROW_URL = Bun.env.BASEROW_URL?.replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const WORKSPACE_ID = Bun.env.BASEROW_WORKSPACE_ID;

if (!BASEROW_URL || !EMAIL || !PASSWORD || !WORKSPACE_ID) {
  console.error("Missing env: BASEROW_URL, BASEROW_USER_EMAIL, BASEROW_USER_PASSWORD, BASEROW_WORKSPACE_ID");
  process.exit(1);
}

// Login to get JWT
console.log("Logging in...");
const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error("Login failed:", await loginRes.text());
  process.exit(1);
}
const loginData = await loginRes.json();
const JWT = loginData.access_token || loginData.token;
console.log("Logged in! JWT obtained.\n");

async function api(path, options = {}) {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    headers: { Authorization: `JWT ${JWT}`, "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createDatabase(name) {
  console.log(`Creating database: ${name}...`);
  return api(`/applications/workspace/${WORKSPACE_ID}/`, { method: "POST", body: JSON.stringify({ name, type: "database" }) });
}
async function createTable(databaseId, name) {
  console.log(`  Creating table: ${name}...`);
  return api(`/database/tables/database/${databaseId}/`, { method: "POST", body: JSON.stringify({ name }) });
}
async function getFields(tableId) { return api(`/database/fields/table/${tableId}/`); }
async function updateField(fieldId, data) { return api(`/database/fields/${fieldId}/`, { method: "PATCH", body: JSON.stringify(data) }); }
async function createField(tableId, data) { return api(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(data) }); }

async function setupTable(tableId, primaryField, otherFields) {
  const existing = await getFields(tableId);
  const primary = existing.find(f => f.primary);
  const fieldIds = {};
  if (primary) {
    await updateField(primary.id, primaryField);
    fieldIds[primaryField.name] = primary.id;
    console.log(`    primary: ${primaryField.name}`);
  }
  for (const f of otherFields) {
    try {
      const c = await createField(tableId, f);
      fieldIds[f.name] = c.id;
      console.log(`    + ${f.name} (${f.type})`);
    } catch (e) { console.error(`    FAIL ${f.name}: ${e.message}`); }
  }
  return fieldIds;
}

const db = await createDatabase("petcoach_db");
console.log(`Database ID: ${db.id}\n`);
const config = { database_id: db.id, tables: {} };

// 1. USERS
const t1 = await createTable(db.id, "users");
config.tables.users = { id: t1.id, fields: await setupTable(t1.id,
  { name: "phone", type: "phone_number" },
  [
    { name: "name", type: "text" },
    { name: "zalo_user_id", type: "text" },
    { name: "plan_tier", type: "single_select", select_options: [{value:"free",color:"gray"},{value:"premium",color:"blue"},{value:"lifetime",color:"green"}] },
    { name: "premium_until", type: "date", date_format: "ISO" },
    { name: "city", type: "text" },
    { name: "referral_code", type: "text" },
    { name: "last_login_at", type: "date", date_format: "ISO", date_include_time: true, date_force_timezone: "Asia/Ho_Chi_Minh" },
    { name: "created_at", type: "created_on", date_format: "ISO", date_include_time: true, date_force_timezone: "Asia/Ho_Chi_Minh" },
  ]) };

// 2. PETS
const t2 = await createTable(db.id, "pets");
config.tables.pets = { id: t2.id, fields: await setupTable(t2.id,
  { name: "name", type: "text" },
  [
    { name: "user_id", type: "link_row", link_row_table_id: t1.id, has_related_field: false },
    { name: "species", type: "single_select", select_options: [{value:"dog",color:"blue"},{value:"cat",color:"pink"}] },
    { name: "breed", type: "text" },
    { name: "breed_secondary", type: "text" },
    { name: "dob", type: "date", date_format: "ISO" },
    { name: "gender", type: "single_select", select_options: [{value:"male",color:"light-blue"},{value:"female",color:"light-pink"},{value:"male_neutered",color:"blue"},{value:"female_neutered",color:"pink"}] },
    { name: "weight_kg", type: "number", number_decimal_places: 2, number_negative: false },
    { name: "bcs", type: "number", number_decimal_places: 0, number_negative: false },
    { name: "photo_url", type: "url" },
    { name: "nose_print_hash", type: "text" },
    { name: "qr_code", type: "text" },
    { name: "personality_type", type: "single_select", select_options: [{value:"explorer",color:"orange"},{value:"cuddler",color:"pink"},{value:"foodie",color:"yellow"},{value:"guardian",color:"blue"},{value:"athlete",color:"red"},{value:"thinker",color:"purple"},{value:"social",color:"green"},{value:"independent",color:"gray"}] },
    { name: "climate_sensitivity", type: "number", number_decimal_places: 0, number_negative: false },
    { name: "onboarding_completed", type: "boolean" },
    { name: "created_at", type: "created_on", date_format: "ISO", date_include_time: true, date_force_timezone: "Asia/Ho_Chi_Minh" },
  ]) };

// 3. VACCINES
const t3 = await createTable(db.id, "vaccines");
config.tables.vaccines = { id: t3.id, fields: await setupTable(t3.id,
  { name: "vaccine_type", type: "single_select", select_options: [{value:"5-in-1",color:"blue"},{value:"7-in-1",color:"dark-blue"},{value:"rabies",color:"red"},{value:"feline-3",color:"pink"},{value:"feline-4",color:"dark-pink"},{value:"felv",color:"purple"}] },
  [
    { name: "pet_id", type: "link_row", link_row_table_id: t2.id, has_related_field: false },
    { name: "brand", type: "text" },
    { name: "dose_number", type: "number", number_decimal_places: 0 },
    { name: "administered_date", type: "date", date_format: "ISO" },
    { name: "next_due_date", type: "date", date_format: "ISO" },
    { name: "clinic_name", type: "text" },
    { name: "batch_number", type: "text" },
    { name: "notes", type: "long_text" },
  ]) };

// 4. DEWORMERS
const t4 = await createTable(db.id, "dewormers");
config.tables.dewormers = { id: t4.id, fields: await setupTable(t4.id,
  { name: "product_name", type: "text" },
  [
    { name: "pet_id", type: "link_row", link_row_table_id: t2.id, has_related_field: false },
    { name: "type", type: "single_select", select_options: [{value:"internal",color:"blue"},{value:"external",color:"orange"},{value:"both",color:"purple"}] },
    { name: "administered_date", type: "date", date_format: "ISO" },
    { name: "next_due_date", type: "date", date_format: "ISO" },
    { name: "dosage", type: "text" },
  ]) };

// 5. DAILY_CHECK_INS
const t5 = await createTable(db.id, "daily_check_ins");
config.tables.daily_check_ins = { id: t5.id, fields: await setupTable(t5.id,
  { name: "check_date", type: "date", date_format: "ISO" },
  [
    { name: "pet_id", type: "link_row", link_row_table_id: t2.id, has_related_field: false },
    { name: "appetite", type: "rating", max_value: 5, color: "dark-orange", style: "star" },
    { name: "energy", type: "rating", max_value: 5, color: "dark-blue", style: "star" },
    { name: "stool_quality", type: "single_select", select_options: [{value:"normal",color:"green"},{value:"soft",color:"yellow"},{value:"liquid",color:"orange"},{value:"hard",color:"brown"},{value:"none",color:"gray"}] },
    { name: "water_ml", type: "number", number_decimal_places: 0 },
    { name: "photo_url", type: "url" },
    { name: "notes", type: "long_text" },
    { name: "symptoms", type: "multiple_select", select_options: [{value:"vomit",color:"red"},{value:"cough",color:"orange"},{value:"sneeze",color:"yellow"},{value:"itch",color:"pink"},{value:"limp",color:"purple"},{value:"other",color:"gray"}] },
    { name: "ai_summary", type: "long_text" },
    { name: "urgency_level", type: "single_select", select_options: [{value:"normal",color:"green"},{value:"monitor",color:"yellow"},{value:"consult",color:"orange"},{value:"urgent",color:"red"},{value:"emergency",color:"dark-red"}] },
    { name: "created_at", type: "created_on", date_format: "ISO", date_include_time: true, date_force_timezone: "Asia/Ho_Chi_Minh" },
  ]) };

// 6. CARE_PLANS
const t6 = await createTable(db.id, "care_plans");
config.tables.care_plans = { id: t6.id, fields: await setupTable(t6.id,
  { name: "plan_date", type: "date", date_format: "ISO" },
  [
    { name: "pet_id", type: "link_row", link_row_table_id: t2.id, has_related_field: false },
    { name: "plan_json", type: "long_text" },
    { name: "weather_snapshot", type: "long_text" },
    { name: "alerts", type: "long_text" },
    { name: "sent_zalo", type: "boolean" },
    { name: "user_feedback", type: "single_select", select_options: [{value:"helpful",color:"green"},{value:"not_helpful",color:"red"}] },
    { name: "created_at", type: "created_on", date_format: "ISO", date_include_time: true, date_force_timezone: "Asia/Ho_Chi_Minh" },
  ]) };

// 7. ALLERGIES_DIET
const t7 = await createTable(db.id, "allergies_diet");
config.tables.allergies_diet = { id: t7.id, fields: await setupTable(t7.id,
  { name: "item", type: "text" },
  [
    { name: "pet_id", type: "link_row", link_row_table_id: t2.id, has_related_field: false },
    { name: "type", type: "single_select", select_options: [{value:"allergy",color:"red"},{value:"dislike",color:"orange"},{value:"loves",color:"green"},{value:"forbidden",color:"dark-red"}] },
    { name: "severity", type: "single_select", select_options: [{value:"mild",color:"yellow"},{value:"moderate",color:"orange"},{value:"severe",color:"red"}] },
    { name: "notes", type: "long_text" },
  ]) };

// 8. HEALTH_EVENTS
const t8 = await createTable(db.id, "health_events");
config.tables.health_events = { id: t8.id, fields: await setupTable(t8.id,
  { name: "description", type: "long_text" },
  [
    { name: "pet_id", type: "link_row", link_row_table_id: t2.id, has_related_field: false },
    { name: "event_type", type: "single_select", select_options: [{value:"illness",color:"red"},{value:"injury",color:"orange"},{value:"vet_visit",color:"blue"},{value:"surgery",color:"purple"},{value:"medication",color:"green"}] },
    { name: "event_date", type: "date", date_format: "ISO" },
    { name: "vet_name", type: "text" },
    { name: "clinic_name", type: "text" },
    { name: "cost_vnd", type: "number", number_decimal_places: 0 },
    { name: "photos_urls", type: "long_text" },
    { name: "follow_up_date", type: "date", date_format: "ISO" },
  ]) };

writeFileSync("baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n\n=== XONG! Copy đoạn dưới vào .env ===\n");
console.log(`BASEROW_DATABASE_ID=${db.id}`);
for (const [name, info] of Object.entries(config.tables)) {
  console.log(`BASEROW_TABLE_${name.toUpperCase()}=${info.id}`);
}
console.log("\nFile chi tiết: baserow-config.json");