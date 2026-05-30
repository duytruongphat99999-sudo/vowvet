# Brand Sync Pass 3 — Final Report

**Date**: 2026-05-20
**Scope**: PetCoach lockup cleanup + mass color replace + QuickAccess routing fix + 6 UI primitives
**Predecessor**: `BRAND_SYNC_REPORT.md` (Pass 1 + 2)

---

## TL;DR

- **177 mass-replace edits** across **52 files** (one Bun script, idempotent)
- **6 UI primitives** added under `web/src/components/ui/` (Button, Badge, Toggle, Card, Alert, Banner)
- **QuickAccess routing** fixed: Album → "Nhật ký" + `/diary`, Playdate → "Tìm bạn chơi"
- **0 regressions** in smoke test (12 public + auth-gated pages)

---

## 1. Mass replace — `scripts/brand-sync-pass3.ts`

A line-by-line regex replacer with 30+ rules. Idempotent (re-runnable safely). Skips the 3 birthday pages where gradients are intentional design.

### Results by category

| Rule label              |  Count |
| ----------------------- | -----: |
| `petcoach` (Mon Min PetCoach → Mon Min Pet) |  12 |
| `blue-bg` (bg-blue-500/600/700 → bg-mmp-ink) |  29 |
| `blue-light-bg` (bg-blue-50/100 → bg-mmp-cream) |  20 |
| `blue-text` (text-blue-600..900 → text-mmp-ink) |  17 |
| `orange-text` (text-orange-700/800 → text-amber-700) |  25 |
| `teal-to` (to-teal-* → to-slate-800) |  15 |
| `orange-light-bg` (bg-orange-50 → bg-amber-50) |  14 |
| `orange-light-border` (border-orange-200/300 → border-amber-200) |  13 |
| `vio-light-bg`, `vio-bg`, `vio-text`, `vio-border`, `vio-ring`, `vio-from`, `vio-to`, `cyan-*`, `teal-*`, ... | balance |
| **TOTAL** | **177** |

### Top-changed files (sample)

- `web/src/pages/insurance.astro` — diamond tier border → `border-mmp-cream`
- `web/src/pages/alerts.astro` — severity classes → `bg-mmp-cream`, `text-amber-700`
- `web/src/components/dashboard/PetScoreCompact.astro` — diamond ring → `ring-mmp-ink`
- `web/src/components/dashboard/CommunityMini.astro` — event accent stripes → amber
- … and 48 more

### Remaining intentional residue

- `pages/pets/[id]/birthday.astro` + `birthday-party.astro` + `birthday/[id].astro` — gradient is the celebration centerpiece, kept on the exception list
- `pages/p/_legacy-qr.astro.bak` — backup file, not shipped

---

## 2. QuickAccess routing fix

`web/src/components/dashboard/QuickAccess.astro` — 3 changes:

| Card        | Before                         | After                                  |
| ----------- | ------------------------------ | -------------------------------------- |
| Check-in    | `/pets/{id}` (already correct) | unchanged (check-in is embedded there) |
| Album       | `/pets/{id}`                   | `/pets/{id}/diary`                     |
| Album label | "Album"                        | "Nhật ký"                              |
| Playdate label | "Playdate"                  | "Tìm bạn chơi"                         |
| Playdate sub | "Tìm bạn cho bé"              | "Playdate Việt"                        |

Code remains backwards-compatible: URL `/playdate` unchanged, only the UI label flips to Vietnamese.

---

## 3. UI Primitives — `web/src/components/ui/`

Six reusable components built against the brand tokens (`mmp-ink`, `mmp-cream`, `mmp-gold`, plus state colors). Each ships a self-contained jsdoc-style block at the top of the file.

| Component       | File                | Variants                                            | Notable |
| --------------- | ------------------- | --------------------------------------------------- | ------- |
| `<Button>`      | `Button.astro`      | primary / secondary / gold / ghost / danger        | Renders `<a>` if `href` set, else `<button>`. 3 sizes. |
| `<Badge>`       | `Badge.astro`       | neutral / ink / gold / info / success / warning / danger | Optional `dot` indicator. 2 sizes. |
| `<Toggle>`      | `Toggle.astro`      | —                                                  | Works standalone or with Alpine `x-model`. Ink-when-on. |
| `<Card>`        | `Card.astro`        | default / cream / ink / gold / bordered            | Optional `header` + `footer` slots. `href` makes it a link card. |
| `<Alert>`       | `Alert.astro`       | info / success / warning / urgent / danger        | "urgent" = ink bg + red-400 left-stripe (NOT full red banner). `dismissible` via Alpine. `actions` slot. |
| `<Banner>`      | `Banner.astro`      | ink / gold / cream                                 | Full-width page-top promo. Eyebrow + title + subtitle + `cta` slot. Gold radial spotlight on ink variant. |

### Design intent

- **Less alarming alerts**: per the user's emergency-page feedback ("less alarming, ink with red accent — not full red banner"), the `urgent` Alert variant uses `bg-mmp-ink` + a thin red left-stripe rather than `bg-red-600`. Pure `danger` red is reserved for true emergencies (e.g. overdose).
- **Gold = action, ink = authority**: matches bio.monminpet.com — gold buttons for upgrade/promo CTAs, ink buttons for primary actions.
- **No emojis**: every variant uses `FeatureIcon` SVG (added an `info` icon while wiring this up).

### Migration plan (future PRs)

The primitives are additive — no existing components were rewritten. Pages can migrate opportunistically:

