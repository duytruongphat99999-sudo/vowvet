/**
 * brand-shoppable-sync — đổ image_url + product_url vào table food_brands (Baserow).
 *
 * 2 PHASE (idempotent · anti-clobber · dry-run mặc định):
 *
 *   EXPORT  (mặc định, hoặc cờ --export)
 *     verify field → fetch toàn bộ rows food_brands → ghi scripts/data/brand-shoppable.csv
 *     Cột: row_id, brand_name, mon_min_recommended, image_url, product_url
 *     image_url/product_url prefill giá trị hiện có trong Baserow nếu có, còn lại để trống.
 *     Anti-clobber: nếu CSV đã tồn tại, GIỮ giá trị đã điền tay (không bị ghi đè bằng trống
 *     khi Baserow chưa có) — chạy lại export an toàn, không mất công điền của người.
 *
 *   APPLY  (cờ --apply)
 *     đọc CSV → match theo row_id (KHÔNG theo tên) → so sánh với giá trị Baserow hiện tại.
 *     DRY-RUN MẶC ĐỊNH: chỉ in bảng row_id · brand_name · field · OLD→NEW + tổng, KHÔNG ghi.
 *     Cần thêm cờ --write mới PATCH thật (PATCH chỉ image_url + product_url).
 *     Anti-clobber: bỏ qua ô trống (KHÔNG đè giá trị cũ bằng rỗng); chỉ PATCH khi khác giá trị hiện tại.
 *     Idempotent: chạy lại --apply --write sau khi đã ghi → 0 thay đổi.
 *
 * REUSE client/auth có sẵn (không tự chế client mới):
 *   - Row CRUD: shared/baserow.ts  (Token auth, user_field_names=true, Host header)
 *   - list-fields: JWT inline (email+password) — y hệt scripts/migrate-m7.ts
 *   Token/URL/creds đọc từ env (Bun TỰ nạp .env ở repo root). KHÔNG hardcode, KHÔNG in token.
 *
 * KHÔNG tạo/sửa field schema — field image_url + product_url phải TẠO TAY trong Baserow UI
 * (type URL hoặc Text) TRƯỚC. Script chỉ verify; thiếu → STOP (với apply) / cảnh báo (với export).
 *
 * Run (từ repo root — Bun tự nạp .env; ép localhost:8888 vì host không có host.docker.internal):
 *   BASEROW_URL=http://localhost:8888 bun run scripts/brand-shoppable-sync.ts             # EXPORT
 *   BASEROW_URL=http://localhost:8888 bun run scripts/brand-shoppable-sync.ts --apply     # APPLY dry-run
 *   BASEROW_URL=http://localhost:8888 bun run scripts/brand-shoppable-sync.ts --apply --write  # APPLY ghi thật
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { listRows, updateRow } from "../shared/baserow.ts";

const FOOD_BRANDS_TABLE_ID = 648;
const CSV_PATH = "scripts/data/brand-shoppable.csv";
const TARGET_FIELDS = ["image_url", "product_url"] as const;
type TargetField = (typeof TARGET_FIELDS)[number];
const HEADER = ["row_id", "brand_name", "mon_min_recommended", "image_url", "product_url"];
const WRITABLE_TYPES = new Set(["text", "long_text", "url"]);

const BASEROW_URL = (process.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const HOST_HEADER = process.env.BASEROW_HOST_HEADER || "localhost:8888";
const EMAIL = process.env.BASEROW_USER_EMAIL;
const PASSWORD = process.env.BASEROW_USER_PASSWORD;

const args = new Set(process.argv.slice(2));
const MODE_APPLY = args.has("--apply");
const WRITE = args.has("--write");

// ============================================================
// VERIFY FIELD (list-fields qua JWT — giống migrate-m7.ts)
// ============================================================
interface FieldDef {
  id: number;
  name: string;
  type: string;
  read_only?: boolean;
  primary?: boolean;
}

async function jwtLogin(): Promise<string> {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "❌ Thiếu BASEROW_USER_EMAIL / BASEROW_USER_PASSWORD trong env (cần cho list-fields)."
    );
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
  if (!jwt) {
    console.error("❌ Login OK nhưng response không có access_token.");
    process.exit(1);
  }
  return jwt;
}

async function listFields(jwt: string): Promise<FieldDef[]> {
  const res = await fetch(`${BASEROW_URL}/api/database/fields/table/${FOOD_BRANDS_TABLE_ID}/`, {
    headers: { Authorization: `JWT ${jwt}`, Host: HOST_HEADER },
  });
  if (!res.ok) {
    console.error(`❌ list-fields table ${FOOD_BRANDS_TABLE_ID} thất bại (${res.status}).`);
    process.exit(1);
  }
  return (await res.json()) as FieldDef[];
}

/**
 * Verify image_url + product_url tồn tại & ghi được bằng text.
 * @returns true nếu đủ 2 field hợp lệ; false nếu thiếu/sai type (đã in cảnh báo).
 *          Field type "file" → STOP cứng (không điền qua CSV được).
 */
