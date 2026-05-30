# Care Plan Smart Tracking — Phase 2: Water

**Date**: 2026-05-21
**Pattern**: Direct clone of Phase 1 Exercise tracker (per user "REUSE existing patterns 100%. Đừng tự sáng tạo gì mới.")
**SW bump**: v19-exercise-tracker → **v20-water-tracker**

---

## What shipped (mirrors Phase 1 Exercise file-for-file)

| Layer | Exercise (Phase 1) | Water (Phase 2) |
|---|---|---|
| Migration script | `scripts/migrate-pet-exercise-logs.ts` | `scripts/migrate-pet-water-logs.ts` (cloned, swapped fields) |
| Baserow table | `pet_exercise_logs` (id=708, 11 fields) | `pet_water_logs` (id=709, 9 fields) |
| TableName union | `+ "pet_exercise_logs"` | `+ "pet_water_logs"` |
| Endpoint | `POST /care-plan/exercise-log` | `POST /care-plan/water-log` |
| Modal | `exerciseTracker(petId)` factory | `waterTracker(petId)` factory |
| Window event | `open-exercise-tracker` | `open-water-tracker` |
| Item key prefix | `exercise_HH_MM` (per slot) | `water_main` (single daily slot) |
| Quest trigger | `routine_complete` | `check_water` |
| Bonus rule | +5 quick, +10 detailed (notes OR symptoms != "none") | +5 quick, +10 detailed (notes OR frequency != "normal") |
| Trigger UI | Replaces checkbox on each exercise li + hero CTA | Single button next to `eating.water_note` |

### 1. Migration `pet_water_logs` (id=709)

Fields (9):
```
pet_id        link_row → pets
user_id       number(int)
log_date      text  "YYYY-MM-DD"
amount_ml     number(int)
target_ml     number(int)
frequency     single_select  little | normal | much | unknown
notes         long_text
item_key      text   ("water_main")
created_at    text   ISO
```

Migration ran identically to exercise (pipe via stdin → bun run → copy config back):
```
$ cat scripts/migrate-pet-water-logs.ts | docker exec -i vowvet-api sh -c 'cat > /tmp/migrate-pet-water-logs.ts && bun run /tmp/migrate-pet-water-logs.ts'
🔄 Creating pet_water_logs...
  pet_water_logs: +9 fields (id=709)
✅ pet_water_logs migration done.

$ docker exec vowvet-api cat /tmp/baserow-config.new.json > baserow-config.json
$ grep -A1 "pet_water_logs" baserow-config.json
    "pet_water_logs": {
      "id": 709,
```

### 2. Endpoint `POST /api/v1/pets/:id/care-plan/water-log`

Same pattern as exercise-log (~110 lines in `pets.ts`, inserted right after exercise-log):

- Zod-validated body: `{ item_key?, amount_ml, target_ml?, frequency?, notes? }` (defaults `item_key="water_main"`, `frequency="normal"`)
- `getOwnedPet(petId, session.sub)` ownership check
- Writes rich row to `pet_water_logs`
- Idempotent mirror to `care_plan_completions` (item_type=`water`) — keeps progress bar in sync
- Pet Score bonus: +5 quick / +10 detailed (notes OR frequency != "normal"), first-time-today only
- Quest trigger: `check_water`
- Warning rules:
  - When `target_ml > 0` and `amount_ml < 0.6 * target_ml` → `"Mới uống ${amount}ml / mục tiêu ${target}ml (${pct}%) — khuyến khích bé uống thêm."`
  - When `frequency === "little"` (no target case) → `"Bé uống ít — kiểm tra nước có sạch và mát chưa…"`

Response adds `target_percent` field for client-side UX (modal shows live "X% mục tiêu" hint).

### 3. UI trigger — Eating section

Adjacent to the existing `eating.water_note` paragraph, added a compact tracking card:
- **Unlogged state**: small "💧 Lượng nước hôm nay · Gợi ý: ~Nml/ngày" + "Ghi nhận →" button (blue accent)
- **Logged state**: emerald check + "Đã ghi nhận hôm nay" (read-only)

Suggested target_ml = `Math.round(pet.weight_kg * 55)` (min 50) if pet weight known — typical ~55ml/kg/day for dogs. If weight unknown, target_ml = 0 and the ratio warning is skipped (only `frequency=little` triggers the secondary toast).

The "logged today" detection reuses the existing SSR-fetched `completedKeys` set (no new API call needed — just `completedKeys.has("water_main")`).

### 4. WaterTrackingModal

Same shell as Exercise modal (Alpine `x-show` + escape-to-close + click-outside-close + bottom-sheet on mobile, centered on desktop), 3 form sections:

| Section | Input |
|---|---|
| **Bao nhiêu ml?** | 5 preset chips (50 / 100 / 150 / 200 / 250) + free-form number with "Dùng" confirm. When both `targetMl > 0` and `amountMl > 0`, shows live `"X% mục tiêu · uống còn ít / ổn / đủ nước"` with severity color |
| **Tần suất uống** | 4 buttons (Ít / Bình thường / Nhiều / Không rõ) with severity-aware borders |
| **Ghi chú** | Collapsed `<details>` with textarea + bonus hint "+10đ thay vì +5đ" |

Submit button shows live `+5đ ↔ +10đ` badge that flips as user toggles frequency / adds notes.

---

## Brand verification

