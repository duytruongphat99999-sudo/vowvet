# VowVet — UX Fix Report: Pet Mood Mascot + Daily Quest cards actionable

**Date:** 2026-05-20
**Scope:** Make 2 dashboard widgets clickable + contextual so users understand purpose and can act immediately.
**Result:** ✅ 31/31 E2E checks pass. Both widgets shipped.

---

## Problem (verbatim)

> User: "2 widgets không actionable — 'Bé hôm nay: Thư Giãn' với 'Quest hôm nay' đều không hiểu để làm gì, không bấm được, không có link đến đâu."

**Before:**
- Mood widget — static `<div>`, no `cursor: pointer`, no explanation of *why* the mood is what it is.
- Quest widget — outer `<a>` linked to `/pets/:id/quests`, but the 3 quest chips themselves were plain `<span>` decorations. Users didn't know which feature to open to complete each quest.

---

## What changed

### 1. Backend — `api/src/lib/pet-mood.ts`

Added 2 new fields on `MoodResult`:

```ts
export interface SuggestedAction {
  label: string;
  link: string;
  reward: string;
}

export interface MoodResult {
  ...
  reason: string;                       // NEW — explains why bé is in this state
  suggested_actions: SuggestedAction[]; // NEW — 1-3 next actions w/ reward chip
}
```

Replaced static `moodFor()` helper with `buildMood(state, petId, opts)` that injects per-state `reason` + `actions`. Coverage for **all 6 VowVet mood states**:

| State | Example reason | Actions |
|---|---|---|
| `sleeping` | "Đêm hôm rồi — bé đang ngủ." | Đặt routine mai · Xem nhật ký |
| `sad` | "Cảnh báo nguy hiểm chưa xử lý." | Mở alerts · Triage · Gọi vet |
| `needy` | "Streak đứt + vaccine sắp hạn." | Check-in nhanh · Routine · Vaccine |
| `excited` | "Achievement vừa unlock!" | Xem reward · Share · Leaderboard |
| `happy` | "Pet Score Gold+ · streak ≥7." | Quest hôm nay · Pet Score · Achievement |
| `chill` *(default)* | "Không có cảnh báo — bé khoẻ." | Quest · Check-in · Pet Score |

### 2. Backend — `api/src/routes/quests.ts`

Added `QUEST_CTA_MAP` (15 trigger types → feature URL) + `attachCtaLink(quest, petId)` helper:

```ts
const QUEST_CTA_MAP: Record<string, string> = {
  checkin:            "/pets/{petId}",            // check-in form on pet detail
  upload_photo:       "/pets/{petId}",
  read_faq:           "/faq",
  view_pet_score:     "/pets/{petId}/pet-score",
  log_meal:           "/pets/{petId}",
  voice_diary:        "/pets/{petId}/diary",
  check_water:        "/pets/{petId}/water",
  routine_complete:   "/pets/{petId}/routines",
  check_weather:      "/alerts",
  place_checkin:      "/map",
  playdate_swipe:     "/playdate/discover/{petId}",
  bcs_check:          "/pets/{petId}/bcs",
  share_pet:          "/pets/{petId}/share",
  help_hero:          "/lost/nearby",
  pet_score_increase: "/pets/{petId}/pet-score",
};
```

`GET /api/v1/quests/pets/:petId/today` now returns each quest enriched with `cta_link` (already substituted `{petId}` → numeric ID) plus a `completed_count` summary field.

All 15 target routes verified to exist under `/web/src/pages/`.

### 3. Frontend — `web/src/pages/dashboard.astro`

**Mood widget** (lines 198–256):
- Static `<div>` → `<button @click="open = !open">` with `x-data="{ open: false, mood: <SSR JSON> }"`
- Chevron `▾` indicator rotates 180° when open
- Popover (Alpine `x-show` + `x-transition.opacity` + `@click.outside` + `@keydown.escape.window`) shows:
  - **"Vì sao?"** section with `mood.reason`
  - **"Gợi ý cho bé"** section iterating `mood.suggested_actions` as full-width `<a>` rows with action label + green reward chip
  - Đóng button to dismiss

