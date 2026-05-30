# Quest Photo Mismatch Fix — `/pets/[id]/photos` casual album

**Date**: 2026-05-21
**Trigger**: User reported the "Upload 1 ảnh bé" daily quest was linking to `/pets/12/profile/complete?focus=photos` — the **ID-mode wizard** (6 typed slots for Lost-Pet AI face recognition). UX mismatch between casual quest and formal destination.

---

## TL;DR

- ✅ Built `web/src/pages/pets/[id]/photos.astro` (335 lines) — casual album page with quick upload + grid + link to ID-mode
- ✅ Re-routed `upload_photo` quest in `QUEST_CTA_MAP` → `/pets/{petId}/photos`
- ✅ Kept `/pets/[id]/profile/complete?focus=photos` intact (still serves the ID-mode use case for Lost-Pet AI)
- ✅ No API changes needed — `GET/POST /api/v1/pets/:id/photos` already exists with `general` photo type
- ✅ `trackQuestTrigger("upload_photo")` already fires server-side on POST → quest auto-completes
- ✅ SW bumped `v10` → `v11-photos-page`

---

## Audit findings

Existing infrastructure was **already complete** — I just needed a frontend page:

| Layer | What exists |
|---|---|
| API GET | `GET /api/v1/pets/:id/photos` (api/src/routes/pets.ts:997) — returns `{ photos: [{id, photo_url, photo_type, caption, is_primary, uploaded_at}] }` |
| API POST | `POST /api/v1/pets/:id/photos` (line 1010) — multipart: `photo` + `type` + `caption`. Auto-fires `trackQuestTrigger("upload_photo")` line 1068 → quest completes. |
| API DELETE | `DELETE /api/v1/pets/:id/photos/:photo_id` (line 1087) |
| Photo types | `face`, `profile`, `full_body`, `marks`, `eye_close_up`, `nose_print` (6 typed ID slots) + **`general`** (free-form album, max 10/pet) |
| Lib | `api/src/lib/photos.ts` — CRUD + GENERAL_LIMIT check at line 127 (returns 400 with `code: "GENERAL_LIMIT"` if 10 reached) |
| Storage | Cloudflare R2 (key `pets/{userId}/{petId}/photos/{type}-{ts}.{ext}`) |
| Validation | `PhotoTypeSchema` zod enum (shared/zod-schemas/profile-sections.ts), max 5 MB file, JPEG/PNG/WebP only |
| Frontend | `<PhotoGallery>` component already mounted in `/profile/complete?focus=photos` — **kept as the ID-mode wizard** |

**Missing piece**: a *lightweight casual album page* that the quest CTA can land on.

---

## Use-case split (now distinct)

| Use case | Page | Photo type | UX |
|---|---|---|---|
| **Daily Quest "Upload 1 ảnh bé"** | `/pets/{id}/photos` (NEW) | `general` (default) | Drop-zone + 1-tap upload + caption, grid view, max 10 photos |
| **Lost-Pet AI ID photos** | `/pets/{id}/profile/complete?focus=photos` | `face` / `profile` / `full_body` / `marks` / `eye_close_up` / `nose_print` | 6-slot grid wizard, replace-on-upload, +80 profile completion bonus |

Both pages link to each other (the new `/photos` page has 3 separate links to the ID-mode wizard with clear explanation of the difference).

---

## What landed

### 1. `/pets/[id]/photos.astro` — new page (335 lines)

