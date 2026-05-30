# VowVet — Homepage Premium Refactor + Brand Consistency

**Date:** 2026-05-20
**Result:** ✅ 46/46 E2E checks pass

User feedback (9 issues, all fixed):
1. Logo lockup too small ✓
2. Stats labels không premium ("Cảnh báo gửi" mơ hồ) ✓
3. "Tất cả trong 1 app" sến → "ALL-IN-ONE" ✓
4. Emoji 🐶🐱💉🌡️🍽️📸 → inline SVG icons ✓
5. Feature cards redesign with icon container + arrow link ✓
6. "Đối tác lâm sàng" rewrite professional ✓
7. Ecosystem 3 platforms với "Bạn đang ở đây" ✓
8. "Trạng thái" footer link → moved to less prominent placement ✓
9. Logo bigger across all pages ✓

**Plus user's extra request:** "miễn xuất hiện logo ở đâu hay có vowvet đều đồng bộ vầy — kể cả logo hiển thị trên browser hoặc google tìm kiếm" → favicon + OG image + manifest all aligned ✓

---

## Brand assets unified (browser tab + Google + iOS home screen)

| Asset | Before | After |
|---|---|---|
| `favicon.svg` | Sky→orange gradient + white "V" | Ink black `#0a0a0a` + gold italic "V" + gold accent dot |
| `apple-touch-icon` | (none) | `/logo-mmp.png` (Mon Min Pet circle logo) |
| `og-image` | `og-image.png` (didn't exist) | `og-image.svg` — ink hero + gold accent + Fraunces italic "VowVet" + "BY MON MIN PET" footer |
| Manifest `name` | "VowVet — Mon Min PetCoach" | "VowVet by Mon Min Pet" |
| Manifest `theme_color` | `#0ea5e9` (sky) | `#0a0a0a` (ink) |
| Manifest icons | favicon.svg only | logo-mmp.png + favicon.svg |
| HTML `<meta theme-color>` | `#0a0a0a` (set previously) | unchanged ✓ |
| HTML `og:site_name` (default in Layout) | (missing) | "VowVet by Mon Min Pet" |
| HTML `og:image` (default) | (none) | `/og-image.svg` |

**Effect:**
- **Browser tab favicon** → ink+gold "V" matches brand
- **iOS home screen icon** → Mon Min Pet circle logo
- **PWA install icon** → Mon Min Pet logo + ink theme
- **Google search result** → "VowVet by Mon Min Pet" site name + branded OG image preview
- **Facebook/Zalo share** → branded OG card with founder + WSAVA standards visible

---

## Logo component upgrade

Single source of truth (`web/src/components/Logo.astro`) now supports 5 variants with explicit size scale:

| variant | logo px | title | subtitle | use case |
|---|---|---|---|---|
| `compact` | h-10 (40px) | text-base | — | Mobile-tight headers |
| `default` | **h-12 (48px)** ⬆ | **text-xl** ⬆ | **text-[10px]** ⬆ | Most page headers (was h-8/text-base/text-[10px]) |
| `full` | **h-14 (56px)** ⬆ | **text-2xl** ⬆ | **text-xs** ⬆ | Login, footer brand col, marketing |
| `hero` *(NEW)* | h-20 (80px) | text-3xl | text-sm | Landing hero |
| `inverted` | h-12 | text-xl | text-[10px] | On dark bg (white text + gold subtitle) |

`alt="Mon Min Pet"` set (was empty). `width/height=80` for browser hint. `class="inline-flex items-center gap-3"` (was gap-2) for better lockup spacing.

---

## Homepage structure — 9 sections (premium)

1. **Sticky top nav** — Logo `default` (h-12) + 3 nav links + "Dashboard"/"Đăng nhập" CTA. Background `bg-white/95 backdrop-blur` for smooth scroll.
2. **Hero** — Ink dark with radial gold glow. Gold eyebrow "● Vì pet là gia đình" + Fraunces italic h1 "Người bạn đồng hành sức khoẻ cho **thú cưng**" (gold). Two CTAs: gold primary + ghost.
3. **Stats strip** — 4 numbers on cream surface. NEW labels:
   - `{total_pets}+` "Pet được chăm sóc"
   - `{total_vaccines}+` "Mũi vaccine theo dõi"
   - `24/7` "Giám sát khí hậu HCM" *(replaces meaningless `total_alerts` count)*
   - `WSAVA` "Chuẩn vet quốc tế" *(replaces "Phòng khám tin dùng" hardcoded `1`)*
4. **ALL-IN-ONE intro** — Tagline section with eyebrow + Fraunces display + supporting copy.
5. **Feature grid (6 cards)** — Each card: 12x12 rounded icon container with inline SVG (passport, ai, climate, syringe, nutrition, camera) → bold title → description → gold "Tìm hiểu thêm →" link. Hover: gold-tinted icon bg + border darken + shadow lift + arrow translate.
6. **Đối tác lâm sàng** — Dark ink section with radial gold glow. 2-column layout:
   - Left: Gold eyebrow → Fraunces italic h2 → professional copy (no more "BS Thú y trực tiếp curate" — replaced with "Mon Min Pet định hình phân khúc thú y chuyên sâu") → WSAVA + AAFCO bullets → blockquote with gold left-border + founder credit → 2 CTAs (gold + ghost outline).
   - Right: Square logo card + floating Founder card (bottom-left) + Standards badge "WSAVA + AAFCO" (top-right, gold).
7. **Ecosystem (3 platforms)** — Cream section. Cards for Mon Min Pet (shop icon), Tư vấn BS (stethoscope), VowVet ALL-IN-ONE (highlighted ink dark with "Bạn đang ở đây" gold pill at top, app icon, "Bắt đầu miễn phí" gold CTA).
8. **Final CTA** — Centered "Chăm pet giỏi hơn chủ. Vì pet là gia đình." (Mon Min Pet brand slogan). Single ink CTA.
9. **Footer** — Ink dark, 4 columns:
   - Brand col: `Logo full invertOnDark` + tagline
   - VowVet: 4 product links
   - Hệ sinh thái: monminpet.com, bio.monminpet.com, Zalo OA (each with external-arrow icon)
   - Công ty: CTY TNHH Duy Trường Phát + HCM + 0779 029 133 emergency
   - Bottom bar: copyright + "WSAVA · AAFCO" gold badge

---

## Inline SVG icon system (no npm dep)

`web/src/components/FeatureIcon.astro` — 11 icons, 1.5px stroke, `currentColor`:
- **Feature row**: passport, ai, climate, syringe, nutrition, camera
- **Ecosystem**: shop, stethoscope, app
- **Affordance**: arrow (→), external (↗)

Single component handles all icons, taking `name` + `class` + optional `strokeWidth`. Used 19 times on the homepage alone, replacing all sến emoji.

---

## E2E verification — 46/46 pass

```
=== 1. Sến emoji removed ===
✅ No 🐕, 🐶🐱, 🤖, 🌡️, 🍽️, 📸 on homepage (all replaced with SVG)

=== 2. Premium copy ===
✅ "ALL-IN-ONE" present
✅ "Kiến tạo tiêu chuẩn" rewrite present
✅ "Đối tác lâm sàng" eyebrow
✅ "Bạn đang ở đây" badge on VowVet ecosystem card
✅ "3 platform · 1 sứ mệnh" tagline
✅ Sến copy REMOVED: "Tất cả trong 1 app", "Cảnh báo gửi", "Phòng khám tin dùng"
✅ WSAVA + AAFCO + founder name present

=== 3. SVG feature icons inline ===
✅ rect/path of passport icon present
✅ arrow icon present in CTAs

=== 4. Logo sizes upgraded ===
✅ Logo h-12 (default header)
✅ Logo h-14 (full footer brand)
✅ Subtitle "by Mon Min Pet" uses text-xs uppercase tracking

=== 5. Stats labels meaningful ===
✅ "Pet được chăm sóc", "Mũi vaccine theo dõi", "Giám sát khí hậu HCM", "Chuẩn vet quốc tế"

=== 6. Brand assets — favicon + OG + manifest ===
✅ favicon.svg uses ink+gold (NOT old sky→orange)
✅ /og-image.svg exists + has "VowVet" + "BY MON MIN PET" + ink+gold colors
✅ manifest.theme_color = #0a0a0a
✅ manifest.name = "VowVet by Mon Min Pet"
✅ manifest icons include logo-mmp.png
✅ HTML head: theme-color, og:image, apple-touch-icon, og:site_name all set

=== 7. Founder + Standards visual cards ===
✅ "BS Thú y · 5+ năm" floating Founder card
✅ "WSAVA + AAFCO" floating Standards badge

=== 8. Footer structure ===
✅ CTY TNHH Duy Trường Phát
✅ Cấp cứu 24/7: 0779 029 133
✅ WSAVA · AAFCO badge

Summary: 46 passed, 0 failed
```

---

## Answers to user's 9 spec items

| # | Issue | Status |
|---|---|---|
| 1 | Header Logo too small | **FIXED.** Logo default h-12 (was h-8), full h-14, hero h-20. Subtitle now text-xs (was text-[10px]). |
| 2 | Stats labels không premium | **FIXED.** 4 new labels: "Pet được chăm sóc", "Mũi vaccine theo dõi", "24/7 Giám sát khí hậu HCM", "WSAVA Chuẩn vet quốc tế". Removed meaningless "Cảnh báo gửi" count. |
| 3 | "Tất cả trong 1 app" sến | **FIXED.** Section now: gold eyebrow "Đồng hành trọn vòng đời pet" + Fraunces italic "ALL-IN-ONE" h2 + supporting copy. |
| 4 | Emoji icons everywhere | **FIXED.** All emoji replaced with inline SVG via `FeatureIcon.astro` component (passport, ai, climate, syringe, nutrition, camera, shop, stethoscope, app, arrow, external). No npm dependency. |
| 5 | Feature cards redesign | **FIXED.** 6 cards in grid-cols-1/2/3, each with 12x12 icon container (bg-mmp-ink/5, hover bg-mmp-gold/15), bold title, description, gold "Tìm hiểu thêm →" link with arrow that translates on hover. |
| 6 | "Đối tác lâm sàng" rewrite | **FIXED.** New copy: "Không dừng ở mô hình điều trị thông thường, Mon Min Pet định hình phân khúc thú y chuyên sâu tại Việt Nam thông qua việc áp dụng nghiêm ngặt hai bộ chỉ số WSAVA + AAFCO." + blockquote from BS Duy Trường Phát + floating Founder card + Standards badge. |
| 7 | Ecosystem 3 platforms | **FIXED.** Dedicated section with 3 cards. VowVet card highlighted (ink dark + "Bạn đang ở đây" gold pill). Other 2 cards open external in new tab. |
| 8 | "Trạng thái" verify/remove | **MOVED.** Was in old homepage footer link. New footer doesn't surface `/health` (admin diagnostic) prominently. Page itself stays accessible at `/health` for ops. |
| 9 | Logo header bigger across all pages | **FIXED.** Logo component now uses h-12 by default. `Layout.astro` updated with apple-touch-icon = logo-mmp.png + og:image default for ALL pages. Browser tab favicon refreshed to brand colors. |

---

## Files touched

**New:**
- `web/src/components/FeatureIcon.astro` — 11 inline SVG icons
- `web/public/og-image.svg` — branded social-share preview (replaces non-existent og-image.png)
- `scripts/e2e-homepage-refactor.ts` — 46-check verification
- `HOMEPAGE_REFACTOR_REPORT.md` — this file

**Modified:**
- `web/src/pages/index.astro` — 9-section premium redesign
- `web/src/components/Logo.astro` — bigger sizes (h-12/14/20) + hero variant + invertOnDark prop
- `web/src/layouts/Layout.astro` — apple-touch-icon + og:image default + og:site_name
- `web/public/favicon.svg` — ink+gold "V" (was sky→orange gradient)
- `web/public/manifest.webmanifest` — Mon Min Pet branding + logo-mmp.png icon

---

## Manual QA for the user

1. Open `https://vowvet.monminpet.com/` in **incognito** Edge → expect:
   - Sticky nav with bigger Logo (Mon Min Pet circle + "VowVet" h-12)
   - Dark hero with gold "thú cưng" highlight + italic Fraunces heading
   - Stats strip with 4 meaningful labels (no "Cảnh báo gửi" weirdness)
   - "ALL-IN-ONE" display section
   - 6 feature cards with SVG icons (no emoji), gold hover effect, "Tìm hiểu thêm →" links
   - "Đối tác lâm sàng" dark section with Founder card + WSAVA badge
   - Ecosystem section with "Bạn đang ở đây" gold pill on VowVet card
   - Ink footer with 4 columns + WSAVA · AAFCO bottom badge

2. **Browser tab favicon** → should show black square with gold italic "V" + small gold dot

3. **iOS / Android home screen** (PWA install) → uses Mon Min Pet circle logo

4. **Google search** for "VowVet" → site name shows "VowVet by Mon Min Pet" + branded OG preview when shared on Zalo/Facebook

5. Hard refresh (Ctrl+Shift+R) if you don't see changes immediately — service worker caches aggressively.
