# VowVet — Full Handoff Document for New Claude Code Session

**Project**: VowVet — Vietnamese pet care + AI Care Plan + Vaccine Passport app
**Stack**: Astro 5 SSR + Bun + Hono + Alpine.js 3.14.7 + Tailwind v4 + Baserow + Gemini Flash 2.5 + Web Push
**Repo root**: `C:\docker\vowvet` (Windows host, Docker containerized)
**Date of handoff**: 2026-05-23
**Status**: MVP shipped, Pre-Launch Direction A in progress (5/6 internal items done — A4 audit complete)
**Current SW version**: `vowvet-v36-prescription-os`

> This document is **self-contained**. The new Claude session does NOT need to read other context files first. Everything required to continue is in this file.

---

## 1. WHAT JUST SHIPPED (last 4 sessions)

### Session 2026-05-23 — Bug Fixes + A4 Observability Audit ✅

#### BUG 1 FIXED — Routines Baserow `size: 500` → HTTP 400 noise
- `api/src/lib/routines.ts:643` — `refillAllFreezes()`: `size: 500` → `size: 200`
- `api/src/lib/routines.ts:664-676` — `listAllActiveRoutinesForReminders()`: replaced single `size: 500` fetch with **pagination loop** (`while res.next`) — cron now handles >200 active routines without silently truncating push reminders
- `api/src/lib/routines.ts:674` — `listAllStreaks()`: `size: 500` → `size: 200`

#### BONUS BUG FIXED — Routine push type was misclassified as `"vaccine_reminder"`
- `api/src/lib/web-push.ts:58,90` — added `"routine_reminder"` to type union
- `api/src/lib/routine-reminders.ts:122` — Job 7 (15-min before start): `"vaccine_reminder"` → `"routine_reminder"`
- `api/src/lib/routine-reminders.ts:189` — Job 9 (end-of-day streak warn): same fix

#### BUG 2 FIXED — Personality route collision WARN eliminated
- `web/src/pages/pets/[id]/personality/index.astro` — DELETED (M13 duplicate, conflicts with M15 `personality.astro`)
- `web/src/pages/pets/[id]/personality/quiz.astro` — DELETED (M13 orphaned dead route)
- `web/src/pages/pets/[id]/personality/result.astro` — DELETED (M13 orphaned dead route)
- `personality.astro` (589 lines, M15 self-contained SPA) is now the sole route handler

#### TASK A4 — Observability Audit COMPLETE ✅
- `docs/OBSERVABILITY_AUDIT_REPORT.md` (NEW) — 10-category audit with GREEN/YELLOW/RED ratings
- Key findings: Sentry NOT installed (P0), Baserow has no request timeout (P0 fix = 5 min), safety violations not pushed to admin (P1), gemini cost log IS active, health endpoint IS working, disk healthy at 19%, manual backups exist but not automated

#### P0 HARDENING #1 — Baserow Timeout ✅
- `shared/baserow.ts` — `request()` wrapper now applies `signal: AbortSignal.timeout(BASEROW_TIMEOUT_MS)` (default 10s, env-overridable)
- Catches `TimeoutError` / `AbortError` and throws clear `→ TIMEOUT after Xms` error; network errors → `→ NETWORK: ...`
- ALL Baserow ops (`listRows`/`getRow`/`createRow`/`updateRow`/`deleteRow`/`pingBaserow`) are protected through single chokepoint
- `pingBaserow()` will now return false on timeout instead of hanging, making `/api/v1/health` truly reliable

