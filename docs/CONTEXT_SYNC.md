# CONTEXT SYNC — 2026-06-08 (đóng phiên: AppHeader-lite + security cleanup + R2 fix)

> Handoff canonical (root `CONTEXT_SYNC.md` đã revert/stale — KHÔNG dùng). Lịch sử dài: `CONTEXT_SYNC_FULL_20260606.md`. **Báo cáo phân tích đầy đủ: `docs/ANALYSIS_2026-06-08.md`.**
> STATE: HEAD `a3f2eb4` · SW `vowvet-v300-food-scan-ui` · repo **LOCAL-ONLY (không remote), ~143 commit, CHƯA push**. Working tree sạch (chỉ `.claude/launch.json` untracked).

## ✅ ĐÃ XONG — phiên 2026-06-08b (scan UI + A-policy màu)
- **`ca32f13`** — Backend OCR scan nhãn (pha 1): `POST /pets/:id/food/scan` + `food-label-vision.ts` (Gemini 2.5 flash, JSON text-parse) + `food-brand-matcher.ts` (listRows food_brands READ-ONLY, fuzzy Dice). Ephemeral, KHÔNG ghi Baserow.
- **`bd90777`** — A-policy màu: `CLAUDE.md §9` hợp thức hoá emerald/green=success, sky/blue=info **semantic HỢP LỆ NGOÀI pet-detail**; pet-detail/care-plan giữ MONOCHROME (override `.pet-detail-tabs` GIỮ NGUYÊN). Comment token `global.css:20-21` align. Vá leak gradient `pets/[id].astro:1600` → cream/ink. SW v299. (KHÔNG rip 459 class = tránh A-purist.)
- **`a3f2eb4`** — UI camera scan (pha 2): widget Alpine `foodScanWidget` trong **nutrition tab** `pets/[id].astro` (monochrome gold/ink, `<input type=file capture=environment>`, fetch `/food/scan` relative + credentials cookie). Render `{scan_url, ocr, match}` — KHÔNG tính FE. Nhãn "AI của VowVet". SW v300. Plumbing HTTP verified; **chờ ảnh nhãn thật để test OCR**.

## 🔓 OPEN / NỢ (cập nhật 2026-06-08b)
- **B — packshot brand**: `food_brands` **17/17 thiếu `image_url`** (live verified; `product_url` đã đủ cả 17). Host = `https://monminpet.com/images/products/<slug>.png` (**KHÔNG R2** — R2 chỉ ảnh user upload). Chờ 17 ảnh per-slug (slug chuẩn hoá đã đề xuất). Không build được tới khi có ảnh.
- **C — test OCR nhãn THẬT**: backend + UI xong, plumbing verified (mint token `signSession` + curl `/food/scan`, OCR null trên ảnh-không-nhãn = đúng). CHƯA test nhãn thật → chờ Duy đưa ảnh (nên chọn brand có trong food_brands để verify cả `match`).
- **A — gradient/`-50` trang trí**: bề mặt rộng (~89 `bg-*-50` + ~35 gradient / ~35 file). HOÃN — dọn per-instance scope hẹp khi cần (KHÔNG quét mù = tránh A-purist). Theo A-policy: semantic status giờ HỢP LỆ; chỉ màu **trang trí**/gradient mới cấm.

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

---

## 🏛️ EPIC NỀN — USER ACTIVITY LAYER (thiết kế lúc TỈNH, đừng gật khi mệt)

PHÁT HIỆN RECON (2026-06-08): activity-layer PER-PET ĐÃ TỒN TẠI & đang chạy — KHÔNG xây mới.
- Spine READ: GET /api/v1/pets/:id/activity (api/src/routes/pets.ts:1808) — aggregate 7 bảng (pet_photos/daily_check_ins/pet_diary/bcs_assessments/user_daily_quests/user_achievements/care_plan_completions) → {type,title,description,points,created_at}, fail-soft per-query, POINTS_BY_ACTIVITY (pets.ts:1797). Page: web/src/pages/pets/[id]/activity.astro.
- Public feed: community_events(704) qua createCommunityEvent() (community-feed.ts:61). event_type: tier_up|achievement_unlock|hero_action|new_match|birthday.
- Gamification trong DATA (không chỉ UI): achievement_defs/user_achievements · quest_definitions/user_daily_quests · hero_acts · reward_definitions/user_rewards · leaderboard_snapshots.
- DB: 58 table (id=136). Owner = pets.user_id; ownership = getOwnedPet(petId, session.sub). Timestamp = app-set ISO (*_at). Insert helper chung = shared/baserow.ts createRow(). KHÔNG có logActivity() tổng — mỗi domain tự ghi.

