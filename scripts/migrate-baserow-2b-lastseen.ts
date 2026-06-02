/**
 * Đợt 2b migration: thêm 1 field `last_seen_food_brands` (date) vào table `users`.
 * Phục vụ popup nhắc cân 1 lần/ngày/user (lưu theo user, KHÔNG localStorage).
 * CHỈ THÊM — idempotent (skip nếu đã có). Run: bun run scripts/migrate-baserow-2b-lastseen.ts
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("❌ Thiếu BASEROW_USER_EMAIL/PASSWORD"); process.exit(1); }

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) { console.error("❌ Login failed:", await loginRes.text()); process.exit(1); }
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: { Authorization: `JWT ${JWT}`, "Content-Type": "application/json", Host: "localhost:8888", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

const USERS_ID = (existingConfig as any).tables.users.id as number;
const fields = await api<Array<{ id: number; name: string; type: string }>>(`/database/fields/table/${USERS_ID}/`);
const existing = fields.find((f) => f.name === "last_seen_food_brands");

let fieldId: number;
if (existing) {
  console.log(`  ✓ last_seen_food_brands đã tồn tại (id ${existing.id}) — skip`);
  fieldId = existing.id;
} else {
  const created = await api<{ id: number }>(`/database/fields/table/${USERS_ID}/`, {
    method: "POST",
    body: JSON.stringify({ name: "last_seen_food_brands", type: "date", date_format: "ISO", date_include_time: false }),
  });
  console.log(`  + tạo last_seen_food_brands → id ${created.id} (date)`);
  fieldId = created.id;
}

const config: any = JSON.parse(JSON.stringify(existingConfig));
config.tables.users.fields.last_seen_food_brands = fieldId;
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("✅ [2b] users.last_seen_food_brands =", fieldId, "+ config cập nhật.");
