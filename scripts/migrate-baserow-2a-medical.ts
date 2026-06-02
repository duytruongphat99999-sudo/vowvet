/**
 * Đợt 2a migration: thêm 5 field "bệnh sử y khoa" vào table `pets`.
 * CHỈ THÊM field mới — KHÔNG sửa/xóa field cũ. Idempotent: re-run an toàn (skip nếu field đã tồn tại).
 *
 * Yêu cầu env (đã có sẵn trong .env): BASEROW_URL, BASEROW_USER_EMAIL, BASEROW_USER_PASSWORD
 * Run:  bun run scripts/migrate-baserow-2a-medical.ts
 *
 * Fields thêm vào pets:
 *   health_conditions    long_text   (JSON array of {code, status, since})
 *   coat_condition       single_select [normal/dry/shedding/oily]
 *   dental_status        single_select [good/tartar/missing_teeth/under_treatment]
 *   current_medications  long_text
 *   health_history       long_text
 *
 * Sau khi chạy: rewrite baserow-config.json với field IDs mới (tables.pets.fields).
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD trong env.");
  process.exit(1);
}

console.log(`[2a] Logging in to ${BASEROW_URL}...`);
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
console.log("[2a] Logged in.\n");

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
  if (!res.ok) throw new Error(`API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef { id: number; name: string; type: string; }

const PETS_ID = (existingConfig as any).tables.pets.id as number;
console.log(`[2a] pets table = ${PETS_ID}`);

const existing = await api<FieldDef[]>(`/database/fields/table/${PETS_ID}/`);
const byName = new Map(existing.map((f) => [f.name, f]));

// Định nghĩa field mới (CHỈ THÊM — không đụng field có sẵn)
const NEW_FIELDS: Array<Record<string, unknown>> = [
  { name: "health_conditions", type: "long_text" },
  {
    name: "coat_condition",
    type: "single_select",
    select_options: [
      { value: "normal", color: "green" },
      { value: "dry", color: "orange" },
      { value: "shedding", color: "red" },
      { value: "oily", color: "yellow" },
    ],
  },
  {
    name: "dental_status",
    type: "single_select",
    select_options: [
      { value: "good", color: "green" },
      { value: "tartar", color: "yellow" },
      { value: "missing_teeth", color: "red" },
      { value: "under_treatment", color: "blue" },
    ],
  },
  { name: "current_medications", type: "long_text" },
  { name: "health_history", type: "long_text" },
];

for (const def of NEW_FIELDS) {
  const name = def.name as string;
  if (byName.has(name)) {
    console.log(`  ✓ ${name} đã tồn tại (id ${byName.get(name)!.id}) — skip`);
    continue;
  }
  const created = await api<FieldDef>(`/database/fields/table/${PETS_ID}/`, {
    method: "POST",
    body: JSON.stringify(def),
  });
  console.log(`  + tạo ${name} → id ${created.id} (${created.type})`);
  byName.set(name, created);
}

// Re-read + cập nhật baserow-config.json (chỉ thêm 5 field IDs vào pets, giữ nguyên field cũ)
console.log("\n[2a] Cập nhật baserow-config.json...");
const fresh = await api<FieldDef[]>(`/database/fields/table/${PETS_ID}/`);
const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const def of NEW_FIELDS) {
  const f = fresh.find((x) => x.name === def.name);
  if (f) config.tables.pets.fields[f.name] = f.id;
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));

console.log("✅ [2a] Migration xong. 5 field bệnh sử đã thêm vào pets + config cập nhật.");
console.log("   health_conditions:", config.tables.pets.fields.health_conditions);
console.log("   coat_condition:", config.tables.pets.fields.coat_condition);
console.log("   dental_status:", config.tables.pets.fields.dental_status);
console.log("   current_medications:", config.tables.pets.fields.current_medications);
console.log("   health_history:", config.tables.pets.fields.health_history);
