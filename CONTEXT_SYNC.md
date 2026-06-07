# CONTEXT SYNC — 2026-06-07 11:49

> Định dạng handoff gọn. **Lịch sử log dài (685 dòng) đã archive ở `CONTEXT_SYNC_FULL_20260606.md`** (từ commit `a9bb6ae`) — đọc file đó nếu cần chi tiết các phiên trước.
> STATE: HEAD `579c058` · SW `vowvet-v291-shoppable-brand` · repo **LOCAL-ONLY (không remote), 126 commit, CHƯA push**.

## 🎯 ĐANG LÀM GÌ
App-shell hóa VowVet (kiểu app điện thoại) + thương mại hóa trang Dinh dưỡng. Phiên này hoàn tất **Shoppable v1**: card food_brands hiện ảnh sản phẩm thật + nút "Xem sản phẩm" mở tab mới, dùng 2 field `image_url`/`product_url`. Tất cả local-only.

## ✅ ĐÃ XONG PHIÊN NÀY (Shoppable v1 — DONE + verified end-to-end)
- **Field Baserow** (Duy tạo TAY trong UI): `image_url`=7435, `product_url`=7436 (type **url**) trên table `food_brands` (648). Script KHÔNG tạo field.
- **Sync script** `scripts/brand-shoppable-sync.ts` (MỚI): 2 phase — `--export` (mặc định, fetch rows → CSV) / `--apply` (đọc CSV → PATCH). **Idempotent · anti-clobber (bỏ ô trống, chỉ PATCH khi khác) · DRY-RUN mặc định, cần `--write` mới ghi · match theo row_id**. Reuse `shared/baserow.ts` (Token, user_field_names) + JWT inline cho list-fields.
- **Loader** `api/src/lib/nutrition.ts`: +`image_url`/`product_url` passthrough (3 chỗ: 2 interface + flatBrand, null-safe). KHÔNG đụng số.
- **Card** `web/src/pages/food-brands.astro` (lớp **Alpine x-for**): ảnh `<img object-cover>` khi có `image_url` + `@error`→placeholder; nút "Xem sản phẩm" (`template x-if=b.product_url`, bg ink/chữ trắng, FeatureIcon `shop`, `target=_blank rel=noopener noreferrer`). Áp mọi brand. `baserow-config.json` +2 field ID. SW `v290`→`v291`.
- **Data test** đã ghi Baserow (`--apply --write`): row 3 (Mon Min Dry Dog Premium) `vetrimax-kc.png` + `san-pham/vetrimax-kc`; row 4 (Mon Min Wet Cat Pate) `og-default.svg` + `san-pham/`. **CẢ row 3 + row 4 đều là data TEST** (vetrimax-kc.png lẫn og-default.svg) — swap cả 2 sang ảnh + link sản phẩm thật sau.
- **Verify browser thật**: cả 2 card MonMin ảnh **load + visible** + nút href đúng + badge "MON MIN" nguyên + sort đầu; non-MonMin = placeholder + không nút (graceful). Console sạch.
- Commit: `69220fd` (shoppable) + `579c058` (context+archive).

## 🚧 ĐANG DỞ
- KHÔNG có việc dở. v291 commit + verify đủ. Working tree sạch (chỉ `.claude/launch.json` untracked — preview config).

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **Swap data thật**: **row 3 + row 4 đều đang là data TEST** → thay cả 2 sang ảnh + product_url sản phẩm thật. Điền `image_url`/`product_url` cho các brand còn lại qua CSV + `--apply --write` (MonMin→monminpet; ngoại→listing Shopee/Lazada).
2. **Webview in-app MonMin (v2 fast-follow)**: NẾU verify `X-Frame-Options`/CSP `monminpet.com` cho nhúng iframe → mở in-app; Shopee/Lazada chặn → giữ `target=_blank`.
3. **Mạch 2 — Quét nhãn CAMERA thật**: getUserMedia + OCR (Gemini vision); route `/scan` hoặc input-capture + auto-mở scanner (`#smart-scanner`).
4. **Mạch 4 — Nhật ký sản phẩm pet**: lưu sữa tắm/xịt/ăn → cảnh báo kích ứng + truy nguồn. **[đụng schema Baserow → recon + duyệt field TRƯỚC khi tạo]**.
5. **PDF hồ sơ pet** trích **DATA** (KHÔNG screenshot DOM) — template print ở `pets/[id]`.
6. **Trang "Định vị pet" (GPS)**: hiện coming-soon trong bottom-nav → build page thật, rồi đổi `<button>` → `<a href>`.
7. **AppHeader chung**: gộp header rời nhiều trang (chờ Bồ chốt scope).
8. **ADOPT EPIC** (roadmap riêng, **recon từ đầu**): ưu tiên transfer ownership + adoption cert PDF + lost&found QR; marketplace/shelter sau.
9. **Dọn nốt**: bcsAvatar/breedSticker + env emoji → FeatureIcon · nudge messages (`api` nutrition.ts) · 4 pet migrate `"moderate"` · nước 50 vs 55.
10. **Backup**: upload `vowvet-<ts>.bundle` lên cloud (agent không có quyền cloud) · cân nhắc remote private (126 commit chưa push).

