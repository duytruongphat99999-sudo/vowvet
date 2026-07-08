/**
 * CONVERSATIONS migration — 2 bảng MỚI cho chat support/foster (KHÔNG đụng telehealth chat cũ).
 *   conversations: type, user1_id, user2_id, context_id, context_type, last_msg_at, created_at
 *   messages:      conversation_id, sender_id, content(long_text), created_at, read_at
 *
 * ANTI-CLOBBER: bảng đã tồn tại → bỏ qua bảng đó (không tạo đè).
 * Run trên HOST: bun run scripts/migrate-conversations.ts
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
const num = { number_decimal_places: 0, number_negative: false };

const SPECS: Record<string, any[]> = {
  conversations: [
    { name: "type", type: "text" },              // admin_support | foster | matchmaking
    { name: "user1_id", type: "number", ...num },
    { name: "user2_id", type: "number", ...num },
    { name: "context_id", type: "number", ...num },
    { name: "context_type", type: "text" },      // foster_handover | admin_support | matchmaking
    { name: "last_msg_at", type: "text" },
    { name: "created_at", type: "text" },
  ],
  messages: [
    { name: "conversation_id", type: "number", ...num },
    { name: "sender_id", type: "number", ...num },
    { name: "content", type: "long_text" },      // chat body — long_text (multiline)
    { name: "created_at", type: "text" },
    { name: "read_at", type: "text" },           // "" = chưa đọc
  ],
};

const tablesBefore = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
console.log(`\n=== db=${DATABASE_ID} · tables trước: ${tablesBefore.length} ===`);
const config: any = JSON.parse(JSON.stringify(existingConfig));

for (const [tableName, fields] of Object.entries(SPECS)) {
  if (tablesBefore.find((t) => t.name === tableName)) {
    console.log(`⛔ Bảng ${tableName} ĐÃ tồn tại — bỏ qua (không tạo đè).`);
    continue;
  }
  console.log(`🔄 Tạo bảng ${tableName}…`);
  const table = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
    method: "POST", body: JSON.stringify({ name: tableName }),
  });
  console.log(`  + table ${tableName} id=${table.id}`);
  for (const f of fields) {
    const created = await api<FieldDef>(`/database/fields/table/${table.id}/`, { method: "POST", body: JSON.stringify(f) });
    console.log(`  + ${f.name} → id ${created.id} (${created.type})`);
  }
  const fresh = await api<FieldDef[]>(`/database/fields/table/${table.id}/`);
  config.tables[tableName] = { id: table.id, fields: {} };
  for (const f of fresh) if (f.name) config.tables[tableName].fields[f.name] = f.id;
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
const tablesAfter = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
console.log(`\n=== KẾT QUẢ · tables sau: ${tablesAfter.length} ===`);
for (const name of Object.keys(SPECS)) {
  const t = config.tables[name];
  if (t) console.log(`${name} id=${t.id} · fields: ${Object.keys(t.fields).join(", ")}`);
}
console.log("✅ baserow-config.json cập nhật.");
