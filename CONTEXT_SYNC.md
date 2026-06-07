# CONTEXT SYNC — 2026-06-07 09:32

> Định dạng handoff gọn (ghi đè format log cũ theo yêu cầu). **Lịch sử chi tiết 655 dòng nhiều phiên trước VẪN CÒN trong git commit `a9bb6ae`** — `git show a9bb6ae:CONTEXT_SYNC.md` nếu cần.
> STATE: HEAD `80f842b` · SW `vowvet-v290-bottomnav-reorder` · **+21 commit local, CHƯA push** (repo không có remote).

## 🎯 ĐANG LÀM GÌ
App-shell hóa VowVet thành trải nghiệm kiểu app điện thoại (tham chiếu URSkinCoach): dựng **bottom-nav cố định** + chuẩn hóa **design-system** (icon FeatureIcon, palette gold/ink/cream theo §9, hierarchy). Giai đoạn này tập trung điều hướng + bề mặt trang Dinh dưỡng. Tất cả local-only.

## ✅ ĐÃ XONG PHIÊN NÀY
- **Design-system /food-brands** (`c4b23ef`, v288) — `web/src/pages/food-brands.astro` + `FeatureIcon.astro`: emoji→FeatureIcon (cat/dog/sun/+moon mới/sparkles/alert-triangle); bỏ **emerald**→gold/ink (§9); hierarchy (giá/gram bold ink · thanh tương thích xám · mismatch dịu amber "Lưu ý"); MonMin name to/đậm gold-deep; affordance gập (hover + "Xem/Thu gọn"); filter read-only gập "(chỉ xem)" khi locked; header `<img>`→`<Logo>`.
- **Bottom-nav app-style** (`3fe0eb2`, v289) — `BottomNav.astro` MỚI + `Layout.astro` (gắn sau `<slot/>` + gate + `viewport-fit=cover`) + `global.css` (`.has-bottom-nav` padding + safe-area) + `FeatureIcon.astro` (+scan/+chart).
- **Đổi thứ tự bottom-nav** (`80f842b`, v290) — `BottomNav.astro` + `sw.js`: 5 ô **Trang chủ · Định vị pet (coming-soon) · Tìm bạn chơi (ô giữa nổi, /playdate) · Vaccine · Tôi**. BỎ ô "Dinh dưỡng" + nút "Quét nhãn hạt" deep-link cũ. Verify DOM mobile + desktop OK, console sạch.
- **Context save** (`a9bb6ae`) — cập nhật log chi tiết cũ trước khi reorder.

## 🚧 ĐANG DỞ
- KHÔNG có việc dở giữa chừng. v290 đã commit + verify đầy đủ (5 ô đúng, routes đúng, gate giữ, desktop ẩn, console sạch). Working tree sạch (chỉ `.claude/launch.json` untracked — preview config, không commit).

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **Mạch 2 — Quét nhãn CAMERA thật**: hiện chưa có getUserMedia; tạo route `/scan` hoặc input-capture + API OCR (Gemini vision). Kèm: nút/ô "Quét" + auto-mở scanner trong food-brands (thêm hash-handler `#smart-scanner`). File: `food-brands.astro` (+ có thể route mới).
2. **Trang "Định vị pet" (GPS)**: hiện là coming-soon trong nav → build page thật (chưa có `/track`/`/locate`). Khi xong: đổi `<button>` Định vị trong `BottomNav.astro` thành `<a href>`.
3. **AppHeader chuẩn hóa**: thay header/nav rời ở các trang (food-brands, pets/[id]…) bằng 1 component dùng chung (đại phẫu nhiều trang — chờ Bồ chốt scope).
4. **Dọn emoji/emerald còn sót /food-brands** (cụm sau): bcsAvatar 😿😸😾🎈🦴+✨ (CẤM ĐỤNG hiện tại) · env tier 🧬🏢💧🌫️🦠 · breedSticker 29 emoji · `:946` ⚠️ ingredient-guard. + emerald bcsAvatar `:1761`.
5. **Backup/push**: kéo `C:\docker\backups\vowvet-20260606-2348.bundle` lên cloud · xoá temp clone `C:\docker\backups\_ct2348` (tay) · cân nhắc tạo remote private (21 commit chưa push).

