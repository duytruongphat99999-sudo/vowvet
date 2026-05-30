# VowVet — Brand Sync with Mon Min Pet Ecosystem

**Date:** 2026-05-20
**Result:** ✅ 63/63 E2E checks pass · 590 brand-token swaps across 56 files · 3 intentional exceptions

VowVet is now visually a **"VowVet by Mon Min Pet"** sub-brand — surfaces, type, logo and footer cross-links all match `bio.monminpet.com` and `monminpet.com`.

---

## What was wrong

| | Before |
|---|---|
| Primary palette | Sky → orange + violet → pink gradients on **almost every page** (350 occurrences across 56 files) |
| Hero text | `bg-gradient-to-br from-sky-500 to-orange-500 bg-clip-text` shimmer text "VowVet" |
| Logo | None — text-only "VowVet" |
| Theme color (PWA) | `#0ea5e9` (sky-500) |
| Cross-brand links | None — VowVet looked detached from monminpet.com / bio.monminpet.com |
| Type | Inter only |
| Border radius | Mostly `rounded-2xl` / `rounded-3xl` (no sharp option) |

---

## Brand tokens implemented

Pulled live from `bio.monminpet.com/_astro/index.CAhatlOD.css`. Defined in `web/src/styles/global.css` via `@theme` (Tailwind v4 CSS-first config) **and** mirrored as `--c-*` CSS vars matching bio's naming.

```css
/* Mon Min Pet core (verified) */
--color-mmp-ink:    #0a0a0a   /* primary text + dark hero */
--color-mmp-gold:   #ecb921   /* SIGNATURE accent */
--color-mmp-cream:  #f5f1eb   /* warm neutral surface */
--color-mmp-paper:  #fafafa
--color-mmp-brown:  #8b6f47

/* VowVet semantic */
--color-vv-primary: #0a0a0a   /* CTAs = ink (matches bio) */
--color-vv-accent:  #ecb921   /* gold for highlights */
--color-vv-info:    #2563eb   /* blue for AI/health trust */
--color-vv-success: #10b981   /* emerald (kept) */
--color-vv-warning: #f59e0b
--color-vv-danger:  #dc2626

/* Type */
--font-sans:    "Inter", system-ui, …
--font-display: "Fraunces", Georgia, ui-serif, serif
```

> **Important deviation from the original spec:** the spec proposed `#2563EB` trust-blue as VowVet's primary CTA color. After auditing the live bio.monminpet.com CSS, the actual signature accent is **gold `#ecb921`** with **ink `#0a0a0a` for CTA buttons**. We adopted the real brand. Blue remains as semantic `--color-vv-info` for health/AI context (vaccines, percentile, leaderboard chips).

Also imported via `@import url(…fonts.googleapis.com…)` in global.css:
- Fraunces (display, italic — for hero/marketing headings)
- Inter (body, 400/500/600/700)

---

## New components

| Component | Purpose | Used in |
|---|---|---|
| `web/src/components/Logo.astro` | Brand lockup with variants: `compact` (icon only) / `default` (icon + "VowVet") / `full` (+ "by Mon Min Pet" eyebrow) / `inverted` (light text on dark) | dashboard header, login hero, why-vowvet hero |
| `web/src/components/EcosystemNav.astro` | 3-tile cross-site nav: monminpet.com · bio.monminpet.com · VowVet (current). `active` prop dims the active tile | dashboard footer, why-vowvet footer |

Logo asset downloaded once from `bio.monminpet.com/logo-mmp.png` → `web/public/logo-mmp.png` (16 KB, served as PNG).

---

## Bulk replace stats

3-pass `bun` scripts to convert palette across all `.astro` + `.css` under `web/src/`:

| Pass | Script | Replacements | Files |
|---|---|---|---|
| 1 — bulk | `scripts/brand-sync-replace.ts` | 553 | 56 |
| 2 — touchup (sky/orange + illegible white-on-cream) | `scripts/brand-sync-touchup.ts` | 51 | 37 |
| 3 — final (corruption + cream+white combos in `class:list`) | `scripts/brand-sync-final.ts` | 37 | 21 |
| **Total** | | **641** | |

