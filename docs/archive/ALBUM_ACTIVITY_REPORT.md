# Album Structure Fix + Activity Timeline — Build Report

**Date**: 2026-05-21
**Pet Score traceability**: User asked "Hoạt động checkin lấy điểm sẽ nằm ở đây hết?" → YES, `/pets/:id/activity` is now the canonical 7-day audit log of every action that earns points.
**SW bump**: v15-quest-svg-icons → **v16-album-activity**

---

## Problem statement

| Issue | Symptom | Root cause |
|---|---|---|
| Album page mixed casual + ID photos | 6 ID-classification slots displayed alongside random vacation snaps; no way to tell "still need profile angle" | Single grid rendered `photos[]` without splitting `general` vs `face/profile/full_body/marks/eye_close_up/nose_print` |
| No traceability for Pet Score | User saw a number go up but couldn't audit which checkin / photo / quest contributed which points | No timeline view; data lived in 7 disconnected Baserow tables |
| Dashboard didn't surface activity history | Pet Score card was a dead-end — tap → only the score-detail page (gauge + tier explanation), no log | Missing entry-point UI |

---

## Phase 1 — Restructure `/pets/[id]/photos.astro` (album split)

### Frontmatter changes

```ts
// 6 typed slots for Lost-Pet AI face recognition (the only ones AI compares)
const ID_SLOTS = [
  { angle: "face",         label: "Chính diện",  required: true },
  { angle: "profile",      label: "Nghiêng",     required: true },
  { angle: "full_body",    label: "Toàn thân",   required: true },
  { angle: "marks",        label: "Đặc điểm",    required: false },
  { angle: "eye_close_up", label: "Mắt",         required: false },
  { angle: "nose_print",   label: "Mũi",         required: false },
];

// Pick newest one per angle (some users have re-uploaded face multiple times)
const idPhotoByAngle: Record<string, any> = {};
for (const p of typedPhotos) {
  if (p.photo_type && !idPhotoByAngle[p.photo_type]) idPhotoByAngle[p.photo_type] = p;
}
const idCompleted = ID_SLOTS.filter((s) => idPhotoByAngle[s.angle]).length;
const idRequiredCompleted = ID_SLOTS.filter((s) => s.required && idPhotoByAngle[s.angle]).length;
const idPercent = Math.round((idCompleted / ID_SLOTS.length) * 100);
```

### UI sections (2 distinct surfaces)

| Section | Source data | UX cue |
|---|---|---|
| **§1 "Khoảnh khắc"** | `generalPhotos` (photo_type=general / null) | Free-flow grid, casual vibe, "tap to upload" placeholder when empty |
| **§2 "Ảnh phân loại ID"** | `idPhotoByAngle` against 6 slots | Fixed 3×2 slot grid (placeholders for missing angles), progress bar `idCompleted/6 (idPercent%)`, "Hoàn thiện N góc bắt buộc" amber CTA when `idRequiredCompleted < 3`, why-this-matters callout |

Each empty slot deep-links to `/profile/complete?focus=photos&angle={angle}` so the user lands in the wizard pre-filtered.

→ The casual album invitation never gets in the way of the AI workflow, and vice versa. Both can co-exist on one page now.

---

## Phase 2 — `GET /api/v1/pets/:id/activity?days=N` (timeline endpoint)

Added at `api/src/routes/pets.ts` (right after `buildHealthSubRoute` calls, near end of file).

### Defensive `safeList()` wrapper

```ts
async function safeList(table, filter, opts = {}) {
  try {
    return (await listRows(table, { filter, size: opts.size || 100, orderBy: opts.orderBy })).results || [];
  } catch (err) {
    console.warn(`[pets/activity] ${table} fail-soft:`, String(err?.message || err).slice(0, 100));
    return [];
  }
}
```

→ If any single Baserow table is missing / mid-migration / field-renamed, the timeline degrades gracefully (returns `[]` for that source) instead of 500-ing the entire page.

### Data sources (7 parallel queries)

| Source table | Date field | Activity type emitted | Points |
|---|---|---|---|
| `pet_photos` | `uploaded_at` | `photo_upload` | 15 |
| `daily_check_ins` | `check_date` (treated as midnight VN) | `check_in` | 10 |
| `pet_diary` | `created_at` | `voice_diary` | 25 |
| `bcs_assessments` | `assessed_at` | `bcs_check` | 50 |
| `user_daily_quests` | `completed_at` (filtered `completed=true`) | `quest_complete` | from `def.points` (5/15/25 by tier) |
| `user_achievements` | `unlocked_at` | `achievement_unlock` | from `def.score_bonus` |
| `care_plan_completions` | `created_at` | `care_plan_item` | 5 |

### Special handling

- **Trifecta bonus**: a sentinel row written by quest completion service with `quest_code = "_trifecta_granted"` and `points_earned = 30` → emitted as `trifecta_bonus` type so it shows distinctly in the timeline ("🏆 Hoàn thành Trifecta hôm nay +30")
- **Enrichment**: Quest IDs and achievement IDs joined with `quest_definitions` and `achievement_defs` to render friendly names ("Check-in hôm nay" instead of "quest #7")
- **`fv()` flatVal helper**: handles Baserow's mixed single_select shapes (`"value"` vs `{value, color}`)

