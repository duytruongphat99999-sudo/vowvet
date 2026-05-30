# Pre-Launch Direction A — Ready-to-Invoke Prompts

**Status**: Direction A chosen. Sample generation auto-running in background. These are the prompts to invoke for the remaining A1–A6 sub-tasks.

---

## A1 — Sample Generation (in progress, auto-run)

**Script**: `/app/scripts/generate-care-plan-samples.ts` (copied into vowvet-api container)
**Status**: 🟡 Running in background — 10 sequential Gemini Flash calls, ~10-20 min total
**Output**: stdout JSON saved to `/tmp/samples-stdout.log` inside container
**Next**: When complete, copy to host with `docker cp vowvet-api:/tmp/samples-stdout.log ./samples.json` → send to veterinary partner with `docs/CARE_PLAN_SAFETY_REVIEW.md`

---

## A2 — Vet partner clinical review (external)

**No prompt — external**. Steps for owner:
1. Wait for A1 background run to complete (notification will fire)
2. Copy output: `docker cp vowvet-api:/tmp/samples-stdout.log ./samples.json`
3. Send via Zalo to veterinary partner with:
   - `samples.json` (10 generated plans)
   - `docs/CARE_PLAN_SAFETY_REVIEW.md` (review template)
4. Wait ~2 weeks turnaround
5. Apply any corrections to `shared/care-plan-safety.ts` blacklists OR `api/src/lib/care-planner-v2.ts` system prompt

---

## A3 — Edge case test coverage (deferred prompt)

**Status**: Script template ready, but **requires test-pet seeding decision first**.

The challenge: `generateCarePlanV2(petId, ownerId, options)` operates on real Baserow pet rows. Edge cases (kitten 3mo / senior 18yr / diabetic / pregnant / etc.) need diverse profiles that don't exist in the live DB. Options:

| Approach | Tradeoff |
|---|---|
| **A.** Seed 20 fake test pets in Baserow | Pollutes prod DB unless cleaned up; gives full coverage |
| **B.** Mock the Gemini layer with deterministic fixtures | Doesn't exercise real AI; only validates safety pipeline |
| **C.** Manual test: use existing 10 pets, document gaps explicitly | Limited coverage but no DB pollution |

**Recommended next prompt** when user picks an approach:

```
# Phase Pre-Launch A3 — Edge Case Test Coverage

Per docs/STRATEGIC_REVIEW_POST_MVP.md Direction A.

Approach chosen: [A / B / C from PRE_LAUNCH_NEXT_PROMPTS.md]

If A: seed 20 fake test pets via direct Baserow insert + run
  scripts/test-care-plan-edge-cases.ts (clone of samples script,
  inputs 20 petIds) + manually verify each output OR
  flag safety failures
If B: mock GoogleGenAI in test file with deterministic fixtures
  to test validateCarePlanSafety only
If C: document the 20 edge cases that NEED testing but can't be
  run on current DB; explicit gap list in docs/EDGE_CASES_GAP.md

Audit-first: confirm gatherInputs() reads which fields from pet
row + whether mock Gemini path exists in care-planner-v2.ts.
```

---

## A4 — Sentry / Observability audit (ready to invoke)

```
# Phase Pre-Launch A4 — Observability Audit

Audit current state of production observability:

1. Sentry SDK installed?
   - Check api/package.json + web/package.json for @sentry/*
   - Check api/src/index.ts for Sentry.init()
   - Check web/src/middleware/* for Astro Sentry hook
2. Gemini cost log:
   - Verify api/src/lib/care-planner-v2.ts:appendUsageLog writes
     /app/data/gemini-usage.log.jsonl correctly
   - Tail recent entries to confirm format
3. Cron job logging:
   - Verify all 15 jobs in scheduler.ts log start/done/duration
   - Verify failures bubble to docker logs (try/catch wrappers)
4. Error rate metrics:
   - Is there a /health/metrics endpoint?
   - Are 5xx responses tracked?
5. Push delivery rate:
   - notification_log table populated correctly?
   - Failed deliveries surfaced?

Report findings only — no code changes. If gaps found, draft
implementation prompts for each gap as separate phases.

Expected output: docs/OBSERVABILITY_AUDIT.md with PASS/FAIL/
ACTION-NEEDED for each item.

No SW bump (audit-only).
```

---

## A5 — First-use consent modal (ready to ship prompt)

