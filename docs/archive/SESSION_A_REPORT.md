# Gamification — Session A Report (Foundation)
**Date:** 2026-05-19 · **API:** 0.33.0 → **0.34.0** · **E2E:** 37/37 pass

Foundation layer of the gamification system: persistent achievements, claimable rewards (admin-editable in Baserow), feature gates that unlock by Pet Score / tier / hero count / achievement, plus tier-up celebration overlay on Pet Score page.

Sessions B (Engagement: nudges, leaderboard, quests, mood mascot) and C (Polish: confetti, sound, haptic, community feed, charts) are **deferred** for follow-up turns — `BUILD_PROGRESS.json` checkpoint set so a future Claude session can resume from B.

---

## What shipped (Session A)

### Backend
- **5 new tables** (ids 695–699): `achievement_defs`, `user_achievements`, `reward_definitions`, `user_rewards`, `feature_gates`
- **43 seeded rows**: 20 achievements, 15 rewards (Mon Min vouchers + free services + feature unlocks), 8 feature gates
- **3 service libs**: `achievements.ts`, `rewards.ts`, `feature-gates.ts` — all using actual VowVet baserow conventions (`listRows`/`{field__op: value}` filters/`[petId]` link_row writes), not the spec's draft TypeScript that mismatched the codebase
- **2 routes**: `/api/v1/achievements/*` + `/api/v1/rewards/*` (latter also hosts `feature-access` lookup endpoint)
- **5 endpoint hooks** that auto-fire achievement checks: vaccine mark-completed, BCS assess, check-in, playdate swipe (mutual-match), lost-pet sighting confirm (helper attribution)
- **2 feature gates wired**: `places_submit` (Pet Score ≥ 200 anti-spam) + `playdate_basic` (Pet Score ≥ 100 before swipe)

### Frontend
- **3 new pages**: `/pets/[id]/achievements`, `/pets/[id]/rewards`, `/rewards/[claimId]` (voucher detail)
- **Pet detail card**: 2-col grid for Achievements + Rewards entry points
- **Pet Score celebration overlay**: `?celebrate=1` URL flag triggers post-animation celebration modal with confetti particles + diamond shimmer for `level.id=diamond`

### Pet Score integration
- Achievement unlocks bump `user.pet_score_bonus` (existing M27 field) and call `invalidatePetScore(petId)`
- Next Pet Score compute picks up bonus via the existing `pet_hero_bonus` component (which reads `user.pet_score_bonus`)
- Animation: existing count-up + gauge reveal kept; added `showCelebration` state + URL-flag detection + 30-particle confetti CSS

---

## Files

### New (9)
```
scripts/migrate-gamification-a.ts        — 5 tables ensureTable + ensureFields
scripts/seed-gamification-a.ts           — 20 achievements + 15 rewards + 8 gates (idempotent)
scripts/e2e-gamification-a.ts            — 37 tests
api/src/lib/achievements.ts              — checkAndUnlockAchievements + condition eval
api/src/lib/rewards.ts                   — evaluateUnlockableRewards/claimReward/voucher gen
api/src/lib/feature-gates.ts             — checkFeatureAccess + listActiveFeatureGates
api/src/routes/achievements.ts           — GET list / unviewed count / mark-viewed
api/src/routes/rewards.ts                — unlockable / claimed / claim / claim detail / admin redeem / feature-access
web/src/pages/pets/[id]/achievements.astro
web/src/pages/pets/[id]/rewards.astro
web/src/pages/rewards/[claimId].astro
```

### Modified (7)
```
shared/baserow-config.ts                — +5 TableName entries
api/src/index.ts                        — mount achievementsRoute + rewardsRoute, version 0.33.0 → 0.34.0
api/src/routes/vaccines.ts              — hook checkAndUnlockAchievements after mark-completed
api/src/routes/bcs.ts                   — hook checkAndUnlockAchievements after assess (with score data)
api/src/routes/pets.ts                  — hook on check-in submit (streaks + midnight_warrior)
api/src/routes/lost-pets.ts             — hook on sighting confirm (HELPER's pet attribution)
api/src/routes/places.ts                — places_submit gate before POST /
api/src/routes/playdate.ts              — playdate_basic gate before swipe + hook achievement on match
web/src/pages/pets/[id].astro           — 2-col Achievements + Rewards cards
web/src/pages/pets/[id]/pet-score.astro — celebration overlay + ?celebrate=1 detection + diamond shimmer
BUILD_PROGRESS.json                     — session 10 entry + gamification_session_a complete
```

---

## E2E results — 37/37 passing

