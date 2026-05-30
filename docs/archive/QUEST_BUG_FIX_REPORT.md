# VowVet — Quest BUG fix Report

**Date:** 2026-05-20
**Severity:** CRITICAL — gameable Pet Score
**Result:** ✅ Fixed. 34/34 E2E checks pass.

---

## The bug

`/pets/{id}/quests` rendered a button **"✓ Hoàn thành"** for each pending quest. Clicking it called `POST /api/v1/quests/pets/:petId/:code/complete`, which marked the quest done and credited `pet_score_bonus` (15–60 points per quest) without the user doing the real action.

This violated the gamification design: users could click 3 buttons and gain 50–135 Pet Score per day for **zero effort**. The Leaderboard, achievement unlocks, and feature-gate thresholds (which gate playdate / places-submit) all relied on Pet Score being earned. The bug made the entire economy gameable.

---

## What was fixed

### Step 1 — REMOVED `POST /quests/.../complete`

`api/src/routes/quests.ts` no longer exports the manual completion route. The file header now documents *why* it's gone. Verified live:

```
POST /api/v1/quests/pets/12/upload_photo/complete  →  404
```

### Step 2 — Frontend `quests.astro` rewritten

| Before | After |
|---|---|
| `<button @click="markComplete(q)">✓ Hoàn thành</button>` | `<a :href="q.cta_link">Bắt đầu →</a>` |
| `async markComplete(q) { fetch('.../complete', POST) }` JS | Removed entirely |
| No explanation for user | Amber help banner: "Bấm Bắt đầu → để mở feature. Khi bạn hoàn thành hành động thật, quest sẽ tự đánh dấu hoàn thành" |
| Completed quest = green ✓ checkmark (passive) | Completed quest = `<span>` chip "✓ Đã xong" with completion timestamp tooltip |

There is **no longer any way for the frontend to mark a quest complete**. Network requests from the page are read-only (GET today + GET history).

### Step 3 — Backend hooks wired for all 15 trigger types

| # | Trigger | Wired at | How quest auto-completes |
|---|---|---|---|
| 1 | `checkin` | `pets.ts:517` (already existed) | After daily check-in POST succeeds |
| 2 | `upload_photo` | `pets.ts:1075` *(new)* | After `POST /:id/photos` saves to R2 + DB |
| 3 | `read_faq` | `quests.ts /track/read-faq` *(new)* | Frontend FAQ article page fires fetch on load |
| 4 | `view_pet_score` | `quests.ts /track/view-pet-score` *(new)* | Frontend pet-score page fires fetch on load |
| 5 | `log_meal` | `nutrition.ts:138` *(new)* | After `POST /:id/weight-log` saves entry |
| 6 | `voice_diary` | `voice-diary.ts:230` *(new)* | After `POST /:id/diary` creates entry |
| 7 | `check_water` | `water.ts:97` *(new)* | After `POST /:id/water` saves log |
| 8 | `routine_complete` | `routines.ts:373` *(new)* | After `POST /:id/routines/:rid/complete` — only if ≥1 task completed |
| 9 | `check_weather` | `quests.ts /track/check-weather` *(new)* | Frontend `/alerts` page fires fetch on load |
| 10 | `place_checkin` | `places.ts:212` *(new)* | After `POST /:placeId/checkin` saves |
| 11 | `playdate_swipe` | `playdate.ts:349` *(new)* | After `POST /swipe` IFF user has hit ≥10 swipes today |
| 12 | `bcs_check` | `bcs.ts:156` (already existed) | After BCS assessment AI computes score |
| 13 | `share_pet` | `quests.ts /track/share-pet` *(new)* | Frontend `_trackShare()` called in `copyUrl()` + `downloadQr()` |
| 14 | `help_hero` | `lost-pets.ts:610` *(new)* | After public sighting POST IFF spotter is authed — fires against spotter's first pet |
| 15 | `pet_score_increase` | `daily-quests.ts:251` *(new)* | Cascade inside `completeQuest()` — when any other quest worth ≥10pts completes |

