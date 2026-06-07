/**
 * premium-brands-populate — tạo 9 brand premium (ngoại) vào food_brands (table 648).
 *
 * RECON schema live (list-fields) + anti-dup + validate key/option + DRY-RUN mặc định.
 * CHỈ tạo ROW qua API — KHÔNG tạo/sửa/xoá FIELD, KHÔNG xoá row, KHÔNG đụng schema.
 *
 * Reuse: shared/baserow.ts (Token: listRows/createRow, user_field_names) + JWT inline cho list-fields (recon).
 * Token/URL/creds từ .env (Bun TỰ nạp). KHÔNG hardcode/in token.
 *
 * Run (repo root, HOST; ép localhost:8888 vì host không có host.docker.internal):
 *   BASEROW_URL=http://localhost:8888 bun run scripts/premium-brands-populate.ts          # DRY-RUN
 *   BASEROW_URL=http://localhost:8888 bun run scripts/premium-brands-populate.ts --write  # tạo ROW thật
 *   (sau --write: docker restart vowvet-api để bust brandsCache 24h + bump SW + verify browser)
 */
import { listRows, createRow } from "../shared/baserow.ts";

const FOOD_BRANDS_TABLE_ID = 648;
const BASEROW_URL = (process.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const HOST_HEADER = process.env.BASEROW_HOST_HEADER || "localhost:8888";
const EMAIL = process.env.BASEROW_USER_EMAIL;
const PASSWORD = process.env.BASEROW_USER_PASSWORD;
const WRITE = new Set(process.argv.slice(2)).has("--write");

// Data 9 dòng INLINE (brand premium ngoại). carb_pct_calculated KHÔNG có ở đây (xem RECON §5).
// carb_pct_calculated thêm (number, Duy cung cấp) · contains_allergens = JSON-array string (convention seed).
// Swap allergen theo vocab app (allergen-normalizer.ts: corn/wheat KHÔNG phải code → "grain", dedup).
// "lamb" GIỮ NGUYÊN (ngoài 9-code vocab → ingredient-guard inert, vô hại) — đã báo Duy.
const PREMIUM: Record<string, any>[] = [
  { brand_name: "Orijen Original Cat", product_line: "Orijen", species: "cat", life_stage: "all", protein_pct: 40, fat_pct: 20, fiber_pct: 3, carb_pct_calculated: 18, calories_per_100g: 410, contains_allergens: '["chicken","fish"]' },
  { brand_name: "Orijen Original Dog", product_line: "Orijen", species: "dog", life_stage: "all", protein_pct: 38, fat_pct: 18, fiber_pct: 4, carb_pct_calculated: 18, calories_per_100g: 394, contains_allergens: '["chicken","fish"]' },
  { brand_name: "Acana Highest Protein Cat", product_line: "Acana", species: "cat", life_stage: "adult", protein_pct: 38, fat_pct: 15, fiber_pct: 5, carb_pct_calculated: 22, calories_per_100g: 375, contains_allergens: '["chicken","fish"]' },
  { brand_name: "Acana Adult Dog", product_line: "Acana", species: "dog", life_stage: "adult", protein_pct: 33, fat_pct: 18, fiber_pct: 5, carb_pct_calculated: 25, calories_per_100g: 340, contains_allergens: '["fish","lamb"]' },
  { brand_name: "Farmina N&D Chicken Cat", product_line: "Farmina N&D", species: "cat", life_stage: "all", protein_pct: 44, fat_pct: 20, fiber_pct: 1.8, carb_pct_calculated: 21, calories_per_100g: 398, contains_allergens: '["chicken","fish","egg"]' },
  { brand_name: "Farmina N&D Chicken Dog", product_line: "Farmina N&D", species: "dog", life_stage: "adult", protein_pct: 38, fat_pct: 20, fiber_pct: 3, carb_pct_calculated: 30, calories_per_100g: 408, contains_allergens: '["chicken","fish","egg"]' },
  { brand_name: "Hill's Science Diet Indoor Cat", product_line: "Hill's Science Diet", species: "cat", life_stage: "adult", protein_pct: 36, fat_pct: 15, fiber_pct: 8.5, carb_pct_calculated: 34, calories_per_100g: 352, contains_allergens: '["chicken","grain"]' },
  { brand_name: "Royal Canin Urinary S/O Cat", product_line: "Royal Canin Veterinary", species: "cat", life_stage: "adult", protein_pct: 32.5, fat_pct: 13, fiber_pct: 4, carb_pct_calculated: 34, calories_per_100g: 366, contains_allergens: '["chicken","grain"]' },
  { brand_name: "Hill's c/d Urinary Cat", product_line: "Hill's Prescription Diet", species: "cat", life_stage: "adult", protein_pct: 30, fat_pct: 13, fiber_pct: 1.6, carb_pct_calculated: 38, calories_per_100g: 349, contains_allergens: '["chicken","grain"]' },
];

const FIXED = (brandName: string) => ({
  mon_min_recommended: false,
  vn_availability: true,
  product_url: "https://shopee.vn/search?keyword=" + encodeURIComponent(brandName),
  image_url: "",
});

// ============================================================
// RECON: list-fields qua JWT (giống brand-shoppable-sync.ts)
// ============================================================
interface SelectOption { id?: number; value: string; color?: string }
interface FieldDef {
  id: number;
  name: string;
  type: string;
  read_only?: boolean;
  primary?: boolean;
  formula?: string;
  select_options?: SelectOption[];
}

async function jwtLogin(): Promise<string> {
  if (!EMAIL || !PASSWORD) {
    console.error("❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD trong env (cần cho list-fields).");
    process.exit(1);
  }
  const res = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Host: HOST_HEADER },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    console.error(`❌ Baserow login thất bại (${res.status}). Kiểm tra creds / BASEROW_URL.`);
    process.exit(1);
  }
  const j = (await res.json()) as { access_token?: string; token?: string };
  const jwt = j.access_token || j.token;
  if (!jwt) { console.error("❌ Login OK nhưng response không có access_token."); process.exit(1); }
  return jwt;
}