## 📌 QUYẾT ĐỊNH KỸ THUẬT ĐÃ CHỐT
- **DER engine `shared/nutrition-engine.ts` = CHÂN LÝ.** KHÔNG đụng số/công thức khi chưa có TASK + Bồ duyệt số. **Loader `api/src/lib/nutrition.ts` ≠ engine** — chỉ DB/cache/passthrough. (Deny rule giờ chỉ chặn `Edit(**/nutrition-engine.ts)`, loader sửa được.)
- **public.ts trả full object (spread, KHÔNG whitelist)** → thêm field ở `flatBrand` là tự chảy loader→public→SSR→Alpine, KHÔNG cần sửa public.ts.
- **Field shoppable = tạo TAY ở Baserow UI** (type url). Script chỉ verify + ghi value; thiếu field → STOP.
- **Nút shoppable v1 = mở tab mới** (`target=_blank rel=noopener noreferrer`), `product_url` theo record (không hard-code), áp mọi brand. CTA "Đổi sang giải pháp MonMin" (`monMinSwapUrl` hard-code `/sanpham`) là feature KHÁC — giữ riêng.
- **Bottom-nav** đặt 1 lần ở `Layout.astro` (sau `<slot/>`), gate bằng `Astro.routePattern` (KHÔNG dùng response.status).

## ⚠️ LƯU Ý / CẠM BẪY
- **Sync script chạy HOST**: `BASEROW_URL=http://localhost:8888 bun run scripts/brand-shoppable-sync.ts [--apply [--write]]` (host KHÔNG có `host.docker.internal`). Bun **tự nạp `.env`** (token/creds) — KHÔNG hardcode, KHÔNG in token.
- **Sửa loader/api → `docker restart vowvet-api`** (busts brandsCache 24h + nạp code). `.astro` → `docker restart vowvet-web`. `.env` → `--force-recreate`. `sw.js` cập nhật ngay nhưng phải **bump vXXX**.
- **Preview screenshot subsystem timeout** trên `/food-brands` (page nặng) → verify bằng **computed-style/DOM eval** (chính xác hơn ảnh cho img/style). Preview CÓ internet (ảnh monminpet load thật). Inject data qua `preview_eval` = ephemeral.
- **Default filter `/food-brands`** lọc theo species của profile (vd cat) → brand dog ẩn ở view mặc định = **đúng hành vi, không bug**.
- `<script is:inline>` = JS thuần → `node --check`. Headless preview không chạy rAF → `x-transition` kẹt = không phải bug.
- **Bundle `*.bundle` đã gitignore** — file backup rời, KHÔNG commit, USER tự upload cloud.
- Account test: pet **min id 12** (user 10) Mèo; `lyvu2004DTP@gmail.com` user 18 (Google) — `/dev/reset-onboarding` reset vô hạn.
- **CẤM ĐỤNG** (trừ khi TASK ghi rõ): số/gram/kcal/DER/scoring/carb-mismatch · schema/field Baserow · `shared/nutrition-engine.ts` · `Layout.astro` gate · `global.css` token.

## 📂 FILE QUAN TRỌNG ĐÃ ĐỤNG
- `scripts/brand-shoppable-sync.ts` — export/apply CSV↔Baserow (idempotent, anti-clobber, dry-run default).
- `scripts/data/brand-shoppable.csv` — data fill (row 3+4 done; còn lại trống).
- `api/src/lib/nutrition.ts` — LOADER +image_url/product_url passthrough (KHÔNG số).
- `web/src/pages/food-brands.astro` — card ảnh + nút "Xem sản phẩm" (Alpine x-for).
- `baserow-config.json` — +`image_url`=7435 / `product_url`=7436.
- `web/public/sw.js` — `VERSION = vowvet-v291-shoppable-brand`.
- `shared/nutrition-engine.ts` — CANONICAL DER (CẤM số).
- `CONTEXT_SYNC_FULL_20260606.md` — archive log dài (685 dòng).