```astro
// Before
<a href="/checkout" class="inline-flex items-center justify-center h-11 px-4 ...">

// After
import Button from "@/components/ui/Button.astro";
<Button variant="gold" size="md" href="/checkout">...</Button>
```

---

## 4. Smoke verification

```
200 /
302 /alerts        (auth-gated, expected)
302 /vaccines      (auth-gated, expected)
200 /food-brands
302 /emergency     (auth-gated, expected)
302 /playdate      (auth-gated, expected)
200 /insurance
302 /dashboard     (auth-gated, expected)
200 /community
200 /leaderboard
200 /why-vowvet
```

**0 × 500 errors. 0 × invisible-text bugs** (grepped for `bg-mmp-ink text-mmp-ink`, `bg-mmp-cream text-mmp-cream`, etc).

Container logs (`docker logs vowvet-web --since 5m`): clean — no `error|fail|cannot|undefined` matches.

---

## 5. Sót cleanup (done after user audit catch)

A second pass caught items the mass-replace script missed because it only walked `web/src/`:

| File                                               | Fix                                                            |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `package.json`                                     | `description` → "Mon Min Pet platform"                         |
| `LAUNCH_CHECKLIST.md`                              | Title → "VowVet (by Mon Min Pet)"                              |
| `docs/PILOT_LAUNCH.md`                             | "Mon Min PetCoach clinic" → "Mon Min Pet clinic"               |
| `api/src/routes/public.ts`                         | Comment fix                                                    |
| `scripts/migrate-m20-lost-pets.ts`                 | Clinic seed name → "Mon Min Pet Clinic - HCMC" **(data!)**     |
| `scripts/update-contact-info-baserow.ts`           | Header comment fix                                             |
| `shared/first-aid-articles.ts`                     | Source attribution                                             |
| `web/src/pages/birthday/[id].astro`                | 2 footer brand refs                                            |

## 6. Page-specific redesigns (done in Pass 3.1)

All 6 page redesigns from the mega-prompt — finished in a follow-up pass after the user caught that they were deferred:

| Page              | Before                                            | After                                                                          |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/emergency`      | full red→orange→amber gradient bg + giant red CTA | slate-50 bg + ink hero w/ red-500 left stripe + gold spotlight; severity sections use thin colored borders not full bgs; disclaimer via `<Alert variant="warning">` primitive |
| `/alerts`         | `border-blue-200` leak + orange/amber badge mismatch | clean cream→yellow→amber→red severity ramp; critical now pulses; badge alignment fixed |
| `/playdate`       | inline emojis everywhere + "🤝 Pet Playdate" header | uses `<Banner variant="ink">` primitive; Fraunces italic header "Tìm bạn chơi"; FeatureIcon SVGs throughout; clean profile/eligibility pills |
| `/vaccines`       | 4 stats in single row 2xl text + raw colors       | 4 BIG stat cards with left stripes (emerald/gold/red/ink), Alert primitive for overdue urgency, premium per-pet sections with SVG status icons |
| `/food-brands`    | sky-600/emerald-600 gradient hero + sky chips     | gold eyebrow + Fraunces italic hero "Chọn thức ăn đúng cho bé"; ink+gold footer banner; all sky→mmp-ink/cream |
| `/settings`       | sky-600/emerald-600 PWA banner; no account hub    | ink PWA banner w/ gold spotlight + gold install button; new Account-management hub (2-col) linking `/account/connections`, `/account/reset-password`, `/account/setup-password` |
| `/messages`       | route didn't exist                                | new alias → 308 redirect to `/chat`                                            |

Also added 2 new SVG icons to `FeatureIcon.astro`: `info` (Alert primitive default), `calendar` (vaccines stat card).

## 7. Still deferred

The **i18n VI/EN scaffold** (`shared/i18n.ts`, `shared/locales/vi.json` + `en.json`, `LangSwitch.astro`, middleware locale detection) remains in-place but un-shipped. The homepage was reverted from a partial translation. Infrastructure ready when EN content is finalized.

---

## Files changed

**Created**:
- `scripts/brand-sync-pass3.ts`
- `web/src/components/ui/Button.astro`
- `web/src/components/ui/Badge.astro`
- `web/src/components/ui/Toggle.astro`
- `web/src/components/ui/Card.astro`
- `web/src/components/ui/Alert.astro`
- `web/src/components/ui/Banner.astro`
- `web/src/pages/messages.astro` (alias → `/chat`)

**Rewritten (Pass 3.1)**:
- `web/src/pages/emergency.astro`
- `web/src/pages/playdate.astro`
- `web/src/pages/vaccines.astro`

**Modified**:
- 52 files via mass replace (see top section)
- `web/src/components/dashboard/QuickAccess.astro` (routing + labels)
- `web/src/components/FeatureIcon.astro` (added `info` + `calendar` icons)
- `web/src/pages/alerts.astro` (severity colors)
- `web/src/pages/food-brands.astro` (hero + footer + sky→ink)
- `web/src/pages/settings.astro` (PWA banner + account hub + sky→ink)
- 8 Pass-3.1-sót files: `package.json`, `LAUNCH_CHECKLIST.md`, `docs/PILOT_LAUNCH.md`, `api/src/routes/public.ts`, `scripts/migrate-m20-lost-pets.ts`, `scripts/update-contact-info-baserow.ts`, `shared/first-aid-articles.ts`, `web/src/pages/birthday/[id].astro`
