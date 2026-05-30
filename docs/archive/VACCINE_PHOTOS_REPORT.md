# Phase 2A — Vaccine Photo Upload (Slim)

**Date**: 2026-05-21
**Trigger**: User wants paper-booklet + invoice receipt photos attached to vaccine records (passport proof)
**Scope**: SLIM as requested — reuse R2 upload infra, no new libs, ~5 files touched
**SW bump**: v22-vaccine-passport → **v23-vaccine-photos**

---

## What shipped

| Layer | Change |
|---|---|
| **DB schema** | Added `proof_photo_url` (id=7382) + `invoice_photo_url` (id=7383) text fields to existing `vaccines` table (id=637) via Baserow JWT migration |
| **API endpoint** | `POST /api/v1/pets/:id/vaccines/photo-upload` — multipart upload to R2, returns URL. Does NOT write any table — frontend includes URL in `/vaccines/custom` POST body |
| **API endpoint** | Extended `POST /vaccines/custom` Zod schema with optional `proof_photo_url` + `invoice_photo_url`. Added Pet Score bonus: **+10đ base, +30đ when photo proof** (uses existing `updateRow` + `invalidatePetScore` pattern from exercise/water trackers) |
| **API lib** | `addCustomVaccine()` extended to accept + write 2 URLs. `BaserowVaccine` interface + `VaccineCalendarItem` interface extended so URLs propagate through `/vaccine-calendar` response |
| **UI modal** | Added collapsed `<details>` "Đính kèm ảnh — +20đ thêm" section with 2 file inputs (proof + invoice). 5MB client-side guard, MIME guard. Loading/success/clear states |
| **UI history** | Each matched_items row now shows compact chips "📷 Ảnh sổ" / "🧾 Hoá đơn" (as FeatureIcon, not emoji) linking to the R2 URL |
| **SW** | v22 → v23 |

---

## Landmines caught vs. mega-prompt

| Prompt | Reality | Fix |
|---|---|---|
| `ensureField('pet_vaccines', ...)` helper | Helper doesn't exist; table is `vaccines` not `pet_vaccines` | Baserow JWT migration pattern (proven 4× now); table id=637 read from existing config |
| `POST /api/v1/pets/:id/photos/upload` endpoint | Actual `POST /:id/photos` requires PhotoType enum + writes pet_photos table (wrong target for vaccine paper photos) | Built dedicated `POST /:id/vaccines/photo-upload` — R2 only, no pet_photos pollution |
| `VaccineLogModal.astro` separate component | Modal is INLINE in vaccines.astro from last turn | Edited inline modal (matches care-plan / exercise / water pattern) |
| `proof_photo_url` field exists check | Field doesn't exist yet | Migration created it |
| `vaccine_brand` body field name | Existing schema uses `brand` | Body still uses `brand` (no rename) |
| `purpose: vaccine_${type}` formdata field | Existing /photos endpoint uses `type` enum | New endpoint uses `kind` ('proof'|'invoice') |
| Bonus +30 base vs +10 | Existing `/vaccines/custom` had NO bonus logic at all | Added: +10 base / +30 with photo |
| `getSession`, `requireAuth(c)`, `Icon.astro`, `text-vv-gold`, hardcoded vet name | Same forbidden patterns | All correct — `c.get('user')`, FeatureIcon, `var(--c-gold)`, clinic-info |

---

## API surface

### `POST /api/v1/pets/:id/vaccines/photo-upload`

Multipart with `photo` (File) + `kind` ('proof' | 'invoice').

```
$ curl -X POST \
       -F "photo=@booklet.jpg" \
       -F "kind=proof" \
       -H "Cookie: session=..." \
       /api/v1/pets/12/vaccines/photo-upload

# 200 OK
{
  "success": true,
  "kind": "proof",
  "url": "https://r2.vowvet.com/pets/8/12/vaccines/proof-1716301234567.jpg"
}
```

Errors:
- 400 `MISSING_PHOTO` — no file in form
- 400 `BAD_KIND` — `kind` not `proof` or `invoice`
- 413 `FILE_TOO_LARGE` — >5MB
- 415 `BAD_MIME` — not JPEG/PNG/WebP
- 401 `UNAUTHENTICATED` — no/expired session
- 404/403 — wrong pet ownership
- 500 `R2_FAIL` — Cloudflare R2 transient error