async function verifyFields(): Promise<boolean> {
  console.log(`🔎 Verify field trên table food_brands (id ${FOOD_BRANDS_TABLE_ID})…`);
  const jwt = await jwtLogin();
  const fields = await listFields(jwt);
  const byName = new Map(fields.map((f) => [f.name, f]));
  const missing: string[] = [];

  for (const name of TARGET_FIELDS) {
    const f = byName.get(name);
    if (!f) {
      missing.push(name);
      console.log(`  • ${name}: ✗ KHÔNG TỒN TẠI`);
      continue;
    }
    if (f.type === "file") {
      console.error(
        `\n⚠️  Field "${name}" là type File → KHÔNG điền được qua CSV.\n` +
          `    Ảnh phải upload trực tiếp qua Baserow (flow khác). Đổi sang field type URL/Text nếu muốn dán link.`
      );
      process.exit(1);
    }
    const ok = WRITABLE_TYPES.has(f.type);
    console.log(`  • ${name}: id=${f.id} type=${f.type} ${ok ? "✓" : "⚠️ type không phải URL/Text"}`);
    if (!ok) missing.push(name);
  }

  if (missing.length) {
    console.error(
      `\n⚠️  Thiếu / sai type field: ${missing.join(", ")}.\n` +
        `    TẠO FIELD TAY trong Baserow UI trước (type URL hoặc Text), rồi chạy lại.\n` +
        `    Script KHÔNG tự tạo field schema.`
    );
    return false;
  }
  console.log(
    `  Map = user_field_names (tên trường) → PATCH dùng { image_url, product_url }, KHÔNG field_<id>.\n`
  );
  return true;
}

// ============================================================
// CSV helpers (RFC4180: quote khi có , " \n; escape " → "")
// ============================================================
function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  // bỏ dòng rỗng hoàn toàn
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// ============================================================
// Baserow rows (reuse shared/baserow.ts — Token client)
// ============================================================
function strVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

interface BrandRow {
  id: number;
  brand_name: string;
  mon_min: boolean;
  image_url: string;
  product_url: string;
}

async function fetchAllBrands(): Promise<BrandRow[]> {
  const out: BrandRow[] = [];
  let page = 1;
  let count = Infinity;
  while (out.length < count) {
    const res = await listRows<Record<string, unknown>>("food_brands", { size: 200, page });
    count = res.count;
    for (const r of res.results) {
      const name = strVal(r.brand_name).trim();
      if (!name) continue; // bỏ stub rows Baserow tự tạo (brand_name rỗng)
      out.push({
        id: r.id as number,
        brand_name: name,
        mon_min: r.mon_min_recommended === true,
        image_url: strVal(r.image_url),
        product_url: strVal(r.product_url),
      });
    }
    if (!res.next) break;
    page++;
  }
  return out;
}

