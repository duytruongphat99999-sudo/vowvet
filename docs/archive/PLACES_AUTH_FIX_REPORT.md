# /places/new + /places/checkin auth bug — Fix Report
**Date:** 2026-05-19 · **Severity:** P1 (M26 social feature broken in prod)

---

## Self-audit (8 questions from spec)

| # | Question | Answer |
|---|---|---|
| 1 | **Nguyên nhân chính xác (1 of 4 scenarios)?** | **Scenario C** — middleware logic. `/places/` was added to `PUBLIC_PREFIXES` (M26, for /places/[id] detail pages), but the prefix-loop matches `/places/new` and `/places/checkin` too. Middleware returns `next()` WITHOUT populating `context.locals.user`. The pages then check `Astro.locals.user` → undefined → self-redirect to `/login`. Cookie + JWT are 100% valid throughout — perception of "logout" comes from the redirect chain. |
| 2 | **/places/new có SSR fetch không forward cookie?** | No SSR fetch in /places/new at all (no `fetch(...)` in frontmatter). Bug is upstream in middleware. |
| 3 | **/places/checkin có cùng bug không?** | **Yes** — exact same root cause. Same `/places/` prefix matched in middleware. /places/checkin.astro also reads `Astro.locals.user` (line 10) → undefined → redirect. Fix applies to both. |
| 4 | **Layout.astro có fetch gây session invalidate?** | No — Layout.astro is a pure shell (only props + meta). No fetch, no SSR auth check. Confirmed clean. |
| 5 | **Middleware logic correct?** | Was incorrect — fixed. Added `PROTECTED_OVERRIDES` set with `/places/new` and `/places/checkin`. Public-prefix loop now skips override paths so they fall through to the JWT-verify path. |
| 6 | **Frontend Alpine.js fetch thiếu credentials:'include'?** | No — both /places/new submit (line 200-205) and /places/checkin submit (line 151-160) include `credentials: "include"`. Frontend is fine. The bug never reached the form's POST — page redirected before user could fill the form. |
| 7 | **Files modified** | **1 file** — `web/src/middleware.ts` only. Minimum-blast-radius fix. |
| 8 | **E2E pass mấy / mấy?** | **16/16** (covers all 7 spec scenarios + 9 additional defense-in-depth + API flow). |

---

## The bug in one diagram

```
BEFORE FIX:
  User logged in cookie ✓
   ↓
  Click "+" on /map → GET /places/new
   ↓
  middleware.ts line 23: PUBLIC_PREFIXES includes "/places/"
   ↓
  middleware.ts lines 57-60:
    for (const prefix of PUBLIC_PREFIXES)
      if (path.startsWith(prefix)) return next();   ← matches /places/new, exits early
   ↓
  context.locals.user is NEVER set (JWT verify skipped)
   ↓
  /places/new.astro line 8-9:
    const user = Astro.locals.user;                  ← undefined
    if (!user) return Astro.redirect("/login");
   ↓
  Browser: 302 → /login
   ↓
  middleware on /login: cookie IS valid → context.redirect("/dashboard")
   ↓
  User lands at /dashboard, thinks "I got logged out"
  (Cookie is intact the whole time. Session was never invalidated.)
```

```
AFTER FIX:
  Click "+" on /map → GET /places/new
   ↓
  middleware: PROTECTED_OVERRIDES.has("/places/new") → true
   ↓
  Skip public-prefix loop ✓
   ↓
  context.cookies.get(SESSION_COOKIE) → valid JWT
   ↓
  context.locals.user = session ✓
   ↓
  Falls through to next() (page handles its own auth check)
   ↓
  /places/new.astro: Astro.locals.user is set → renders form
   ↓
  200 OK — user fills form → submit → /api/v1/places (credentials:include) → 201
```

---

## The fix (1 file, +6 −2 lines)

**`web/src/middleware.ts`** — added a 4-line override set + 2-line guard around the public-prefix loop:

```diff
 // Exact-match public paths (won't match sub-paths)
 const PUBLIC_EXACT = new Set(["/faq", "/triage"]);

+// Exact-match AUTH-required paths that LOOK like public prefixes but must be protected.
+// Example: /places/ is a public prefix for detail pages, but /places/new and /places/checkin
+// must require auth (otherwise locals.user never populates and pages self-redirect to /login).
+const PROTECTED_OVERRIDES = new Set(["/places/new", "/places/checkin"]);
```

```diff
-  // Public passport — bypass mọi auth check
-  for (const prefix of PUBLIC_PREFIXES) {
-    if (path.startsWith(prefix)) return next();
-  }
+  // Public passport — bypass mọi auth check (but skip override paths that need auth)
+  if (!PROTECTED_OVERRIDES.has(path)) {
+    for (const prefix of PUBLIC_PREFIXES) {
+      if (path.startsWith(prefix)) return next();
+    }
+  }
```