### Step 4 — New track endpoints (for non-POST triggers)

For triggers that didn't have a natural action endpoint, added thin track endpoints under `/api/v1/quests/track/`:

```
POST /api/v1/quests/track/read-faq          (auth, body: {})
POST /api/v1/quests/track/view-pet-score    (auth, body: { pet_id })
POST /api/v1/quests/track/check-weather     (auth, body: {})
POST /api/v1/quests/track/share-pet         (auth, body: { pet_id, platform })
```

Each requires auth, validates pet ownership when `pet_id` is supplied, and falls back to the user's first pet for non-pet-scoped triggers. Returns `{ tracked: true, completed_quests: [...] }`.

Each track endpoint is wired from the relevant Astro page via a single `<script is:inline>` fetch call:

- `web/src/pages/faq/[slug].astro` — fires `read-faq` when an article opens
- `web/src/pages/pets/[id]/pet-score.astro` — fires `view-pet-score` on load
- `web/src/pages/alerts.astro` — fires `check-weather` on load
- `web/src/pages/pets/[id]/share.astro` — fires `share-pet` from `copyUrl()` / `downloadQr()`

### Step 5 — `pet_score_increase` cascade

Special case: completing any quest worth ≥10 points means today's bonus went up by ≥10, satisfying the `pet_score_increase` quest definition. Implemented inside `completeQuest()`:

```ts
if (questCode !== "pet_score_increase" && def.pet_score_bonus >= 10) {
  const psi = todays.find(q => !q.completed
    && q.definition?.trigger_condition === "pet_score_increase");
  if (psi) await completeQuest(userId, petId, psi.quest_code, date);
}
```

Recursion is safe — `completeQuest` is idempotent and the guard skips when `questCode === "pet_score_increase"`.

---

## E2E verification (34/34 pass)

`scripts/e2e-quest-bug-fix.ts`:

```
=== 1. Manual complete endpoint removed ===
✅ POST /quests/.../complete returns 404

=== 2. Frontend quests.astro fixed ===
✅ page NO LONGER contains '✓ Hoàn thành' button text
✅ page NO LONGER contains markComplete( call
✅ page contains 'Bắt đầu' link
✅ page contains 'Đã xong' chip for completed
✅ page contains help banner explaining auto-complete

=== 3. Track endpoints work ===
✅ POST /track/read-faq → 200 + tracked:true
✅ POST /track/view-pet-score → 200 + tracked:true
✅ view-pet-score WITHOUT pet_id → 400
✅ POST /track/check-weather → 200 + tracked:true
✅ POST /track/share-pet → 200

=== 4. Auth enforced ===
✅ track/read-faq WITHOUT cookie → 401

=== 5. GET /quests/pets/:id/today still works ===
✅ 3 quests + each has cta_link

=== 6. Backend hooks wired across all 15 trigger types ===
✅ checkin, upload_photo, log_meal, voice_diary, check_water,
   routine_complete, place_checkin, playdate_swipe, bcs_check, help_hero,
   read_faq, view_pet_score, check_weather, share_pet, pet_score_increase

Summary: 34 passed, 0 failed
```

---

## Answers to the 5 spec questions