// ============================================================
// PHASE: EXPORT
// ============================================================
async function runExport(): Promise<void> {
  const fieldsOk = await verifyFields();
  if (!fieldsOk) {
    console.log(
      "ℹ️  Field shoppable chưa sẵn sàng — vẫn xuất CSV mẫu (2 cột để trống) để bạn điền,\n" +
        "    NHƯNG phải tạo field tay trong Baserow UI trước khi chạy --apply (apply sẽ STOP nếu thiếu).\n"
    );
  }

  const brands = await fetchAllBrands();
  brands.sort(
    (a, b) =>
      (b.mon_min ? 1 : 0) - (a.mon_min ? 1 : 0) ||
      a.brand_name.localeCompare(b.brand_name, "vi")
  );

  // Anti-clobber: giữ giá trị image_url/product_url đã điền tay trong CSV cũ
  const prior = new Map<number, { image_url: string; product_url: string }>();
  if (existsSync(CSV_PATH)) {
    const parsed = parseCsv(readFileSync(CSV_PATH, "utf-8"));
    const hdr = parsed[0] || [];
    const iId = hdr.indexOf("row_id");
    const iImg = hdr.indexOf("image_url");
    const iPro = hdr.indexOf("product_url");
    if (iId >= 0) {
      for (const r of parsed.slice(1)) {
        const id = Number((r[iId] ?? "").trim());
        if (!Number.isFinite(id)) continue;
        prior.set(id, {
          image_url: (iImg >= 0 ? r[iImg] ?? "" : "").trim(),
          product_url: (iPro >= 0 ? r[iPro] ?? "" : "").trim(),
        });
      }
    }
  }

  let preserved = 0;
  const dataRows: string[][] = [HEADER];
  for (const b of brands) {
    const p = prior.get(b.id);
    let img = b.image_url;
    let pro = b.product_url;
    if (!img && p?.image_url) {
      img = p.image_url;
      preserved++;
    }
    if (!pro && p?.product_url) {
      pro = p.product_url;
      preserved++;
    }
    dataRows.push([String(b.id), b.brand_name, b.mon_min ? "true" : "false", img, pro]);
  }

  mkdirSync(dirname(CSV_PATH), { recursive: true });
  writeFileSync(CSV_PATH, toCsv(dataRows));

  console.log(`✅ EXPORT: ${brands.length} brand → ${CSV_PATH}`);
  if (preserved > 0) {
    console.log(`   (giữ ${preserved} giá trị đã điền tay từ CSV cũ — anti-clobber)`);
  }
  console.log(`\nHeader + 5 dòng đầu:`);
  for (const r of dataRows.slice(0, 6)) {
    console.log("   " + r.map(csvEscape).join(","));
  }
  console.log(
    `\n👉 Điền image_url + product_url vào ${CSV_PATH}, rồi:\n` +
      `   bun run scripts/brand-shoppable-sync.ts --apply           (xem trước, dry-run)\n` +
      `   bun run scripts/brand-shoppable-sync.ts --apply --write   (ghi thật vào Baserow)`
  );
}

