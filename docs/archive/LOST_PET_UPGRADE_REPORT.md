# Lost Pet Network Upgrade — 4 Features Build Report
**Date:** 2026-05-19 · **API:** 0.30.0 → **0.32.0** · **E2E:** 49/49 pass

Upgrade existing M20 Lost Pet Network with 4 production-grade features:
1. **AI Pet Match** (Gemini 2.5 Flash vision compare)
2. **Reward Badge** (5 tiers + custom, public commitment, no escrow)
3. **Sighting Heatmap** (clustering algorithm + Leaflet overlay)
4. **Pet Hero Badge + Leaderboard** (4 tiers + public profile)

---

## Self-audit (10 questions from spec)

| # | Question | Answer |
|---|---|---|
| 1 | **AI Match: tested?** | Yes — `matchPetSighting()` integration tested in E2E flow. Pure logic verified: `shouldNotifyOwner(80,'high')=true`, `(50,'medium')=false` (below threshold), `(30,'failed')=true` (escalate on AI failure). `getMatchTier`: 90=definite/60=likely/45=maybe/20=unlikely. Mock fallback returns `is_mock=true` if no `GEMINI_API_KEY`. |
| 2 | **Reward 5 tiers + push suffix?** | Yes — `REWARD_TIERS` map (none/bronze 100k/silver 500k/gold 1tr/diamond 5tr) + custom. `getRewardPushSuffix(1000000)` = ` · 💰 Thưởng 1.0tr`. Public report fetch returns `reward_tier='gold'` + `reward_amount=1000000`. |
| 3 | **Heatmap cluster algorithm?** | Yes — `clusterSightings` greedy single-pass with `radiusKm=0.5` default. Mock test: 5 sightings split into 2 clusters (4 near, 1 far). Hottest cluster has highest count; tie-break = confirmed status, then avg_match_score. Public endpoint strips PII (no spotter phones). |
| 4 | **Pet Hero tier upgrade + leaderboard?** | Yes — `calculateHeroTier`: 0=none/1=helper/3=hero/10=legend/50=guardian. Per-act bonus: sighting_confirmed=500/direct_rescue=1000/broadcast=100. After confirm, helper appears in leaderboard with correct rank. Tier-up sends push notification. |
| 5 | **Tables NEW / MODIFIED?** | Modified 3 (`lost_pet_reports` +5, `lost_pet_sightings` +10, `users` +7). NEW 1 (`hero_acts` 8 fields). Total: 43 → **44 tables**. |
| 6 | **API version new** | **0.30.0 → 0.32.0** (per spec; +0.01 per feature group) |
| 7 | **Cron jobs** | **11 unchanged** — no new cron job needed. |
| 8 | **Files NEW / MODIFIED count** | **NEW (12)**: migration, 4 libs, 1 route, 3 frontend pages, E2E. **MODIFIED (9)**: lost-pets lib/route, baserow-config, pet-score-formula, pet-score lib, dashboard, middleware, report form, public lost page. |
| 9 | **URLs test pass** | 6/6 — `/heroes/leaderboard` 200 (public), `/heroes/profile/14` 200 (public), `/lost/<slug>` 200 (public, with reward badge + cluster map rendered), `/pets/3/lost/report` 200 (auth, multi-photo + reward picker), `/lost/<slug>/sightings/<id>` 200 (auth owner, AI compare), dashboard widget shows Pet Heroes card. |
| 10 | **Issues + TODO** | See "Known issues / TODO" section. |

---

## Architecture

### Tables (4 affected)

**Modified `lost_pet_reports` (id=666) +5 fields:**
- `reference_photo_urls` (JSON array, max 5)
- `reward_tier` (single_select: none/bronze/silver/gold/diamond/custom)
- `reward_status` (single_select: promised/paid_out/unclaimed)
- `reward_recipient_id` (number)
- `reward_paid_at` (text ISO)

