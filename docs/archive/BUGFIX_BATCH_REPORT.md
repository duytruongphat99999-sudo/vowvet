# VowVet — Bug Fix Batch Report

**Date:** 2026-05-19
**API version:** 0.20.1 (unchanged)

User reported 11 issues across pet profile, personality, QR passport, public link, clinic phone, triage, and language. **8 fixed**, **3 deferred** (need more specific user feedback).

---

## ✅ Fixed (8/11)

### Bug #2 — Medical events save → 404 "không tìm thấy endpoint"
**Root cause:** Frontend posted to `/api/v1/pets/:id/events`, backend mounts the route as `/health-events` (per `pets.ts:1161` — `buildHealthSubRoute("events", "health-events")`). URL mismatch.

**Fix:** `web/src/pages/pets/[id]/profile/complete.astro` — map resource `"events"` → URL segment `"health-events"` in both `addHealth()` (line ~1002) and `deleteHealth()` (line ~1033).

---

### Bug #6 — Personality save → `Baserow PATCH 400: 'sleeper' is not a valid select option`
**Root cause:** Baserow `pets.personality_type` field (single_select, id=6293) had 8 options from a stale M13 setup: `explorer, cuddler, foodie, guardian, athlete, thinker, social, independent`. But `shared/personality-types.ts` defines **12 types**: explorer, cuddler, foodie, guardian, **comedian**, athlete, **diplomat, loner, talker, sleeper, trickster, sensitive**. Code computed `sleeper` → tried to PATCH → Baserow rejected because option doesn't exist.

**Fix:** Created `scripts/migrate-m22-personality-options.ts`. Ran it:
- Preserved 8 existing options (existing rows pointing to them stay valid)
- Added 7 missing options: comedian, diplomat, loner, talker, sleeper, trickster, sensitive
- Now 15 total options (15 = 8 legacy + 7 new from code; both sets work for backward-compat)

Verified: `personality_type Baserow options: …, sleeper, …` — Missing code types: (none) ✓

---

### Bug #7 + #8 — `/p/[slug]` returned **FailedToLoadModuleSSR** (also broke QR Passport)
**Root cause:** `web/src/pages/p/[slug].astro` line 15 used relative import `"../../../shared/public-pet-fields.ts"`. From file location `/app/web/src/pages/p/[slug].astro` inside container, `../../../shared/` resolves to `/app/web/shared/` — doesn't exist. Need `../../../../shared/` OR `@shared/` alias.

QR codes were correctly generating links to `/p/[qr_code]` — but the destination page itself was broken, so any QR scan landed on FailedToLoadModuleSSR.

**Fix:** Changed import to `@shared/public-pet-fields.ts` (using web `tsconfig.json` paths alias). One line change. Verified: `curl /p/min-c52lca` now returns **HTTP 200** (was crashing).

---

### Bug #9 — Update clinic emergency phone to `0779029133`
**Root cause:** `shared/clinic-info.ts` reads `CLINIC_PHONE` env var, defaulted to old `+84939233398`. Triage page also had hardcoded `"0939233398"`.

**Fix (2 files):**
1. `.env` — added `CLINIC_PHONE=+84779029133` + `CLINIC_NAME=Mon Min Clinic - HCMC`
2. `web/src/pages/pets/[id]/triage.astro` — removed hardcoded constant, now imports `getClinicInfo()` from shared. Auto-formats `+84779029133` → `0779029133` for display.

Container env confirmed: `CLINIC_PHONE=+84779029133` in both vowvet-api + vowvet-web.

---

### Bug #10 — Empty triage → bounces home (no explanation)
**Root cause:** When Baserow has no `triage_sessions` symptom data for the species, `categories` array empty → page renders empty grid, user confused → leaves to home thinking it's broken.

**Fix:** `web/src/pages/pets/[id]/triage.astro` — added explicit empty state inside Step 1 wizard panel:
- Big 🩺 icon + "Chưa có danh sách triệu chứng" message
- Red prominent "📞 Gọi {clinic_phone}" CTA (tel: link)
- Back link to pet detail
- KHÔNG redirect anywhere — user sees what's wrong and has a clear action

---

### Bug #1 — Vaccine name needs autocomplete/free-input
**Root cause:** `web/src/pages/pets/[id]/profile/complete.astro` line 311 used `<select>` with fixed options → user couldn't enter custom vaccine names (e.g., new brand or unusual vaccine).