// ============================================================
// PHASE: APPLY
// ============================================================
async function runApply(): Promise<void> {
  const fieldsOk = await verifyFields();
  if (!fieldsOk) {
    console.error("❌ APPLY dừng — field chưa sẵn sàng (xem cảnh báo trên).");
    process.exit(1);
  }
  if (!existsSync(CSV_PATH)) {
    console.error(`❌ Không thấy ${CSV_PATH}. Chạy phase EXPORT trước.`);
    process.exit(1);
  }

  const parsed = parseCsv(readFileSync(CSV_PATH, "utf-8"));
  const hdr = parsed[0] || [];
  const iId = hdr.indexOf("row_id");
  const iName = hdr.indexOf("brand_name");
  const iImg = hdr.indexOf("image_url");
  const iPro = hdr.indexOf("product_url");
  if (iId < 0 || iImg < 0 || iPro < 0) {
    console.error(`❌ CSV thiếu cột bắt buộc (row_id/image_url/product_url). Header: ${hdr.join(",")}`);
    process.exit(1);
  }

  const current = new Map<number, BrandRow>();
  for (const b of await fetchAllBrands()) current.set(b.id, b);

  interface Change {
    id: number;
    name: string;
    field: TargetField;
    old: string;
    next: string;
  }
  const plan: Change[] = [];
  const notFound: number[] = [];

  for (const r of parsed.slice(1)) {
    const id = Number((r[iId] ?? "").trim());
    if (!Number.isFinite(id)) continue;
    const cur = current.get(id);
    if (!cur) {
      notFound.push(id);
      continue;
    }
    const csvName = (r[iName] ?? "").trim() || cur.brand_name;
    const cells: Record<TargetField, string> = {
      image_url: (r[iImg] ?? "").trim(),
      product_url: (r[iPro] ?? "").trim(),
    };
    for (const field of TARGET_FIELDS) {
      const nextVal = cells[field];
      if (nextVal === "") continue; // anti-clobber: bỏ qua ô trống, không đè bằng rỗng
      const oldVal = field === "image_url" ? cur.image_url : cur.product_url;
      if (nextVal === oldVal) continue; // idempotent: trùng giá trị → bỏ
      plan.push({ id, name: csvName, field, old: oldVal, next: nextVal });
    }
  }

  const tag = WRITE ? "WRITE (ghi thật)" : "DRY-RUN (không ghi)";
  console.log(`=== APPLY · ${tag} ===`);
  if (notFound.length) {
    console.log(`⚠️  row_id không có trong Baserow (bỏ qua, KHÔNG tạo mới): ${notFound.join(", ")}`);
  }
  if (!plan.length) {
    console.log("✅ Không có thay đổi (ô trống hoặc trùng giá trị hiện tại). Idempotent OK.");
    return;
  }

  for (const p of plan) {
    const oldShow = p.old === "" ? "(trống)" : p.old;
    console.log(`  #${p.id} ${p.name} · ${p.field}: ${oldShow}  →  ${p.next}`);
  }
  const rowsAffected = new Set(plan.map((p) => p.id)).size;
  console.log(`\nTổng: ${plan.length} field thay đổi trên ${rowsAffected} brand.`);

  if (!WRITE) {
    console.log(`\nĐây là DRY-RUN. Ghi thật: bun run scripts/brand-shoppable-sync.ts --apply --write`);
    return;
  }

  // gom theo row → 1 PATCH / row (cả 2 field nếu cùng đổi)
  const byRow = new Map<number, Record<string, string>>();
  for (const p of plan) {
    const o = byRow.get(p.id) || {};
    o[p.field] = p.next;
    byRow.set(p.id, o);
  }
  let ok = 0;
  let errs = 0;
  for (const [id, data] of byRow) {
    try {
      await updateRow("food_brands", id, data);
      ok++;
      console.log(`  ✓ PATCH #${id} ${JSON.stringify(data)}`);
    } catch (e: any) {
      errs++;
      console.error(`  ✗ #${id}: ${e?.message || e}`);
    }
  }
  console.log(
    `\n✅ Ghi xong: ${ok} brand PATCH OK${errs ? `, ${errs} lỗi` : ""}. ` +
      `Chạy lại --apply --write để verify idempotent (kỳ vọng 0 đổi).`
  );
}

// ============================================================
// MAIN
// ============================================================
console.log(
  `brand-shoppable-sync · ${MODE_APPLY ? "APPLY" : "EXPORT"} · Baserow ${BASEROW_URL} (Host: ${HOST_HEADER})\n`
);
if (MODE_APPLY) {
  await runApply();
} else {
  await runExport();
}