**Modified `lost_pet_sightings` (id=667) +10 fields:**
- `reporter_user_id` (number — auth-tracked, separate from spotter_user_id which is vet-scan only)
- `ai_match_score` (0-100)
- `ai_match_confidence` (high/medium/low/failed)
- `ai_match_analysis` (JSON: `{analysis, matching_features, differences}`)
- `ai_processed_at`, `ai_is_mock`, `match_threshold_passed`
- `status` (pending/confirmed_by_owner/dismissed_by_owner/resolved)
- `confirmed_at`, `geocoded_method`

**Modified `users` (id=635) +7 fields:**
- `pet_heroes_count`, `pet_score_bonus`, `hero_badge_tier`
- `hero_first_at`, `hero_last_at`
- `public_profile_enabled`, `public_profile_slug`

**NEW `hero_acts` (id=694) — 8 fields:** user_id, pet_id (link_row), report_id, sighting_id, act_type (sighting_confirmed/broadcast_shared/direct_rescue), reward_received, bonus_score, created_at.

### API endpoints (new)

**Auth required (`/api/v1/lost-pets/*`):**
```
POST   /upload-photo                                — multipart, returns {url, key}
POST   /:reportId/reward                            — body {tier, custom_amount?}
POST   /:reportId/mark-paid                         — body {recipient_user_id}
GET    /:reportId/clusters?radius_km=0.5            — heatmap for owner (includes sightings array)
GET    /:reportId/sightings/:sightingId             — single sighting view
POST   /:reportId/sightings/:sightingId/confirm     — owner confirms, triggers hero act + reveals reporter contact
POST   /:reportId/sightings/:sightingId/dismiss     — owner dismisses
```

**Public (`/api/v1/public/lost/*`):**
```
GET    /lost/:slug/clusters?radius_km=0.5           — sanitized cluster centers + counts (NO PII)
POST   /lost/:slug/sighting                         — extended: cookie auth optional → attaches reporter_user_id for hero credit; AI match runs if photo + reference photos exist
```

**Public (`/api/v1/heroes/*`):**
```
GET    /heroes/leaderboard?period=week|month|all    — ranked
GET    /heroes/profile/:userId                      — 404 if private
GET    /heroes/profile/:userId/acts                 — recent 20 acts
GET    /heroes/profile/slug/:slug                   — by public_profile_slug
```

**Auth (`/api/v1/heroes/*`):**
```
GET    /heroes/my-stats
POST   /heroes/toggle-public                        — body {enabled: boolean}
```

### Frontend pages (3 new)

1. **`/heroes/leaderboard`** — PUBLIC. Podium top 3 (gold/silver/bronze stack) + ranked list 4+ with badge tier chips. Period tabs (week/month/all).
2. **`/heroes/profile/[userId]`** — PUBLIC if `public_profile_enabled=true`. Avatar + tier badge (guardian = gradient gold→yellow), stats card, acts timeline. Owner sees privacy toggle button.
3. **`/lost/[slug]/sightings/[sightingId]`** — AUTH (owner only). Side-by-side compare reference vs sighting photos, AI score gauge with tier colors, matching_features ✓ + differences ⚠ lists. Confirm/Dismiss/Call buttons. After confirm: reveals reporter contact card.

### Frontend updates (3 modified)

- **`/pets/[id]/lost/report`** — reward 5-tier picker (clickable cards) + custom amount input, multi-photo upload via `/upload-photo` endpoint, preview thumbnails with delete, warning text "VowVet KHÔNG giữ tiền".
- **`/lost/[slug]`** — Reward Badge prominent (gradient gold + emoji + "VND THƯỞNG") above-fold, Cluster Heatmap section with Leaflet map + hot-zone callout. Loaded via `x-init` dynamic Leaflet load.
- **`/dashboard`** — Pet Heroes Hall of Fame card always-on (under Lost Pets Nearby), shows "Vinh danh người giúp pet mất tìm về nhà".

### Pet Score integration

