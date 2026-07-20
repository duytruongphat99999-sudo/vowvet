/**
 * FOSTER PAYMENT migration — thêm field cho luồng thu/chi PayOS (epic foster-payment §5).
 * Bảng `foster_orders` (+16 field) và `users` (+3 field bank profile).
 *
 * AN TOÀN:
 *  - ADDITIVE ONLY: chỉ POST field mới, KHÔNG sửa/xoá field cũ.
 *  - IDEMPOTENT: field đã tồn tại (theo name) → SKIP, không tạo đè. Chạy lại vô hại.
 *  - KHÔNG đụng bảng khác. Table id đọc từ baserow-config.json.
 *  - beneficiary_user_id = number (đồng bộ pet_owner_id, tránh link_row array format).
 *  - paid_at/payout_at/approved_at/deleted_at = date(có giờ) theo spec §5.
 *
 * Run trên HOST từ repo root:
 *   bun --env-file=.env run scripts/migrate-foster-payment.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
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

interface FieldDef { id: number; name: string; type: string; }

const opt = (value: string, color: string) => ({ value, color });
const dt = () => ({ type: "date", date_format: "ISO", date_include_time: true, date_time_format: "24" });
const num = () => ({ type: "number", number_decimal_places: 0, number_negative: false });

// ── FIELD SPEC (§5 + deleted_at đã duyệt) ──────────────────────
const FOSTER_FIELDS: Record<string, any>[] = [
  { name: "payment_status", type: "single_select", select_options: [opt("pending", "blue"), opt("paid", "green"), opt("failed", "red")] },
  { name: "amount_paid", ...num() },
  { name: "paid_at", ...dt() },
  { name: "pay_ref", type: "text" },
  { name: "payos_order_code", ...num() },
  { name: "beneficiary_user_id", ...num() },
  { name: "beneficiary_bank_bin", type: "text" },
  { name: "beneficiary_account_no", type: "text" },
  { name: "beneficiary_account_name", type: "text" },
  { name: "payout_amount", ...num() },
  { name: "payout_status", type: "single_select", select_options: [opt("none", "dark-blue"), opt("pending", "blue"), opt("sent", "orange"), opt("success", "green"), opt("failed", "red")] },
  { name: "payout_ref", type: "text" },
  { name: "payout_at", ...dt() },
  { name: "approved_by", type: "text" },
  { name: "approved_at", ...dt() },
  { name: "deleted_at", ...dt() },
];
const USER_FIELDS: Record<string, any>[] = [
  { name: "bank_bin", type: "text" },
  { name: "bank_account_no", type: "text" },
  { name: "bank_account_name", type: "text" },
];

const config: any = JSON.parse(JSON.stringify(existingConfig));
const FOSTER_TABLE = config.tables.foster_orders?.id as number;
const USERS_TABLE = config.tables.users?.id as number;
if (!FOSTER_TABLE || !USERS_TABLE) { console.error("❌ Thiếu table id foster_orders/users trong config"); process.exit(1); }

async function ensureFields(tableId: number, tableName: string, specs: Record<string, any>[]) {
  const existing = await api<FieldDef[]>(`/database/fields/table/${tableId}/`);
  const byName = new Map(existing.map((f) => [f.name, f]));
  console.log(`\n=== ${tableName} (id ${tableId}) — hiện ${existing.length} field ===`);
  let created = 0, skipped = 0;
  for (const spec of specs) {
    if (byName.has(spec.name)) {
      console.log(`  · SKIP ${spec.name} (đã có id ${byName.get(spec.name)!.id})`);
      skipped++;
      continue;
    }
    const f = await api<FieldDef>(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(spec) });
    console.log(`  + CREATE ${f.name} → id ${f.id} (${f.type})`);
    created++;
  }
  console.log(`  → created ${created}, skipped ${skipped}`);
  // Cập nhật config.tables[tableName].fields từ trạng thái MỚI NHẤT.
  const fresh = await api<FieldDef[]>(`/database/fields/table/${tableId}/`);
  config.tables[tableName] = config.tables[tableName] || { id: tableId, fields: {} };
  config.tables[tableName].id = tableId;
  config.tables[tableName].fields = {};
  for (const f of fresh) if (f.name) config.tables[tableName].fields[f.name] = f.id;
}

await ensureFields(FOSTER_TABLE, "foster_orders", FOSTER_FIELDS);
await ensureFields(USERS_TABLE, "users", USER_FIELDS);

const CONFIG_PATH = join(import.meta.dir, "..", "baserow-config.json");
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
console.log(`\n✅ baserow-config.json cập nhật (${CONFIG_PATH}).`);
console.log("foster_orders fields:", Object.keys(config.tables.foster_orders.fields).length);
console.log("users fields:", Object.keys(config.tables.users.fields).length);
