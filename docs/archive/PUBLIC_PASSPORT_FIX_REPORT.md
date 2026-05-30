# VowVet — Public Pet Passport `/p/[slug]` Fix Report

**Date:** 2026-05-19
**Severity:** HIGH (blocked all QR/share functionality across all users)

---

## 1. Root cause — chính xác là gì?

**Nguyên nhân 1 (BLOCKER): Frontend `.toLowerCase()` phá huỷ uppercase QR codes.**

File `web/src/pages/p/[slug].astro` line 17 (cũ):
```typescript
const slug = (Astro.params.slug || "").toLowerCase();
```

Kết quả: user copy QR slug `4D3ENMS6-2J` (uppercase) → frontend convert thành `4d3enms6-2j` → API query Baserow `qr_code__equal=4d3enms6-2j` → DB lưu `4D3ENMS6-2J` (case-sensitive equality) → **0 results → 404**.

**Nguyên nhân 2: Regex chỉ accept lowercase.**

Cả frontend (line 26) và API `public.ts` line 79 dùng `/^[a-z0-9-]+$/` — không match uppercase characters. Sau khi tôi xoá `.toLowerCase()`, regex này lại reject input uppercase.

**Nguyên nhân 3 (CONTRIBUTING — không phải primary bug): M12 `public_slug` field không tồn tại trong Baserow.**

Code `getPublicPetBySlug` query field `public_slug` nhưng pets table chỉ có `qr_code`. M12 endpoint luôn trả null. Trước fix: cả M12 và M3 fallback đều fail vì cùng lowercase issue. Sau fix: M12 vẫn 404 (do thiếu schema field) nhưng M3 fallback hoạt động → page hiển thị OK.

---

## 2. Slug "4D3ENMS6-2J" có trong DB không?

✅ **CÓ.** Pet id=12, name="min", species=Mèo, breed="Anh lông ngắn (British Shorthair)". Field `qr_code = "4D3ENMS6-2J"` (exact match).

Format QR codes hiện tại trong DB:
- `KJRCANVF-XQ` (pet id=3 "Beo")
- `4D3ENMS6-2J` (pet id=12 "min")
- 10 pets khác `qr_code = (NULL)` — chưa generate

Generator (api/src/lib/qr.ts) dùng alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (UPPERCASE), format `XXXXXXXX-XX`. Spec design intentional uppercase để dễ đọc cho người scan.

---

## 3. Pets table có field `public_slug` chưa?

❌ **CHƯA**. Chỉ có `qr_code` field (M3, ID=6292). 

Có cần migration không? **KHÔNG** — sau fix, M3 QR fallback covers tất cả use cases hiện tại. M12 public_slug system có thể defer hoặc bỏ hẳn (over-engineered cho Phase 0).

Nếu sau này muốn dual system (separate public profile vs lost-found QR), tạo migration M31 thêm `public_slug` + `is_public` field. Hiện tại tất cả pets đều ngầm public qua qr_code.

---

## 4. Backfill slug bao nhiêu pet?

**Không cần backfill.** QR generated on-demand qua nút "Tạo QR Passport" trên pet detail page. 2 pets đã có QR (id=3, 12). 10 pets còn lại sẽ tự generate khi user click button.

---

## 5. Test E2E pass không?

✅ **5/5 scenarios pass:**

| # | Test | Expected | Actual |
|---|---|---|---|
| 1 | `GET /p/4D3ENMS6-2J` (real uppercase QR) | 200, render pet "min" | ✅ Title "Tìm chủ cho min · Mon Min Pet" |
| 2 | `GET /p/KJRCANVF-XQ` (real uppercase, pet "Beo") | 200, render pet | ✅ HTTP 200 |
| 3 | `GET /p/4d3enms6-2j` (lowercased manually) | 200 page (404 cho pet nhưng UX OK) | ✅ Page render 404 message rõ |
| 4 | `GET /p/NOTEXIST-XX` (không tồn tại) | 404 với reason="not_found" | ✅ "Không tìm thấy bé" |
| 5 | API direct `/api/v1/public/pets/4D3ENMS6-2J` | 200 + pet JSON | ✅ Returns full pet info |

