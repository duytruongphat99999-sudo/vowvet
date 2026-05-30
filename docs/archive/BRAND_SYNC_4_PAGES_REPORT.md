# Brand Sync 4 Pages (dashboard-anchored) — Report

**Date**: 2026-05-21
**Trigger**: User feedback "Mấy code sửa nãy không thấy thay đổi gì."
**Scope**: Verify /alerts, /chat, /chat/new, /settings actually match the `/dashboard` brand pattern + identify why the user wasn't seeing the changes

---

## TL;DR

1. **Root cause of "không thấy thay đổi"**: PWA service worker `vowvet-v1` was caching stale HTML with `stale-while-revalidate` strategy for `/dashboard /chat /alerts` etc. Cache version never bumped → users with PWA installed always saw the old design. **Fixed by bumping `VERSION = "vowvet-v2-brand-sync-pass-3"` in `web/public/sw.js`** + added a warning comment so future devs bump on every HTML/CSS release.
2. **Source files were already correct** for 3 of 4 pages: `/alerts`, `/chat`, `/settings` had been brand-synced in prior passes with 0 forbidden colors. The user simply couldn't see them due to (1).
3. **Outlier**: `/chat/new` had never been touched (last modified 2026-05-20, before the WOW pass). Now rewritten to match `/chat` brand language.
4. **Critical Tailwind discovery**: the token `vv-gold` referenced in the mega-prompt **does not exist** in this project. Real tokens are `mmp-gold` (22 files) or `var(--c-gold)` CSS var (19 files). Any Tailwind class using `bg-vv-gold` / `text-vv-gold` is silently dropped — my code uses the working alternatives.

---

## Step 0 — Audit results (truth vs mega-prompt assumptions)