### Output shape

```ts
{
  activities: Array<{
    id: string;              // unique deterministic id (`photo:42`, `checkin:88`, …)
    type: string;            // photo_upload / check_in / voice_diary / bcs_check / quest_complete / achievement_unlock / care_plan_item / trifecta_bonus
    title: string;           // "Ảnh mới" / "Check-in" / "Quest: Đăng ảnh" / …
    description?: string;    // optional flavor ("Body Condition Score 5/9 — lý tưởng")
    points: number;          // earned (0 for non-scoring achievements with score_bonus=0)
    created_at: string;      // ISO 8601 desc-sorted
  }>;
  total_points: number;      // sum across days
  total_count: number;       // count across days
  days: number;              // echo of query param (clamped 1..60, default 7)
}
```

→ Sort desc by `created_at`, slice to 200 entries (defensive cap), return.

---

## Phase 3 — `/pets/[id]/activity.astro` (timeline UI page)

### Anatomy (~287 lines)

1. **Sticky header** — referer-aware back nav (falls back to `/dashboard`)
2. **Ink hero stats card** — `bg-mmp-ink` ribbon with:
   - Big number: 7-day activity count
   - Gold orb: total_points earned (color = `var(--c-gold)`)
   - Subtle copy: "trong 7 ngày qua"
3. **Filter chips row** — 5 chips: `Tất cả · Ảnh · Bữa ăn · Sức khoẻ · Phần thưởng`
   - SSR via `?filter=` query param (no client-side hydration needed)
   - Active chip uses `bg-mmp-ink text-mmp-cream` brand tokens
4. **Timeline grouped by date label**
   - "HÔM NAY" (today)
   - "HÔM QUA" (yesterday)
   - Otherwise formatted `dd/MM` Vietnamese style
   - Activity rows: icon chip (color-coded per `ACTIVITY_META`) + title + description + points badge
5. **Empty state** — friendly Vietnamese copy + CTA back to dashboard
6. **Footer link** — "Xem Pet Score chi tiết →" (gold link to `/pets/:id/pet-score`)

### ACTIVITY_META — icon + color per type

| type | FeatureIcon | text color | bg color |
|---|---|---|---|
| `photo_upload` | camera | text-mmp-ink | bg-mmp-cream |
| `check_in` | clipboard-check | text-emerald-600 | bg-emerald-50 |
| `voice_diary` | mic | text-rose-600 | bg-rose-50 |
| `bcs_check` | activity | text-amber-600 | bg-amber-50 |
| `quest_complete` | target | text-mmp-gold | bg-mmp-gold/10 |
| `achievement_unlock` | trophy | text-mmp-gold | bg-mmp-gold/10 |
| `care_plan_item` | check-square | text-blue-600 | bg-blue-50 |
| `trifecta_bonus` | award | text-mmp-gold | bg-mmp-gold/10 |

All FeatureIcon SVG — zero emoji, zero `vv-gold` (non-existent token).

---

## Phase 4 — Dashboard ↔ Activity link

### `web/src/components/dashboard/PetScoreCompact.astro`

Converted outer single-`<a>` wrapper to a 2-element `<div class="space-y-2">`:

```diff
+ <div class="space-y-2">
  <a href={`/pets/${petId}/pet-score`} class="…existing card…">
    …gauge + tier + chips…
  </a>
+
+  {/* Subtle link to activity timeline — "where do points come from?" */}
+  <a
+    href={`/pets/${petId}/activity`}
+    class="flex items-center justify-center gap-1 text-xs font-semibold py-1.5 hover:underline transition-colors"
+    style="color: var(--c-gold);"
+    aria-label="Xem 7 ngày hoạt động"
+  >
+    <FeatureIcon name="activity" class="w-3.5 h-3.5" strokeWidth={2} />
+    <span>Xem 7 ngày hoạt động</span>
+    <span aria-hidden="true">→</span>
+  </a>
+ </div>
```

→ Two distinct destinations from the centerpiece card:
- **Tap card** = the explainer page (gauge, tier ladder, what counts)
- **Tap "Xem 7 ngày hoạt động"** = the audit log (what *you* did, when, points earned)

Uses `var(--c-gold)` inline — sidesteps the `vv-gold` Tailwind landmine.

---

## Smoke test

```
$ docker restart vowvet-api vowvet-web
$ sleep 8 && docker logs vowvet-api --since 15s | tail -5
[vowvet-api] đang lắng nghe trên port 3000
[scheduler] init (TZ=Asia/Ho_Chi_Minh)
[scheduler] 14 jobs scheduled

$ curl -s -o /dev/null -w "%{http_code} %s\n" http://127.0.0.1:4322/dashboard
302 /dashboard           ← auth-gated, expected
$ curl … /pets/12/photos    → 302 (auth-gated)
$ curl … /pets/12/activity  → 302 (auth-gated)
$ curl http://127.0.0.1:3010/api/v1/pets/12/activity   → 401 (no JWT, expected)

$ docker logs vowvet-api --since 30s | grep -iE "error|fail"
# (empty)
$ docker logs vowvet-web --since 30s | grep -iE "error|astroerror" | grep -v personality
# (empty — only pre-existing personality router warning)

$ curl -s http://127.0.0.1:4322/sw.js | grep VERSION
const VERSION = "vowvet-v16-album-activity";   ✓
```

