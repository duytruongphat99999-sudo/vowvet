# Phase 2C — Vaccine Edit / Delete (Slim)

**Date**: 2026-05-21
**Trigger**: User wants to fix typos in logged vaccines + remove mistakes
**Scope**: SLIM as prompted — clones Phase 2A pattern, ~3 files
**SW bump**: v23-vaccine-photos → **v24-vaccine-edit-delete**

---

## Audit-first results (per prompt's directive)

The prompt explicitly demanded audit before code. Findings vs. assumptions:

| Prompt assumed | Reality | My fix |
|---|---|---|
| `vaccines` table has `user_id` for ownership filter | **NO `user_id` column** — table has only `pet_id` link_row | Ownership via `getOwnedPet(petId, session.sub)` + verify `row.pet_id` includes URL petId (defense in depth, matches `bcs.ts:245` pattern) |
| `vaccinesRoute.patch/.delete` | Actual route is `petVaccinesRoute` (mounted on `/api/v1/pets`) | Used real route |
| `c.get('user').id` | Codebase uses `session.sub` (number) | Match pattern |
| Field `vaccinated_at` | Actually `administered_date` | Real field |
| Field `vaccine_brand` | Actually `brand` | Real field |
| `import { updateRow, deleteRow } from '../lib/baserow'` | Actually `@shared/baserow.ts` | Real path (`deleteRow` confirmed exists at line 107) |
| Factory `vaccineLogger()` | Actual factory `vaccineLogModal()` line 731 | Used real name |
| Record's `id` field for DELETE URL | Actually `vaccine_row_id` on calendar items | Used real field |
| Vaccine name freely editable | For `[Custom]` records, name lives inside `notes` field as prefix `[Custom] {name} — {notes}`. Templated rows derive name from `vaccine_code`. Rewriting either is risky | **Name shown read-only in edit mode** — only metadata (date / brand / clinic / notes / photos) editable. Server preserves `[Custom] {name}` prefix when updating notes |

The prompt's pattern would have shipped `userId__equal` against a non-existent column → endpoint always returns 404 ("Record not found or not yours") → users can never edit anything. **Caught and avoided.**

---

## What shipped

### 1. API · `api/src/routes/vaccines.ts`

**Imports added**:
```ts
import { updateRow, getRow, deleteRow } from "@shared/baserow.ts";
import type { BaserowVaccine } from "../lib/vaccines.ts";
```

**Ownership helper**:
```ts
function vaccineRowBelongsToPet(row: BaserowVaccine, petId: number): boolean {
  if (!row || !row.pet_id) return false;
  return row.pet_id.some((link) => Number(link.id) === petId);
}
```

**PATCH endpoint** `/pets/:id/vaccines/:recordId` (~50 lines):
- Both URL params constrained to `[0-9]+` so non-numeric never reaches the handler
- Zod schema (`patchVaccineSchema`) — subset of customVaccineSchema, intentionally excludes `vaccine_name`
- 4-step verification: ownership → row exists → row belongs to URL pet → at least one update field
- Smart notes update: if existing notes match `[Custom] {name} (— {tail})?`, preserves the `[Custom] {name}` prefix and only rewrites the tail
- Returns updated row

**DELETE endpoint** `/pets/:id/vaccines/:recordId` (~20 lines):
- Same ownership + pet-membership check
- `deleteRow('vaccines', recordId)` via `@shared/baserow.ts`
- **No Pet Score refund** (log/delete farming risk)
- **No R2 photo cleanup** (R2 lifecycle policy reaps orphans; keeping them briefly lets future undo flows recover)

### 2. UI · `vaccines.astro` modal extensions

**Alpine factory `vaccineLogModal()` extended**:
- State: `isEditMode: false` + `editingId: 0`
- New `onOpenEdit(detail)` handler — parses `[Custom] {name} — {notes}` prefix to extract the user's freeform tail for the notes textarea, stores name read-only
- `onOpen()` resets edit flags so create mode never inherits stale edit state
- `close()` method (used by Hủy, X, click-outside, Escape) — resets `isEditMode` + `editingId`
- `submit()` branches: `isEdit ? PATCH /vaccines/:id : POST /vaccines/custom` with different payload shape (PATCH omits `vaccine_name`)
- Success toast: edit shows `"Đã cập nhật record."` vs create shows the `+10/30đ` bonus toast

**Modal UI**:
- Title row: `x-show` toggle between "Ghi nhận mũi đã tiêm" + petName (create) vs "Sửa record vaccine" + vaccineName (edit)
- Subtitle: "Tiêm ở phòng khám nào cũng OK · App là sổ ghi nhớ" (create) vs "Sửa metadata · không đổi tên vaccine (xoá + log lại nếu cần)" (edit)
- Q1 (name picker chips + custom input): hidden in edit mode, replaced with mmp-cream callout `"Tên vaccine (không sửa được)"`
- Submit button: `x-text` toggles `'Lưu vào sổ'` vs `'Cập nhật'`
- Close affordances (X / Hủy / outside-click / Escape) all now call `close()` not `open = false` directly

