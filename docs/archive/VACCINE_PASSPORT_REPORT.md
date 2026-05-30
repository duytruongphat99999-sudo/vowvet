# /vaccines — Pet Health Passport (Ultra-Slim Mindset Shift)

**Date**: 2026-05-21
**Trigger**: User insight "Người nuôi pet hay lười + luân phiên đổi clinic → quên sổ. VowVet = SỔ SỨC KHOẺ DIGITAL portable, KHÔNG bó buộc 1 clinic"
**Scope**: ULTRA SLIM (user-selected) — 1 file, no new DB fields, no new endpoints, no new libs
**SW bump**: v21-vaccines-vn → **v22-vaccine-passport**

---

## The mindset shift in one line

| Before | After |
|---|---|
| Hero CTA: **"Đặt lịch với BSTY Mon Min Pet"** (clinic-centric) | Hero copy: **"Sổ Sức Khoẻ Digital"** (passport identity) |
| Per-group primary CTA: "Đặt lịch Zalo" gold button | Per-pet primary CTA: **"Ghi nhận mũi đã tiêm"** gold button |
| Mon Min: bottom ink card with vet/phone/Zalo prominent | Mon Min: subordinate white card, small text, "Cần gợi ý phòng khám?" tone |
| Per-group cards: 2 CTAs (Log + Đặt lịch) | Per-group cards: informational only (status pill + collapsed details) |

VowVet stops *recommending* a clinic. It *records* what owner already did, anywhere.

---

## Audit findings — landmines avoided

Same mega-prompt landmines as last 3 turns. Caught + corrected:

