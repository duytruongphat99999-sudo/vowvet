/**
 * Pilot onboard script — import users từ data/pilot-users.csv.
 *
 * Idempotent: skip nếu phone đã tồn tại trong DB.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."   # cần để verify access
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   $env:BASEROW_TOKEN = "..."         # cho row CRUD
 *   bun run scripts/pilot-onboard.ts
 *
 * Output: data/pilot-onboard-log.json — chi tiết success/skip/fail cho mỗi user
 */
import { readFile, writeFile } from "node:fs/promises";

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const TOKEN = Bun.env.BASEROW_TOKEN;
const CSV_PATH = "./data/pilot-users.csv";
const LOG_PATH = "./data/pilot-onboard-log.json";

if (!TOKEN) {
  console.error("❌ BASEROW_TOKEN required. Set $env:BASEROW_TOKEN = '...' trong PowerShell");
  process.exit(1);
}

// Load baserow-config.json
let config: any;
try {
  config = JSON.parse(await readFile("./baserow-config.json", "utf-8"));
} catch (err) {
  console.error("❌ Không load được baserow-config.json:", err);
  process.exit(1);
}
const USERS_TABLE = config.tables.users.id;

// Load CSV
let csvContent: string;
try {
  csvContent = await readFile(CSV_PATH, "utf-8");
} catch {
  console.error(`❌ File ${CSV_PATH} không tồn tại. Tạo file CSV trước:`);
  console.error(`   phone,name,city,notes`);
  console.error(`   +84901234567,Khách 1,ho_chi_minh,...`);
  process.exit(1);
}

interface CsvRow {
  phone: string;
  name: string;
  city: string;
  notes?: string;
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const row: any = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cells[j] || "";
    if (!row.phone || !row.name) continue;
    rows.push(row as CsvRow);
  }
  return rows;
}

const VALID_CITIES = ["ho_chi_minh", "ha_noi", "da_nang", "da_lat"];

function normalizePhone(raw: string): string {
  let phone = raw.trim().replace(/[\s\-()]/g, "");
  if (phone.startsWith("84") && !phone.startsWith("+")) phone = "+" + phone;
  if (phone.startsWith("0")) phone = "+84" + phone.slice(1);
  if (!phone.startsWith("+84")) throw new Error(`Phone không hợp lệ: ${raw}`);
  return phone;
}

async function tokenApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Token API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function findUserByPhone(phone: string): Promise<any | null> {
  const r = await tokenApi<{ count: number; results: any[] }>(
    `/database/rows/table/${USERS_TABLE}/?user_field_names=true&filter__phone__equal=${encodeURIComponent(phone)}&size=1`
  );
  return r.results[0] || null;
}

async function createUser(phone: string, name: string, city: string): Promise<any> {
  return tokenApi(
    `/database/rows/table/${USERS_TABLE}/?user_field_names=true`,
    {
      method: "POST",
      body: JSON.stringify({
        phone,
        name,
        city,
        plan_tier: "free",
        last_login_at: null,
        auth_method: "phone_otp",
      }),
    }
  );
}

// ============================================================
// MAIN
// ============================================================
const rows = parseCsv(csvContent);
console.log(`📋 Loaded ${rows.length} pilot user(s) from CSV.\n`);

interface OnboardResult {
  csv_phone: string;
  name: string;
  city: string;
  normalized_phone?: string;
  status: "created" | "skipped_exists" | "failed";
  user_id?: number;
  error?: string;
}

const results: OnboardResult[] = [];

for (const row of rows) {
  const result: OnboardResult = {
    csv_phone: row.phone,
    name: row.name,
    city: row.city,
    status: "failed",
  };

  try {
    const phone = normalizePhone(row.phone);
    result.normalized_phone = phone;

    const city = VALID_CITIES.includes(row.city) ? row.city : "ho_chi_minh";

    const existing = await findUserByPhone(phone);
    if (existing) {
      result.status = "skipped_exists";
      result.user_id = existing.id;
      console.log(`  ⊙ ${phone} "${row.name}" → đã tồn tại (id=${existing.id})`);
      results.push(result);
      continue;
    }

    const created = await createUser(phone, row.name, city);
    result.status = "created";
    result.user_id = created.id;
    console.log(`  ✓ ${phone} "${row.name}" → created id=${created.id}`);
    results.push(result);
  } catch (err: any) {
    result.error = err?.message || String(err);
    console.error(`  ✗ ${row.phone} "${row.name}" → ${result.error}`);
    results.push(result);
  }
}

// Write log
const summary = {
  total: rows.length,
  created: results.filter((r) => r.status === "created").length,
  skipped: results.filter((r) => r.status === "skipped_exists").length,
  failed: results.filter((r) => r.status === "failed").length,
  timestamp: new Date().toISOString(),
  results,
};
await writeFile(LOG_PATH, JSON.stringify(summary, null, 2));

console.log(`\n📊 Summary:`);
console.log(`  Created:  ${summary.created}`);
console.log(`  Skipped:  ${summary.skipped}`);
console.log(`  Failed:   ${summary.failed}`);
console.log(`\n💾 Log saved to ${LOG_PATH}`);
console.log(`\n📌 Next step — manual gửi welcome message qua Zalo (template trong docs/PILOT_LAUNCH.md).`);
