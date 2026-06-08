/**
 * M1 scan persist — tạo table "scan_logs" (mô hình A: bảng RIÊNG, aggregator thêm 1 nguồn ở M4).
 * Idempotent (theo pattern migrate-m26.ts): JWT login → ensureTable → ghi baserow-config.json.
 *
 * CHỈ tạo table + field. KHÔNG đụng code feature (food-scan.ts/vision/matcher = Meliodas, persist = M2).
 * created_at = TEXT ISO (app-set) — KHÔNG dùng Baserow auto created_on, để aggregator filter
 *   `created_at__date_after_or_equal` chạy như 7 nguồn cũ (pets.ts:1808).
 *
 * Run (repo root, HOST; Bun tự nạp .env — KHÔNG in pass/token):
 *   BASEROW_URL=http://localhost:8888 bun run scripts/migrate-scan-logs.ts
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const HOST_HEADER = Bun.env.BASEROW_HOST_HEADER || "localhost:8888";
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD trong .env"); process.exit(1); }

// ── [C] DRY-CHECK: nếu đã có scan_logs → DỪNG (không tạo trùng) ──
if ((existingConfig as any).tables?.scan_logs) {
  console.error(`⛔ scan_logs ĐÃ tồn tại trong baserow-config.json (id=${(existingConfig as any).tables.scan_logs.id}). Không tạo trùng.`);
  process.exit(1);
}

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: HOST_HEADER },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) { console.error(`❌ Baserow login thất bại (${loginRes.status})`); process.exit(1); }
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };
if (!JWT) { console.error("❌ Login OK nhưng không có access_token"); process.exit(1); }

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: { Authorization: `JWT ${JWT}`, "Content-Type": "application/json", Host: HOST_HEADER, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef { id: number; name: string; type: string; }
interface TableDef { id: number; name: string; }

const DATABASE_ID = (existingConfig as any).database_id;
const PETS_TABLE = (existingConfig as any).tables.pets.id;

// 18 field (đúng spec M1). decimal places theo loại số.
const SCAN_LOGS_FIELDS = [
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "scan_url", type: "url" },
  { name: "brand_name", type: "text" },
  { name: "product_line", type: "text" },
  { name: "species", type: "text" },
  { name: "life_stage", type: "text" },
  { name: "protein_pct", type: "number", number_decimal_places: 1 },
  { name: "fat_pct", type: "number", number_decimal_places: 1 },
  { name: "fiber_pct", type: "number", number_decimal_places: 1 },
  { name: "moisture_pct", type: "number", number_decimal_places: 1 },
  { name: "ash_pct", type: "number", number_decimal_places: 1 },
  { name: "carb_pct", type: "number", number_decimal_places: 1 },
  { name: "calories_per_100g", type: "number", number_decimal_places: 0 },
  { name: "match_confidence", type: "number", number_decimal_places: 2 },
  { name: "matched_brand_id", type: "number", number_decimal_places: 0 },
  { name: "ash_estimated", type: "boolean" },
  { name: "created_at", type: "text" },
];

async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
  let t = tables.find((x) => x.name === name);
  if (!t) {
    console.log(`🔄 Creating ${name}...`);
    t = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, { method: "POST", body: JSON.stringify({ name }) });
  } else {
    console.log(`ℹ️ Table ${name} đã có (id=${t.id}) — chỉ bổ field thiếu.`);
  }
  const existing = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  const have = new Set(existing.map((f) => f.name));
  let added = 0;
  for (const f of fields) {
    if (have.has(f.name)) continue;
    await api<FieldDef>(`/database/fields/table/${t.id}/`, { method: "POST", body: JSON.stringify(f) });
    added++;
  }
  console.log(`  ${name}: +${added} field mới (id=${t.id})`);
  return t;
}

const scanLogsTable = await ensureTable("scan_logs", SCAN_LOGS_FIELDS);

// ── [D] Sync baserow-config.json (skip Notes/Active mặc định Baserow) ──
const config: any = JSON.parse(JSON.stringify(existingConfig));
const fresh = await api<FieldDef[]>(`/database/fields/table/${scanLogsTable.id}/`);
if (!config.tables.scan_logs) config.tables.scan_logs = { id: scanLogsTable.id, fields: {} };
config.tables.scan_logs.id = scanLogsTable.id;
for (const f of fresh) {
  if (f.name && !["Notes", "Active"].includes(f.name)) config.tables.scan_logs.fields[f.name] = f.id;
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));

const fieldCount = Object.keys(config.tables.scan_logs.fields).length;
console.log(`\n✅ M1 done. scan_logs id=${scanLogsTable.id} · ${fieldCount} field ghi vào baserow-config.json`);
console.log(`NHỚ: thêm "scan_logs" vào TableName union (shared/baserow-config.ts). Persist = M2 (food-scan.ts). Aggregator = M4 (pets.ts).`);
