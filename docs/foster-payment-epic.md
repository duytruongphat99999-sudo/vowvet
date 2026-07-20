# EPIC — Foster Payment (PayOS thu + chi, mock-first)

## 1. Mục tiêu
Donor góp gói nuôi → tiền vào tài khoản MonMin (PayOS Thu) → admin VowVet duyệt → app tự chi tới STK người nuôi (PayOS Chi) → ghi sổ đầy đủ, admin nắm hết. Chủ bé xem được ai đã góp.

## 2. NGUYÊN TẮC CHỐT (đọc trước khi code)
- **Mock-first**: PayOS nằm sau 1 adapter (`api/src/lib/payos.ts`) có công tắc `PAYOS_MODE=mock|live`. Build + verify TOÀN BỘ luồng ở mock (không cần key). Khi có MSB+PayOS: điền env, đổi `mock→live`, xong. KHÔNG sửa route/UI.
- **Cổng duyệt**: tiền VÀO tự log; tiền RA chỉ khi admin bấm "Duyệt & chuyển". KHÔNG bao giờ auto-chi khi nhận tiền.
- **Idempotency (money-critical)**: 1 đơn chỉ chi 1 lần. Guard bằng `payout_status` + khóa `order_id` trước mọi lệnh chi. Double-chi = mất tiền thật → coi như gate, verify cứng.
- **Framing pháp lý** (đã bàn): tiền donor = doanh thu MonMin cho chương trình foster; người nuôi = cộng tác viên MonMin chi trả. Code không mô tả "chuyển hộ tiền người A→B".

## 3. SCOPE LOCK
**Được đụng:**
- `api/src/lib/payos.ts` (MỚI)
- `api/src/lib/foster-orders.ts`
- `api/src/routes/public.ts` (đơn góp + webhook thu)
- `api/src/routes/admin.ts` (duyệt + chi)
- `web/src/components/FosterCertificate.astro` (modal donor → redirect PayOS)
- `web/src/pages/admin/foster-orders.astro` (màn duyệt)
- `web/src/pages/foster/my-supporters.astro` (MỚI — chủ bé xem donor)
- `web/src/lib/foster-packages.ts` (bỏ comment placeholder)
- `web/public/sw.js` (bump version — chỉ khi đụng .astro)

**CẤM đụng:** `nutrition-engine.ts`, `triage.ts`, `require-vet.ts`, `.claude/scripts`, `foster-transfer.ts`, `foster-reclaim.ts`, `reclaim-requests.ts` (logic trao/lấy pet ĐÃ xong, đừng động).

## 4. ENV thêm (KHÔNG commit .env)

```
PAYOS_MODE=mock                 # mock | live
# THU (điền khi có PayOS)
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
# CHI — Kênh Chi (kích hoạt riêng, key khác thu)
PAYOS_PAYOUT_CLIENT_ID=
PAYOS_PAYOUT_API_KEY=
# domain nhận webhook (đã có tunnel)
PAYOS_RETURN_URL=https://vowvet.monminpet.com/foster/thanks
```

## 5. BASEROW — field thêm (tạo qua Baserow API/UI, không phải SQL)
**Bảng `foster_orders`** (giữ nguyên `package_price`, `status`, `donor_name`; thêm):
| field | type | ghi chú |
|---|---|---|
| payment_status | single select: pending / paid / failed | mặc định pending |
| amount_paid | number (integer, VND) | tiền donor đã trả |
| paid_at | date (có giờ) | |
| pay_ref | text | mã tham chiếu ngân hàng |
| payos_order_code | number | orderCode PayOS (thu) — khóa map webhook |
| beneficiary_user_id | link → users (hoặc number) | người nuôi nhận tiền |
| beneficiary_bank_bin | text | mã BIN ngân hàng |
| beneficiary_account_no | text | STK |
| beneficiary_account_name | text | tên chủ TK |
| payout_amount | number (integer, VND) | admin nhập, ≤ amount_paid, default = amount_paid |
| payout_status | single select: none / pending / sent / success / failed | mặc định none |
| payout_ref | text | payoutId PayOS (chi) |
| payout_at | date (có giờ) | |
| approved_by | text | admin id/tên |
| approved_at | date (có giờ) | |