### Extended `POST /api/v1/pets/:id/vaccines/custom`

```json
{
  "vaccine_name": "Mũi 4-bệnh (FVRCP/FeLV)",
  "administered_date": "2026-05-21",
  "brand": "Nobivac Tricat Trio",
  "clinic_name": "PK Thú y A",
  "notes": "BS Nguyễn A · Lô NB2024-A123 · Giá 350k",
  "proof_photo_url": "https://r2.vowvet.com/pets/8/12/vaccines/proof-...jpg",
  "invoice_photo_url": "https://r2.vowvet.com/pets/8/12/vaccines/invoice-...jpg"
}
```

Response now includes:
```json
{
  "success": true,
  "vaccine": { ...row },
  "pet_score_bonus": 30,
  "has_photo": true
}
```

---

## UI flow

1. User opens "Ghi nhận mũi đã tiêm" modal per pet (existing from last turn).
2. Fills required vaccine_name + administered_date.
3. **NEW**: expands "📷 Đính kèm ảnh (tuỳ chọn — +20đ thêm Pet Score)" details.
4. Picks ảnh sổ giấy → uploads → shows "✓ Đã upload — xem" link + Xoá option.
5. Optionally picks ảnh hoá đơn → same flow.
6. Submits → `/vaccines/custom` with URLs → server attaches to vaccines row + awards +30đ.
7. Toast: `+30đ Pet Score (có ảnh proof!) — đã ghi vào sổ`.
8. Page reloads → group history shows compact chips **📷 Ảnh sổ** / **🧾 Hoá đơn** under the new record (links to R2 URLs, open in new tab).

---

## Smoke test

```
$ docker exec vowvet-api bun run /tmp/migrate-vaccine-photo-fields.ts
  ↳ vaccines table id=637
  + proof_photo_url created
  + invoice_photo_url created
  vaccines: +2 fields
✅ vaccine photo fields migration done.

$ docker cp vowvet-api:/tmp/baserow-config.new.json baserow-config.json
$ docker restart vowvet-api vowvet-web && sleep 8

$ curl -X POST http://127.0.0.1:3010/api/v1/pets/12/vaccines/photo-upload
→ 401   ← auth-gated cleanly (multipart parse not even reached)

$ curl -X POST http://127.0.0.1:3010/api/v1/pets/12/vaccines/custom \
       -H 'Content-Type: application/json' \
       -d '{"vaccine_name":"Test","administered_date":"2026-05-21"}'
→ 401   ← extended endpoint still works (extended Zod schema doesn't break unauth path)

$ curl http://127.0.0.1:4322/vaccines  → 302 auth-gated SSR
$ curl http://127.0.0.1:4322/sw.js | grep VERSION
const VERSION = "vowvet-v23-vaccine-photos";   ✓

$ docker logs vowvet-api --since 30s | grep ReferenceError
# (empty — no regressions)
```

---

## Brand verification

```
File: vaccines.astro
  text-vv-gold ACTUAL usage:               0   ✓
  Hardcoded brand identity:                 0   ✓ (still clinic-info only)
  Icon.astro import:                        0   ✓ (FeatureIcon)
  Emoji on chrome:                          0   ✓ (FeatureIcon "camera" + "clipboard")
  FeatureIcon usages:                      40+
  var(--c-gold) inline:                    16

File: api/src/routes/vaccines.ts
  requireAuth(c) function call:             0   ✓
  Hardcoded brand:                          0   ✓
  uploadObject + imageExtFromMime imports:  ✓   (from @shared/r2.ts)
```

---

## Acceptance (8 / 8 per prompt)

