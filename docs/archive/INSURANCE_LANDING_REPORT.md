# VowVet — Insurance Landing Page Build Report

**Date:** 2026-05-20
**Result:** ✅ 50/50 E2E checks pass

Built `/insurance` PUBLIC landing page to collect waitlist demand for upcoming pet insurance partnership (Igloo + Fubon Q3-Q4/2026). Premium design matching homepage language, no sến emojis.

---

## What was built

### 1. Baserow migration — `insurance_waitlist` table (id=705)

`scripts/migrate-insurance-waitlist.ts` — idempotent migration with 12 fields:

| Field | Type | Notes |
|---|---|---|
| email | text | required, dedupe key |
| phone | text | optional (Zalo / SĐT) |
| pet_count | number(int) | 1-20 |
| pet_species | single_select | dog / cat / both |
| pet_age_range | single_select | puppy / adult / senior / mixed |
| interest_level | single_select | just_curious / comparing / ready_to_buy |
| pet_score_avg | number(int) | filled later from VowVet score |
| referred_from | text | UTM / referrer |
| notes | long_text | admin notes |
| contacted | boolean | admin status |
| contacted_at | text | ISO timestamp |
| created_at | text | ISO timestamp |

`shared/baserow-config.ts` updated with `"insurance_waitlist"` in `TableName` union.

### 2. API routes (`api/src/routes/insurance.ts`)

```
POST /api/v1/insurance/waitlist         — submit interest (PUBLIC, IP rate-limited 60/min)
GET  /api/v1/insurance/waitlist/count   — social proof counter (PUBLIC, 5min cache)
```

**Features:**
- Zod schema validation (`@hono/zod-validator`) — invalid email → 400
- Email dedupe — returns `{ duplicate: true }` on second submit with same email
- IP rate limit via existing `ipRateLimit("insurance", 60, 60)` helper
- Fail-soft count cache (5 min in-memory)
- Wired in `api/src/index.ts`: `app.route("/api/v1/insurance", insuranceRoute)`

### 3. Middleware updates

`web/src/middleware.ts`:
- Added `/insurance` to `PUBLIC_EXACT`
- Added `/api/v1/insurance/` to `PUBLIC_PREFIXES`

→ Anonymous + logged-in-not-onboarded can access `/insurance` without redirect.

### 4. Landing page `web/src/pages/insurance.astro` — 7 sections

| # | Section | Design |
|---|---|---|
| 1 | **Sticky nav** | Logo + "Đăng ký waitlist" ink CTA |
| 2 | **Dark ink hero** | Gold eyebrow "Sắp ra mắt · Q3-Q4 2026" · Fraunces italic h1 "đầu tiên tích hợp AI" (gold highlight) · 2 radial gold spotlights · paw-dot grid pattern overlay · gold CTA · social proof count with animated emerald ping dot |
| 3 | **Why (3 reasons)** | Cream cards · SVG icons (wallet · alert-triangle · scale) · No emojis |
| 4 | **Pet Score tier discount** | Cream section · Fraunces italic "Pet Score cao = Phí thấp" · 5-row table with **CORRECT brackets**: bronze (0-300) Standard / silver (301-500) 5% / gold (501-700) 15% / platinum (701-850) 20% / diamond (851-1000) 25% · SVG tier icons (medal/trophy/crown/diamond) with brand colors |
| 5 | **Partners (3 cards)** | Fubon · Igloo · Pet Health Centre · SVG icons (shield · shield-check · stethoscope) · 3-stat market context strip ($43.9M · +10% CAGR · 3 partners) · IMARC Group source attribution |
| 6 | **Waitlist form** | Dark ink section · Alpine.js form · glass-pill inputs with gold focus rings · 7 fields: email · phone · pet_count · pet_species · pet_age_range · interest_level · notes · success state with emerald banner · privacy disclaimer |
| 7 | **EcosystemNav + footer** | Active="vowvet" tile · Logo + copyright |

### 5. Homepage 7th feature card

Added to `web/src/pages/index.astro` after the 6 feature cards:
- Shield SVG icon · "Bảo hiểm thú cưng" title · "Sắp ra mắt" badge with pulsing gold dot
- Description: "Pet Score cao = phí thấp. Đàm phán với Fubon, Igloo. Đăng ký waitlist nhận thông báo sớm Q3-Q4/2026."
- CTA: "Đăng ký waitlist →" linking to `/insurance`

### 6. New SVG icons in FeatureIcon component

- `shield` — pet insurance protection theme
- `shield-check` — insurance with verified mark
- `wallet` — vet cost section
- `scale` — legal liability section

---

## E2E verification — 50/50 pass