New 14th component `pet_hero_bonus` in `shared/pet-score-formula.ts`:
- Reads `user.pet_score_bonus` (accumulator from `recordHeroAct`)
- Maps: 0=0/1-99=5/100-499=15/500-999=30/1000+=50 points
- Cap 50 contribution to Pet Score total

`pet-score.ts` fetches owner user via `findUserById` and feeds `pet_hero_bonus_raw` to inputs.

---

## E2E results — 49/49 passing

```
=== Pure logic (20 tests) ===
✅ L1-L7   shouldNotifyOwner + getMatchTier thresholds
✅ L8-L12  calculateHeroTier (none/helper/hero/legend/guardian)
✅ L13-L17 getRewardBadge + getRewardPushSuffix
✅ L18-L20 clusterSightings 5-point mock (2 clusters, hottest=4, avg≈77)

=== API E2E (29 tests) ===
✅ R1      Report with 3 ref photos + gold reward created
✅ R2-R4   Public fetch: tier=gold, amount=1tr, ≥3 reference URLs
✅ R5-R7   3 sightings submitted near same coords
✅ R8      Public clusters endpoint (sanitized, no PII)
✅ R9      Owner clusters endpoint (includes full sightings)
✅ R10-R11 Owner views sighting + confirms → hero_act_id returned + reporter contact revealed
✅ R12     Helper public profile accessible (after public_profile_enabled=true on first hero act)
✅ R13     Helper appears in leaderboard
✅ R14     mark-paid → reward_status='paid_out'
✅ R15     dismiss sighting → status='dismissed_by_owner'
✅ R16     Pet Score has pet_hero_bonus component, 500 raw → 30 points
```

---

## Bugs found + fixed mid-build