async function listFields(jwt: string): Promise<FieldDef[]> {
  const res = await fetch(`${BASEROW_URL}/api/database/fields/table/${FOOD_BRANDS_TABLE_ID}/`, {
    headers: { Authorization: `JWT ${jwt}`, Host: HOST_HEADER },
  });
  if (!res.ok) { console.error(`❌ list-fields table ${FOOD_BRANDS_TABLE_ID} thất bại (${res.status}).`); process.exit(1); }
  return (await res.json()) as FieldDef[];
}

async function fetchExistingBrandNames(): Promise<string[]> {
  const out: string[] = [];
  let page = 1;
  let count = Infinity;
  while (out.length < count) {
    const res = await listRows<Record<string, unknown>>("food_brands", { size: 200, page });
    count = res.count;
    for (const r of res.results) {
      const n = r.brand_name == null ? "" : String(r.brand_name).trim();
      if (n) out.push(n);
    }
    if (!res.next) break;
    page++;
  }
  return out;
}

// ============================================================
// MAIN
// ============================================================
console.log(`premium-brands-populate · ${WRITE ? "WRITE (tạo row thật)" : "DRY-RUN (không ghi)"} · Baserow ${BASEROW_URL} (Host: ${HOST_HEADER})\n`);

const jwt = await jwtLogin();
const fields = await listFields(jwt);
const byName = new Map(fields.map((f) => [f.name, f]));
const fieldNames = new Set(fields.map((f) => f.name));

console.log("🔎 RECON food_brands (table 648) — fields:");
for (const f of fields) {
  const flags = [f.primary ? "primary" : "", f.read_only ? "read_only" : "", f.formula ? "formula" : ""].filter(Boolean).join(",");
  console.log(`  • ${f.name.padEnd(22)} ${f.type}${flags ? `  [${flags}]` : ""}`);
}

const speciesOpts = (byName.get("species")?.select_options || []).map((o) => o.value);
const lifeStageOpts = (byName.get("life_stage")?.select_options || []).map((o) => o.value);
console.log(`\n  species options    : [${speciesOpts.join(", ")}]`);
console.log(`  life_stage options : [${lifeStageOpts.join(", ")}]`);

// §5: carb_pct_calculated — formula hay number?
const carb = byName.get("carb_pct_calculated");
const carbIsFormulaOrRO = !!carb && (carb.type === "formula" || carb.read_only === true);
console.log(
  `\n  carb_pct_calculated: ${carb ? `type=${carb.type}${carb.read_only ? " (read_only)" : ""}` : "KHÔNG TỒN TẠI"}` +
    ` → ${carbIsFormulaOrRO ? "FORMULA/read-only → KHÔNG gửi (Baserow tự tính)" : "NUMBER thường → 9 row mới sẽ ĐỂ TRỐNG (script KHÔNG tự tính; chờ Duy đưa công thức)"}`,
);