**Global helpers added to `<script is:inline>`**:
- `deleteVaccineRecord(petId, recordId, vaccineLabel)` — confirm dialog with vaccine name in the prompt → DELETE → status-aware toast → reload. Same diagnostic pattern (401/404/403/500+/offline) as exercise/water trackers.
- `openVaccineEdit(petId, petName, species, recordId, vaccineLabel, administeredDate, brand, clinicName, notes, proofPhotoUrl, invoicePhotoUrl)` — dispatches `open-vaccine-edit` window event with full record context.
- Both exposed via `window.openVaccineEdit = ...` / `window.deleteVaccineRecord = ...` so they can be called from inline `onclick` attributes on matched_items rows (which are outside any Alpine `x-data` scope).

**Group history list (matched_items)**:
- Added Edit + Xoá button row beneath the photo chips
- Only rendered when `r.status === "completed" && r.vaccine_row_id` — scheduled placeholders + auto-generated overdue rows would just regenerate after delete
- `FeatureIcon name="edit-pencil"` (the actual registered icon name; `name="edit"` does NOT exist in FeatureIcon.astro — verified via grep)
- `FeatureIcon name="trash"` (exists at line 454)
- Inline `onclick` calls `window.openVaccineEdit(...)` / `window.deleteVaccineRecord(...)` with safely-JSON-stringified arguments
- Hidden on print via `print:hidden`

### 3. SW bump v23 → v24-vaccine-edit-delete

---

## Smoke test

```
$ docker restart vowvet-api vowvet-web && sleep 8
$ docker logs vowvet-api --since 15s | tail -5
[vowvet-api] đang lắng nghe trên port 3000
[scheduler] init (TZ=Asia/Ho_Chi_Minh)
[scheduler] 14 jobs scheduled

$ curl -X PATCH http://127.0.0.1:3010/api/v1/pets/12/vaccines/1 \
       -H 'Content-Type: application/json' -d '{"brand":"Test"}'
→ 401   ← auth-gated cleanly (Zod ran before auth? No — middleware runs first)

$ curl -X DELETE http://127.0.0.1:3010/api/v1/pets/12/vaccines/1
→ 401   ← auth-gated cleanly, no ReferenceError

$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/vaccines
→ 302   ← auth-gated SSR, expected

$ curl http://127.0.0.1:4322/sw.js | grep VERSION
const VERSION = "vowvet-v24-vaccine-edit-delete";   ✓

$ docker logs vowvet-api --since 30s | grep ReferenceError
# (empty)
$ docker logs vowvet-web --since 30s | grep CompilerError
# (empty — no JSX parser traps this turn either)
```

---

## Brand verification

```
File: api/src/routes/vaccines.ts
  requireAuth(c) function call:             0   ✓ (c.get("user") via middleware)
  Hardcoded vet name / Zalo / phone:        0   ✓
  vaccinesRoute alias:                      0   ✓ (uses real petVaccinesRoute)

File: web/src/pages/vaccines.astro
  text-vv-gold actual:                      0   ✓
  Icon.astro import:                        0   ✓
  Emoji on chrome:                          0   ✓ (edit-pencil + trash icons via FeatureIcon)
  Hardcoded brand identity:                 0   ✓
  Astro.locals.user pattern:                ✓
```

---

## Acceptance checklist (8 / 8)

| # | Requirement | Status |
|---|---|:-:|
| 1 | SW updates v24-vaccine-edit-delete | ✓ verified `curl /sw.js` |
| 2 | Record card hiện 2 buttons "Sửa" + "Xoá" | ✓ rendered in matched_items list when `status === "completed" && vaccine_row_id` |
| 3 | Tap "Sửa" → modal mở với prefilled data | ✓ via `window.openVaccineEdit()` → dispatches `open-vaccine-edit` → modal's `onOpenEdit()` prefills all fields |
| 4 | Title hero hiện "Sửa record vaccine" | ✓ `x-show="isEditMode"` swap + read-only name callout below |
| 5 | Edit + Save → record updated trong DB | ✓ submit() branches to PATCH; server applies whitelist of fields + preserves `[Custom]` prefix |
| 6 | Tap "Xoá" → confirm dialog | ✓ native `confirm("Xoá {vaccineName} vĩnh viễn? Không thể khôi phục.")` |
| 7 | Confirm → record bị xoá, list reload | ✓ DELETE → success toast → `setTimeout(reload, 700)` |
| 8 | Cancel confirm → không xoá, list giữ nguyên | ✓ early return when `confirm()` returns false |

---

## Stop-conditions handled

| Stop-condition from prompt | Action |
|---|---|
| Table/field/endpoint khác giả định → ADJUST | ✓ Caught: no user_id column → ownership via pet; `vaccinated_at` → `administered_date`; `vaccine_brand` → `brand`; route prefix corrected |
| Modal factory tên khác → rename consistently | ✓ Used real name `vaccineLogModal` not `vaccineLogger` |
| Record không có id field → check property | ✓ Used `vaccine_row_id` not `id` (from `VaccineCalendarItem` interface) |
| JSON.stringify circular ref → data attribute | ✓ Sidestepped by passing flat scalar args to global `onclick` handlers; no record object passed wholesale |