| # | Question | Answer |
|---|---|---|
| 1 | Endpoint `POST /quests/.../complete` đã REMOVE? | **YES.** Lives proof: returns 404. Source comment documents WHY. |
| 2 | Frontend button đổi từ "Hoàn thành" → "Bắt đầu →"? | **YES.** Verified server-rendered HTML no longer contains "✓ Hoàn thành" string. Pending quests render `<a :href="q.cta_link">Bắt đầu →</a>`. Completed quests render emerald static chip. |
| 3 | 15 trigger types đã wire backend hooks? | **YES, all 15.** 10 via direct `trackQuestTrigger()` in feature POST routes, 4 via track endpoints (`/quests/track/*`), 1 via cascade inside `completeQuest()` for `pet_score_increase`. |
| 4 | "Đọc FAQ" + "Xem Pet Score" + "Share QR" có track endpoint mới? | **YES.** Endpoints: `POST /quests/track/read-faq`, `POST /quests/track/view-pet-score`, `POST /quests/track/share-pet`, plus `POST /quests/track/check-weather` (bonus). All fired from the relevant frontend pages via inline scripts. |
| 5 | E2E pass mấy? | **34/34.** |

---

## Files touched

| File | Nature |
|---|---|
| `api/src/routes/quests.ts` | REMOVED `POST /complete`. Added 4 track endpoints + `getFirstPetIdForUser()` helper. |
| `api/src/lib/daily-quests.ts` | Added `pet_score_increase` cascade in `completeQuest()`. |
| `api/src/routes/pets.ts` | Hook `upload_photo` after `POST /:id/photos`. |
| `api/src/routes/voice-diary.ts` | Hook `voice_diary` after `POST /:id/diary`. |
| `api/src/routes/water.ts` | Hook `check_water` after `POST /:id/water`. |
| `api/src/routes/routines.ts` | Hook `routine_complete` after `POST /:id/routines/:rid/complete`. |
| `api/src/routes/places.ts` | Hook `place_checkin` after `POST /:placeId/checkin`. |
| `api/src/routes/playdate.ts` | Hook `playdate_swipe` after `POST /swipe` IFF swipes_today ≥10. |
| `api/src/routes/lost-pets.ts` | Hook `help_hero` after public sighting IFF reporter is authed. |
| `api/src/routes/nutrition.ts` | Hook `log_meal` after `POST /:id/weight-log`. |
| `web/src/pages/pets/[id]/quests.astro` | Rewrote button → link. Removed `markComplete()`. Added help banner. |
| `web/src/pages/faq/[slug].astro` | Inline script fires `/quests/track/read-faq` on page load. |
| `web/src/pages/pets/[id]/pet-score.astro` | Inline script fires `/quests/track/view-pet-score` on page load. |
| `web/src/pages/alerts.astro` | Inline script fires `/quests/track/check-weather` on page load. |
| `web/src/pages/pets/[id]/share.astro` | `_trackShare()` Alpine method called from `copyUrl()` and `downloadQr()`. |
| `scripts/e2e-quest-bug-fix.ts` | New E2E (34 checks). |
| `QUEST_BUG_FIX_REPORT.md` | This file. |

No DB migration. No version bump (the bug fix is silent — endpoints that returned new fields stayed backwards-compatible).

---

## Manual smoke test for the user

1. Open `/pets/12/quests` while logged in.
2. Each pending quest now shows a violet **"Bắt đầu →"** link. Click it → it takes you to the feature page.
3. There is no longer a "✓ Hoàn thành" button anywhere.
4. Do the real action (e.g. upload a photo at `/pets/12`). Quest auto-completes server-side.
5. Return to `/pets/12/quests`. The quest now shows static emerald "✓ Đã xong" chip — not clickable.
6. Browser dev tools → Network: opening `/faq/{any-article}` fires `POST /api/v1/quests/track/read-faq`. Same for `/alerts`, `/pets/:id/pet-score`, share button on `/pets/:id/share`.

---

## What did NOT change

- `completeQuest()` lib function still exists — it's the single source of truth for marking a quest done + crediting points + sending push. Now it is **only called by `trackQuestTrigger()` (backend hooks) and the cascade for pet_score_increase**. It is no longer exposed via any HTTP route.
- `pet_score_bonus` accumulator on `users` table still works the same way.
- Pet Score formula, leaderboard, achievements all untouched.
- Daily quest assignment (1 easy + 1 medium + 1 hard, idempotent per day) unchanged.
