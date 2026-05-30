# Gamification — Session B Report (Engagement Layer)
**Date:** 2026-05-19 · **API:** 0.34.0 → **0.35.0** · **E2E:** 39/39 pass

Engagement layer of the gamification system: real-time pet mood mascot, daily quests (15 templates, 3/day auto-assigned), smart nudges (5 types, twice-an-hour scan within waking window), and a public Pet Score leaderboard with opt-in privacy. Three new cron jobs wire it all together.

Session C (visual celebrations + sound + haptic + community feed + charts) remains deferred for a follow-up turn.

---

## What shipped

### Backend
- **4 new tables** (ids 700–703): `user_nudges_sent`, `leaderboard_snapshots`, `quest_definitions`, `user_daily_quests`
- **3 new users fields**: `show_in_leaderboard` (boolean opt-in), `leaderboard_pet_id` (link_row → pets), `public_display_name` (alias)
- **15 quest templates seeded** across 3 difficulties (1 easy + 1 medium + 1 hard pool — random 3/day, deterministic per (user, pet, date))
- **4 service libs**: `pet-mood.ts` (6 states), `daily-quests.ts` (assign + complete + trigger-track), `pet-leaderboard.ts` (live + snapshot), `nudges.ts` (5 detectors + dedupe-by-day)
- **4 routes**: `/api/v1/mood/*`, `/api/v1/quests/*`, `/api/v1/leaderboard/*` (PUBLIC list + auth opt-in/out), `/api/v1/nudges/*`
- **3 cron jobs**:
  - Job 12 — `0 7,9,11,13,15,17,19,21 * * *` — smart nudges (one highest-priority opportunity per pet, dedupe by `nudge_key` within day)
  - Job 13 — `5 7 * * *` — assign daily quests for all pets (5min after Job 1 to avoid Baserow burst)
  - Job 14 — `0 1 1 * *` — monthly Pet Score leaderboard snapshot (1st of month, 1AM)
- **2 endpoint hooks** added for auto-quest completion: `POST /pets/:id/check-in` (trigger `checkin`) and `POST /pets/:id/bcs/assess` (trigger `bcs_check`). Both return `completed_quests: []` alongside `new_achievements: []` in the response so frontend can celebrate either layer.

### Frontend
- **`/leaderboard`** — PUBLIC (in middleware `PUBLIC_EXACT`). Podium top-3 + ranked table. Filters: period (this_month/last_month/all_time) + species (all/dog/cat).
- **`/pets/[id]/quests`** — auth. Shows today's 3 quests with difficulty badges, "✓ Hoàn thành" button (manual), inline completion check. 21-day history in `<details>`.
- **Pet detail card** — Achievements/Rewards/Quests now in 3-col grid (was 2-col).
- **Dashboard widgets** (auth, only when `firstPetId` exists):
  - **Pet Mood mascot** — colored card (6 states × 6 colors), pet-personalized message
  - **Today's Quests** — pulse-progress chip row with mini emoji previews + completed-count
  - **Pet Score Leaderboard link** — entry point

---

## Pet Mood — 6 states

Computed live by `calculatePetMood(petId, userId, now?)`:

| State | Trigger (precedence order) | Color | Emoji | Sample message |
|---|---|---|---|---|
| `sleeping` | Local hour 22–06 | indigo | 💤 | "Bé đang ngon giấc. Chúc bạn ngày mới năng lượng!" |
| `sad`      | Overdue vaccine OR Pet Score < 300 | orange | 😔 | "Pet Score đang thấp ({score})…" |
| `needy`    | Streak ≥ 3 active + no check-in today + hour ≥ 12 | amber | 🥺 | "Chuỗi N ngày của {name} sắp đứt…" |
| `excited`  | Achievement unlocked within last 24h | violet | 🤩 | "{name} vừa unlock huy hiệu mới!" |
| `happy`    | Pet Score ≥ 700 AND streak ≥ 7 | emerald | 😊 | "{name} đang khỏe + bạn chăm sóc rất đều" |
| `chill`    | Default (everything OK) | sky | 😌 | "{name} đang ổn. Hôm nay làm gì cùng bé?" |

Mood reads real signals from `routine_streaks`, `daily_check_ins`, `vaccines`, `user_achievements`, and `pet-score.getPetScore`. Verified L2 tests: `23:30 → sleeping`, `06:30 → NOT sleeping`.

---

## Daily Quests — 15 templates

Difficulty distribution: 4 easy / 5 medium / 6 hard. Each quest:
- Has a `trigger_condition` (e.g., `checkin`, `bcs_check`, `playdate_swipe`) that auto-completes via endpoint hooks
- Awards `pet_score_bonus` (5–60 pts) added to `user.pet_score_bonus` accumulator → Pet Score cache invalidates → next compute reflects bonus

