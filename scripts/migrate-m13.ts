/**
 * M13 migration: Pet Personality Type Quiz.
 *
 * Idempotent.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m13.ts
 *
 * Changes:
 *   pets: +4 fields (personality_type, personality_secondary_type,
 *                    personality_completed_at, personality_scores)
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;

if (!EMAIL || !PASSWORD) {
  console.error("❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD.");
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
  if (!TOKEN) throw new Error("BASEROW_TOKEN cần");
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Token API ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef { id: number; name: string; type: string; }
const listFields = (tid: number) => api<FieldDef[]>(`/database/fields/table/${tid}/`);
const createField = (tid: number, d: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tid}/`, { method: "POST", body: JSON.stringify(d) });
const listRowsToken = (tid: number) =>
  tokenApi<{ count: number; results: any[] }>(`/database/rows/table/${tid}/?user_field_names=true&size=200`);

const PETS_TABLE = existingConfig.tables.pets.id;
const petsPre = await listRowsToken(PETS_TABLE);
console.log(`📊 Pre-migration: pets ${petsPre.count} rows\n`);

console.log("🔄 Adding 4 personality fields to pets (M13)...");
const NEW_FIELDS = [
  { name: "personality_type", type: "text" },
  { name: "personality_secondary_type", type: "text" },
  { name: "personality_completed_at", type: "text" },
  { name: "personality_scores", type: "long_text" },
];

const existing = await listFields(PETS_TABLE);
const existingNames = new Set(existing.map((f) => f.name));
let added = 0, skipped = 0;
for (const f of NEW_FIELDS) {
  if (existingNames.has(f.name)) {
    skipped++;
    console.log(`  ⊙ ${f.name} đã tồn tại`);
    continue;
  }
  await createField(PETS_TABLE, f);
  added++;
  console.log(`  + ${f.name}`);
}

// Update config
const fresh = await listFields(PETS_TABLE);
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of fresh) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pets.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));

const petsPost = await listRowsToken(PETS_TABLE);
console.log(`\n📊 Post: pets ${petsPost.count} rows ${petsPost.count === petsPre.count ? "✓" : "✗"}`);
console.log(`  pets: +${added} added, ${skipped} skipped\n`);
console.log("✅ M13 migration complete. Personality quiz schema ready.\n");
