# CONTEXT SYNC — 2026-07-08 ~14:45

## 🎯 ĐANG LÀM GÌ
VowVet: platform quản lý pet (passport, foster, trao bé).
Phiên này: fix + hoàn thiện 3 feature — badge admin đa-admin (#4), vô hiệu hoá user (#5),
user↔user foster chat (#3). Gỡ 1 admin thừa khỏi env.

## ✅ ĐÃ XONG PHIÊN NÀY (đã commit, LOCAL — chưa push)

### #4 Badge admin đa-admin — commit 6568ec4
- `conversations.ts` `getAdminSupportUnread`: đếm theo `sender_id === conv.user1_id`
  (user thường) thay vì `!== adminId` → admin A không còn thấy tin admin B là "chưa đọc".

### #5 Vô hiệu hoá user — commit 6568ec4
- **LỖI GỐC ở list, không phải nút/route**: `admin.ts` GET /users thiếu lọc deleted_at
  → user disabled vẫn hiện. Fix: thêm `&& !u.deleted_at` (copy pattern pets list).
- `admin/users/[id].astro`: nút "Vô hiệu hoá" + wire POST /admin/users/:id/disable.
- Route disable đã có sẵn từ trước (admin.ts:557) → không đụng.

### #3 User↔user foster chat — commit a37da10
- `conversations.ts`: +endpoint `POST /conversations/foster {handover_id}`
  → get-or-create foster conv (idempotent, vá cả transfer cũ fire-and-forget lỡ chưa tạo).
  Guard: chỉ giver/receiver/admin (403 outsider, 400 bad input, 404 không tồn tại).
- `users.ts`: +endpoint `GET /me/foster-received` → handover mình là receiver ≤7 ngày
  → `[{handover_id, pet_name, giver_name, created_at}]`. Mirror reclaim-summary, KHÔNG schema.
- `pets/[id].astro` step 3 success (GIVER): ✓ xanh + "Đã trao [bé]" + nút "Nhắn cho
  người nhận" (→ /conversations/foster → /messages/:id) + nút "Về trang chính".
  Bỏ auto-redirect 1.6s, bắt `new_owner` + `handover_id` (trước bị vứt).
- `dashboard.astro` (RECEIVER): card "Bạn vừa nhận bé X từ Y" (gradient blue→emerald,
  icon paw, nút "Nhắn tin" → B1 → chat, ✕ dismiss `sessionStorage['dismissed_fosters']`).
  Copy cơ chế card reclaim amber.
- SW v336.
- Backend conv/header/list đã generic từ trước → chỉ thiếu entry point 2 phía, đã bù đủ.

### Env — admin gỡ còn 1 (KHÔNG commit — .env gitignored)
- `ADMIN_PHONES`: `+84939233398,+84779029133` → chỉ còn `+84779029133` (user 24).
- +84939233398 (user 6) hết quyền admin (verify: is_admin=false, /admin 403).
- Đây là cấu hình 2 admin cố ý từ trước, KHÔNG phải bug. Gỡ theo yêu cầu.

## 🚧 ĐANG DỞ
- KHÔNG có code dở — 3 commit sạch, working tree clean.
- ⚠️ CHƯA PUSH: toàn bộ commit phiên này (+ đầu phiên) còn local.
- ⚠️ CHƯA MẮT-TEST THẬT: #3 giver/receiver + #4 badge mới verify data+build, chưa eyeball
  qua login (trang gated + HttpOnly → không render test qua wget được).

## 🎯 VIỆC TIẾP THEO
1. **PUSH** lên remote (nhiều commit local dồn).
2. **#2 Dọn user/pet test** — CẦN Duy xác nhận list + quyết soft/hard delete.
   ⚠️ List cũ dưới đã STALE sau phiên test (user 18 đã soft-deleted trong phiên,
   có tạo/xoá vài handover test) → PHẢI verify lại trước khi xoá.
   List sơ bộ cũ (verify lại):
   - Xoá: pet 1,2,9,11,13,14 + user 1,2,3,7,9,11,12,13,14,15,16
   - User 5,8,17,19,20,21 (phone-only, 0 pet) — Duy quyết
   - KHÔNG xoá: user 4,6,10,18,22,23,24
3. **TEST E2E MẮT THẬT** (Duy login):
   - #3 giver: trao bé thật → màn ✓ xanh + 2 nút đúng mockup? nút chat mở đúng?
   - #3 receiver: login tài khoản nhận → card "bé mới nhận" hiện? nút + ✕ chạy?
   - #4 badge: nhắn tin mới → badge +1 → admin mở → về 0?
4. **#6 Feedback/rating** (tương lai).

## 📌 QUYẾT ĐỊNH KỸ THUẬT
- Foster chat: dùng chung conversations table + polling 5s (như admin_support).
  type="foster", context_id = handover_id.
- Endpoint foster get-or-create nhận `handover_id` (KHÔNG pet_id — 1 bé trao nhiều lần).
- Card receiver: window 7 ngày + dismiss sessionStorage (KHÔNG field DB → tránh schema
  change; tái xuất phiên sau trong 7 ngày — chấp nhận được).
- Icon card = paw line-art (handover không lưu species → khỏi lookup pets, đúng §9).
- Admin check: `ADMIN_PHONES.includes(session.phone)`, exact match, format +84xxx.

## ⚠️ LƯU Ý / CẠM BẪY (QUAN TRỌNG — máy này)
- ⛔ **Sửa api/**/*.ts → PHẢI `docker restart vowvet-api`.** `bun --watch` KHÔNG reload
  trên Windows bind-mount → process chạy code CŨ. (Đã trả giá phiên này: fix #5 tưởng
  xong mà list vẫn hiện user disabled vì server chưa nạp code mới.)
- ⛔ **Sửa .env → PHẢI `docker compose up -d --force-recreate vowvet-api vowvet-web`.**
  `docker restart` KHÔNG nạp lại .env (baked lúc tạo container). Cả api + web đọc
  ADMIN_PHONES → recreate CẢ 2.
- Sửa .astro → `rebuild --build vowvet-web` + bump SW.
- .env gitignored (.gitignore:14 `.env*`) → KHÔNG commit, chứa nhiều secret.
- `[id].astro` trong `git add` PHẢI quote `"..."` → bash/git hiểu `[id]` là glob → add trượt.
- Foster conv tạo fire-and-forget (foster-transfer.ts:90) → convId KHÔNG lưu vào handover
  → entry point phải get-or-create qua endpoint, không giả định có sẵn convId.

## 📂 FILE ĐỤNG PHIÊN NÀY

```
api/src/routes/conversations.ts      — +endpoint /conversations/foster (B1)
api/src/routes/users.ts              — +endpoint /me/foster-received (B3)
api/src/routes/admin.ts              — GET /users lọc deleted_at (#5)
api/src/lib/conversations.ts         — getAdminSupportUnread theo user1_id (#4)
web/src/pages/pets/[id].astro        — nút giver step 3 (B2)
web/src/pages/dashboard.astro        — card receiver (B3)
web/src/pages/admin/users/[id].astro — nút vô hiệu hoá + wire (#5)
web/public/sw.js                     — v336
.env (root, KHÔNG commit)            — ADMIN_PHONES còn 1 số
```

## COMMIT PHIÊN NÀY (LOCAL, chưa push)

```
a37da10 — feat #3 foster chat (endpoint foster conv + nút giver + card receiver, SW v336)
6568ec4 — fix #4 badge đa-admin + #5 vô hiệu hoá user
129e4ee — fix(ux) nút Hỗ trợ label kiểu B + nút Quay lại chat + SW v334
de01919 — feat chat user /messages + dashboard entry + SW (đầu phiên)
20cc17e — feat admin dashboard (đầu phiên)
2655e13 — feat backend chat + reclaim + admin API (đầu phiên)
```
