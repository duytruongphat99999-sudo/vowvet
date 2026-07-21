/**
 * FOSTER-CARE W-G migration — TẠO bảng MỚI adoption_requests (xin nhận nuôi từ browse → duyệt → transferPet).
 * Bám mẫu migrate-foster-care-wc.ts. pet_id = NUMBER (khớp reclaim_requests, KHÔNG link_row — §4).
 *
 * ANTI-CLOBBER: bảng adoption_requests ĐÃ tồn tại → DỪNG (không tạo đè). Chạy lại vô hại.
 * Run trên HOST từ repo root: bun --env-file=.env run scripts/migrate-foster-care-wg.ts
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
interface TableDef { id: number; name: string; }
interface FieldDef { id: number; name: string; type: string; }

const config: any = JSON.parse(JSON.stringify(existingConfig));
const DATABASE_ID = config.database_id;
if (!DATABASE_ID) { console.error("❌ Thiếu database_id trong config"); process.exit(1); }
const opt = (value: string, color: string) => ({ value, color });
const dt = () => ({ type: "date", date_format: "ISO", date_include_time: true, date_time_format: "24" });
const num = () => ({ type: "number", number_decimal_places: 0, number_negative: false });

// ── ANTI-CLOBBER ──
const tablesBefore = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
if (tablesBefore.find((t) => t.name === "adoption_requests")) {
  const t = tablesBefore.find((t) => t.name === "adoption_requests")!;
  console.log(`⛔ Bảng adoption_requests ĐÃ tồn tại (id=${t.id}) — DỪNG, không tạo đè.`);
  process.exit(0);
}

// ── TẠO BẢNG + FIELD ──
console.log(`🔄 Tạo bảng adoption_requests…`);
const table = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
  method: "POST", body: JSON.stringify({ name: "adoption_requests" }),
});
console.log(`  + table adoption_requests id=${table.id}`);

const FIELDS: Record<string, any>[] = [
  { name: "pet_id", ...num() },              // NUMBER (khớp reclaim_requests, KHÔNG link_row)
  { name: "requester_user_id", ...num() },
  { name: "status", type: "text" },          // TEXT (khớp reclaim_requests) — Baserow filter __equal KHÔNG chạy trên single_select. Giá trị: pending|approved|rejected|cancelled (server kiểm soát).
  { name: "message", type: "long_text" },    // nullable — lời nhắn người xin (đa dòng)
  { name: "created_at", ...dt() },
  { name: "decided_at", ...dt() },
  { name: "decided_by", ...num() },
  { name: "deleted_at", ...dt() },
];
for (const f of FIELDS) {
  const created = await api<FieldDef>(`/database/fields/table/${table.id}/`, { method: "POST", body: JSON.stringify(f) });
  console.log(`  + ${f.name} → id ${created.id} (${created.type})`);
}

// ── CẬP NHẬT baserow-config.json (KHÔNG commit) ──
const fresh = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
config.tables.adoption_requests = { id: table.id, fields: {} };
for (const f of fresh) if (f.name) config.tables.adoption_requests.fields[f.name] = f.id;
const CONFIG_PATH = join(import.meta.dir, "..", "baserow-config.json");
writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
console.log(`\n✅ baserow-config.json cập nhật. adoption_requests id=${table.id}, fields: ${Object.keys(config.tables.adoption_requests.fields).join(", ")}`);
