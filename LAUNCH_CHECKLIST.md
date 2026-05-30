# VowVet (by Mon Min Pet) — Launch Checklist

Last updated: 2026-05-19 · API v0.29.0 · 41 Baserow tables · 11 cron jobs · Pet Score 13 components.

## Critical pre-launch

### Secrets / environment
- [ ] `GEMINI_API_KEY` set in prod env — without it M22 BCS Vision uses mock fallback (works, but no real AI)
- [ ] `R2_*` (ACCOUNT_ID/ACCESS_KEY/SECRET/BUCKET/PUBLIC_URL) — required for BCS photo uploads + voice diary + pet photos + bills
- [ ] `JWT_SECRET` rotated (NOT the dev value `0d1f692c...`)
- [ ] `BASEROW_TOKEN` scoped to prod database only
- [ ] `ADMIN_PHONES` set so SLA breach notifications reach humans
- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` for web push (M11 birthdays, M30 anniversaries, M19 routines)
- [ ] `ZNS_TOKEN` + `ZNS_ENABLED=1` if Zalo ZNS reminders enabled (M29 toggle)
- [ ] `WEB_PUBLIC_URL` set to canonical https://vowvet.monminpet.com (M30 memorial public_url builds)

### Baserow schema
- [ ] All 36 tables present (run `bun scripts/setup-baserow.ts` + every migrate-mXX.ts)
- [ ] M22 table: `bcs_assessments` (id 678) — confirm via baserow-config.json
- [ ] M30 tables: `memorials` (679), `memorial_visits` (680), `memorial_interest` (681)
- [ ] Single_select fields seed values match code: bcs_category, memorial_status, tier, tier_interested

### Cron jobs (11 scheduled in Asia/Ho_Chi_Minh)
- [ ] Daily 7AM forecast (Job 1)
- [ ] Daily 8AM vaccine reminders (Job 2)
- [ ] Hourly severe weather watch (Job 3)
- [ ] Sunday 3AM cleanup (Job 4)
- [ ] Every 30min SLA breach check (Job 5)
- [ ] Daily 8:30AM birthday reminders (Job 6)
- [ ] Every 15min routine reminders (Job 7)
- [ ] Monthly day-1 00:00 streak freeze refill (Job 8)
- [ ] Daily 23:55 EOD streak warning (Job 9)
- [ ] **Every 6h expire pending playdate matches (Job 10 — M27 new)**
- [ ] Daily 9AM memorial anniversary reminders (Job 11 — M30)

## Legal / compliance gates

### M30 Memorial — high risk
Strategy doc warned: "sai một cái là phốt thảm". Verify before launch:
- [ ] NO payment processing endpoint — confirmed: only `/memorials/:mid/interest` collects contact, returns "Mon Min sẽ liên hệ. Không có phí trả trước."
- [ ] NO mention of cremation services, partner funeral homes, or paid tiers as "available now"
- [ ] Upgrade page disclaimer visible: "Đăng ký quan tâm — không phải thanh toán"
- [ ] Public memorial footer: "Mon Min không xử lý dịch vụ hỏa táng"
- [ ] All 3 premium tiers labeled "Liên hệ" (not a price)
- [ ] Manual follow-up SLA for interest signups: 1-2 business days (commit in copy, train CS team)

### M27 Pet Playdate — moderate risk
- [ ] Vaccine gate (≥2 completed) enforced on profile create
- [ ] Rate limit 50 swipes/day per user enforced
- [ ] Cross-species discovery blocked (safety: dogs ↔ cats)
- [ ] Auto-hide profile when report_count ≥3 verified
- [ ] Block match prevents both sides from sending further messages
- [ ] Test swipe UX on Android Chrome + iOS Safari (touch events)
- [ ] Setup admin dashboard to review pending reports (currently raw Baserow only)
- [ ] Confirm all play_styles labels render in Vietnamese (5 keys: fetch/wrestle/chase/calm/swim)
- [ ] Test breeding "looking_for" copy with legal — currently active (consider gating behind explicit consent)

### M20 Auth + Lost Pet
- [ ] Password reset email flow tested end-to-end
- [ ] Lost pet `/p/<SLUG>` does not leak owner contact except via opt-in masked phone
- [ ] Vet partner scan endpoint requires `vet` role

### Privacy
- [ ] R2 bucket has public read for `pet-photos/`, `bcs/`, `voice-diary/` keys but NOT `bills/` (PII receipts)
- [ ] R2 lifecycle: cold tier after 90d for cost
- [ ] User can delete account → cascades pet → cascades all linked tables (manual confirm)

## Smoke tests

### API smoke
```bash
# version
curl https://api.../  # → {"name":"vowvet-api","version":"0.28.0"}
# health
curl https://api.../api/v1/health
```

### Owner happy path
- [ ] Login (email or Google)
- [ ] Onboarding → create pet
- [ ] Care plan loads
- [ ] BCS: upload 2 photos → assessment created (mock fallback OK if no Gemini key)
- [ ] Memorial: create → public slug shareable → candle + message work anonymously
- [ ] Pet Score reflects latest BCS

### Public smoke (no auth)
- [ ] `/p/<QR_CODE>` shows masked owner info if pet is lost
- [ ] `/memorial/<SLUG>` shows tribute + candle + message form
- [ ] `/map` shows places with category filter
- [ ] Birthday wall `/birthday/<slug>` shows wishes

## Known issues / tech debt
- [ ] Weather endpoint 500 on `?city=hcm` (slug mismatch with CITIES map) — fix to alias hcm → ho_chi_minh
- [ ] Routine reminder Baserow page size 500 → 400 error (lib still uses size=500, should be ≤200) — `routine-reminders.ts`
- [ ] Pet Score `chronic_conditions_count` hardcoded 0 (Phase 0 — no dedicated field)
- [ ] BCS Pet Score signal currently reads `pet.body_condition_score` synced on assess; if user has older `pet.bcs` field but no assessment yet, latest BCS won't show in score until first assessment
- [ ] Memorial frontend `isOwner` check uses `?owner` querystring (no JS auth context) — works but not ideal; consider passing through SSR-set data attribute
- [ ] No bot reply for M28 Vet Buddy (deferred)
- [ ] No Tinder swipe for M27 Playdate (deferred)

## Rollback plan
- Each feature is independent; M22 + M30 can be disabled by:
  - Removing route mount lines in `api/src/index.ts`
  - Hiding pet detail card links in `web/src/pages/pets/[id].astro`
  - Removing scheduler Job 11 cron.schedule block
- Data tables stay (no destructive migration); re-enable by reverting commits.
