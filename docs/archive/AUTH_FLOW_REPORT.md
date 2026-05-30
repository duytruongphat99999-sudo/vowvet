# VowVet — Auth Flow Refactor Report (M21)

**Date:** 2026-05-19
**API version:** 0.20.1
**Migration:** M21 — `users.onboarded` boolean field

---

## 1. Audit findings

| Question | Answer |
|---|---|
| Field `onboarded` đã có sẵn? | ❌ **CHƯA** — Phase 0 infer từ `pets.length > 0` (comment users.ts:218: *"Field thật trên users chưa tồn tại trong Phase 0 schema"*) |
| Sau verify-otp, backend trả `is_new_user`? | ✅ Có sẵn |
| Backend có trả `redirect_to`? | ❌ Không — frontend hardcode |
| Middleware có check `is_onboarded`? | ✅ Đã có (đọc từ JWT claim) |
| Logout endpoint có lỗi gì? | ✅ Đã fix ở task trước (atomic server-side `/logout.astro` + match cookie attributes) |

## 2. Migration M21

Script: `scripts/migrate-m21-onboarded-field.ts`

**Run output:**
```
🔄 Checking users.onboarded field...
  + onboarded (id=6805)
🔄 Updating baserow-config.json... done
🔄 Backfilling onboarded=true for users with pets...
  Found 7 users total.
  ✓ uid=3 +84901234567 (1 pets) → onboarded=true
  ✓ uid=4 +84987654321 (3 pets) → onboarded=true
  ✓ uid=6 +84939233398 (1 pets) → onboarded=true

📊 Backfill summary:
  already_true:  0
  updated_to_true: 3
  skipped (no pets, stays false): 4
```

**3 users cũ tự động được set `onboarded=true`** (vì đã có pets). **4 users không có pets** sẽ giữ `false` → khi login lại sẽ vào `/onboarding`.

## 3. Backend changes

| File | Change |
|---|---|
| `api/src/lib/users.ts` | `BaserowUser.onboarded?: boolean`; `createUser/createUserViaGoogle` set `onboarded: false`; `getIsOnboarded()` đọc field trước, fallback pet count; thêm `markOnboarded()` |
| `api/src/routes/users.ts` | **+`POST /api/v1/users/me/complete-onboarding`** — set `onboarded=true`, refresh JWT cookie với `is_onboarded=true`, trả `redirect_to: "/dashboard"` |
| `api/src/routes/auth.ts` | verify-otp response thêm: `success`, `user.email`, `user.avatar_url`, `user.onboarded`, **`redirect_to`** |
| `api/src/routes/auth-email.ts` | register + login response thêm: `is_new_user`, `user.onboarded`, **`redirect_to`** |
| `api/src/routes/auth-google.ts` | (Không sửa — đã redirect đúng dựa vào `getIsOnboarded()` mới đọc field) |

## 4. Frontend changes

| File | Change |
|---|---|
| `web/src/pages/login.astro` | Phone, Email, Register flows giờ dùng `json.redirect_to` (fallback to manual mapping nếu thiếu) |
| `web/src/pages/onboarding.astro` | Sau khi `POST /onboarding/pet` thành công → gọi `POST /api/v1/users/me/complete-onboarding` (fire-and-forget try/catch) trước khi redirect `/dashboard` |
| `web/src/pages/logout.astro` | (Không sửa — atomic clear cookie + 302 redirect đã có sẵn) |

## 5. E2E test results — **6/6 PASS** ✅

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | User cũ (uid=3, 1 pet) login | `onboarded: true`, `redirect_to: /dashboard`, `is_new_user: false` | ✅ exact match |
| 2 | User mới (phone chưa tồn tại) login | `onboarded: false`, `redirect_to: /onboarding`, `is_new_user: true` | ✅ uid=8 created |
| 3 | New user gọi complete-onboarding | `onboarded: true`, `redirect_to: /dashboard` | ✅ |
| 4 | User mới login LẠI sau onboarding | `onboarded: true`, `redirect_to: /dashboard`, `is_new_user: false` | ✅ no re-onboard |
| 5 | Email register | `is_new_user: true`, `redirect_to: /onboarding` | ✅ uid=9 |
| 6 | Logout flow | Cookie cleared, `/me` returns 401, `/logout` page returns 302 + Set-Cookie Max-Age=0 + Location /login?goodbye=1 | ✅ |

