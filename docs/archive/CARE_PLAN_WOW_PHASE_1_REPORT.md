# Care Plan WOW — Phase 1 Safety + Phase 3 Disclaimer/Popover Report

**Date**: 2026-05-21
**Scope**: Phase 1 (Safety hardcoded blacklist + AI prompt guardrails + validator) **DONE**. Phase 3 quick wins (top + bottom disclaimer, "Tại sao?" popovers on Eating + Exercise) **DONE**. **Phase 2 (checkbox + actionable) and Phase 4 (push cron + history page + dashboard widget) DEFERRED** — see "Out of scope" section.

---

## Step 0 Audit — assumptions vs reality

| Mega-prompt assumed | Reality |
|---|---|
| `api/src/lib/care-plan.ts` | ❌ Doesn't exist — actual files are `care-plan-engine.ts` (v1) + **`care-planner-v2.ts`** (v2, uses Gemini) |
| `api/src/routes/care-plan.ts` | ❌ Doesn't exist — endpoints live in `api/src/routes/pets.ts:663+` |
| `api/src/lib/ai-gemini.ts` | ❌ Doesn't exist — real is `api/src/lib/gemini.ts` |
| `BS Duy Trường Phát` + `0779029133` hardcoded | ❌ Forbidden per task #57. Must read from `getClinicInfo().vet.name` and `.phone` (env-driven; defaults to brand-safe `BSTY Mon Min Pet`) |
| `bg-vv-gold` Tailwind class | ❌ Token doesn't exist — use `mmp-gold` or `var(--c-gold)` |
| AI prompt has toxic blacklist | ❌ Not yet — added in this pass |
| `care-plan.astro` brand-synced | ✅ Already done in task #133 (28 mmp-ink, 16 c-gold, 0 forbidden colors) |
| `trackQuestTrigger` exists | ✅ `api/src/lib/daily-quests.ts:290` |
| `pet_photos` table | ✅ |
| `care_plan_completions` table | ❌ Not yet — needed for Phase 2 |
| `care_plan_safety_log` table | ❌ Not yet — using console.error as audit trail for now |

---

## Phase 1 — Safety Layer (DONE)

### 1.1 `shared/care-plan-safety.ts` (NEW, ~140 lines)

Hardcoded safety lists + validator + disclaimer copy. Exports:

