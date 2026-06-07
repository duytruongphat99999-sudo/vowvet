/**
 * oldbrand-nutri-backfill — PATCH số dinh dưỡng THẬT (protein/fat/fiber/carb) cho 8 row food_brands CŨ.
 *
 * Thay placeholder phồng (40/45/50) bằng số nhãn hãng do Bồ research. CHỈ đụng 4 field number:
 *   protein_pct · fat_pct · fiber_pct · carb_pct_calculated   (KHÔNG đụng kcal/allergen/url/image).
 * CHỈ PATCH đúng 8 row id dưới — KHÔNG tạo/xoá row, KHÔNG đụng row khác (KỂ CẢ id 1 & 2 rỗng), KHÔNG đụng schema.
 *
 * GUARD chống ghi mù: verify brand_name LIVE === expectedBrand (recon) từng row → lệch là ABORT.
 * Self-check khi apply: nếu cả 4 field hiện đã == target (±0.1) → SKIP row đó.
 *
 * Reuse: shared/baserow.ts (Token: getRow/updateRow, user_field_names) + JWT inline best-effort cho list-fields (recon kiểu field).
 * Token/URL/creds từ .env (Bun TỰ nạp). KHÔNG hardcode/in token.
 *
 * Run (repo root, HOST; ép localhost:8888 vì host không có host.docker.internal):
 *   BASEROW_URL=http://localhost:8888 bun run scripts/oldbrand-nutri-backfill.ts          # DRY-RUN (không ghi)
 *   BASEROW_URL=http://localhost:8888 bun run scripts/oldbrand-nutri-backfill.ts --apply  # PATCH row thật
 *   (sau --apply: docker restart vowvet-api để bust brandsCache 24h + verify carbOf số mới)
 */
import { getRow, updateRow } from "../shared/baserow.ts";

const FOOD_BRANDS_TABLE_ID = 648;
const BASEROW_URL = (process.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const HOST_HEADER = process.env.BASEROW_HOST_HEADER || "localhost:8888";
const EMAIL = process.env.BASEROW_USER_EMAIL;
const PASSWORD = process.env.BASEROW_USER_PASSWORD;
const APPLY = new Set(process.argv.slice(2)).has("--apply");

// 4 field DUY NHẤT được PATCH. Mọi field ngoài danh sách này KHÔNG bao giờ gửi.
const PATCH_FIELDS = ["protein_pct", "fat_pct", "fiber_pct", "carb_pct_calculated"] as const;
type PatchField = (typeof PATCH_FIELDS)[number];
const TOL = 0.1; // ±0.1 → coi như bằng (skip)

interface Target {
  id: number;
  expectedBrand: string; // brand_name THẬT trong Baserow (recon trước) — guard chống id-drift
  label: string;         // ghi chú SKU của Bồ (⚠️ = variant default, đổi nếu SKU khác)
  protein_pct: number;
  fat_pct: number;
  fiber_pct: number;
  carb_pct_calculated: number;
}

// expectedBrand = tên THẬT đã recon (KHÔNG phải nhãn viết tắt của TASK).
const TARGETS: Target[] = [
  { id: 12, expectedBrand: "Royal Canin Indoor Cat",    label: "RC Indoor 27",       protein_pct: 27, fat_pct: 13, fiber_pct: 4.0, carb_pct_calculated: 39.7 },
  { id: 13, expectedBrand: "Royal Canin Persian Adult", label: "RC Persian Adult",   protein_pct: 30, fat_pct: 22, fiber_pct: 4.7, carb_pct_calculated: 26.9 },
  { id: 16, expectedBrand: "Reflex Plus Cat",           label: "Reflex Plus Cat ⚠️",  protein_pct: 33, fat_pct: 14, fiber_pct: 2.0, carb_pct_calculated: 35.0 },
  { id:  5, expectedBrand: "Royal Canin Maxi Adult",    label: "RC Maxi Adult",      protein_pct: 26, fat_pct: 17, fiber_pct: 1.3, carb_pct_calculated: 40.0 },
  { id:  6, expectedBrand: "Royal Canin Mini Adult",    label: "RC Mini Adult",      protein_pct: 27, fat_pct: 16, fiber_pct: 1.4, carb_pct_calculated: 39.8 },
  { id:  9, expectedBrand: "Reflex Adult",              label: "Reflex Adult (dog)", protein_pct: 26, fat_pct: 14, fiber_pct: 3.5, carb_pct_calculated: 39.5 },
  { id: 10, expectedBrand: "ANF 30/15 Adult",           label: "ANF 30/15 Adult",    protein_pct: 30, fat_pct: 15, fiber_pct: 4.0, carb_pct_calculated: 35.0 },
  { id: 11, expectedBrand: "Royal Canin Puppy",         label: "RC Mini Puppy ⚠️",    protein_pct: 31, fat_pct: 20, fiber_pct: 1.4, carb_pct_calculated: 31.8 },
];

// ============================================================
// RECON kiểu field (best-effort, JWT) — xác nhận 4 field là number & KHÔNG formula/read-only.
// ============================================================
interface FieldDef { id: number; name: string; type: string; read_only?: boolean; formula?: string }

async function jwtLogin(): Promise<string | null> {
  if (!EMAIL || !PASSWORD) return null;
  try {
    const res = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Host: HOST_HEADER },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; token?: string };
    return j.access_token || j.token || null;
  } catch { return null; }
}