Selection logic (idempotent per day):
1. First call of day for (user, pet) → randomly picks **1 easy + 1 medium + 1 hard**
2. Persists to `user_daily_quests` with `assigned_date = YYYY-MM-DD`
3. Same-day re-fetches return the **exact same 3 quests** (verified L3)

Completion paths:
- **Manual**: User taps "✓ Hoàn thành" in `/pets/[id]/quests` → `POST /quests/.../:code/complete`
- **Auto**: Endpoint hook fires `trackQuestTrigger(userId, petId, "checkin")` → completes any open quest with matching `trigger_condition`

Quest list:
| code | difficulty | bonus | trigger | notes |
|---|---|---|---|---|
| view_pet_score | easy | 5 | view_pet_score | manual-only currently |
| checkin_today | easy | 10 | checkin | auto via /check-in |
| read_faq | easy | 10 | read_faq | manual-only |
| check_weather | easy | 10 | check_weather | manual-only |
| upload_photo | easy | 15 | upload_photo | manual |
| check_water | medium | 20 | check_water | manual (no auto hook yet) |
| log_meal | medium | 20 | log_meal | manual |
| share_pet | medium | 25 | share_pet | manual |
| voice_diary | medium | 25 | voice_diary | manual |
| routine_complete | medium | 30 | routine_complete | manual |
| playdate_swipe | hard | 35 | playdate_swipe | manual |
| place_checkin | hard | 40 | place_checkin | manual |
| bcs_check | hard | 50 | bcs_check | **auto via /bcs/assess** ✓ |
| pet_score_increase | hard | 50 | pet_score_increase | manual |
| help_hero | hard | 60 | help_hero | manual |

Future work: wire more auto-triggers (voice_diary, water, routine_complete) when those endpoints get touched.

---

## Pet Score Leaderboard — opt-in public ranking

Different from M27 `/heroes/leaderboard` (which ranks by helping count). This ranks pets by Pet Score.

**Privacy by default**: `users.show_in_leaderboard` defaults to `false`. Opt-in via:
```
POST /api/v1/leaderboard/opt-in
body: { pet_id: 12, display_name: "My alias" }
```

Once opted-in, the user can:
- Filter their featured pet via `leaderboard_pet_id` (defaults to first pet)
- Use a `public_display_name` alias instead of real name
- Opt out anytime via `POST /api/v1/leaderboard/opt-out`

**Periods supported**:
- `this_month` — live computation (scan opted-in users → compute Pet Score)
- `all_time` — same as `this_month` for now (no historic differentiation yet)
- `last_month` — reads from `leaderboard_snapshots` if available (populated by Job 14)

**Species filter**: `?species=dog|cat` restricts to that species (uses `pet.species` field).

Verified L7: opt-in adds user to leaderboard, opt-out removes them.

---

## Smart Nudges — 5 detectors

`findNudgeOpportunities(userId, petId)` returns sorted by priority (highest first):

| Type | Priority | Trigger | Sample copy |
|---|---|---|---|
| `streak_at_risk` | 100 | streak ≥ 3 active, no check-in today, hour ≥ 16 | "🔥 Chuỗi N ngày sắp đứt!" |
| `reward_expiring` | 90 | claimed voucher with `expires_at` < 3 days | "⏰ Voucher sắp hết hạn" |
| `tier_close` | 80 | Pet Score ≥ 80% of next tier threshold | "🥈 Sắp lên silver!" |
| `achievement_close` | 70 | vaccine/streak/hero achievement at ≥ 70% progress | "💉 Sắp unlock Vaccine Pro!" |
| `profile_completion` | 50 | core profile fields < 50% filled | "📋 Profile bé chỉ N% — hoàn thiện thêm" |

