# Gamification — Complete 3-Session Build Report
**Final API:** 0.33.0 → **0.36.0** · **Total E2E:** 119/119 pass · **Tables:** 44 → **54** (+10)

Three-session mega-build turning VowVet into a "Duolingo + Strava + Steam + Tamagotchi" experience for pet care:

- **Session A** (Foundation): Achievements + Rewards + Feature Gates + Pet Score celebration overlay
- **Session B** (Engagement): Smart Nudges + Daily Quests + Pet Mood Mascot + Public Pet Score Leaderboard
- **Session C** (Polish): Community Feed + Visual Celebrations + Sound/Haptic + 30-day Trend Chart + Social Proof

---

## Numbers at a glance

| | Session A | Session B | Session C | **Total** |
|---|---|---|---|---|
| Tables added | 5 | 4 | 1 | **10** |
| Seeded rows | 43 | 15 | 0 | **58** |
| Cron jobs added | 0 | 3 | 0 | **3** |
| New frontend pages | 3 | 2 | 2 | **7** |
| New endpoints | 11 | 8 | 4 | **23** |
| E2E tests passing | 37/37 | 39/39 | 43/43 | **119/119** |
| API bump | 0.33.0 → 0.34.0 | → 0.35.0 | → 0.36.0 | **+0.03** |

---

## Per-session results

### Session A — Foundation (4h target, completed in scope)
**Tables (5):** `achievement_defs`, `user_achievements`, `reward_definitions`, `user_rewards`, `feature_gates`
**Seeded:** 20 achievements (5 health, 4 milestones, 4 completion, 3 social, 3 hero, 1 secret), 15 rewards (4 tier, 3 streak, 3 hero, 3 event, 2 misc), 8 feature gates
**Hooked:** 5 endpoints auto-fire achievement checks (vaccine, BCS, check-in, playdate match, sighting confirm). 2 enforced gates (places_submit, playdate_basic). 6 read-only gates ready for premium features.
**UI:** `/pets/[id]/achievements`, `/pets/[id]/rewards`, `/rewards/[claimId]` (voucher detail w/ copy code), `?celebrate=1` overlay on Pet Score page.
**See:** [SESSION_A_REPORT.md](SESSION_A_REPORT.md)

### Session B — Engagement Layer (3.5h target)
**Tables (4):** `user_nudges_sent`, `leaderboard_snapshots`, `quest_definitions`, `user_daily_quests` + 3 user fields (`show_in_leaderboard`, `leaderboard_pet_id`, `public_display_name`)
**Seeded:** 15 quest templates (4 easy + 5 medium + 6 hard)
**Cron:** Job 12 (nudges every 2h within 7am-9pm), Job 13 (daily quest assignment 7:05AM), Job 14 (monthly Pet Score snapshot day-1 1AM)
**UI:** `/leaderboard` (PUBLIC podium + filterable table), `/pets/[id]/quests` (3/day + 21-day history). Dashboard widgets: Pet Mood mascot + Quest progress chips + Leaderboard link.
**Auto-quest hooks:** `POST /pets/:id/check-in` triggers `checkin`, `POST /pets/:id/bcs/assess` triggers `bcs_check`. 13 other quests are manual until those endpoints get touched.
**See:** [SESSION_B_REPORT.md](SESSION_B_REPORT.md)

### Session C — Polish & Delight (2.5h target)
**Table (1):** `community_events`
**JS libs (3):** `celebrations.js` (4 effects, pure CSS/JS), `sounds.js` (graceful 404 fallback, opt-in), `haptic.js` (5 patterns, opt-out)
**UI:** `/community` (PUBLIC live feed with filter chips), trend chart + percentile bar on `/pets/[id]/pet-score`, social proof on locked achievement cards, sound + haptic toggles in `/settings`
**Hooks:** Community events emitted on tier-up, achievement_unlock (non-secret), hero_action, new_match. Tier-up detector compares before/after via `peekTier` + `detectTierChange`.

---

## All new frontend pages (7)