```
# Phase Pre-Launch A5 — First-Use Consent Modal

Per docs/STRATEGIC_REVIEW_POST_MVP.md Direction A: legal-mandated
consent acknowledgement before any user views AI-generated Care
Plan or AI-driven recommendations.

MANDATORY AUDIT FIRST:

1. Existing consent infrastructure:
   grep -rn "consent_ack\|terms_accepted\|first_use_dismissed" /c/docker/vowvet/api/src/ /c/docker/vowvet/shared/
   → does users table have a consent_ack_at field?
2. Existing modal pattern:
   - care-plan.astro line 884+ has vaccineLogModal pattern (Alpine factory)
   - Use that as template, NOT a new modal lib
3. Where to gate:
   - /care-plan SSR: redirect to /consent if !user.consent_ack_at
   - /dashboard SSR: same gate
   - /pets/:id with AI features: same gate
4. Brand-safe (cumulative lessons 17 landmines from STATE_OF_UNION_AUDIT):
   - var(--c-gold) inline (NO text-vv-gold)
   - FeatureIcon SVG (NO emoji chrome)
   - clinic.vet.name via getClinicInfo() (NO hardcoded vet name)
   - Astro.locals.user (NO getSession)

IMPLEMENTATION (SLIM, ~80 lines):

Field migration (if needed):
- scripts/migrate-consent-ack.ts: add users.consent_ack_at field
  (date_with_time), users.consent_ack_version (text, e.g. "v1-2026-05")
- Follow Baserow JWT pattern from scripts/migrate-care-plan-completions.ts

Endpoint:
- POST /api/v1/users/me/consent-ack
- Body: { version: "v1-2026-05" }
- Updates users.consent_ack_at + consent_ack_version
- Returns success

Frontend:
- New: web/src/components/ConsentModal.astro (Alpine factory)
- Mount in Layout.astro conditionally when !user.consent_ack_at
- Modal copy:
  - Title: "VowVet — đồng ý sử dụng"
  - Body: "Care Plan + Triage + Vet Buddy là AI tham khảo, KHÔNG thay
    khám bác sĩ thú y. Có dấu hiệu lạ ở bé — hỏi {clinic.vet.name}
    qua Zalo hoặc cấp cứu {clinic.phone}."
  - CTA primary: "Tôi đồng ý" → POST consent-ack
  - CTA secondary: "Đóng" → redirect to /login (forces re-engage)
- Brand: ink card on cream backdrop, var(--c-gold) CTA, FeatureIcon shield + alert-triangle

SW bump v27 → v28-consent-modal.

Smoke:
- /care-plan SSR before consent: 302 to /consent OR modal blocks
- POST /consent-ack with consent_ack=null user: 200 → user.consent_ack_at set
- Subsequent /care-plan view: no modal (consent persisted)

Report: docs/CONSENT_MODAL_REPORT.md with 8/8 acceptance checks.
```

---

## A6 — Legal disclaimer lawyer review (external)

**No prompt — external**. Owner action:
1. Send `shared/care-plan-safety.ts:CARE_PLAN_DISCLAIMER` object to lawyer
2. Send `web/src/pages/pets/[id]/care-plan.astro` top + bottom disclaimer blocks (lines 128-143 + 484-522 of last seen version)
3. Send vaccine passport public sharing intent (`docs/STRATEGIC_REVIEW_POST_MVP.md` Direction D for context)
4. Ask lawyer:
   - Is the "AI tham khảo, không thay khám BS thú y" disclaimer sufficient under VN consumer protection law?
   - Public passport sharing — does it constitute medical record disclosure?
   - Liability boundary between VowVet (software) and partner vet (clinical authority)?

---

## Summary

| Sub-task | Status | Action needed |
|---|---|---|
| A1 — Generate samples | 🟡 Running | Wait for background completion |
| A2 — Vet review | 🔴 Blocked | Send samples to vet partner after A1 done |
| A3 — Edge cases | 🟡 Decision needed | Pick approach A/B/C from above |
| A4 — Observability | 🟢 Prompt ready | Invoke `Phase Pre-Launch A4` prompt |
| A5 — Consent modal | 🟢 Prompt ready | Invoke `Phase Pre-Launch A5` prompt |
| A6 — Legal review | 🔴 External | Send disclaimer copy to lawyer |

**Recommended next session**: invoke A5 (consent modal) — most concrete deliverable that ships actual code, ~80 lines following established Alpine modal + Baserow JWT migration patterns. A4 (observability audit) is read-only and could be combined if there's bandwidth.
