# VowVet — Login UX Refactor Report

**Date:** 2026-05-19
**API version:** 0.20.1
**Goal:** Cho user CŨ không phải đợi OTP, ưu tiên Email/Password + Google

---

## 1. Audit findings

**Users table snapshot (9 users):**
| Metric | Count |
|---|---|
| Total users | 9 |
| Có `email` field | 2 |
| Có `password_hash` (đã set password) | 2 |
| Có `google_oauth_id` (đã link Google) | 0 |
| `onboarded=true` | 4 |
| **CHỈ có phone, không email/google** | **7** ← cần suggest setup |

**Detail:**
```
id=3 -- -- -- ONB phone=+84901234567 (now has password after E2E test)
id=4 -- -- -- ONB phone=+84987654321
id=6 -- -- -- ONB phone=+84939233398
id=8 -- -- -- ONB phone=+84900000001 (test user)
id=7 PW EM -- ---  email=smoketest_2026@vowvet.test
id=9 PW EM -- ---  email=test_1779160075@vowvet.test
```

**Status check:**
- ✅ `users.password_hash` field đã tồn tại (M20-auth migration)
- ✅ Endpoint `POST /api/v1/auth/email/set-password` đã build sẵn (M20-auth)
- ❌ Frontend `/account/setup-password.astro` chưa có → tạo mới
- ❌ Tab order trong `/login` cũ (Phone first) → reorder Email first
- ❌ Verify-otp không suggest setup → thêm logic

## 2. Migration cần không?

**KHÔNG cần migration mới.** Schema `users.password_hash` + `email` + `auth_methods` + `email_verified` đã được M20-auth backfill từ trước. Chỉ cần update logic + UI.

## 3. Endpoint `/api/v1/auth/setup-password` đã có?

**Đã có dưới tên `/api/v1/auth/email/set-password`** (M20-auth). Signature:
- `POST` (auth required)
- Body: `{ password: string, email?: string }`
- Logic: Validate, dùng `email` query (or existing user.email), check uniqueness, hash với `Bun.password.hash(p, {algorithm:"argon2id"})`, set `auth_methods` thêm "email", update DB
- Response: `{ success: true, email }`

→ Tái sử dụng, KHÔNG tạo endpoint mới.

## 4. E2E test — **6/6 PASS** ✅

| # | Scenario | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | User cũ (phone, onboarded, no pw) login OTP | `redirect_to: /account/setup-password`, `suggest_setup_password: true`, `has_password: false` | matches exactly | ✅ |
| 2 | Same user POST `/auth/email/set-password` | `{success: true, email}` | matches | ✅ |
| 3 | POST `/auth/logout` | 200 + `Set-Cookie: ...Max-Age=0...` | matches | ✅ |
| 4 | Login bằng email+password (KHÔNG OTP) | `redirect_to: /dashboard`, `success: true` | matches, uid=3 | ✅ |
| 5 | `/me` với cookie email login | 200 + full user + pets | matches | ✅ |
| 6 | Login OTP lại sau đã có password | `redirect_to: /dashboard`, `suggest_setup_password: false`, `has_password: true` | matches | ✅ |

## 5. Files modify + new

**Backend:**
- `api/src/routes/auth.ts` (MOD) — verify-otp response thêm `has_password`, `has_google`, `suggest_setup_password`; `redirect_to` logic: `/account/setup-password` nếu onboarded + no password + no google

**Frontend:**
- `web/src/pages/account/setup-password.astro` (NEW) — form email + password mới, validate inline, dùng `/auth/email/set-password`, có nút "Skip 30 ngày" (lưu localStorage `vv_setup_password_skipped_at`)
- `web/src/pages/login.astro` (MOD):
  - Tab order MỚI: **Email → Google → SĐT**
  - Default tab = `localStorage.vv_last_login_method` || `"email"`
  - Hint "💡 Lần đầu? Đăng nhập SĐT trước, rồi setup email+mật khẩu" hiện khi tab Email + chưa có last_method
  - Sau verify-otp/email-login/email-register, lưu `vv_last_login_method`
  - `resolveRedirect()` honor backend `redirect_to`, bypass `/account/setup-password` nếu user skip recent (< 30d)
- `web/src/pages/dashboard.astro` (MOD) — banner xanh "✅ Đã setup email + mật khẩu" khi URL `?setup=success`
- `web/src/middleware.ts` (MOD) — `/account/*` (trừ `/account/reset-password` đã public) yêu cầu auth

## 6. UX flow cuối — user cũ login chỉ **1 click** sau setup

### Trước (cũ — phiền):
1. Mở `/login`
2. Chọn tab SĐT
3. Nhập SĐT
4. Tail `docker logs vowvet-api` để lấy OTP
5. Paste OTP vào form
6. Click "Xác nhận"
→ Vào dashboard

**6 steps, ~2 phút.**

### Sau (mới — 1-time setup, sau đó dễ):

**Lần đầu (chỉ làm 1 lần):**
1. Login OTP như cũ (5 steps)
2. Backend tự redirect `/account/setup-password`
3. Nhập email + password (8 ký tự + chữ + số)
4. Click "Lưu"
→ Vào dashboard với banner success

**Lần sau:**
1. Mở `/login` — tab Email đã active (default + localStorage remember)
2. Nhập email + password (browser autofill OK với `autocomplete="current-password"`)
3. Click "Đăng nhập"
→ Vào dashboard

**2 inputs + 1 click, ~5 giây.**

Hoặc dùng Google OAuth 1-click (đã có sẵn từ M8).

### Backup luôn còn:
- User vẫn có thể login bằng SĐT OTP (tab SĐT vẫn còn ở vị trí 3)
- `auth_methods` field track tất cả phương thức user đã setup
- Reset password qua email (mock console log) qua `/account/reset-password`

## 7. localStorage keys mới

| Key | Purpose | TTL |
|---|---|---|
| `vv_last_login_method` | "email" \| "google" \| "phone" — default tab khi mở /login lần sau | ∞ (cleared on browser data clear) |
| `vv_setup_password_skipped_at` | Timestamp (ms) khi user click "Skip" trên setup page | 30 ngày auto-bypass |

## 8. Restart hoàn tất

```
docker compose restart vowvet-api vowvet-web   ✅
GET /api/v1/health   {"status":"ok","services":{"baserow":"ok","r2":"ok"}}   ✅
GET /login           HTTP 200                                                ✅
GET /account/setup-password (no auth) → HTTP 302 → /login                    ✅
```

## 9. Migration backfill

**Không cần migration mới.** Schema đầy đủ từ M20-auth.

3 users cũ (uid 4, 6, 8) vẫn chỉ có phone — lần đăng nhập tiếp theo họ sẽ được prompt setup. uid=3 đã setup trong E2E test.

## 10. Production-ready

Không có user intervention required. Mọi flow hoạt động trong sandbox docker, sẵn sàng deploy.

**Demo flow để test trực tiếp:**
1. `https://vowvet.monminpet.com/login` → tab Email mặc định
2. Nếu là user cũ chưa setup: dùng SĐT OTP → tự redirect setup-password page
3. Setup xong → dashboard
4. Logout → login lại bằng email/password = 1 click thực sự