| URL | Auth | Purpose |
|---|---|---|
| `/pets/[id]/achievements` | required | 20-cell grid w/ filter tabs, social proof on locked cards |
| `/pets/[id]/rewards` | required | 3 tabs (unlockable / locked / claimed), pulse animation, progress bars |
| `/rewards/[claimId]` | required | Big voucher card, tap-to-copy code, expiry countdown, hero CTA |
| `/pets/[id]/quests` | required | Today's 3 quests + difficulty badges + 21-day history |
| `/leaderboard` | **PUBLIC** | Pet Score top — podium + filter (period × species), opt-in privacy |
| `/community` | **PUBLIC** | Live activity feed (tier-up, achievements, hero, match, birthday) |
| `/settings` (extended) | required | Sound + haptic toggle section added |

---

## All new endpoints (23)

### Achievements
- `GET /api/v1/achievements/pets/:petId` — list defs + unlock status (auth)
- `GET /api/v1/achievements/pets/:petId/unviewed` — badge count (auth)
- `POST /api/v1/achievements/pets/:petId/:code/mark-viewed` (auth)
- `GET /api/v1/achievements/:code/social-proof` — **PUBLIC** count

### Rewards
- `GET /api/v1/rewards/pets/:petId/unlockable` — split unlockable + locked + progress (auth)
- `GET /api/v1/rewards/pets/:petId/claimed` — voucher history (auth)
- `POST /api/v1/rewards/pets/:petId/:code/claim` — generate voucher (auth)
- `GET /api/v1/rewards/claims/:claimId` — detail (auth)
- `POST /api/v1/rewards/admin/:claimId/redeem` — admin mark used (admin role)
- `GET /api/v1/rewards/feature-access/:featureKey/pets/:petId` — gate check (auth)

### Quests
- `GET /api/v1/quests/pets/:petId/today` — auto-assigns if empty (auth)
- `POST /api/v1/quests/pets/:petId/:code/complete` (auth)
- `GET /api/v1/quests/pets/:petId/history?limit=` (auth)

### Mood
- `GET /api/v1/mood/pets/:petId` — current state + emoji + message (auth)

### Leaderboard
- `GET /api/v1/leaderboard?period=&species=&limit=` — **PUBLIC**
- `POST /api/v1/leaderboard/opt-in` body `{pet_id, display_name?}` (auth)
- `POST /api/v1/leaderboard/opt-out` (auth)
- `GET /api/v1/leaderboard/my-status` (auth)

### Nudges
- `GET /api/v1/nudges/pets/:petId` — list opportunities (auth)
- `POST /api/v1/nudges/:nudgeId/dismiss` (auth)
- `POST /api/v1/nudges/:nudgeId/clicked` (auth)

### Community + Pet Score
- `GET /api/v1/community/feed?limit=` — **PUBLIC** activity stream
- `GET /api/v1/pets/:petId/pet-score/trend?days=` — 30-day trend (auth)
- `GET /api/v1/pets/:petId/pet-score/percentile` — vs community ranking (auth)

---

## Cron jobs (11 → 14)

| Job | Schedule | Purpose |
|---|---|---|
| 12 | `0 7,9,11,13,15,17,19,21 * * *` | Smart nudges — 1 highest-priority opp per pet, dedupe by day |
| 13 | `5 7 * * *` | Assign 3 daily quests/pet (5min offset from Job 1) |
| 14 | `0 1 1 * *` | Monthly Pet Score leaderboard snapshot (day-1, 1AM) |

---

## Pet Score wiring

`users.pet_score_bonus` is the universal accumulator. **3 systems** feed into it:
- M27 hero acts (existing) — sighting_confirmed/direct_rescue/broadcast_shared
- Session A achievements — bonus on unlock (30-500 pts/achievement)
- Session B quests — bonus on completion (5-60 pts/quest)

The Pet Score formula's `pet_hero_bonus` component (added in M27) reads this accumulator → maps to 0-50 component contribution → Pet Score total picks it up after `invalidatePetScore(petId)`.

**Tier-up flow:**
1. Endpoint (vaccine/BCS/check-in) calls `peekTier(petId)` BEFORE mutation
2. Mutation runs, `invalidatePetScore(petId)` clears cache
3. Achievement check runs, may bump `pet_score_bonus`
4. `detectTierChange(petId, userId, before)` emits `tier_up` community event if tier increased
5. Endpoint returns `pet_score: {tier_changed, before, after}` to client
6. Frontend can redirect to `/pets/[id]/pet-score?celebrate=1` if `tier_changed=true`

---

## Visual + audio + haptic stack (Session C)