**Fix:** Changed to `<input type="text" list="vaccine-list">` + `<datalist id="vaccine-list">` populated from `vaccineOptionsForSpecies`. User can:
- Click input → see autocomplete suggestions
- Type a custom name not in list → accepted as-is
- Labels in datalist show both Vietnamese label + code: `"Bệnh dại (Rabies)"`

---

### Bug #5 — "Xong" button too small/hidden when profile reaches 95%
**Root cause:** `web/src/pages/pets/[id]/profile/complete.astro:714` — the completion CTA was a small "✓ Xong" pill inside a floating bottom-right chip alongside the percentage. Easy to miss.

**Fix:** Kept the small chip but ALSO added a big bottom CTA banner (gradient emerald→teal, full-width, fixed bottom, slide-up animation) when `completion.pct >= 95`:
- 🎉 Animated bounce icon
- "Hồ sơ đã đủ {pct}%!"
- Huge white button "✓ Hoàn thành →" (px-7 py-3) impossible to miss
- 24-unit height spacer below content so banner doesn't cover last section

---

## ⚠️ Deferred (3/11) — need more specific feedback

### Bug #3 — Nutrition section "chưa chính xác lắm"
The current nutrition section (in `/pets/[id]/profile/complete.astro`) covers: `diet_type`, `diet_brand_primary`, `meals_per_day`, `portion_grams`, `daily_water_ml`. To "make it more accurate" needs specific feedback:
- Add weight-based calorie target?
- Auto-suggest portion from breed + activity_level?
- Add wet/dry/raw split?
- Food allergies cross-reference?

→ Will tackle in next iteration once user specifies what's missing.

### Bug #4 — Lifestyle section "chưa ổn"
Current Lifestyle covers: `sleep_location`, `bathroom_location`, `walk_frequency`, `bath_frequency`, `travels_with_owner`, `caregiver_when_away`. Same as above — what specifically is wrong?

→ Defer pending user clarification.

### Bug #11 — Language Vietnamese vs English mixing
The codebase has Vietnamese labels with English values (e.g., `personality_type` stored as English keys like `"sleeper"`, displayed via lookup tables as "🦉 Cú đêm"). Adding strict i18n would mean:
- Wrap all UI strings in t() helper
- Add language toggle in user settings
- Create vi.json + en.json string bundles
- Localize Gemini prompts per language

→ This is a multi-day refactor. Deferred to a dedicated milestone.

---

## Files modified / created

**Backend:**
- `scripts/migrate-m22-personality-options.ts` (NEW) — added 7 personality options to Baserow

**Frontend:**
- `web/src/pages/p/[slug].astro` — fixed import path (`@shared/`)
- `web/src/pages/pets/[id]/profile/complete.astro` — Bug #1 vaccine datalist, Bug #2 URL segment, Bug #5 big CTA banner
- `web/src/pages/pets/[id]/triage.astro` — Bug #9 clinic phone via env, Bug #10 empty state

**Config:**
- `.env` — `CLINIC_PHONE=+84779029133` + `CLINIC_NAME`

**Restart:**
- `docker compose up -d --force-recreate vowvet-api` + `vowvet-web` (needed to pick up new env vars)

---

## Verification snapshot

```
API health: 200 ✓
/p/min-c52lca: HTTP 200 ✓ (was FailedToLoadModuleSSR)
Container env CLINIC_PHONE=+84779029133 ✓ (both api + web)
Baserow personality_type options: 15 total, all 12 code types present ✓
```

---

## Test instructions for user

1. **Personality quiz**: làm lại quiz cho bé → save không còn lỗi 'sleeper not valid'
2. **QR Passport**: scan QR (hoặc click link `/p/...`) → load đầy đủ public profile thay vì FailedToLoadModuleSSR
3. **Medical events**: vào `/pets/[id]/profile/complete` → tab "Sức khoẻ" → thêm sự kiện y tế → save thành công
4. **Vaccine**: thêm vaccine → input gõ tự do được, có gợi ý từ dropdown
5. **Profile 95%+**: điền 95%+ profile → banner xanh to ở dưới với nút "✓ Hoàn thành" rất rõ
6. **Triage empty**: vào triage khi DB chưa seed → hiện nút gọi clinic thay vì redirect home
7. **Clinic phone**: nhấn "Gọi cấp cứu" → dial `0779029133`
