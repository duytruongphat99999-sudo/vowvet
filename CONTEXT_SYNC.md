# CONTEXT SYNC — 2026-07-14

## 🐾 EPIC FOSTER ONBOARDING (phiên 2026-07-14, SW v344) — CODE XONG, verify HTTP XANH, chờ eyeball
**Mục tiêu**: TK mới chọn "nhận foster, chưa có bé" → KHÔNG bị ép thêm bé giả để qua onboarding. Dùng cờ `is_foster_carer` có sẵn, KHÔNG đụng schema, KHÔNG đẻ loại tài khoản.

**Đã làm (8 file)**:
- `api/src/routes/auth.ts` — **GATE FIX (mấu chốt)**: `/me` cũ tính `is_onboarded = pets.length>0` → mỗi lần gọi ký lại cookie ghi đè, đá foster 0-bé về /onboarding. Sửa `= pets.length>0 || onboarded===true`. + thêm `is_foster_carer` vào payload `/me`.
- `api/src/routes/users.ts` — endpoint mới `POST /users/onboard-foster`: guard `onboarded===false` (gọi lại → 409), set `onboarded=true`+`is_foster_carer=true`, **re-sign cookie**, KHÔNG tạo pet.
- `api/src/lib/users.ts` — helper `markOnboardedAsFoster` (1 updateRow, 2 field boolean).
- `web/src/pages/onboarding.astro` — thay 1 nút ép "Thêm bé" → **2 lựa chọn** ("Tôi có bé" → /pets/new cũ · "Tôi nhận foster" → gọi endpoint → dashboard) + inline script vanilla. Giữ Đăng xuất.
- `web/src/pages/dashboard.astro` — empty-state branch theo `is_foster_carer`: foster 0-bé → "Bạn chưa nhận bé nào" + nút /foster; chủ pet 0-bé → "thêm bé" như cũ.
- `web/src/lib/api-client.ts` — thêm `is_foster_carer?` vào `MeResponse`.
- `web/public/sw.js` — bump **v344-foster-onboarding**.
- Mục 3 (công tắc foster ở hồ sơ) **BỎ** — UI đã có sẵn `heroes/profile/[userId].astro:207`.

**Verify (21/21 hành vi PASS, HTTP thật + cookie thật trong container)**: fresh gate đá /onboarding · 2 lựa chọn render · endpoint 200 + 409 guard · **case 4b: /me 3 vòng KHÔNG lật is_onboarded, /dashboard không đá lại** · empty-state foster · login-lại OK (getIsOnboarded đọc field) · case 3 transfer→chủ + chat auto. (1 "fail" là assertion test check nhầm field `pet_id` — foster-received chỉ trả pet_name/handover_id; KHÔNG phải regression.)

**⚠️ CHƯA eyeball browser thật**: web prod (:4322) KHÔNG proxy `/api` (chỉ tunnel prod mới proxy) → client-fetch login/nút foster 404 ở localhost → không click-through browser local được. Đã verify qua HTTP thật (real SSR HTML + decode cookie). **Eyeball cuối trên `vowvet.monminpet.com`** (tunnel đã trỏ container mới rebuild = code này) do Duy.

**Quyết định kỹ thuật**: điểm sửa gate là `/me` (auth.ts:212), KHÔNG phải middleware (middleware chỉ đọc cookie; cookie do /me + login ký). `getIsOnboarded` (đọc field `onboarded`) đã được MỌI login endpoint dùng sẵn → fix 1 dòng ở /me là mắt xích thiếu duy nhất.

---

