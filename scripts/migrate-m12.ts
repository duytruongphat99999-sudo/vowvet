/**
 * M12 migration: Public Shareable Pet Card.
 *
 * Idempotent.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m12.ts
 *
 * Changes:
 *   pets table: +7 fields (public_slug, is_public, public_bio, public_quote,
 *                          public_view_count, public_share_count, public_enabled_at)
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
      "  bun run scripts/migrate-m12.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m12] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate-m12] Logged in.\n");

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
}
const listFields = (tableId: number) => api<FieldDef[]>(`/database/fields/table/${tableId}/`);
const createField = (tableId: number, data: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(data) });
const listRowsToken = (tableId: number) =>
  tokenApi<{ count: number; results: any[] }>(`/database/rows/table/${tableId}/?user_field_names=true&size=200`);

const PETS_TABLE = existingConfig.tables.pets.id;

// ============================================================
// PRE-COUNT
// ============================================================
const petsPre = await listRowsToken(PETS_TABLE);
console.log(`📊 Pre-migration: pets ${petsPre.count} rows\n`);

// ============================================================
// ADD 7 FIELDS TO pets
// ============================================================
console.log("🔄 Adding 7 fields to pets (M12 public card)...");

const NEW_PETS_FIELDS = [
  { name: "public_slug", type: "text" },
  { name: "is_public", type: "boolean", boolean_default: false },
  { name: "public_bio", type: "long_text" },
  { name: "public_quote", type: "text" },
  { name: "public_view_count", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "public_share_count", type: "number", number_decimal_places: 0, number_negative: false },
  // public_enabled_at: text ISO (tránh issue Baserow created_on tự động)
  { name: "public_enabled_at", type: "text" },
];

const existingFields = await listFields(PETS_TABLE);
const existingNames = new Set(existingFields.map((f) => f.name));
let added = 0;
let skipped = 0;
for (const fieldDef of NEW_PETS_FIELDS) {
  if (existingNames.has(fieldDef.name)) {
    skipped++;
    console.log(`  ⊙ ${fieldDef.name} đã tồn tại, skip`);
    continue;
  }
  await createField(PETS_TABLE, fieldDef);
  added++;
  console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
}
console.log(`  pets: +${added} added, ${skipped} skipped\n`);

// ============================================================
// UPDATE baserow-config.json
// ============================================================
const newFields = await listFields(PETS_TABLE);
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of newFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.pets.fields[f.name] = f.id;
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m12] baserow-config.json updated.\n");

// ============================================================
// POST-COUNT
// ============================================================
const petsPost = await listRowsToken(PETS_TABLE);
console.log(`📊 Post-migration: pets ${petsPost.count} rows ${petsPost.count === petsPre.count ? "✓ MATCH" : "✗ MISMATCH"}`);
if (petsPost.count !== petsPre.count) {
  console.error("\n❌ Pet count mismatch — migration KHÔNG safe!");
  process.exit(1);
}
console.log("\n✅ M12 migration hoàn tất. Public pet card schema ready.\n");
