/**
 * M9.2 migration: Telehealth Chat (vet ↔ owner).
 *
 * Idempotent.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m9-2.ts
 *
 * Changes:
 *   users:           +2 fields (is_vet, vet_credentials)
 *   chat_threads:    NEW table (12 fields)
 *   chat_messages:   NEW table (8 fields, depends chat_threads + users + triage_sessions)
 *
 * NOTE: created_at + last_message_at lưu dạng text ISO 8601 — sortable string,
 *       tránh issue Baserow auto created_on field (M9.1 đã gặp).
 *
 * Sau migration, manual update is_vet=true cho user vợ Meliodas qua Baserow UI hoặc:
 *   curl -X PATCH \
 *     -H "Authorization: Token $BASEROW_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"is_vet": true, "vet_credentials": "DVM, Mon Min Clinic"}' \
 *     "http://localhost:8888/api/database/rows/table/{USERS_TABLE_ID}/{USER_ROW_ID}/?user_field_names=true"
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      "  bun run scripts/migrate-m9-2.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m9-2] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate-m9-2] Logged in.\n");

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

async function tokenApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!TOKEN) throw new Error("BASEROW_TOKEN cần thiết cho row CRUD");
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Token API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
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
const listRowsToken = (tableId: number) =>
  tokenApi<{ count: number; results: any[] }>(`/database/rows/table/${tableId}/?user_field_names=true&size=200`);

const USERS_TABLE = (existingConfig as any).tables.users.id;
const PETS_TABLE = (existingConfig as any).tables.pets.id;
const TRIAGE_TABLE_ID = (existingConfig as any).tables.triage_sessions?.id;
const DATABASE_ID = (existingConfig as any).database_id;

if (!TRIAGE_TABLE_ID) {
  console.error("❌ triage_sessions table chưa tồn tại — chạy migrate-m9-1.ts trước!");
  process.exit(1);
}

const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// PRE-COUNT
// ============================================================
const usersPre = await listRowsToken(USERS_TABLE);
const petsPre = await listRowsToken(PETS_TABLE);
console.log(`📊 Pre-migration:`);
console.log(`  users: ${usersPre.count} rows`);
console.log(`  pets:  ${petsPre.count} rows\n`);

// ============================================================
// 1. ADD FIELDS TO users TABLE
// ============================================================
console.log("🔄 Adding 2 fields to users table (M9.2)...");

const NEW_USERS_FIELDS = [
  { name: "is_vet", type: "boolean", boolean_default: false },
  { name: "vet_credentials", type: "text" },
];

const existingUsersFields = await listFields(USERS_TABLE);
const existingUserNames = new Set(existingUsersFields.map((f) => f.name));
let addedU = 0;
let skippedU = 0;
for (const fieldDef of NEW_USERS_FIELDS) {
  if (existingUserNames.has(fieldDef.name as string)) {
    skippedU++;
    console.log(`  ⊙ ${fieldDef.name} đã tồn tại, skip`);
    continue;
  }
  await createField(USERS_TABLE, fieldDef);
  addedU++;
  console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
}
console.log(`  users: +${addedU} added, ${skippedU} skipped\n`);

// ============================================================
// 2. CREATE chat_threads TABLE
// ============================================================
const tables = await listTables(DATABASE_ID);
let threadsTable = tables.find((t) => t.name === "chat_threads");

const CHAT_THREADS_FIELDS = [
  // First field will be `Name` (primary) renamed to subject below
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "owner_user_id", type: "link_row", link_row_table_id: USERS_TABLE },
  { name: "vet_user_id", type: "link_row", link_row_table_id: USERS_TABLE },
  {
    name: "status",
    type: "single_select",
    select_options: [
      opt("open", "green"),
      opt("closed", "gray"),
      opt("waiting_vet", "yellow"),
    ],
  },
  // last_message_at lưu ISO string — sortable lexicographically
  { name: "last_message_at", type: "text" },
  { name: "last_message_preview", type: "text" },
  { name: "escalated_from_triage_session_id", type: "link_row", link_row_table_id: TRIAGE_TABLE_ID },
  { name: "unread_count_owner", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "unread_count_vet", type: "number", number_decimal_places: 0, number_negative: false },
  // created_at as text (avoid M9.1 created_on issue)
  { name: "created_at", type: "text" },
];

if (!threadsTable) {
  console.log("🆕 Creating chat_threads table...");
  threadsTable = await createTable(DATABASE_ID, "chat_threads");
  // Rename primary "Name" → "subject"
  const initFields = await listFields(threadsTable.id);
  const primary = initFields.find((f) => (f as any).primary === true) || initFields[0];
  if (primary && primary.name !== "subject") {
    await api(`/database/fields/${primary.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ name: "subject", type: "text" }),
    });
    console.log(`  ✓ renamed primary → subject`);
  }
  for (const fieldDef of CHAT_THREADS_FIELDS) {
    await createField(threadsTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 chat_threads đã tồn tại (id=${threadsTable.id}). Ensuring fields...`);
  const existing = await listFields(threadsTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of CHAT_THREADS_FIELDS) {
    if (!existingN.has(fieldDef.name as string)) {
      await createField(threadsTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 3. CREATE chat_messages TABLE
// ============================================================
let messagesTable = tables.find((t) => t.name === "chat_messages");

const CHAT_MESSAGES_FIELDS = [
  // primary → content (rename below)
  { name: "thread_id", type: "link_row", link_row_table_id: threadsTable!.id },
  { name: "sender_user_id", type: "link_row", link_row_table_id: USERS_TABLE },
  {
    name: "sender_role",
    type: "single_select",
    select_options: [opt("owner", "blue"), opt("vet", "green"), opt("system", "gray")],
  },
  { name: "attachment_url", type: "url" },
  { name: "is_system_message", type: "boolean", boolean_default: false },
  // created_at as text
  { name: "created_at", type: "text" },
];

if (!messagesTable) {
  console.log("🆕 Creating chat_messages table...");
  messagesTable = await createTable(DATABASE_ID, "chat_messages");
  // Rename primary "Name" → "content" (and make long_text)
  const initFields = await listFields(messagesTable.id);
  const primary = initFields.find((f) => (f as any).primary === true) || initFields[0];
  if (primary && primary.name !== "content") {
    await api(`/database/fields/${primary.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ name: "content", type: "long_text" }),
    });
    console.log(`  ✓ renamed primary → content (long_text)`);
  }
  for (const fieldDef of CHAT_MESSAGES_FIELDS) {
    await createField(messagesTable.id, fieldDef);
    console.log(`  + ${fieldDef.name}`);
  }
} else {
  console.log(`🔄 chat_messages đã tồn tại (id=${messagesTable.id}). Ensuring fields...`);
  const existing = await listFields(messagesTable.id);
  const existingN = new Set(existing.map((f) => f.name));
  for (const fieldDef of CHAT_MESSAGES_FIELDS) {
    if (!existingN.has(fieldDef.name as string)) {
      await createField(messagesTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 4. UPDATE baserow-config.json
// ============================================================
const newUsersFields = await listFields(USERS_TABLE);
const newThreadsFields = await listFields(threadsTable!.id);
const newMessagesFields = await listFields(messagesTable!.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));

// Refresh users fields (add is_vet + vet_credentials)
for (const f of newUsersFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.users.fields[f.name] = f.id;
  }
}

if (!config.tables.chat_threads) config.tables.chat_threads = { id: threadsTable!.id, fields: {} };
config.tables.chat_threads.id = threadsTable!.id;
for (const f of newThreadsFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.chat_threads.fields[f.name] = f.id;
  }
}

if (!config.tables.chat_messages) config.tables.chat_messages = { id: messagesTable!.id, fields: {} };
config.tables.chat_messages.id = messagesTable!.id;
for (const f of newMessagesFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.chat_messages.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m9-2] baserow-config.json updated.\n");

// ============================================================
// 5. POST-COUNT
// ============================================================
const usersPost = await listRowsToken(USERS_TABLE);
const petsPost = await listRowsToken(PETS_TABLE);
const threadsCount = await listRowsToken(threadsTable!.id);
const messagesCount = await listRowsToken(messagesTable!.id);

console.log(`📊 Post-migration:`);
console.log(
  `  users: ${usersPost.count} rows ${usersPost.count === usersPre.count ? "✓ MATCH" : "✗ MISMATCH"}`
);
console.log(`  pets:  ${petsPost.count} rows ${petsPost.count === petsPre.count ? "✓ MATCH" : "✗ MISMATCH"}`);
console.log(`  chat_threads:  ${threadsCount.count} rows (mostly Baserow stubs Phase 0)`);
console.log(`  chat_messages: ${messagesCount.count} rows (mostly Baserow stubs Phase 0)`);

if (usersPost.count !== usersPre.count || petsPost.count !== petsPre.count) {
  console.error("\n❌ Row count mismatch — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M9.2 migration hoàn tất an toàn. Telehealth Chat schema ready.\n");

// ============================================================
// 6. NEXT STEPS HINT
// ============================================================
console.log("📌 Next step — manually set is_vet=true cho user vợ Meliodas:");
console.log(`   1. Tìm user_id của vợ Meliodas trong Baserow users table (id=${USERS_TABLE})`);
console.log(`   2. Run PATCH với BASEROW_TOKEN:`);
console.log(`      curl -X PATCH \\`);
console.log(`        -H "Authorization: Token <BASEROW_TOKEN>" \\`);
console.log(`        -H "Content-Type: application/json" \\`);
console.log(`        -H "Host: localhost:8888" \\`);
console.log(`        -d '{"is_vet": true, "vet_credentials": "DVM, Mon Min Clinic"}' \\`);
console.log(`        "${BASEROW_URL}/api/database/rows/table/${USERS_TABLE}/<USER_ROW_ID>/?user_field_names=true"`);
console.log(`   3. Hoặc dùng Baserow UI: check is_vet checkbox + fill vet_credentials\n`);