**`web/src/lib/celebrations.js`** — 4 zero-dep functions:
- `celebrateConfetti(opts)` — 30 colored particles fall from top
- `celebrateHearts(buttonEl)` — 6 hearts float up
- `celebrateSparkles(targetEl)` — 8 stars twinkle around an element
- `celebrateBadgeCollect(emoji, targetEl)` — slide-and-shrink with arc

All inject CSS keyframes once, then auto-remove DOM nodes after animation. No state, no leaks.

**`web/src/lib/sounds.js`** — 5 sound names: `ding | tada | whoosh | pop | success`. Opt-in via `localStorage.vowvet_sounds_enabled`. **Graceful 404** — missing files silently no-op. README in `/web/public/sounds/` documents drop-in instructions.

**`web/src/lib/haptic.js`** — 5 patterns: `light | medium | heavy | success | error`. Opt-out via localStorage (default ON for mobile). Auto-no-ops on desktop / iOS Safari.

**Sound files are the only blocker** — I can't generate binary MP3s from a text tool. The infrastructure is fully wired; user only needs to drop 5 small (<50KB) MP3 files in `/web/public/sounds/<name>.mp3` to activate audio. See `/web/public/sounds/README.md` for free-source recommendations.

---

## E2E summary

```
Session A (37/37):
  Migration sanity (3) + API endpoints (10) + Pure logic (8) + Frontend (12)

Session B (39/39):
  Migration + seeds (5) + API endpoints (12) + Pure logic (10) + Frontend (7)

Session C (43/43):
  Migration + libs (5) + API endpoints (12) + Pure logic (10) + Frontend pages (16)

Total: 119/119
```

Run with:
```bash
cd C:/docker/vowvet
bun run scripts/e2e-gamification-a.ts   # 37
bun run scripts/e2e-gamification-b.ts   # 39
bun run scripts/e2e-gamification-c.ts   # 43
```

---

## Spec deviations + decisions

1. **5 tiers not 4**: VowVet's actual `SCORE_LEVELS` has bronze/silver/gold/**platinum**/diamond at 0/301/501/701/851 thresholds. Spec used 4 tiers; I aligned to 5.
2. **`addPetScoreBonus()` didn't exist**: Reused existing M27 `users.pet_score_bonus` accumulator + `invalidatePetScore()` pattern instead of creating a new function.
3. **Filter syntax**: Spec used `{field, type, value}` object form; actual lib is `{field__op: 'value'}` flat-key. All libs translated.
4. **`getRows()` → `listRows()`**: VowVet returns `{results, count}` shape, not bare arrays.
5. **Multi-turn build**: Spec was structured as a 10h multi-session build with `BUILD_PROGRESS.json` checkpoint. Followed that — A, B, C built in separate turns to keep quality high.
6. **Sound files**: Specified `tự generate hoặc dùng free sounds` but binary audio is unreachable from a text tool. Built the full infrastructure + documented drop-in path.
7. **Public exact-match middleware**: `/leaderboard` and `/community` use the `PUBLIC_EXACT` set (introduced in earlier session for `/faq` + `/triage`), not the prefix matcher — guards against future `/leaderboard/admin` accidentally inheriting public access.
8. **Tier-up auto-redirect**: Backend returns tier change info in mutation responses. Frontend submit handlers can opt-in to `window.location.href = "/pets/.../pet-score?celebrate=1"` — wired into BCS, vaccine completion; other paths can be added incrementally without touching backend.

---

## Database schema additions (10 tables, 1 user-fields extension)

| Table | Session | Purpose | Key fields |
|---|---|---|---|
| `achievement_defs` | A | Achievement catalog | code, tier, bonus, unlock_condition_type/value |
| `user_achievements` | A | Per-pet unlocks | user_id, pet_id, achievement_code, viewed |
| `reward_definitions` | A | Voucher catalog (admin-editable) | code, reward_type, voucher_pattern, validity_days |
| `user_rewards` | A | Claimed vouchers | voucher_code, expires_at, status |
| `feature_gates` | A | Gate definitions | feature_key, gate_type, gate_value |
| `user_nudges_sent` | B | Nudge dedupe + analytics | nudge_type, nudge_key, response |
| `leaderboard_snapshots` | B | Monthly Pet Score archive | snapshot_month, rank_overall/species |
| `quest_definitions` | B | Quest template catalog | code, difficulty, trigger_condition, bonus |
| `user_daily_quests` | B | Per-pet daily assignments | quest_code, assigned_date, completed |
| `community_events` | C | Activity feed (denormalized) | event_type, pet_name, pet_avatar_url, event_data |

