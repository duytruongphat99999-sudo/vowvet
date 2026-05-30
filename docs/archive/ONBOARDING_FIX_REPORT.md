# VowVet — Onboarding Fix Report (Bug 1 + Bug 2)

**Date:** 2026-05-19
**API version:** 0.20.1

---

## Audit kết quả

### Số file onboarding

| File | Tồn tại | Status |
|---|---|---|
| `web/src/pages/onboarding.astro` | ✅ | **REWRITE** (đã giảm từ ~330 dòng xuống ~170 dòng, single-flow) |
| `web/src/pages/onboarding/` (folder) | ❌ | Không có (lazy) |
| `web/src/pages/onboarding/welcome.astro` | ❌ | Không có |
| `web/src/pages/onboarding/quick-setup.astro` | ❌ | Không có |
| `web/src/pages/onboarding/full-profile.astro` | ❌ | Không có |
| `api/src/routes/onboarding.ts` | ✅ | **FIXED Bug 1** (line 54) |

**Không có file dư thừa nào để xoá** — toàn bộ "Quick vs Full" là 2 nút trong CÙNG 1 file (`onboarding.astro`), không phải 2 file riêng. Mode `quick` vs `full` chỉ khác nhau ở redirect cuối: quick → `/dashboard`, full → `/pets/[id]/profile/complete`. Đã loại bỏ mode selector hoàn toàn — chỉ còn 1 form duy nhất submit → `/dashboard?welcome=1`. Pet detail page vẫn có link "Hoàn thiện hồ sơ" 50+ fields cho user nào muốn.

### "Quick setup" vs "Full profile" trước đây là gì?

Trong `onboarding.astro` cũ (M3.5):
- **2 button** trong 1 page (lines 27-74)
- Click "Quick" → set `mode="quick"` → vào wizard 3 bước cơ bản → submit → `/dashboard`
- Click "Full" → set `mode="full"` → vào CÙNG wizard 3 bước → submit → `/pets/:id/profile/complete` (wizard 50+ fields)

→ **Lựa chọn ban đầu redundant** vì user chỉ thấy difference SAU khi submit (1 click extra để bắt đầu = phí 1 step UX). Đã loại bỏ.

---

## Bug 1 — Root cause analysis

### Symptom
User register email → onboard pet → redirect tới `/login` (silent logout).

### Root cause: JWT refresh thiếu `email` claim

`api/src/routes/onboarding.ts` line 54 (cũ):
```typescript
const refreshed = signSession({
  sub: session.sub,
  phone: session.phone,    // ← undefined cho email-registered user
  is_onboarded: true,
  // ⚠️ THIẾU email!
});
```

Trong `shared/jwt.ts` verifySession (lines 73-77):
```typescript
const hasPhone = typeof payload.phone === "string" && payload.phone.length > 0;
const hasEmail = typeof payload.email === "string" && payload.email.length > 0;
if (!hasPhone && !hasEmail) return null;  // ← reject JWT này
```

**Chuỗi sự kiện cho user email-registered:**
1. Register email → JWT có `email: "x@y.com"`, không có `phone` → verifySession OK ✓
2. Onboarding form submit → `POST /onboarding/pet` chạy
3. Server-side: tạo pet OK + sign JWT mới với CHỈ `phone: undefined` (vì code cũ không pass email) + `is_onboarded: true`
4. Cookie cũ bị overwrite bởi cookie mới (JWT mới)
5. Frontend gọi `/users/me/complete-onboarding` → `requireAuth` middleware → `verifySession` đọc JWT mới → cả `hasPhone=false` và `hasEmail=false` → **return null → 401 UNAUTHENTICATED**
6. Frontend redirect → `/login`
7. User: "tôi bị logout sau khi onboarding?"

### Fix: include email + persist DB onboarded

`api/src/routes/onboarding.ts` (mới):
```typescript
// Persist onboarded=true vào users table (M21 source of truth)
try {
  await markOnboarded(session.sub);
} catch (err) {
  console.error("[onboarding] markOnboarded failed (non-fatal):", err);
}

// CRITICAL FIX: JWT refresh phải include CẢ phone VÀ email
const refreshed = signSession({
  sub: session.sub,
  phone: session.phone || undefined,
  email: session.email || undefined,    // ⭐ key fix
  is_onboarded: true,
});
setSessionCookie(c, refreshed);
```

### Middleware — có cần fix không?

