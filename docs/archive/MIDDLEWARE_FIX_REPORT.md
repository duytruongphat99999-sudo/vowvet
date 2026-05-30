# VowVet — Middleware Bypass Fix Report

**Date:** 2026-05-20
**Severity:** UX-blocking — logged-in-not-onboarded user couldn't browse `/login` or fully use return-to flow
**Result:** ✅ 33/33 E2E checks pass

---

## Audit findings

The original complaint claimed 6 paths redirected to `/onboarding` for a logged-in-not-onboarded user (`/why-vowvet`, `/login`, `/playdate/safety-tips`, `/community`, `/leaderboard`, `/faq`). The actual audit (forged JWT with `is_onboarded=false`, fetched each URL) showed only **1** path actually misbehaved:

| Path | Before | Expected |
|---|---|---|
| `/why-vowvet`          | 200 ✓ | 200 |
| `/faq`                 | 200 ✓ | 200 |
| `/community`           | 200 ✓ | 200 |
| `/leaderboard`         | 200 ✓ | 200 |
| `/playdate/safety-tips`| 200 ✓ | 200 |
| `/heroes/leaderboard`  | 200 ✓ | 200 |
| **`/login`**           | **302 → /onboarding** | 302 → /onboarding (by design — logged-in user shouldn't see login). BUT the redirect should honor `?return_to=`. |
| **`/account/setup-password`** | 302 → /dashboard | 200 (let not-onboarded user set password) — fixed |

**Beyond the original complaint, several latent issues were found:**

1. **No `return_to` flow at all.** Anonymous visits to `/dashboard` redirected to `/login` with the original path lost. After login → always `/dashboard`, not the page they wanted.
2. **Scattered, hard-to-reason logic.** 9+ separate `if` branches in the original middleware; precedence not obvious.
3. **Not-onboarded users couldn't visit `/settings`, `/onboarding` was the only authed escape.**
4. **No explicit ALLOW_NOT_ONBOARDED list** — every "should still work for not-onboarded" path had to be in PUBLIC_EXACT or PUBLIC_PREFIXES.
5. **Open-redirect risk** — no validation that `return_to` is same-origin.

---

## The fix

`web/src/middleware.ts` rewritten with **explicit priority order** matching the spec:

```
1. Static assets + /api/*           → next()                     (Vite/Astro handles)
2. PUBLIC path                      → next()                     (no auth check)
   ↳ /login + "/" special-case: redirect logged-in users to /dashboard or /onboarding,
     honoring return_to if present.
3. Not logged in + private path     → /login?return_to=<encoded>
4. Logged in + onboarded + /onboarding → /dashboard (honors return_to)
5. Logged in + NOT onboarded        → /onboarding?return_to=<encoded>
   ↳ EXCEPT paths in ALLOW_NOT_ONBOARDED — let user use settings, set up password,
     browse public ecosystem.
6. Default                          → next()
```

### Three explicit allow-lists

```ts
PUBLIC_EXACT      = "/", "/login", "/logout", "/health", "/food-brands",
                    "/404", "/500", "/offline", "/why-vowvet", "/faq",
                    "/triage", "/community", "/leaderboard",
                    "/heroes/leaderboard", "/map"

PUBLIC_PREFIXES   = "/p/", "/birthday/", "/personality/",
                    "/account/reset-password", "/places/", "/memorial/",
                    "/playdate/safety-tips", "/heroes/", "/faq/",
                    "/api/v1/auth/", "/api/v1/playdate/safety-tips",
                    "/api/v1/triage-tree/", "/api/v1/faqs/",
                    "/api/v1/marketing/", "/api/v1/leaderboard",
                    "/api/v1/community/feed", "/api/v1/public/",
                    "/sounds/", "/logo-mmp.png", "/og-image"

PROTECTED_OVERRIDES = "/places/new", "/places/checkin",
                      "/heroes/profile/me", "/lost/nearby"
```

```ts
ALLOW_NOT_ONBOARDED_EXACT    = "/onboarding", "/settings", "/logout"
ALLOW_NOT_ONBOARDED_PREFIXES = "/account/", "/api/v1/me", "/api/v1/auth/",
                               "/api/v1/onboarding/"
```

### Edge cases handled

- `/triage` (exact) = public tree picker, `/triage/<petId>` = private per-pet
- `/lost/<slug>` (6-16 lowercase alphanum) = public sighting page, `/lost/nearby` = private map
- `/places/<id>` = public detail, `/places/new` + `/places/checkin` = private
- `/heroes/profile/<userId>` = public, `/heroes/profile/me` = private (own profile)
- `/login?return_to=//evil.com` → blocked (protocol-relative URL rejected)
- `/login?return_to=/login` → blocked (would loop)

### return_to flow

**Anonymous user → private page:**
```
GET /pets/12             → 302 /login?return_to=%2Fpets%2F12
(user logs in)           → 302 /pets/12  (honoring return_to)
```

**Not-onboarded user → private page:**
```
GET /pets/12             → 302 /onboarding?return_to=%2Fpets%2F12
(user completes onboarding) → window.location.href = "/pets/12"
```

**Anonymous → /login with explicit return_to:**
```
GET /login?return_to=/leaderboard  (200, login form)
(user logs in, onboarded)          → location.href = "/leaderboard"
(user logs in, not-onboarded)      → location.href = "/onboarding?return_to=%2Fleaderboard"
(user completes onboarding)        → location.href = "/leaderboard"
```

### Files touched

| File | Change |
|---|---|
| `web/src/middleware.ts` | Full rewrite — explicit priority order, 3 allow-lists, return_to support, open-redirect blocker |
| `web/src/pages/login.astro` | `resolveRedirect()` honors `?return_to=` (validates same-origin), carries return_to into `/onboarding?return_to=` when user not onboarded |
| `web/src/pages/onboarding.astro` | Post-completion redirect honors `?return_to=`, falls back to `/dashboard?welcome=1` |
| `scripts/e2e-middleware-audit.ts` | Diagnostic (audit current behavior) |
| `scripts/e2e-middleware-fix.ts` | 33-check verification |
| `MIDDLEWARE_FIX_REPORT.md` | This file |

---

## E2E verification — 33/33 pass

```
=== 1. Not-onboarded user can browse PUBLIC pages ===
✅ /why-vowvet, /faq, /community, /leaderboard, /playdate/safety-tips,
   /heroes/leaderboard, /food-brands

=== 1b. Not-onboarded on ALLOW-LIST paths ===
✅ /onboarding, /account/setup-password (both reachable)

=== 2. Not-onboarded → private → /onboarding?return_to=… ===
✅ /dashboard → /onboarding?return_to=/dashboard
✅ /pets/12   → /onboarding?return_to=/pets/12
✅ /chat      → /onboarding?return_to=/chat

=== 3. Anonymous → private → /login?return_to=… ===
✅ /dashboard       → /login?return_to=/dashboard
✅ /pets/12         → /login?return_to=/pets/12
✅ /pets/12/quests  → /login?return_to=…

=== 3b. Anonymous → public page → 200 ===
✅ /why-vowvet, /faq, /leaderboard, /community, /, /login

=== 4. Onboarded visiting /onboarding → /dashboard ===
✅ /onboarding → /dashboard

=== 5. PROTECTED_OVERRIDES ===
✅ /places/123 (passes middleware; page may then redirect if not-found)
✅ /places/new      → /login (override)
✅ /places/checkin  → /login (override)
✅ /lost/nearby     → /login (override)

=== 6. /triage edge case ===
✅ /triage → 200 (public picker)
✅ /triage/12 → /login (per-pet private)

=== 7. Onboarded on /login → /dashboard ===
✅ Onboarded → /dashboard
✅ Not-onboarded → /onboarding

=== 8. return_to flow ===
✅ Onboarded /login?return_to=/leaderboard → /leaderboard
✅ Not-onboarded /login?return_to=/leaderboard → /onboarding?return_to=…
✅ Open-redirect attack /login?return_to=//evil.com → /dashboard (blocked)

Summary: 33 passed, 0 failed
```

---

## Answers to the 7 spec questions

| # | Question | Answer |
|---|---|---|
| 1 | PUBLIC_PREFIXES có đủ 20+ paths? | **YES.** 15 PUBLIC_EXACT + 21 PUBLIC_PREFIXES = 36 public surfaces. Plus dynamic detectors for `/lost/<slug>`. |
| 2 | PROTECTED_OVERRIDES handle /places/new + /places/checkin? | **YES.** Plus `/lost/nearby` + `/heroes/profile/me`. Verified — anonymous gets 302 → /login on both. |
| 3 | ALLOW_NOT_ONBOARDED cho phép logged-in chưa onboard browse public pages? | **YES.** Not-onboarded user gets 200 on `/why-vowvet`, `/faq`, `/community`, `/leaderboard`, `/playdate/safety-tips`, `/heroes/leaderboard`, `/food-brands`, `/onboarding`, `/account/setup-password`. |
| 4 | /triage edge case hoạt động? | **YES.** `/triage` exact → 200 (public picker), `/triage/12` → 302 /login (private per-pet). Implemented via `isPublicTriageRoot()` + `isPrivateTriagePerPet()`. |
| 5 | return_to query param đúng sau /login redirect? | **YES.** All 3 anonymous-on-private redirects produce `/login?return_to=<encoded path>`. login.astro `resolveRedirect()` honors it (validated same-origin). Onboarding.astro completion redirect honors it. Open redirects blocked (`//evil.com` rejected). |
| 6 | /onboarding redirect /dashboard nếu đã onboard? | **YES.** Also honors `return_to` so user can be redirected to original target after re-visiting onboarding. |
| 7 | 6 E2E test pass? | **33/33 pass** — broader coverage than the spec's 6 scenarios. |

---

## Manual QA for the user

1. **Login với account chưa onboarded** → click `/why-vowvet` → expect 200, see new design (was the original complaint).
2. **Anonymous** → open `/dashboard` → expect redirect to `/login?return_to=%2Fdashboard`. After login → land on `/dashboard`, not just default landing.
3. **Anonymous** → open `/pets/12/quests` → `/login?return_to=/pets/12/quests` → after login → quest page (not dashboard).
4. **Not-onboarded** → open `/chat` → `/onboarding?return_to=/chat` → finish onboarding → land on `/chat` (not generic `/dashboard?welcome=1`).
5. **Onboarded** → visit `/login` → immediately bounced to `/dashboard`.
6. **Onboarded** → visit `/onboarding` → immediately bounced to `/dashboard`.
7. **Attack test:** open `/login?return_to=https://evil.com` → after login, lands on `/dashboard`, NOT evil.com.

---

## What did NOT change

- Session JWT structure (`is_onboarded` field name preserved)
- Login form UI / OAuth callbacks
- Onboarding form (only the post-completion redirect)
- API auth (Hono `requireAuth` middleware on `/api/v1/*` unchanged)
- No DB / migration changes
