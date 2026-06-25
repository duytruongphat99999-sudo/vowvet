/**
 * FOSTER L5a migration — bảng MỚI `foster_orders` (đơn góp gói).
 * Fields: order_code, pet_id(link→pets), pet_owner_id(num), package_id(num),
 *         package_title, package_price(num), status(select 4 opt), donor_name, created_at.
 * KHÔNG có field địa chỉ foster (③ — không vào đơn).
 *
 * ANTI-CLOBBER: nếu bảng foster_orders ĐÃ tồn tại → DỪNG, không tạo đè.
 * Run trên HOST: bun run scripts/migrate-foster-orders.ts
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL, PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("❌ Thiếu BASEROW_USER_EMAIL/PASSWORD"); process.exit(1); }

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST", headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) { console.error("❌ Login failed:", await loginRes.text()); process.exit(1); }
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init, headers: { Authorization: `JWT ${JWT}`, "Content-Type": "application/json", Host: "localhost:8888", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface TableDef { id: number; name: string; }
interface FieldDef { id: number; name: string; type: string; }
const DATABASE_ID = (existingConfig as any).database_id;
const PETS_TABLE = (existingConfig as any).tables.pets.id as number;
const opt = (value: string, color = "blue") => ({ value, color });

// ── ANTI-CLOBBER ──────────────────────────────────────────────
const tablesBefore = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
console.log(`\n=== ANTI-CLOBBER db=${DATABASE_ID} ===`);
console.log(`Table count TRƯỚC: ${tablesBefore.length}`);
if (tablesBefore.find((t) => t.name === "foster_orders")) {
  const t = tablesBefore.find((t) => t.name === "foster_orders")!;
  console.log(`⛔ Bảng foster_orders ĐÃ tồn tại (id=${t.id}) — DỪNG, không tạo đè. Báo Duy.`);
  process.exit(0);
}

// ── TẠO BẢNG + FIELD ──────────────────────────────────────────
console.log(`🔄 Tạo bảng foster_orders…`);
const table = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
  method: "POST", body: JSON.stringify({ name: "foster_orders" }),
});
console.log(`  + table foster_orders id=${table.id}`);

const FIELDS = [
  { name: "order_code", type: "text" },
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "pet_owner_id", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "package_id", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "package_title", type: "text" },
  { name: "package_price", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "status", type: "single_select", select_options: [opt("mới", "blue"), opt("đã liên hệ", "orange"), opt("đã giao", "green"), opt("huỷ", "red")] },
  { name: "donor_name", type: "text" },
  { name: "created_at", type: "text" },
];
for (const f of FIELDS) {
  const created = await api<FieldDef>(`/database/fields/table/${table.id}/`, { method: "POST", body: JSON.stringify(f) });
  console.log(`  + ${f.name} → id ${created.id} (${created.type})`);
}

// ── CẬP NHẬT baserow-config.json (host, ghi trực tiếp) ─────────
const fresh = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
const config: any = JSON.parse(JSON.stringify(existingConfig));
config.tables.foster_orders = { id: table.id, fields: {} };
for (const f of fresh) if (f.name) config.tables.foster_orders.fields[f.name] = f.id;
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));

const tablesAfter = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
console.log(`\n=== KẾT QUẢ ===`);
console.log(`Table count SAU: ${tablesAfter.length} (trước ${tablesBefore.length})`);
console.log(`foster_orders id=${table.id}, fields: ${Object.keys(config.tables.foster_orders.fields).join(", ")}`);
console.log("✅ baserow-config.json cập nhật.");