## 🎯 ĐANG LÀM GÌ (phiên trước — auth overhaul, đã xong)
Overhaul toàn bộ hệ đăng nhập VowVet: bỏ SĐT/OTP khỏi UI, chuyển sang **Google + Zalo**, admin nhận diện theo **email** thay vì SĐT. Giai đoạn này **đã hoàn tất** (PR #7→#14, tất cả merged + deployed + eyeball). Không còn việc code treo.

## ✅ ĐÃ XONG PHIÊN NÀY
- **#7 vá lỗ OTP lộ**: `api/src/routes/auth.ts` bỏ field `dev_otp` khỏi response `/request-otp`; `web/src/pages/login.astro` bỏ khối "Dev OTP". Mã OTP giờ chỉ ra log server.
- **#8 login gọn**: `login.astro` bỏ tab **Email + SĐT**, còn nút Google. SĐT ẩn nhưng vào được qua `/login?method=phone`. Backend email `/auth/email/*` giữ (còn dùng ở account/*).
- **#9→#11 Zalo Login OAuth v4 (QR)**:
  - `api/src/routes/auth-zalo.ts` (MỚI) — permission/token(PKCE+secret_key)/profile, state cookie HMAC. `api/src/index.ts` mount `/api/v1/auth/zalo`.
  - `api/src/lib/users.ts` — `findUserByZaloId` + `createUserViaZalo` (email/phone null, `auth_method` NULL). `web/src/pages/login.astro` thêm nút Zalo.
  - #10: bỏ `auth_method` khỏi payload (né single_select 400). #11: `shared/jwt.ts` `verifySession` nới cho token có `zalo_user_id` + 4 chỗ re-sign (auth.ts /me, onboarding.ts, users.ts, dev.ts) truyền `zalo_user_id`.
- **#12 admin theo EMAIL**: `shared/admin.ts` (MỚI) `isAdminIdentity(phone,email)`. Áp: `api/src/routes/{admin,auth,conversations,rewards}.ts` + `web/src/middleware.ts` + `web/src/env.d.ts` + 8 trang `web/src/pages/admin*.astro`.
- **#13 chat header**: `web/src/pages/messages/[id].astro` + `messages.astro` thêm `TopBar` (fetchMe → pet-jump + admin link), full-height restructure, giữ nút "← Quay lại".
- **#14 nhãn admin**: `messages/[id].astro` — `isAdminMsg` (sender ∉ member) → nhãn "Admin VowVet" (căn giữa/xanh).
- **Dọn user (Baserow, không code)**: `u28` (+84939233398) soft-delete; admin chuyển email-only (Duy sửa `.env`).
- SW bump lần cuối: **`vowvet-v343-admin-msg-label`**.

## 🚧 ĐANG DỞ
- **Không có việc code dở** — working tree clean (chỉ file CONTEXT_SYNC.md này đang viết lại).
- 1 commit local `d50eb1e` (docs CONTEXT_SYNC) **ahead origin/main, CHƯA push** (guard chặn push thẳng main → Duy tự push nếu muốn lên origin).

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **Zalo ZNS** (gửi OTP/thông báo THẬT): cần OA + tích vàng + duyệt template + ~300đ/tin. File liên quan: `api/src/lib/otp-sender.ts` (đã có toggle mock/zns_real qua `ZALO_MODE`), `.env` `ZALO_ZNS_*`. Chỉ cần nếu bật lại login SĐT cho user ngoài hoặc nhắc lịch qua Zalo.
2. **(tuỳ chọn) Chặn hẳn luồng phone-OTP login ở backend**: hiện còn (`auth.ts` `/request-otp|/verify-otp` + `/login?method=phone`), mới chỉ ẩn UI. Nếu làm → HỎI trước (đụng logic auth).
3. **(nếu muốn) push commit CONTEXT_SYNC lên origin** (Duy chạy tay).

## 📌 QUYẾT ĐỊNH KỸ THUẬT ĐÃ CHỐT
- **Admin = EMAIL-ONLY**: `ADMIN_PHONES=` rỗng, `ADMIN_EMAILS=vowvet.monminpet99@gmail.com`. `isAdminIdentity(phone,email)` = phone∈ADMIN_PHONES **OR** email∈ADMIN_EMAILS, exact match, đọc env mỗi lần. `u24` là admin (đã link Google, email đó).
- **User Zalo**: định danh THUẦN bằng `zalo_user_id`; email/phone = null; **`auth_method` để NULL** (né bẫy single_select Baserow 400).
- **verifySession nới CHỈ cho Zalo**: token không phone/email nhưng có `zalo_user_id` → hợp lệ. Google/phone giữ ràng buộc cũ.
- **Admin foster chat**: quyền ĐÃ CÓ (memberOrAdmin cho admin nhờ #12) → #14 **chỉ thêm nhãn display**, KHÔNG đổi gate.
- **Chat header**: dùng `TopBar` chung + `fetchMe` (giống dashboard). Layout full-height flex (TopBar / tin scroll / ô nhập).

## ⚠️ LƯU Ý / CẠM BẪY
- ⭐ **Admin CHỈ vào bằng Gmail `vowvet.monminpet99@gmail.com` — KHÔNG còn fallback SĐT.** Mất Gmail đó → cứu: thêm lại `ADMIN_PHONES=+84779029133` vào `.env` → force-recreate → login `/login?method=phone`.
- ⛔ **`shared/*` + `web/src/middleware.ts` + trang `.astro` BUNDLE vào web dist lúc `astro build`** → sửa mấy file này PHẢI **rebuild `vowvet-web` (`--build`)**, KHÔNG chỉ restart api (đã trả giá PR#11, #12).
- ⛔ **Đổi `.env` → `--force-recreate`** (không phải restart). Vừa đổi `.env` VỪA cần code mới → CẢ `--build` CẢ `--force-recreate`.
- ⛔ **Zalo callback phải có `/api/v1`** (tunnel: `/api/*`→api, `/*`→web). Thiếu → trúng web → lỗi.
- ⛔ **`auth_method` single_select**: thêm option mới phải làm ở Baserow UI TRƯỚC, không thì insert 400.
- ⛔ **Verify gián tiếp (log 302, mint-token, query Baserow) KHÔNG thay được test tận mắt browser** — nhiều lần tưởng xong mà lỗi ở tầng chưa test.
- **CẤM đụng**: `.env` (secret, Duy tự sửa); `/chat` telehealth (`api/src/lib/chat.ts` — hệ RIÊNG, khác foster/support); nutrition engine (`shared/nutrition-engine.ts`); schema Baserow (thêm field/option phải duyệt).

## 📂 FILE QUAN TRỌNG ĐÃ ĐỤNG
- `shared/admin.ts` — MỚI. `isAdminIdentity(phone,email)` — helper admin dùng chung api + web.
- `shared/jwt.ts` — `SessionPayload` có `zalo_user_id`; `verifySession` nới Zalo.
- `api/src/routes/auth-zalo.ts` — MỚI. Luồng Zalo OAuth v4 (login + callback).
- `api/src/lib/users.ts` — `findUserByZaloId`, `createUserViaZalo` (+ hàm google/phone cũ).
- `api/src/routes/auth.ts` — `/request-otp` (bỏ dev_otp), `/me` (`is_admin` = isAdminIdentity, re-sign giữ zalo).
- `api/src/routes/{admin,conversations,rewards}.ts` — gate admin dùng `isAdminIdentity`.
- `web/src/middleware.ts` — routing admin dùng `isAdminIdentity`.
- `web/src/pages/login.astro` — Google + Zalo, ẩn SĐT/Email.
- `web/src/pages/admin/*.astro` (8 trang) — gate admin dùng `isAdminIdentity`.
- `web/src/pages/messages/[id].astro` + `messages.astro` — chat TopBar + nhãn admin.
- `web/public/sw.js` — SW version (hiện `v343-admin-msg-label`).
- `.env` (gitignored) — `ADMIN_PHONES=` rỗng, `ADMIN_EMAILS=vowvet.monminpet99@gmail.com`, `ZALO_MODE=mock`.