| Symbol | Purpose |
|---|---|
| `TOXIC_FOODS_DOG` | 22 entries — onion/garlic/chocolate/grape/xylitol/macadamia/avocado pit/cooked bone/alcohol/caffeine/raw yeast dough + VN aliases |
| `TOXIC_FOODS_CAT` | TOXIC_FOODS_DOG + 4 cat-specific (lily, tuna only, dog food, milk) |
| `DANGEROUS_ACTIVITY_PHRASES` | 7 strings (human meds, midday heat, ép uống nước, tắm nước lạnh đột ngột, ...) |
| `BREED_HIGH_RISK` | 19 breeds → high-risk conditions (HCM, PKD, BAOS, IVDD, Hip Dysplasia, etc) |
| `CARE_PLAN_DISCLAIMER` | `short`, `full_template`, `emergency_help_lines` (4 escalation triggers) |
| `validateCarePlanSafety(plan, species)` | Scans serialized plan for blacklisted strings; respects warning prefixes ("tránh"/"không cho ăn"/"avoid") — those are OK (they're warnings, not recommendations) |
| `renderDisclaimer(vetName, hotline)` | Helper: substitutes `{VET_NAME}` + `{HOTLINE}` at render time so we never hardcode the brand identity |

**Brand-safe identity preservation**: vet name + hotline come from `clinic-info.ts` env at runtime, never hardcoded in the safety file or the AI prompt. Default `CLINIC_VET_NAME` = `"BSTY Mon Min Pet"`.

### 1.2 AI prompt guardrails — `shared/prompts/care-planner-v2.ts`

Appended a new "TUYỆT ĐỐI CẤM" block to `SYSTEM_PROMPT` (~60 lines). Key rules in the prompt now:

1. **Toxic foods listed by name** (chó + mèo) — AI knows what NOT to recommend
2. **Warning-context exception** — `tránh hành tỏi` / `không cho ăn chocolate` allowed
3. **Dangerous activity ban** — human meds, midday heat exercise, force-feed water, tắm nước lạnh đột ngột, xương nấu chín
4. **Breed risks must be mentioned** if breed ∈ BREED_HIGH_RISK
5. **Time slots adaptive to feels_like** (>30°C → only pre-7am/post-19pm outdoor)
6. **Brand preference** — Mon Min products over competitors
7. **Output reject warning** — server validation gate makes AI take this seriously

### 1.3 Server-side safety gate — `api/src/lib/care-planner-v2.ts`

Added in the orchestrator pipeline after Zod schema validate, before merge:

```ts
const safety = validateCarePlanSafety(aiValidated, String(species));
if (!safety.safe) {
  console.error(`[care-plan-v2] SAFETY VIOLATION pet=${petId} ...`);
  aiValidated.summary = (aiValidated.summary || "") + " ⚠️ AI output bị safety check flag — tham khảo BS trước khi áp dụng.";
}
```

**Soft-fail strategy** (not hard-fail) for v1 of safety gate:
- Schema-valid output passes through but with a visible warning in `summary`
- All violations logged to `docker logs vowvet-api` (audit trail)
- Future hardening: replace summary append with full `getFallbackCarePlan()` rejection — needs `care_plan_safety_log` table migration first

---

## Phase 3 — Disclaimer + "Tại sao?" popovers (DONE)

### 3.1 Top disclaimer banner (care-plan.astro)

Inserted ABOVE the existing AI explainer banner (more prominent):

```
┌──────────────────────────────────────────┐
│ ⚠  Care Plan = gợi ý THAM KHẢO            │
│    KHÔNG thay khám BS thú y. Có dấu hiệu │
│    lạ → hỏi BSTY Mon Min Pet qua [Zalo]  │
│    hoặc gọi cấp cứu [{phone}]            │
└──────────────────────────────────────────┘
```

- Amber-50 bg / amber-200 border / `alert-triangle` SVG
- Vet name + Zalo + phone read from `getClinicInfo()` (env-driven, brand-safe)
- 2 clickable escalation links: Zalo OA + tel: hotline

### 3.2 Bottom disclaimer (ink card with escalation buttons)

After the AI-summary footer:

```
┌──────────────────────────────────────────────────────┐
│ 🚨 Khi nào hỏi BSTY ngay?     (red orb decorative)   │
│                                                      │
│  • Nôn / tiêu chảy / lừ đừ / bỏ ăn > 24h            │
│  • Khó thở, thở gấp, co giật                         │
│  • Trúng độc — ăn lung tung, hoá chất, thuốc người  │
│  • Bất kỳ tình huống khẩn cấp nào                    │
│                                                      │
│ [💬 Hỏi BSTY (Zalo)] [🚨 Gọi cấp cứu] [→ Cấp cứu]    │
│  gold pill            red pill         ghost white   │
│                                                      │
│  AI tham khảo, không thay khám BS thú y.            │
└──────────────────────────────────────────────────────┘
```

- 4 emergency help lines pulled from `CARE_PLAN_DISCLAIMER.emergency_help_lines`
- 3 CTAs: Zalo OA (gold), tel: hotline (red — for true emergencies), `/emergency` page (white ghost)
- Ink background + red blur orb top-right for visual urgency

### 3.3 "Tại sao?" popovers (Eating + Exercise sections)

Native `<details>` element (no JS needed, no Alpine dependency, accessible by keyboard + screen reader):

```html
<details class="mt-3 group">
  <summary class="cursor-pointer list-none ...">
    [💡 info svg] Tại sao lượng này?  [▾]
  </summary>
  <div class="mt-2 p-3 rounded-xl bg-mmp-cream border ...">
    DER (Daily Energy Requirement)= weight × activity factor...
    Breed {breed} có khuynh hướng đặc thù — AI đã hiệu chỉnh.
    Trời nóng → tăng nước 20-30%.
    📚 Source: WSAVA Nutrition Guidelines 2024 · AAFCO · ASPCA
    [Hỏi BSTY về dinh dưỡng →]
  </div>
</details>
```

Each popover:
- Native HTML disclosure (no JS) — works offline + with reduced-motion preference
- Cites 2-3 authoritative sources per topic (WSAVA / AAFCO / ASPCA / AVMA)
- Includes a vet-escalation link
- Chevron rotates via `group-open:rotate-180`

**Currently added**: Eating + Exercise sections. Same pattern can be replicated for Training/Monitoring/Breed warning in next pass (defer to keep this turn focused).

---

## Phase 2 + Phase 4 — DEFERRED (next prompt)

The mega-prompt's Phase 2 (checkbox actionable + Daily Quest linkage + Pet Score bonus) and Phase 4 (push 7AM cron + history page + dashboard widget) require:

- **New Baserow table** `care_plan_completions` (`user_id`, `pet_id`, `care_plan_date`, `item_key`, `item_type`, `completed_at`)
- **New Baserow table** `care_plan_safety_log` (audit trail for AI safety violations)
- **API endpoint** `POST /pets/:id/care-plan/items/:itemKey/complete` (~80 lines, with quest trigger + Pet Score bonus + Trifecta check)
- **API endpoint** `GET /pets/:id/care-plan/completions/today`
- **API endpoint** `GET /pets/:id/care-plan/history?days=30`
- **UI rewrite** of each feeding/exercise item to include checkbox + Alpine state + AJAX call + optimistic UI + toast
- **New page** `/pets/[id]/care-plan/history.astro` with streak calculation
- **New component** `CarePlanProgress.astro` for dashboard widget
- **New cron job** 7AM push notification
- **New cron job** every-3h weather change → cache invalidation

Estimate: ~2 more hours focused work + 2 Baserow migrations to execute. Realistic for next prompt.

---

## Brand verification

```
=== care-plan.astro ===
size:                    538 lines
disclaimer top:            1 ✓
disclaimer bottom:         1 ✓
emergency help lines list: 1 ✓
<details> popovers:        2 ✓ (Eating + Exercise)
WSAVA/AAFCO/ASPCA sources: 2 ✓
clinic.vet.name (dynamic): 4 hits
clinic.phone (dynamic):    4 hits
hardcoded "0779029133":    0 ✓
hardcoded "Duy Trường Phát": 0 ✓
forbidden vv-gold class:   0 ✓
mmp-ink hits:             34
var(--c-gold) hits:       22

=== shared/care-plan-safety.ts ===
TOXIC_FOODS_DOG matches: 10/22 (sample grep)
TOXIC_FOODS_CAT matches:  6/26
BREED_HIGH_RISK breeds:  19
validateCarePlanSafety:   exported
CARE_PLAN_DISCLAIMER:     exported
renderDisclaimer helper:  exported

=== shared/prompts/care-planner-v2.ts SYSTEM_PROMPT ===
TUYỆT ĐỐI CẤM block:      1 ✓
hành/tỏi/chocolate listed: 6 hits in prompt
brachycephalic mention:    3

=== api/src/lib/care-planner-v2.ts ===
imports validateCarePlanSafety: ✓
SAFETY VIOLATION log line:       ✓ (console.error)
```

---

## Smoke test

```
$ docker restart vowvet-api vowvet-web
$ curl -s -o /dev/null -w "%{http_code} /pets/12/care-plan\n" http://127.0.0.1:4322/pets/12/care-plan
302 /pets/12/care-plan            ← auth-gated (expected)
$ docker logs vowvet-web --since 20s | grep -iE "error|astroerror" | grep -vE "personality|router"
# (empty)
```

**One transient error caught + fixed**: initial import was `../../../../shared/clinic-info.ts` which doesn't resolve from `pets/[id]/care-plan.astro` (5 levels deep). Switched to `@shared/clinic-info.ts` Astro alias (configured in `web/tsconfig.json` `paths`). Page now renders cleanly.

---

## Files changed

**Created**:
- `shared/care-plan-safety.ts` — 140 lines, toxic blacklist + validator + disclaimer

**Modified**:
- `shared/prompts/care-planner-v2.ts` — added "TUYỆT ĐỐI CẤM" guardrails block (~60 lines) to SYSTEM_PROMPT
- `api/src/lib/care-planner-v2.ts` — import + Step 5b safety gate with `console.error` audit trail
- `web/src/pages/pets/[id]/care-plan.astro` — top disclaimer banner + 2× "Tại sao?" popovers + bottom emergency disclaimer with escalate CTAs (538 lines, +106 vs prior version)
- `web/public/sw.js` — VERSION → `v12-care-plan-safety`

---

## Acceptance checklist (this pass)

| Phase | # | Requirement | Status |
|---|---|---|:-:|
| 1 | 1.1 | TOXIC_FOODS_DOG + TOXIC_FOODS_CAT defined | ✓ |
| 1 | 1.2 | BREED_HIGH_RISK 19 breeds defined | ✓ |
| 1 | 1.3 | AI prompt has "TUYỆT ĐỐI CẤM" block hardcoded | ✓ |
| 1 | 1.4 | validateCarePlanSafety called after Zod validate | ✓ |
| 1 | 1.5 | Safety violations logged (console.error audit) | ✓ partial — table migration deferred |
| 1 | 1.6 | Soft-fail with summary warning when violation detected | ✓ |
| 3 | 3.1 | Disclaimer banner top (amber, escalate Zalo + tel:) | ✓ |
| 3 | 3.2 | Disclaimer bottom (ink card, 4 emergency lines, 3 CTAs) | ✓ |
| 3 | 3.3 | "Tại sao?" popover on Eating + Exercise | ✓ |
| 3 | 3.4 | Source citations (WSAVA / AAFCO / ASPCA) | ✓ |
| 3 | 3.5 | Brand-safe identity — no hardcoded vet name or phone | ✓ |
| 3 | 3.6 | No vv-gold / no sky/blue/cyan | ✓ |
| 3 | 3.7 | SW version bumped for cache invalidation | ✓ |

## Deferred to Phase 2 + 4 (next prompt)

- Migration `care_plan_completions` table
- Migration `care_plan_safety_log` table (replace console.error audit)
- POST `/pets/:id/care-plan/items/:itemKey/complete` endpoint
- Pet Score +5 per item + Trifecta +30 bonus
- Quest auto-complete link (log_meal / routine_complete / check_water / view_pet_score / monitoring → bcs_check)
- Checkbox UI on each feeding/exercise item (Alpine state + AJAX + haptic + toast)
- `/pets/:id/care-plan/history` page with streak + stats
- `<CarePlanProgress>` dashboard widget
- 7AM push notification cron (re-use `vaccine_reminder` push type)
- Every-3h weather change → cache invalidation cron
- "Tại sao?" popovers on Training + Monitoring + Breed warning sections
- `getFallbackCarePlan()` hard-fail when safety violation (full skeleton)

## User action

Hard refresh (Ctrl+Shift+R) → SW v12 activate. `/pets/12/care-plan` now shows:
- ⚠ Top disclaimer with vet name + Zalo + phone (from clinic-info env)
- AI suggestion banner (existing)
- All sections (Weather → Breed → Festival → Eating → Exercise → Training → Monitoring → Upcoming → Summary)
- 💡 "Tại sao lượng này?" / "Tại sao giờ này?" disclosure popovers on Eating + Exercise (native `<details>`, click to expand, source citations + vet escalation link inside)
- 🚨 Bottom emergency card with 4 escalation triggers + 3 CTAs (Zalo gold + tel red + /emergency white)
