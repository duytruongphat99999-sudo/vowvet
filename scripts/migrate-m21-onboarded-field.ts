/**
 * M21 migration: users.onboarded boolean field (idempotent).
 *
 * Phase 0 đã infer onboarded từ pets.length > 0. Sang Phase 1 cần field thực để:
 *   - User cũ logout → login lại KHÔNG bị bắt onboard nữa (đọc field, không recount pets)
 *   - User mới được mark explicitly khi hoàn thành wizard (POST /users/me/complete-onboarding)
 *   - Logic auth nhanh hơn: 1 row read thay vì 1 row read + 1 list count
 *
 * Auto-backfill: users đã có ≥1 pet → set onboarded=true (giữ behavior cũ).
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m21-onboarded-field.ts
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD || !TOKEN) {
  console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD/TOKEN");
  process.exit(1);
}

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
console.log("[migrate-m21] Logged in.\n");

async function jwtApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
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

interface FieldDef { id: number; name: string; type: string; }

const USERS_TABLE = existingConfig.tables.users.id;
const PETS_TABLE = existingConfig.tables.pets.id;

// ============================================================
// 1. Add onboarded field if missing
// ============================================================
console.log("🔄 Checking users.onboarded field...");
const existing = await jwtApi<FieldDef[]>(`/database/fields/table/${USERS_TABLE}/`);
const has = existing.find((f) => f.name === "onboarded");
if (has) {
  console.log(`  ⊙ onboarded already exists (id=${has.id})`);
} else {
  const created = await jwtApi<FieldDef>(`/database/fields/table/${USERS_TABLE}/`, {
    method: "POST",
    body: JSON.stringify({ name: "onboarded", type: "boolean" }),
  });
  console.log(`  + onboarded (id=${created.id})`);
}

// ============================================================
// 2. Update baserow-config.json
// ============================================================
console.log("\n🔄 Updating baserow-config.json...");
const fresh = await jwtApi<FieldDef[]>(`/database/fields/table/${USERS_TABLE}/`);
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of fresh) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.users.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("  baserow-config.json updated.\n");

// ============================================================
// 3. Auto-backfill: users with ≥1 pet → onboarded=true
//
// Strategy: paginate users, for each user check pets count via link_row_has filter,
// then PATCH onboarded if not already true.
// ============================================================
console.log("🔄 Backfilling onboarded=true for users with pets...");

interface UserRow {
  id: number;
  onboarded?: boolean;
  email?: string | null;
  phone?: string | null;
}

const usersRes = await tokenApi<{ count: number; results: UserRow[] }>(
  `/database/rows/table/${USERS_TABLE}/?user_field_names=true&size=200`
);
console.log(`  Found ${usersRes.count} users total.`);

let updated = 0, skipped = 0, alreadyTrue = 0;
for (const u of usersRes.results) {
  if (u.onboarded === true) { alreadyTrue++; continue; }

  // Count pets for this user
  const petsRes = await tokenApi<{ count: number }>(
    `/database/rows/table/${PETS_TABLE}/?user_field_names=true&filter__user_id__link_row_has=${u.id}&size=1`
  );
  if (petsRes.count > 0) {
    await tokenApi(`/database/rows/table/${USERS_TABLE}/${u.id}/?user_field_names=true`, {
      method: "PATCH",
      body: JSON.stringify({ onboarded: true }),
    });
    updated++;
    const label = u.phone || u.email || `id=${u.id}`;
    console.log(`  ✓ uid=${u.id} ${label} (${petsRes.count} pets) → onboarded=true`);
  } else {
    skipped++;
  }
}

console.log(`\n📊 Backfill summary:`);
console.log(`  already_true:  ${alreadyTrue}`);
console.log(`  updated_to_true: ${updated}`);
console.log(`  skipped (no pets, stays false): ${skipped}`);

console.log("\n✅ M21 migration done. users.onboarded field active.");
console.log("\nRestart vowvet-api:\n  docker compose up -d --force-recreate vowvet-api");