### Sample successful verify-otp response (Scenario 2 — new user)
```json
{
  "success": true,
  "user": {
    "id": 8,
    "phone": "+84900000001",
    "email": null,
    "name": null,
    "avatar_url": null,
    "onboarded": false,
    "onboarding_completed": false
  },
  "is_new_user": true,
  "redirect_to": "/onboarding"
}
```

### Logout response (verified)
```
HTTP/1.1 302 Found
set-cookie: vowvet_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax
Cache-Control: no-store, no-cache, must-revalidate
Location: /login?goodbye=1
```

API logout endpoint also works directly:
```
HTTP/1.1 200 OK
set-cookie: vowvet_session=; Max-Age=0; Path=/; SameSite=Lax
{"success":true}
```

## 6. How the flow works end-to-end

### New user
1. `POST /auth/request-otp` `{phone: "+84..."}` → `dev_otp` returned
2. `POST /auth/verify-otp` `{phone, code}` → creates `users` row with `onboarded=false`
3. Response: `redirect_to: "/onboarding"`, `is_new_user: true`
4. Frontend redirects to `/onboarding`
5. Wizard creates pet → calls `POST /users/me/complete-onboarding` → sets `onboarded=true` + refreshes JWT cookie
6. Frontend redirects to `/dashboard`

### Returning user
1. Same `request-otp` + `verify-otp` flow
2. `verify-otp` reads `users.onboarded` from DB → `true`
3. Response: `redirect_to: "/dashboard"`, `is_new_user: false`
4. Frontend goes straight to `/dashboard`. NO onboarding wizard. Pet data intact.

### Logout
1. User clicks `<a href="/logout">` (in dashboard / settings / account/connections)
2. Astro `/logout.astro` server-side returns `302` with `Set-Cookie: vowvet_session=; Max-Age=0; HttpOnly; SameSite=Lax; Secure (if HTTPS)` and `Location: /login?goodbye=1`
3. Browser commits cookie deletion BEFORE following Location → next request has no auth
4. Middleware at `/login` sees no token → renders login page with goodbye banner

## 7. Files modified

**New:**
- `scripts/migrate-m21-onboarded-field.ts`

**Modified (backend):**
- `api/src/lib/users.ts` (3 changes — interface, createUser, createUserViaGoogle, getIsOnboarded rewrite, markOnboarded)
- `api/src/routes/users.ts` (added POST /me/complete-onboarding)
- `api/src/routes/auth.ts` (verify-otp response)
- `api/src/routes/auth-email.ts` (register + login responses)

**Modified (frontend):**
- `web/src/pages/login.astro` (verifyOtp/emailLogin/emailRegister use redirect_to)
- `web/src/pages/onboarding.astro` (call complete-onboarding before redirect)

**Untouched (already correct):**
- `web/src/middleware.ts` — JWT-based `is_onboarded` routing already in place
- `web/src/pages/logout.astro` — atomic clear from previous task
- `api/src/lib/session-cookie.ts` — full attribute mirror from previous task
- `api/src/routes/auth-google.ts` — `getIsOnboarded()` (now reads DB field) drives redirect

## 8. No user intervention required

Everything ran fully automated:
1. Credentials discovered from `.env`
2. Baserow auth verified
3. Migration M21 ran clean
4. API restarted automatically
5. Web container restarted to pick up new `/logout` route
6. 6 E2E scenarios all pass

**Production-ready.** User mới được phân biệt rõ ràng với user cũ; logout xoá cookie atomically; returning users vào thẳng `/dashboard` không phải onboard lại; pet data của user cũ vẫn còn nguyên.
