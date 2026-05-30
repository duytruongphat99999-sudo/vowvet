# VowVet — Strategic Review (Post-MVP Decision Document)

**Date**: 2026-05-21
**Status**: MVP COMPLETE — 14 SHIPPED + 1 OBSOLETED + 0 PENDING = 15/15 roadmap features delivered
**Purpose**: Pick next direction. No shipping this turn — inventory + analysis + recommendation only.

---

## Verified MVP state (this turn)

| Check | Result | Evidence |
|---|---|---|
| Cron jobs registered | **15 jobs scheduled** | API startup log (last line of `docker logs vowvet-api \| grep "jobs scheduled"`) |
| Service Worker | **v27-care-plan-cron** | `web/public/sw.js` line with `VERSION =` |
| Shared helpers | **5 files · 979 lines pure TS** | care-plan-safety.ts (150) · care-plan-suggestion.ts (249) · vaccine-groups-vn.ts (363) · quest-icons.ts (118) · clinic-info.ts (99) |
| Cron schedules | 17 `cron.schedule()` call sites | `scheduler.ts` |
| Care planner module | `api/src/lib/care-planner-v2.ts` | exports `generateCarePlanV2(petId, userId, options)` |
| Audit-first track record | 4 wins, ~2500-4700 lines avoided | Phase 4A · Phase Q+A · State of Union · Phase 4D |
| Landmines catalog | 17 documented | STATE_OF_UNION_AUDIT.md |

---

## 4 directions analyzed

### Direction A · Pre-Launch Safety Review **(RECOMMENDED FIRST)**

**Why this should go first**: Production launch on a clinical-decision-adjacent app needs sign-off + observability + edge-case coverage. The entire `validateCarePlanSafety()` helper exists for a reason — but it has never been verified against the actual veterinary partner's clinical judgment.

| Task | Status | Owner |
|---|---|---|
| A1. Generate 10 sample Care Plans | Script ready: `scripts/generate-care-plan-samples.ts` (not yet executed — see "execution costs" below) | Claude Code can run with admin's approval |
| A2. Veterinary partner clinical review | PENDING — needs partner's calendar time | Vet partner (external) |
| A3. Edge case testing (20 scenarios) | Script template ready; needs test-pet seeding for full coverage | Claude Code + admin |
| A4. Sentry / monitoring setup | Audit needed — may already exist | Claude Code (audit 1h) |
| A5. User consent flow first-use | Slim ship | Claude Code (~45 min) |
| A6. Legal disclaimer lawyer review | External | Legal counsel |

**Estimated effort**:
- Claude Code: 3–4 hours total (scripts, audit, consent flow)
- External: vet partner calendar slot (~2 hours for clinical review) + lawyer (~1 hour review)

**Execution costs warning**: Generating 10 + 20 = 30 sample care plans via `generateCarePlanV2` invokes Gemini Flash 30 times. At current pricing (input $0.30/M tokens, output $2.50/M tokens), each plan costs roughly $0.01–$0.03 → total ~$0.30–$1.00 USD. Fine for one-off review, just budget aware.

**Critical for launch**: **YES**. Cannot ship a clinical-decision-adjacent product without partner sign-off + edge-case verification.

---

### Direction B · M28 Vet Buddy (Telehealth Chatbot)

**Why**: Big feature differentiator. AI vet 24/7 with hand-off to real vet when complex.

| Task | Estimated |
|---|---|
| 8 vet persona seed (general / cardio / derma / surgery / nutrition / behavior / dental / exotic) | ~1h migration + seed |
| Routing logic: question → specialty | ~1h |
| Knowledge base: WSAVA + AAFCO + VN context grounding | ~2h prompt engineering |
| Escalation to real vet via Zalo when complex | ~1h |
| Pet Score bonus for usage | ~30 min |
| Conversation history UI | ~1h |
| Brand-safe vet persona display | ~30 min |
| Smoke + report | ~30 min |

**Estimated effort**: 6–8 hours Claude Code

**Critical for launch**: **NO**. Big post-launch feature; ship after MVP stabilizes.

**Risk**: Gemini Flash conversation cost scales with usage; need rate-limiting + per-user daily cap (existing `MAX_PUSH_PER_DAY` pattern can be reused for `MAX_VETBUDDY_TURNS_PER_DAY`).

---

### Direction C · Care Plan Phase 2-5 Trackers

**Why**: Continue the slim-ship pattern proven in Phase 1 (Exercise) + Phase 2 (Water). Each tracker = ~1h, adds rich data capture.

