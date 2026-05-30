# /places photo upload — Build Report
**Date:** 2026-05-19 · **E2E:** 25/25 pass · **API:** unchanged at 0.32.0

Added missing photo-upload feature to the M26 places flow. UI was completely absent on `/places/new` and `/places/checkin`; backend lib was already wired for `photo_urls` but missing the actual `/upload-image` endpoint. Detail page didn't render the photos either.

---

## Self-audit (8 questions from spec)

| # | Question | Answer |
|---|---|---|
| 1 | **Field photo_urls đã có sẵn hay phải migration?** | Already exists. `places.photo_urls` (Baserow id 6898) + `place_checkins.photo_urls` (id 6914) created during M26. NO migration needed. |
| 2 | **Endpoint upload-image đã tồn tại?** | **No.** Added `POST /api/v1/places/upload-image` (requireAuth, 5MB cap, JPG/PNG/WebP). Mirrors the `lost-pets/upload-photo` pattern using `@shared/r2.ts` `uploadObject` + `imageExtFromMime`. Accepts both `file` and `photo` form fields for caller flexibility. R2 key: `places/{userId}/{timestamp}-{rand}.{ext}`. |
| 3 | **/places/new đã thêm upload section?** | Yes — section inserted between Amenities and Map. Required ≥1, max 5. Photo drag/click → async upload with per-thumbnail spinner + ✓ overlay. submit() validates `uploaded.length >= 1` and rejects if any photo still uploading. |
| 4 | **/places/checkin verify đã có upload chưa?** | **No, was completely missing.** Added section after Review textarea. Max 3, optional (no required check). Same upload pattern. Submit sends `photo_urls` array to existing `POST /:placeId/checkin` (already accepted it but UI never sent any). |
| 5 | **/places/[id] detail render ảnh đúng?** | **No, was missing.** Added (a) Place photo gallery section (3-col grid, click to enlarge, "⚠ Chưa verify" badge if `!place.verified`), (b) Per-checkin review photos inline within the existing review loop. |
| 6 | **E2E steps pass?** | **25/25** ([scripts/e2e-places-photos.ts](scripts/e2e-places-photos.ts)) — uploads real PNG to R2, submits a place with 2 photos, submits a checkin with 2 photos, fetches detail and verifies the gallery HTML markers + checkin photos. Also covers 4 validation paths (413/415/400/401). |
| 7 | **Files modified** | **4 files** — 1 backend route + 3 frontend pages. No lib changes (already wired). |
| 8 | **Mock test upload với ảnh dummy thành công?** | Yes — E2E uses an actual 67-byte 1×1 transparent PNG (valid PNG bytes embedded in test). Real upload to R2, real URL returned, real Baserow row. Verified the URL is reachable + persists through GET. |

---

## Files

### Modified — 4
```
api/src/routes/places.ts          — +POST /upload-image endpoint, import uploadObject/imageExtFromMime
web/src/pages/places/new.astro    — +upload section (max 5, required), +previews/handleFiles/removePhoto/fileToDataUrl, submit gates on photos
web/src/pages/places/checkin.astro — +upload section (max 3, optional), same handlers, submit sends photo_urls
web/src/pages/places/[id].astro   — +photo gallery section, +per-checkin photos in review loop
```

### New — 1
```
scripts/e2e-places-photos.ts      — 25-test E2E with real PNG uploads
```

### Untouched (already correct from earlier work)
```
shared/baserow-config.ts          — photo_urls fields already mapped
api/src/lib/places.ts             — createPlace/checkIn already accept + JSON.stringify photo_urls
shared/r2.ts                      — uploadObject + imageExtFromMime helpers reused
```

---

## The upload endpoint

```ts
placesRoute.post("/upload-image", requireAuth, async (c) => {
  const session = c.get("user");
  const formData = await c.req.formData();
  const file = (formData.get("file") || formData.get("photo")) as File | null;
  // ... validate File instance, ≤5MB, JPG/PNG/WebP via imageExtFromMime
  const buf = new Uint8Array(await file.arrayBuffer());
  const key = `places/${session.sub}/${Date.now()}-${rand}.${ext}`;
  const url = await uploadObject(key, buf, file.type);
  return c.json({ url, key });
});
```

