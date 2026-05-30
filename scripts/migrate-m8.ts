/**
 * M8 migration: Polish + Launch prep.
 *
 * Idempotent.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m8.ts
 *
 * Changes:
 *   users table: +5 fields (email, google_oauth_id, avatar_url, auth_method, deleted_at)
 *   Backfill: existing users → auth_method='phone_otp'
 *   Detection: list duplicate pets + placeholder test pets (NO auto-delete)
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL hoặc BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      "  bun run scripts/migrate-m8.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m8] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate-m8] Logged in.\n");

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

const listFields = (tableId: number) => api<FieldDef[]>(`/database/fields/table/${tableId}/`);
const createField = (tableId: number, data: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(data) });
const listRowsToken = (tableId: number) =>
  tokenApi<{ count: number; results: any[] }>(`/database/rows/table/${tableId}/?user_field_names=true&size=200`);
const updateRowToken = (tableId: number, rowId: number, data: Record<string, unknown>) =>
  tokenApi(`/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

const USERS_TABLE = existingConfig.tables.users.id;
const PETS_TABLE = existingConfig.tables.pets.id;

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
console.log("🔄 Adding 5 fields to users table (M8)...");

const NEW_USERS_FIELDS = [
  { name: "email", type: "text" },
  { name: "google_oauth_id", type: "text" },
  { name: "avatar_url", type: "text" },
  {
    name: "auth_method",
    type: "single_select",
    select_options: [
      opt("phone_otp", "blue"),
      opt("google_oauth", "red"),
      opt("both", "green"),
    ],
  },
  { name: "deleted_at", type: "date", date_include_time: true, date_format: "ISO", date_time_format: "24" },
];

const existingUsersFields = await listFields(USERS_TABLE);
const existingNames = new Set(existingUsersFields.map((f) => f.name));
let addedU = 0;
let skippedU = 0;
for (const fieldDef of NEW_USERS_FIELDS) {
  if (existingNames.has(fieldDef.name as string)) {
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
// 2. UPDATE baserow-config.json
// ============================================================
const newUsersFields = await listFields(USERS_TABLE);
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of newUsersFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.users.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m8] baserow-config.json updated.\n");

// ============================================================
// 3. BACKFILL auth_method='phone_otp' cho existing users
// ============================================================
console.log("🔄 Backfilling auth_method cho existing users...");
let backfilled = 0;
let backfillSkipped = 0;
for (const row of usersPre.results) {
  const r = row as any;
  // Skip nếu đã có auth_method hoặc không có phone (placeholder/stub)
  const currentMethod = typeof r.auth_method === "object" ? r.auth_method?.value : r.auth_method;
  if (currentMethod) {
    backfillSkipped++;
    continue;
  }
  if (!r.phone) {
    backfillSkipped++;
    continue;
  }
  try {
    await updateRowToken(USERS_TABLE, row.id, { auth_method: "phone_otp" });
    console.log(`  ✓ user ${row.id} (${r.phone}): auth_method=phone_otp`);
    backfilled++;
  } catch (err: any) {
    console.error(`  ✗ user ${row.id} backfill: ${err.message}`);
    backfillSkipped++;
  }
}
console.log(`  Backfilled: ${backfilled}, Skipped: ${backfillSkipped}\n`);

// ============================================================
// 4. DETECTION (read-only): duplicate pets + placeholder pets
// ============================================================
console.log("🔍 Detecting test/duplicate pets (NO auto-delete)...");

// Group pets by user_id + name
const petsByKey = new Map<string, Array<{ id: number; name: string; userId: number }>>();
const placeholders: Array<{ id: number; name: string; reason: string }> = [];

for (const row of petsPre.results) {
  const r = row as any;
  if (!r.name) continue;
  const userLinks = Array.isArray(r.user_id) ? r.user_id : [];
  const userId = userLinks[0]?.id || 0;

  // Detect placeholders
  const lowerName = r.name.toLowerCase().trim();
  if (
    lowerName.includes("test") ||
    lowerName.includes("m7test") ||
    lowerName.includes("placeholder") ||
    lowerName === "empty" ||
    lowerName === "stub"
  ) {
    placeholders.push({ id: row.id, name: r.name, reason: "Có chữ test/placeholder/stub" });
    continue;
  }

  // Group for duplicate detection
  const key = `${userId}:${lowerName}`;
  if (!petsByKey.has(key)) petsByKey.set(key, []);
  petsByKey.get(key)!.push({ id: row.id, name: r.name, userId });
}

const duplicates: Array<{ name: string; userId: number; ids: number[] }> = [];
for (const [key, pets] of petsByKey.entries()) {
  if (pets.length > 1) {
    duplicates.push({
      name: pets[0].name,
      userId: pets[0].userId,
      ids: pets.map((p) => p.id),
    });
  }
}

if (placeholders.length > 0) {
  console.log(`\n  📌 ${placeholders.length} placeholder pet(s) phát hiện:`);
  for (const p of placeholders) {
    console.log(`     - id=${p.id} name="${p.name}" (${p.reason})`);
  }
}
if (duplicates.length > 0) {
  console.log(`\n  📌 ${duplicates.length} cặp duplicate pet (cùng tên + cùng owner):`);
  for (const d of duplicates) {
    console.log(`     - user ${d.userId} "${d.name}": pet IDs ${d.ids.join(", ")}`);
  }
}
if (placeholders.length === 0 && duplicates.length === 0) {
  console.log(`  ✓ Không phát hiện test data cần cleanup`);
}
console.log(`\n  → Dùng scripts/cleanup-test-data.ts (tạo trong Phase 7) để xóa thủ công với confirm.`);

// ============================================================
// 5. POST-COUNT
// ============================================================
const usersPost = await listRowsToken(USERS_TABLE);
const petsPost = await listRowsToken(PETS_TABLE);

console.log(`\n📊 Post-migration:`);
console.log(
  `  users: ${usersPost.count} rows ${usersPost.count === usersPre.count ? "✓ MATCH" : "✗ MISMATCH"}`
);
console.log(
  `  pets:  ${petsPost.count} rows ${petsPost.count === petsPre.count ? "✓ MATCH" : "✗ MISMATCH"}`
);

if (usersPost.count !== usersPre.count || petsPost.count !== petsPre.count) {
  console.error("\n❌ Row count mismatch — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M8 migration hoàn tất an toàn. Schema sẵn sàng cho Google OAuth + account management.");