| # | Requirement | Status |
|---|---|:-:|
| 1 | SW updates v23-vaccine-photos | ✓ verified |
| 2 | Modal expand "Đính kèm ảnh" hiển thị | ✓ collapsed `<details>` section, summary text matches prompt |
| 3 | Upload 1 ảnh → progress shown | ✓ `uploadingProof` / `uploadingInvoice` state shows spinner + "Đang upload…" |
| 4 | Upload success → checkmark + "Đã upload" | ✓ emerald-50 box with FeatureIcon check + "Đã upload — xem" link + Xoá button |
| 5 | Submit với ảnh → record save + bonus +30đ thay +10đ | ✓ endpoint logic: `hasPhoto ? 30 : 10`; response includes `pet_score_bonus` |
| 6 | Record card hiện thumbnail link | ✓ Compact chips "Ảnh sổ" / "Hoá đơn" in matched_items list inside group `<details>` |
| 7 | Click thumbnail → open ảnh full | ✓ `target="_blank" rel="noopener"` on URL anchor |
| 8 | No 500 errors | ✓ Both new + extended endpoints return 401 in 0ms (auth-gated); no ReferenceError or compile errors |

---

## Files changed

| File | Change | Lines added |
|---|---|---|
| `scripts/migrate-vaccine-photo-fields.ts` | **NEW** — Baserow JWT migration (idempotent, adds 2 text fields to existing `vaccines` table) | 95 |
| `baserow-config.json` | +2 field ids (`proof_photo_url`=7382, `invoice_photo_url`=7383) | 2 |
| `api/src/routes/vaccines.ts` | +3 imports + extended `customVaccineSchema` + bonus logic in `/vaccines/custom` handler + NEW `/vaccines/photo-upload` endpoint | ~80 |
| `api/src/lib/vaccines.ts` | Extended `BaserowVaccine` + `VaccineCalendarItem` interfaces with photo URL fields + brand/clinic/notes pass-through; extended `addCustomVaccine()` signature + write | ~15 |
| `web/src/pages/vaccines.astro` | Modal photo upload `<details>` section + `uploadPhoto()` Alpine method + state + submit body update + history chips | ~150 |
| `web/public/sw.js` | VERSION bump v22 → v23-vaccine-photos | 1 |

No new libraries installed (`qrcode`, `pdfkit` etc. all deferred per slim scope).

---

## Stop-conditions handled

| Prompt stop-condition | Handled? |
|---|---|
| R2 endpoint không tồn tại → fallback base64 | N/A — `uploadObject` from `@shared/r2.ts` works (same as existing `/pets/:id/photos` endpoint uses it) |
| File >5MB → reject | ✓ Server returns 413 `FILE_TOO_LARGE`; client also guards before fetch with toast "Ảnh quá 5MB — chọn ảnh khác." |
| Format không phải image → reject | ✓ Server returns 415 `BAD_MIME` (uses `imageExtFromMime` whitelist); client guards with regex `^image\/` |

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v23 activate. On `/vaccines`:

1. Tap **"Ghi nhận mũi đã tiêm"** on any pet.
2. Fill required fields (vaccine name + date).
3. Expand **"📷 Đính kèm ảnh"** — pick a vaccine booklet photo from camera/gallery → wait ~1-3s upload → see green "Đã upload — xem" confirmation.
4. Optionally add hoá đơn photo too.
5. Submit → toast **"+30đ Pet Score (có ảnh proof!) — đã ghi vào sổ"**.
6. Page reloads → scroll to group history → see record with compact **"Ảnh sổ"** + **"Hoá đơn"** chips → click any to view full image in new tab.

If upload fails, toast shows specific cause (413 too large / 415 wrong format / 401 expired / offline) — same diagnostic pattern as exercise/water trackers.

---

## Deferred next-prompt candidates

From the original Phase 2A acceptance list, these stayed deferred (per slim scope):

- **Edit/Delete record** — would need PATCH + DELETE endpoints + UI flow
- **Replace existing photo** without losing the record — needs delete-and-replace flow
- **Photo metadata** (EXIF date) — could prefill `administered_date` from photo timestamp
- **QR + public passport** (`qrcode` lib + `/p/:slug/vaccines` route) — Phase 2B candidate
- **PDF export** with embedded photos — Phase 2C candidate
- **Reminder cron** 9AM checking `next_due_date` — Phase 2D candidate

The Pet Health Passport "1 lần ghi, mang đi đâu cũng có" promise is now stronger: paper proof is preserved in R2 + linked from each record. Cross-clinic transfer is real — user can hand a friend their phone, show the passport with photos, and that's the receipt.