**Bảng `users`** (bank profile — optional):
| field | type |
|---|---|
| bank_bin | text |
| bank_account_no | text |
| bank_account_name | text |

## 6. PAYOS ADAPTER — `api/src/lib/payos.ts`
1 file, mọi call PayOS đi qua đây. Mock trả kết quả giả đồng bộ; live gọi API thật.

```ts
// PAYOS_MODE = mock | live
export interface PayLink { checkoutUrl: string; orderCode: number; qr?: string }
export interface PayoutResult { payoutId: string; status: 'sent'|'success'|'failed' }

createPaymentLink(order): PayLink
  // mock: orderCode = order.id, checkoutUrl = `/dev/mock-pay/${orderCode}`
  // live: POST payos tạo link thanh toán (Napas 247 VietQR)

verifyThuWebhook(payload, sig): { orderCode, amount, ref } | null
  // mock: bỏ qua chữ ký, đọc thẳng payload
  // live: verify checksum PAYOS_CHECKSUM_KEY

createPayout({bin, accountNo, accountName, amount, ref}): PayoutResult
  // mock: trả {payoutId:`mock-${ref}`, status:'success'} ngay
  // live: POST Kênh Chi — tạo lệnh chi đơn

getPayoutStatus(payoutId): 'sent'|'success'|'failed'
  // mock: 'success' ; live: GET trạng thái lệnh chi
```

## 7. WAVES (DAG — W2..W5 phụ thuộc W1; W3 phụ thuộc W2; W4 phụ thuộc W3)

### W1 — Adapter + mock endpoint
- Tạo `payos.ts` (4 hàm trên, cả nhánh mock + khung live TODO).
- Mount `POST /dev/mock-pay/:orderCode` **CHỈ khi `PAYOS_MODE=mock`** (live → route không tồn tại → 404). Endpoint này giả webhook thu để test.
- **Verify**: `PAYOS_MODE=mock` → gọi 4 hàm trả kết quả giả; set `live` → `/dev/mock-pay` trả 404.

### W2 — Thu (tạo link + nhận tiền)
- `foster-orders.ts`: sau khi tạo pledge, sinh link qua `createPaymentLink`, lưu `payos_order_code`.
- `public.ts`: `POST /public/foster-order` trả về `checkoutUrl`. Thêm `POST /public/payos/webhook-thu` → `verifyThuWebhook` → tìm đơn theo `payos_order_code` → set `payment_status=paid, amount_paid, paid_at, pay_ref`.
- `FosterCertificate.astro`: `proceed()` BỎ copy-Zalo, chuyển hướng donor tới `checkoutUrl`. (giữ link Zalo nhỏ "cần hỗ trợ").
- `foster-packages.ts`: xóa comment "chưa nối thanh toán".
- **Verify e2e**: tạo đơn → nhận `checkoutUrl` → gọi `/dev/mock-pay/:code` → đơn `payment_status=paid`, `amount_paid` đúng.

### W3 — Admin duyệt + chi
- `admin/foster-orders.astro`: đơn `paid` hiện block người thụ hưởng, prefill STK từ `users.bank_*` (sửa được). Nút "Duyệt & chuyển" → `PATCH /admin/foster-orders/:id/payout` với `{bin, accountNo, accountName, payout_amount}`.
- `admin.ts`: route payout —
  - guard: đơn phải `payment_status=paid` VÀ `payout_status ∈ {none, failed}` (else 409, chặn double-chi).
  - `payout_amount ≤ amount_paid` (else 400).
  - snapshot STK vào `beneficiary_*`, set `approved_by/approved_at`.
  - gọi `createPayout` → set `payout_status=sent, payout_ref, payout_at`.
