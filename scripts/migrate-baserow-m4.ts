/**
 * M4 schema migration: đổi enum VN sang format mới cho daily_check_ins + care_plans.
 * Idempotent: re-run an toàn (skip nếu đã migrated).
 *
 * Yêu cầu env (set tạm khi run, KHÔNG commit):
 *   BASEROW_URL, BASEROW_WORKSPACE_ID (đã có sẵn .env)
 *   BASEROW_USER_EMAIL, BASEROW_USER_PASSWORD (cần thêm vào .env tạm)
 *
 * Run:  bun run scripts/migrate-baserow-m4.ts
 *
 * Changes:
 *   daily_check_ins.appetite        enum VN → number (rating 1-5)
 *   daily_check_ins.energy          enum VN → number (rating 1-5)
 *   daily_check_ins.stool_quality   enum VN → single_select EN (normal/soft/liquid/hard/none)
 *   daily_check_ins.symptoms        text/multi → multi_select EN (vomit/cough/sneeze/itch/limp/other)
 *   care_plans.urgency_level        enum 3-level → single_select EN 5-level (normal/monitor/consult/urgent/emergency)
 *
 * Sau khi chạy xong, rewrite baserow-config.json với field IDs mới.
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL hoặc BASEROW_USER_PASSWORD trong env.\n" +
      "Set tạm trong .env hoặc inline:\n" +
      "  BASEROW_USER_EMAIL=admin@example.com BASEROW_USER_PASSWORD=xxx bun run scripts/migrate-baserow-m4.ts"
  );
  process.exit(1);
}

console.log(`[migrate] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate] Logged in.\n");

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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${init.method || "GET"} ${path} → ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef {
  id: number;
  name: string;
  type: string;
  select_options?: Array<{ id: number; value: string; color: string }>;
}

async function listFields(tableId: number): Promise<FieldDef[]> {
  return api<FieldDef[]>(`/database/fields/table/${tableId}/`);
}

async function patchField(fieldId: number, data: Record<string, unknown>): Promise<FieldDef> {
  return api<FieldDef>(`/database/fields/${fieldId}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

async function deleteField(fieldId: number): Promise<void> {
  await api(`/database/fields/${fieldId}/`, { method: "DELETE" });
}

async function createField(tableId: number, data: Record<string, unknown>): Promise<FieldDef> {
  return api<FieldDef>(`/database/fields/table/${tableId}/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ===== Migration logic =====
const DCI_ID = existingConfig.tables.daily_check_ins.id;
const CP_ID = existingConfig.tables.care_plans.id;

console.log(`[migrate] daily_check_ins table=${DCI_ID}`);
console.log(`[migrate] care_plans     table=${CP_ID}\n`);

const dciFields = await listFields(DCI_ID);
const cpFields = await listFields(CP_ID);

function findField(fields: FieldDef[], name: string): FieldDef | undefined {
  return fields.find((f) => f.name === name);
}

// Helper: change field type. Baserow PATCH /fields/:id chấp nhận đổi type bằng cách
// gửi {type, ...new_options}. Data cũ sẽ bị clear hoặc convert tuỳ type.
async function changeFieldToNumber(field: FieldDef, name: string) {
  if (field.type === "number") {
    console.log(`  ✓ ${name} đã là number, skip`);
    return field;
  }
  console.log(`  → đổi ${name} (${field.type}) sang number rating 1-5`);
  // Đổi sang number với decimal_places=0
  return patchField(field.id, {
    name,
    type: "number",
    number_decimal_places: 0,
    number_negative: false,
  });
}

async function changeSelectOptions(
  field: FieldDef,
  name: string,
  options: Array<{ value: string; color: string }>,
  multipleAllowed = false
) {
  const targetType = multipleAllowed ? "multiple_select" : "single_select";
  const currentValues = new Set((field.select_options || []).map((o) => o.value));
  const newValues = new Set(options.map((o) => o.value));
  const sameType = field.type === targetType;
  const sameOptions = currentValues.size === newValues.size && [...newValues].every((v) => currentValues.has(v));
  if (sameType && sameOptions) {
    console.log(`  ✓ ${name} đã đúng (${targetType} với ${options.length} options)`);
    return field;
  }
  console.log(`  → đổi ${name} (${field.type}) sang ${targetType} với ${options.length} options EN`);
  return patchField(field.id, {
    name,
    type: targetType,
    select_options: options,
  });
}

// daily_check_ins: appetite
{
  const f = findField(dciFields, "appetite");
  if (!f) console.warn("⚠  appetite field không tồn tại");
  else await changeFieldToNumber(f, "appetite");
}

// daily_check_ins: energy
{
  const f = findField(dciFields, "energy");
  if (!f) console.warn("⚠  energy field không tồn tại");
  else await changeFieldToNumber(f, "energy");
}

// daily_check_ins: stool_quality
{
  const f = findField(dciFields, "stool_quality");
  if (!f) console.warn("⚠  stool_quality field không tồn tại");
  else
    await changeSelectOptions(f, "stool_quality", [
      { value: "normal", color: "green" },
      { value: "soft", color: "light-blue" },
      { value: "liquid", color: "blue" },
      { value: "hard", color: "orange" },
      { value: "none", color: "gray" },
    ]);
}

// daily_check_ins: symptoms (multi_select)
{
  const f = findField(dciFields, "symptoms");
  if (!f) console.warn("⚠  symptoms field không tồn tại");
  else
    await changeSelectOptions(
      f,
      "symptoms",
      [
        { value: "vomit", color: "red" },
        { value: "cough", color: "orange" },
        { value: "sneeze", color: "yellow" },
        { value: "itch", color: "pink" },
        { value: "limp", color: "purple" },
        { value: "other", color: "gray" },
      ],
      true
    );
}

// care_plans: urgency_level (single_select 5 levels EN)
{
  const f = findField(cpFields, "urgency_level");
  if (!f) {
    // Có thể chưa tạo field này — tạo mới
    console.log("  → tạo mới care_plans.urgency_level");
    await createField(CP_ID, {
      name: "urgency_level",
      type: "single_select",
      select_options: [
        { value: "normal", color: "green" },
        { value: "monitor", color: "yellow" },
        { value: "consult", color: "orange" },
        { value: "urgent", color: "red" },
        { value: "emergency", color: "dark-red" },
      ],
    });
  } else {
    await changeSelectOptions(f, "urgency_level", [
      { value: "normal", color: "green" },
      { value: "monitor", color: "yellow" },
      { value: "consult", color: "orange" },
      { value: "urgent", color: "red" },
      { value: "emergency", color: "dark-red" },
    ]);
  }
}

// Re-read fields để lấy IDs (có thể không đổi nhưng safe)
console.log("\n[migrate] Re-reading field IDs để update baserow-config.json...");
const newDci = await listFields(DCI_ID);
const newCp = await listFields(CP_ID);

const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of newDci) {
  if (config.tables.daily_check_ins.fields[f.name] !== undefined) {
    config.tables.daily_check_ins.fields[f.name] = f.id;
  }
}
for (const f of newCp) {
  if (config.tables.care_plans.fields[f.name] !== undefined) {
    config.tables.care_plans.fields[f.name] = f.id;
  }
}
// Đảm bảo urgency_level mới có trong config (nếu vừa tạo)
const ul = newCp.find((f) => f.name === "urgency_level");
if (ul) config.tables.care_plans.fields.urgency_level = ul.id;

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n✅ Migration hoàn tất. baserow-config.json đã cập nhật.");
