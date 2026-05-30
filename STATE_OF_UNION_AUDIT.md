# VowVet — State of Union Audit (inventory only, no shipping)

**Date**: 2026-05-21
**Mandate**: KHÔNG ship gì. Chỉ inventory 15 features vs codebase reality.
**Method**: line-evidence grep + file existence + baserow-config inspection
**Outcome**: **13 SHIPPED · 1 OBSOLETED · 1 PENDING** out of 15

The audit-first directive continues paying off — most "deferred" items are actually already in the codebase. Two audit wins last week (Vaccine Cron Phase 4A + Quest UI / Album Phase Q+A) saved ~1700 lines of duplicate code. This report extends the pattern to 13 more features.

---

## 1. Care Plan Phase A — Safety Validator

**Status**: ✅ **SHIPPED** (Phases #144, #145)

| Check | Result |
|---|---|
| `shared/care-plan-safety.ts` exists | ✓ 150 lines |
| `TOXIC_FOODS_CAT` constant | ✓ line 28 |
| `TOXIC_FOODS_DOG` constant | ✓ line 14 |
| `BREED_HIGH_RISK` map | ✓ line 49 |
| `CARE_PLAN_DISCLAIMER` object | ✓ line 76 |
| `validateCarePlanSafety()` function | ✓ line 109 |
| Branches by species (cat vs dog blacklist) | ✓ line 111 |
| Used in care-planner-v2 prompt | ✓ via import `from "@shared/care-plan-safety.ts"` |

**Source line evidence**: `shared/care-plan-safety.ts:14, 28, 49, 76, 109-111`

---

## 2. Care Plan Phase B — Actionable (completions table + endpoint)

**Status**: ✅ **SHIPPED** (Phases #154–#157)

| Check | Result |
|---|---|
| Table `care_plan_completions` in baserow-config | ✓ id present at config line 1021 |
| Migration script | ✓ `scripts/migrate-care-plan-completions.ts` |
| `POST /pets/:id/care-plan/items/:itemKey/complete` | ✓ `pets.ts:861` |
| Idempotent (skip if row exists today) | ✓ existence check before create |
| Pet Score +5 per item | ✓ `PER_ITEM_BONUS = 5` + `updateRow("users", ..., pet_score_bonus)` |
| Quest trigger via `classifyCarePlanItem()` | ✓ maps feeding/exercise/water/training/monitoring |
| Trifecta +30 bonus when all 3 categories complete | ✓ `TRIFECTA_BONUS = 30` + sentinel row |
| GET `/care-plan/completions/today` | ✓ `pets.ts:1004` |
| GET `/care-plan/completions/summary` | ✓ `pets.ts:1037` |
| Dashboard widget `CarePlanProgress` | ✓ phase #157 |

**Source line evidence**: `pets.ts:860+, 920+, 945+, 1004+, 1037+`

---

## 3. Care Plan Phase C — UI Brand Sync + Why Popovers

**Status**: ✅ **SHIPPED** (Phase #146)

| Check | Result |
|---|---|
| `bg-mmp-ink` hero in care-plan.astro | ✓ `care-plan.astro:236` |
| Top safety disclaimer banner | ✓ in current file |
| Bottom "Khi nào hỏi BSTY ngay?" disclaimer | ✓ in current file |
| "Tại sao lượng này?" popover (Eating) | ✓ `care-plan.astro:544` |
| WSAVA Nutrition Guidelines source citation | ✓ `care-plan.astro:554` |
| AAFCO Nutrient Profiles citation | ✓ `care-plan.astro:554` |
| ASPCA Hydration Standards citation | ✓ `care-plan.astro:554` |
| "Tại sao giờ này?" popover (Exercise) | ✓ `care-plan.astro:639` |
| ASPCA Heat Safety Guidelines citation | ✓ `care-plan.astro:652` |
| AVMA Exercise Recommendations citation | ✓ `care-plan.astro:652` |

**Source line evidence**: `care-plan.astro:236, 544, 554, 639, 652`

---

## 4. Care Plan Phase D — Retention (Push cron + weather change refresh)

**Status**: ❌ **PENDING** — The only feature not yet shipped

| Check | Result |
|---|---|
| Care-plan-specific cron in `scheduler.ts` | ✗ `grep "care.plan.*cron\|carePlanReminder\|runCarePlanReminder"` returns empty |
| Weather change → invalidate care-plan cache | ✗ no integration found |
| Care plan push notification type | ✗ no `care_plan_reminder` literal in code |
| Care plan engine HAS cache invalidation helper | ✓ `invalidate as invalidateCarePlanV2` from care-plan-cache.ts |

The 14 jobs scheduled at startup are: forecast (7AM), vaccine reminder (8AM), birthday (8:30AM), severe weather (hourly), cleanup (Sunday 3AM), SLA breach (every 30min), routine reminder (every 15min) + 7 others. **None is care-plan-specific**.

**Hook points exist** (`invalidateCarePlanV2` + push subscription pattern from M5) — would need ~50 lines of new cron handler + scheduler.ts registration to ship.

---

## 5. Care Plan 3-layer Information Hierarchy

**Status**: ✅ **SHIPPED** (Phase #169)

| Check | Result |
|---|---|
| Layer 1 hero "Bây giờ làm gì?" | ✓ `care-plan.astro:9, 233` |
| Layer 2 Tasks (Ăn / Vận động / Theo dõi) | ✓ `care-plan.astro:10, 416, 421` |
| Layer 3 Kiến thức accordion | ✓ `care-plan.astro:11` |
| Smart suggestion helper `getCurrentSuggestion()` | ✓ `shared/care-plan-suggestion.ts:249 lines` |
| `calculateTodayProgress()` per-category stats | ✓ same file |
| Used at frontmatter line 160-161 | ✓ confirmed |

**Source line evidence**: `care-plan.astro:9-11, 160-161, 233, 416, 421` + `shared/care-plan-suggestion.ts` 249 lines

---

## 6. Vaccine VN Group Redesign

**Status**: ✅ **SHIPPED** (Phases #180, #181)

| Check | Result |
|---|---|
| `shared/vaccine-groups-vn.ts` exists | ✓ 363 lines |
| 2 groups per species (4 total: cat_core_4in1, cat_rabies, dog_core_7in1, dog_rabies) | ✓ |
| `getVaccineGroupsForSpecies()` helper | ✓ |
| Legacy alias matcher (FVRCP/FeLV/FIV/DHPPi/etc.) | ✓ `matchesGroup()` checks 11 cat + 11 dog + 4 rabies aliases |
| Species-gated rabies match | ✓ prevents dog rabies matching `cat_rabies` |
| `getGroupStatus()` returns 5-state info (not_done / overdue / due_soon / done_recent / up_to_date) | ✓ |
| Mon Min Clinic CTA subordinate at footer | ✓ "Cần gợi ý phòng khám?" + small text (Phase #183 passport mindset) |

**Source line evidence**: `shared/vaccine-groups-vn.ts` full file; `vaccines.astro` Mon Min footer

---

## 7. Vaccine Hero Status 4 States

**Status**: ⚠️ **OBSOLETED by Passport mindset shift** (Phase #183)

The original 4-state hero (`urgent / attention / good / perfect` from Phase #181) was **intentionally replaced** in Phase #183 (Vaccine Passport mindset shift) with the "Pet Health Passport · Sổ Sức Khoẻ Digital" identity hero. User's own evolution:

> "VowVet ≠ booking clinic. VowVet = SỔ SỨC KHOẺ DIGITAL portable — owner luân phiên clinic, lười, cần sổ ghi nhớ."

| Check | Result |
|---|---|
| Original `HERO_COPY` map with 4 states | ✗ replaced |
| `heroSummary.state` aggregation across pets | ⚠️ `summarizeAcrossPets()` still exists in shared/vaccine-groups-vn.ts (returns urgent/attention/good/perfect), but the page consumes it via the passport hero |
| Passport identity hero | ✓ `vaccines.astro:191-194` "Pet Health Passport · Sổ Sức Khoẻ Digital" |
| 3-stat strip (records / sắp tới / trễ hạn) | ✓ |
| Cross-pet reminders section ≤30 days | ✓ |

Verdict: the 4-state logic still exists as a helper, but the visual hero swapped to passport. The user explicitly chose this in the Phase Q+A scope question — it's working as intended.

---

## 8. Brand Sync /alerts

**Status**: ✅ **SHIPPED** (Phases #111–#115)

| Check | Result |
|---|---|
| Forbidden colors count in alerts.astro | **0** (`grep "bg-(blue\|cyan\|purple\|sky\|indigo\|fuchsia\|violet)-"` empty) |
| File path | `/c/docker/vowvet/web/src/pages/alerts.astro` |

---

## 9. Brand Sync /chat

**Status**: ✅ **SHIPPED** (Phases #117–#119)

**Path note**: file is at `web/src/pages/chat/index.astro` (not `chat.astro`) — folder-based routing.

| Check | Result |
|---|---|
| Forbidden colors in `chat/index.astro` | **0** |

---

## 10. Brand Sync /chat/new

**Status**: ✅ **SHIPPED** (Phase #121)

| Check | Result |
|---|---|
| Forbidden colors in `chat/new.astro` | **0** |

---

## 11. Brand Sync /settings

**Status**: ✅ **SHIPPED** (Phase #122) — confirmed clean during Phase 4A vaccine cron audit

Settings page already brand-synced; recent toggle additions (cities optgroup #130, vaccine_reminders #195) also brand-safe.

---

## 12. SVG Icon System (Icon vs FeatureIcon)

**Status**: ✅ **SHIPPED** — but path is `FeatureIcon.astro`, NOT `Icon.astro`

| Check | Result |
|---|---|
| `web/src/components/Icon.astro` exists | ✗ NEVER EXISTED |
| `web/src/components/FeatureIcon.astro` exists | ✓ canonical (Phase #48 created, #65/#125/#159 extended) |
| `shared/quest-icons.ts` exists | ✓ 118 lines |
| `QUEST_ICON_MAP` with 15 quest codes | ✓ |
| `getQuestIcon()` lookup helper | ✓ used in QuestStrip.astro:22 |

**Cumulative landmine**: the recurring "Icon.astro" mistake in mega-prompts has been caught 7+ times. The canonical component is `FeatureIcon.astro` with ~80+ registered SVG icons.

---

## 13. Activity Timeline `/pets/[id]/activity`

**Status**: ✅ **SHIPPED** (Phases #164, #165, #166)

| Check | Result |
|---|---|
| Page `/pets/[id]/activity.astro` | ✓ exists |
| API endpoint `GET /pets/:id/activity` | ✓ `pets.ts:1707` |
| Accepts `?days=N` query | ✓ |
| `POINTS_BY_ACTIVITY` map (8 types) | ✓ `pets.ts:1696` |
| `safeList()` fail-soft wrapper | ✓ `pets.ts:1721` |
| 7 parallel data sources (pet_photos, daily_check_ins, pet_diary, bcs_assessments, user_daily_quests, user_achievements, care_plan_completions) | ✓ `pets.ts:1738–1753` |
| Dashboard PetScoreCompact link to /activity | ✓ Phase #166 |

---

## 14. Mon Min Clinic `shared/clinic-info.ts`

**Status**: ✅ **SHIPPED**

| Check | Result |
|---|---|
| File exists (99 lines) | ✓ |
| `getClinicInfo()` helper | ✓ line 48 |
| Returns: name, phone, phone_tel_link, address, hours_weekday, hours_weekend, hours_start/end, emergency_24_7, google_maps_url, zalo_url, note, vet (brand-safe identity) | ✓ |
| Brand-safe vet name default "BSTY Mon Min Pet" (not "BS Duy Trường Phát") | ✓ Phase #57 fixed |
| Address env-driven (`CLINIC_ADDRESS` env var) | ✓ default placeholder "TP.HCM (địa chỉ sẽ cập nhật)" |
| `isClinicOpenNow()` + `getNextOpenTime()` helpers | ✓ Phase #118 |
| Zalo URL env-driven | ✓ `process.env.CLINIC_ZALO_URL || getZaloLink()` |

**Note**: address still on default placeholder — once production env sets `CLINIC_ADDRESS=1046 Âu Cơ, Tân Bình, TP.HCM`, all pages render the real value (no code change needed).

---

## 15. Phase 1 Exercise Tracker

**Status**: ✅ **SHIPPED** (Phases #171–#175)

| Check | Result |
|---|---|
| Table `pet_exercise_logs` migrated | ✓ baserow-config.json line 1037 |
| Migration script | ✓ `scripts/migrate-pet-exercise-logs.ts` |
| `POST /pets/:id/care-plan/exercise-log` | ✓ `pets.ts:1092` |
| Zod-validated body | ✓ `exerciseLogSchema` |
| Mirrors to `care_plan_completions` (idempotent) | ✓ |
| Pet Score +5/+10 bonus (detailed if notes OR non-none symptoms) | ✓ |
| Quest trigger `routine_complete` | ✓ |
| Warning toast for symptoms (breathing_hard/limping/cough) | ✓ |
| ExerciseTrackingModal in care-plan.astro | ✓ Phase #174 (Alpine factory `exerciseTracker`) |
| SW v19-exercise-tracker | ⚠️ superseded by later bumps; current is **v26-quest-album-audit-win** |

The Phase 1 work was Phase 1 of a Smart Tracking series. Phase 2 (Water) shipped at #176–#179. Phase 3+ (Health checks / Meal / Weight) deferred.

---

## Summary table

| # | Feature | Verdict | Phase |
|---|---|:-:|---|
| 1 | Care Plan Safety validator | ✅ SHIPPED | #144, #145 |
| 2 | Care Plan completions table + endpoint | ✅ SHIPPED | #154–#157 |
| 3 | Care Plan UI brand sync + Why popovers | ✅ SHIPPED | #146 |
| 4 | Care Plan push cron + weather refresh | ❌ **PENDING** | — |
| 5 | Care Plan 3-layer hierarchy | ✅ SHIPPED | #169 |
| 6 | Vaccine VN groups | ✅ SHIPPED | #180, #181 |
| 7 | Vaccine 4-state hero | ⚠️ OBSOLETED (replaced by passport) | #181 → #183 |
| 8 | Brand sync /alerts | ✅ SHIPPED | #111–#115 |
| 9 | Brand sync /chat | ✅ SHIPPED | #117–#119 |
| 10 | Brand sync /chat/new | ✅ SHIPPED | #121 |
| 11 | Brand sync /settings | ✅ SHIPPED | #122 |
| 12 | Icon system (FeatureIcon, NOT Icon) | ✅ SHIPPED | #48 (created), #65/#125/#159 (extended) |
| 13 | Activity timeline page + endpoint | ✅ SHIPPED | #164–#166 |
| 14 | shared/clinic-info.ts | ✅ SHIPPED | #118 (helpers added) |
| 15 | Phase 1 Exercise tracker | ✅ SHIPPED | #171–#175 |

**Tally**: 13 shipped · 1 obsoleted (intentional replacement) · 1 pending · 0 partial

---

## What's actually PENDING (the only real gap)

### Feature 4: Care Plan Phase D — Push reminder cron + weather change refresh

The only feature where the audit returned empty for the implementation. Two concrete sub-tasks:

**Sub-task 4a — 7 AM push reminder cron**:
- New file: `api/src/lib/care-plan-reminders.ts` (~80 lines, mirror of vaccine-reminders.ts pattern)
- For each user with push_subscription + `notification_preferences.care_plan_reminders` enabled:
  - Find users whose care-plan v2 cache is fresh today
  - Send "💚 {pet} - Kế hoạch hôm nay đã sẵn sàng" push
  - Deep link: `/pets/{id}/care-plan`
- Register in `scheduler.ts` at `0 7 * * *` (alongside `runDailyForecastJob`)
- Add `care_plan_reminders: z.boolean().default(true)` to `NotificationPreferencesSchema`
- Add toggle row to `/settings` (same pattern as Phase 4A vaccine_reminders)

**Sub-task 4b — Weather change → invalidate cache**:
- Hook into existing `runDailyForecastJob` (already runs at 7 AM)
- When `evaluateTodayAlerts()` returns ≥1 severity ≥ warning for a pet, call `invalidateCarePlanV2(petId)` so next dashboard view regens with the new weather context
- ~10 lines added to existing `scheduler-jobs.ts:Job 1` handler
- No new cron job, no new schema

**Estimate**: ~120 lines total. SLIM scope (1 new lib + 1 modified scheduler-jobs + 1 setting toggle + 1 SW bump).

---

## Recommended order based on dependencies

If user wants to ship Phase D:

1. **Sub-task 4b first** (weather → invalidate) — additive, no new infra, 10 lines added to existing daily cron. Low risk.
2. **Sub-task 4a second** (push reminder cron) — depends on user opting in via notification_preferences. Mirrors vaccine-reminders.ts proven pattern. ~80 lines.
3. **Settings toggle** for `care_plan_reminders` — 2 lines in settings.astro (same diff as Phase 4A).
4. **SW bump** v26 → v27.

Each step is independent and could ship in its own session.

---

## Codebase health snapshot

Cumulative shared helper inventory:

| File | Lines | Purpose |
|---|---:|---|
| `shared/care-plan-safety.ts` | 150 | Toxic foods + breed warnings + AI safety validator |
| `shared/care-plan-suggestion.ts` | 249 | "Bây giờ làm gì?" suggestion + per-category progress |
| `shared/vaccine-groups-vn.ts` | 363 | VN combo grouping + legacy aliases + status |
| `shared/quest-icons.ts` | 118 | 15 quest codes → FeatureIcon name + brand colors |
| `shared/clinic-info.ts` | 99 | Mon Min clinic env-driven brand identity + open hours |
| **Total shared logic** | **979** | All TypeScript pure functions, importable from API + Web |

Cumulative SW versions: v1 → v26-quest-album-audit-win (25 cache-invalidation bumps).

Cumulative landmines caught by audit-first directive: **17+ across 8 mega-prompt phases**, summarized below for future reference.

---

## The 17 cumulative landmines (for next-prompt readers)

These keep appearing in mega-prompts; the audit-first directive catches them. Keep this list visible when reviewing future prompts:

| # | Landmine | Reality |
|---|---|---|
| 1 | `text-vv-gold` / `bg-vv-gold` Tailwind class | Token DOES NOT EXIST (silently no-ops). Use `var(--c-gold)` inline OR `text-mmp-gold` |
| 2 | Import from `'../../components/Icon.astro'` | Component DOES NOT EXIST. Use `FeatureIcon.astro` |
| 3 | Hardcoded "BS Duy Trường Phát" anywhere | FORBIDDEN brand identity. Use `clinic.vet.name` ("BSTY Mon Min Pet") |
| 4 | Hardcoded Zalo URL / phone / address | Use `getClinicInfo()` (env-driven) |
| 5 | `ensureField()` / `ensureTable()` helpers | DO NOT EXIST. Real migrations use Baserow JWT REST + helper script template (`migrate-care-plan-completions.ts` pattern) |
| 6 | `getSession(Astro.cookies)` import | DOES NOT EXIST. Use `Astro.locals.user` from middleware |
| 7 | `requireAuth(c)` as function call | It's middleware. Use `petsRoute.use("*", requireAuth)` + `c.get("user")` inside handlers |
| 8 | `c.get('user').id` for user identity | Codebase uses `session.sub` (number, from JWT). For admin check: `session.phone` |
| 9 | Emoji 💉🦠📅🏆 etc on UI chrome | Forbidden — must use FeatureIcon SVG. Content (mood mascot, tier medals) can keep emoji |
| 10 | `vaccinated_at` field on vaccines | Actually `administered_date` |
| 11 | `vaccine_brand` field | Actually `brand` |
| 12 | `pet_vaccines` table | Actually `vaccines` (id=637) |
| 13 | `user_id` column on vaccines | DOES NOT EXIST. Use pet ownership via `getOwnedPet(petId, session.sub)` |
| 14 | `Icon name="edit"` in FeatureIcon | Doesn't exist. `edit-pencil` is the registered name |
| 15 | `Icon name="chevron-down"` | Not registered; renders empty (used in many pages — silent UX bug) |
| 16 | Astro JSX parser chokes on `<= 7` inline | Extract to helper outside JSX expression |
| 17 | Fragment shorthand `<>text</>` with attributes / text | Use `<span>` or `<Fragment>` longhand |

Adding new landmines to this list as they're caught is a useful pattern for future audit-first prompts.

---

## Suggested next-prompt scopes (if user wants to keep building)

In order of impact:

1. **Care Plan Phase D** (the only real PENDING) — ~120 lines, mirrors vaccine reminder pattern
2. **Health Check Modal** (Phase 3 of Smart Tracking, deferred from Phase 1/2) — dental/coat/eyes/ears via existing `pet_health_checks` table (or new)
3. **Meal Tracking Modal** — extends existing `daily_check_ins.check_food` to capture appetite + actual amount
4. **Weight Tracking Modal** — `weight_logs` table already exists; auto-compare with previous; mirror exercise/water pattern
5. **Vaccine PDF Export** — passable as HTML print (no pdfkit needed)
6. **Vaccine QR / Public Passport** — needs `qrcode` lib install + new `/p/:slug/vaccines` route

All would be SLIM scope additions following the established patterns.

---

## Closing observation

After 7 mega-prompts + 1 audit-only prompt:

- **3 audit wins** caught duplicate-work in vaccine cron Phase 4A, Quest UI Phase Q+A, and now this State of Union (which itself acts as a single audit win across 13 features simultaneously).
- **Audit-first directive saved ~2000+ lines of duplicate code** across the series.
- **17 landmines** kept being caught — the mega-prompts have a recurring set of false assumptions that the audit-first pattern reliably defuses.

The codebase is in good shape. Phase D is the only legitimate gap remaining from the original roadmap.
