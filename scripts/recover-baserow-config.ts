/**
 * RECOVERY: Rebuild baserow-config.json từ DB hiện hành.
 *
 * Lý do tồn tại: M8 migration vô tình ghi đè config trỏ về DB fresh (137)
 * trong khi data thật ở DB 136. Script này quét tất cả tables + fields trong
 * 1 database, viết lại baserow-config.json đúng cấu trúc.
 *
 * Idempotent, KHÔNG ghi gì lên Baserow (read-only).
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "admin@..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:DATABASE_ID = "136"   # optional, default 136
 *   bun run scripts/recover-baserow-config.ts
 */
import { writeFileSync } from "node:fs";

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const DATABASE_ID = Number(Bun.env.DATABASE_ID || "136");

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      "  bun run scripts/recover-baserow-config.ts"
  );
  process.exit(1);
}

console.log(`[recover] Login ${BASEROW_URL}, target DB ${DATABASE_ID}...`);
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
console.log("[recover] Logged in.\n");

async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    headers: {
      Authorization: `JWT ${JWT}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
    },
  });
  if (!res.ok) throw new Error(`API GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface TableDef {
  id: number;
  name: string;
}
interface FieldDef {
  id: number;
  name: string;
  type: string;
  primary?: boolean;
}

// ============================================================
// QUÉT toàn bộ tables + fields trong DATABASE_ID
// ============================================================
console.log(`🔍 Scanning DB ${DATABASE_ID}...`);
const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
console.log(`  ${tables.length} tables found:\n`);

const config: {
  database_id: number;
  tables: Record<string, { id: number; fields: Record<string, number> }>;
} = {
  database_id: DATABASE_ID,
  tables: {},
};

for (const t of tables) {
  const fields = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  const fieldsMap: Record<string, number> = {};
  for (const f of fields) {
    // Bỏ qua "Notes" + "Active" — internal Baserow stub fields
    if (f.name === "Notes" || f.name === "Active") continue;
    if (!f.name) continue;
    fieldsMap[f.name] = f.id;
  }
  config.tables[t.name] = { id: t.id, fields: fieldsMap };
  console.log(`  ✓ ${t.name} (id=${t.id}) — ${Object.keys(fieldsMap).length} fields`);
}

console.log(`\n💾 Writing baserow-config.json...`);
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log(`  Tables count: ${Object.keys(config.tables).length}`);
console.log(`  Total fields: ${Object.values(config.tables).reduce((sum, t) => sum + Object.keys(t.fields).length, 0)}`);

console.log("\n✅ baserow-config.json đã được khôi phục.");
console.log("   Restart vowvet-api để picked up: docker restart vowvet-api");
console.log("   Sau đó re-run migrate-m8.ts để add M8 fields cho DB " + DATABASE_ID + ":");
console.log("     bun run scripts/migrate-m8.ts");