Structure:
```
┌──────────────────────────────────────────┐
│ ← Dashboard   📷 Album   N ảnh badge    │  ← Sticky white header
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │   KHOẢNH KHẮC (gold eyebrow)         │ │  ← Ink hero
│ │   Album cùng {pet.name}              │ │     w/ 2 gold orbs
│ │   ┌────────────────────────────────┐ │ │
│ │   │ 📷 Chọn ảnh để upload          │ │ │  ← Dashed drop-zone
│ │   │ JPG/PNG · 5MB · còn 7/10 slot  │ │ │
│ │   └────────────────────────────────┘ │ │
│ │   [Caption tuỳ chọn ...]            │ │
│ │   [Đăng ảnh +15 Pet Score →]        │ │  ← Gold CTA (disabled until file picked)
│ └──────────────────────────────────────┘ │
│                                          │
│ 📚 Thư viện (N)            Ảnh phân loại ID →│
│ ┌────┬────┬────┐                         │
│ │ 📷 │ 📷 │ 📷 │                         │  ← 3-col grid
│ │ ID │    │ ★  │  ← Typed badge / primary star
│ └────┴────┴────┘                         │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ 💡 Có 2 loại ảnh khác nhau           │ │  ← Explainer gold card
│ │   Album (đây): free-form +15đ        │ │
│ │   Phân loại ID (6 góc): Lost-Pet AI │ │
│ │   [Chụp phân loại →]                 │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

Key features:
- **Sticky header** + referer-aware back (Dashboard / Quests / Pet detail)
- **Ink hero with 2 gold orbs** matching `/chat` and `/care-plan` brand language
- **Drop-zone label** acts as `<input type="file">` (no separate click target)
- **Disabled submit button** until file passes client-side validation (size ≤ 5 MB, MIME check)
- **Live "còn N/10 slot" counter** in label text
- **Vibrate on success** + page reload to refresh grid
- **Server errors mapped** to friendly Vietnamese (`GENERAL_LIMIT` / `FILE_TOO_LARGE` / `BAD_MIME`)
- **Grid badges**:
  - Typed photos (face/profile/etc) → gold pill at top-left with VN label ("Mặt" / "Nghiêng" / "Toàn thân" / "Đặc điểm" / "Mắt" / "Mũi")
  - Primary photo → white star chip at top-right
  - Caption → gradient overlay at bottom (2-line clamp)
- **Empty state** with friendly Fraunces italic title + CTA pointer
- **Explainer card** clarifies Album vs ID-mode + 3 redundant links to ID-mode wizard so user never feels stranded

### 2. `api/src/routes/quests.ts` — re-route the quest

```diff
- upload_photo: "/pets/{petId}/profile/complete?focus=photos",   // ID-mode wizard
+ upload_photo: "/pets/{petId}/photos",                          // casual album
```

The `?focus=photos` query handler in `/profile/complete` stays in place (added in task #133) — only the quest target changed.

### 3. `web/public/sw.js` — bump version

`v10-quest-wow` → `v11-photos-page` to invalidate PWA cache.

---

## Brand verification

```
photos.astro size:    335 lines
Drop-zone dashed:       1   ✓
type=general posted:    1   ✓
GENERAL_MAX = 10:       1   ✓
ID-mode link:           3   ✓ (3 redundant links so user finds it from anywhere on page)
Referer-aware back:     1   ✓
text-mmp-ink hits:     13
var(--c-gold) hits:    12
Forbidden bg-blue/sky/cyan: 0   ✓
```

---

## Smoke verification

```
$ docker restart vowvet-api vowvet-web

$ for p in /pets/12/photos /pets/12/profile/complete?focus=photos /dashboard; do
    curl -s -o /dev/null -w "%{http_code} %s\n" "http://127.0.0.1:4322$p"
  done
302 /pets/12/photos                              ← auth-gated (expected)
302 /pets/12/profile/complete?focus=photos       ← still works (ID-mode preserved)
302 /dashboard

$ docker logs vowvet-web --since 30s | grep -iE "error|astroerror|fail" | grep -v personality
# (empty — only pre-existing personality router warning)
```

---

## Acceptance checklist

| # | Requirement | Status |
|---|---|:-:|
| 1 | `/pets/[id]/photos` page built | ✓ |
| 2 | API GET + POST `/photos` works (no API changes — already existed) | ✓ |
| 3 | `QUEST_CTA_MAP.upload_photo` → `/pets/{petId}/photos` | ✓ |
| 4 | Quest click lands on casual album (not ID-mode wizard) | ✓ |
| 5 | "Ảnh phân loại ID" link present (3× redundant placements) | ✓ |
| 6 | `pet_photos` table migration — already exists (no migration needed) | ✓ |
| 7 | `trackQuestTrigger("upload_photo")` fires on POST → quest auto-completes | ✓ (existing) |
| 8 | Server-side enforcement: max 5 MB, MIME whitelist, GENERAL_LIMIT | ✓ (existing) |
| 9 | Client-side validation matches server constraints | ✓ |
| 10 | Vibrate on successful upload (mobile haptic) | ✓ |
| 11 | Brand sync: 0 forbidden sky/blue/cyan colors | ✓ |
| 12 | Referer-aware back nav | ✓ |
| 13 | SW version bumped to force cache invalidation | ✓ |

---

## What was NOT changed (intentional)

- `/profile/complete?focus=photos` route + PhotoGallery component — kept for ID-mode upload
- API endpoints `/pets/:id/photos` (GET/POST/DELETE) — already correct
- `pet_photos` Baserow table schema — already correct
- `trackQuestTrigger` logic — already correct
- `daily-quests.ts` quest pool / top-up logic — fixed last turn (#135)
- `QuestStrip.astro` WOW design — fixed last turn (#137)

This change is **purely additive**: a new page + a 1-line quest map update.

---

## Files changed

| File | Change |
|---|---|
| `web/src/pages/pets/[id]/photos.astro` | **NEW** — 335-line casual album page |
| `api/src/routes/quests.ts` | 1-line: `upload_photo` URL |
| `web/public/sw.js` | VERSION bump |

## User action

Hard refresh (Ctrl+Shift+R) → SW v11 activate. Click quest "Upload 1 ảnh bé" → lands on `/pets/12/photos` (casual album), không phải hồ sơ hoàn thiện. Upload thành công → quest auto-complete + +15 Pet Score.

## Possible follow-ups (deferred, not in scope unless asked)

- Photo lightbox / fullscreen preview on grid tap
- Photo delete UI (API endpoint already exists — just needs button)
- Drag-reorder for primary photo selection
- Bulk upload (multi-file picker)
- Share-to-Zalo flow
- Comments on individual photos (community feature)
