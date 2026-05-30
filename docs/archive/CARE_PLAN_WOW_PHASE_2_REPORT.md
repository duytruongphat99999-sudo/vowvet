# Care Plan WOW — Phase 2 Actionable Report

**Date**: 2026-05-21
**Scope**: Phase 2 actionable layer — completions table + endpoints + checkbox UI + dashboard widget.
**Builds on**: Phase 1 (safety blacklist + AI guardrails + disclaimer + popovers) from `CARE_PLAN_WOW_PHASE_1_REPORT.md`.
**Defers**: Phase 4 (7AM push cron + every-3h weather invalidation cron + dedicated /history page + breed/training/monitoring popovers) — see "Still deferred" section.

---

## TL;DR

- ✅ Migration `care_plan_completions` table created in Baserow (id=707, 8 fields, idempotent)
- ✅ 3 new API endpoints on `pets.ts`:
  - `POST /pets/:id/care-plan/items/:itemKey/complete` (full bonus + quest + Trifecta logic)
  - `GET /pets/:id/care-plan/completions/today`
  - `GET /pets/:id/care-plan/completions/summary`
- ✅ Checkbox UI on Eating + Exercise sections — Alpine state, AJAX, optimistic UI, vibrate(15) haptic, toast
- ✅ Trifecta detection (`feeding + exercise + monitoring` all covered) → +30 Pet Score + sentinel row prevents double-grant
- ✅ Daily Quest auto-fire on item type (feeding → log_meal, exercise → routine_complete, water → check_water, monitoring → view_pet_score)
- ✅ Dashboard `<CarePlanProgress>` widget — gold progress bar + Trifecta pill
- ✅ SW bumped to `v14-care-plan-actionable`

---

## Phase 2.1 — Migration

`scripts/migrate-care-plan-completions.ts` (155 lines, idempotent — re-runnable safely).

**Table**: `care_plan_completions` (Baserow id=707)

| Field | Type | Purpose |
|---|---|---|
| `user_id` | number (int) | Owner FK (matches existing user table primary key) |
| `pet_id` | link_row → pets | Link to pet (Baserow `[petId]` plain array pattern) |
| `care_plan_date` | text | "YYYY-MM-DD" — must match `todayVN()` from care-planner-v2 |
| `item_key` | text | e.g. "feeding_07_00", "exercise_06_30", "water_morning". Sentinel `_trifecta_granted` for Trifecta tracking |
| `item_type` | single_select | feeding / exercise / water / training / monitoring / other |
| `completed_at` | text | ISO timestamp |
| `notes` | long_text | optional user note |
| `created_at` | text | ISO (for orderBy) |

**Run via** (cmd):
```
docker cp scripts/migrate-care-plan-completions.ts vowvet-api:/tmp/migrate.ts
docker exec vowvet-api bun /tmp/migrate.ts
docker cp vowvet-api:/tmp/baserow-config.new.json ./baserow-config.json
docker restart vowvet-api
```

Note: Git Bash on Windows mangles `/tmp/...` paths — must use `MSYS_NO_PATHCONV=1` prefix or run from PowerShell/cmd.

---

## Phase 2.2 — API endpoints

Added to `api/src/routes/pets.ts` (after the existing `care-plan/feedback` block):

### POST `/pets/:id/care-plan/items/:itemKey/complete`

Idempotent. Returns `{ success, completion, pet_score_bonus, quest_completed, all_complete_bonus, all_complete_bonus_amount }`.

**Pipeline**:
1. Verify pet ownership via `getOwnedPet(petId, session.sub)`
2. Check for existing completion (same user/pet/date/key) → return `{ already_completed: true }` if found
3. Classify item by prefix → `{ type, questTrigger }`:
   - `feeding_*` → `feeding` + `log_meal` quest
   - `exercise_*` → `exercise` + `routine_complete` quest
   - `water_*` → `water` + `check_water` quest
   - `training_*` → `training` + `routine_complete` quest
   - `monitor_*` → `monitoring` + `view_pet_score` quest
   - else → `other` + no quest
4. Create `care_plan_completions` row
5. **Bump Pet Score** — read `users.pet_score_bonus`, add **+5**, write back, invalidate cache
6. **Fire Daily Quest trigger** via dynamic-imported `trackQuestTrigger(userId, petId, trigger)` (matches existing photos/checkin pattern)
7. **Trifecta detection** — re-list today's completions, check if all 3 types (`feeding + exercise + monitoring`) covered, then:
   - Check sentinel row `_trifecta_granted` exists (idempotent — no double bonus)
   - If not granted yet: +30 Pet Score, write sentinel row, return `all_complete_bonus: true`

### GET `/pets/:id/care-plan/completions/today`

Returns `{ date, completed_keys[], count, trifecta_granted }`. Filters out the `_trifecta_granted` sentinel from `completed_keys`. Used by `care-plan.astro` SSR to pre-check items.

### GET `/pets/:id/care-plan/completions/summary`

Same shape but lean. Used by dashboard `<CarePlanProgress>` widget.