THIẾU (việc thật — cần Duy quyết design trước khi build):
1. ADMIN cross-user drilldown — CHƯA CÓ. Admin giờ chỉ /admin/stats (counter tổng) + CSV thô (admin.ts:41). "Admin soi 1 user làm gì" = BUILD: tái dùng aggregator /pets/:id/activity, bỏ guard ownership + thêm requireAdmin (admin = phone-allowlist ADMIN_PHONES, admin.ts:26 — KHÔNG phải is_vet).
2. THÊM NGUỒN vào aggregator (scan/bills/vaccine/water…): +1 safeList() (pets.ts:1838) + 1 dòng POINTS_BY_ACTIVITY (pets.ts:1797).
3. WRITE-SPINE chung logActivity()? — quyết: giữ read-aggregate (mỗi domain tự ghi, hiện vậy) HAY thêm 1 audit-log thô tập trung. Trade-off Bồ trình mai.

SCAN nối vào layer này (KHÔNG table cô lập):
- /scan chưa tồn tại. OCR→GA→carb tái dùng wiring bills NO-DEP (ocrBillImage bills.ts:244 inlineData base64 + responseSchema care-planner-v2:289 + multipart photo→buffer bills:91 + carb NFE server-side 100-P-F-fibre-moisture-ash). SDK @google/genai 2.3.0 image+JSON proven. THÊM rate-limit (vision-lib bỏ qua budget $5). SW 302 = no loop (giải quyết).
- Scan muốn lên timeline = phải PERSIST event. ĐÂU? (bảng mới scan_logs / community_events.event_data / table user-products) = quyết design mai. Đây chính là "tủ sản phẩm của user" Duy muốn → đi qua activity layer, không cô lập.

BƯỚC KẾ (mai, chat mới, tỉnh): Bồ trình 2-3 mô hình data (scan-event persist + admin drilldown + có/không write-spine) kèm trade-off → Duy chọn → rồi build. Thứ tự: nền/schema trước, scan+admin sau.

---

## ⚠️ ĐÍNH CHÍNH (2026-06-08) — SCAN BACKEND ĐÃ TỒN TẠI
Block epic ở trên ghi "/scan chưa tồn tại" — SAI. Session khác của Duy (commit ca32f13, alias Meliodas, 10:52 VN) đã build scan backend PHA 1:
- Route POST /api/v1/pets/:id/food/scan (api/src/routes/food-scan.ts) — requireAuth + getOwnedPet ownership. Multipart photo ≤10MB → upload R2 scans/{petId}/ → scanFoodLabel() → matchFoodBrand() → trả {scan_url, ocr, match}. Nhãn "AI của VowVet" (trung thực §5).
- OCR: api/src/lib/food-label-vision.ts — Gemini 2.5 Flash inlineData, parse JSON thuần (KHÔNG responseSchema). Trả brand/line/species/life_stage/protein/fat/fiber/moisture/kcal/raw_text.
- Match: api/src/lib/food-brand-matcher.ts — listRows food_brands READ-ONLY, fuzzy (normalize + Dice), trả brand khớp + field đã lưu (gồm carb_pct_calculated) + top-3.
- TRẠNG THÁI pha-1 = EPHEMERAL (không ghi Baserow), KHÔNG rate-limit, OCR text-parse, lấy moisture nhưng KHÔNG ash → carb NFE CHƯA tính.

CÒN THIẾU (pha sau — khớp epic activity layer ở trên):
1. UI scan — ✅ XONG (`a3f2eb4`): widget `foodScanWidget` trong **nutrition tab** `pets/[id].astro` (KHÔNG phải page `/scan` riêng; KHÔNG getUserMedia — dùng `<input capture>`). Monochrome.
2. Persist scan event → activity layer (quyết: bảng scan_logs / community_events.event_data — design mai).
3. THÊM rate-limit (rate-limit.ts) — chặn cost-abuse Gemini (vision-lib bỏ qua budget $5).
4. Bù ash (ước ~7% hoặc thêm field) → tính carb NFE = 100-P-F-fibre-moisture-ash. Cân nhắc chuyển OCR sang responseSchema (chắc hơn text-parse).
→ Mai: thêm UI + persist + rate-limit + ash, KHÔNG build lại backend (đã có).

---