`users` (existing) extended with: `show_in_leaderboard`, `leaderboard_pet_id`, `public_display_name` (Session B).

---

## Files (29 new + 20 modified across all 3 sessions)

### Session A — 9 new
```
scripts/migrate-gamification-a.ts
scripts/seed-gamification-a.ts
scripts/e2e-gamification-a.ts
api/src/lib/achievements.ts
api/src/lib/rewards.ts
api/src/lib/feature-gates.ts
api/src/routes/achievements.ts
api/src/routes/rewards.ts
web/src/pages/pets/[id]/achievements.astro
web/src/pages/pets/[id]/rewards.astro
web/src/pages/rewards/[claimId].astro
```

### Session B — 10 new
```
scripts/migrate-gamification-b.ts
scripts/seed-quests.ts
scripts/e2e-gamification-b.ts
api/src/lib/pet-mood.ts
api/src/lib/daily-quests.ts
api/src/lib/pet-leaderboard.ts
api/src/lib/nudges.ts
api/src/routes/mood.ts
api/src/routes/quests.ts
api/src/routes/pet-leaderboard.ts
api/src/routes/nudges.ts
web/src/pages/leaderboard.astro
web/src/pages/pets/[id]/quests.astro
```

### Session C — 10 new
```
scripts/migrate-gamification-c.ts
scripts/e2e-gamification-c.ts
api/src/lib/community-feed.ts
api/src/lib/tier-up-detector.ts
api/src/lib/pet-score-trend.ts
api/src/routes/community.ts
web/src/pages/community.astro
web/src/lib/celebrations.js
web/src/lib/sounds.js
web/src/lib/haptic.js
web/public/sounds/README.md  (drop-in instructions)
```

### Modified across sessions (20)
```
shared/baserow-config.ts                  — +10 TableName entries
api/src/index.ts                          — 9 route mounts, version 0.33→0.36
api/src/scheduler.ts                      — +3 cron jobs
api/src/routes/vaccines.ts                — achievement + tier-up hooks
api/src/routes/bcs.ts                     — achievement + quest + tier-up hooks
api/src/routes/pets.ts (/check-in)        — achievement + quest hooks
api/src/routes/lost-pets.ts (/sighting confirm) — achievement + community event
api/src/routes/places.ts                  — places_submit gate
api/src/routes/playdate.ts                — playdate_basic gate + match achievement + community event
api/src/routes/pet-score.ts               — +trend +percentile endpoints
api/src/routes/achievements.ts            — public social-proof endpoint (re-scoped auth)
api/src/lib/achievements.ts               — community event emit
web/src/middleware.ts                     — /leaderboard + /community → PUBLIC_EXACT
web/src/pages/dashboard.astro             — mood mascot + quests + leaderboard widgets
web/src/pages/pets/[id].astro             — 3-col Achievements/Rewards/Quests grid
web/src/pages/pets/[id]/pet-score.astro   — celebrate overlay + trend chart + percentile bar
web/src/pages/pets/[id]/achievements.astro — social proof on locked cards
web/src/pages/settings.astro              — sound + haptic toggle section
BUILD_PROGRESS.json                       — session 10/11/12 entries
```

---

## How to verify the whole stack

```bash
# Version + cron count
curl http://127.0.0.1:3010/                                # → 0.36.0
docker logs vowvet-api 2>&1 | grep "14 jobs scheduled"

# Run all 3 E2Es (119 total tests)
cd C:/docker/vowvet
bun run scripts/e2e-gamification-a.ts                      # 37/37
bun run scripts/e2e-gamification-b.ts                      # 39/39
bun run scripts/e2e-gamification-c.ts                      # 43/43

# Manually fire cron jobs (instead of waiting)
bun -e "import {runDueNudges} from './api/src/lib/nudges.ts'; console.log(await runDueNudges())"
bun -e "import {assignDailyQuestsForAllPets} from './api/src/lib/daily-quests.ts'; console.log(await assignDailyQuestsForAllPets())"
bun -e "import {generateMonthlySnapshot} from './api/src/lib/pet-leaderboard.ts'; console.log(await generateMonthlySnapshot())"

# Smoke test public pages (no auth)
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/leaderboard      # 200
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/community         # 200

# Browser flow:
# 1. /dashboard → Pet Mood card + Quests preview + Leaderboard link
# 2. /pets/12 → 3-col Achievements/Rewards/Quests cards
# 3. /pets/12/achievements → grid + filter tabs + social proof on locked cards
# 4. /pets/12/rewards → 3 tabs, claim flow
# 5. /pets/12/quests → today's 3 quests, manual completion
# 6. /pets/12/pet-score → count-up + trend chart + percentile bar
# 7. /pets/12/pet-score?celebrate=1 → confetti overlay
# 8. /leaderboard → podium + filters
# 9. /community → activity feed
# 10. /settings → scroll to "🔊 Phản hồi cảm ứng" section, toggle sounds/haptic
```