**Cron flow (Job 12)** — every 2h within 7am–9pm:
1. Scan all pets whose owner has `push_subscription`
2. For each pet, find opportunities via the 5 detectors
3. If any found, attempt to send the **highest-priority one only**
4. **Dedupe by (user, pet, nudge_key, day)** — same nudge won't fire twice today
5. Persist to `user_nudges_sent` regardless of push delivery success (so we don't re-fire if push silently failed)
6. Outside waking hours → skip the entire run (`runDueNudges` returns early)

Response tracking endpoints: `POST /api/v1/nudges/:id/dismiss` and `/clicked` mark `response` field for analytics.

---

## Files

### New (10)
```
scripts/migrate-gamification-b.ts        — 4 tables + users.3-fields, idempotent
scripts/seed-quests.ts                    — 15 quest templates
scripts/e2e-gamification-b.ts             — 39 tests
api/src/lib/pet-mood.ts                   — calculatePetMood (6 states)
api/src/lib/daily-quests.ts               — assign/complete/track-trigger/bulk-assign
api/src/lib/pet-leaderboard.ts            — getLeaderboard + opt-in/out + monthly snapshot
api/src/lib/nudges.ts                     — 5 detectors + sendNudgeIfNew + runDueNudges
api/src/routes/mood.ts                    — GET /mood/pets/:petId
api/src/routes/quests.ts                  — today + complete + history
api/src/routes/pet-leaderboard.ts         — PUBLIC list + auth opt-in/out/my-status
api/src/routes/nudges.ts                  — list opps + dismiss/clicked
web/src/pages/leaderboard.astro           — PUBLIC podium + filterable table
web/src/pages/pets/[id]/quests.astro     — daily quests + 21-day history
```

### Modified (6)
```
shared/baserow-config.ts                  — +4 TableName entries
api/src/index.ts                          — 4 route mounts + version 0.34.0 → 0.35.0
api/src/scheduler.ts                      — +3 cron jobs (12, 13, 14)
api/src/routes/pets.ts                    — check-in submit now tracks `checkin` quest
api/src/routes/bcs.ts                     — assess now tracks `bcs_check` quest
web/src/middleware.ts                     — `/leaderboard` added to PUBLIC_EXACT
web/src/pages/dashboard.astro             — mood mascot + quest preview + leaderboard link
web/src/pages/pets/[id].astro             — Achievements/Rewards/Quests 3-col grid
BUILD_PROGRESS.json                       — session 11 entry, gamification_session_b complete
```

---

## E2E results — 39/39 passing

```
=== Migration + seeds (5) ===
✅ ≥15 quest defs seeded, all 3 difficulties represented
✅ leaderboard_snapshots, user_daily_quests, user_nudges_sent tables exist

=== API endpoints (12) ===
✅ T1   GET /quests/pets/:id/today → 200 + 3 quests with definitions
✅ T2   GET /mood/pets/:id → 200 + state in valid enum + emoji + message
✅ T3   GET /nudges/pets/:id → 200 + opportunities array
✅ T4   GET /leaderboard PUBLIC (no auth) → 200 + entries + period
✅ T5   GET /leaderboard/my-status → 200 + opted_in boolean
✅ T6   GET /quests/pets/:id/history → 200 + history array

=== Pure logic (10) ===
✅ L1   calculatePetMood returns valid state + color_class
✅ L2   23:30 → sleeping, 06:30 → NOT sleeping (window logic)
✅ L3   Same-day re-fetch returns identical quest set (idempotent)
✅ L4   Quest mix is exactly 1 easy + 1 medium + 1 hard
✅ L5   findNudgeOpportunities callable (2 opportunities for pet 12)
✅ L6   getLeaderboard returns array
✅ L7   Opt-in adds user to leaderboard; opt-out removes

=== Frontend (7) ===
✅ P1   /leaderboard PUBLIC → 200 + leaderboardPage + Pet Score Top markers
✅ P2   /pets/:id/quests → 200 + questsPage + "Quest hôm nay"
```

---

## How to verify locally

```bash
# Version + cron count
curl http://127.0.0.1:3010/                                      # → 0.35.0
docker logs vowvet-api 2>&1 | grep "14 jobs scheduled"           # → confirmation

# E2E
cd C:/docker/vowvet
bun run scripts/e2e-gamification-b.ts                            # 39/39

# Public leaderboard (no cookie needed)
curl http://127.0.0.1:3010/api/v1/leaderboard?period=this_month  # entries array

# Manually fire one nudge cycle (don't wait for cron)
bun -e "import {runDueNudges} from './api/src/lib/nudges.ts'; const r = await runDueNudges(); console.log(r)"

# Manually fire quest assignment (instead of waiting for 7:05AM)
bun -e "import {assignDailyQuestsForAllPets} from './api/src/lib/daily-quests.ts'; const r = await assignDailyQuestsForAllPets(); console.log(r)"
```

---

## Known limitations / Session C scope

**Session C (next turn — `BUILD_PROGRESS.json` ready):**
- Visual celebrations library (confetti, hearts, sparkles, badge-collect) — CSS-only
- Sound effects — **blocker:** can't generate MP3s from a text tool; user needs to drop 5 files in `web/public/sounds/` or accept silent fallback
- Haptic JS utility
- Community feed (table + endpoint + `/community` public page)
- Trend chart (Chart.js CDN) on pet-score page
- Social proof on achievement cards

**Out of scope for this session:**
- District-based leaderboard ranking (users don't have a `district` field yet)
- Server-side push notification scheduling for time-zoned users (currently uses node-cron with `Asia/Ho_Chi_Minh`)
- Auto-trigger for `voice_diary`/`check_water`/`routine_complete`/`place_checkin` quests — kept manual to limit hook proliferation; can be wired when those endpoints get touched
- Nudge A/B testing / copy variants
- Quest streak (consecutive days completing all 3) — would be a nice "meta" achievement

---

## Resume Session C

```bash
cat BUILD_PROGRESS.json
# → see "gamification_session_b": "complete"
# Next Claude turn: build Session C
```