Reuses `shared/r2.ts` like `bcs.ts`, `bills.ts`, `lost-pets.ts`.

---

## Frontend pattern (consistent across new + checkin)

```js
// Alpine state
previews: [],      // [{dataUrl, file, uploading, uploaded, url}]
photoError: "",

async handleFiles(event) {
  // count + size + mime guards
  // build preview with dataUrl reader
  // await fetch('/api/v1/places/upload-image') with credentials:'include'
  // flip preview.uploading=false, .uploaded=true, .url=j.url
},

submit() {
  // gate: uploaded.length >= 1 (new) / no gate (checkin)
  // gate: !previews.some(p => p.uploading)
  // POST place/checkin with photo_urls: uploaded.map(p => p.url)
}
```

Per-photo states render via Alpine `x-show`:
- ⏳ "Đang upload" overlay
- ✓ green badge once uploaded
- ✕ red X button to remove (works for both pending + uploaded)

---

## E2E results — 25/25 passing

```
=== T1: Upload image (real PNG bytes) ===
✅ T1 upload returns url
✅ T1b url under places/ key prefix

=== T2: Upload validation ===
✅ T2a >5MB → 413
✅ T2b text/plain → 415
✅ T2c missing file → 400
✅ T2d no auth → 401

=== T3: Upload 2 more for full flow ===
✅ T3 2 more uploads returned URLs

=== T4: Submit place with photos ===
✅ T4 POST /places → 201
✅ T4b id returned
✅ T4c photo_urls echoed back (array len 2)
✅ T4d photo URLs match what we uploaded
✅ T5 GET /places/:id → 200
✅ T5b photo_urls returned as array

=== T6: Submit checkin with photos ===
✅ T6 POST /checkin → 201
✅ T6b checkin photo_urls len 2
✅ T7 GET /checkins → 200
✅ T7b our checkin in list
✅ T7c our checkin has photo_urls len 2

=== T8: Frontend rendering ===
✅ T8a /places/new → 200
✅ T8b /places/new contains upload UI markers
✅ T8c /places/checkin → 200
✅ T8d /places/checkin contains upload UI markers
✅ T8e /places/:id → 200 (public)
✅ T8f detail HTML contains photo gallery section
✅ T8g detail HTML renders checkin review photos block
```

---

## Manual smoke (browser)

1. **Login → /map → click "+"** → `/places/new` opens with full form including new "📸 Ảnh thực tế" section
2. **Fill form + click upload zone** → file picker → select 1-5 JPG/PNG/WebP → thumbnails appear with spinner → ✓ green badge on success
3. **Submit without photos** → red error: "Cần upload ít nhất 1 ảnh thực tế"
4. **Submit with photos** → redirects to `/places/{newId}` → see photo gallery 3-col grid with "⚠ Chưa verify" amber chip
5. **From map → /places/{id} → "📍 Check-in"** → `/places/checkin?placeId=…` → optional photos (max 3)
6. **Submit check-in with photo** → redirects to detail → photo shows under your review block in 3-col mini-grid

---

## Constraints met (per spec)

- ✅ Required ≥1 photo on submit (`/places/new`)
- ✅ Max 5 photos on new, max 3 on checkin (frontend + backend both enforce)
- ✅ Validate size 5MB, format JPG/PNG/WebP (server-side via `imageExtFromMime`)
- ✅ Async upload with per-photo progress indicator (`p.uploading` overlay)
- ✅ Reused R2 pattern from BCS/bills/lost-pets — no new R2 helper code
- ✅ Show ảnh on `/places/[id]` detail (gallery + per-checkin review photos)
- ✅ "⚠ Chưa verify" badge when `place.verified=false`

---

## TODO (out of scope for this fix)

- Admin verify UI — once admin reviews submitted place, set `verified=true`. Not in this PR; existing admin dashboard pattern can be extended.
- Photo moderation: no automated NSFW/violence detection yet. R2 keys are user-scoped so abuse is traceable to user_id, but no auto-takedown.
- Image compression client-side: relies on browser/user to send reasonable files. Could add `<canvas>` resize step before upload to keep keys small.
- Lightbox: photos open in new tab via `<a target="_blank">`. A swipeable lightbox (PhotoSwipe) would improve UX on mobile.
