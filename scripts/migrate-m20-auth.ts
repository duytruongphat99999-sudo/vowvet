/**
 * M20 auth migration: add email/password fields to users table.
 *
 * Idempotent — re-run safe.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/migrate-m20-auth.ts
 *
 * Adds to users table:
 *   - password_hash (text)          — Bun.password (argon2id) hash
 *   - password_reset_token (text)   — UUID, TTL 1h
 *   - password_reset_expires (text) — ISO timestamp
 *   - email_verified (boolean)
 *   - auth_methods (text)           — comma-separated: "phone,email,password,google"
 *   - last_login_method (text)      — phone_otp|email_password|google|...
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD. See header comment.");
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
console.log("[migrate-m20-auth] Logged in.\n");

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

interface FieldDef { id: number; name: string; type: string; }

const USERS_TABLE = existingConfig.tables.users.id;
const listFields = (tid: number) => api<FieldDef[]>(`/database/fields/table/${tid}/`);
const createField = (tid: number, d: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tid}/`, { method: "POST", body: JSON.stringify(d) });

const NEW_FIELDS = [
  { name: "password_hash", type: "text" },
  { name: "password_reset_token", type: "text" },
  { name: "password_reset_expires", type: "text" },
  { name: "email_verified", type: "boolean" },
  { name: "auth_methods", type: "text" },
  { name: "last_login_method", type: "text" },
];

console.log("🔄 Checking users table fields...");
const existing = await listFields(USERS_TABLE);
const existingNames = new Set(existing.map((f) => f.name));

let added = 0, skipped = 0;
for (const f of NEW_FIELDS) {
  if (existingNames.has(f.name)) {
    skipped++;
    console.log(`  ⊙ ${f.name} already exists`);
    continue;
  }
  await createField(USERS_TABLE, f);
  added++;
  console.log(`  + ${f.name}`);
}
console.log(`  users: +${added} added, ${skipped} skipped\n`);

// ============================================================
// Sync baserow-config.json
// ============================================================
console.log("🔄 Updating baserow-config.json...");
const fresh = await listFields(USERS_TABLE);
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of fresh) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.users.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("  baserow-config.json updated.\n");

console.log("✅ M20-auth migration done. users table has 6 new auth fields.");
console.log("\nRestart vowvet-api:\n  docker compose up -d --force-recreate vowvet-api");