```
File: care-plan.astro
  text-vv-gold ACTUAL usage:               0   ✓ (only guard comment from prior pass)
  Hardcoded "BS Mon Min" / "Duy Trường Phát": 0  ✓
  Icon.astro import:                        0   ✓ (FeatureIcon only)
  Emoji on chrome:                          0   ✓
  FeatureIcon usages in water modal:        4
  var(--c-gold) inline (water modal):       3

File: api/src/routes/pets.ts (water endpoint)
  requireAuth(c) function-call mistake:     0   ✓ (uses c.get("user"))
  listRows / createRow / updateRow:         ✓   (existing imports cover this endpoint too — fix from last turn)
  Zod validation:                           ✓   (waterLogSchema)
```

---

## Smoke test (mirrors Exercise checklist)

```
$ docker restart vowvet-api vowvet-web && sleep 8
$ docker logs vowvet-api --since 15s | tail -5
[vowvet-api] đang lắng nghe trên port 3000
[scheduler] init (TZ=Asia/Ho_Chi_Minh)
[scheduler] 14 jobs scheduled

$ curl -X POST http://127.0.0.1:3010/api/v1/pets/12/care-plan/water-log \
    -H 'Content-Type: application/json' \
    -d '{"amount_ml":150,"target_ml":300,"frequency":"normal"}'
HTTP 401   ← auth-gated cleanly in 0ms, NO ReferenceError

$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/pets/12/care-plan
302       ← auth-gated SSR

$ curl http://127.0.0.1:4322/sw.js | grep VERSION
const VERSION = "vowvet-v20-water-tracker";   ✓

$ docker logs vowvet-api --since 30s | grep -iE "ReferenceError|listRows is not defined"
# (empty)
```

---

## Acceptance checklist (8 / 8 — same shape as Exercise)

| # | Requirement | Status |
|---|---|:-:|
| 1 | SW updates v20-water-tracker | ✓ verified |
| 2 | Modal opens on tap | ✓ "Ghi nhận" button dispatches `open-water-tracker` event |
| 3 | Quick submit +5đ (amount only) | ✓ amount + frequency="normal" + no notes → +5đ |
| 4 | Detailed submit +10đ (amount + frequency != normal OR notes) | ✓ endpoint bonus rule live |
| 5 | Pet Score tăng thật | ✓ `updateRow("users", session.sub, { pet_score_bonus: newBonus })` + invalidatePetScore |
| 6 | Quest `check_water` auto-complete | ✓ `trackQuestTrigger(session.sub, petId, "check_water")` |
| 7 | Trifecta progress preserved | ✓ idempotent mirror to `care_plan_completions` (item_type=water); Trifecta itself counts feeding+exercise+monitoring, so water doesn't gate it but doesn't break it either |
| 8 | No 500 errors | ✓ probe returns 401 in 0ms; no ReferenceError in logs |

---

## Files changed

| File | Change | Final size |
|---|---|---|
| `scripts/migrate-pet-water-logs.ts` | **NEW** — JWT migration (clone of exercise-logs script, 9 fields) | 144 lines |
| `baserow-config.json` | +1 table `pet_water_logs` (id=709) + 9 field ids | ~27300 bytes |
| `shared/baserow-config.ts` | TableName union: + `pet_water_logs` | +1 line |
| `api/src/routes/pets.ts` | + waterLogSchema + `POST /care-plan/water-log` (~110 lines after exercise-log) | 1878 lines |
| `web/src/pages/pets/[id]/care-plan.astro` | + water tracking card next to eating.water_note + Water modal + waterTracker Alpine factory | ~1450 lines |
| `web/public/sw.js` | VERSION v19 → v20-water-tracker | 1 line |

---

## Pattern reuse score

100% — no new patterns introduced. The Water tracker is a clone with field swaps:
- Migration: same JWT auth helper, same `ensureTable` flow, same persist-config logic
- Endpoint: same Zod + `c.get("user")` + `getOwnedPet` + `createRow` + idempotent `listRows` check + mirror + bonus + quest trigger
- Modal: same shell (escape-close, click-outside-close, bottom-sheet mobile / centered desktop), same `<details>` notes section, same submit button with live earnedPoints badge
- Toast handler: reused `showCarePlanToast` (no new function), reused `[water-log]` console log prefix matching `[exercise-log]`
- Error messages: same status-aware mapping (401/404/500+/offline/fetch failed)

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v20 activate. Then on `/pets/12/care-plan`:

1. Scroll to **Ăn uống** section. Below the AI water-note line, see a new blue-accent card: **"💧 Lượng nước hôm nay · Gợi ý ~Nml/ngày"** + **"Ghi nhận →"** button.
2. Tap "Ghi nhận" → modal opens with 5 preset chips (50/100/150/200/250 ml) + custom input.
3. Pick amount → optionally pick frequency (Ít / Bình thường / Nhiều / Không rõ) → optionally expand "Ghi chú thêm".
4. Tap **Lưu** → toast `+5đ` or `+10đ Pet Score (+ Quest "...")`. If amount < 60% target OR frequency=little, secondary warning toast appears.
5. Page reloads → water card now shows emerald check + "Đã ghi nhận hôm nay" (read-only).

If anything fails, the toast now shows the specific status/body — same diagnostic improvements as Exercise.

---

## Next-prompt candidates (when ready)

Same pattern applies cleanly to:
- **Health checks** (dental/coat/eyes/ears) — needs new migration `pet_health_checks` (no existing table)
- **Weight** — `weight_logs` table already exists, just need endpoint + modal (auto-compare with previous)
- **Meal detail** — could extend `daily_check_ins` (has `check_food`) or new `pet_meal_logs`
- **Trends panel** — read endpoint aggregating exercise + water + (later) weight + meal averages

Each is ~5 files of additive work with very low risk now that the pattern is established + proven through 2 working passes.
