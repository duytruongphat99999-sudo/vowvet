/**
 * BƯỚC 2 migration: thêm 2 field cam kết hồ sơ trọn đời vào table `pets`.
 *   pledge_at   (date)  — mốc cam kết (mỗi bé)
 *   pledged_by  (text)  — tên người cam kết lúc đó
 * CHỈ THÊM — idempotent. Run: bun run scripts/migrate-baserow-buoc2-pledge.ts
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
  return res.json() as Promise<T>;
}

const PETS_ID = (existingConfig as any).tables.pets.id as number;
const fields = await api<Array<{ id: number; name: string }>>(`/database/fields/table/${PETS_ID}/`);
const byName = new Map(fields.map((f) => [f.name, f.id]));

const NEW = [
  { name: "pledge_at", type: "date", date_format: "ISO", date_include_time: false },
  { name: "pledged_by", type: "text" },
];
for (const def of NEW) {
  if (byName.has(def.name)) { console.log(`  ✓ ${def.name} đã có (id ${byName.get(def.name)}) — skip`); continue; }
  const created = await api<{ id: number; type: string }>(`/database/fields/table/${PETS_ID}/`, { method: "POST", body: JSON.stringify(def) });
  console.log(`  + tạo ${def.name} → id ${created.id} (${created.type})`);
  byName.set(def.name, created.id);
}

const config: any = JSON.parse(JSON.stringify(existingConfig));
config.tables.pets.fields.pledge_at = byName.get("pledge_at");
config.tables.pets.fields.pledged_by = byName.get("pledged_by");
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("✅ [Bước 2] pledge_at =", byName.get("pledge_at"), "· pledged_by =", byName.get("pledged_by"), "+ config cập nhật.");