```
=== Migration + seeds (3) ===
✅ M1 ≥20 achievement defs seeded
✅ M2 ≥15 reward defs seeded
✅ M3 ≥8 feature gates seeded

=== API endpoints (10) ===
✅ T1   GET /achievements/pets/:id → 200
✅ T1b  returns achievements array
✅ T1c  summary has total + unlocked_count
✅ T1d  secret achievement masked when locked
✅ T2   GET /rewards/pets/:id/unlockable → 200
✅ T2b  unlockable[] + locked[] arrays
✅ T3   GET /rewards/pets/:id/claimed → 200
✅ T3b  claims array
✅ T4   GET /feature-access/playdate_basic/pets/:id → 200
✅ T4b  feature_key matches
✅ T5   GET /achievements/pets/:id/unviewed → 200

=== Pure logic (8) ===
✅ L1-L3 voucher patterns VV-/GOLD-/DMD- generate matching regex
✅ L4    checkFeatureAccess returns allowed boolean + feature_key
✅ L5    unknown feature → allowed=true (no-gate default)
✅ L6    evaluateUnlockableRewards returns unlockable + locked
✅ L7    checkAndUnlockAchievements callable
✅ L8    idempotent — second call returns 0

=== Frontend rendering (12) ===
✅ P1  /pets/12/achievements → 200 + 3 expected markers
✅ P2  /pets/12/rewards      → 200 + 3 expected markers
✅ P3  /pets/12/pet-score?celebrate=1 → 200 + showCelebration + scorePage markers
```

---

## Spec translation issues encountered + how I handled them

The spec had several mismatches with the actual VowVet codebase. I translated rather than blindly copy-pasted:

| Spec wrote | Actual codebase | Resolution |
|---|---|---|
| `getRows()` returning `T[]` | `listRows()` returning `{results, count}` | Used `listRows` + `.results` everywhere |
| `{field, type, value}` filter | `{field__op: value}` (strings) | Translated all filters to flat-key syntax |
| `addPetScoreBonus(petId, bonus, reason)` | doesn't exist | Used existing M27 `user.pet_score_bonus` accumulator + `invalidatePetScore()` |
| `vaccine_schedules` filter for completed | `vaccines` table with `status=completed` | Pointed at correct table |
| `daily_checkins` | actual is `daily_check_ins` | Used correct name |
| 4 tiers (bronze/silver/gold/diamond) | 5 tiers (bronze/silver/gold/platinum/diamond) | Used actual 5-tier model + thresholds 301/501/701/851 |
| `session.user.id` / `session.user.role` | `session.sub` / no `role` on session | Used `session.sub`; admin check falls back to `ADMIN_PHONES` env whitelist |
| Spec's `place_checkins` shape | Already has photo_urls + matches conventions | Reused existing |

---

## Achievement system in action

**Hook locations** (where `checkAndUnlockAchievements` fires automatically):
- `POST /pets/:id/vaccines/:vid/mark-completed` — triggers `vaccine_starter` (1), `vaccine_pro` (5), `vaccine_master` (9 WSAVA shots done)
- `POST /pets/:id/bcs/assess` — triggers `bcs_first` (any BCS done) + `ideal_weight` (BCS 4-5 in `data.score`)
- `POST /pets/:id/check-in` — triggers `streak_7/30/100/365` (from `routine_streaks.current_streak`) + `midnight_warrior` (5 check-ins between 0am-3am)
- `POST /playdate/swipe` when `result.matched===true` — triggers `first_match` + `social_butterfly` (5 mutual matches)
- `POST /lost-pets/:reportId/sightings/:sightingId/confirm` — triggers `pet_helper/hero/guardian` against the **helper's** pet (lookup by `sighting.reporter_user_id` → their first pet)

**Achievement card secret-mode**: when `is_secret=true` and user hasn't unlocked, the route hides `name`/`description`/`emoji` and substitutes "???". Frontend respects this for the secret category.

**Idempotency**: every check first looks up `user_achievements` filtered by `(user_id, pet_id__link_row_has)` and skips codes already unlocked. Verified L8 passes.

---

## Reward system in action

**Eval matrix** — `evaluateUnlockableRewards(userId, petId)` returns `{unlockable, locked, claimed_counts}`:

| `unlock_condition_type` | Source signal | Example reward |
|---|---|---|
| `pet_score_tier` | `getPetScore(pet).level.id` ≥ required tier in 5-tier order | `gold_tier_checkup` (20% Mon Min voucher at Gold) |
| `streak_days` | `routine_streaks.current_streak` ≥ required days | `streak_30_vaccine` (free vaccine shot at 30-day streak) |
| `hero_count` | `users.pet_heroes_count` ≥ required count | `pet_hero_grooming` at 3 heroes |
| `achievement_code` | `user_achievements` row exists for that code | `birthday_voucher_100k` after `first_birthday` unlocked |
| `manual_admin` | Never auto-unlocks; admin POSTs `/admin/:claimId/redeem` to mark used | `leaderboard_top10_monthly` (admin grants top-10) |

