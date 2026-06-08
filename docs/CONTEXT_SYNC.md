# CONTEXT SYNC — 2026-06-08 (đóng phiên: AppHeader-lite + security cleanup + R2 fix)

> Handoff canonical (root `CONTEXT_SYNC.md` đã revert/stale — KHÔNG dùng). Lịch sử dài: `CONTEXT_SYNC_FULL_20260606.md`. **Báo cáo phân tích đầy đủ: `docs/ANALYSIS_2026-06-08.md`.**
> STATE: HEAD = commit "docs: close session" (trên `6ef5859`) · SW `vowvet-v298-header-border-brand` · repo **LOCAL-ONLY (không remote), ~140 commit, CHƯA push**. Working tree sạch (chỉ `.claude/launch.json` untracked).

## 🎯 ĐANG LÀM GÌ
Thương mại hóa trang Dinh dưỡng (catalog `food_brands` số nhãn thật + supplement MonMin + carb-mismatch). Phiên này: dọn data/creds + nhất quán brand + phân tích kiến trúc để chốt 4 epic (palette / header / camera-scan / PDF).

## ✅ ĐÃ XONG (phiên này + cụm liền trước)
- **Backfill carb 8 row CŨ** số nhãn thật (RC×5/Reflex×2/ANF), thay placeholder phồng. (commit `1d8a4cf`, tool `scripts/oldbrand-nutri-backfill.ts`.)
- **RX exemption** (`food-brands.astro`): `isRxDiet()` + gate 3 nhánh carb mèo + note "Đồ kê đơn"; DOM-verified id24/25 hết cờ, id12/23 vẫn cảnh báo. (commit `51971c2`, SW v297.)
- **AppHeader-lite**: 3 border off-brand → brand token — index nav + `#pet-page-nav` → `border-mmp-ink/12`; back-link pets/[id] → `text-mmp-ink/60 hover:text-mmp-ink`. DOM-verify `oklab(.1448/.12)` = ink/12, food-brands nav đối chứng KHÔNG đổi. (commit `24f3bb9`, SW v298.) **KHÔNG dựng component AppHeader** (epic mai).
- **Dọn 2 junk row** food_brands (id1/id2 rỗng) — RAW 19→17, catalog vẫn 17.
- **Bịt creds trên disk**: xoá `docs/archive/MIGRATION_REPORT.md` (gitignored, untracked, chứa LIVE Baserow token+pw+email) → grep-confirm 0 live-token ngoài `.env`. `git rm docs/archive/LOGIN_UX_REPORT.md` (tracked, chứa pw+email **TEST account**, 0 token) — gỡ tracking (commit `6ef5859`). **Token Baserow ĐÃ rotate (Duy xác nhận)** → file cũ vô hại. *History scrub (filter-repo/BFG) CHƯA làm — để Duy quyết riêng.* `.env.backup` KHÔNG tồn tại.

## 🔧 SỬA BRIEF (handoff cũ lệch — đã verify code)
- **Storage = Cloudflare R2, KHÔNG phải MinIO** (`@aws-sdk/client-s3` ở `package.json:7`, `api/src/lib/photos.ts:88` `extractR2Key`).
- **docker-compose CHỈ có `vowvet-api` + `vowvet-web`** (`docker/docker-compose.yml:12-65`); Baserow (`host.docker.internal:8888`) + R2 (cloud) đều **external**. Không có service baserow/minio.
- **`.env.backup` KHÔNG tồn tại** trên máy (brief giả định nhầm).

## 🧾 NỢ (xếp hạng)
- **[HIGH — done]** Creds rotate ✅ + file creds đã xoá/gỡ-track. (Còn tuỳ chọn: scrub git history nếu muốn sạch tuyệt đối — Duy quyết.)
- **[MED] Carb-drift 9 premium**: residual `100-(P+F+fibre+carb)` 8 row cũ ~16 nhất quán; 9 premium **6.5–22 loạn** → **`id23 Hill's SD Indoor` (carb34, residual6.5)** + **`id22 Farmina Dog` (carb30, residual9.0)** NGHI carb thổi cao → rà lại GA nhãn (TASK số §4, duyệt cũ→mới).
- **[LOW]** 213 `!important` trong `global.css` (chủ yếu `.pet-detail-tabs` v62-v67) · `border-slate-200` lẻ còn sót (`index.astro` 5 chỗ ngoài header + sub-nav pets/[id]) · root `CONTEXT_SYNC.md` STALE (v293, HEAD 105fa1d) nên xoá/gộp · ~14 file `.bak`/`.backup` rác trên disk (gitignored, gồm `pet-score.astro.phase*-pre.bak ×12`, `sw.js.v184.bak`, `Layout.astro.bak-before-swfix`, `docker-compose.yml.backup`).

## ⚠️ CẦN VERIFY (trước khi build mai)
- **`@google/genai`** version đang dùng có nhận **PDF-input** (inlineData application/pdf) không → kiểm `package.json`/lock + thử 1 call. (Quyết định scope PDF pet-record.)
- **SW `controllerchange → reload`** (`Layout.astro:171-177`, có guard `_reloading`) còn gây reload-loop ở route 302 không (lịch sử `/personality`).