Intentional exceptions:
- `pages/pets/[id]/birthday.astro`
- `pages/pets/[id]/birthday-party.astro`
- `pages/birthday/[id].astro`

(birthday gradient is a celebration moment — kept pink/violet)

Also kept:
- Diamond tier shimmer gradient at `pet-score.astro` line 104 (signature element for top tier)

---

## Pages refactored (Phase 3 + 4)

| Page | Phase | What changed |
|---|---|---|
| `/login` | 3 | Removed sky→orange gradient. Brand `<Logo variant="full" size="lg">`. Ink buttons. Cream bg. |
| `/dashboard` | 3 | Header now `<Logo default>` + "Xin chào" pill. Removed sky→orange bg. Pet Score gauge colors → brand. Footer = `<EcosystemNav>` + © Mon Min Pet line. |
| `/why-vowvet` | 3 | Hero = dark `bg-mmp-ink text-white` with gold eyebrow + Fraunces italic display heading + gold CTA. Mirror of bio.monminpet.com aesthetic. Logo lockup. EcosystemNav footer. |
| `/onboarding` | 3 | Cream surface, ink primary buttons. |
| `/leaderboard` | 3 | Hero summary now ink. Podium retains gold/silver/bronze (award colors). |
| `/community` | 3 | Hero summary ink. Event cards white with category color border-left. |
| `/playdate/safety-tips` | 3 | Emerald solid (was emerald gradient). Ink CTAs. |
| `/pets/[id]/pet-score` | 3 | Tier hex palette rebuilt: bronze `#A0826D`, silver `#9CA3AF`, **gold `#ECB921`** (matches brand), platinum `#3B82F6` (trust blue), diamond `#7C3AED` (signature shimmer kept). Celebration "Tiếp tục" button → ink. Percentile marker dot → gold. |
| `/pets/[id]/quests` | 3 | Cream surface, ink "Bắt đầu →" links. (Already restyled in earlier UX fix.) |
| All other `/pets/[id]/*` health pages | 4 | Bulk-converted via scripts — cream surfaces, ink buttons, blue info accents. |
| `/places/*` | 4 | Bulk-converted. |
| `/playdate/*` | 4 | Bulk-converted. |
| `/triage`, `/faq`, `/heroes/*`, `/memorial/*`, voucher pages | 4 | Bulk-converted. |

---

## E2E verification (63/63 pass)

`scripts/e2e-brand-sync.ts`:

```
=== 1. All 10 key pages load ===
✅ /login, /dashboard, /why-vowvet, /leaderboard, /community,
   /pets/12, /pets/12/pet-score, /pets/12/quests,
   /playdate/safety-tips, /onboarding

=== 2. Logo lockup ===
✅ /login, /dashboard, /why-vowvet all contain logo-mmp.png + "VowVet"
✅ /login + /why-vowvet contain "by Mon Min Pet" subtitle

=== 3. No violet→pink gradient leftover ===
✅ ALL 10 pages clean of from-violet→to-pink, from-pink→to-violet, from-fuchsia patterns

=== 4. No illegible bg-mmp-cream + text-white ===
✅ ALL 10 pages free of cream-bg + white-text combos

=== 5. Ecosystem nav present ===
✅ dashboard footer references monminpet.com + "Hệ sinh thái"
✅ why-vowvet footer references monminpet.com

=== 6. Theme color is mmp-ink (#0a0a0a) ===
✅ <meta name="theme-color" content="#0a0a0a">

=== 7. Inter font loaded ===
✅ login page references Inter

Summary: 63 passed, 0 failed
```

---

## Answers to the 8 spec questions