**Voucher generation**: `generateVoucherCode(pattern)` supports `{random8}` / `{random6}` placeholders. Uses crypto-safe random against `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I/L/O/0/1) so phone-dictated voucher codes work without confusion.

**Auto-expire**: `listClaimedRewards` lazily updates status to `expired` when `expires_at < now()` and emits an async `updateRow` (fire-and-forget).

**Instant-redeem** for `reward_type IN (feature_unlock, badge_only)`: those skip the clinic-visit flow and are immediately marked `redeemed`.

---

## Feature gates in action

8 gates seeded. **Wired at runtime in two places**:

1. **`POST /api/v1/places/` (places_submit)** — Pet Score ≥ 200 required. If user has no pet yet, allows (onboarding redirect handles that flow). Returns `403 {error: {code: "FEATURE_LOCKED", gate: {...}}}` with `reason`, `next_action`, `percent`, `current_value`.

2. **`POST /api/v1/playdate/swipe` (playdate_basic)** — Pet Score ≥ 100 required for the swiping pet. Same 403 shape on lock.

Other 6 gates (`playdate_priority_discovery`, `playdate_unlimited_swipes`, `lost_pet_premium_broadcast`, `vet_buddy_chat`, `vet_buddy_priority_response`, `memorial_premium`) are **read-only** in Session A — frontend can call `/rewards/feature-access/:key/pets/:petId` to render "locked" UI states. Server enforcement for those will be wired when the corresponding premium features ship.

---

## Pet Score celebration

Existing `pet-score.astro` already had count-up + gauge reveal. Added:
- `showCelebration` Alpine state
- `?celebrate=1` URL detection in `onMount()` — clears the query param via `history.replaceState` so refresh doesn't re-trigger
- Full-screen overlay with: tier emoji × 6, diamond-shimmer animation for diamond tier, 30 confetti particles (pure CSS keyframes)
- Click-to-dismiss

**Tier-up hook flow**: when a downstream endpoint (vaccine completion / check-in / BCS) wants to celebrate, it should:
1. Already returns `new_achievements: []` array (now done in 5 hook points)
2. Frontend submit handler can check `new_achievements.length > 0` and redirect to `/pets/:id/pet-score?celebrate=1`

Frontend Alpine submit handlers in those 5 hook locations would need to opt into the redirect — that's a lightweight follow-up I'm not making in this turn to keep the blast radius small.

---

## Known limitations / Session B & C scope

**Session B (deferred — separate turn):**
- Smart Nudges (5 types, every-2h cron)
- Public leaderboard (`/leaderboard`, opt-in)
- Daily quests (3/day, 15 templates)
- Pet Mood mascot (6 states)
- 3 new cron jobs (13, 14, 15)
- 4 new tables (`user_nudges_sent`, `leaderboard_snapshots`, `quest_definitions`, `user_daily_quests`) + `users` fields for opt-in

**Session C (deferred — separate turn):**
- Visual celebrations library (confetti/hearts/sparkles/badge-collect) — CSS-only, no deps
- Sound effects — **blocker:** I can't generate binary MP3s. Would need user to drop 5 files in `web/public/sounds/` or accept silent fallback
- Haptic JS utility
- Community feed (1 table + endpoint + `/community` public page)
- Trend chart (Chart.js CDN) on pet-score page
- Social proof on achievement cards

**Other notes:**
- Frontend "tier-up redirect" not auto-wired into submit handlers — they'd need to check `new_achievements.length > 0` from the API response. Adding now would touch 5 more Astro pages; deferring to a follow-up.
- Admin redeem endpoint exists but no admin UI page yet — admin can use Baserow direct editing OR call the API with admin credentials.
- Profile completion percent uses a 18-field core subset (not the full 50 from Pet Passport Pro) — close enough for `profile_complete` achievement to trigger meaningfully.
- Real-world unlock test for pet 12 currently shows 0 newly unlocked because pet 12 in dev DB has no completed vaccines / streak / matches. System verified to be callable + idempotent; will unlock organically as user data accumulates.

---

## How to verify locally

```bash
# Sanity
curl http://127.0.0.1:3010/  # → 0.34.0
curl -b "vowvet_session=<JWT>" http://127.0.0.1:3010/api/v1/achievements/pets/12 | jq '.summary'
curl -b "vowvet_session=<JWT>" http://127.0.0.1:3010/api/v1/rewards/pets/12/unlockable | jq '.unlockable | length'

# E2E
cd C:/docker/vowvet
bun run scripts/e2e-gamification-a.ts   # 37/37 pass

# Browser
# /pets/12/achievements → grid + filter tabs + summary
# /pets/12/rewards → 3 tabs (unlockable / locked / claimed)
# /pets/12/pet-score?celebrate=1 → celebration overlay fires after 1.5s
# /rewards/<claimId> (after claiming one) → voucher with copy-code + status
```

---

## Resume Session B

Run:
```bash
cat BUILD_PROGRESS.json
# → see "gamification_session_a": "complete"
# Future Claude turn: build Session B (nudges, leaderboard, quests, mood)
```