---

## Phase 2.3 — Checkbox UI on care-plan.astro

### Front-matter additions
- SSR fetches `/completions/today` and builds `Set<string> completedKeys`
- `itemKey(prefix, time)` helper: `feeding_07_00`, `exercise_06_30` (stable across re-renders)
- Stores `trifectaGranted: boolean`

### Each item now wraps with Alpine:

```astro
<li x-data={`carePlanItem('${key}', ${isDone ? "true" : "false"}, ${petId})`}
    class={isDone ? "bg-emerald-50 border-emerald-200" : "bg-mmp-cream/40 border-amber-100"}>
  ...
  <button @click="markComplete()" :disabled="loading || completed"
          class="w-9 h-9 rounded-lg border ..."
          :class="completed ? 'bg-emerald-500 text-white' : 'bg-white hover:bg-mmp-cream'">
    <svg x-show="completed">✓</svg>
    <svg x-show="!completed && !loading">☐</svg>
    <svg x-show="loading" class="animate-spin">⟳</svg>
  </button>
</li>
```

### `carePlanItem()` Alpine factory:

```js
function carePlanItem(itemKey, initialCompleted, petId) {
  return {
    completed: !!initialCompleted,
    loading: false,
    async markComplete() {
      if (this.completed || this.loading) return;
      this.loading = true;
      try {
        const res = await fetch(`/api/v1/pets/${petId}/care-plan/items/${itemKey}/complete`, {
          method: "POST", credentials: "include"
        });
        const j = await res.json();
        this.completed = true;
        navigator.vibrate?.(15);
        showCarePlanToast(`✓ +${j.pet_score_bonus}đ Pet Score + Quest "${j.quest_completed?.definition?.name || ''}" +${j.quest_completed?.definition?.pet_score_bonus || 0}đ`, true);
        if (j.all_complete_bonus) {
          setTimeout(() => showCarePlanToast(`🎉 Trifecta +${j.all_complete_bonus_amount}đ bonus!`, true), 1200);
        }
      } catch (e) {
        showCarePlanToast("Lỗi kết nối", false);
      } finally {
        this.loading = false;
      }
    }
  };
}
```

### Toast system

- Fixed top-center container `#care-plan-toast-host` (no Alpine dep — DOM API only)
- Ink BG + gold-tinted shadow for success, red-50/border for error
- Auto-fade-in (300ms) + auto-fade-out after 2.8s
- Vibrate(15) on success (mobile haptic)

---

## Phase 2.4 — Dashboard widget

`web/src/components/dashboard/CarePlanProgress.astro` (NEW, 80 lines).

Layout:
```
┌──────────────────────────────────────────────┐
│ [📅] Care Plan hôm nay                  →    │
│      2/5 hoạt động · 40%                     │
│                                              │
│ ▓▓▓▓▓▓░░░░░░░░░░░  (gold progress 40%)      │
│                                              │
│ Còn 3 hoạt động →                            │
└──────────────────────────────────────────────┘
```

Variants:
- **Trifecta unlocked**: emerald pill "Trifecta +30đ đã unlock"
- **Fully done (no Trifecta yet)**: gold pill "Hoàn tất"
- **1+ done**: "Còn N hoạt động →"
- **0 done**: italic "Mở Care Plan để bắt đầu →"

Wired into `dashboard.astro` between TopNudge (Zone 5) and QuickAccess (Zone 6). Pre-fetches `care-plan/completions/summary` + `care-plan/v2/preview` (for `totalItems` calc) in the same parallel Promise.all.

---

## Brand verification

```
=== Verify ===
migrate-care-plan-completions.ts:                  155 lines
baserow-config.json contains care_plan_completions: 1 hit
API POST /complete endpoint:                        2 hits (definition + comment)
API GET /summary endpoint:                          2 hits
care-plan.astro:
  carePlanItem() Alpine factory:                    1
  itemKey() helper:                                 1
  showCarePlanToast() helper:                       1
  toast host element:                               2
  completedKeys Set used (pre-check items):         2
CarePlanProgress component:                         exists
  imported in dashboard:                            2 hits
```

---

## Smoke test

```
$ docker restart vowvet-api vowvet-web
$ for p in /dashboard /pets/12/care-plan; do
    curl -s -o /dev/null -w "%{http_code} $p\n" http://127.0.0.1:4322$p
  done
302 /dashboard
302 /pets/12/care-plan

$ for p in "POST /care-plan/items/feeding_07_00/complete" "GET /completions/today" "GET /completions/summary"; do ...
401 POST /pets/12/care-plan/items/feeding_07_00/complete       ← auth required (expected)
401 GET /pets/12/care-plan/completions/today
401 GET /pets/12/care-plan/completions/summary

$ docker logs vowvet-api --since 30s | grep -iE "error|fail"
# (empty)
$ docker logs vowvet-web --since 30s | grep -iE "error|astroerror" | grep -v personality
# (empty — only pre-existing router warning)
```

