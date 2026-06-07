# CONTEXT SYNC — 2026-06-07 17:28

> Handoff gọn cho phiên sau. Lịch sử dài: `CONTEXT_SYNC_FULL_20260606.md` (685 dòng) + root `CONTEXT_SYNC.md` (phiên supplement MonMin 3-phase). File này (docs/) là bản mới nhất.
> STATE: HEAD `402846f` · SW `vowvet-v296-carb-scoring-sync` · repo **LOCAL-ONLY (không remote), 134 commit, CHƯA push**.

## 🎯 ĐANG LÀM GÌ
Thương mại hóa trang Dinh dưỡng: catalog `food_brands` shoppable + supplement MonMin (companion riêng) + carb-mismatch đọc số THẬT.

## ✅ ĐÃ XONG PHIÊN NÀY
- **`food_brands` = 17 brand**: 8 cũ (Royal Canin ×5 / Reflex ×2 / ANF) + **9 premium (#17–#25)**:
  - **low-carb**: Orijen Cat/Dog · Acana Cat/Dog · Farmina N&D Cat/Dog (carb 18–30).
  - **ngũ cốc / RX (đặc trị)**: Hill's Science Diet Indoor Cat · RC Urinary S/O Cat · Hill's c/d Urinary Cat (carb 34–38).
  - **Đã clear (trước phiên)**: 2 dòng MonMin food GIẢ + Me-O / Whiskas / Pedigree / SmartHeart.
- **Carb logic** (`food-brands.astro`): đọc `carb_pct_calculated` THẬT qua **`carbOf()`** (fallback `estimatedCarb = 100 − P − F − 12` cho row thiếu/0); **ngưỡng mèo 25** (cũ 20); **4 usage nhất quán** — `isMismatch` / `mismatchReason` / `compatScore` / `conditionDelta`; **chó KHÔNG có nhánh carb**. `estimatedCarb` giờ chỉ còn ở định nghĩa + làm fallback. (commit `402846f`, SW v296)
- **Allergen 9 premium = JSON-array** (`["chicken","fish"]`); `corn`/`wheat` → `"grain"` (vocab 9-code); `lamb` (Acana Dog) ngoài vocab → ingredient-guard **inert** (vô hại; `fish` vẫn bắt được). (commit `afc8501`, SW v294)
- **Script mới**: `scripts/premium-brands-populate.ts` (recon-live list-fields + validate key/option + anti-dup + dry-run mặc định; `--write` tạo row). Trước đó: `scripts/brand-search-fill.ts` (auto `product_url` Shopee cho brand ngoại, commit `80fe95c`).

## 🧾 NỢ PHIÊN SAU (ưu tiên)
1. **BACKFILL `carb_pct_calculated` số thật cho 8 row CŨ** (RC / Reflex / ANF) — đang fallback formula `100−P−F−12` bị **phồng** → carb hiển thị thổi cao (vd RC Indoor Cat ~50% dù thật ~28%). Đây là nguyên nhân chính cần dọn.
2. (Tuỳ chọn) **Ẩn cảnh báo carb cho 2 dòng RX** (#8 RC Urinary S/O Cat, #9 Hill's c/d Urinary Cat) — giá trị của chúng ở kiểm soát khoáng/đặc trị, KHÔNG phải low-carb → cảnh báo "carb cao" gây hiểu nhầm.
3. **Host ảnh pack-shot 9 premium** lên `monminpet.com/images/products/<slug>.png` (giờ `image_url` trống → card hiện placeholder).
4. **Farmina kcal (#5, #6)** hiện đang Atwater-tính → chốt lại con số từ bao bì.
5. (Ghi nhận, **KHÔNG phải nợ**) `compatScore` / `conditionDelta` các ngưỡng/trọng số khác vẫn giữ nguyên — chỉ đổi nguồn carb sang `carbOf`.

## 📌 QUYẾT ĐỊNH KỸ THUẬT
- **`carbOf()`** = `(carb_pct_calculated != null && > 0) ? real : estimatedCarb`. Cảnh báo + scoring carb là **HIỂN THỊ**, KHÔNG đụng DER engine khẩu phần.
- **Supplement MonMin = live-fetch monminpet** (sitemap-index → ld+json Product), cache **6h** (`api/src/lib/monmin-supplements.ts`), match bệnh **client-side** theo cờ bệnh pet. **KHÔNG bảng Baserow.**
- **Nút shoppable/supplement = ink fill** (`bg-mmp-ink`/chữ trắng, đạt §9 contrast), **gold = accent** (ring/badge/viền). `target=_blank rel=noopener noreferrer`, dùng `product_url`/`url` theo record.
- **Vocab allergen** (canonical) = `shared/allergen-normalizer.ts`: `chicken/beef/fish/dairy/egg/soy/grain/shellfish/peanut`. `KEYWORD_TO_CODE` map `corn/ngô/wheat/lúa mì → grain`.

## ⚠️ LƯU Ý / BẪY
- **Script Baserow chạy HOST**: `BASEROW_URL=http://localhost:8888 bun run scripts/<x>.ts [--write]` (host KHÔNG có `host.docker.internal`; Bun **tự nạp `.env`**; KHÔNG hardcode/in token). Field meta cần JWT (email+password .env); row CRUD dùng Token qua `shared/baserow.ts`.
- **Sửa api/lib hoặc data → `docker restart vowvet-api`** (bust `brandsCache` 24h + nạp code). `.astro` → `docker restart vowvet-web`. `.env` → `--force-recreate`. `sw.js` → **bump vXXX**.
- **PowerShell** mở cửa sổ mới luôn về `C:\Users\Admin` → phải `cd C:\docker\vowvet` TRƯỚC khi `git`. Path có ngoặc vuông (`pets/[id].astro`) phải **QUOTE**.
- **Secret-scan trước commit**: regex rộng dễ false-positive (bắt nhầm "token"/"password" = tên biến/comment) → quét theo **VALUE trong quote** (`sk-`/`AIza`/`eyJ`/literal ≥12 ký tự).
- **Preview**: screenshot subsystem timeout trên trang nặng → verify bằng **computed-style/DOM eval**. Inject Alpine state qua `preview_eval` = **ephemeral** (mất khi reload). Preview CÓ internet (ảnh monminpet load thật). Tab nutrition pet page = **lazy** (`x-if`) → verify section SAU khi mở tab.
- **monminpet**: 35 product · ld+json Product per-page (`sitemap-index` → `sitemap-0`) · ảnh `/images/products/<slug>.png`. Product page **301 → http trailing-slash** → follow-redirect.
- Account test: pet **min id 12** (user 10) Mèo, no health_conditions → supplement = featured; `lyvu2004DTP@gmail.com` user 18 (Google) — `/dev/reset-onboarding` reset vô hạn.
- **Bundle `*.bundle` gitignored** — backup rời ở `C:\docker\backups\`, USER tự upload cloud.
- **CẤM ĐỤNG** (trừ khi TASK ghi rõ): `shared/nutrition-engine.ts` / số DER·RER·gram·khẩu phần · vocab `shared/health-conditions.ts` + `allergen-normalizer.ts` · schema/field/row Baserow · loader `api/src/lib/nutrition.ts` + `public.ts`.

## 📂 FILE QUAN TRỌNG
- `web/src/pages/food-brands.astro` — catalog + section "Bổ sung từ MonMin" + carb-mismatch (`carbOf`/`estimatedCarb`).
- `web/src/pages/pets/[id].astro` — supplement PREMIUM trong tab nutrition (lazy x-if).
- `api/src/lib/monmin-supplements.ts` — supplement live-fetch + cache 6h + match bệnh.
- `scripts/premium-brands-populate.ts` · `scripts/brand-shoppable-sync.ts` · `scripts/brand-search-fill.ts` — data tools (chạy HOST, dry-run mặc định).
- `shared/allergen-normalizer.ts` · `shared/health-conditions.ts` — vocab allergen + bệnh (CẤM sửa vocab).
- `web/public/sw.js` — `VERSION = vowvet-v296-carb-scoring-sync`.
- `CONTEXT_SYNC_FULL_20260606.md` (root) — archive log dài 685 dòng.