## 📌 QUYẾT ĐỊNH KỸ THUẬT ĐÃ CHỐT
- **DER engine `shared/nutrition-engine.ts` = CHÂN LÝ duy nhất.** Chỗ khác gọi về engine, KHÔNG tính song song. KHÔNG đụng số/công thức khi chưa có TASK + Bồ duyệt số.
- **Bottom-nav đặt 1 lần ở `Layout.astro`** (sau `<slot/>`) → phủ mọi trang. **GATE** = đã login AND không (landing `/`/login/onboarding/offline + error qua **`Astro.routePattern` `/404`,`/500`** + public `/p/ /memorial/ /personality-card/`). ⚠️ Dùng `Astro.routePattern` chứ KHÔNG `Astro.response.status` (status đọc 200 trong Layout, adapter set 404 SAU render).
- **Scoped style Astro `[data-astro]` specificity > Tailwind** → muốn `lg:hidden`/`print:hidden` cho element có scoped style phải viết `@media` **TRONG** `<style>` scoped (đã làm cho `.vv-bottomnav`).
- **petId**: `BottomNav` fetch `/api/v1/auth/me` client-side (`credentials:include`, pattern TopBar) → `primaryPet = pets[0]`. Chưa có pet → fallback `/dashboard`.
- **"Định vị pet" chưa build → `<button>` coming-soon** (toast "sắp có"), TUYỆT ĐỐI không trỏ route chết.
- **Icon = FeatureIcon line-art** (24×24, stroke 1.5, currentColor), KHÔNG emoji. bcsAvatar/breedSticker emoji = GIỮ (cụm sau).
- **§9 cấm màu**: emerald/purple/navy → gold/ink/cream. Đỏ chỉ cho cảnh báo/xóa.
- **Nhãn AI trung tính** ("AI của VowVet"), KHÔNG lộ Gemini/Claude. Tính năng Google-search KHÔNG gắn nhãn "AI".

## ⚠️ LƯU Ý / CẠM BẪY
- **Mount Win→Linux KHÔNG hot-reload `.astro`** → `docker restart vowvet-web` sau khi sửa. `.env` đổi → `--force-recreate`. File tĩnh (sw.js) cập nhật ngay.
- **`<script is:inline>` = JS THUẦN** (không TS `as`/`:type`) → `node --check` (hoặc `new Function(body)`) mỗi lần sửa, else Alpine chết câm.
- **Headless preview KHÔNG chạy `requestAnimationFrame`** → Alpine `x-transition:enter` (motion-safe) **kẹt** ở `opacity-0/display:none` → collapse "không mở" TRONG PREVIEW = **KHÔNG phải bug** (real browser chạy RAF → mở OK). Verify open-state phải bypass transition thủ công. Toast dùng x-show thuần (không x-transition) để né.
- **Cookie `vowvet_session` HttpOnly** → khi browser đã có session, JS `document.cookie=` KHÔNG set đè được (test cookie thường thì set được). Verify dùng session authed sẵn.
- **Bump `web/public/sw.js` VERSION (`vXXX`) mỗi release UI** (cacheFirst .css/.js → dễ stale). **KHÔNG `git push`** trừ khi Duy yêu cầu. Secret-scan theo VALUE (`sk-`/`AIza`/`eyJ...`) trước commit.
- **MSYS path**: `docker exec ... /app` bị git-bash đổi path → prefix `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`.
- **CẤM ĐỤNG (trừ khi TASK ghi rõ)**: số/gram/kcal/DER/scoring/mismatch-logic/ngưỡng carb · schema/data Baserow · `api/` (write) · `Layout.astro` gate · `global.css` token · TopBar dashboard.
- Account test: pet **min id 12** (user **10**) Mèo, BCS=null→ideal, DER 234/45/83. `lyvu2004DTP@gmail.com` user 18 (Google) — `/dev/reset-onboarding` reset vô hạn.

## 📂 FILE QUAN TRỌNG ĐÃ ĐỤNG
- `web/src/components/BottomNav.astro` — nav 5 ô app-style (MỚI phiên này; petId fetch, active SSR, ô giữa nổi, toast coming-soon).
- `web/src/layouts/Layout.astro` — render `<BottomNav/>` sau `<slot/>` + `showBottomNav` gate (routePattern) + `body.has-bottom-nav` + viewport `viewport-fit=cover`.
- `web/src/styles/global.css` — `.has-bottom-nav { padding-bottom: calc(4rem + env(safe-area-inset-bottom)) }` + desktop/print override.
- `web/src/components/FeatureIcon.astro` — thêm icon line-art `moon` `scan` `chart` (dùng: home/map-pin/scan/syringe/user cho nav).
- `web/src/pages/food-brands.astro` — design-system unify (FeatureIcon/palette/hierarchy/affordance/filter-collapse/Logo). KHÔNG đụng số/scoring.
- `web/public/sw.js` — `VERSION = "vowvet-v290-bottomnav-reorder"` (L17).
- `shared/nutrition-engine.ts` — CANONICAL DER (CẤM đụng số).