**Quest widget** (lines 258–292):
- Outer `<a>` removed (was wrapping everything). Container is now `<div>` so nested `<a>` chips are valid HTML.
- Header has a small "Xem tất cả ›" link to `/pets/:id/quests`.
- Each quest now renders conditionally:
  - **Completed** → `<span>` with ✓ + emerald background (not clickable, already done).
  - **Not completed** → `<a :href={q.cta_link}>` with hover state + `›` chevron, plus `title={q.definition?.description}` tooltip.

### 4. Layout / CSS

- `web/src/styles/global.css` — added `[x-cloak] { display: none !important; }` to prevent popover FOUC before Alpine hydrates.
- `Layout.astro` already loads Alpine 3.14.7 globally (deferred). No changes needed.

---

## Verification — 31/31 checks pass

`scripts/e2e-ux-fix-mood-quests.ts` (runs inside `vowvet-api` container against internal Docker network):

```
=== Mood endpoint ===
✅ mood: 200 OK
✅ mood.reason present (NEW)
✅ mood.suggested_actions is array (NEW)
✅ mood.suggested_actions ≥1 item (NEW)
✅ action[0].{label,link,reward} all valid strings
   ↳ Current mood: chill 😌 (3 actions)
   ↳ reason: Không có cảnh báo nào — bé khoẻ mạnh, chăm sóc đều đặn.

=== Quests endpoint ===
✅ quests.length === 3
✅ completed_count field (NEW)
✅ quest[0..2].cta_link present + {petId} substituted (NEW)
   ↳ #1 📸 Upload 1 ảnh bé → /pets/12
   ↳ #2 ✅ Hoàn thành routine ngày → /pets/12/routines
   ↳ #3 📊 BCS assessment → /pets/12/bcs

=== Dashboard HTML ===
✅ dashboard has x-data with mood (NEW Alpine)
✅ dashboard has @click toggling popover
✅ dashboard has @click.outside dismiss
✅ dashboard has x-text="mood.reason"
✅ dashboard has x-for over suggested_actions
✅ dashboard has Quest cta_link per chip (NEW)
✅ dashboard has rotate chevron indicator

=== Summary: 31 passed, 0 failed ===
```

---

## Answers to the 4 spec questions

| # | Question | Answer |
|---|---|---|
| 1 | Mood widget click handler hoạt động? | **YES.** `<button @click="open = !open">` toggles state. Chevron rotates 180°. `@click.outside` + `Esc` dismiss. |
| 2 | Mood popover hiện ≥2 suggested actions? | **YES.** Backend returns 1–3 actions per state (most states have 3). Verified with live data: 3 actions returned for `chill` state. |
| 3 | Quest card link đến đúng feature URL? | **YES.** Live data shows: photo quest → `/pets/12`, routine quest → `/pets/12/routines`, BCS quest → `/pets/12/bcs`. All target routes exist. |
| 4 | Mood reason text giải thích đúng context? | **YES.** All 6 states have contextual reason strings; live data shows `chill` returns "Không có cảnh báo nào — bé khoẻ mạnh, chăm sóc đều đặn." |

---

## Files touched

| File | Lines | Nature |
|---|---|---|
| `api/src/lib/pet-mood.ts` | rewrote `calculatePetMood` + added types | backend |
| `api/src/routes/quests.ts` | +25 lines (`QUEST_CTA_MAP`, `attachCtaLink`, enrich `today` response) | backend |
| `web/src/pages/dashboard.astro` | replaced lines 198–232 with Alpine popover + per-chip links | frontend |
| `web/src/styles/global.css` | +2 lines (`[x-cloak]` rule) | css |
| `scripts/e2e-ux-fix-mood-quests.ts` | new E2E (31 checks) | test |
| `UX_FIX_REPORT.md` | this file | docs |

No new dependencies. No DB migration. No version bump needed (cosmetic + API additive — backwards compatible).

---

## Manual QA notes

To verify in browser:
1. Visit `https://your-host/dashboard` while logged in with a pet that has data.
2. Click the mood card → popover opens beneath it. Click outside → closes. Press Esc → closes.
3. The 3 quest chips are now clickable links — hover shows pointer + violet outline. Click "Upload ảnh" → opens pet detail page where you can complete it.
4. Completed quests show as non-clickable emerald ✓ chips (no link), so users don't accidentally re-trigger.
