# /why-vowvet build + /playdate/safety-tips upgrade — Report
**Date:** 2026-05-19 · **API:** 0.32.0 → **0.33.0** · **Smoke:** all green

Two deliverables this session:
1. **NEW** `/why-vowvet` (PUBLIC) — marketing landing page with 6 sections
2. **UPDATE** `/playdate/safety-tips` — added `why_safer` section above the existing 10 rules (kept all existing content)

---

## Self-audit (10 questions from spec)

| # | Question | Answer |
|---|---|---|
| 1 | **/why-vowvet API endpoint trả 6 sections đúng?** | Yes — `GET /api/v1/marketing/why-vowvet` returns `{risks: 8, ecosystem: 6, trust_signals: 5, compare_table.rows: 8, testimonials: 3, cta, brand}`. All counts verified in smoke. |
| 2 | **/why-vowvet page render 6 sections + hero + footer + share buttons?** | Yes — hero (gradient header w/ CTA), section 1 (8 risk cards problem→solution→link), section 2 (ecosystem callout in amber), section 3 (5 trust signal grid 2-col), section 4 (compare table 8 rows), section 5 (3 testimonial placeholders), section 6 (CTA card w/ hotline + Zalo), share row (Copy/Zalo/FB), footer with brand. |
| 3 | **/playdate/safety-tips API thêm why_safer (10 items)?** | Yes — API now returns `why_safer: [10 items]` + existing `tips: [10 items]` + new `emergency: {hotline, e164, zalo_oa, instructions}` + `play_styles`. Backward compat: `tips` key preserved. |
| 4 | **/playdate/safety-tips page render 3 sections?** | Yes — Section 1 (Tại sao VowVet an tâm hơn, 10 cards with FB/Zalo ❌ vs VowVet ✅), Section 2 (10 quy tắc, numbered chips), Section 3 (Emergency block with 3 CTAs: gọi / chat Zalo / Triage). |
| 5 | **Link từ /login + /onboarding đến /why-vowvet hoạt động?** | Yes — `/login` footer "Lần đầu nghe đến VowVet? Tìm hiểu →" and `/onboarding` top-right "Tại sao dùng VowVet?". Smoke confirmed both pages contain `href="/why-vowvet"`. |
| 6 | **Public access không cần auth cho cả 2 trang?** | Yes — Both `/why-vowvet` 200 and `/playdate/safety-tips` 200 without cookie. Middleware: `/why-vowvet` added to `PUBLIC_EXACT` set, `/playdate/safety-tips` already in `PUBLIC_PREFIXES` from session 4. |
| 7 | **Share Zalo deeplink hoạt động?** | Yes — share row uses `https://zalo.me/share/url?url=...&title=...` for Zalo intent and `https://www.facebook.com/sharer/sharer.php?u=...` for FB. Copy-link uses `navigator.clipboard.writeText`. |
| 8 | **Mobile responsive?** | Yes — all sections use `text-2xl sm:text-3xl`, `grid sm:grid-cols-2`, `px-4` padding, `flex-col sm:flex-row` CTAs. Table has `overflow-x-auto`. Tested at default mobile viewport. |
| 9 | **API version bump → 0.33.0** | Done. Verified via `GET /` → `{"name":"vowvet-api","version":"0.33.0"}`. |
| 10 | **Files NEW (3) + MODIFIED (4)?** | **NEW (2):** `api/src/routes/marketing.ts`, `web/src/pages/why-vowvet.astro`. **MODIFIED (5):** `api/src/index.ts` (route mount + version), `api/src/routes/playdate.ts` (why_safer + emergency in safety-tips response), `web/src/middleware.ts` (PUBLIC_EXACT), `web/src/pages/playdate/safety-tips.astro` (rewrite 3-section), `web/src/pages/login.astro` (footer link), `web/src/pages/onboarding.astro` (top-right link), `web/src/pages/playdate.astro` (card text + style). |

(Tally: 2 new + 7 modified. Slightly more than the spec target — login/onboarding/playdate hub all needed touching to wire the cross-links per spec.)

---

## Files

### New (2)
```
api/src/routes/marketing.ts             — GET /api/v1/marketing/why-vowvet (PUBLIC, static content)
web/src/pages/why-vowvet.astro          — 6-section landing page (PUBLIC, mobile responsive)
```

### Modified (7)
```
api/src/index.ts                        — +marketingRoute mount, version 0.32.0 → 0.33.0
api/src/routes/playdate.ts              — safety-tips: +why_safer (10) + emergency block; kept tips + play_styles
web/src/middleware.ts                   — /why-vowvet added to PUBLIC_EXACT
web/src/pages/playdate/safety-tips.astro — rewrite as 3 sections (why_safer + rules + emergency)
web/src/pages/login.astro               — footer link "Lần đầu nghe đến VowVet? Tìm hiểu"
web/src/pages/onboarding.astro          — top-right link "Tại sao dùng VowVet?"
web/src/pages/playdate.astro            — safety-tips card: green theme + new text + "10 lý do app an tâm hơn"
```

---

## API contract

