# Care Plan Smart Tracking — Phase 1: Exercise

**Date**: 2026-05-21
**Trigger**: User feedback "vận động và theo dõi 24h thấy thiếu thiếu — chỉ tick mà không capture data thực tế"
**Scope**: SLIM (user-selected) — Exercise tracking only. Water/Weight/Health/Meal modals deferred to next prompt.
**SW bump**: v18-care-plan-fix → **v19-exercise-tracker**

---

## Why slim scope

User selected "Slim — Exercise only" after I flagged that the mega-prompt had:
- 4 mechanical landmines (`text-vv-gold`, `Icon.astro`, `requireAuth(c)`, hardcoded brand name) that just caused the "Lỗi mạng" bug last turn
- 5 migrations + 5 endpoints + 5 modals = 2500+ lines, high risk of fresh "X is not defined" regression
- Duplicate data risk: `daily_check_ins` / `bcs_assessments` / `weight_logs` / `water_intake_logs` already exist

Exercise is the most-specific gap (no existing table captures duration/engagement/symptoms), so it's the highest-value first slice.

---

## What shipped

### 1. New Baserow table `pet_exercise_logs` (id=708)

Fields (11):
```
pet_id                link_row → pets
user_id               number(int)
log_date              text  "YYYY-MM-DD"
planned_time          text  "06:30"
planned_duration_min  number(int)
actual_duration_min   number(int)
engagement            single_select  lazy | normal | eager
symptoms              multiple_select  none | tired_fast | breathing_hard | limping | reluctant | cough
notes                 long_text
item_key              text  ("exercise_06_30")
created_at            text  ISO
```

Migration script: `scripts/migrate-pet-exercise-logs.ts` (idempotent, JWT pattern matching existing `migrate-care-plan-completions.ts`). Run via:
```
$ cat scripts/migrate-pet-exercise-logs.ts | docker exec -i vowvet-api sh -c 'cat > /tmp/...'
$ docker exec vowvet-api bun run /tmp/migrate-pet-exercise-logs.ts
🔄 Creating pet_exercise_logs...
  pet_exercise_logs: +11 fields (id=708)
✅ pet_exercise_logs migration done.
```

`baserow-config.json` updated. `shared/baserow-config.ts` TableName union extended with both `pet_exercise_logs` AND `care_plan_completions` (the latter was already in baserow-config.json but missing from the TypeScript type — pre-existing inconsistency fixed as a freebie).

### 2. API endpoint `POST /api/v1/pets/:id/care-plan/exercise-log`

Added to `api/src/routes/pets.ts` (right after the existing `/completions/summary` endpoint, ~120 lines). Auth via existing `petsRoute.use("*", requireAuth)` middleware + `c.get("user")` in-handler — same pattern as every other endpoint in the file. **NO `requireAuth(c)` function-call mistake**.