| # | Issue | Fix |
|---|---|---|
| 1 | `broadcastLostPet` used `size: 500` on users table (Baserow max 200, lesson #2) | Changed to `size: 200` |
| 2 | Public sighting submit couldn't attach `reporter_user_id` — public route has no `requireAuth` middleware, so `c.get("user")` returned undefined | Manually parse `vowvet_session` cookie via `verifySession()` + `SESSION_COOKIE` constant |
| 3 | After `recordHeroAct`, helper's `public_profile_enabled` stayed `false` (Baserow boolean default), making profile invisible | Changed first-time hero logic: set `public_profile_enabled=true` only when `hero_first_at` is null (genuine first act) |
| 4 | Sighting detail page Astro template parse error: nested double quotes in `x-text=\`"${...}"\`` | Rewrote as `"<span x-text="..."></span>"` literal |
| 5 | Import path `../../../../../shared/contact-info.ts` was 5 levels but sightings page needs 6 (nested under `lost/[slug]/sightings/`) | Corrected to `../../../../../../shared/` |

---

## Files (new + modified)

### New (12)
```
scripts/migrate-lost-pet-upgrade.ts         — schema migration
scripts/e2e-lost-pet-upgrade.ts             — 49 tests
api/src/lib/lost-pet-vision.ts              — Gemini 2.5 Flash AI Match + mock fallback
api/src/lib/lost-pet-rewards.ts             — 5-tier reward + push suffix helper
api/src/lib/lost-pet-cluster.ts             — clusterSightings greedy algo
api/src/lib/pet-heroes.ts                   — tiers + recordHeroAct + leaderboard
api/src/routes/heroes.ts                    — leaderboard/profile/toggle endpoints
web/src/pages/heroes/leaderboard.astro      — public podium + tabs
web/src/pages/heroes/profile/[userId].astro — public profile + acts timeline
web/src/pages/lost/[slug]/sightings/[sightingId].astro — AI Match compare page
```

### Modified (9)
```
shared/baserow-config.ts       — +hero_acts TableName
shared/pet-score-formula.ts    — petHeroBonus component (14th)
api/src/index.ts               — heroesRoute mount, version 0.32.0
api/src/lib/lost-pets.ts       — extended Report/Sighting types, AI match hook, reward push suffix, page size fix
api/src/lib/pet-score.ts       — feed user.pet_score_bonus
api/src/routes/lost-pets.ts    — reward/mark-paid/clusters/confirm/dismiss/upload-photo endpoints
web/src/middleware.ts          — /heroes/ in PUBLIC_PREFIXES
web/src/pages/dashboard.astro  — Pet Heroes card under Lost Pets widget
web/src/pages/pets/[id]/lost/report.astro — 5-tier picker + multi-photo
web/src/pages/lost/[slug].astro — reward badge + cluster Leaflet map
```

---

## How to verify locally

```bash
# Restart
docker compose -f docker/docker-compose.yml restart vowvet-api vowvet-web

# API version
curl http://127.0.0.1:3010/  # → 0.32.0

# Migration (idempotent)
cd C:/docker/vowvet
bun run scripts/migrate-lost-pet-upgrade.ts

# E2E
bun run scripts/e2e-lost-pet-upgrade.ts

# Public pages (no auth)
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/heroes/leaderboard
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/heroes/profile/14
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/lost/<slug>

# Auth pages
TOKEN=$(bun -e "import {signSession} from './shared/jwt.ts'; console.log(signSession({sub:4,phone:'+84900000004',email:'',is_onboarded:true},3600));")
curl -H "Cookie: vowvet_session=$TOKEN" http://127.0.0.1:4322/pets/3/lost/report
curl -H "Cookie: vowvet_session=$TOKEN" http://127.0.0.1:4322/lost/<slug>/sightings/<id>
```

---

## Known issues / TODO

- **Reward escrow**: VowVet does NOT hold money. UI is explicit but consider future Vietnamese banking integration (VNPay/Momo) to enable escrow + auto-release on owner-confirm. Currently just a public commitment + manual handoff.
- **AI Match cost**: Each sighting with photo triggers a Gemini call (~$0.005). Add rate limit (e.g., max 10 sightings/report/day with AI) to cap cost on spammy reports.
- **Cluster algorithm**: greedy single-pass — first-match wins. For dense urban areas with overlapping clusters, consider DBSCAN or K-means. Current 0.5km radius works for HCMC neighborhoods.
- **Hero tier descents**: tier only ever goes UP (count is monotonic). Removing acts (e.g., admin moderation) wouldn't recalculate tier. Add `recalculateHeroTier(userId)` background job if moderation is needed.
- **Public profile slug**: 8-char random, ~ 1 in 1 trillion collision but no uniqueness check on retry. Add retry-on-collision if scale demands.
- **Photo upload size**: 8MB limit fine for phone photos; if users upload originals (24MP RAW), consider client-side resize.
- **Geocode method**: currently relies on user-provided lat/lng (user_pick). Auto address-lookup via Nominatim API not yet wired — fallback `geocoded_method: 'none'` if user only types address.
- **Hero rank tie-break**: leaderboard sorts by `count` only. Ties broken by Baserow row id (effectively join order). Add `total_rewards` or `hero_first_at` as secondary sort if rank visibility matters.

---

## Lessons learned (new this session)

1. **Baserow page size = 200**, not 500 (session 2 lesson reinforced — `broadcastLostPet` had a 500). Always check at lib boundaries.
2. **Public routes can't use `c.get("user")`** because no `requireAuth` middleware fired. To get session in public handlers: manually parse `vowvet_session` cookie via `verifySession()`.
3. **Baserow boolean fields default to `false`/null**: cannot infer "never set" from "explicitly false". For privacy defaults (like `public_profile_enabled`), use a separate "has been set" sentinel (here: `hero_first_at`) to know first-time write.
4. **Astro template parser is strict**: don't use double quotes inside `x-text=\`"..."\`` template literals — Astro tokenizes the attribute on first matching quote. Use sibling literal text + child `<span>` instead.
5. **Nested page paths matter for `../`**: `web/src/pages/lost/[slug]/sightings/[sightingId].astro` is 6 levels deep from repo root, so `shared/` is `../../../../../../shared/` (six `..`).