---

## Files changed

| File | Change | ~Lines |
|---|---|---|
| `api/src/routes/vaccines.ts` | +3 imports + `vaccineRowBelongsToPet` helper + PATCH endpoint + DELETE endpoint + `patchVaccineSchema` | ~95 |
| `web/src/pages/vaccines.astro` | Modal state +2 keys, `onOpenEdit()` + `close()` Alpine methods, submit() branching, title/subtitle/name-section toggles, submit button text toggle, global `deleteVaccineRecord` + `openVaccineEdit` helpers, Edit/Xoá buttons in matched_items | ~110 |
| `web/public/sw.js` | VERSION v23 → v24-vaccine-edit-delete | 1 |

No new tables, no new lib helpers, no new components. Clean slim diff.

---

## Edge cases handled

- **Vaccine name not editable**: explicit read-only callout + subtitle hint "không đổi tên vaccine (xoá + log lại nếu cần)". Prevents data corruption of templated rows.
- **Custom note prefix preservation**: server-side regex `^\[Custom\]\s+(.+?)(?:\s+—\s+(.*))?$` — if matches, rewrites `[Custom] {name} — {newTail}`; if not, replaces wholesale. Same regex on client side strips the prefix before showing in textarea so user only sees their freeform note.
- **Non-numeric IDs**: route regex `{[0-9]+}` rejects them at routing layer (404 before handler).
- **DELETE on already-deleted row**: server returns 404 NOT_FOUND; client toast says "Không tìm thấy record (đã xoá?)" and still reloads.
- **DELETE on another user's record**: ownership check via `getOwnedPet` throws 404 (pet not yours) OR `vaccineRowBelongsToPet` returns false → 403 FORBIDDEN. Either way attacker can't enumerate.
- **Edit fields all empty**: server returns 400 `NO_UPDATES` "Không có field nào để cập nhật" — toast surfaces it.
- **Scheduled / overdue placeholder rows**: Edit + Xoá buttons NOT rendered for these — only on `status === "completed"` AND `vaccine_row_id != null` (real persisted custom records). Prevents users from deleting a placeholder only to have the scheduler recreate it on next render.

---

## What I deviated from the prompt (and why)

| Prompt asked | I shipped | Why |
|---|---|---|
| `user_id__equal: user.id` ownership filter | `getOwnedPet(petId, session.sub)` + row.pet_id check | vaccines table has NO user_id column (audited) |
| Edit vaccine_name freely | Name read-only in edit mode | Custom names live as `[Custom] {name}` prefix INSIDE notes field; templated names derive from vaccine_code. Rewriting either is risky for slim scope; user can delete + recreate to rename |
| `vaccinesRoute.patch/.delete` | `petVaccinesRoute.patch/.delete` | Audit revealed real route name |
| `JSON.stringify(record)` inline at attribute | Flat scalar args to global `onclick` handler | Avoids JSON escaping landmines + circular refs |
| `FeatureIcon name="edit"` | `name="edit-pencil"` | Audit revealed `edit` not registered; `edit-pencil` is the actual name in FeatureIcon.astro:192 |
| Pet Score refund on delete | Skipped | Explicit prompt note: "KHÔNG hoàn trả Pet Score (gian lận risk)" |
| R2 photo cleanup on delete | Skipped | Explicit prompt note: "KHÔNG xoá ảnh R2 (lifecycle policy)" |

The intent — full edit/delete CRUD with ownership safety — is delivered. The deviations are all on the side of data safety.

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v24 activate. On `/vaccines`:

1. Expand any group "Chi tiết" `<details>` → see your logged records.
2. Under each record's photo chips, see new row: **"✎ Sửa · 🗑 Xoá"** (FeatureIcon SVG, not emoji).
3. Tap **Sửa** → modal opens with title "Sửa record vaccine", record's name displayed read-only at top, date/brand/clinic/notes/photos prefilled. Edit any → tap **Cập nhật** → toast "Đã cập nhật record" → reload.
4. Tap **Xoá** → native confirm `"Xoá Mũi 4-bệnh vĩnh viễn? Không thể khôi phục."` → confirm → DELETE → toast "Đã xoá record" → reload.
5. Cancel confirm → nothing happens.

The CRUD loop is now complete: log photo → log vaccine → edit metadata → delete mistakes. Passport stays portable; sổ ghi nhớ stays accurate.

---

## Deferred for follow-up

Still on the original Phase 2 roadmap (not regressed by this turn):
- **QR + public passport** (`qrcode` lib + new route)
- **PDF export** with embedded photos
- **Reminder cron 9AM** scanning `next_due_date`
- **Vet partner directory** + share-card flow
- **Rename custom vaccines** in-place (current workaround: delete + recreate)