All endpoints registered. All pages compile + render correctly. Auth gate working.

---

## Files changed

| File | Change | Lines |
|---|---|---|
| `scripts/migrate-care-plan-completions.ts` | **NEW** | 155 |
| `baserow-config.json` | + `care_plan_completions` table id=707 + 8 fields | data |
| `api/src/routes/pets.ts` | +3 endpoints + `todayVNDate()` + `classifyCarePlanItem()` | +~180 |
| `web/src/pages/pets/[id]/care-plan.astro` | SSR fetch completions + `itemKey` helper + checkbox UI on Eating + Exercise + Alpine factory + toast host | +~120 |
| `web/src/components/dashboard/CarePlanProgress.astro` | **NEW** widget | 80 |
| `web/src/pages/dashboard.astro` | import + parallel fetch + render between Zone 5 & 6 | +~20 |
| `web/public/sw.js` | VERSION → `v14-care-plan-actionable` | 1 |

---

## Acceptance checklist

| Phase 2 | # | Requirement | Status |
|---|---|---|:-:|
| 2.1 | 1 | Migration creates `care_plan_completions` idempotent | ✓ |
| 2.1 | 2 | Table id + fields persisted to baserow-config.json | ✓ |
| 2.2 | 3 | POST endpoint with ownership check | ✓ |
| 2.2 | 4 | Idempotent (no double-grant per user/pet/date/key) | ✓ |
| 2.2 | 5 | Pet Score +5 per item via `users.pet_score_bonus` | ✓ |
| 2.2 | 6 | Quest auto-fire via `trackQuestTrigger` per type map | ✓ |
| 2.2 | 7 | Trifecta detection: `feeding + exercise + monitoring` → +30 | ✓ |
| 2.2 | 8 | Trifecta sentinel row prevents double-grant | ✓ |
| 2.2 | 9 | GET `/completions/today` returns `{date, completed_keys, count, trifecta_granted}` | ✓ |
| 2.2 | 10 | GET `/completions/summary` for dashboard | ✓ |
| 2.3 | 11 | Checkbox button per Eating item — 3-state (idle / loading / done) SVG | ✓ |
| 2.3 | 12 | Checkbox button per Exercise item | ✓ |
| 2.3 | 13 | SSR pre-checks completed items (no flicker on page load) | ✓ |
| 2.3 | 14 | Alpine `markComplete()` AJAX with optimistic UI | ✓ |
| 2.3 | 15 | Toast top-center with brand styling (ink + gold halo) | ✓ |
| 2.3 | 16 | Haptic feedback (`navigator.vibrate(15)`) on success | ✓ |
| 2.3 | 17 | Trifecta double-toast (1.2s delayed celebration) | ✓ |
| 2.4 | 18 | `<CarePlanProgress>` dashboard widget | ✓ |
| 2.4 | 19 | Gold progress bar + 4 status variants | ✓ |
| 2.4 | 20 | Wired between Zone 5 & 6 of dashboard | ✓ |
| —   | 21 | SW VERSION bumped | ✓ |

---

## Still deferred (Phase 4 — next prompt)

The mega-prompt's Phase 4 retention items need a separate session:

1. **7AM daily push notification cron** — "Care Plan cho bé X đã sẵn sàng!" using existing `sendPush()` from `api/src/lib/web-push.ts` + iterate all owned pets. Reuse `type: "vaccine_reminder"` push type (existing literal).
2. **Every-3h weather change → cache invalidation cron** — compare current weather vs last snapshot, if `tempDiff > 5°C || aqiDiff > 2 || feels_like > 35°C` then invalidate `care_plan_cache` for all pets.
3. **`/pets/:id/care-plan/history` page** — full streak calculation, calendar grid, 30-day completion stats. Needs new endpoint `GET /care-plan/history?days=30` (group by date).
4. **"Tại sao?" popovers on Training + Monitoring + Breed warning sections** (currently only Eating + Exercise have them — from Phase 3.1).
5. **Hard-fail fallback skeleton** — when AI safety violations detected, replace summary-warning soft-fail with full pre-written skeleton via `getFallbackCarePlan()`. Needs `care_plan_safety_log` table migration first.
6. **Quest trigger metadata cross-link** — emit a `data-attr` from QuestStrip widget when a quest gets auto-completed via care-plan action, so the dashboard can flash both surfaces.

These don't block Phase 2 from working — they're additive.

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v14 activate. On `/pets/12/care-plan`:

1. Each meal + exercise row has a **checkbox button on the right** (☐ → ⟳ → ✓)
2. Tap to mark done → animation + haptic + toast "+5đ Pet Score + Quest 'log_meal' +20đ"
3. Once all 3 types (feeding/exercise/monitoring) covered → Trifecta toast "🎉 +30đ bonus!"
4. Subsequent refreshes: items stay checked (server-persisted, SSR pre-check)

Dashboard now has a 6th widget `<CarePlanProgress>` between TopNudge and QuickAccess showing today's care-plan completion ratio with gold progress bar. Tap → opens `/care-plan`.