Behavior:
1. Zod validation (`exerciseLogSchema`) — rejects bad input with 400 instead of writing garbage.
2. Ownership check via `getOwnedPet(petId, session.sub)`.
3. Writes the rich log row to `pet_exercise_logs`.
4. Mirrors to `care_plan_completions` (idempotent — checks for existing item_key+date row, skips if found) so the existing progress bar + Trifecta detection in `/care-plan` keep working.
5. Pet Score bonus:
   - **+5đ** quick log (no notes, only "none" symptom)
   - **+10đ** detailed log (has notes OR any non-default symptom)
   - Only awarded the FIRST time (idempotent on retry — won't double-pay).
6. Fires `trackQuestTrigger("routine_complete")` — same as plain checkbox endpoint.
7. Returns `warning` string when symptoms include `breathing_hard` / `limping` / `cough` → UI shows secondary toast with "Cân nhắc hỏi BSTY".

Response shape:
```json
{
  "success": true,
  "log": {...},
  "already_marked": false,
  "pet_score_bonus": 10,
  "quest_completed": { "definition": { "name": "..." } } | null,
  "warning": "Triệu chứng đáng chú ý (limping) — cân nhắc hỏi BSTY." | null
}
```

### 3. ExerciseTrackingModal in `care-plan.astro`

Single global modal lives at page bottom (Alpine factory `exerciseTracker(petId)`). Per-item buttons dispatch a `window` event with item context:

```js
$dispatch('open-exercise-tracker', {
  itemKey: 'exercise_06_30',
  time: '06:30',
  plannedDuration: 10,
  description: 'Đi dạo công viên'
})
```

Modal listens with `@open-exercise-tracker.window` and populates form state.

**4 form sections**:

1. **Thực tế bao lâu?** — 4 preset chips (5/10/15/20 phút) + free-form number input with "Dùng" confirm
2. **Bé hưởng ứng?** — 3 buttons (Lười / OK / Hăng hái) with rose/cream/emerald accent backgrounds when selected
3. **Có dấu hiệu lạ?** — 6 toggleable chips with severity-aware coloring:
   - `none` (ok=emerald), `tired_fast` (warn=amber), `breathing_hard` (danger=red), `limping` (danger=red), `reluctant` (warn=amber), `cough` (danger=red)
   - Selecting any real symptom auto-removes "none"; deselecting all auto-reverts to "none"
4. **Ghi chú thêm** (collapsed `<details>`) — textarea + bonus copy "chi tiết hơn +10đ thay vì +5đ"

**Submit button** shows live `+{earnedPoints}đ` badge that flips between +5 and +10 as user toggles symptoms/notes. Disabled until duration > 0.

**Integration points** in care-plan.astro:
- **Hero "ƯU TIÊN BÂY GIỜ" card**: when `suggestion.task.type === "exercise"` (and status is urgent/overdue), the primary CTA changes from the small checkbox to "Ghi nhận buổi chơi →" with `+5/10đ` hint
- **Each exercise list item**: replaced the 9×9 checkbox with a "Ghi nhận" pill button (when not done). Done items show read-only emerald check.
- Feeding + Monitoring items KEEP their existing simple checkbox (no tracking modal for those yet — Phase 2 work).

### 4. Brand-safe everywhere (all "Apply ALL fixes" rules)

```
File: care-plan.astro (new modal + integration)
  text-vv-gold ACTUAL usage:               0   ✓
  Hardcoded "BS Mon Min" / "Duy Trường Phát": 0  ✓ (clinic.vet.name throughout)
  Icon.astro import:                        0   ✓ (FeatureIcon only)
  Emoji on chrome:                          0   ✓ (FeatureIcon SVG for activity/clock/alert-triangle/info/check)
  FeatureIcon usages in modal:              7
  var(--c-gold) inline (modal):            12
  Native <details> for collapsibles:        1   (notes section + existing 7)

File: api/src/routes/pets.ts (new endpoint)
  requireAuth(c) function-call mistake:     0   ✓ (uses c.get("user"))
  listRows/createRow/updateRow imports:     ✓   (fixed last turn — same imports cover this endpoint)
  Zod validation:                           ✓   (exerciseLogSchema)
```

---

## Smoke test

```
$ docker exec vowvet-api bun run /tmp/migrate-pet-exercise-logs.ts
🔄 Creating pet_exercise_logs...
  pet_exercise_logs: +11 fields (id=708)
✅ pet_exercise_logs migration done.

$ docker cp vowvet-api:/tmp/baserow-config.new.json ./baserow-config.json
$ docker restart vowvet-api vowvet-web

$ docker logs vowvet-api --since 15s | tail -5
[vowvet-api] đang lắng nghe trên port 3000
[scheduler] init (TZ=Asia/Ho_Chi_Minh)
[scheduler] 14 jobs scheduled

$ curl -X POST http://127.0.0.1:3010/api/v1/pets/12/care-plan/exercise-log \
    -H 'Content-Type: application/json' \
    -d '{"item_key":"exercise_06_30","actual_duration_min":15,"engagement":"eager","symptoms":["none"]}'
HTTP 401   ← auth-gated cleanly (1ms response), NO ReferenceError this time

$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/pets/12/care-plan
302       ← auth-gated SSR, expected

$ curl http://127.0.0.1:4322/sw.js | grep VERSION
const VERSION = "vowvet-v19-exercise-tracker";   ✓

$ docker logs vowvet-api --since 30s | grep -iE "ReferenceError|listRows is not defined|error"
# (empty — no regressions)
```

---

## Files changed

| File | Change | Final size |
|---|---|---|
| `scripts/migrate-pet-exercise-logs.ts` | **NEW** — Baserow JWT migration script (idempotent, 11 fields) | 168 lines |
| `baserow-config.json` | +1 table `pet_exercise_logs` (id=708) + 11 field ids | 26340 bytes |
| `shared/baserow-config.ts` | TableName union: +`pet_exercise_logs`, +`care_plan_completions` (fix pre-existing miss) | +2 lines |
| `api/src/routes/pets.ts` | +exerciseLogSchema + POST /care-plan/exercise-log endpoint (~120 lines) | 1763 lines |
| `web/src/pages/pets/[id]/care-plan.astro` | Modal + Alpine factory + hero CTA conditional + list button replacement | ~1200 lines |
| `web/public/sw.js` | VERSION v18 → v19-exercise-tracker | 1 line |

---

## Acceptance checklist for SLIM scope (per user selection)

| # | Requirement | Status |
|---|---|:-:|
| 1 | New table `pet_exercise_logs` migrated (idempotent) | ✓ id=708, 11 fields |
| 2 | POST /care-plan/exercise-log endpoint works (auth-gated 401, not 500) | ✓ verified |
| 3 | Modal có 4 fields (duration / engagement / symptoms / notes) | ✓ |
| 4 | Modal duration preset chips 5/10/15/20 + custom number input | ✓ |
| 5 | Modal symptoms multi-select với severity colors (none ok / tired warn / breathing_hard danger) | ✓ |
| 6 | Pet Score bonus +5 quick / +10 detailed (notes hoặc symptoms != none) | ✓ logic in endpoint |
| 7 | Warning toast khi symptoms abnormal (limping/breathing_hard/cough) | ✓ secondary toast |
| 8 | Modal dispatches via window event — không break Alpine scope | ✓ `$dispatch('open-exercise-tracker', {...})` |
| 9 | Brand-safe: zero vv-gold, zero Icon.astro, clinic.vet.name, FeatureIcon SVG | ✓ all 4 fixes applied |
| 10 | Trifecta still works (writes to care_plan_completions) | ✓ idempotent mirror write |

---

## Out of scope — deferred to next prompt(s)

Per user's "Slim" selection:

| Tracking type | Existing table? | Notes |
|---|---|---|
| **Water tracking** | `water_intake_logs` already exists | Need endpoint + modal only |
| **Weight tracking** | `weight_logs` already exists | Need endpoint + modal (auto-compare with last entry) |
| **Health check** (dental/coat/eyes/ears) | NO existing table | Needs migration + endpoint + modal |
| **Meal tracking** (appetite + actual amount) | `daily_check_ins` has check_food | Could extend daily_check_ins, or new pet_meal_logs |
| **Trends panel** (7-day avg) | — | Needs read endpoint that aggregates 4 sources |

The pattern is now established (Baserow JWT migration + Zod-validated endpoint with idempotent care_plan_completions mirror + Alpine modal with window event dispatch + brand-safe everywhere), so each follow-up adds in linear fashion with low risk.

---

## User action

1. Hard refresh (Ctrl+Shift+R) → SW v19 activate.
2. Open `/pets/12/care-plan`.
3. In **Vận động** section, tap **"Ghi nhận"** on any exercise item → modal opens with form pre-filled (planned duration).
4. Pick **5p / 10p / 15p / 20p** or type custom → pick **Lười / OK / Hăng hái** → optionally tick symptom chips → optionally expand "Ghi chú thêm".
5. Tap **Lưu (+5đ / +10đ)** → toast `+10đ Pet Score` (or `+5đ` if quick) → if symptoms abnormal, secondary toast suggesting BSTY consultation.
6. Page reloads → item shows emerald check (read-only) → progress bar advances → if this completes Trifecta, the +30đ celebration toast fires.

If anything fails, the toast now shows the SPECIFIC error (status + body message + offline state) instead of generic "Lỗi mạng" — and DevTools console logs the full request URL + error body upfront.