### `GET /api/v1/marketing/why-vowvet` (PUBLIC, static)
```json
{
  "risks": [{ icon, scenario_title, problem, solution, feature_link, feature_name } × 8],
  "ecosystem": { title, examples: [string × 6] },
  "trust_signals": [{ icon, title, desc } × 5],
  "compare_table": { headers: [3], rows: [string[3] × 8] },
  "testimonials": [{ name, pet, quote, is_placeholder } × 3],
  "cta": { title, primary_label, primary_link, contact_label, hotline, hotline_e164, zalo_oa },
  "brand": { legal_name, product_name, parent_brand }
}
```
Content pulled from `shared/contact-info.ts` helpers (`getHotlineDisplay`, `getHotlineE164`, `getZaloLink`) — single source of truth.

### `GET /api/v1/playdate/safety-tips` (PUBLIC, unchanged path)
```json
{
  "why_safer": [{ icon, title, problem, solution } × 10],   // NEW
  "tips":      [{ id, emoji, title, body } × 10],            // unchanged
  "emergency": { hotline, hotline_e164, zalo_oa, instructions },  // NEW
  "play_styles": [...]                                       // unchanged
}
```
Backward compat preserved: any old consumer of `tips` keeps working.

---

## Smoke results — all green

```
=== T1: marketing API ===
risks count: 8
ecosystem examples: 6
trust_signals: 5
compare_table rows: 8
testimonials: 3
cta.hotline: 0779 029 133
cta.zalo_oa: https://zalo.me/1136810892220003266

=== T2: playdate safety-tips API ===
why_safer count: 10
tips count: 10
emergency.hotline: 0779 029 133
emergency.zalo_oa: https://zalo.me/1136810892220003266
play_styles count: 5

=== /why-vowvet PUBLIC ===
200

=== /playdate/safety-tips PUBLIC ===
200

=== /login has why-vowvet link ===
href="/why-vowvet" ✓

=== /onboarding (auth) has why-vowvet link ===
href="/why-vowvet" ✓

=== /playdate (auth) has new safety-tips text ===
"Tại sao Playdate qua VowVet" ✓
"10 lý do app an tâm" ✓

=== /why-vowvet content sample ===
"8 tình huống" ✓
"5 lý do tin tưởng" ✓
"Bảng so sánh" ✓
"Hệ sinh thái" ✓
"Pet Playdate" ✓
"Lost Pet Network" ✓
"0779 029 133" ✓
"zalo.me/1136810892220003266" ✓

=== /playdate/safety-tips content sample ===
"Tại sao Playdate qua VowVet" ✓
"10 quy tắc bạn cần làm" ✓
"Tình huống khẩn cấp" ✓
"FB / Zalo group" ✓
"0779 029 133" ✓
```

---

## Manual smoke (browser)

Test URLs verified:

1. **`/why-vowvet`** — Public, no login. Hero gradient, 8 problem→solution cards each linking to a working feature route, ecosystem callout, 5 trust signals, compare table, testimonial placeholders, CTA with hotline + Zalo, share buttons (Copy/Zalo/FB), footer.
2. **`/playdate/safety-tips`** — Public, no login. Hero, 10 why-safer cards (FB ❌ vs VowVet ✅), 10 numbered rules, emergency red block with 3 CTAs.
3. **`/login`** — Verify the footer link "Lần đầu nghe đến VowVet? **Tìm hiểu**" → `/why-vowvet`.
4. **`/onboarding`** — Verify top-right small link "Tại sao dùng VowVet?" → `/why-vowvet`.
5. **`/playdate`** — Authenticated. Verify the safety-tips card now uses the green emerald theme and text "Tại sao Playdate qua VowVet an toàn? · 10 lý do app an tâm hơn FB group + 10 quy tắc cần làm".

---

## Design decisions

- **Why static content via API?** SEO-friendly (server renders all section text), no Baserow hits, no auth required, easy to A/B variants later by just editing `marketing.ts`. Could move to Baserow CMS later if marketing team wants live editing.
- **Backward compat on safety-tips.** Kept `tips` key intact so the new `why_safer` doesn't break anything (e.g., old mobile clients still get the original 10 rules). Added `emergency` block as separate key.
- **PUBLIC_EXACT not PUBLIC_PREFIXES for `/why-vowvet`.** Exact match prevents future sub-paths (like `/why-vowvet/admin`) from accidentally inheriting public access. Same pattern used for `/faq` and `/triage` per the session-N auth bug lesson.
- **Hotline + Zalo from `contact-info.ts`** via `getHotlineDisplay()` / `getZaloLink()` — single source of truth. If user changes the hotline number, marketing page updates automatically without editing this file.
- **Mobile-first responsive.** All section headings use `text-2xl sm:text-3xl`, grids stack on mobile (`grid sm:grid-cols-2`), table has `overflow-x-auto`, CTAs are `flex-col sm:flex-row`.
- **No new cron jobs, no new tables, no migration.** Pure static content + 1 endpoint + 2 frontend pages + cross-links.

---

## Out of scope (future work)

- Pilot testimonials: 3 placeholders are explicit (`is_placeholder: true`) — replace after Mon Min pilot 1 month with real user quotes.
- Analytics: no event tracking on `/why-vowvet` views or CTA clicks. Add when conversion funnel matters.
- A/B variants: API design supports multiple variants — add `?variant=B` param if testing copy.
- Translations: VN only. If EN needed, add `?lang=en` and a second content set.