## 🔮 MAI (epic — cần Duy quyết design trước khi code)
1. **Palette token**: sửa `CLAUDE.md §9` cho khớp code (emerald/sky = token info/success hợp lệ NGOÀI pet-detail; pet-detail = monochrome) + vá rò rỉ gradient/`-50` trong `.pet-detail-tabs`. **Hoãn migrate toàn cục** (blast-radius 377 hit/60 file gồm shared component `ui/Badge`,`ui/Alert`,`dashboard/QuestStrip`,`CommunityMini`).
2. **AppHeader opt-in**: tổng quát hoá `TopBar.astro` (props backHref/title/showNavIcons), roll-out dần, `pets/[id]` lệch nhất. Giữ v207 cho trang public.
3. **Camera scan `/scan`**: khuyến nghị **OCR nhãn→GA→số TRƯỚC** (tái dùng Gemini-vision sẵn có: bcs-vision/lost-pet-vision/bills, no new dep); chụp-thú ~đã có (bcs-vision); barcode yếu nhất (cần dep + data-gap VN, food_brands không có field barcode).
4. **PDF pet record (extract)**: đẩy thẳng PDF vào Gemini (no new dep) — khác nút "Xuất PDF Hộ chiếu" đã có (generate, `pets/[id].astro:225`).

## 📌 QUYẾT ĐỊNH KỸ THUẬT
- `carbOf()` = `carb_pct_calculated>0 ? real : estimatedCarb(100-P-F-12)`. Carb/RX là **HIỂN THỊ**, KHÔNG đụng DER engine. Ngưỡng mèo 25. `isRxDiet` = `/veterinary|prescription/i` trên product_line.
- Canonical handoff = `docs/CONTEXT_SYNC.md`. Brand border = `mmp-ink/12`, text phụ = `mmp-ink/60`, chính = ink.

## ⚠️ LƯU Ý / BẪY
- **Baserow id ≠ vị trí catalog!** id thật: 8 cũ `5,6,9,10,11,12,13,16`; 9 premium `17–25`; RX = id24 (RC Urinary S/O) + id25 (Hill's c/d). food_brands table 648, 17 row.
- **Script/đọc Baserow chạy HOST**: `BASEROW_URL=http://localhost:8888 bun run scripts/<x>.ts [--apply/--write]` (Bun tự nạp `.env`, KHÔNG in token). Đọc nhanh: `bun -e 'const{getRow,listRows}=await import("./shared/baserow.ts");…'` (không tạo file). **Secret-file gitignored → Grep tool (ripgrep) BỎ QUA → dùng `grep -rl` (bash) khi cần quét gitignored, chỉ `-l`/`-c` để không lộ value.**
- **Restart**: `.astro`→`docker restart vowvet-web` · api/lib/data→`docker restart vowvet-api` (bust brandsCache 24h) · `.env`→`--force-recreate` · `sw.js`→bump vXXX.
- **Verify DOM**: `preview_start "vowvet"` (launch.json = stub no-op port 4322 → browser gắn vào docker server) → `preview_eval` gọi `Alpine.$data(el)`. Trang gated (pets/[id]) redirect /login → verify gián tiếp (token-equivalence + grep source) hoặc mint session. Cờ carb render **amber** không phải đỏ. Screenshot trang nặng = timeout → dùng eval.
- **Windows**: `cd C:\docker\vowvet` trước git; path `[ ]` phải QUOTE; curl→python pipe trực tiếp (đừng `-o /tmp/...`, `/tmp` lệch bash↔python).
- **CẤM ĐỤNG** (trừ TASK ghi rõ): `shared/nutrition-engine.ts`/số DER·gram · vocab `health-conditions.ts`+`allergen-normalizer.ts` · schema/field/row Baserow · loader `nutrition.ts`+`public.ts` · `.env`/`baserow-config.json`.
- Account test: pet **min id 12** (user 10) Mèo · `lyvu2004DTP@gmail.com` user 18 (Google), `/dev/reset-onboarding`. Bundle `*.bundle` gitignored → backup `C:\docker\backups\`.

## 📂 FILE QUAN TRỌNG
- `web/src/pages/food-brands.astro` — catalog + carb-mismatch (`carbOf`/`isRxDiet`) + supplement + nav brand.
- `web/src/pages/pets/[id].astro` — hub pet (~2580 dòng, tabs inline, `.pet-detail-tabs` override) + section-nav.
- `api/src/lib/nutrition.ts` (loader `loadFoodBrands`/`flatBrand`, cache 24h, lọc brand_name rỗng `:137`) · `api/src/routes/public.ts` (`/food-brands`) · `api/src/lib/gemini.ts` (`@google/genai`, flash/pro, budget $5, vision dùng bcs/lost-pet/bills).
- `web/src/styles/global.css` — @theme token (`:9-36`) + `.pet-detail-tabs` override (213 !important).
- `web/src/components/TopBar.astro` — header component duy nhất (chỉ dashboard). `Layout.astro` — no header (v207).
- `scripts/oldbrand-nutri-backfill.ts` · `premium-brands-populate.ts` · `brand-*` — data tools (HOST, dry-run mặc định).
- **`docs/ANALYSIS_2026-06-08.md`** — phân tích kiến trúc/palette/header/roadmap/nợ đầy đủ (đọc trước khi build epic mai).
