/**
 * Add proof_photo_url + invoice_photo_url fields to the existing `vaccines` table.
 *
 * Idempotent. Clones the JWT auth + ensureTable pattern from
 * migrate-pet-exercise-logs.ts and migrate-pet-water-logs.ts.
 *
 * **Why these fields**: Phase 2A — vaccine photo passport. Owners snap their
 * paper vaccine booklet + the invoice/receipt; URLs from R2 are stored here
 * so the digital sổ ghi nhớ has photo proof attached to each record.
 *
 * Stores `text` (URLs are ≤ ~200 chars, fits in default text column).
 *
 * Run:
 *   cat scripts/migrate-vaccine-photo-fields.ts | docker exec -i vowvet-api sh -c 'cat > /tmp/migrate-vaccine-photo-fields.ts && bun run /tmp/migrate-vaccine-photo-fields.ts'
 *   docker exec vowvet-api cat /tmp/baserow-config.new.json > baserow-config.json
 *   docker compose restart vowvet-api
 */
import { writeFileSync, readFileSync } from "node:fs";

const configPath = Bun.env.BASEROW_CONFIG_IN || "/app/baserow-config.json";
const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD env.");
  process.exit(1);
}

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`❌ Baserow login failed: ${loginRes.status}`);
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
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef { id: number; name: string; type: string; }

const vaccinesTableId = (existingConfig as any).tables?.vaccines?.id;
if (!vaccinesTableId) {
  console.error("❌ tables.vaccines.id missing from baserow-config.json");
  process.exit(1);
}
console.log(`  ↳ vaccines table id=${vaccinesTableId}`);

const NEW_FIELDS = [
  { name: "proof_photo_url", type: "text" },
  { name: "invoice_photo_url", type: "text" },
];

const existing = await api<FieldDef[]>(`/database/fields/table/${vaccinesTableId}/`);
const have = new Set(existing.map((f) => f.name));
let added = 0;
for (const f of NEW_FIELDS) {
  if (have.has(f.name)) {
    console.log(`  ✓ ${f.name} already exists — skip`);
    continue;
  }
  try {
    await api<FieldDef>(`/database/fields/table/${vaccinesTableId}/`, {
      method: "POST",
      body: JSON.stringify(f),
    });
    console.log(`  + ${f.name} created`);
    added++;
  } catch (err) {
    console.warn(`  ⚠ ${f.name} skipped:`, String(err).slice(0, 120));
  }
}
console.log(`  vaccines: +${added} fields`);

// Refresh config — only persist if at least one field was added (idempotent re-runs are no-ops)
const fresh = await api<FieldDef[]>(`/database/fields/table/${vaccinesTableId}/`);
const config: any = JSON.parse(JSON.stringify(existingConfig));
if (!config.tables.vaccines) config.tables.vaccines = { id: vaccinesTableId, fields: {} };
config.tables.vaccines.id = vaccinesTableId;
for (const f of fresh) {
  if (f.name) config.tables.vaccines.fields[f.name] = f.id;
}

const outPath = Bun.env.BASEROW_CONFIG_OUT || "/tmp/baserow-config.new.json";
writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`\n✅ vaccine photo fields migration done. New config → ${outPath}`);