**KHÔNG.** Middleware logic chính xác. Bug nằm hoàn toàn ở route handler bỏ qua email claim khi resign JWT. Middleware chỉ là người vô tội đọc JWT đã hỏng.

### complete-onboarding endpoint — có refresh JWT đúng không?

**ĐÚNG.** Endpoint `POST /users/me/complete-onboarding` đã được fix từ M21:
```typescript
const refreshed = signSession({
  sub: user.id,
  phone: user.phone || undefined,
  email: (user as any).email || undefined,  // ✓ correct
  is_onboarded: true,
});
```

→ Endpoint đó OK. Vấn đề là `/onboarding/pet` route ghi đè cookie BẰNG JWT hỏng TRƯỚC khi complete-onboarding chạy. Sau fix, cả 2 endpoint nhất quán include email.

---

## Bug 2 — Simplification

### Xoá mode selector

Đã xoá ~150 dòng UI logic (mode selector card + Vietnamese label switching trong wizard).

Form mới: **1 page duy nhất** với:
- Tên *
- Loài * (Chó / Mèo button toggle)
- Giống (datalist autocomplete theo loài)
- Giới tính + Năm sinh (cùng row)
- Cân nặng kg
- Submit → tạo pet + onboard → `/dashboard?welcome=1`

UX: ~5 fields visible cùng lúc, không bước, không lựa chọn ban đầu, scrollable trên mobile. Vẫn có link `/pets/[id]/profile/complete` từ pet detail page cho user nào muốn nhập đủ 50+ fields.

---

## Test E2E — **7/7 PASS** ✅

Test full flow email register → onboarding → dashboard via Bun fetch (UTF-8 safe):

| # | Test | Expected | Actual |
|---|---|---|---|
| 1 | Email register | 201 + `redirect_to: /onboarding`, `is_new_user: true`, `onboarded: false` | ✅ match |
| 2 | /me before onboarding | 200 | ✅ |
| 3 | POST /onboarding/pet (Vietnamese) | 200, pet created | ✅ pet id=11, name=Bug Test Pet |
| 4 | **/me AFTER onboarding** (was 401 before fix) | **200** + `onboarding_completed: true` | ✅ **bug fixed** |
| 5 | /dashboard via web | **200 pass-through** (no redirect) | ✅ |
| 6 | DB `users.onboarded` | `true` | ✅ uid=14 onboarded=true |
| 7 | Logout → login lại | `redirect_to: /dashboard`, `onboarded: true`, `is_new_user: false` | ✅ |

Before fix, Step 4 would have returned **401 UNAUTHENTICATED**, frontend redirected to `/login`.

---

## Files modified

| File | Change |
|---|---|
| `api/src/routes/onboarding.ts` | +`markOnboarded()` to set DB field; **+`email` claim in JWT refresh** (critical fix); import `markOnboarded` from lib |
| `web/src/pages/onboarding.astro` | **REWRITE**: removed mode selector + 3-step wizard + Full mode flow; now single-page form with 5 fields; calls existing `/api/v1/onboarding/pet` + `/api/v1/users/me/complete-onboarding` (idempotent double-tap for safety) |
| `web/src/pages/dashboard.astro` | Added welcome banner shown when `?welcome=1` |

**No files deleted** — no separate Quick/Full astro files existed.

---

## Final UX flow

### Email register → first login (NEW USER)
1. `/login` → tab Email → register
2. Auto redirect `/onboarding` (single form)
3. Fill: tên + chọn loài (2 click) + optional fields → submit
4. Auto redirect `/dashboard?welcome=1` → green banner "Chào mừng đến VowVet!"

**Total: 2 click + 1 text input** sau email register.

### Returning user (any auth method)
1. Login (email/Google/OTP)
2. `redirect_to: /dashboard` immediately
3. No onboarding prompt because `users.onboarded=true` in DB + JWT

### Verified persistence
- Logout không mất pet data
- Login lại không bị bắt onboard lại
- Pets table preserve (uid=14 đã có 1 pet sau test)

---

## Conclusion

Bug 1 (silent logout) **đã fix** bằng 1 line thêm `email` claim. Bug 2 (redundant mode) **đã fix** bằng rewrite onboarding page thành single-flow. Tổng cộng:

- **2 files modify** (1 backend, 1 frontend) cho fix chính
- **1 file modify** (dashboard banner) cho UX completion
- **0 files deleted**
- **0 migrations needed** (M21 đã có sẵn `onboarded` field)
- **7/7 E2E scenarios pass**

Production-ready. User mới đăng ký email + onboard → vào dashboard mượt 1 phát.
