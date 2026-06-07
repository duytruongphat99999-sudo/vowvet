# CONTEXT SYNC — 2026-06-07 (phiên dọn: carb backfill + RX exemption + junk rows)

> Handoff gọn cho phiên sau. Lịch sử dài: `CONTEXT_SYNC_FULL_20260606.md` (685 dòng). File này (docs/) là **canonical**; root `CONTEXT_SYNC.md` đã revert về bản committed (không còn dùng làm handoff).
> STATE: HEAD `51971c2` + docs commit này trên đầu · SW `vowvet-v297-rx-carb-note` · repo **LOCAL-ONLY (không remote), ~138 commit, CHƯA push**. Working tree sạch (chỉ `.claude/launch.json` untracked — tooling stub, KHÔNG commit).

## 🎯 ĐANG LÀM GÌ
Thương mại hóa trang Dinh dưỡng: catalog `food_brands` shoppable + supplement MonMin (companion) + carb-mismatch đọc số THẬT. Phiên này: dọn data + miễn cờ carb cho đồ kê đơn.

## ✅ ĐÃ XONG PHIÊN NÀY
- **Backfill số dinh dưỡng THẬT cho 8 row CŨ** (RC ×5 / Reflex ×2 / ANF) — thay placeholder phồng (40/45/50) bằng số nhãn hãng. carb mới: RC Indoor `39.7` · RC Persian `26.9` · Reflex Plus Cat `35` · RC Maxi `40` · RC Mini `39.8` · Reflex Adult `39.5` · ANF `35` · RC Puppy `31.8` (kèm P/F/fibre). Verify qua public endpoint. (commit `1d8a4cf`, tool `scripts/oldbrand-nutri-backfill.ts` — recon→dry-run→`--apply`, self-check skip ±0.1.)
- **Miễn cờ carb cho đồ kê đơn (RX)** (`food-brands.astro`, SW v297): thêm **`isRxDiet(b)`** = `/veterinary|prescription/i.test(product_line)`; gate `!this.isRxDiet(b)` vào **3 nhánh carb mèo** (`compatScore` −25 · `isMismatch` · `mismatchReason`); thêm template **note "Đồ kê đơn"** (calm, `text-mmp-ink/60`, thuần chữ) thay cảnh báo. **KHÔNG đụng** `carbOf`/`estimatedCarb`/`conditionDelta`/số. (commit `51971c2`.)
  - **DOM-verified** (Alpine thật, profile mèo): id 24 RC Urinary S/O + id 25 Hill's c/d → hết "vượt ngưỡng", hiện note RX. Đối chứng id 23 Hill's Science Diet Indoor + id 12 RC Indoor → VẪN cảnh báo amber (không miễn nhầm).
- **Dọn 2 junk row** id 1 & id 2 (rỗng hoàn toàn) khỏi `food_brands` — RECON-guard brand_name rỗng trước khi xóa. RAW Baserow 19→17, catalog vẫn 17.

## 🧾 NỢ PHIÊN SAU (ưu tiên cao → thấp)
1. **Host ảnh pack-shot 9 premium** lên `monminpet.com/images/products/<slug>.png` (giờ `image_url` trống → card placeholder).
2. **Farmina kcal (id 21, 22)** đang Atwater-tính → chốt lại từ bao bì.
3. **Webview in-app MonMin** (v2) nếu `X-Frame-Options`/CSP cho nhúng; ngoài → giữ `target=_blank`.
4. **Mạch 2 quét nhãn CAMERA** (getUserMedia + OCR Gemini), route `/scan` / `#smart-scanner`.
5. **Trang "Định vị pet" GPS** (đang coming-soon nav) · **AppHeader chung** (chờ chốt scope).
6. **Mạch 4 Nhật ký sản phẩm pet** [đụng schema Baserow → recon + duyệt field TRƯỚC] · **PDF hồ sơ pet** · **ADOPT EPIC** (recon từ đầu).

## 📌 QUYẾT ĐỊNH KỸ THUẬT
- **`carbOf()`** = `(carb_pct_calculated != null && > 0) ? real : estimatedCarb`. Cảnh báo/scoring carb là **HIỂN THỊ**, KHÔNG đụng DER engine. Ngưỡng mèo **25**.
- **`isRxDiet`** match theo `product_line` (`Royal Canin Veterinary` / `Hill's Prescription Diet`). Miễn cờ carb = **display-only**, KHÔNG đụng số carb. Allergen vẫn tính cho RX (check allergen đứng trước nhánh carb).
- **Supplement MonMin = live-fetch monminpet** (sitemap → ld+json Product), cache **6h** (`api/src/lib/monmin-supplements.ts`), match bệnh client-side. **KHÔNG bảng Baserow.**
- **Nút shoppable/supplement = ink fill** (§9 contrast), gold = accent. `target=_blank rel=noopener noreferrer`.
- **Vocab allergen** = `shared/allergen-normalizer.ts` (chicken/beef/fish/dairy/egg/soy/grain/shellfish/peanut); `corn/wheat → grain`.
- **Canonical handoff = `docs/CONTEXT_SYNC.md`** (root đã revert).