async function listFields(jwt: string): Promise<FieldDef[] | null> {
  try {
    const res = await fetch(`${BASEROW_URL}/api/database/fields/table/${FOOD_BRANDS_TABLE_ID}/`, {
      headers: { Authorization: `JWT ${jwt}`, Host: HOST_HEADER },
    });
    if (!res.ok) return null;
    return (await res.json()) as FieldDef[];
  } catch { return null; }
}

// ============================================================
// Helpers
// ============================================================
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const fmt = (v: number | null): string => (v == null ? "·" : String(v));

// ============================================================
// MAIN
// ============================================================
console.log(`oldbrand-nutri-backfill · ${APPLY ? "APPLY (PATCH row thật)" : "DRY-RUN (không ghi)"} · Baserow ${BASEROW_URL} (Host: ${HOST_HEADER})\n`);

// --- Recon kiểu field (best-effort) ---
const jwt = await jwtLogin();
let fieldTypeAbort = false;
if (jwt) {
  const fields = await listFields(jwt);
  if (fields) {
    const byName = new Map(fields.map((f) => [f.name, f]));
    console.log("🔎 RECON kiểu field (4 field sẽ PATCH):");
    for (const fn of PATCH_FIELDS) {
      const f = byName.get(fn);
      const bad = !f || f.type !== "number" || f.read_only === true || !!f.formula;
      if (bad) fieldTypeAbort = true;
      console.log(
        `  • ${fn.padEnd(22)} ${f ? `type=${f.type}${f.read_only ? " (read_only)" : ""}${f.formula ? " (formula)" : ""}` : "KHÔNG TỒN TẠI"}` +
          `${bad ? "  ❌ KHÔNG ghi được" : "  ✓ number ghi được"}`,
      );
    }
    console.log("");
  } else {
    console.log("⚠️ Không list-fields được (JWT OK nhưng API field từ chối) — bỏ qua kiểm kiểu field, dựa vào lỗi PATCH nếu sai.\n");
  }
} else {
  console.log("⚠️ Thiếu/sai BASEROW_USER_EMAIL/PASSWORD → không recon được kiểu field. Tiếp tục (Token vẫn đọc/ghi row được).\n");
}

// --- Recon 8 row + build bảng old→new ---
interface Plan { t: Target; brandLive: string | null; old: Record<PatchField, number | null>; brandOk: boolean; allEqual: boolean; residual: number; found: boolean }
const plans: Plan[] = [];
const aborts: string[] = [];
const warns: string[] = [];

for (const t of TARGETS) {
  let row: Record<string, unknown> | null = null;
  try {
    row = await getRow<Record<string, unknown>>("food_brands", t.id);
  } catch (e: any) {
    aborts.push(`id ${t.id} (${t.label}): KHÔNG đọc được row — ${e?.message || e}`);
    plans.push({ t, brandLive: null, old: { protein_pct: null, fat_pct: null, fiber_pct: null, carb_pct_calculated: null }, brandOk: false, allEqual: false, residual: NaN, found: false });
    continue;
  }
  const brandLive = row.brand_name == null ? null : String(row.brand_name).trim();
  const old: Record<PatchField, number | null> = {
    protein_pct: num(row.protein_pct),
    fat_pct: num(row.fat_pct),
    fiber_pct: num(row.fiber_pct),
    carb_pct_calculated: num(row.carb_pct_calculated),
  };
  const brandOk = brandLive === t.expectedBrand;
  if (!brandOk) aborts.push(`id ${t.id}: brand_name LIVE "${brandLive}" ≠ expected "${t.expectedBrand}" — id có thể đã lệch, KHÔNG ghi mù.`);

  const allEqual = PATCH_FIELDS.every((f) => old[f] != null && Math.abs((old[f] as number) - t[f]) <= TOL);

  // residual = 100 − (P+F+fibre+carb) ≈ moisture+ash. Dry food hợp lý ~8–20%.
  const residual = 100 - (t.protein_pct + t.fat_pct + t.fiber_pct + t.carb_pct_calculated);
  if (residual < 0) warns.push(`id ${t.id} (${t.label}): P+F+fibre+carb = ${(100 - residual).toFixed(1)} > 100 → số mới VÔ LÝ, kiểm lại.`);
  else if (residual > 30) warns.push(`id ${t.id} (${t.label}): residual (moisture+ash) ${residual.toFixed(1)}% hơi cao cho hạt khô — kiểm lại nếu cần.`);

  plans.push({ t, brandLive, old, brandOk, allEqual, residual, found: true });
}