```
=== 1. /insurance page PUBLIC ===  ✅ 200 anonymous · title · CTA · "Q3-Q4 2026"
=== 2. Hero matches homepage premium pattern ===  ✅ dark ink · 2 gold spotlights · Fraunces italic
=== 3. NO sến emojis ===  ✅ no 💸🚨🛡️🥉🥈🥇💎🔥
=== 4. SVG icons in place ===  ✅ wallet · alert-triangle · scale · shield
=== 5. Pet Score tier brackets CORRECT ===  ✅ 0-300/301-500/501-700/701-850/851-1000
=== 6. 3 partners ===  ✅ Fubon · Igloo · Pet Health Centre
=== 7. Market context numbers ===  ✅ $43.9M · +10% · IMARC
=== 8. Waitlist form fields ===  ✅ 7 fields all present
=== 9. POST /waitlist ===  ✅ create success · dedupe works · invalid email 400
=== 10. GET /waitlist/count ===  ✅ returns int ≥1
=== 11. Homepage 7th card ===  ✅ "Bảo hiểm thú cưng" + "Sắp ra mắt" badge + /insurance link
=== 12. Public access ===  ✅ anonymous can reach /insurance (no login redirect)

Summary: 50 passed, 0 failed
```

---

## Answers to the 7 spec questions

| # | Question | Answer |
|---|---|---|
| 1 | `/insurance` page render public? | **YES.** 200 anonymous. Added to middleware `PUBLIC_EXACT`. Tested anonymous + logged-in-not-onboarded — both reach the page. |
| 2 | Waitlist form submit hoạt động + lưu Baserow? | **YES.** POST creates a row in `insurance_waitlist` (id=705). Verified via Baserow REST API count incremented after submit. |
| 3 | Social proof count hiển thị? | **YES.** `/insurance/waitlist/count` returns int with 5-min cache. Hero renders "{count} chủ nuôi đã đăng ký waitlist" with animated emerald ping dot when count > 0. |
| 4 | Pet Score tier → discount mapping rõ ràng? | **YES.** 5-row table using correct VowVet brackets (bronze 0-300 / silver 301-500 / gold 501-700 / platinum 701-850 / diamond 851-1000) with SVG tier icons + discount percentages (Standard / 5% / 15% / 20% / 25%). Disclaimer footer about partner negotiations. |
| 5 | 3 partner logos visible? | **YES.** Fubon Insurance (Đài Loan) · Igloo Insure (Singapore · B2B API ready) · Pet Health Centre (Việt Nam · Vet network) — each with SVG shield/stethoscope icon + country + note. |
| 6 | Homepage feature card "Bảo hiểm" với badge "Sắp ra mắt"? | **YES.** 7th card added after the 6 feature articles. Badge "Sắp ra mắt" with animated pulsing gold dot. Links to `/insurance`. |
| 7 | Mobile responsive? | **YES.** All sections use `sm:` / `md:` / `lg:` breakpoints. Forms use grid-cols-2 only at sm+. Tested mobile-first design (375px viewport). Hero text scales 3xl→6xl across breakpoints. |

---

## Files

**New:**
- `scripts/migrate-insurance-waitlist.ts` — Baserow migration
- `api/src/routes/insurance.ts` — POST waitlist + GET count
- `web/src/pages/insurance.astro` — 7-section landing page
- `scripts/e2e-insurance.ts` — 50 E2E checks
- `INSURANCE_LANDING_REPORT.md` — this file

**Modified:**
- `baserow-config.json` — added insurance_waitlist table + 12 field IDs
- `shared/baserow-config.ts` — added `"insurance_waitlist"` to TableName union
- `api/src/index.ts` — imported + mounted insuranceRoute at `/api/v1/insurance`
- `web/src/middleware.ts` — `/insurance` in PUBLIC_EXACT, `/api/v1/insurance/` in PUBLIC_PREFIXES
- `web/src/components/FeatureIcon.astro` — added shield, shield-check, wallet, scale icons
- `web/src/pages/index.astro` — added 7th feature card with "Sắp ra mắt" badge

---

## Manual QA

1. Open `https://vowvet.monminpet.com/insurance` in **incognito** → expect public landing with dark hero
2. Hero CTA "Đăng ký nhận thông báo →" scrolls to form (smooth scroll via `scroll-mt-20`)
3. Fill form with valid email → submit → emerald success banner "Đã ghi nhận..."
4. Submit again with same email → emerald banner says "Bạn đã đăng ký waitlist rồi"
5. Refresh page → social proof count incremented
6. Homepage `/` → scroll to "Tính năng cốt lõi" grid → 7th card "Bảo hiểm thú cưng" with gold "Sắp ra mắt" pulsing badge
7. Submit waitlist with garbage email "abc" → form validation error (HTML5 + 400 from API)

---

## Future hooks (when launching Q3-Q4 2026)

- `pet_score_avg` field ready to be batch-filled when admin contacts waitlist users (compute from their VowVet pet score)
- `referred_from` field ready for UTM tracking when running campaigns
- `contacted` / `contacted_at` lifecycle for admin pipeline
- Dedupe by email already enforced — safe to scale to 10K+ signups
- Rate limit prevents bot spam
- Data structure designed for Igloo B2B API integration (can export CSV for batch quote requests)