- **Verify e2e**: đơn paid → duyệt → `payout_status` chuyển (mock → sent), bấm lần 2 → 409.

### W4 — Xác nhận chi thật
- `public.ts`: `POST /public/payos/webhook-chi` HOẶC job poll `getPayoutStatus` → cập nhật `payout_status = success|failed`.
- `admin/foster-orders.astro`: hiện trạng thái cuối.
- **Verify**: mock → `sent`→`success`; nhánh `failed` mở lại cho duyệt lại.

### W5 — Chủ bé xem donor
- `foster/my-supporters.astro` (MỚI): chủ bé (owner của pet) thấy danh sách đơn `paid` của bé mình: `donor_name`, `amount_paid`, gói, ngày, `payout_status`.
- `public.ts` hoặc route auth: `GET /foster/my-supporters` (đăng nhập, chỉ owner) → đơn where `pet.user_id = current user` VÀ `deleted_at IS NULL`.
- KHÔNG lộ STK/thông tin nhạy cảm; KHÔNG thấy đơn của bé người khác.
- **Verify**: owner chỉ thấy donor của bé mình; user khác 403/rỗng.

## 8. LUẬT CHUNG XUYÊN SUỐT
- **Soft-delete**: mọi query list lọc `deleted_at IS NULL` (bài học cũ: `findUserById` từng quên lọc).
- **Số tiền**: integer VND, không thập phân (Baserow number).
- **Container stale**: sau sửa → verify gọi THẲNG server đang chạy (`localhost:3000` trong container) + `docker inspect vowvet-api StartedAt`. Cũ hơn lần sửa → `docker restart vowvet-api`. Đụng .astro → `docker compose up -d --build --no-deps vowvet-web` + bump `sw.js`.
- **Git**: add TỪNG file (không `add .`); message tiếng Việt dùng `git commit -F <file>`; KHÔNG commit `.env`/`baserow-config.json`/`CONTEXT_SYNC.md`/`data`. Push `auto/*`, Duy tự merge main.
- Đụng `require-vet.ts`? KHÔNG (ngoài scope). Nếu bắt buộc chạm gate → verify 4 chiều.

## 9. ROLLOUT KHI MSB + PAYOS XONG (checklist gắn vào)
1. PayOS: kích hoạt Kênh Chi (Thiết lập > Hồ sơ > Thay đổi dịch vụ), xác thực tổ chức, liên kết TK MSB, set hạn mức + whitelist IP server.
2. Lấy Client ID/API Key **thu** và **chi** (2 bộ khác nhau) + Checksum key thu.
3. Điền 6 biến env ở §4, set `PAYOS_MODE=live`.
4. Cấu hình webhook URL trên portal PayOS trỏ về `/public/payos/webhook-thu` (và webhook-chi nếu dùng).
5. **XÁC NHẬN với PayOS trước khi chạy thật**: (a) tiền thu có tự sang quỹ Chi không hay phải nạp quỹ chi riêng; (b) hạn mức/KYC khi chi tới STK cá nhân.
6. `docker restart vowvet-api` → chạy 1 đơn thật số tiền nhỏ (vd 10k) end-to-end trước khi mở cho user.

**W4 — đối soát chi (xác nhận trước khi tin reconcile/webhook-chi ở live):**
7. **Kênh Chi query trạng thái theo merchant ref (`foster-<order_code>`) được không?** KHÔNG → đơn `pending` (mất response) KHÔNG tự resolve được → admin đối soát tay trên portal PayOS (ghi rõ giới hạn, KHÔNG giả vờ auto).
8. **Kênh Chi có đẩy webhook kết quả chi không, hay chỉ cho query?** KHÔNG đẩy → `webhook-chi` thành dead-code ở live, chỉ `reconcile` (poll) chạy.
9. **Re-submit ref đã `failed`** — PayOS Kênh Chi chấp nhận re-chi cùng `ref=foster-<order_code>` hay báo trùng? Báo trùng → re-pay sau failed cần ref mới (đổi scheme) hoặc chi tay.