## ⚠️ LƯU Ý / BẪY
- **Baserow id ≠ số thứ tự catalog!** Catalog hiển thị sort theo tên; id THẬT: 8 row cũ = `5,6,9,10,11,12,13,16`; 9 premium = `17–25`. RX: RC Urinary S/O = **id 24**, Hill's c/d = **id 25**. (Đừng đọc/ghi theo "#8/#9" — đó là vị trí hiển thị.)
- **Script Baserow chạy HOST**: `BASEROW_URL=http://localhost:8888 bun run scripts/<x>.ts [--apply/--write]` (Bun tự nạp `.env`; KHÔNG hardcode/in token). Field-meta cần JWT (.env email+pass); row CRUD = Token qua `shared/baserow.ts`. **Đọc/ghi raw nhanh** = `bun -e 'const {getRow,updateRow,deleteRow,listRows}=await import("./shared/baserow.ts"); ...'` (không cần tạo file).
- **Xóa row Baserow = PHÁ HỦY** → bắt buộc RECON xác nhận rỗng trước (`deleteRow` chỉ khi `brand_name` trống).
- **Sửa api/lib hoặc data → `docker restart vowvet-api`** (bust `brandsCache` 24h). `.astro` → `docker restart vowvet-web`. `.env` → `--force-recreate`. `sw.js` → bump vXXX.
- **Verify DOM thật**: `preview_start "vowvet"` (launch.json stub no-op port 4322 → browser gắn vào server docker 4322), điều hướng `location.href='.../food-brands'`, rồi `preview_eval` gọi `Alpine.$data(el)` → chạy chính method đã ship. Inject state = ephemeral. Screenshot trang nặng = timeout → dùng eval/DOM.
- **Cờ carb render AMBER** (`text-amber-700`), KHÔNG phải đỏ. Đỏ chỉ cho gạch-ngang allergen.
- **PowerShell** mở mới về `C:\Users\Admin` → `cd C:\docker\vowvet` TRƯỚC `git`; path `[ ]` phải QUOTE. **curl→python**: pipe trực tiếp (`/tmp` khác nhau giữa bash↔python Windows nên đừng `-o /tmp/...`).
- **Secret-scan trước commit** theo VALUE-trong-quote (`sk-`/`AIza`/`eyJ`/literal ≥12); regex rộng bắt nhầm tên biến.
- Account test: pet **min id 12** (user 10) Mèo; `lyvu2004DTP@gmail.com` user 18 (Google), `/dev/reset-onboarding` reset.
- **Bundle `*.bundle` gitignored** — backup ở `C:\docker\backups\`, USER tự upload cloud. `/context-save` (gstack) KHÔNG ghi `docs/` — làm tay.
- **CẤM ĐỤNG** (trừ TASK ghi rõ): `shared/nutrition-engine.ts` / số DER·gram·khẩu phần · vocab `health-conditions.ts` + `allergen-normalizer.ts` · schema/field/row Baserow · loader `nutrition.ts` + `public.ts`.

## 📂 FILE QUAN TRỌNG
- `web/src/pages/food-brands.astro` — catalog + supplement section + carb-mismatch (`carbOf`/`estimatedCarb`) + **`isRxDiet` + RX note**.
- `web/src/pages/pets/[id].astro` — supplement PREMIUM tab nutrition (lazy x-if).
- `api/src/lib/monmin-supplements.ts` — supplement live-fetch + cache 6h + match bệnh.
- `scripts/oldbrand-nutri-backfill.ts` — backfill P/F/fibre/carb 8 row cũ (recon→dry-run→`--apply`). · `scripts/premium-brands-populate.ts` · `scripts/brand-shoppable-sync.ts` · `scripts/brand-search-fill.ts` — data tools (HOST, dry-run mặc định).
- `shared/allergen-normalizer.ts` · `shared/health-conditions.ts` — vocab (CẤM sửa).
- `web/public/sw.js` — `VERSION = vowvet-v297-rx-carb-note`.
- `CONTEXT_SYNC_FULL_20260606.md` (root) — archive log dài.