const existing = await fetchExistingBrandNames();
const existingLower = new Set(existing.map((n) => n.toLowerCase()));
console.log(`\n  brand_name đang có (${existing.length}): ${existing.join(" · ")}`);

// ============================================================
// Build + validate + dry-run
// ============================================================
const warnings: string[] = [];
let willCreate = 0;
let willSkip = 0;
const toCreate: { name: string; payload: Record<string, any> }[] = [];

console.log(`\n${"=".repeat(70)}\nDRY-RUN — ${PREMIUM.length} brand premium:\n`);

for (const raw of PREMIUM) {
  const name = String(raw.brand_name || "").trim();

  // anti-dup
  if (existingLower.has(name.toLowerCase())) {
    willSkip++;
    console.log(`⏭️  SKIP (trùng): ${name}`);
    continue;
  }

  // build payload = data + fixed
  const payload: Record<string, any> = { ...raw, ...FIXED(name) };

  // §5: nếu carb là formula/read-only mà payload lỡ có → bỏ (data 9 dòng vốn không có, nhưng defensive)
  if (carbIsFormulaOrRO && "carb_pct_calculated" in payload) {
    delete payload.carb_pct_calculated;
    warnings.push(`${name}: bỏ carb_pct_calculated (field formula/read-only)`);
  }

  // validate keys khớp field name → drop key lạ
  for (const key of Object.keys(payload)) {
    if (!fieldNames.has(key)) {
      warnings.push(`${name}: key "${key}" KHÔNG khớp field name → BỎ`);
      delete payload[key];
    }
  }

  // validate species / life_stage option
  if (speciesOpts.length && payload.species != null && !speciesOpts.includes(payload.species)) {
    warnings.push(`⚠️ ${name}: species "${payload.species}" KHÔNG thuộc option [${speciesOpts.join(", ")}] — HỎI DUY (sẽ HTTP 400 nếu --write)`);
  }
  if (lifeStageOpts.length && payload.life_stage != null && !lifeStageOpts.includes(payload.life_stage)) {
    warnings.push(`⚠️ ${name}: life_stage "${payload.life_stage}" KHÔNG thuộc option [${lifeStageOpts.join(", ")}] — HỎI DUY (sẽ HTTP 400 nếu --write)`);
  }

  toCreate.push({ name, payload });
  willCreate++;
  console.log(`➕ CREATE: ${name}`);
  for (const [k, v] of Object.entries(payload)) {
    console.log(`      ${k.padEnd(20)} = ${JSON.stringify(v)}`);
  }
  console.log("");
}

// ============================================================
// Tổng + cảnh báo
// ============================================================
console.log("=".repeat(70));
console.log(`TỔNG: sẽ tạo ${willCreate} · skip trùng ${willSkip} · cảnh báo ${warnings.length}`);
if (warnings.length) {
  console.log("\n⚠️ CẢNH BÁO:");
  for (const w of warnings) console.log(`  - ${w}`);
}

// Note format allergen (convention cũ = JSON array; data mới = chuỗi phẩy)
const carbNote = carbIsFormulaOrRO ? "" : " · carb_pct_calculated để TRỐNG (chờ công thức)";
console.log(
  `\nNOTE: \`contains_allergens\` data mới = chuỗi "chicken, fish"; convention CŨ (seed) = JSON array '["chicken","fish"]'.` +
    `\n      Loader parseAllergens() JSON.parse → chuỗi phẩy sẽ parse RA [] (ingredient-guard food-brands KHÔNG bắt allergen).` +
    `\n      → HỎI DUY: giữ nguyên chuỗi phẩy, hay đổi sang JSON array? (script CHƯA tự đổi).${carbNote}`,
);

if (!WRITE) {
  console.log(`\nĐây là DRY-RUN. Tạo thật: BASEROW_URL=${BASEROW_URL} bun run scripts/premium-brands-populate.ts --write`);
} else if (toCreate.length) {
  console.log("\n=== WRITE (tạo row) ===");
  let ok = 0;
  let errs = 0;
  for (const { name, payload } of toCreate) {
    try {
      const row = await createRow("food_brands", payload);
      ok++;
      console.log(`  ✓ CREATE #${(row as any).id} ${name}`);
    } catch (e: any) {
      errs++;
      console.error(`  ✗ ${name}: ${e?.message || e}`);
    }
  }
  console.log(`\n✅ Tạo xong: ${ok} row OK${errs ? `, ${errs} lỗi` : ""}. NHỚ: docker restart vowvet-api (bust brandsCache) + bump SW + verify.`);
}
