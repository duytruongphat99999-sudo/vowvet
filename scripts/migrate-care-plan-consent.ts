/**
 * Add care_plan_consented_at + care_plan_consent_version fields to users table.
 *
 * Idempotent. Clones the JWT auth + ensureField pattern from
 * migrate-vaccine-photo-fields.ts.
 *
 * **Why these fields**: Pre-Launch A5 — First-Use Care Plan Consent Modal.
 * Before any user views the AI-generated Care Plan, they must acknowledge
 * that it's AI guidance and NOT a substitute for veterinary care.
 *
 * - care_plan_consented_at: date_with_time — timestamp the user clicked
 *   "Tôi đồng ý". NULL = not consented yet → modal blocks view.
 * - care_plan_consent_version: text — version string (e.g. "v1-2026-05")
 *   so future copy updates can force re-consent if material changes are made.
 *
 * Run:
 *   cat scripts/migrate-care-plan-consent.ts | docker exec -i vowvet-api sh -c 'cat > /tmp/migrate-care-plan-consent.ts && bun run /tmp/migrate-care-plan-consent.ts'
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

const usersTableId = (existingConfig as any).tables?.users?.id;
if (!usersTableId) {
  console.error("❌ tables.users.id missing from baserow-config.json");
  process.exit(1);
}
console.log(`  ↳ users table id=${usersTableId}`);

const NEW_FIELDS = [
  { name: "care_plan_consented_at", type: "date", date_include_time: true, date_time_format: "24" },
  { name: "care_plan_consent_version", type: "text" },
];

const existing = await api<FieldDef[]>(`/database/fields/table/${usersTableId}/`);
const have = new Set(existing.map((f) => f.name));
let added = 0;
for (const f of NEW_FIELDS) {
  if (have.has(f.name)) {
    console.log(`  ✓ ${f.name} already exists — skip`);
    continue;
  }
  try {
    await api<FieldDef>(`/database/fields/table/${usersTableId}/`, {
      method: "POST",
      body: JSON.stringify(f),
    });
    console.log(`  + ${f.name} created`);
    added++;
  } catch (err) {
    console.warn(`  ⚠ ${f.name} skipped:`, String(err).slice(0, 120));
  }
}
console.log(`  users: +${added} fields`);

// Refresh config — only persist if at least one field was added (idempotent re-runs are no-ops)
const fresh = await api<FieldDef[]>(`/database/fields/table/${usersTableId}/`);
const config: any = JSON.parse(JSON.stringify(existingConfig));
if (!config.tables.users) config.tables.users = { id: usersTableId, fields: {} };
config.tables.users.id = usersTableId;
for (const f of fresh) {
  if (f.name) config.tables.users.fields[f.name] = f.id;
}

const outPath = Bun.env.BASEROW_CONFIG_OUT || "/tmp/baserow-config.new.json";
writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`\n✅ care_plan_consent migration done. New config → ${outPath}`);