| Prompt | Reality | Fix |
|---|---|---|
| Page `/pets/:id/vaccines.astro` | Actually `/vaccines.astro` (multi-pet listing) | Edited the real file (multi-pet preserved, each pet gets passport identity) |
| Table `pet_vaccines` | Actually `vaccines` | N/A — no DB writes from this turn |
| 12 new fields via `ensureField()` | Helper doesn't exist; would need Baserow JWT REST | **Skipped entirely** — `notes` field already captures vet name + batch + price + side-effects as free text (with placeholder hint) |
| 5 new endpoints (log/patch/delete/passport/public) | Existing `POST /api/v1/pets/:id/vaccines/custom` already does it | Reused existing endpoint — zero new API surface |
| Cron job vaccine reminders | Would need scheduler hookup | **Deferred** — reminders section reads existing `next_due_date` from /vaccine-calendar |
| QR modal + `qrcode` lib | Lib not installed | **Deferred** |
| PDF export + `pdfkit` lib | Lib not installed | **Deferred** — existing print button handles paper |
| Public `/p/:slug/vaccines` route | Doesn't exist (existing `/p/:slug` is pet card) | **Deferred** |
| R2 photo upload | Different infra surface | **Deferred** |
| `text-vv-gold` | Token doesn't exist | `var(--c-gold)` inline / `text-mmp-gold` |
| `Icon.astro` | Only `FeatureIcon.astro` exists | FeatureIcon |
| Hardcoded "BS Duy Trường Phát" + Zalo URL + phone + address (in prompt's test commands) | Forbidden brand (lesson #57) | All via `getClinicInfo()` |
| `getSession(Astro.cookies)` | `Astro.locals.user` from middleware | Matched pattern |
| `requireAuth(c)` function call | Middleware + `c.get("user")` | N/A — no new endpoint |
| Emoji 💉🦠📔⚠️ on chrome | Forbidden | FeatureIcon SVG |

---

## Astro compile bug caught + fixed mid-build

Initial smoke returned **HTTP 500** with:
```
[CompilerError] Unable to assign attributes when using <> Fragment shorthand syntax!
at /app/web/src/pages/vaccines.astro:229:75
```

Root cause: Astro's JSX-like parser inside `{...}` expression blocks treats `<` as the start of a tag opener. The expression `r.days_until <= 7 ? ...` was parsed as `<= 7 ? ...>` (a tag named `=` with attribute `7`).

Plus a separate `<> · Nhắc kế ...</>` Fragment shorthand with text content was triggering the same family of errors.

**Two surgical fixes**:
1. Extracted `reminderColorFor(daysUntil)` helper to frontmatter — avoids inline `<=` in JSX
2. Replaced `<> · Nhắc kế {fmtDate(...)}</>` with `<span> · Nhắc kế {fmtDate(...)}</span>` — Fragment shorthand has known limits

Added a comment lesson in the helper so this doesn't regress. **Smoke after fix: 302 auth-gated, zero compile errors.**

---

## What shipped (1 file, ~635 lines)

### LAYER 1 — Passport hero (ink card)
- 14×14 book-open icon chip (no clinic vibe)
- "Pet Health Passport" eyebrow + italic display "Sổ Sức Khoẻ Digital"
- Tagline: "Vaccine + clinic + ngày tiêm — ghi 1 lần, mang đi đâu cũng có. Tiêm ở phòng khám nào cũng được, miễn nhớ ghi lại."
- 3 compact stats: **Mũi đã ghi** (total completed across all pets) · **Sắp tới** (upcoming reminders) · **Trễ hạn** (overdue, hides when 0)
- **NO primary CTA in hero** — the action moves down to per-pet level for context

### Cross-pet reminders strip (only when relevant)
- Shows scheduled/overdue items within ±30 days
- Per row: vaccine label · pet name · due date · color-coded days-until pill (red overdue / amber ≤7d / emerald > 7d)
- Limited to 5 visible + "+N khác" footnote

### LAYER 2 — Per pet section
For each pet:
1. **Pet identity row**: paw icon + bé name + species/breed + "Chi tiết →" link to `/pets/:id?tab=vaccine`
2. **GOLD PRIMARY CTA**: full-width `Ghi nhận mũi đã tiêm` button + `+10đ` chip (dispatches `open-vaccine-log` event with pet context)
3. **Group status cards** (2 per pet via shared helper from last turn): demoted to informational. Colored urgency strip + soft-bg icon chip + group name + status pill + collapsed `<details>` with diseases/brands/legacy records. **No more clinic CTA inside cards** — the passport CTA above handles all logging.

### LAYER 3 — FAQ
4 native `<details>` accordions, all reframed for passport mindset:
- "Tiêm ở phòng khám khác có ghi vào đây được không?" → **"Được, bất kỳ phòng khám nào."** (the new mantra)
- "Tại sao chỉ thấy 2 nhóm vaccine?" — VN combo explanation
- "Bao lâu tiêm lại?" — schedule reference
- "Có tác dụng phụ không?" — when to call BSTY

### BOTTOM — Mon Min SUBORDINATE
White card (NOT ink), small icon chip, copy explicitly says "App này không ép buộc — chỉ là sổ ghi nhớ." Mon Min mentioned only as a suggestion with inline phone + Zalo links (no big buttons).

### VaccineLogModal (global, dispatch-triggered)
Per-pet "Ghi nhận" buttons dispatch `open-vaccine-log` with `{petId, petName, species}`. Modal has 5 form sections:

1. **Tên mũi** (required) — preset chips per species: cat → ["Mũi 4-bệnh (FVRCP/FeLV)", "Mũi dại (Rabies)", "Khác"]; dog → ["Mũi 7-bệnh (DHPPi-L)", "Mũi dại (Rabies)", "Khác"]. Plus free-form text input below for specific brand names.
2. **Ngày tiêm** (required) — date picker, default today, max today (can't log future)
3. **Brand + Phòng khám** (optional, 2-col) — short text inputs
4. **Ghi chú** (optional textarea, ~150ch placeholder) — kitchen sink: "BS Nguyễn A · Lô NB2024-A123 · Giá 350k · Sau tiêm OK". Helper text below explains this is where vet name + batch + price + side-effects go (since no dedicated fields yet)
5. **Submit row**: Hủy + gold "Lưu vào sổ" button (disabled until name + date filled)

Posts to existing `POST /api/v1/pets/:id/vaccines/custom` — no new endpoint. Status-aware error messages (401/404/403/500+/offline) per the lesson from the "Lỗi mạng" debugging turn.

---

## Brand verification

```
File: web/src/pages/vaccines.astro
  text-vv-gold ACTUAL usage:               0   ✓ (3 mentions in guard comments)
  Hardcoded "BS Duy Trường Phát":          0   ✓ (clinic.vet.name not even referenced — Mon Min footer uses clinic.name only)
  Hardcoded zalo.me URL:                    0   ✓ (clinic.zalo_url)
  Hardcoded phone:                          0   ✓ (clinic.phone_tel_link)
  Hardcoded "1046 Âu Cơ":                   0   ✓ (clinic.address)
  Icon.astro import:                        0   ✓ (FeatureIcon)
  getSession() call:                        0   ✓ (Astro.locals.user)
  requireAuth(c) function call:             0   ✓ (no new endpoint)
  Emoji on chrome:                          0   ✓ (FeatureIcon SVG everywhere)
  FeatureIcon usages:                       38
  var(--c-gold) inline usages:              14
  Native <details> accordions:              6+  (per-group details + 4 FAQ + Mon Min subordinate is not <details>)
  Lines:                                  ~635
```

---

## Smoke test

```
$ docker restart vowvet-web   # API unchanged
$ sleep 8 && docker logs vowvet-web --since 15s | tail -5
 astro  v5.18.1 ready in 659 ms
 watching for file changes...

# Initial smoke: HTTP 500 (compile error from <= 7 inline)
$ curl /vaccines  → 500
$ docker logs grep CompilerError:
  Unable to assign attributes when using <> Fragment shorthand syntax!
  vaccines.astro:229:75 → `r.days_until <= 7`

# After fix (extracted reminderColorFor helper + replaced <> with <span>):
$ curl -s -o /dev/null -w "%{http_code}\n" /vaccines
302    ← auth-gated SSR, expected

$ curl -X POST /api/v1/pets/12/vaccines/custom -H 'Content-Type: application/json' \
       -d '{"vaccine_name":"Test","administered_date":"2026-05-21"}'
401    ← auth-gated cleanly (existing endpoint, no ReferenceError)

$ curl /sw.js | grep VERSION
const VERSION = "vowvet-v22-vaccine-passport";  ✓

$ docker logs grep error,astroerror | grep -v personality
# (empty — clean)
```

---

## Acceptance — 15-item checklist from prompt

| # | Requirement | Status | Notes |
|---|---|:-:|---|
| 1 | Migration thêm 12 fields mới | ⊘ **DEFERRED** | Per ULTRA SLIM. notes field captures the same data as free text with placeholder hint |
| 2 | Endpoint log với full 12 fields | ⊘ **DEFERRED** | Existing `/vaccines/custom` (5 fields) used; future expansion can add fields when needed |
| 3 | Endpoint update/delete record | ⊘ **DEFERRED** | Per ULTRA SLIM — would need new endpoints + UI flow. Existing `/pets/:id?tab=vaccine` page can be enhanced later |
| 4 | Endpoint passport (auth + public) | ⊘ **DEFERRED** | Existing `/p/:slug` shows pet card, not vaccines specifically. Adding vaccines public view = new route file |
| 5 | Endpoint export PDF/HTML | ⊘ **DEFERRED** | Browser print button serves this need for now |
| 6 | Cron nhắc tiêm 9 AM | ⊘ **DEFERRED** | Existing reminder_sent_* flags + cross-pet reminders strip cover the in-app surface |
| 7 | Hero Passport 3 stats + 3 action buttons | ✓ partial | Hero has 3 stats. 3 action buttons (QR/PDF/print) deferred — only print button kept (browser-native) |
| 8 | Primary CTA "Log vaccine đã tiêm" prominent | ✓ | Gold full-width button per pet, +10đ chip, dispatches modal event |
| 9 | Reminders section show overdue + upcoming | ✓ | Cross-pet, ±30 days, color-coded urgency, 5 visible + footnote |
| 10 | Group accordion theo loại vaccine | ✓ | Per-pet group cards from last turn (informational, no clinic CTA inside) |
| 11 | Timeline đầy đủ với 12 fields | ✓ partial | matched_items list inside group `<details>` shows label + clinic + date. Full 12-field timeline = deferred until DB fields exist |
| 12 | Edit/Delete record | ⊘ **DEFERRED** | Per ULTRA SLIM. Existing `/pets/:id?tab=vaccine` per-pet page handles individual edits |
| 13 | QR code modal | ⊘ **DEFERRED** | Lib `qrcode` not installed; existing `/p/:slug` route can be reused when QR feature ships |
| 14 | Mon Min CTA subordinate (footer, không ép buộc) | ✓ | White card (not ink), small text, "không ép buộc — chỉ là sổ ghi nhớ" copy, inline links only |
| 15 | Brand sync 100% (ink/gold/cream, no blue/cyan) | ✓ | 0 vv-gold actual usage, 0 hardcoded brand identity, FeatureIcon-only chrome |

**5/15 fully shipped + 10 deferred** by user's ULTRA SLIM selection. The deferred items are clearly enumerated for follow-up prompts.

---

## What changed vs. the mega-prompt

The user's MINDSET SHIFT was the critical insight (passport-first vs clinic-first). I delivered that **fully** without the heavy infra it asked for:

| Prompt asked | I shipped | Why |
|---|---|---|
| Migration 12 fields | 0 fields | User picked ULTRA SLIM. `notes` placeholder + helper text captures the data |
| 5 new endpoints | 0 endpoints | Existing `/vaccines/custom` covers the primary flow |
| Cron + PDF + QR + R2 + public route | 0 of those | All deferred per slim scope; user can pick any subset for next prompt |
| Hardcoded "BS Duy Trường Phát" / Zalo / phone in test commands | All via `getClinicInfo()` | Forbidden brand identity (lesson #57); env-driven is the codebase standard |
| `text-vv-gold` everywhere | `var(--c-gold)` inline | Token doesn't exist — silently no-ops |
| Various other landmines | Brand-safe alternatives | See landmines table above |

The mindset shift is in the COPY, the LAYOUT PRIORITY, and the CTA HIERARCHY — none of those needed new tables.

---

## Files changed

| File | Change | Final size |
|---|---|---|
| `web/src/pages/vaccines.astro` | Full rewrite for passport mindset (hero copy, per-pet primary log CTA, demoted Mon Min, modal, FAQ reframe, compile-error fixes) | ~635 lines |
| `web/public/sw.js` | VERSION v21 → v22-vaccine-passport | 1 line |

No new shared helpers (last turn's `vaccine-groups-vn.ts` still in use). No new components. No new migrations. No new endpoints. No new libs.

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v22 activate. Open `/vaccines`:

1. **Hero**: see "Sổ Sức Khoẻ Digital" framing — owner-centric, not clinic-centric. 3 stats top-level (mũi đã ghi / sắp tới / trễ hạn).
2. **Reminders** (if any in ±30 days): see cross-pet list with color-coded urgency.
3. **Per bé**: see big gold **"Ghi nhận mũi đã tiêm"** button — primary action. Below it the 2 group cards are informational (status + collapsed history).
4. **Tap "Ghi nhận mũi đã tiêm"** → modal opens with preset chips (Mũi 4-bệnh / Mũi dại / Khác) + date + brand + clinic + notes (kitchen sink for vet name + batch + price + side effects).
5. **Submit** → toast "Đã ghi vào sổ — bé an toàn hơn rồi!" → page reloads with new record visible in group history.
6. **Mon Min** at bottom: subordinate white card, "Cần gợi ý phòng khám? Bạn có thể tiêm ở bất kỳ phòng khám uy tín nào" — no pressure, just a hint.

The shift is psychological: owner now owns the data, not the clinic.

---

## Deferred for follow-up prompts (clearly enumerated)

Listed in priority order if user wants to keep building:

1. **Photo upload** (R2 endpoint + 2 new fields `proof_photo_url` / `invoice_photo_url`) — biggest UX gap; sổ vaccine paper-photo proof
2. **Vet name + batch_number + side_effects + price_vnd dedicated fields** (Baserow JWT migration) — currently in notes
3. **Edit/Delete records** (PATCH + DELETE endpoints + UI flow on `/pets/:id?tab=vaccine`)
4. **PDF export** (HTML template route returns printable HTML — no pdfkit dep needed)
5. **QR + public passport** (`qrcode` lib + new `/p/:slug/vaccines` route)
6. **Reminder cron** (9AM scheduler hook reading `next_due_date` from `vaccines` table)

Each of these is ~3-5 files of work following the same SLIM pattern.