// --- In bảng old→new ---
console.log("=".repeat(108));
console.log("BẢNG old → new (4 field):  [chỉ in field; brand_name/kcal/allergen GIỮ NGUYÊN]");
console.log("=".repeat(108));
const H = `${"id".padEnd(4)}${"brand_name (LIVE)".padEnd(30)}${"nhãn Bồ".padEnd(18)}${"prot".padEnd(14)}${"fat".padEnd(14)}${"fibre".padEnd(14)}${"carb".padEnd(16)}`;
console.log(H);
console.log("-".repeat(108));
for (const p of plans) {
  const t = p.t;
  const cell = (f: PatchField) => `${fmt(p.old[f])}→${t[f]}`;
  const brandCol = p.found ? (p.brandOk ? (p.brandLive || "") : `⚠️${p.brandLive}`) : "(NOT FOUND)";
  let mark = "";
  if (!p.found) mark = "  ❌ NOT FOUND";
  else if (!p.brandOk) mark = "  ❌ BRAND LỆCH";
  else if (p.allEqual) mark = "  ⏭️ đã khớp (sẽ skip)";
  console.log(
    `${String(t.id).padEnd(4)}${String(brandCol).slice(0, 29).padEnd(30)}${t.label.padEnd(18)}` +
      `${cell("protein_pct").padEnd(14)}${cell("fat_pct").padEnd(14)}${cell("fiber_pct").padEnd(14)}${cell("carb_pct_calculated").padEnd(16)}${mark}`,
  );
}
console.log("-".repeat(108));

// --- Tổng + cảnh báo ---
const willPatch = plans.filter((p) => p.found && p.brandOk && !p.allEqual).length;
const willSkip = plans.filter((p) => p.found && p.brandOk && p.allEqual).length;
console.log(`\nTỔNG: sẽ PATCH ${willPatch} · skip (đã khớp) ${willSkip} · ABORT ${aborts.length} · cảnh báo ${warns.length}`);
if (aborts.length) { console.log("\n❌ ABORT (không ghi mù — sửa trước khi apply):"); for (const a of aborts) console.log(`  - ${a}`); }
if (warns.length) { console.log("\n⚠️ CẢNH BÁO (kiểm số, KHÔNG chặn apply):"); for (const w of warns) console.log(`  - ${w}`); }

// Ghi chú nhãn-viết-tắt (không phải abort): nhãn Bồ ≠ brand_name thật ở vài row — bình thường.
console.log("\nNOTE: 'nhãn Bồ' là viết tắt SKU (vd id 11 nhãn 'RC Mini Puppy' nhưng brand_name THẬT = 'Royal Canin Puppy';");
console.log("      id 12 nhãn 'RC Indoor 27' = 'Royal Canin Indoor Cat'). Script verify theo brand_name THẬT (cột LIVE), KHÔNG theo nhãn.");
console.log("      id 11 & 16 (⚠️) = số variant default Bồ chọn — nếu SKU bán thực tế khác thì sửa TARGETS trước khi apply.");

const blocked = aborts.length > 0 || fieldTypeAbort;

if (!APPLY) {
  console.log(`\nĐây là DRY-RUN — CHƯA ghi gì.`);
  if (blocked) console.log(`⛔ Có ABORT/field-type lỗi → apply sẽ bị chặn. Sửa rồi chạy lại dry-run.`);
  else console.log(`✅ Sạch. Apply thật: BASEROW_URL=${BASEROW_URL} bun run scripts/oldbrand-nutri-backfill.ts --apply`);
} else {
  if (blocked) {
    console.log(`\n⛔ APPLY BỊ CHẶN vì có ABORT hoặc field không ghi được. KHÔNG PATCH gì. Sửa rồi chạy lại.`);
    process.exit(1);
  }
  console.log("\n=== APPLY (PATCH row) ===");
  let ok = 0, skip = 0, errs = 0;
  for (const p of plans) {
    const t = p.t;
    if (p.allEqual) { skip++; console.log(`  ⏭️ SKIP #${t.id} ${t.expectedBrand} (đã == target ±${TOL})`); continue; }
    const patch: Record<string, number> = {
      protein_pct: t.protein_pct,
      fat_pct: t.fat_pct,
      fiber_pct: t.fiber_pct,
      carb_pct_calculated: t.carb_pct_calculated,
    };
    try {
      await updateRow("food_brands", t.id, patch);
      ok++;
      console.log(`  ✓ PATCH #${t.id} ${t.expectedBrand} → P${t.protein_pct} F${t.fat_pct} fib${t.fiber_pct} carb${t.carb_pct_calculated}`);
    } catch (e: any) {
      errs++;
      console.error(`  ✗ #${t.id} ${t.expectedBrand}: ${e?.message || e}`);
    }
  }
  console.log(`\n✅ Xong: PATCH ${ok} · skip ${skip}${errs ? ` · LỖI ${errs}` : ""}.`);
  console.log(`NHỚ: docker restart vowvet-api (bust brandsCache 24h) → verify carbOf số mới (Persian ~27, Indoor ~40). KHÔNG commit (local-only).`);
}
