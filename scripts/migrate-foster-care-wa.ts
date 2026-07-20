/**
 * FOSTER-CARE W-A migration — foster_orders += donor_user_id (number, nullable).
 * Để biết đơn góp là của user nào (sponsor identity) → cấp quyền xem pet ở W-B.
 *
 * ADDITIVE + IDEMPOTENT: field đã tồn tại → SKIP. Chạy lại vô hại.
 * Run trên HOST từ repo root:
 *   bun --env-file=.env run scripts/migrate-foster-care-wa.ts
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

const config: any = JSON.parse(JSON.stringify(existingConfig));
const FOSTER_TABLE = config.tables.foster_orders?.id as number;
if (!FOSTER_TABLE) { console.error("❌ Thiếu table id foster_orders trong config"); process.exit(1); }

const existing = await api<FieldDef[]>(`/database/fields/table/${FOSTER_TABLE}/`);
const byName = new Map(existing.map((f) => [f.name, f]));
if (byName.has("donor_user_id")) {
  console.log(`· SKIP donor_user_id (đã có id ${byName.get("donor_user_id")!.id})`);
} else {
  const f = await api<FieldDef>(`/database/fields/table/${FOSTER_TABLE}/`, {
    method: "POST",
    body: JSON.stringify({ name: "donor_user_id", type: "number", number_decimal_places: 0, number_negative: false }),
  });
  console.log(`+ CREATE donor_user_id → id ${f.id} (${f.type})`);
}

// Cập nhật baserow-config.json từ trạng thái MỚI NHẤT (KHÔNG commit — gitignored).
const fresh = await api<FieldDef[]>(`/database/fields/table/${FOSTER_TABLE}/`);
config.tables.foster_orders.fields = {};
for (const f of fresh) if (f.name) config.tables.foster_orders.fields[f.name] = f.id;
const CONFIG_PATH = join(import.meta.dir, "..", "baserow-config.json");
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
console.log(`✅ baserow-config.json cập nhật. foster_orders.donor_user_id = ${config.tables.foster_orders.fields.donor_user_id}`);
