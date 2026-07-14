# CONTEXT SYNC — 2026-07-14 (AUTH OVERHAUL)

> File này viết đè bản cũ (đã STALE: còn ghi harness/master-template, foster chat #3/#4/#5,
> admin theo SĐT, repo public — TẤT CẢ đã đổi hoặc không còn là trọng tâm).
> Phiên này lột xác toàn bộ hệ đăng nhập: PR #7 → #14, đều merged + deployed + eyeball.
> HEAD main hiện tại: `8c60879` (Merge PR #14). SW `vowvet-v343-admin-msg-label`.

## ⭐ TỐI QUAN TRỌNG — đọc trước tiên
**Admin giờ CHỈ vào được bằng Gmail `vowvet.monminpet99@gmail.com` — KHÔNG còn fallback SĐT.**
- Đừng mất quyền truy cập Gmail đó. Đừng đổi email của `u24` trong Baserow.
- **Lỡ mất admin → cứu bằng:** sửa `.env` thêm lại `ADMIN_PHONES=+84779029133` → force-recreate api+web
  → login `/login?method=phone` với `+84779029133` (OTP đọc từ `docker logs vowvet-api | grep OTP`).

## Đã làm phiên này (PR #7 → #14)
- **#7**: vá lỗ OTP lộ — `dev_otp` không còn ra HTTP response/UI login, mã chỉ qua log server.
- **#8**: màn login gọn — bỏ tab Email + SĐT khỏi UI, còn Google (admin vào qua `/login?method=phone`).
- **#9 → #11**: thêm Zalo Login OAuth v4 (quét QR). Định danh bằng `zalo_user_id` (email/phone null).
  - #9 thêm luồng · #10 fix insert 400 (bỏ `auth_method` khỏi payload) · #11 fix session verify
    (verifySession từng vứt token không phone/email → thêm nhận Zalo).
- **#12**: admin nhận theo EMAIL (`ADMIN_EMAILS`) song song SĐT — helper `shared/admin.ts` `isAdminIdentity(phone, email)`.
  Áp cho 5 site api/middleware + 8 trang admin `.astro`.
- **#13**: chat foster/support thêm `TopBar` (trước navless, kẹt — user tưởng phải login lại).
- **#14**: tin admin trong chat có nhãn "Admin VowVet" (sender ∉ member → nhãn, căn giữa/xanh).

## Trạng thái auth hiện tại
- **Login UI**: 2 nút Google + Zalo. Luồng SĐT/OTP CÒN ở backend (`/api/v1/auth/request-otp|verify-otp`
  + `/login?method=phone`) nhưng ẩn UI + KHÔNG cấp quyền admin.
- **Admin = EMAIL-ONLY**: `ADMIN_PHONES=` (rỗng) · `ADMIN_EMAILS=vowvet.monminpet99@gmail.com`.
  `u24` là admin (đã link Google, email `vowvet.monminpet99@gmail.com`, còn giữ phone `+84779029133` trong DB
  nhưng phone KHÔNG còn cấp admin vì ADMIN_PHONES rỗng).
- **Users**: `u28` (`+84939233398`) đã SOFT-DELETE (rác SĐT). `u30` = tài khoản test Zalo ("Duy Trường Phát").
- **OTP**: `ZALO_MODE=mock` → mã chỉ ra log (`docker logs vowvet-api | grep OTP`), user ngoài KHÔNG nhận được.
  Gửi thật cần Zalo ZNS (chưa làm).
- **Repo**: đã chuyển **PRIVATE**.

## ⛔ BẪY ĐÃ TRẢ GIÁ PHIÊN NÀY (đọc kỹ — mất nhiều lượt vì mấy cái này)
- **`shared/*` + `web/src/middleware.ts` + trang `.astro` BUNDLE vào `vowvet-web` dist lúc `astro build`.**
  Sửa mấy file này → PHẢI **rebuild** `vowvet-web` (`up -d --build vowvet-web`), KHÔNG chỉ `restart` api.
  Chỉ restart api = web vẫn chạy dist CŨ → **lỗi ngầm khó thấy** (trả giá ở Zalo PR#11 + admin-email PR#12).
  `shared/jwt.ts`, `shared/admin.ts` dùng ở CẢ api (bind-mount, restart đủ) LẪN web (bundle, phải rebuild).
- **Đổi `.env` → `--force-recreate` (không phải restart).** Nhưng force-recreate KHÔNG rebuild dist →
  vừa đổi `.env` VỪA cần code mới thì phải CẢ `--build` CẢ `--force-recreate`.
- **Zalo callback PHẢI có `/api/v1`** (`.../api/v1/auth/zalo/callback`). Cloudflare tunnel route `/api/* → api`,
  `/* → web`. Callback thiếu `/api/v1` → trúng web container → lỗi.
- **`auth_method` single_select Baserow**: thêm option mới phải làm trong Baserow UI TRƯỚC, không thì insert HTTP 400.
  (Đã né bằng cách để `auth_method` NULL cho user Zalo — xem `createUserViaZalo`.)
- **BÀI HỌC LỚN**: verify gián tiếp (log 302, mint-token, query Baserow) KHÔNG thay được **test tận mắt trên browser**.
  Nhiều lần tưởng xong mà thực tế lỗi ở tầng chưa test (điển hình PR#11: mint-token PASS ở API nhưng web dist cũ
  vẫn vứt session → browser vẫn fail).

## Việc treo cho phiên sau
- **Zalo ZNS** (gửi OTP/thông báo thật): chưa làm. Cần OA + tích vàng + duyệt template + ~300đ/tin.
  Chỉ cần nếu bật lại login SĐT cho user ngoài, hoặc muốn nhắc lịch qua Zalo.
- **(tuỳ chọn) Chặn hẳn luồng phone-OTP login ở backend**: hiện còn (route + `/login?method=phone`), chỉ ẩn UI.

## Neo file quan trọng (đụng phiên này)
- `shared/admin.ts` — `isAdminIdentity(phone, email)` (helper admin dùng chung api + web).
- `api/src/routes/auth-zalo.ts` — Zalo OAuth v4 (permission/token/profile, PKCE, state cookie HMAC).
- `shared/jwt.ts` — `SessionPayload` có `zalo_user_id`; `verifySession` nới cho Zalo.
- `api/src/routes/{admin,auth,conversations,rewards}.ts` — admin check dùng `isAdminIdentity`.
- `web/src/middleware.ts` + `web/src/pages/admin/*.astro` — routing/gate admin dùng `isAdminIdentity`.
- `web/src/pages/messages/[id].astro` + `messages.astro` — chat TopBar + nhãn admin.
- `.env` (gitignored) — `ADMIN_PHONES=` (rỗng), `ADMIN_EMAILS=vowvet.monminpet99@gmail.com`, `ZALO_MODE=mock`.
