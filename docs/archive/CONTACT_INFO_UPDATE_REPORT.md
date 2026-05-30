# Contact Info Update Report — 2026-05-19

Replace all placeholder vet contact info / emergency numbers with VowVet canonical values, anchored by a single source-of-truth module.

## Canonical values

| Type | Value |
|---|---|
| **Hotline (display)** | `0779 029 133` |
| **Hotline (raw)** | `0779029133` |
| **Hotline (E.164)** | `+84779029133` |
| **Purpose** | Bác sĩ tư vấn + Cấp cứu 24/7 (single number) |
| **Zalo OA** | https://zalo.me/1136810892220003266 |
| **Zalo OA ID** | `1136810892220003266` |
| **Support email** | `vowvet@monminpet.com` |

Single source of truth: [`shared/contact-info.ts`](shared/contact-info.ts) — update there, everything else pulls via helpers.

---

## Files modified — 9 total

### Code (4)
| File | Change |
|---|---|
| `shared/contact-info.ts` | **NEW** — `VOWVET_CONTACT` object + helpers `getZaloLink()`, `getHotlineDisplay()`, `getHotlineTelLink()`, `getHotlineRaw()`, `getHotlineE164()`, `getSupportEmail()` |
| `shared/clinic-info.ts` | Default `CLINIC_PHONE` fallback `+84939233398` → uses `VOWVET_CONTACT.hotline.e164`. Added `zalo_url` field (defaults to `getZaloLink()`) |
| `api/src/lib/lost-pets.ts` | Broadcast push body now ends with `· Nếu thấy, gọi 0779029133` |
| `api/src/lib/bcs-vision.ts` | Mock-fallback recommendation now offers Zalo + hotline as alternative to AI |
| `api/src/routes/memorials.ts` | Interest-signup confirmation message includes Zalo + hotline as immediate-help path |
| `scripts/migrate-m20-lost-pets.ts` | Mon Min vet partner seed phone `+84901234567` → `+84779029133`; email → `vowvet@monminpet.com` |
| `scripts/update-contact-info-baserow.ts` | **NEW** — idempotent script to update Baserow rows |

### UI (3)
| File | Change |
|---|---|
| `web/src/pages/emergency.astro` | Added blue Zalo OA CTA card under the red call button |
| `web/src/pages/playdate/safety-tips.astro` | Added emergency contact block at bottom (red phone CTA + Zalo button). Renamed "Mon Min" → "VowVet" in disclaimer |
| `web/src/pages/memorial/[slug].astro` | Public memorial footer now has Zalo + hotline links |
| `web/src/pages/memorial/[slug]/upgrade.astro` | Added "Muốn hỏi trực tiếp?" Zalo + hotline contact block below form |

### Docs (2)
| File | Change |
|---|---|
| `docs/PILOT_LAUNCH.md` | `CLINIC_PHONE=+84xxxxxxxxx` placeholder → `+84779029133`; added `CLINIC_ZALO_URL`; owner/DVM phones updated; CLINIC_24_7 → true |
| `ZALO_ZNS_SETUP.md` | Admin example phone `+84939233398` → `+84779029133` |

---

## Baserow records updated — 1 row

```
=== places (category=vet, name contains "Mon Min" / "VowVet") ===
✓ #13 Mon Min Pet Clinic → contact_phone=+84779029133, contact_website=https://zalo.me/1136810892220003266
```

The `vet_partners` table is empty in this environment — the migrate-m20 seed never ran. **Next time `migrate-m20-lost-pets.ts` runs, the canonical phone is already in the seed code (line 214).**

Idempotent: re-running `bun run scripts/update-contact-info-baserow.ts` is safe and will skip already-canonical rows.

---

## Placeholder mapping (before → after)

| Old | New | Where |
|---|---|---|
| `+84939233398` (clinic-info default) | `+84779029133` (via `getHotlineE164()`) | shared/clinic-info.ts:26 |
| `+84901234567` (M20 Mon Min seed) | `+84779029133` | scripts/migrate-m20-lost-pets.ts:214 |
| `hello@monminpet.com` (M20 Mon Min seed) | `vowvet@monminpet.com` | scripts/migrate-m20-lost-pets.ts:215 |
| `+84xxxxxxxxx` placeholder in env example | `+84779029133` | docs/PILOT_LAUNCH.md:40 |
| `+84xxxxxxxxx` DVM phone | `+84779029133` | docs/PILOT_LAUNCH.md:245 |
| `+84939233398` admin login example | `+84779029133` | ZALO_ZNS_SETUP.md:132 |
| Baserow places row #13 phone (placeholder) | `+84779029133` | baserow row |
| Baserow places row #13 website (null) | `https://zalo.me/1136810892220003266` | baserow row |