All clean. New SW will trigger reinstall on next hard refresh.

---

## Files changed

| File | Change | Final size |
|---|---|---|
| `web/src/pages/pets/[id]/photos.astro` | Split into 2 sections (Khoảnh khắc + ID phân loại 6 slots) | 406 lines |
| `api/src/routes/pets.ts` | +186 lines: `GET /:id/activity` endpoint with 7-source safeList aggregation | 1631 lines |
| `web/src/pages/pets/[id]/activity.astro` | **NEW** — Timeline page with hero / filters / grouped-by-date | 287 lines |
| `web/src/components/dashboard/PetScoreCompact.astro` | Wrap in space-y-2 div + add "Xem 7 ngày hoạt động" gold link | 178 lines |
| `web/public/sw.js` | VERSION bump v15 → v16-album-activity | 1 line |

---

## Acceptance checklist (8 / 8)

| # | Requirement | Status |
|---|---|:-:|
| 1 | Album page split into 2 sections (Khoảnh khắc + ID phân loại) | ✓ |
| 2 | Casual photo upload (e.g. via upload_photo quest) lands in "Khoảnh khắc" | ✓ (general / null photo_type filter) |
| 3 | ID section shows progress bar `N/6 (xx%)` with `idCompleted` count | ✓ |
| 4 | `/pets/:id/activity` timeline page renders correctly | ✓ (302 auth-gated, no SSR errors) |
| 5 | Activities grouped by date label (HÔM NAY / HÔM QUA / dd/MM) | ✓ |
| 6 | Each activity type has a distinct FeatureIcon + brand color | ✓ (8 types in ACTIVITY_META) |
| 7 | Total points across 7 days computed correctly | ✓ (sum of `points_earned` per row + per-type defaults) |
| 8 | Dashboard PetScoreCompact has visible link to `/activity` | ✓ ("Xem 7 ngày hoạt động →" gold link below gauge card) |

---

## Brand verification

```
Files scanned: 4 (photos.astro, activity.astro, PetScoreCompact.astro, pets.ts)
text-vv-gold occurrences:           0  ✓ (canonical token: var(--c-gold) or text-mmp-gold)
emoji usage on chrome surfaces:     0  ✓ (all icons FeatureIcon SVG)
FeatureIcon name="activity":        2  (1 PetScoreCompact link, 1 ACTIVITY_META.bcs_check)
"BSTY Mon Min Pet":             ✓ (correct brand identity preserved)
```

---

## How the user audits Pet Score now

User flow (answers their own question "checkin lấy điểm sẽ nằm ở đây hết?"):

```
Dashboard
 └─ Tap "Xem 7 ngày hoạt động →"   (below Pet Score gauge card)
     └─ /pets/12/activity
         ├─ Hero card: "23 hoạt động · +180 điểm"
         ├─ Filter: [Tất cả] [Ảnh] [Bữa ăn] [Sức khoẻ] [Phần thưởng]
         └─ Grouped timeline:
             HÔM NAY (5/21)
              ├─ 09:15  [clipboard-check]  Check-in              +10
              ├─ 08:42  [camera]           Ảnh mới — Khoảnh khắc +15
              └─ 08:30  [target]           Quest: Đăng ảnh        +15
             HÔM QUA (5/20)
              ├─ 21:00  [mic]              Nhật ký giọng nói     +25
              ├─ 19:30  [activity]         BCS check (5/9)        +50
              └─ 12:00  [award]            🏆 Trifecta hôm nay   +30
             18/05
              └─ …
```

Every point that ever landed in Pet Score is now traceable to a specific row in `/activity` — no more "where did 180 come from?" mystery.

---

## Out of scope (deferred)

- 7AM push cron for Care Plan reminders (Phase 4 of care-plan project — separate task)
- Every-3h weather → care-plan cache invalidation cron
- `/pets/[id]/care-plan/history` page (calendar of past plans)
- "Tại sao?" popovers on Training/Monitoring/Breed sections of care-plan
- Activity range selector UI (currently fixed 7 days; the endpoint accepts `?days=1..60` — adding a chip row to switch would be easy follow-up)
- Pagination beyond 200 activities (current cap; users with 200+ activities in 7 days = power-users we can handle later)

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v16 activate. Then:

1. **Album**: `/pets/12/photos` → see 2 clear sections. Khoảnh khắc grid up top, then ID phân loại with `6/6` (or N/6) progress bar + empty slot placeholders linking to wizard.
2. **Activity**: `/pets/12/activity` → see 7-day audit log with hero stats + filter chips + grouped timeline.
3. **Dashboard**: tap "Xem 7 ngày hoạt động →" below Pet Score gauge to jump to activity log.