#### MAJOR FEATURE — Catalog Prescription OS v36 (Đại phẫu toàn diện) ✅
- **Khối 1 — Breed Database expansion (29 breeds)**: `BREED_OPTIONS` mở rộng từ 8 → 31 entries (10 cat + 19 dog + 2 "khac" fallback). Mỗi entry có `code`, `name`, `min/max kg`, **`risks` array** (kế thừa vào Yellow tier allergen matrix). Bao gồm các giống VN endemic (Phú Quốc, H'Mông, Bắc Hà, Lài, Mèo Ta). `mapBreedFromPet()` expanded để fuzzy-match all 29 breeds + VN/EN aliases.
- **Khối 2 — BCS Matrix 9-level + Tap-to-Answer**:
  - `profile.bcs` migrated từ string `"under"/"ideal"/"over"` → **numeric 1-9** (full system refactor: `der`, `derMultiplierLabel`, `compatScore`, `compatTagline` đều dùng numeric)
  - `BCS_MATRIX` 9 entries với `score`, `tier` (under-critical/under/ideal/over/obese/obese-critical), `label`, **`description` mô tả lâm sàng chi tiết**
  - `currentBcs` getter trả entry tương ứng score hiện tại
  - DER multiplier refactored: 9-case switch (BCS 1: 1.8 → BCS 9: 0.8)
  - BCS slider trong Profile widget có **color-state động** (slate/emerald/orange/red)
  - **Tap-to-Answer 3 nút** lớn snap slider: `🦴 Chỉ thấy xương cứng` (=2), `✨ Sườn ẩn dưới lớp mỡ mỏng` (=5), `🎈 Không thấy gì ngoài mỡ` (=8)
- **Khối 3 — Allergen Matrix + NLP Parser**:
  - `ALLERGEN_MATRIX`: 3 tiers (red 4 entries, orange 2 entries, yellow dynamic từ breed.risks)
  - `activeAllergenTags` computed: gom red (profile.allergens) + orange (profile.sensitivities) + yellow (breed risks) thành 1 list
  - `hasAnyAllergen` getter điều khiển hiển thị Risk Profile section
  - **`parseFreeText(text)` NLP parser** dùng regex: phát hiện "ăn hạt gà + gãi" → suggest ALLERGEN_CHICKEN, "chung cư + mùi" → activate odor filter (Yucca + Bacillus subtilis)
  - `applySuggestion()` push allergen vào profile khi user chạm
  - Free-text textarea với debounce 300ms + animated AI suggestion tags
- **Khối 4 — Dynamic Digital Prescription Card (3 modules)** — sit ABOVE brand grid, Editorial Clinical style:
  - **Module 1 — Diet Breakdown**: `#F3EFE7` paper bg, `#1A1814` ink, font-mono tabular-nums. Header: total DER kcal/ngày. Grid: Hạt khô `dryFoodGrams` (70% DER / 360 kcal) + Pate `wetFoodGrams` (30% DER / 85 kcal). Timeline 30 ngày với progress bar + nút **"✓ Đã cho ăn hôm nay"** (`markFedToday()` persist localStorage per pet ID)
  - **Module 2 — Condition Rules**: Sơ đồ rẽ nhánh "Mục tiêu ĐẠT" (emerald) + "Mục tiêu ĐỔI" (amber) — Poop Score weekly nudge
  - **Module 3 — Three-Tiered Recommendation**:
    - **Tầng 1**: Combo y khoa `border-#1A1814 bg-#F3EFE7` — 1× MonMin Light 1.5kg + 15× Pate (≈900k) → CTA về `monminpet.com/sanpham`
    - **Tầng 2**: `marketSearchKeywords` dynamic theo BCS+allergens+breed, copy clipboard button
    - **Tầng 3**: Smart Label Scanner — input kcal/100g tự tính khẩu phần `(der/homeKcal)*100`
- **Ingredient Guard**: Brand card với pet-allergic ingredients hiện `line-through decoration-2 decoration-red-600 font-bold` + label "⚠️"
- **localStorage scheme**: `vv_pet_{id}_diet_start` (ISO date) + `vv_pet_{id}_fed_dates` (array of ISO dates) per pet — `loadDietTimeline()` auto-call khi `selectedPetId` đổi via `$watch`
- **SW bump**: `v35-nutrition-os-master-fix` → `v36-prescription-os` (`web/public/sw.js:17`).
- **File size**: 777 → **1239 dòng** (+462 dòng cho 29-breed DB + BCS 9-matrix + NLP parser + Prescription Card + Ingredient Guard).
- **Web startup**: clean — Astro ready in 722 ms, SSR /food-brands → HTTP 200, no warnings, no TS errors.

#### MASTER HOTFIX — Catalog Nutrition OS v35 (Data Lock + VN + 404 fixes) ✅
- **Block A — Data Lock Mode** (`profile.selectedPetId !== null` → `isProfileLocked = true`):
  - `selectPet()` strictly snapshots `species`, `weight`, `breed`, `allergens` từ DB pet record. UI không thể mutate.
  - All Profile widget controls (species/BCS buttons + weight slider) get `:disabled="isProfileLocked"` + `btnClass(active, locked)` helper.
  - Locked indicator banner `🔒 Đồng bộ từ hồ sơ bé. Chọn "Nhập thủ công" để giả lập.`
  - "— Nhập thủ công —" option in pet dropdown releases lock for nutritional simulation.
- **Block B — Breed Knowledge Base**:
  - `BREED_OPTIONS` const with 4 cat breeds (ALN/ALD/Tai cụp/Khác) + 5 dog breeds (Poodle/Corgi/Pomeranian/Pug/Khác), each with min/max kg range.
  - `mapBreedFromPet(rawBreed)` fuzzy-maps DB string to code (handles VN + EN aliases).
  - `breedWeightHint` getter: `"💡 Chuẩn giống ALN: 3.5kg – 5.5kg"` shown below slider in manual mode only.
  - `currentBreedOptions` reactive to `profile.species` (cat list vs dog list).
  - `$watch("profile.species")` auto-resets `filters.breed = ""` when species toggled manually (prevents invalid cat+Poodle combo).
- **Block C — Filter consolidation**:
  - REMOVED duplicate species filter from Filters widget (was redundant with Profile species toggle).
  - REPLACED with **Chủng tộc** dropdown bound to `filters.breed`. Options dynamic per `profile.species`.
  - `.filtered` now uses `profile.species` (single source of truth) + breed text-match against brand name/product line.
  - Breed filter logic: brands explicitly mentioning a DIFFERENT breed in our knowledge base → excluded. Generic brands → always pass.
- **Block D — Full Vietnamese localization**:
  - List header: `"Hiển thị X / Y brand"` → `"Tìm thấy X công thức dinh dưỡng phù hợp"`
  - Filter heading: `"Life stage"` → `"Giai đoạn phát triển"`
  - Life stage radios: Puppy/Kitten → `"Thú non (Dưới 1 tuổi)"`, Adult → `"Trưởng thành"`, Senior → `"Lớn tuổi (Trên 7 tuổi)"`
  - `lifeStageLabel()` chip mapping also updated.
- **Block E — 404 fix on Conversion CTA**:
  - `monMinSwapUrl()` was returning `https://monminpet.com/sanpham?tag=hypoallergenic` etc — these tag params caused 404 on actual store.
  - **NOW returns clean `https://monminpet.com/sanpham`** (root product listing — always 200).
- **Block F — Auth Loop fix on Footer banner**:
  - Old: `<a href="/login">Bắt đầu miễn phí →</a>` regardless of auth status → đã login bị đá ra login lại.
  - NEW: Astro conditional render:
    - `userPets.length > 0` → CTA `"Thiết lập Meal Plan ngay ➔"` → `/pets/{firstPetId}/care-plan` (internal deep-link)
    - else → `"Bắt đầu miễn phí →"` → `/login` (original behavior)
- **SW bump**: `v34-nutrition-os` → `v35-nutrition-os-master-fix` (`web/public/sw.js:17`).
- **File size**: 671 → **777 dòng** (+106 dòng for Data Lock + Breed engine + auth-aware CTA).
- **Web startup**: clean — Astro ready in 706 ms, SSR /food-brands → HTTP 200, no warnings, no TS errors.

#### MAJOR FEATURE — Catalog Nutrition OS (v34) ✅
- **Định vị**: chuyển `/food-brands` từ "bảng tra cứu thông số khô" → **"Hệ điều hành dinh dưỡng outcome-driven"** chuẩn FEDIAF/AAFCO. File **316 → 671 dòng** (+355 dòng premium architecture).
- **Block 1 — SSR fetch user pets + latest BCS** (`food-brands.astro:28-57`):
  - Fetch `/api/v1/users/me` (cookie-authenticated, graceful 401 cho guest)
  - Fetch `/api/v1/pets/{firstPetId}/bcs` để lấy BCS record gần nhất
  - Map BCS numeric score → 3-tier: `1-3 = under`, `4-6 = ideal`, `7-9 = over`
  - Pass `userPetsJson` + `initialBcsScoreJson` vào Alpine x-data
- **Block 2 — Sidebar Premium Quick-Profile Matcher** (replaces filter aside):
  - Outer `<aside>` chia thành 2 widget cards: **Hồ sơ bé** (top) + **Bộ lọc** (bottom)
  - Pet dropdown (chỉ hiện khi `userPets.length > 0`)
  - Species toggle (Chó/Mèo) + BCS 3-tier pill (Gầy/Chuẩn/Mập) + Weight slider 0.5-50kg (step 0.1)
  - Hairline DER card hiển thị `kcal/ngày` tabular-nums + RER formula label
  - Mon Min filter toggle refined sang gold accent (was emerald)
- **Block 3 — Card Outcome-Driven Transform** (replaces nutrition chips):
  - Wrapper `<div class="relative">` cho mỗi card → host gold ambient ring + Conversion CTA sibling
  - Gold radial-gradient ring `-inset-1.5 blur-xl opacity-30` quanh Mon Min cards
  - Mon Min badge refined: `bg-mmp-gold/15 ring-1 ring-mmp-gold/40` (was bg-emerald-600)
  - Mismatch state: border `border-rose-200 bg-rose-50/10` (mềm mại, không red-500 chói)
  - Serif italic mismatch banner: *"🚨 Mismatch: Chứa thành phần dị ứng (X) với bé Y"*
  - Gold uppercase subdivider "Cho bé {name}"
  - Combined outcome line: `[X]g · [Y] đ/ngày` (font-bold text-xl tabular-nums)
  - Compatibility progress bar (h-1.5) với 3-tone: emerald >=80, amber >=60, rose <60
  - Dynamic tagline auto-match BCS+macro: *"Hỗ trợ kiểm soát cân"* / *"Tăng cân lành mạnh"* / etc.
  - Disclosure chevron "Xem thông số kỹ thuật thô" → x-show xổ raw P/F/kcal 3-cell grid
  - Conversion CTA sibling "Đổi sang giải pháp MonMin tương thích ➔" — chỉ hiện khi `!mon_min_recommended && compatScore < 60`
- **Block 4 — Alpine state extensions** (`brandsCatalog` function 313 → 173 dòng):
  - New profile state: `{selectedPetId, petName, species, bcs, weight, allergens}`
  - `init()` lifecycle hook: auto-load first pet + apply SSR BCS
  - Computed getters: `rer = 70 × weight^0.75`, `der = rer × multiplier (1.6/1.4/1.0)`, `derMultiplierLabel`
  - Per-brand methods: `gramsPerDay`, `costPerDay`, `estimatedCarb`, `compatScore`, `compatTone`, `isMismatch`, `mismatchReason`, `compatTagline`, `monMinSwapUrl`, `shouldShowSwapCta`, `toggleRawSpecs`
  - Tagged Mon Min URL routing: allergen hit → `?tag=hypoallergenic`, BCS over → `weight-management`, BCS under → `growth`, species → `cat`/`dog`
- **Layout Stability guarantees**: `min-height: 3rem` cho Khẩu phần row, `3.5rem` cho Compat row, `2.4rem` cho Mismatch banner, `min-width: 5ch` cho tabular-num cells, `transition-all duration-700` chỉ trên width của progress bar (no reflow)
- **SW bump**: `v33-card-stretch-fix` → `v34-nutrition-os` (`web/public/sw.js:17`).
- **Web startup**: clean — Astro ready in 747 ms, no warnings, no TS errors. SSR `/food-brands` → HTTP 200.

#### UI POLISH — Card Stretch Fix (v33) ✅
- **Root cause** (regression introduced by v32 wrapper pattern): `<button>` UA default behavior is shrink-to-content width. Class `display: block` alone does NOT force full-width on `<button>` element (unlike `<div>`/`<a>`). After v32 wrapped button in `<div class="relative">`, the wrapper (grid item) correctly stretched to 1/3 column width via `align-items: stretch`, but the button INSIDE the wrapper shrunk to content text length → uneven gaps between cards + badge floating in empty space.
- **Solution**: `QuestStrip.astro:189` — added `w-full h-full` to button class:
  ```diff
  - class={`group relative block bg-white border rounded-2xl p-3 ...`}
  + class={`group relative block w-full h-full bg-white border rounded-2xl p-3 ...`}
  ```
- **Effect chain**:
  - `w-full` → button now fills wrapper width (1/3 grid column) → 3 cards equal width
  - `h-full` → button fills wrapper height (stretched to row tallest) → 3 cards equal height even when quest names span different line counts
  - Wrapper bounds = button bounds → badge `absolute -top-2 -right-2` (positioned relative to wrapper) now snaps exactly to button's physical corner instead of floating in gap
- **SW bump**: `v32-badge-popout` → `v33-card-stretch-fix` (`web/public/sw.js:17`).
- **Web startup**: clean — Astro ready in 659 ms, no warnings, no TS errors.

#### UI POLISH — Quest Completion Badge Pop-out (v32) ✅
- **Root cause**: Quest card had `overflow-hidden` (needed for clipping top difficulty stripe corners to match `rounded-2xl`). The green checkmark badge `bg-emerald-500` positioned `-top-2 -right-2` (8px overflow) was being **clipped at the card boundary** → user saw badge với góc trên-phải bị "cắt phăng".
- **Solution — Wrapper Pattern**: `QuestStrip.astro:184-222` — wrapped each grid card `<button>` in `<div class="relative">`. Moved the badge `<span>` OUT of `<button>` to become SIBLING (still inside the wrapper). Result: badge positioned relative to the wrapper (no clipping) while button keeps `overflow-hidden` (stripe still clipped properly).
- **Badge upgrades**:
  - Added `z-10` (ensures badge floats above neighbor grid card content if scaled/hovered)
  - Added `pointer-events-none` (badge does NOT eat clicks — full card area still triggers `toggleCard(idx)` on the button)
  - Position `-top-2 -right-2` preserved (= `top-[-8px] right-[-8px]` Tailwind shorthand) — pop-out sticker effect intentional
- **Sticky header z-index check**: Dashboard sticky header is `z-40` > badge `z-10`. When user scrolls QuestStrip UP behind header, badge correctly goes BENEATH header (no awkward "punch-through" behavior).
- **`PetScoreCompact.astro` NOT touched** (per user decision): tier badge there has minor 4px clip from outer `overflow-hidden`, but that overflow-hidden is **intentional** for clipping the gold spotlight (`-top-16 -right-16` at line 112) — removing it would let spotlight bleed outside card boundary.
- **SW bump**: `v31-quest-pill-polish` → `v32-badge-popout` (`web/public/sw.js:17`).
- **Web startup**: clean — Astro ready in 640 ms, no warnings, no TS errors.

#### UI POLISH — QuestStrip Cleanup (v31) ✅
- **Fix 1a — Cream ghosting eliminated**: `QuestStrip.astro:188-192` — completed card class removed `opacity-80` (was making `bg-white` semi-transparent → letting dashboard's cream gradient bg #f5f1eb bleed through 20% → user saw "cream rectangle" behind text). Now card stays fully opaque white. Visual completion cues retained: `border-emerald-200`, icon `opacity-50`, text `text-zinc-400 opacity-40`, floating green checkmark badge.
- **Fix 1b — Text contrast refined**: `QuestStrip.astro:201-205` — quest name `<p>` class for completed state changed from `text-zinc-400 opacity-50` → `text-zinc-400 opacity-40` + added defensive `bg-transparent`. Result: ~#d2d2d6 effective color on white bg → readable but subtly faded.
- **Fix 2 — Difficulty pill defragmented**: `QuestStrip.astro:207-212` (grid card) + `QuestStrip.astro:249-252` (inline detail card) — collapsed 3 nested `<span>` (`{label}` + `text-slate-300` dot + `+bonus`) into single inline text string `{meta.label} · +{c.bonus}`. Removed `gap-1` (was creating space around the gray dot making it look like vertical separator). Dot now inherits parent emerald-700 color, padding bumped `px-1.5` → `px-2` to compensate for removed gap. Pill reads as one fluid badge instead of 2 visually-split chunks.
- **NOTE**: Header counter pill at `QuestStrip.astro:118-122` (`{completed_count}/3` with gold "3") intentionally NOT touched — different purpose (progress counter, not difficulty badge) and visually expected to highlight the goal "3" in gold.
- **SW bump**: `v30-dashboard-polish` → `v31-quest-pill-polish` (`web/public/sw.js:17`).
- **Web startup**: clean — Astro ready in 651 ms, no warnings, no TS errors.

#### UI POLISH — Dashboard Visual Bugs (v30) ✅
- **Fix 1 — Smooth scroll for Hero Gold CTA**: When `topAction` is quest-related (label/link matches `/nhiệm vụ|quest/i`), href is overridden to `#daily-quests-section` (anchor scroll on same page) instead of navigating away. Non-quest actions preserve original navigation. Files: `web/src/styles/global.css` (added `html { scroll-behavior: smooth }` + `auto` override in reduced-motion), `web/src/components/dashboard/PetHeroCard.astro` (added `isQuestAction` + `heroCtaHref` computation, swapped href), `web/src/components/dashboard/QuestStrip.astro` (added `id="daily-quests-section"` on root section).
- **Fix 2 — Duplicate title**: `QuestStrip.astro:112` — `"Nhiệm vụ hôm nay"` → `"Hoạt động tích điểm"` (Hero gold button keeps "Nhiệm vụ hôm nay" wording, no more duplication).
- **Fix 3 — Strikethrough bug on completed quests**: `QuestStrip.astro:203` — class for completed quest name `<p>` changed from `"text-emerald-800 line-through"` → `"text-zinc-400 opacity-50"`. Floating green checkmark badge KEPT for completed-state indicator. No more line cutting through "Xem Pet Score" text.
- **Fix 4 — Progress bar to brand gold**: `QuestStrip.astro:165-166` — `background: linear-gradient(90deg, var(--c-gold) 0%, #fde68a 50%, var(--c-gold) 100%)` → `background-color: var(--c-gold)` solid. Consistent với Pet Score gauge, Hero spotlight, all gold accents.
- **SW bump**: `v29-pet-score-merge` → `v30-dashboard-polish` (`web/public/sw.js:17`).
- **Web startup**: clean — Astro ready in 689 ms, no warnings, no TS errors.

#### UI POLISH — Dashboard Pet Score Consolidation (v29) ✅
- **Removed**: `<TopNudge>` zone 5 from dashboard.astro (import + variable + JSX block — all 3 sites)
- **Restructured `PetScoreCompact.astro`**:
  - Outer `<a>` → `<div>` (eliminates nested-anchor risk when chips become links)
  - LEFT gauge column wrapped in own `<a href={/pet-score}>` with `hover:opacity-90`
  - RIGHT "PET SCORE / Tốt" title wrapped in own `<a href={/pet-score}>`
  - **NEW prop `tierNudge`** → when present, replaces "Còn X điểm" formal hint with punchy `🚀 nudge.title` subtitle in gold
  - 4 chips (Vaccine/BCS/Streak/Vet — dynamic top-4 from 8 components) now `<a>` clickable via `CHIP_URL_MAP`:
    - `vaccine_compliance` → `/vaccines`
    - `bcs_optimal` → `/pets/{id}/bcs`
    - `checkin_streak` + `routine_consistency` → `/pets/{id}/routines`
    - `vet_visit_recent` → `/pets/{id}/bills`
    - `water_intake` → `/pets/{id}/water`, `pain_status` → `/pets/{id}/pain`, `mobility` → `/pets/{id}/mobility`
    - fallback → `/pets/{id}/pet-score`
  - Footer "Xem 7 ngày hoạt động" link → `/pets/{id}/activity` (giữ nguyên đích)
- **SW bump**: `vowvet-v28-consent-modal` → `vowvet-v29-pet-score-merge` (`web/public/sw.js:17`)
- **Web startup**: clean — no Astro warnings, no TS errors, 302 redirect to /login when unauth

#### P0 HARDENING #2 — Admin Safety Alert Routing ✅
- `api/src/lib/admin-alerts.ts` (NEW, ~45 lines) — `notifyAdmins(title, body, data)` helper
  - Loops over `ADMIN_PHONES` env (currently `+84939233398`)
  - For each admin: lookup user by phone → push via `sendPush(adminId, sub, payload, { type: "alert_push", bypassRateLimit: true })`
  - Never throws; per-admin failures isolated; logs `[admin-alerts] sent to X` on success
- `api/src/lib/care-planner-v2.ts:360-376` — when `validateCarePlanSafety()` returns `safe: false`:
  - `void notifyAdmins("🚨 VowVet Safety Alert", "Phát hiện vi phạm... Pet ID: X — Vi phạm: [...]", { url: /admin?safety_violation=X, pet_id, violations })`
  - Fire-and-forget (`void`) — care plan response not blocked
- Future reusable for cron failures, R2 outage, etc.

---

### Phase 4D — Care Plan Cron + Weather Refresh (final M27 feature) ✅
- `api/src/lib/care-plan-reminders.ts` (NEW, 155 lines) — `runCarePlanRemindersJob()` clones vaccine-reminders pattern
- `api/src/scheduler.ts` — added cron `"15 7 * * *"` Asia/Ho_Chi_Minh (7:15 AM VN) for care plan push
- `api/src/lib/scheduler-jobs.ts` — `invalidateCarePlanV2(pet.id)` when weather alert severity ≥ "warning"
- `shared/zod-schemas/m5.ts` — added `care_plan_reminders: z.boolean().default(true)` to `NotificationPreferencesSchema` + `DEFAULT_NOTIFICATION_PREFERENCES`
- `api/src/lib/web-push.ts` — type union += `"care_plan_reminder"`
- `api/src/routes/admin.ts` — `POST /cron/test-care-plan-reminders` admin trigger
- `web/src/pages/settings.astro` — `care_plan_reminders` toggle row

### Phase S1 — SYSTEM_PROMPT Toxic Foods Hardening 🟡 (partial win)
- `shared/prompts/care-planner-v2.ts:136-169` — added "QUY TẮC SỐ #0" zero-mention policy (don't mention toxic foods at all, even with "tránh" prefix — UI layer handles warnings)
- **Beo case (dog id=3) FIXED**: was `safe=false hành mentioned`, now `safe=true []`
- Mon (cat ids 5,6) + Pugy (dog id 7) all still PASS — no regression
- **Pet 12 (cat "min") still slips** with "hành" mention — validator catches it. Accepted as "probability shift not guarantee" per honest analysis.
- 5/10 hit Gemini free-tier 20-req/day quota during re-run

### Phase A5 — First-Use Care Plan Consent Modal ✅
- `scripts/migrate-care-plan-consent.ts` (NEW) — Baserow JWT migration script
- Baserow `users` table fields added: `care_plan_consented_at` (id 7384, date_with_time) + `care_plan_consent_version` (id 7385, text)
- `api/src/lib/users.ts` — `BaserowUser` type +2 fields
- `api/src/routes/users.ts` — `GET + POST /api/v1/users/me/care-plan-consent` endpoints (~35 lines)
- `web/src/components/care-plan/ConsentModal.astro` (NEW, ~175 lines) — Alpine factory pattern, **native checkbox "Tôi đã hiểu" + disabled gold CTA until checked**, 3 sections (AI tham khảo / Cấp cứu / checkbox), all brand-safe
- `web/src/pages/pets/[id]/care-plan.astro` — import + SSR consent fetch + mount `<ConsentModal>` inside Layout
- `web/public/sw.js` — bumped `vowvet-v27-care-plan-cron` → `vowvet-v28-consent-modal`

### Docs created this session set
- `docs/STRATEGIC_REVIEW_POST_MVP.md` — 4-direction analysis (A/B/C/D)
- `docs/CARE_PLAN_SAFETY_REVIEW.md` — vet partner review template
- `docs/MVP_COMPLETE_REPORT.md` — final state report
- `docs/PRE_LAUNCH_NEXT_PROMPTS.md` — A3/A4/A5/A6 ready-to-invoke prompts
- `docs/SAMPLES_RUN_RESULTS.md` — v1 + v2 sample comparison + Beo fix evidence
- `docs/SYSTEM_PROMPT_HARDENING_REPORT.md` — S1 honest analysis
- `docs/CONSENT_MODAL_REPORT.md` — A5 8-test acceptance
- `STATE_OF_UNION_AUDIT.md` — 15/15 features inventory
- `CARE_PLAN_CRON_REPORT.md` — Phase 4D report
- `CONTEXT_SYNC.md` — bullet summary for session restart
- **`HANDOFF.md`** (THIS FILE) — full self-contained handoff

---

## 2. CRITICAL ENVIRONMENT NOTES

### Docker port mappings (DO NOT confuse with other apps)

```
vowvet-api    external port 3010 → container port 3000
vowvet-web    external port 4322 → container port 4321
vowvet-baserow  external port 8888
```

⚠️ **Port 3000 + 4321 on the host belong to a DIFFERENT Next.js app called "BUILD"**. If you `curl http://localhost:3000` you get the wrong app. ALWAYS use 3010 + 4322 from the host. Inside the API container, use port 3000 (e.g. `API_INTERNAL_URL=http://vowvet-api:3000`).

### Windows + Git Bash quirks

```bash
# When piping commands or paths into `docker exec`, MUST prefix with MSYS_NO_PATHCONV=1
# otherwise Git Bash mangles Unix-style paths into Windows-style:
MSYS_NO_PATHCONV=1 docker exec vowvet-api sh -c 'cat > /tmp/script.ts' < script.ts

# For Node.js scripts running on Windows host: paths must be Windows-style (C:\...) or
# use cwd-relative ('./samples-v2.json' works from C:\docker\vowvet, not from elsewhere)
```

### Container start/restart

```bash
docker restart vowvet-api vowvet-web    # ~10 seconds for both
docker logs vowvet-api --tail 20         # check startup
docker ps --filter name=vowvet           # verify status
```

### Gemini API quota constraint

- **Free tier**: 20 requests/day per project per model (`gemini-2.5-flash`)
- Already burned ~15-20 requests this session — quota resets daily
- **Production needs paid tier** OR throttle cron to ≤20 plans/day
- Errors look like: `429 Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests`

---

## 3. THE 17-LANDMINE CATALOG (READ THIS BEFORE ANY CODE)

These are recurring mistakes from prior mega-prompts that the **audit-first directive** has caught. ALWAYS verify before using these patterns:

| # | Landmine — looks right, IS wrong | Correct pattern |
|---|---|---|
| 1 | `text-vv-gold` / `bg-vv-gold` Tailwind classes | DO NOT EXIST (silent no-op). Use `style="color: var(--c-gold)"` or `text-mmp-gold` if registered |
| 2 | `Icon.astro` component | DOES NOT EXIST. Use `FeatureIcon.astro` |
| 3 | Hardcoded "BS Duy Trường Phát" / "BS Thú y Duy Trường Phát" | Use `clinic.vet.name` via `getClinicInfo()` |
| 4 | Hardcoded Zalo URL, phone, address | All env-driven via `getClinicInfo()`: `clinic.phone`, `clinic.phone_tel_link`, `clinic.zalo_url`, `clinic.address` |
| 5 | `ensureField()` / `ensureTable()` helpers | DO NOT EXIST. Use Baserow JWT REST migration script (clone `scripts/migrate-vaccine-photo-fields.ts`) |
| 6 | `getSession(Astro.cookies)` in web SSR | Use `Astro.locals.user` from middleware |
| 7 | `requireAuth(c)` as function call in handler | It's middleware applied via `usersRoute.use("*", requireAuth)`. In handlers use `c.get("user")` |
| 8 | `c.get('user').id` for userId | Use `session.sub`. Admin check: `session.phone` against `ADMIN_PHONES` env |
| 9 | Emoji 💉🦠📅 on UI chrome | Forbidden. Use FeatureIcon SVG. Content emoji (in copy text) is OK |
| 10 | Vaccines `vaccinated_at` field | Actually `administered_date` |
| 11 | Vaccines `vaccine_brand` field | Actually `brand` |
| 12 | Table name `pet_vaccines` | Actually `vaccines` (id=637) |
| 13 | `user_id` column on vaccines table | Doesn't exist. Use `getOwnedPet(petId, session.sub)` for ownership |
| 14 | `<FeatureIcon name="edit" />` | NOT registered. Use `edit-pencil` |
| 15 | `<FeatureIcon name="chevron-down" />` | NOT registered. Renders empty |
| 16 | Astro JSX parser chokes on `<= 7` inline | Extract to helper function |
| 17 | `sendPush({user_id, type, ...})` object arg | Actual signature: 4 POSITIONAL args `sendPush(userId, sub, payload, options)` |

**Additional discovered in last session (A5 audit)**:
- `<FeatureIcon name="alert-circle" />` — NOT registered. Use `alert-triangle` or `siren`
- `<FeatureIcon name="phone" />` — NOT registered. Use `tel:` link with `<a>` instead
- `<FeatureIcon name="message" />` — NOT registered. Use `message-circle`
- `clinic.emergency_hotline` — does NOT exist. Use `clinic.phone`
- `clinic.emergency_zalo` — does NOT exist. Use `clinic.zalo_url`

### FeatureIcon registered names (confirmed in `web/src/components/FeatureIcon.astro`)

```
Marketing: passport, ai, climate, syringe, nutrition, camera
Ecosystem: shop, stethoscope, app
Actions: arrow, external, check, plus, close
Chrome: bell, message-circle, settings, search
Dashboard: target, lightning, sparkles, star, paw
Tier: trophy, medal, crown, diamond
Nudges: rocket, flame, edit-pencil, clock
Quick access: activity, bowl, image, handshake, alert-triangle, info, calendar, siren
Community: cake, hearts, hero, gift, shield, shield-check, wallet, scale
Mood: mood-happy, mood-excited, mood-chill, mood-needy, mood-sad, mood-sleeping
Weather: thermometer, snowflake, wind, cloud-lightning, sun, droplet, radar, cloud-sun, eye
Auth/User: lock, user, user-md, smartphone, volume, mail, map-pin
Care plan: clipboard, trash, send, utensils, mic, check-square, ruler, book-open
Misc: heart, share, trending-up, clipboard-check, award
```

---

## 4. ARCHITECTURE QUICK REFERENCE

### File layout

```
C:\docker\vowvet\
├── api/                              # Hono server (Bun runtime)
│   ├── src/
│   │   ├── index.ts                  # mounts routes: app.route("/api/v1/users", usersRoute)
│   │   ├── lib/
│   │   │   ├── care-planner-v2.ts    # generateCarePlanV2(petId, ownerId, options)
│   │   │   ├── care-plan-reminders.ts (Phase 4D)
│   │   │   ├── care-plan-cache.ts    # invalidate(petId)
│   │   │   ├── scheduler-jobs.ts     # runDailyForecastJob, etc.
│   │   │   ├── web-push.ts           # sendPush(userId, sub, payload, options)
│   │   │   └── users.ts              # findUserById, BaserowUser type
│   │   ├── routes/
│   │   │   ├── users.ts              # usersRoute — care-plan-consent endpoints HERE
│   │   │   ├── pets.ts               # care-plan completion + exercise-log + water-log endpoints
│   │   │   └── admin.ts              # admin cron triggers
│   │   ├── middleware/auth.ts        # requireAuth (returns 401 on unauth)
│   │   └── scheduler.ts              # 15 cron jobs registered, TZ=Asia/Ho_Chi_Minh
├── web/                              # Astro 5 SSR
│   ├── public/sw.js                  # SW version controlled here (currently v28)
│   └── src/
│       ├── pages/pets/[id]/care-plan.astro  # main consumer of ConsentModal
│       ├── components/
│       │   ├── FeatureIcon.astro     # SVG icon registry (~80 icons)
│       │   └── care-plan/ConsentModal.astro (NEW, A5)
│       └── layouts/Layout.astro
├── shared/                           # Pure TS, imported by both api/ + web/
│   ├── care-plan-safety.ts           # TOXIC_FOODS_DOG/CAT, BREED_HIGH_RISK, validateCarePlanSafety, CARE_PLAN_DISCLAIMER
│   ├── care-plan-suggestion.ts       # getCurrentSuggestion, calculateTodayProgress
│   ├── prompts/care-planner-v2.ts    # SYSTEM_PROMPT (S1 hardening lives here)
│   ├── clinic-info.ts                # getClinicInfo() returns {name, phone, vet:{name,...}, ...}
│   ├── baserow.ts                    # listRows, getRow, createRow, updateRow
│   ├── jwt.ts                        # signSession, verifySession
│   ├── zod-schemas/m5.ts             # NotificationPreferencesSchema
│   ├── vaccine-groups-vn.ts          # 4 VN combo groups
│   ├── quest-icons.ts                # QUEST_ICON_MAP
│   └── contact-info.ts               # VOWVET_CONTACT static
├── scripts/
│   ├── migrate-*.ts                  # All Baserow JWT migrations
│   ├── generate-care-plan-samples.ts # Sample runner — uses relative paths NOT @shared/*
├── baserow-config.json               # Table + field IDs (regenerated on migration)
├── docker-compose.yml
└── docs/                             # Reports + analysis
```

### Cron schedule (`api/src/scheduler.ts`)

15 active jobs at startup. Key ones for handoff:
- `0 5 * * *` — runDailyForecastJob (calls `invalidateCarePlanV2` on warning+)
- `15 7 * * *` — runCarePlanRemindersJob (NEW Phase 4D — 7:15 AM VN)
- `0 9 * * *` — runVaccineRemindersJob
- (15 total — see scheduler.ts for full list)

### Auth flow

```ts
// API handler pattern (apply requireAuth via middleware FIRST):
usersRoute.use("*", requireAuth);
usersRoute.get("/me/care-plan-consent", async (c) => {
  const session = c.get("user");      // SessionPayload from JWT
  const userId = session.sub;          // ← THIS is the user ID, NOT c.get("user").id
  const user = await findUserById(userId);
  // ...
});

// Web SSR pattern (Astro pages):
const user = Astro.locals.user;        // ← NOT getSession(Astro.cookies)
if (!user) return Astro.redirect("/login");
```

### Migration pattern (Baserow JWT — NO ensureField helper exists)

```ts
// scripts/migrate-XXX.ts — clone from scripts/migrate-vaccine-photo-fields.ts or migrate-care-plan-consent.ts
import { writeFileSync, readFileSync } from "node:fs";
const configPath = Bun.env.BASEROW_CONFIG_IN || "/app/baserow-config.json";
const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));
// 1. Login to Baserow with email/password → get JWT
// 2. POST /api/database/fields/table/{tableId}/ with new field def
// 3. Refresh config — write to /tmp/baserow-config.new.json
// 4. User then copies new config back to host: docker exec vowvet-api cat /tmp/baserow-config.new.json > baserow-config.json
// 5. Restart vowvet-api to pick up new field IDs
```

### Modal pattern (Alpine factory — clone from `web/src/pages/vaccines.astro:555+` or new ConsentModal.astro)

```astro
<div x-data="myModalFactory({ ... })"
     @keydown.escape.window="onEscape()"
     x-show="open" x-cloak x-transition.opacity.duration.200ms
     class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55 print:hidden">
  <div @click.outside="close()" x-show="open"
       x-transition:enter="transition ease-out duration-300"
       x-transition:enter-start="opacity-0 transform translate-y-8"
       x-transition:enter-end="opacity-100 transform translate-y-0"
       class="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
    <!-- content -->
  </div>
</div>
<script is:inline>
  window.myModalFactory = function (cfg) {
    return { open: false, /* ... methods ... */ };
  };
</script>
```

### Web Push pattern (4 POSITIONAL args)

```ts
import { sendPush } from "../lib/web-push.ts";
// CORRECT:
await sendPush(
  userId,                              // number
  subscriptionString,                  // string (JSON.stringify of PushSubscription)
  { title: "...", body: "...", data: { url: "..." } },  // payload
  { type: "care_plan_reminder", bypassRateLimit: false } // options
);
// WRONG: sendPush({ user_id, type, title, body }) — type checks but doesn't work
```

---

## 5. DEFENSE-IN-DEPTH SAFETY MODEL (5 LAYERS)

Critical to understand before touching `/care-plan` code or `validateCarePlanSafety`:

```
Layer 1: AI prompt guardrail (S1 — shared/prompts/care-planner-v2.ts)
         ↓ "QUY TẮC SỐ #0" zero-mention policy for toxic foods
Layer 2: Schema validation (Zod, runs after Gemini returns)
         ↓ Rejects malformed JSON / missing required fields
Layer 3: validateCarePlanSafety() (shared/care-plan-safety.ts)
         ↓ Scans output for TOXIC_FOODS_DOG/CAT names without prefix
         ↓ Sets { safe: false, violations: [...] } on hit
Layer 4: UI disclaimer banners (Phase 3.1, care-plan.astro top + bottom)
         ↓ Always visible to user, independent of AI output
Layer 5: Consent modal (A5 — ConsentModal.astro)
         ↓ Explicit user acknowledgement before first view of /care-plan
         ↓ Persisted in users.care_plan_consented_at
```

When layer N fails, layer N+1 catches. The pet 12 "min" case from samples-v2 is a real-world demo: Layer 1 leaked, Layer 3 caught + flagged, Layer 4 + 5 keep the user informed.

---

## 6. SMOKE-TEST COMMANDS (verify current state)

```bash
# 1. Service worker version
curl -s http://localhost:4322/sw.js | grep "VERSION =" | head -1
# Expected: const VERSION = "vowvet-v28-consent-modal";

# 2. API container up
docker ps --filter name=vowvet-api --format "{{.Status}}"
# Expected: Up X minutes/hours

# 3. Care plan consent endpoint registered (returns 401 unauth = correct)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/api/v1/users/me/care-plan-consent
# Expected: 401

# 4. Migration fields in baserow-config
grep "care_plan_consent" /c/docker/vowvet/baserow-config.json
# Expected: "care_plan_consented_at": 7384,  "care_plan_consent_version": 7385

# 5. /care-plan unauth redirects
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4322/pets/3/care-plan
# Expected: 302 (to /login)

# 6. Scheduler 15 jobs
docker logs vowvet-api --tail 50 2>&1 | grep "jobs scheduled"
# Expected: [scheduler] 15 jobs scheduled

# 7. Cron job exists for care plan reminders
docker logs vowvet-api 2>&1 | grep "care.plan.reminder" | head -3
# (will only fire daily at 7:15 AM VN — empty during day is fine)

# 8. Beo case in samples-v2.json safe
cd /c/docker/vowvet && node -e "const r=require('fs').readFileSync('./samples-v2.json','utf-8');const a=JSON.parse(r.slice(r.indexOf('[\n  {')));const b=a.find(x=>x.pet_name==='Beo');console.log('Beo:',b?.safety_validation);"
# Expected: { safe: true, violations: [] }
```

---

## 7. OPEN ISSUES (read before fixing — some are intentional)

### ~~Bug 1 — Routines page size 200 limit~~ ✅ FIXED 2026-05-23
`size: 500` → `size: 200` at 3 sites in `routines.ts`. `listAllActiveRoutinesForReminders` upgraded to full pagination loop.

### ~~Bug 2 — Personality route collision~~ ✅ FIXED 2026-05-23
Deleted 3 M13 sub-pages (`index/quiz/result.astro`). M15 `personality.astro` is sole route handler. No more WARN on startup.

### Accepted limitation 1 — Pet 12 cat still slips "hành"
The S1 prompt hardening reduced but didn't eliminate toxic food mentions. The validator catches it. This is **WORKING AS DESIGNED** — defense-in-depth. Do NOT spend more cycles iterating the prompt further. Production logs (`[care-plan-v2] SAFETY VIOLATION pet=… violations=…`) will give empirical data to revisit if rate spikes >25%.

### Accepted limitation 2 — Gemini free tier 20/day
Production requires paid tier or throttled cron. Not a code bug.

---

## 8. NEXT STEPS (5 PRIORITIZED TASKS)

### TASK 1 (HIGH PRIORITY): A4 — Observability + Monitoring Audit (READ-ONLY, ~1h)

**Mode**: AUDIT-ONLY. Do NOT modify code unless user explicitly approves after report.

**Goal**: Produce `OBSERVABILITY_AUDIT_REPORT.md` with launch-readiness color (GREEN/YELLOW/RED) across 10 categories.

**10 audit categories** (run all, report status: ACTIVE / INSTALLED_NOT_CONFIGURED / NOT_INSTALLED):

1. **Sentry / Error tracking**
   ```bash
   grep -rn "@sentry\|Sentry.init" api/src web/src --include="*.ts" --include="*.astro" | head
   cat api/package.json | grep -i sentry
   docker exec vowvet-api printenv | grep SENTRY
   ```
2. **Error logging patterns**: count `console.error` / `throw new` / structured logging library (pino/winston)?
3. **Health check endpoint**: `curl http://localhost:3010/health` / `/api/v1/health` / `/healthz`
4. **Performance metrics**: APM (newrelic/datadog/opentelemetry), custom metrics, request timing
5. **DB/API monitoring**: Baserow retry/timeout, Gemini cost tracking (`gemini-usage.log.jsonl` exists?), R2 errors
6. **User analytics**: posthog/plausible/google analytics, event tracking
7. **Critical path monitoring**: cron success/failure tracking, push delivery, AI generation success rate
8. **Disk/resource**: `docker exec vowvet-api df -h /`, `docker stats --no-stream`, log rotation
9. **Backup strategy**: Baserow backup dir, R2 lifecycle, DB backup cron
10. **Alert routing**: webhooks, pagerduty/opsgenie, admin notification on safety violations

**Output template**: see `docs/PRE_LAUNCH_NEXT_PROMPTS.md` (A4 section) for full markdown template.

**Highlight**: Sentry should be #1 priority for production incident tracking. Free tier exists.

---

### TASK 2 (BLOCKING, external): Send samples + safety review to BS via Zalo

**Files to send**:
- `/c/docker/vowvet/samples-v2.json` (~610 lines, 10 generated plans including the fixed Beo + the slip pet 12)
- `/c/docker/vowvet/docs/CARE_PLAN_SAFETY_REVIEW.md` (review template)

**Recipient**: BS Duy Trường Phát via Zalo (`clinic.zalo_url`)

**Talking points**:
- Highlight Beo case fixed (S1 hardening) + pet 12 cat still slips (validator caught — defense-in-depth working)
- Ask BS to review: are clinical recommendations accurate? Toxic foods list comprehensive? Vaccine schedules appropriate?
- SLA: ~2 weeks turnaround

---

### TASK 3 (BLOCKING, external): Send disclaimer + consent copy to lawyer

**Files to send (copy/paste from these files)**:
- `shared/care-plan-safety.ts` — the `CARE_PLAN_DISCLAIMER` object
- `web/src/components/care-plan/ConsentModal.astro` — modal copy
- Consent ack schema: fields `users.care_plan_consented_at` (timestamp) + `care_plan_consent_version` (text "v1-2026-05")

**Ask lawyer**:
- Is the "AI tham khảo, không thay khám BS thú y" disclaimer sufficient under VN consumer protection law?
- Public vaccine passport sharing — does it constitute medical record disclosure?
- Liability boundary between VowVet (software) and partner vet clinic (clinical authority)?

---

### TASK 4 (after BS returns): Apply BS feedback

**When BS provides corrections (Zalo / template / voice note)**:

1. Parse feedback into structured `BSCorrection[]` with category (feeding/exercise/vaccine/monitoring/warning_signs) + severity (critical_safety/clinical_accuracy/best_practice)
2. Generate `docs/BS_FEEDBACK_CORRECTION_PLAN.md` with proposed fixes + file paths + line estimates
3. User approves correction plan
4. Apply corrections 1-by-1 to relevant files (likely `shared/prompts/care-planner-v2.ts`, `shared/care-plan-safety.ts`, `shared/vaccine-groups-vn.ts`)
5. Re-run `generate-care-plan-samples.ts` → produce `samples-v3.json`
6. Diff v2 → v3 report
7. SW bump v28 → v29-bs-feedback

Full template at end of last `PRE_LAUNCH_NEXT_PROMPTS.md` block — search for "A6: BS REVIEW FOLLOW-UP".

---

### TASK 5 (OPTIONAL, 5-min quick win): Fix routines page-size bug

Find `listRows("routines", { size: 500, ... })` in `api/src/lib/` (likely `routine-reminders.ts` or similar). Change `size: 500` → `size: 200`. Restart. Hourly error log noise gone.

---

## 9. KEY CODE SNIPPETS FOR REFERENCE

### `clinic-info.ts` shape (use these EXACT property names)

```ts
interface ClinicInfo {
  name: string;
  phone: string;
  phone_tel_link: string;    // for href="tel:..."
  address: string;
  hours_weekday: string;
  hours_weekend: string;
  hours_start: number;
  hours_end: number;
  emergency_24_7: boolean;
  google_maps_url: string | null;
  zalo_url: string;          // ← USE THIS, not emergency_zalo
  note: string;
  vet: {
    name: string;            // ← clinic.vet.name (e.g. "BSTY Mon Min Pet")
    title: string;
    photo_url: string | null;
    bio: string;
    credentials: string[];
  };
}
```

### `validateCarePlanSafety` signature

```ts
import { validateCarePlanSafety } from "@shared/care-plan-safety.ts";
const result = validateCarePlanSafety(plan, speciesStr); // speciesStr: "dog" | "cat"
// result = { safe: boolean, violations: string[] }
```

### `generateCarePlanV2` signature (operates on REAL Baserow petIds, not mocks)

```ts
import { generateCarePlanV2 } from "../api/src/lib/care-planner-v2.ts";
const plan = await generateCarePlanV2(petId, ownerId, { force_refresh: true });
// petId: number — must exist in Baserow `pets` table
// ownerId: number — must match pets.user_id link_row
```

### Sample script invocation (uses relative imports, NOT @shared alias)

```ts
// scripts/generate-care-plan-samples.ts
// ⚠️ Uses relative paths "../shared/baserow.ts" — NOT "@shared/baserow.ts"
// Reason: bun resolves tsconfig from script location, /app/scripts/ has no tsconfig
import { listRows } from "../shared/baserow.ts";
```

```bash
# Run with:
MSYS_NO_PATHCONV=1 docker exec vowvet-api bun run /app/scripts/generate-care-plan-samples.ts > /c/docker/vowvet/samples-v3.json
```

---

## 10. CURRENT BASEROW SCHEMA (key tables)

```
users (id=635)                        — Main user table
  +care_plan_consented_at  (id 7384)  ← NEW A5
  +care_plan_consent_version (id 7385) ← NEW A5
  ... (phone, email, name, google_oauth_id, push_subscription, notification_preferences, onboarded, ...)

pets                                  — Pet profiles
  ... (name, species, breed, dob, weight_kg, user_id link_row, ...)

vaccines (id=637)                     — Vaccine records (NOTE: not "pet_vaccines")
  administered_date (NOT vaccinated_at)
  brand (NOT vaccine_brand)
  proof_photo_url + invoice_photo_url

care_plan_completions                 — Item check-offs
pet_exercise_logs                     — Exercise tracking
pet_water_logs                        — Water intake
routines (id=663)                     — Has the size=500 bug
notification_log                      — Push delivery log
```

---

## 11. ANTHROPIC SDK / CLAUDE CODE BEHAVIOR NOTES FOR NEW SESSION

- **Always run audit phase BEFORE writing code**. Cumulative track record: caught ~2500-4700 lines of duplicate work across 9 mega-prompts.
- **Use Astro.locals.user, not getSession**. Use `session.sub` for userId, not `c.get("user").id`.
- **FeatureIcon names only** — verify against `web/src/components/FeatureIcon.astro` registry (`grep 'name === "' FeatureIcon.astro`)
- **Migration**: clone existing `scripts/migrate-*.ts` — DO NOT invent `ensureField()` helper
- **SW bump after every UI change** — currently at v28-consent-modal, increment to v29-* next
- **Brand-safe is non-negotiable** — `var(--c-gold)` inline, never `text-vv-gold`. `clinic.vet.name`, never hardcoded names.

---

## 12. RUNNING THE PROJECT (cold start)

```bash
cd /c/docker/vowvet
docker compose up -d              # Start all containers
docker logs -f vowvet-api         # Watch API logs
# Wait for: [scheduler] 15 jobs scheduled
#           Started development server: http://localhost:3000

# Smoke from host:
curl http://localhost:3010/api/v1/users/me/settings     # → 401 (unauth, correct)
curl http://localhost:4322/                              # → 200 (homepage)
curl http://localhost:4322/sw.js | grep VERSION         # → vowvet-v28-consent-modal
```

---

## END OF HANDOFF

The next Claude session should:
1. Read this file FIRST
2. Run smoke commands (Section 6) to verify current state
3. Pick a TASK from Section 8 (recommend TASK 1: A4 observability audit)
4. Follow audit-first directive religiously
5. Bump SW on every UI shipping change
6. Update this file's "what just shipped" section as work progresses

Critical reminders saved to:
- `CONTEXT_SYNC.md` — quick bullet summary
- `STATE_OF_UNION_AUDIT.md` — 15-feature inventory
- `docs/MVP_COMPLETE_REPORT.md` — full MVP state
- `docs/PRE_LAUNCH_NEXT_PROMPTS.md` — A4/A5/A6 ready-to-invoke prompts (some already executed)
- `HANDOFF.md` — THIS FILE (the master doc)

Good luck. The codebase is in good shape.