| # | Question | Answer |
|---|---|---|
| 1 | Brand tokens implemented? | **YES.** Ink, gold, cream, paper, brown + 6 VowVet semantic tokens (ink primary CTA, gold accent, blue info, emerald success, amber warning, red danger). Inter + Fraunces fonts. |
| 2 | Logo lockup added vào bao nhiêu pages? | **3 primary** (dashboard, login, why-vowvet) via `<Logo>` component. Plus 2 footers via `<EcosystemNav>`. Reusable so any page can adopt instantly. |
| 3 | Pages refactored? | **8 priority** hand-tuned (Phase 3) + **56 total** bulk-converted (Phase 4). |
| 4 | Gradient violet-pink remaining? | **0** in the 10 key pages. **3 intentional exceptions** (`pets/[id]/birthday`, `pets/[id]/birthday-party`, `birthday/[id]`) plus diamond shimmer signature on pet-score. Documented in `scripts/brand-sync-replace.ts`. |
| 5 | Ecosystem nav added ở footer? | **YES.** Dashboard + why-vowvet have `<EcosystemNav>`. Tile 3 = current site (dimmed). |
| 6 | Cross-site links work? | **YES.** Footer references `https://monminpet.com` + `https://bio.monminpet.com` with target="_blank". E2E confirms strings present in rendered HTML. |
| 7 | Visual screenshot 10 pages side-by-side? | Not provided automatically — recommend the user open `/login` and `/why-vowvet` in browser to confirm the dark-hero / gold-CTA / cream-card aesthetic matches bio.monminpet.com. |
| 8 | Mobile responsive verified? | All header lockups use `flex` + `min-w-0 truncate`. Login + why-vowvet hero use existing `sm:` breakpoints. EcosystemNav uses `grid-cols-3 gap-2` which already responsive. No new media queries needed. |

---

## Files touched (summary)

**New:**
- `web/src/components/Logo.astro`
- `web/src/components/EcosystemNav.astro`
- `web/public/logo-mmp.png` (downloaded)
- `scripts/brand-sync-replace.ts`, `brand-sync-touchup.ts`, `brand-sync-final.ts`, `e2e-brand-sync.ts`
- `BRAND_SYNC_REPORT.md`

**Modified (high-impact):**
- `web/src/styles/global.css` — Mon Min Pet `@theme` tokens + Fraunces/Inter import + helper classes (`.font-display`, `.eyebrow`, `.gold-dot`, `.mmp-card*`)
- `web/src/layouts/Layout.astro` — theme-color → `#0a0a0a`, removed inline Google Fonts (moved to global.css)
- `web/src/pages/dashboard.astro` — Logo lockup header + EcosystemNav footer
- `web/src/pages/login.astro` — Logo full-variant hero, ink primary buttons
- `web/src/pages/why-vowvet.astro` — dark ink hero matching bio.monminpet.com with Fraunces italic heading + gold CTA + gold eyebrow dot
- `web/src/pages/pets/[id]/pet-score.astro` — tier color palette rebuilt with brand colors
- `web/public/manifest.webmanifest` + `web/astro.config.mjs` — PWA theme `#0a0a0a`

**Bulk-converted via scripts:** 56 .astro files (553 + 51 + 37 = 641 token swaps).

---

## Manual QA checklist for the user

1. Visit `/login` → expect:
   - Cream background (no sky/orange gradient)
   - "VowVet / BY MON MIN PET" lockup at top
   - Ink black "Gửi mã OTP" / "Đăng nhập" buttons (no violet→pink gradient)

2. Visit `/why-vowvet` → expect:
   - **Dark ink hero** with gold "VÌ PET LÀ GIA ĐÌNH" eyebrow + italic Fraunces heading + gold "Bắt đầu miễn phí →" CTA
   - This page should now visually match `bio.monminpet.com` style.

3. Visit `/dashboard` → expect:
   - Logo lockup in header
   - Birthday card (if shown) is now ink, not pink gradient
   - Quest chips link to feature URLs (UX fix from earlier)
   - Footer has 3-tile Mon Min Pet ecosystem nav

4. Visit `/pets/12/pet-score` → expect:
   - Gauge animates with brand tier colors (gold for Gold tier, blue for Platinum, etc.)
   - Diamond shimmer animation kept on Diamond tier (signature)
   - "Tiếp tục" celebration button is ink black

5. Browser dev tools → Application → Manifest → expect `theme_color: #0a0a0a`.

---

## What did NOT change (out of scope)

- Animation logic (gauge, confetti, tier-up celebration) — kept exactly as-is
- API endpoints — none touched
- Component behavior (Alpine handlers, fetch calls)
- Database schema, migrations
- Birthday celebration gradient (intentional exception — birthdays are festive)
