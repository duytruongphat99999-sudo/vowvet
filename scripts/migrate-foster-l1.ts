/**
 * FOSTER L1 migration: thêm 2 field foster vào table `pets` (636).
 *   foster_status  (single_select) — 4 option: cần tài trợ / đang foster / sắp có nhà / đã về nhà
 *   foster_public  (boolean)       — cờ cho phép khoe bệnh án công khai (default false)
 *
 * ANTI-CLOBBER: đếm + list field hiện có TRƯỚC. Field đã tồn tại → SKIP (không tạo đè).
 * CHỈ THÊM — idempotent. Run: bun run scripts/migrate-foster-l1.ts
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

// ── STEP 0: ANTI-CLOBBER recon ──────────────────────────────
const before = await api<Array<{ id: number; name: string; type: string }>>(`/database/fields/table/${PETS_ID}/`);
const byName = new Map(before.map((f) => [f.name, f.id]));
console.log(`\n=== ANTI-CLOBBER pets(${PETS_ID}) ===`);
console.log(`Field count TRƯỚC: ${before.length}`);
console.log(`Fields: ${before.map((f) => f.name).join(", ")}`);
const fosterStatusExists = byName.has("foster_status");
const fosterPublicExists = byName.has("foster_public");
console.log(`foster_status tồn tại? ${fosterStatusExists ? "CÓ (id " + byName.get("foster_status") + ")" : "CHƯA"}`);
console.log(`foster_public tồn tại? ${fosterPublicExists ? "CÓ (id " + byName.get("foster_public") + ")" : "CHƯA"}`);

if (fosterStatusExists && fosterPublicExists) {
  console.log("\n⛔ CẢ 2 field ĐÃ tồn tại — DỪNG, không tạo đè (anti-clobber). Báo Duy.");
  process.exit(0);
}

// ── STEP 1: tạo field còn thiếu ─────────────────────────────
// single_select options: value + color (Baserow color names)
const FOSTER_STATUS_OPTIONS = [
  { value: "cần tài trợ", color: "orange" },
  { value: "đang foster", color: "blue" },
  { value: "sắp có nhà", color: "yellow" },
  { value: "đã về nhà", color: "green" },
];

if (!fosterStatusExists) {
  const created = await api<{ id: number; type: string; select_options: any[] }>(
    `/database/fields/table/${PETS_ID}/`,
    { method: "POST", body: JSON.stringify({ name: "foster_status", type: "single_select", select_options: FOSTER_STATUS_OPTIONS }) }
  );
  console.log(`\n+ tạo foster_status → id ${created.id} (${created.type})`);
  console.log(`  options: ${(created.select_options || []).map((o: any) => `"${o.value}"#${o.id}/${o.color}`).join(", ")}`);
  byName.set("foster_status", created.id);
} else {
  console.log(`\n  ✓ foster_status đã có (id ${byName.get("foster_status")}) — skip`);
}

if (!fosterPublicExists) {
  // Baserow boolean default = false (unchecked) — đúng yêu cầu default false.
  const created = await api<{ id: number; type: string }>(
    `/database/fields/table/${PETS_ID}/`,
    { method: "POST", body: JSON.stringify({ name: "foster_public", type: "boolean" }) }
  );
  console.log(`+ tạo foster_public → id ${created.id} (${created.type}) · default false`);
  byName.set("foster_public", created.id);
} else {
  console.log(`  ✓ foster_public đã có (id ${byName.get("foster_public")}) — skip`);
}

// ── STEP 2: cập nhật baserow-config.json ────────────────────
const config: any = JSON.parse(JSON.stringify(existingConfig));
config.tables.pets.fields.foster_status = byName.get("foster_status");
config.tables.pets.fields.foster_public = byName.get("foster_public");
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));

const after = await api<Array<{ id: number; name: string }>>(`/database/fields/table/${PETS_ID}/`);
console.log(`\n=== KẾT QUẢ ===`);
console.log(`Field count SAU: ${after.length} (trước ${before.length})`);
console.log(`foster_status = ${byName.get("foster_status")} · foster_public = ${byName.get("foster_public")}`);
console.log("✅ baserow-config.json cập nhật.");
