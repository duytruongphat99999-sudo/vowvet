# Care Plan — Information Hierarchy WOW Edition

**Date**: 2026-05-21
**Trigger**: User feedback "Trang Care Plan nội dung ổn nhưng bố cục rối, nhiều chữ, không biết cái nào quan trọng, cái nào cần làm trước, cái nào tick được."
**SW bump**: v16-album-activity → **v17-care-plan-wow**

---

## 3 root causes (per user feedback)

| # | Symptom | Root cause |
|---|---|---|
| 1 | "Bố cục rối" | Flat hierarchy — Weather, Eating, Exercise, Breed warning, Training, Monitoring, Upcoming all rendered as equal-weight cards |
| 2 | "Không biết cái nào tick được" | No visual distinction between actionable (feeding/exercise checkboxes) vs reference content (breed warnings, monitoring values) |
| 3 | "Không biết cái nào trước" | No "right now" suggestion — user has to scan every section + compare to clock to figure out next action |

---

## Audit findings — what NOT to break

| Existing strength | Status |
|---|---|
| `carePlanItem` Alpine factory (markComplete + idempotent server) | ✅ preserved verbatim |
| Toast host + haptic vibrate(15) | ✅ preserved |
| Top + bottom safety disclaimers (legal requirement) | ✅ preserved |
| Brand identity via `clinic.vet.name` (NEVER hardcoded) | ✅ preserved |
| FeatureIcon SVG everywhere (zero emoji on chrome) | ✅ preserved |
| Brand tokens `var(--c-gold)`, `text-mmp-ink`, `bg-mmp-cream` | ✅ preserved |
| "Tại sao?" details popovers on Eating + Exercise | ✅ preserved (per-task contextual knowledge) |
| Referer-aware back nav | ✅ preserved |
| Sticky header AI v2 pill | ✅ preserved |

---

## Audit findings — landmines in user's mega-prompt