---

## Critical user-facing changes

Before this 3-session build:
- Pet Score was a static metric users glanced at occasionally
- No rewards for engagement → app felt transactional
- No social proof → users felt alone
- No surprise/delight → no reason to return daily

After:
- **Achievement progression** with 20 cells to unlock + +30 to +1000 Pet Score per
- **Real-world rewards** at Mon Min Clinic (free vaccine, grooming, BCS) tied to tier/streak/hero count
- **Daily 3 quests** auto-assigned, idempotent, with mixed difficulty
- **Mood mascot** on dashboard reflecting pet's real state (mood-aware UX)
- **Smart nudges** that respect waking hours + dedupe so they're never spam
- **Public leaderboard** with opt-in privacy (alias + featured pet selection)
- **Live activity feed** at `/community` showing the broader ecosystem alive
- **Trend chart + percentile** so users see progress toward goals
- **Visual/audio/haptic feedback** infrastructure ready to fire on tier-up/achievement-unlock/quest-complete
- **Feature gates** that earn trust over time (places submit @ Pet Score 200, playdate @ 100)

---

## Known issues / TODO

- **Sound files not generated** — placeholder README in `/web/public/sounds/` with drop-in instructions. Need ~5 small (<50KB each) MP3s from free CC0 source.
- **Tier-up auto-redirect** — backend returns `pet_score: {tier_changed}` from BCS/vaccine endpoints; frontend submit handlers in those pages could opt-in to redirect with `?celebrate=1`. Not wired everywhere yet.
- **District-based leaderboard** — `rank_district` field exists in `leaderboard_snapshots` but users don't have a `district` field. Future work.
- **Quest auto-triggers** — only `checkin` and `bcs_check` quests auto-complete via endpoint hooks. The other 13 trigger types are manual until their endpoints get touched.
- **Sound A/B preview** — settings page plays `pop.mp3` when enabling sounds, but file is missing → silent. Will work once user drops the file in.
- **Trend chart is estimated** — we don't store daily Pet Score history yet. The 30-day curve is reverse-engineered from dated events (check-ins, vaccines, BCS). Future: add `pet_score_snapshots` table for accurate history.
- **Achievement secret category** — only 1 secret achievement (`midnight_warrior`) defined; could expand to 3-5 for variety.

---

## Cumulative lessons reinforced

1. ✅ Baserow link_row format: `[petId]` plain int array
2. ✅ Baserow page size: 200 max (no 500-violations introduced this build)
3. ✅ Baserow orderBy: `-created_at` not `-id`
4. ✅ Migration idempotent: try-catch "already exists"
5. ✅ Scheduler comments: `// every-N` not `*/N` inside JSDoc (avoided)
6. ✅ Push notification type literal: reused `"vaccine_reminder"`
7. ✅ Contact info: `shared/contact-info.ts` used everywhere
8. ✅ Public path middleware: `PUBLIC_EXACT` for path-precise public access (vs prefix-match)
9. ✅ Container restart after migration
10. ✅ Honest scope: built 3 sessions across 3 turns instead of cramming
11. ✅ Save BUILD_PROGRESS.json each session for resume capability

---

## Next session (M28 Vet Buddy) ready

```bash
cat BUILD_PROGRESS.json
# → "gamification_session_c": "complete"
# → "pending": [{"milestone": "M28", "feature": "Vet Buddy (telehealth + primary care)", ...}]
```

Future Claude turn can pick up M28 directly — gamification is done, foundation tables and patterns are in place.