| Mega-prompt says                                  | Reality                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bg-vv-gold` / `text-vv-gold` Tailwind token       | **Does NOT exist** in `web/src/styles/global.css`. Canonical = `mmp-gold` or CSS var `--c-gold`.    |
| `/chat.astro` file                                 | Real path: `web/src/pages/chat/index.astro` (subdirectory with index + [id] + new)                |
| `/account/settings.astro` file                     | Does NOT exist. Real path: `web/src/pages/settings.astro` (root)                                   |
| API `/api/v1/conversations`                        | Real: `/api/v1/chat/threads?limit=50` (returns `{ threads }`)                                      |
| Field `unread_count`, `last_message_time`          | Real: `unread_count_owner`, `last_message_at`                                                       |
| Pre-fill query `?prompt=...`                       | Real: `?subject=...` (and optionally `?pet=N`)                                                     |
| Vet name "BS Duy Trường Phát"                     | Forbidden (task #57) — use `vet.name` from clinic-info.ts (defaults `BSTY Mon Min Pet`)            |
| Brand "Mon Min PetCoach"                           | Forbidden (task #97) — use `Mon Min Pet`                                                            |
| `getSession(Astro.cookies)`                        | Real: middleware sets `Astro.locals.user` from JWT cookie — guard with `if (!user) redirect()`     |

---

## Step 1 — Patterns extracted from `/dashboard`

After reading `dashboard.astro` + the 7 components in `web/src/components/dashboard/`, these are the locked-in patterns. All 4 target pages now follow them.

| Token             | Pattern                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Page background    | `bg-mmp-cream min-h-screen pb-12`                                                              |
| Container          | `max-w-2xl mx-auto px-4 sm:px-6 py-6` (or `space-y-5`)                                          |
| Sticky header      | `bg-white border-b border-slate-200 sticky top-0 z-30 h-16` + 3-col flex (back / title / action) |
| Title              | `font-display italic text-lg sm:text-xl font-semibold text-mmp-ink` + small `bg-mmp-cream` chip with FeatureIcon |
| Card (default)     | `bg-white rounded-3xl border border-slate-100 shadow-sm p-5`                                   |
| Hero ink card      | `relative rounded-3xl bg-mmp-ink text-white overflow-hidden` + decorative gold orb top-right + `p-5/6` content layer |
| Eyebrow            | `text-[11px] uppercase tracking-[0.25em\|0.3em] font-bold` + `style="color: var(--c-gold);"`    |
| Primary button     | `bg-mmp-ink text-white hover:bg-slate-800` (Astro `<Button variant="primary">`)                |
| Accent button      | `bg-[#ecb921] hover:bg-[#d4a417] text-mmp-ink` (Astro `<Button variant="gold">`)               |
| Ghost button       | `bg-white border-slate-200 hover:border-mmp-ink hover:bg-mmp-cream text-mmp-ink`                |
| Online status dot  | `bg-emerald-500` + absolute `bg-emerald-400 animate-ping opacity-75` overlay                    |
| Severity badge     | `dot=true` + `<Badge variant="danger\|warning\|gold">` (4-tier: critical/urgent/warning/info)   |
| Input              | `w-full px-4 py-3 rounded-xl border-slate-200 focus:border-mmp-ink focus:outline-none`         |
| Animations         | Use existing `animate-pulse-strip` / `animate-ping-slow` / `animate-ping` from `global.css`     |

---

## Step 2–5 — Files state after this pass

| File                              | Size  | mmp-ink | mmp-cream | var(--c-gold) | bg-blue | bg-sky | bg-cyan | vv-gold | Status |
| --------------------------------- | ----: | ------: | --------: | ------------: | ------: | -----: | ------: | ------: | :----: |
| `web/src/pages/alerts.astro`      |  719 |     21 |        4 |             8 |       0 |      0 |       0 |       0 |   ✓    |
| `web/src/pages/chat/index.astro`  |  411 |     21 |        4 |            12 |       0 |      0 |       0 |       0 |   ✓    |
| `web/src/pages/chat/new.astro`    |  ~270 |    13 |        3 |             5 |       0 |      0 |       0 |       0 |   ✓ rewritten this pass |
| `web/src/pages/settings.astro`    |  675 |     19 |        2 |             1 |       0 |      0 |       0 |       0 |   ✓    |

3 of 4 pages were **already** brand-synced from the prior WOW/redesign passes. Only `/chat/new.astro` needed work — that file had been skipped in earlier passes (last modified 2026-05-20 22:55, before alerts/chat WOW redesign at 08:49-08:55 today).

### What changed in `/chat/new.astro` (the actual outlier)

| Before                                                                          | After                                                                                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Plain header with 💬 emoji + `text-slate-900` title                              | Sticky white header + Fraunces italic + cream chip with gold pencil icon + Tin nhắn back link        |
| (none)                                                                          | **Vet recap ink card** — mini version of /chat hero: avatar w/ online dot + name + title + response-time chip |
| Form inputs `focus:border-sky-500` (3 places)                                    | All inputs `focus:border-mmp-ink` + `text-mmp-ink` + cleaner `rounded-xl`                            |
| Submit `bg-sky-600 hover:bg-sky-700`                                             | Submit `bg-mmp-ink hover:bg-slate-800` + paper-plane SVG icon + Astro `<Button>`-shaped              |
| (no tip card)                                                                   | **Gold-tinted "Mẹo" card** with light-bulb icon — coaching the user to provide age/breed/weight       |
| Plain "Bác sĩ sẽ nhận thông báo…" footer                                        | Privacy footer with `🔒` + mentions `vet.name` + hours + `/emergency` link in gold                  |

All API contract preserved (`POST /api/v1/chat/threads` with `pet_id`, `subject`, `initial_message` body — the Alpine submit handler is untouched).

---

## Step 6 — Service Worker version bump (the actual fix for "không thấy thay đổi")

`web/public/sw.js`:

```diff
-const VERSION = "vowvet-v1";
+// IMPORTANT: bump VERSION every release that ships HTML/CSS changes — otherwise
+// stale-while-revalidate keeps serving old cached HTML for /dashboard /chat /alerts /etc.
+// (root cause of "không thấy thay đổi" feedback during Brand Sync Pass 3.)
+const VERSION = "vowvet-v2-brand-sync-pass-3";
```

**Why this matters**: the SW caches `/dashboard /emergency /chat /faq /pets/:id` with `stale-while-revalidate`. On revisit, it serves the cache **immediately** and refreshes in the background. With version `v1` never bumped, the cache key was unchanged → old HTML stayed in `caches.open("vowvet-v1-runtime")` indefinitely. New SW with `v2` triggers `activate` event which cleans up old caches:

```js
self.addEventListener("activate", (event) => {
  // ... existing logic deletes caches not matching new VERSION
});
```

→ User's browser now fetches the redesigned HTML on next visit.

### What the user needs to do to see the change

1. **Hard refresh** (`Ctrl+Shift+R` / `Cmd+Shift+R`) — fastest
2. **OR** close and reopen the PWA (if installed)
3. **OR** wait — SW will auto-update within ~24h via `serviceWorker.update()` checks

If still stuck after hard refresh:
- DevTools → Application → Service Workers → "Unregister" → reload
- DevTools → Application → Clear storage → reload
- If on Cloudflare-fronted production: ask user to Purge Everything in Cloudflare dashboard

---

## Step 7 — Smoke verification

```bash
$ docker restart vowvet-web  # picked up sw.js change
$ docker logs vowvet-web --tail 1
09:05:24 watching for file changes...   # ← Astro HMR ready

$ for p in /alerts /chat /chat/new /settings /dashboard; do
    curl -s -o /dev/null -w "%{http_code} $p\n" http://127.0.0.1:4322$p
  done
302 /alerts        # auth gate (anonymous)
302 /chat
302 /chat/new
302 /settings
302 /dashboard
```

All redirect to `/login?return_to=...` correctly. No 500s. `docker logs vowvet-web --since 60s | grep -i error` returns empty.

Production accessibility check:

```bash
$ for p in /alerts /chat /chat/new /settings; do
    curl -s -o /dev/null -w "%{http_code} https://vowvet.monminpet.com$p\n" "https://vowvet.monminpet.com$p"
  done
302 .../alerts
302 .../chat
302 .../chat/new
302 .../settings
```

Production reachable (anon redirected by same middleware). When user re-visits with hard-refresh, the new SW will activate.

---

## Files changed (this pass)

- **Rewritten**: `web/src/pages/chat/new.astro` — full brand sync (~270 lines)
- **Bumped**: `web/public/sw.js` — VERSION `v1` → `v2-brand-sync-pass-3` + warning comment

(No changes to alerts/chat-index/settings — they were already correct from prior passes #114 and #117 and #108.)

---

## Acceptance checklist

| # | Requirement                                                                  | Status |
| - | ---------------------------------------------------------------------------- | :---:  |
| 1 | Step 0 audit — Tailwind tokens / Logo / 4 pages / container                  |   ✓    |
| 2 | Step 1 — extracted 15+ patterns from `/dashboard` (header, card, hero, buttons, badge, input, animations) |   ✓    |
| 3 | Step 2 — `/alerts` matches dashboard pattern (verified — no rewrite needed)  |   ✓    |
| 4 | Step 3 — `/chat` matches dashboard pattern (verified — no rewrite needed)    |   ✓    |
| 5 | Step 4 — `/chat/new` rewritten this pass                                     |   ✓    |
| 6 | Step 5 — `/settings` matches dashboard pattern (verified — no rewrite needed) |   ✓    |
| 7 | Step 6 — mass cleanup forbidden colors (0 hits per file — already 0 before pass) |   ✓    |
| 8 | Step 7 — smoke test 4 pages 302 (auth-gated, expected for anon)               |   ✓    |
| 9 | **Root-cause fix**: SW cache version bumped → users see fresh HTML            |   ✓    |
| 10 | Brand-safe identities preserved (BSTY Mon Min Pet, Mon Min Pet)              |   ✓    |

---

## Out of scope / known limitations

- If the user is testing on Cloudflare-fronted production (vowvet.monminpet.com), the CDN may also need a manual cache purge in addition to the SW version bump. Cloudflare typically respects `Cache-Control: no-cache` on HTML, but if anyone configured aggressive caching at the CDN level, the user needs to Purge Everything in the Cloudflare dashboard.
- The SW version-bump approach is a manual one-time fix. A more durable solution: derive `VERSION` from `package.json` version automatically at build time. Captured as future task if needed.
- The vet identity in `/chat/new`'s recap card and `/chat`'s hero come from `clinic-info.ts` env-driven defaults. If you want a real photo, set `CLINIC_VET_PHOTO` env var to a valid `/img/...` URL.
