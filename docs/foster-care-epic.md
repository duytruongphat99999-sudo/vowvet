# EPIC — Foster Care (trải nghiệm sau tiền: browse · theo dõi pet · update feed)

Nối tiếp epic foster-payment (PR #37 — luồng tiền đã xong). Epic này lo phần TRẢI NGHIỆM: đưa pet lên nhận nuôi, sponsor theo dõi pet, chủ đăng update ảnh/video.

## 1. QUYẾT ĐỊNH ĐÃ CHỐT (đừng đề xuất lật)
- **HT1 (tài trợ + theo dõi)**: sponsor cho tiền, **chủ cũ GIỮ sở hữu**, sponsor xem pet như chủ + nhận update. ← epic này build.
- **HT2 (trao hẳn)**: giao pet luôn — dùng `transferPet` + `foster_handovers` ĐÃ CÓ. Epic này chỉ thêm đường *xin nhận* từ browse (W-G).
- **D1**: góp **BẮT BUỘC đăng nhập** (không còn góp ẩn danh).
- **D2**: sponsor xem **FULL sức khoẻ read-only** như chủ (BCS/pain/mobility/score…).
- **D3**: update = **FEED PER-PET** — chủ đăng 1 lần, MỌI sponsor của pet đó xem chung. → bảng mới `pet_updates`, KHÔNG dùng chat 1-1.

## 2. NGUYÊN TẮC (mọi wave)
- **Recon-first**: mỗi wave, ĐỌC file liên quan trên repo TRƯỚC khi sửa (tao/spec không có repo — file:dòng phải agent tự xác nhận). Báo insertion point rồi mới code.
- **Verify server thật**: sau sửa → `docker inspect vowvet-api StartedAt` mới hơn lần sửa; cũ → `docker restart vowvet-api`. e2e gọi thẳng `localhost:3000` trong container. **KHÔNG disk-probe** (`bun -e` import = đọc disk, không test server). Bài học epic tiền.
- **1 wave / lần**: verify PASS + Duy "OK" mới sang wave sau. KHÔNG gộp.
- **.astro đổi** → `docker compose up -d --build --no-deps vowvet-web` + bump `sw.js`; check StartedAt chỉ web recreate.

## 3. SCOPE + FILE CẤM

### FORBIDDEN — không mở, không sửa (bất kỳ wave nào)
- `api/src/lib/nutrition-engine.ts`, `api/src/lib/triage.ts` — hard-forbidden §4 CLAUDE.md.
- `.claude/scripts/*`.
- `api/src/middleware/require-vet.ts` — GATE (đụng = verify 4 chiều; epic này KHÔNG cần).

### CALL-ONLY — được import/gọi, KHÔNG sửa nội dung
- `api/src/lib/foster-transfer.ts` (`transferPet`) — W-G GỌI, không viết lại.
- `api/src/routes/reclaim-requests.ts`, `foster-reclaim.ts` — đọc để HỌC pattern (W-G), không edit.

### Được đụng (theo wave — agent recon vị trí chính xác)
- `web/src/pages/foster/browse.astro` (MỚI — W-E)
- `api/src/lib/foster-orders.ts` (W-A: +donor_user_id)
- `api/src/routes/public.ts` (W-A: foster-order require auth)
- `web/src/components/FosterCertificate.astro` (W-A: login-gate nút góp)
- `api/src/routes/pets.ts` (W-B: broaden GET gate; W-E/W-G: route list/request)
- `web/src/pages/pets/[id].astro` (W-B: render read-only sponsor; W-C: feed UI)
- `api/src/lib/pet-updates.ts` (MỚI — W-C/W-D: feed post/list + media)
- `api/src/routes/admin.ts` (W-F: override; W-G: duyệt adopt)
- `web/src/pages/admin/*` (W-F/W-G UI)
- `web/public/sw.js` (bump khi đụng .astro)
- `scripts/migrate-foster-care-*.ts` (MỚI — vehicle đổi Baserow, pattern như `migrate-foster-payment.ts`; ngoài SCOPE gốc → agent CONFIRM trước khi viết, như epic tiền)

## 4. BASEROW — cần tạo (per wave, migration additive idempotent)

**W-A** — `foster_orders` (721) +1 field:
| field | type |
|---|---|
| donor_user_id | number (nullable) |

**W-C** — bảng MỚI `pet_updates` (media cột sẵn từ đầu — W-D khỏi migrate lần 2):
| field | type |
|---|---|
| pet_id | number |
| author_user_id | number |
| content | text |
| media_url | text (nullable) |
| media_type | single select: image / video (nullable) |
| created_at | date (có giờ) |
| deleted_at | date (nullable) |

**W-G** (chỉ khi làm) — bảng MỚI `adoption_requests`:
| field | type |
|---|---|
| pet_id | number |
| requester_user_id | number |
| status | single select: pending / approved / rejected / cancelled |
| message | text (nullable) |
| created_at | date (có giờ) |
| decided_at | date (nullable) |
| decided_by | number (nullable) |
| deleted_at | date (nullable) |

## 5. WAVES

### W-E — Trang browse "pet cần foster" · độc lập · an toàn · thấy kết quả ngay
Cửa vào cho CẢ HT1 lẫn HT2. KHÔNG đụng tiền, KHÔNG file cấm.
- **Web** `foster/browse.astro` (MỚI): liệt kê pet `foster_public=true` (+ `foster_status`, `adoption_story`, ảnh). Mỗi card: "Xem chi tiết" + (HT2) "Xin nhận nuôi". **Bắt đăng nhập** (D1-style: page ngoài PUBLIC_PREFIXES → auto redirect /login).
- **API**: recon `listFosterPets` (`/public/foster`) — tái dùng được thì dùng; thiếu field cho browse thì thêm route `GET /pets/foster-browse` (auth) trong `pets.ts`. Lọc `foster_public=true` VÀ `deleted_at IS NULL`.
- `sw.js` bump.
- **Verify** (server thật): login → thấy đúng pet đã bật foster; pet chưa bật/riêng tư ẩn; chưa login → redirect login. e2e in-container.

### W-A — Nền donor-identity · ⚠ CHẶN toàn bộ HT1 · đụng code PR #37
- **Baserow**: +`donor_user_id`.
- `foster-orders.ts`: `createFosterOrder` lưu `donor_user_id`.
- `public.ts`: route `foster-order` **thêm `requireAuth` per-route** (như W5 my-supporters). Guest → **401**.
- `FosterCertificate.astro`: `/p/[slug]` vẫn XEM public, nhưng nút "Góp gói": chưa login → redirect `/login?next=<cert-url>`; đã login → proceed checkout.
- **Security lock**: `donor_user_id` LẤY TỪ session (`c.get("user").sub`), **KHÔNG** từ body client (không tin client gửi donor id).
- **Verify**: login góp → đơn có `donor_user_id` đúng sub; ẩn danh POST → 401; đơn cũ (test) donor_user_id=null (không grant gì — OK).

### W-B — Sponsor xem pet · ⚠ PRIVACY/ACCESS-CONTROL critical · đọc (không sửa) engine cấm
- **Quyền xem pet X** = `owner(X)` **HOẶC** tồn tại foster_order **paid** của X với `donor_user_id = user` (suy từ `foster_orders`, KHÔNG bảng mới). Helper `canViewPet(petId, userId)`.
- `pets.ts`: các route **GET** pet (profile + health sub: care-plan/pet-score/pain/mobility/cognitive/water/bcs) đổi gate từ `getOwnedPet` → `canViewPet` (owner OR sponsor). Engine files KHÔNG đụng — chỉ đổi gate ở route layer.
- `pets/[id].astro`: sponsor mở được → render **read-only**, **ẩn mọi nút sửa**.
- **Security lock (bắt buộc)**:
  1. CHỈ route **GET** nới gate. **MỌI route mutation (PATCH/POST/DELETE) giữ owner-only** — sponsor sửa pet → **403**. Liệt kê từng mutation route, xác nhận vẫn `getOwnedPet`.
  2. Sponsor status = có ≥1 order **paid** (`payment_status=paid`) cho pet đó, `donor_user_id=user`, `deleted_at IS NULL`. (Persistent — sponsor giữ quyền xem; không auto-hết-hạn ở epic này.)
  3. foster-view trả **data pet**, KHÔNG lộ pet KHÁC của chủ, KHÔNG PII chủ, KHÔNG field tiền/beneficiary.
- **Verify** (server thật): sponsor của pet → xem full health OK; user KHÔNG phải sponsor → **403**; sponsor gọi PATCH pet → **403**; sponsor KHÔNG thấy pet khác của chủ.

### W-C — Feed update per-pet · chặn bởi W-A/W-B
- **Baserow**: bảng `pet_updates` (media cột nullable sẵn).
- `pet-updates.ts` (MỚI): `postUpdate(petId, authorSub, content)` (author phải là **owner** pet) + `listUpdates(petId, viewerSub)` (viewer = owner OR sponsor — reuse `canViewPet`).
- Routes: `POST /pets/:id/updates` (owner-only) + `GET /pets/:id/updates` (owner+sponsor).
- `pets/[id].astro`: tab/khu "Cập nhật" — chủ đăng text; sponsor xem feed (read-only). Chỉ dấu "update mới".
- **Security lock**: post = owner-only (sponsor đăng → 403); list = `canViewPet`; soft-delete filter.
- **Verify**: chủ đăng 1 update → 2 sponsor của pet đều thấy; user ngoài → 403 cả đọc/ghi; sponsor đăng → 403.

### W-D — Ảnh/video trong feed · chặn bởi W-C
- `pet-updates.ts`: `postUpdate` nhận `media_url`+`media_type`; upload qua R2 (đã có cho pet photo — recon endpoint upload hiện tại, tái dùng).
- `pets/[id].astro`: chủ đính ảnh/video; feed render media.
- **Security lock**: validate type (image/video) + kích cỡ; upload owner-only; URL R2 hợp lệ (không nhận URL ngoài tuỳ tiện).
- **Verify**: chủ gửi ảnh + video → lưu + hiện trong feed sponsor; quá cỡ/sai định dạng → chặn; sponsor upload → 403.

### W-F — Admin override foster · độc lập · nhỏ
- `admin.ts`: admin bật/tắt `foster_public` bất kỳ pet + set `foster_status`. Reuse `requireAuth+requireAdmin`.
- `admin/*`: UI trong màn quản pet/foster.
- **Verify**: admin bật foster cho pet của user khác → OK; user thường gọi route admin → 403.

### W-G — HT2: xin nhận nuôi từ browse · độc lập (transfer đã có)
- **Baserow**: bảng `adoption_requests`.
- Đọc pattern `reclaim-requests.ts` (KHÔNG sửa) → build song song `adoption-requests`: user bấm "Xin nhận" (W-E) → tạo request `pending` → chủ/admin duyệt → **GỌI `transferPet`** (import từ `foster-transfer.ts`, KHÔNG sửa file đó) → đổi chủ.
- **Security lock**: 1 request/user/pet đang pending (chống spam); chỉ chủ pet HOẶC admin duyệt; transfer chỉ chạy khi request `approved`; idempotent (approved rồi → no-op).
- **Verify**: xin nhận → chủ duyệt → `transferPet` chạy, pet đổi chủ, request=approved; duyệt lần 2 → no-op; user lạ duyệt → 403.

## 6. DEPENDENCY

```
W-E (browse) ──── độc lập, LÀM TRƯỚC (thấy ngay, cửa vào)
W-A (donor id) ── CHẶN nhánh HT1
   └─ W-B (xem pet) ── W-C (feed) ── W-D (media)
W-F (admin override) ── độc lập, xen bất kỳ lúc
W-G (adopt request) ─── độc lập, xen bất kỳ lúc
```

Thứ tự chạy chốt: **W-E → W-A → W-B → W-C → W-D**, W-F/W-G xen khi rảnh.

## 7. LUẬT CHUNG (mọi wave)
- **Soft-delete**: mọi query list lọc `deleted_at IS NULL`.
- **Auth nguồn**: mọi `user_id/sub` lấy từ session, KHÔNG từ body client.
- **Read-only sponsor** (xuyên W-B/C/D): sponsor KHÔNG BAO GIỜ mutate pet của chủ — mọi ghi = owner-only. Đây là lock an toàn cốt lõi của epic.
- **Container-stale**: verify gọi server thật + StartedAt; không disk-probe.
- **Git**: add TỪNG file (không `add .`); message VN `git commit -F`; KHÔNG commit `.env`/`baserow-config.json`/`CONTEXT_SYNC.md`/`data`. Push `auto/*`, Duy merge. Migration script COMMIT (như payment epic).
- **Baserow prod**: migration additive-only, guard từng field, idempotent; `baserow-config.json` cập nhật local (gitignored) → máy khác chạy lại migration.