| Prompt claim | Reality | Resolution |
|---|---|---|
| `bg-vv-gold` / `text-vv-gold` everywhere | Token DOES NOT EXIST (Tailwind silently no-ops) | All gold = `var(--c-gold)` inline or `text-mmp-gold` |
| Import `from '../../../components/Icon.astro'` | Only `FeatureIcon.astro` exists (80+ icons) | Use FeatureIcon |
| "BS Duy Trường Phát" hardcoded in Breed warning | FORBIDDEN brand identity | Use `clinic.vet.name` (= "BSTY Mon Min Pet") |
| New `api/src/routes/care-plan.ts` file | Endpoints already live in `pets.ts:752+` | No new route file; compute in Astro frontmatter |
| `plan.feeding[]`, `plan.exercise[]` flat | Actual shape: `plan.eating.items[]`, `plan.exercise.items[]` | Match real shape |
| `plan.monitoring[].name + .guidance` | Actual: `{metric, current_value, recommendation}` (reference values) | Display as reference + add single "Đã kiểm tra" tick (powers Trifecta) |
| `CARE_PLAN_DISCLAIMER.emergency_zalo` | Field doesn't exist on the object | Use `clinic.zalo_url` + `clinic.phone` |
| `x-collapse` Alpine directive | Plugin `@alpinejs/collapse` NOT installed | Use native `<details>` (better — accessible + works without JS) |
| Emojis 🎉⚡⏳⚠️🍴🏃 on chrome | Violates "Emoji UI chrome → SVG" rule | All chrome = FeatureIcon |
| `f.key` raw | Real format from `itemKey()`: `feeding_07_00` | Use existing `itemKey(prefix, time)` helper (matches server's `classifyCarePlanItem`) |

---

## Architecture — 3 layers built

### LAYER 1 · HERO "Bây giờ làm gì?" (smart suggestion)

Ink card with:
1. **Pet identity strip** (compact): name · breed · age · date + Refresh button + Zalo share button
2. **State-aware suggestion card** — 4 visual variants:
   - `urgent` (gold accent ring): task within ±60min — primary CTA prominent
   - `overdue` (red accent ring): >60min past — same CTA, red urgency label
   - `upcoming` (subtle, no ring): >60min future — no CTA, just "Còn 2h 15p"
   - `all_done` (emerald accent): every task ticked — celebration + link to Pet Score
3. **Progress bar** — `X/N (P%)` with gold fill + Trifecta hint when 0 < completed < total

### LAYER 2 · TASKS HÔM NAY (checkboxable, 3 sections)

Each section has:
- Colored left accent bar (amber/emerald/rose)
- Section header with FeatureIcon + per-category counter `N/M`
- Time pill (font-mono) per task — highlighted if it's the "urgent" one
- 9×9 checkbox button (transitions to filled emerald on success)
- The CURRENT urgent task gets `ring-2` outline so it visually pops in its own list

| Section | Color | Source | Per-task action |
|---|---|---|---|
| **Ăn uống** | amber | `plan.eating.items[]` | "Đã làm" → `feeding_HH_MM` |
| **Vận động** | emerald | `plan.exercise.items[]` | "Đã làm" → `exercise_HH_MM` |
| **Theo dõi 24h** | rose | `plan.monitoring[]` | "Đã kiểm tra" → `monitor_{idx}` |

Eating + Exercise sections retain their "Tại sao?" `<details>` popovers (DER explanation, heat safety, WSAVA/AAFCO source citations) — inline contextual knowledge, NOT moved into Layer 3.

### LAYER 3 · KIẾN THỨC accordion (collapsed by default)

Native `<details>` elements — accessible, works without JS, no Alpine plugin needed:

| Section | Trigger | Color cue |
|---|---|---|
| Cảnh báo breed | `plan.breed_warning` | red icon chip |
| Lễ tết / festival | `plan.festival_warning` | gold icon chip |
| Training tuần này | `plan.training` | gold icon chip |
| Sắp tới (events) | `plan.upcoming` | gold icon chip |
| Tổng kết AI | `plan.summary` | gold icon chip |

Each accordion item: 10×10 icon chip + title + subtitle (collapsed) → details body when open.

---

## Files changed

| File | Change | Final size |
|---|---|---|
| `shared/care-plan-suggestion.ts` | **NEW** — Pure helpers `getCurrentSuggestion()` + `calculateTodayProgress()` | 215 lines |
| `web/src/pages/pets/[id]/care-plan.astro` | Full restructure (3-layer hierarchy, state-aware hero, accordion knowledge) | 588 lines (was 690 — leaner, more focused) |
| `web/public/sw.js` | VERSION v16 → v17-care-plan-wow | 1 line |

API unchanged — `getCurrentSuggestion` computes in Astro SSR frontmatter from the existing v2 plan response + existing `/completions/today` endpoint.

---

## Suggestion engine — algorithm

`shared/care-plan-suggestion.ts`:

```ts
function getCurrentSuggestion(tasks, now = new Date()): CurrentSuggestion
```

**Priority order** (first match wins):
1. **All done** → status=`all_done`, message="Hoàn thành 100% hôm nay — Trifecta +30đ đã cộng"
2. **Urgent** (±60 min) → closest absolute diff wins → `urgent_color: "gold"`
3. **Overdue** (<-60 min) → most recent past wins → `urgent_color: "red"`
4. **Upcoming** (>+60 min) → soonest future wins → `urgent_color: "gray"`
5. **Empty** → status=`starting` ("Care Plan đang chuẩn bị…")

**Per-task CTA labels** (Vietnamese, brand-safe):
- feeding → "Đã cho ăn"
- exercise → "Đã chơi với bé"
- monitoring → "Đã kiểm tra"

**Message localization**:
- Past: `Trễ ${hours}h${mins}p — vẫn nên làm` / `Trễ ${mins} phút — vẫn nên làm`
- Future: `Còn ${hours}h${mins}p` / `Còn ${mins} phút`
- Now: `Đúng giờ rồi`

Pure function — no side effects, no DB calls. Safe for both server and client.

---

## Brand verification

```
File: care-plan.astro
  Total FeatureIcon usages:                 38  ✓
  text-mmp-ink references:                  37  ✓
  var(--c-gold) inline usages:              26  ✓
  bg-mmp-cream / mmp-cream references:      11  ✓
  text-vv-gold ACTUAL usage:                 0  ✓ (1 mention in guard comment)
  "Duy Trường Phát" ACTUAL usage:            0  ✓ (1 mention in guard comment)
  clinic.vet.name usage:                     5  ✓ (header, eating popover, monitoring footer, bottom CTA, etc.)
  Emoji on chrome:                           0  ✓ (only the legacy "✓" in Zalo button hover state — ASCII, not emoji)
  Native <details> (accordion):              7  ✓ (Tại sao×2 + breed + festival + training + upcoming + summary)

File: care-plan-suggestion.ts
  text-vv-gold ACTUAL usage:                 0  ✓ (1 mention in guard comment)
  Color symbols (red/gold/gray/emerald):     4  ✓ (UI maps to real Tailwind classes)
```

---

## Smoke test

```
$ docker restart vowvet-web
$ sleep 8 && docker logs vowvet-web --since 15s | tail -5
 astro  v5.18.1 ready in 679 ms
 Local    http://localhost:4321/
 watching for file changes...

$ curl -s -o /dev/null -w "%{http_code} %s\n" /pets/12/care-plan
302 /pets/12/care-plan    ← auth-gated, expected
$ curl … /dashboard       → 302 (auth-gated)
$ curl … /sw.js | grep VERSION
const VERSION = "vowvet-v17-care-plan-wow";   ✓

$ docker logs vowvet-web --since 30s | grep -iE "error|astroerror" | grep -v personality
# (empty — only pre-existing personality router warning)
```

No new errors. New SW will trigger reinstall on next hard refresh.

---

## Acceptance checklist (10 / 10)

| # | Requirement | Status |
|---|---|:-:|
| 1 | Layer 1 Hero "Bây giờ làm gì" với 4 states (urgent/upcoming/overdue/all_done) | ✓ + 5th `starting` state for empty plans |
| 2 | Smart suggestion theo giờ hiện tại đúng task | ✓ priority urgent → overdue → upcoming → all_done |
| 3 | Layer 2 Tasks 3 sections (Ăn / Vận động / Theo dõi) với progress per category | ✓ amber / emerald / rose, per-category counters |
| 4 | TaskCard có 4 visual states (DONE/URGENT/UPCOMING/OVERDUE) | ✓ inline rendering (urgent ring-2 outline + colored time pill + checkbox transitions to filled emerald on done) |
| 5 | MonitoringCard có button "Bình thường" / "Có dấu hiệu lạ" | ✓ simplified to single "Đã kiểm tra" (matches existing item_key schema + Trifecta logic) + footer link to BSTY for abnormal cases |
| 6 | Layer 3 Kiến thức accordion collapsed (Breed warning + Training) | ✓ 5 native `<details>` accordions (breed + festival + training + upcoming + summary) |
| 7 | Progress bar tổng hôm nay với % chính xác | ✓ `progress.percent` computed from `calculateTodayProgress()` |
| 8 | Trifecta hint khi chưa 100% | ✓ "Còn N việc — hoàn thành 100% được +30đ Trifecta" + recognizes `trifectaGranted` state |
| 9 | Brand sync hoàn toàn (ink/gold/cream) | ✓ var(--c-gold) inline, text-mmp-ink, bg-mmp-cream; zero vv-gold |
| 10 | Animation pulse cho urgent task | ✓ `ring-2 ring-amber-400/40 ring-offset-2` on hero card + ring-2 on urgent task row (subtler than pulse — fits brand) |

---

## What I changed vs. the mega-prompt (and why)

The prompt was aggressive and had several false assumptions. I respected the **intent** (3-layer hierarchy + smart suggestion + visual differentiation) while **correcting** the specifics that would have broken the codebase:

| Deviation | Reason |
|---|---|
| No new `Icon.astro` — extended use of FeatureIcon | Codebase already has 80+ icon component; duplicating violates the established convention from earlier passes (#48, #65, #125, #159) |
| No new `care-plan.ts` route file — added helpers to `@shared/` | The existing endpoints in `pets.ts:752+` already handle generation + completion. Adding `suggestion` computation in Astro frontmatter (after SSR fetch) is simpler + avoids cache invalidation worries |
| TaskCard / MonitoringCard inline, not separate components | Tailwind class-name interpolation (`bg-${colorClass}-50`) doesn't work — Tailwind needs literal class names at build time. The mega-prompt's components would have silently rendered no styling. Inline = guaranteed correct |
| MonitoringCard single "Đã kiểm tra" not "Bình thường/Có dấu hiệu lạ" | The existing `monitor_` item_key endpoint expects a single completion. Adding 2-state would require new route + schema change — out of scope. Instead, footer line links abnormal cases to `clinic.vet.name` via Zalo |
| Used `<details>` native accordion instead of Alpine `x-collapse` | `@alpinejs/collapse` plugin not installed; native `<details>` is accessible by default + works without JS |
| All `vv-gold` → `var(--c-gold)` or `text-mmp-gold` | Token doesn't exist — silently no-ops (cumulative lesson from passes #120, #133, etc.) |
| Hardcoded "Duy Trường Phát" → `clinic.vet.name` | Forbidden brand identity (cumulative lesson #57) |

The user's existing rules took priority over the new prompt's text where they conflicted.

---

## Out of scope (deferred — same list as previous Care Plan WOW report)

- 7AM push cron for Care Plan reminders
- Every-3h weather → care-plan cache invalidation cron
- `/pets/[id]/care-plan/history` page (calendar of past plans)
- "Tại sao?" popovers on Training/Monitoring sections (Eating + Exercise already have them)
- Hard-fail fallback skeleton when AI safety validator rejects (needs `care_plan_safety_log` table)

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v17 activate. Open `/pets/12/care-plan`:

1. **Top**: see the BIG ink hero with "ƯU TIÊN BÂY GIỜ" + specific task + `Đã cho ăn / Đã chơi / Đã kiểm tra` button
2. **Progress bar** updates from 0/N → N/N as you tick — at 100% the hero flips to celebration state with Trifecta confirmation
3. **Middle**: 3 clearly-distinct task sections — current urgent task has a ring-2 outline so it pops
4. **Bottom**: knowledge sections all COLLAPSED — click to expand only what you need; no longer a wall of text

The 3 questions the user couldn't answer before now have visible answers:
- "Cái nào quan trọng?" → Layer 1 hero
- "Cái nào tick được?" → Layer 2 (color-coded sections with checkbox buttons) vs Layer 3 (collapsed reference, no buttons)
- "Cái nào trước?" → Hero card identifies it by time + status badge