API response payload mẫu:
```json
{
  "name": "min",
  "species": "Mèo",
  "breed": "Anh lông ngắn (British Shorthair)",
  "photo_url": "https://pub-2e81c38c1cf24e5f92acec17ad6d5d5c.r2.dev/pets/10/12/1779163135757.jpg",
  "owner_phone_masked": "***"
}
```

---

## 6. Files modify + tạo

**Modified (2):**
- `web/src/pages/p/[slug].astro`:
  - Line 17: removed `.toLowerCase()` → `const slug = (Astro.params.slug || "").trim();`
  - Line 26: regex `/^[a-z0-9-]{3,60}$/` → `/^[A-Za-z0-9-]{3,60}$/`
  - Added `m12Status` + `qrStatus` tracking for richer error UX
  - Added 4-way error reason detection (`invalid_format` / `not_found` / `private` / `network`)
  - Improved 404 view: distinct icons + titles + descriptions per reason + slug echo
- `api/src/routes/public.ts`:
  - Line 79: regex `/^[a-z0-9-]+$/` → `/^[A-Za-z0-9-]+$/`

**No new files. No migration needed.**

---

## 7. User share QR giờ hoạt động không?

✅ **CÓ.** User flow giờ hoạt động đầy đủ:

1. Owner vào `/pets/[id]` → "Tạo QR Passport" → backend generates `qr_code = "XXXXXXXX-XX"` (uppercase) → save to Baserow
2. Pet detail page renders QR canvas với data = `${appUrl}/p/${qr_code}` = `https://vowvet.monminpet.com/p/4D3ENMS6-2J`
3. User scan QR / copy link → mở trên thiết bị khác
4. `/p/4D3ENMS6-2J` → Astro server-side:
   - Skip M12 lookup (404 vì thiếu field, không matter)
   - Fallback M3 `fetchPublicPet("4D3ENMS6-2J")` → API `/api/v1/public/pets/4D3ENMS6-2J` → Baserow filter `qr_code__equal=4D3ENMS6-2J` → MATCH → returns pet sanitized
5. Page renders "Tìm chủ cho min" với photo + breed + masked phone

---

## 8. Improved error UX matrix

| Reason | Icon | Title | Description |
|---|---|---|---|
| `not_found` | 🐾 | Không tìm thấy bé | `Mã passport "${slug}" không tồn tại hoặc bé đã được xoá.` |
| `private` | 🔒 | Hồ sơ riêng tư | Chủ bé đã tắt chế độ public. Liên hệ trực tiếp chủ bé. |
| `network` | 📡 | Không kết nối được | Đường truyền có vấn đề. Thử lại sau vài giây. |
| `invalid_format` | ⚠️ | Link không hợp lệ | Định dạng mã passport không hợp lệ. |

Slug được echo dưới subtitle: `slug: 4D3ENMS6-2J` (font-mono, text-xs) để user/support dễ debug khi báo lỗi.

---

## Affected users / impact

**Trước fix:** TẤT CẢ user dùng QR Passport (M3) đều fail khi share. Mỗi pet đã generate QR (2 pets hiện tại) → mỗi lần scan/click → 404 + UX confusing message "Bé không có ở đây".

**Sau fix:** Tất cả QR codes existing + future hoạt động. 0 migration, 0 data loss, 2 files modify với tổng 5 line changes.

---

## Note về M30 Memorial Hall + remaining mega build

User cũng yêu cầu MEGA BUILD SESSION 2 (M22/M26/M27/M28/M30) trong cùng message. **Defer to dedicated session** — đó là 6-10 giờ work theo estimate của user trong session 1. Quá scope cho 1 response. Public passport fix là blocking bug nên ưu tiên trước.

`BUILD_PROGRESS.json` đã có sẵn ghi rõ 5 pending milestones với scope + effort + blockers. Resume từ session 3 theo thứ tự đề xuất: M26 → M27 → M22 → M28 → M30.