---

## Leftover scan — what stayed and why

After updates, these matches remain but are **intentional**:

### Format-notation comments (LEAVE — documenting regex pattern, not placeholder values)
- `shared/auth.ts:29,33-35,44` — JSDoc explaining `0xxxxxxxxx → +84xxxxxxxxx` normalization
- `api/src/lib/otp-sender.ts:66` — comment about Zalo's `+`-stripping requirement
- `api/src/lib/pets.ts:61` — comment describing phone-masking logic

### Historical reports (LEAVE — out of scope per task spec)
- `AUTH_FLOW_REPORT.md`, `LOGIN_UX_REPORT.md`, `MIGRATION_REPORT.md`, `BUGFIX_BATCH_REPORT.md`, `MEGA_BUILD_REPORT_*.md` — document past states; updating would falsify history.

### Sample / test data (LEAVE — example data, not production placeholder)
- `data/pilot-users.example.csv:2` — pilot CSV example with `+84901234567`
- `docs/PILOT_LAUNCH.md:78` — same CSV referenced in docs
- `.env.backup` — pre-existing backup file, untouched
- `.env:44` `ADMIN_PHONES=+84939233398` — admin alert whitelist (separate concept from vet hotline); left unchanged because changing admin whitelist could break SLA push to current admins. Recommend user-controlled update via `/admin` if needed.

### Zalo share URLs (LEAVE — dynamic share intents, not OA links)
- `web/src/pages/lost/[slug].astro`, `web/src/pages/personality/[petSlug].astro`, `web/src/pages/pets/[id]/personality.astro`, `web/src/pages/pets/[id]/birthday.astro` — all use `https://zalo.me/share/url?url=...` (share-to-Zalo intent, not the OA). These remain as-is.

---

## Smoke test results

All public + auth pages render canonical contact info:

```
=== /playdate/safety-tips (PUBLIC) ===
✓ 0779 029 133
✓ zalo.me/1136810892220003266

=== /memorial/<slug> (PUBLIC) ===
✓ 0779 029 133
✓ zalo.me/1136810892220003266

=== /memorial/<slug>/upgrade (PUBLIC) ===
✓ 0779 029 133
✓ zalo.me/1136810892220003266

=== /emergency (AUTH) ===
✓ +84779029133 (from clinic.phone, env-driven)
✓ zalo.me/1136810892220003266 (from clinic.zalo_url)

=== GET /api/v1/places/13 ===
"contact_phone":"+84779029133"
"contact_website":"https://zalo.me/1136810892220003266"

=== GET /api/v1/playdate/safety-tips ===
✓ tips array unchanged (no contact info embedded there; rule 10 already says
  "Profile fake/spam/harassment → tap nút Báo cáo. Mon Min sẽ review trong 24h.")
```

---

## How to maintain going forward

**To change contact info app-wide**: edit `shared/contact-info.ts`. Every helper consumer updates automatically.

**To update existing Baserow rows after editing `contact-info.ts`**: re-run
```bash
cd C:/docker/vowvet
bun run scripts/update-contact-info-baserow.ts
docker compose -f docker/docker-compose.yml restart vowvet-api vowvet-web
```

**Env override**: `CLINIC_PHONE`, `CLINIC_ZALO_URL` env vars in `.env` still take precedence over the contact-info defaults — this means prod can override per-region without code change.

---

## Test URLs

- https://vowvet.monminpet.com/playdate/safety-tips — public, no login
- https://vowvet.monminpet.com/memorial/<slug> — public memorial
- https://vowvet.monminpet.com/memorial/<slug>/upgrade — public upgrade interest
- https://vowvet.monminpet.com/emergency — auth required
- https://vowvet.monminpet.com/places/13 — Mon Min Clinic detail (phone + Zalo)
- https://vowvet.monminpet.com/dashboard — links to all of the above

API verified: v0.29.0 · scheduler `11 jobs scheduled` · no startup errors related to contact changes.
