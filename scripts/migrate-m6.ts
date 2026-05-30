/**
 * M6 migration: Vaccine Calendar + reminders.
 *
 * Idempotent — re-run an toàn.
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/migrate-m6.ts
 *   Remove-Item Env:BASEROW_USER_EMAIL
 *   Remove-Item Env:BASEROW_USER_PASSWORD
 *
 * Changes:
 *   vaccines table: +8 fields (status, due_date, vaccine_code, 4 reminder flags, is_custom, series_type)
 *   vaccine_schedules: tạo mới + seed 9 templates (5 dog + 4 cat) theo WSAVA
 *   Backfill:
 *     - rows có administered_date → status="completed"
 *     - rows có vaccine_type → map sang vaccine_code (5-in-1→dhppl_5in1, etc.)
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ Thiếu BASEROW_USER_EMAIL hoặc BASEROW_USER_PASSWORD.\n" +
      "PowerShell:\n" +
      '  $env:BASEROW_USER_EMAIL = "..."\n' +
      '  $env:BASEROW_USER_PASSWORD = "..."\n' +
      "  bun run scripts/migrate-m6.ts"
  );
  process.exit(1);
}

console.log(`[migrate-m6] Logging in to ${BASEROW_URL}...`);
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
console.log("[migrate-m6] Logged in.\n");

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

// Token-based row CRUD (Phase 0 backfill simpler than JWT row write)
const BASEROW_TOKEN = Bun.env.BASEROW_TOKEN || existingConfig.tables.users ? "" : "";
async function tokenApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  // Đọc token từ .env file (host's process.env)
  const token = Bun.env.BASEROW_TOKEN;
  if (!token) throw new Error("BASEROW_TOKEN cần thiết cho backfill (đọc từ host .env)");
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Token API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef {
  id: number;
  name: string;
  type: string;
  primary?: boolean;
}
interface TableDef {
  id: number;
  name: string;
}

const listFields = (tableId: number) => api<FieldDef[]>(`/database/fields/table/${tableId}/`);
const createField = (tableId: number, data: Record<string, unknown>) =>
  api<FieldDef>(`/database/fields/table/${tableId}/`, { method: "POST", body: JSON.stringify(data) });
const listTables = (databaseId: number) => api<TableDef[]>(`/database/tables/database/${databaseId}/`);
const createTable = (databaseId: number, name: string) =>
  api<TableDef>(`/database/tables/database/${databaseId}/`, { method: "POST", body: JSON.stringify({ name }) });
const listRowsToken = (tableId: number, query = "") =>
  tokenApi<{ count: number; results: any[] }>(`/database/rows/table/${tableId}/?user_field_names=true&size=200${query}`);
const updateRowToken = (tableId: number, rowId: number, data: Record<string, unknown>) =>
  tokenApi(`/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
const createRowToken = (tableId: number, data: Record<string, unknown>) =>
  tokenApi(`/database/rows/table/${tableId}/?user_field_names=true`, {
    method: "POST",
    body: JSON.stringify(data),
  });
const getRowToken = (tableId: number, rowId: number) =>
  tokenApi(`/database/rows/table/${tableId}/${rowId}/?user_field_names=true`);

const VACCINES_TABLE = existingConfig.tables.vaccines.id;
const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;

const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// VACCINE CODE OPTIONS (15)
// ============================================================
const VACCINE_CODE_OPTIONS = [
  opt("parvo", "red"),
  opt("distemper", "orange"),
  opt("dhppl_5in1", "yellow"),
  opt("dhppl_7in1", "yellow"),
  opt("rabies", "purple"),       // chó
  opt("rabies_cat", "purple"),   // mèo
  opt("lepto", "green"),
  opt("bordetella", "blue"),
  opt("corona", "light-blue"),
  opt("fvrcp", "pink"),
  opt("calicivirus", "pink"),
  opt("rhinotracheitis", "pink"),
  opt("panleukopenia", "pink"),
  opt("felv", "brown"),
  opt("fiv", "gray"),
];

// ============================================================
// 1. PRE-COUNT
// ============================================================
const vaccinesPre = await listRowsToken(VACCINES_TABLE);
console.log(`📊 Pre-migration:`);
console.log(`  vaccines: ${vaccinesPre.count} rows\n`);

// ============================================================
// 2. ADD 9 FIELDS TO vaccines TABLE
// ============================================================
console.log("🔄 Adding fields to vaccines table...");

const NEW_VACCINES_FIELDS = [
  {
    name: "status",
    type: "single_select",
    select_options: [
      opt("scheduled", "blue"),
      opt("completed", "green"),
      opt("skipped", "gray"),
      opt("overdue", "red"),
    ],
  },
  { name: "due_date", type: "date" },
  { name: "vaccine_code", type: "single_select", select_options: VACCINE_CODE_OPTIONS },
  { name: "reminder_sent_14d", type: "boolean", boolean_default: false },
  { name: "reminder_sent_7d", type: "boolean", boolean_default: false },
  { name: "reminder_sent_1d", type: "boolean", boolean_default: false },
  { name: "reminder_sent_overdue", type: "boolean", boolean_default: false },
  { name: "is_custom", type: "boolean", boolean_default: false },
  {
    name: "series_type",
    type: "single_select",
    select_options: [
      opt("puppy_primary", "green"),
      opt("adult_catchup", "yellow"),
      opt("booster", "blue"),
      opt("custom", "gray"),
    ],
  },
];

const existingVacFields = await listFields(VACCINES_TABLE);
const existingVacFieldNames = new Set(existingVacFields.map((f) => f.name));
let addedV = 0;
let skippedV = 0;
for (const fieldDef of NEW_VACCINES_FIELDS) {
  if (existingVacFieldNames.has(fieldDef.name as string)) {
    skippedV++;
    continue;
  }
  await createField(VACCINES_TABLE, fieldDef);
  addedV++;
  console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
}
console.log(`  vaccines: +${addedV} added, ${skippedV} skipped\n`);

// ============================================================
// 3. CREATE vaccine_schedules TABLE
// ============================================================
const tables = await listTables(DATABASE_ID);
let schedulesTable = tables.find((t) => t.name === "vaccine_schedules");

const SCHEDULES_FIELDS = [
  {
    name: "species",
    type: "single_select",
    select_options: [opt("dog", "orange"), opt("cat", "pink")],
  },
  { name: "vaccine_name", type: "text" },
  { name: "vaccine_code", type: "single_select", select_options: VACCINE_CODE_OPTIONS },
  { name: "is_core", type: "boolean", boolean_default: false },
  { name: "first_dose_age_weeks", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "doses_count", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "interval_weeks_between", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "booster_interval_months", type: "number", number_decimal_places: 0, number_negative: false },
  { name: "description_vn", type: "long_text" },
  {
    name: "importance_level",
    type: "single_select",
    select_options: [
      opt("critical", "red"),
      opt("recommended", "yellow"),
      opt("optional", "gray"),
    ],
  },
];

if (!schedulesTable) {
  console.log("🆕 Creating vaccine_schedules table...");
  schedulesTable = await createTable(DATABASE_ID, "vaccine_schedules");
  console.log(`  table id=${schedulesTable.id}`);
  for (const fieldDef of SCHEDULES_FIELDS) {
    await createField(schedulesTable.id, fieldDef);
    console.log(`  + ${fieldDef.name} (${fieldDef.type})`);
  }
} else {
  console.log(`🔄 vaccine_schedules đã tồn tại (id=${schedulesTable.id}). Ensuring fields...`);
  const existing = await listFields(schedulesTable.id);
  const existingNames = new Set(existing.map((f) => f.name));
  for (const fieldDef of SCHEDULES_FIELDS) {
    if (!existingNames.has(fieldDef.name as string)) {
      await createField(schedulesTable.id, fieldDef);
      console.log(`  + adding missing ${fieldDef.name}`);
    }
  }
}
console.log();

// ============================================================
// 4. UPDATE baserow-config.json
// ============================================================
const newVacFields = await listFields(VACCINES_TABLE);
const newSchedFields = await listFields(schedulesTable!.id);

const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const f of newVacFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.vaccines.fields[f.name] = f.id;
  }
}
if (!config.tables.vaccine_schedules) {
  config.tables.vaccine_schedules = { id: schedulesTable!.id, fields: {} };
}
config.tables.vaccine_schedules.id = schedulesTable!.id;
for (const f of newSchedFields) {
  if (f.name && !["Notes", "Active"].includes(f.name)) {
    config.tables.vaccine_schedules.fields[f.name] = f.id;
  }
}

writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("[migrate-m6] baserow-config.json updated.\n");

// ============================================================
// 5. SEED 9 vaccine_schedules templates (idempotent)
// ============================================================
const existingSchedules = await listRowsToken(schedulesTable!.id);
if (existingSchedules.count >= 9) {
  console.log(`[migrate-m6] Schedules already seeded (${existingSchedules.count} rows). Skip.\n`);
} else {
  console.log(`[migrate-m6] Seeding 9 schedule templates...`);
  const SCHEDULE_TEMPLATES = [
    // ===== DOG (5) =====
    {
      species: "dog",
      vaccine_name: "DHPPL 5-in-1",
      vaccine_code: "dhppl_5in1",
      is_core: true,
      first_dose_age_weeks: 6,
      doses_count: 3,
      interval_weeks_between: 3,
      booster_interval_months: 12,
      description_vn:
        "Vắc-xin tổng hợp 5 bệnh: Distemper (Care) + Parvo + Adenovirus (Viêm gan) + Parainfluenza (Cúm) + Lepto. Bắt buộc cho chó con.",
      importance_level: "critical",
    },
    {
      species: "dog",
      vaccine_name: "DHPPL 7-in-1",
      vaccine_code: "dhppl_7in1",
      is_core: false,
      first_dose_age_weeks: 6,
      doses_count: 3,
      interval_weeks_between: 3,
      booster_interval_months: 12,
      description_vn:
        "Mở rộng từ 5-in-1, thêm Coronavirus + Lepto. Khuyến nghị cho chó hay đi ngoài/khu vực cao rủi ro.",
      importance_level: "recommended",
    },
    {
      species: "dog",
      vaccine_name: "Vắc-xin Dại",
      vaccine_code: "rabies",
      is_core: true,
      first_dose_age_weeks: 12,
      doses_count: 1,
      interval_weeks_between: 0,
      booster_interval_months: 12,
      description_vn:
        "Bắt buộc theo luật Việt Nam. Cần chứng nhận để di chuyển trong/ngoài nước.",
      importance_level: "critical",
    },
    {
      species: "dog",
      vaccine_name: "Bordetella (Ho cũi)",
      vaccine_code: "bordetella",
      is_core: false,
      first_dose_age_weeks: 8,
      doses_count: 1,
      interval_weeks_between: 0,
      booster_interval_months: 12,
      description_vn:
        "Khuyến nghị cho chó thường đi cũi/khách sạn pet/training class.",
      importance_level: "recommended",
    },
    {
      species: "dog",
      vaccine_name: "Leptospirosis",
      vaccine_code: "lepto",
      is_core: true,
      first_dose_age_weeks: 12,
      doses_count: 2,
      interval_weeks_between: 4,
      booster_interval_months: 12,
      description_vn:
        "Bắt buộc ở Việt Nam — môi trường ẩm có nguy cơ cao. Lepto có thể lây sang người.",
      importance_level: "critical",
    },
    // ===== CAT (4) =====
    {
      species: "cat",
      vaccine_name: "FVRCP 3-in-1",
      vaccine_code: "fvrcp",
      is_core: true,
      first_dose_age_weeks: 8,
      doses_count: 3,
      interval_weeks_between: 4,
      booster_interval_months: 36,
      description_vn:
        "Tổng hợp 3 bệnh nguy hiểm: Viêm mũi khí quản (Rhinotracheitis) + Calicivirus + Panleukopenia. Bắt buộc cho mèo con.",
      importance_level: "critical",
    },
    {
      species: "cat",
      vaccine_name: "Vắc-xin Dại (mèo)",
      vaccine_code: "rabies_cat",
      is_core: true,
      first_dose_age_weeks: 12,
      doses_count: 1,
      interval_weeks_between: 0,
      booster_interval_months: 12,
      description_vn:
        "Bắt buộc theo luật Việt Nam, đặc biệt cho mèo ra ngoài.",
      importance_level: "critical",
    },
    {
      species: "cat",
      vaccine_name: "FeLV (Bạch cầu mèo)",
      vaccine_code: "felv",
      is_core: false,
      first_dose_age_weeks: 8,
      doses_count: 2,
      interval_weeks_between: 4,
      booster_interval_months: 12,
      description_vn:
        "Bạch cầu mèo. Khuyến nghị mạnh cho mèo con < 1 tuổi. Mèo adult tùy risk profile.",
      importance_level: "recommended",
    },
    {
      species: "cat",
      vaccine_name: "FIV (Suy giảm miễn dịch)",
      vaccine_code: "fiv",
      is_core: false,
      first_dose_age_weeks: 8,
      doses_count: 3,
      interval_weeks_between: 3,
      booster_interval_months: 12,
      description_vn:
        "Chỉ cho mèo ra ngoài hoặc tiếp xúc mèo lạ. Indoor cat thường không cần.",
      importance_level: "optional",
    },
  ];

  for (const tmpl of SCHEDULE_TEMPLATES) {
    await createRowToken(schedulesTable!.id, tmpl);
    console.log(`  + ${tmpl.species}/${tmpl.vaccine_code}`);
  }
  console.log(`  Seeded ${SCHEDULE_TEMPLATES.length} templates\n`);
}

// ============================================================
// 6. BACKFILL existing vaccines: status + vaccine_code
// ============================================================
console.log("🔄 Backfilling existing vaccines (status + vaccine_code)...");

// Map vaccine_type → vaccine_code (cần biết species của pet để map rabies)
function mapTypeToCode(vaccineType: string | null | undefined, species: string | null): string | null {
  if (!vaccineType) return null;
  switch (vaccineType) {
    case "5-in-1":
      return "dhppl_5in1";
    case "7-in-1":
      return "dhppl_7in1";
    case "rabies":
      return species === "cat" ? "rabies_cat" : "rabies";
    case "feline-3":
    case "feline-4":
      return "fvrcp";
    case "felv":
      return "felv";
    default:
      return null;
  }
}

let backfilled = 0;
let backfillSkipped = 0;
for (const row of vaccinesPre.results) {
  const r = row as any;
  const updates: Record<string, unknown> = {};

  // status backfill: nếu có administered_date và status null → completed
  if (r.administered_date && !r.status) {
    updates.status = "completed";
  }

  // vaccine_code backfill từ vaccine_type
  if (!r.vaccine_code) {
    const vtype = typeof r.vaccine_type === "object" ? r.vaccine_type?.value : r.vaccine_type;
    if (vtype) {
      // Lookup pet species
      let petSpecies: string | null = null;
      const petLink = (r.pet_id || [])[0];
      if (petLink?.id) {
        try {
          const pet = await getRowToken(PETS_TABLE, petLink.id);
          const sp = typeof pet.species === "object" ? pet.species?.value : pet.species;
          petSpecies = sp || null;
        } catch {}
      }
      const code = mapTypeToCode(vtype, petSpecies);
      if (code) updates.vaccine_code = code;
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      await updateRowToken(VACCINES_TABLE, row.id, updates);
      console.log(`  ✓ row ${row.id}: ${JSON.stringify(updates)}`);
      backfilled++;
    } catch (err) {
      console.error(`  ✗ row ${row.id} backfill failed:`, err);
      backfillSkipped++;
    }
  } else {
    backfillSkipped++;
  }
}
console.log(`  Backfilled: ${backfilled}, Skipped (no change needed): ${backfillSkipped}\n`);

// ============================================================
// 7. POST-COUNT
// ============================================================
const vaccinesPost = await listRowsToken(VACCINES_TABLE);
const schedulesCount = await listRowsToken(schedulesTable!.id);

console.log(`📊 Post-migration:`);
console.log(`  vaccines: ${vaccinesPost.count} rows ${vaccinesPost.count === vaccinesPre.count ? "✓ MATCH" : "✗ MISMATCH"}`);
console.log(`  vaccine_schedules: ${schedulesCount.count} templates`);
console.log(`  vaccines table: ${(await listFields(VACCINES_TABLE)).length} fields total`);

if (vaccinesPost.count !== vaccinesPre.count) {
  console.error("\n❌ Row count mismatch — migration KHÔNG safe!");
  process.exit(1);
}

console.log("\n✅ M6 migration hoàn tất an toàn.");