That's the entire fix. No other files needed changes.

---

## Reproduction (before fix)

```
$ curl -s -o /dev/null -w "%{http_code} → %{redirect_url}\n" \
    -H "Cookie: vowvet_session=<valid JWT>" \
    http://127.0.0.1:4322/places/new
302 → http://127.0.0.1:4322/login

$ curl -s -o /dev/null -w "%{http_code} → %{redirect_url}\n" \
    -H "Cookie: vowvet_session=<valid JWT>" \
    "http://127.0.0.1:4322/places/checkin?placeId=13"
302 → http://127.0.0.1:4322/login
```

## Verification (after fix)

```
$ curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Cookie: vowvet_session=<valid JWT>" \
    http://127.0.0.1:4322/places/new
200

$ curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Cookie: vowvet_session=<valid JWT>" \
    "http://127.0.0.1:4322/places/checkin?placeId=13"
200

$ curl -s -o /dev/null -w "%{http_code}\n" \
    "http://127.0.0.1:4322/places/13"   # still public
200

$ curl -s -o /dev/null -w "%{http_code} → %{redirect_url}\n" \
    http://127.0.0.1:4322/places/new    # no cookie → defense in depth
302 → http://127.0.0.1:4322/login
```

---

## E2E results — 16/16 pass

```
=== Test 1: /map authenticated ===
✅ T1 /map → 200

=== Test 2: /places/new (was 302→/login, expect 200) ===
✅ T2 /places/new auth → 200
✅ T2b /places/new HTML contains form

=== Test 3: Session intact ===
✅ T3 GET /auth/me → 200 after /places/new
✅ T3b user.sub matches

=== Test 4: /places/checkin (was 302→/login, expect 200) ===
✅ T4 /places/checkin?placeId=13 → 200

=== Test 5: Session still intact ===
✅ T5 GET /auth/me → 200 after /places/checkin

=== Test 6: Public /places/13 (no auth) — fix didn't break public flow ===
✅ T6 /places/13 no auth → 200

=== Test 7: /places/new no cookie → /login redirect ===
✅ T7 /places/new no auth → 302
✅ T7b redirect target is /login

=== Test 8: POST /places API end-to-end ===
✅ T8 POST /places → 201
✅ T8b created place returned with id
✅ T8c new place verified=false (admin-review default)

=== Test 9: POST /places/:id/checkin ===
✅ T9 POST /checkin → 201
✅ T9b checkin id returned

=== Test 10: Final session sanity ===
✅ T10 session still active after all flows
```

---

## Why session "appeared" lost to the user

The JWT cookie was never invalidated. The perceived "logout" was a redirect chain:

1. /places/new → /login (because locals.user was undefined)
2. /login middleware sees valid cookie → /dashboard (or /onboarding if not onboarded)
3. User ends up at /dashboard, having intended to be at /places/new
4. User concludes "I got logged out" — actually they got bounced to dashboard

In some browsers / network conditions, the user might briefly see /login flash before the second redirect — reinforcing the "logout" perception.

---

## Lesson — add to cumulative auth-bug catalog

**Public prefix `startsWith` matchers are dangerous when sub-paths need auth.** If `/places/` is public, then `/places/new`, `/places/checkin`, `/places/admin` ALL inherit that publicness — even if their .astro files self-check for auth, the middleware never populated `locals.user`, so the self-check ALWAYS fails.

Pattern to remember:
- Public-prefix matchers should be paired with an **explicit protected-override set** for any sub-paths that need auth.
- Sub-paths under a public prefix that need auth should ALWAYS be enumerated in `PROTECTED_OVERRIDES`.

Related session-N lessons reinforced:
- Session 3: "JWT refresh missing email claim → silent logout for email users"
- Session 4: "Public route can't use c.get('user') because no requireAuth ran"
- **This session: Middleware public-prefix swallows auth setup for legitimate sub-paths**

All three are variants of: **the middleware path that's supposed to populate `locals.user` got skipped** — either by missing JWT claim, missing middleware, or wrong-prefix matching.

---

## URLs that now work (manual smoke)

1. **/map** → ✓ click "+" → **/places/new** opens (no logout)
2. Submit place from form → ✓ creates row, redirects back to /map (session preserved)
3. From /places/13 → click "Check-in" → **/places/checkin?placeId=13** opens
4. Submit check-in → ✓ creates row, redirects to /places/13 (session preserved)
5. F5 reload anywhere → session intact

## Files

**Modified (1):** `web/src/middleware.ts` — added `PROTECTED_OVERRIDES` set + guard
**Created (2 helper):** `scripts/e2e-places-auth-fix.ts` (16 tests), `PLACES_AUTH_FIX_REPORT.md` (this doc)