| Phase | Scope | Estimated |
|---|---|---|
| Phase 2 · Water tracker | ✅ already shipped (Phase #176–#179) | — |
| Phase 3 · Weight tracker | `weight_logs` table already exists; auto-compare with prev | ~1h |
| Phase 4 · Health check + photo (dental/coat/eyes/ears) | New `pet_health_checks` table + 4-type taxonomy | ~1.5h |
| Phase 5 · Meal tracker (appetite + actual amount) | Extend `daily_check_ins.check_food` or new `pet_meal_logs` | ~1.5h |
| Phase 6 · Trends panel (7-day avg per dimension) | Read endpoint aggregating all 5 tracker tables | ~1h |

**Estimated effort**: ~5 hours Claude Code (Phase 3–6, since Phase 1+2 already shipped)

**Critical for launch**: **NO**. Nice-to-have; current Exercise + Water trackers cover the highest-value daily data.

---

### Direction D · Vaccine Passport Expansion

**Why**: Vaccine series shipped 4 phases (#180–#196). Final polish would round out the passport experience.

| Phase | Scope | Estimated |
|---|---|---|
| Phase 2B · Dedicated fields migration | Add vet_name, batch_number*, side_effects, reminder_enabled fields to vaccines table (currently lives in notes free-text) — *batch_number already exists | ~1h |
| Phase 3A · PDF Export | HTML print template (no `pdfkit` lib needed) | ~1h |
| Phase 3B · QR + Public Passport | Install `qrcode` lib + new `/p/:slug/vaccines` public route | ~1.5h |
| Phase 3C · Cloudflare R2 photo lightbox | Currently opens raw URL; full-screen viewer with swipe | ~30 min |

**Estimated effort**: ~4 hours Claude Code

**Critical for launch**: **NO**. The current vaccine passport is feature-complete for the core "Sổ Sức Khoẻ Digital" promise. These are polish features.

---

## Recommended sequencing

```
NOW                  +1 WEEK                +1 MONTH                ONGOING
│                    │                       │                        │
├─ Direction A       ├─ User feedback        ├─ Direction B           ├─ Direction D
│  Pre-launch        │  triage from real     │  Vet Buddy             │  Polish features
│  ~3-4h CC          │  pilot users          │  ~6-8h CC              │  as time permits
│  + vet review      │                       │                        │
│  + lawyer          ├─ Direction C          ├─ Iterate on usage      │
│                    │  Trackers based on    │  data                  │
│                    │  what users actually  │                        │
│                    │  want to track        │                        │
│                    │  ~5h CC               │                        │
```

Rationale:
- **A first** — gates launch. Cannot skip.
- **C ahead of B** — easier to validate UX on lightweight trackers than to scope the AI vet's knowledge base correctly without real usage data.
- **B after first month** — needs actual user conversation logs to seed the knowledge base sensibly.
- **D as polish slot** — none of D is blocking; defer until A/B/C show priority.

---

## Decision matrix

| Direction | Time to ship | Risk to launch | User value | Audit-win likely? |
|---|:-:|:-:|:-:|:-:|
| **A — Safety review** | 3-4h CC + external | **High if skipped** | Trust | No (greenfield work) |
| B — Vet Buddy | 6-8h CC | Low | Very high | Partial (uses existing push/clinic-info) |
| C — Trackers | 5h CC | Low | Medium | High (mirrors Exercise/Water pattern, 80% reuse) |
| D — Vaccine polish | 4h CC | Low | Medium-low | Partial (some routes/migrations exist) |

---

## Pre-Launch Checklist (if user picks A)

Detailed action items if Direction A is chosen:

```
A1 — Sample plans
  ☐ Run scripts/generate-care-plan-samples.ts → samples.json
  ☐ Budget: ~$0.30 Gemini API for 10 plans
  ☐ Estimated wall-clock: 5-10 minutes (sequential Gemini calls)

A2 — Veterinary partner clinical review
  ☐ Send samples.json + docs/CARE_PLAN_SAFETY_REVIEW.md to vet partner via Zalo
  ☐ Schedule ~2h review call
  ☐ Apply any required corrections

A3 — Edge case coverage
  ☐ Seed 20 diverse test pets (kitten / senior / diabetic / pregnant / etc)
  ☐ Run scripts/test-care-plan-edge-cases.ts → edge-cases-results.json
  ☐ Manually verify each edge case has appropriate safety behavior
  ☐ Budget: ~$0.60 Gemini API

A4 — Observability
  ☐ Verify Sentry already configured (audit)
  ☐ Verify gemini-usage.log written to /app/data/ correctly
  ☐ Verify [scheduler] logs reach docker logs

A5 — User consent flow
  ☐ Ship first-use modal: "Care Plan = AI tham khảo, không thay khám BS thú y"
  ☐ Persist consent ack in user record
  ☐ ~45 min Claude Code

A6 — Legal review
  ☐ External lawyer review of CARE_PLAN_DISCLAIMER copy
  ☐ External lawyer review of public passport sharing legal implications
```

---

## User decision

**Pick ONE direction for the next session** (then signal which prompt to draft):

- **Direction A** — Pre-launch safety review (RECOMMENDED first)
- **Direction B** — Vet Buddy big feature build
- **Direction C** — Care Plan trackers Phase 3-6
- **Direction D** — Vaccine Passport polish (PDF / QR / lightbox)
- **Mixed** — combine subset (specify which)

Once chosen, I'll draft the implementation prompt with the audit-first directive baked in, pulling from the 17 documented landmines so the next session continues the audit-win streak.
