# Zalo ZNS Setup Guide — VowVet

**Mục tiêu:** Switch từ mock OTP (console log) sang real Zalo ZNS để OTP đến điện thoại user thật.

**Trạng thái hiện tại (mặc định):** `ZALO_MODE=mock` → free, dev/pilot OK, OTP in vào docker logs.

Sau khi hoàn tất các bước dưới đây, đổi 1 dòng env và OTP đi thẳng tới điện thoại user qua app Zalo.

---

## Bước 1 — Verify Official Account (OA)

VowVet OA: **`1293160799920765896`** (đã có sẵn trong `.env` → `ZALO_OA_ID`)

1. Vào https://oa.zalo.me/
2. Đăng nhập bằng tài khoản Zalo của bạn (chủ OA)
3. Kiểm tra OA đã được verify chưa:
   - Có badge xanh "Đã xác thực" → OK, qua Bước 2
   - Chưa verify → click "Xác thực OA" → upload giấy phép kinh doanh hoặc CMND chủ OA → đợi Zalo duyệt (1-3 ngày)

**Lưu ý:** OA chưa verify → không thể tạo ZNS app, không thể gửi OTP thật.

---

## Bước 2 — Tạo App ZNS tại developers.zalo.me

1. Vào https://developers.zalo.me/
2. Login (cùng tài khoản chủ OA)
3. Click **"Tạo ứng dụng mới"** → chọn loại **"ZNS"** (Zalo Notification Service)
4. Điền thông tin app:
   - Tên app: `VowVet OTP`
   - Mô tả: `Gửi OTP đăng nhập cho ứng dụng VowVet by Mon Min Pet`
   - Link OA: chọn OA `1293160799920765896` từ dropdown
5. Submit → Zalo cấp:
   - **App ID** (số ~16 digits) → đây là `ZALO_ZNS_APP_ID`
   - **Secret Key** (string dài) → đây là `ZALO_ZNS_SECRET_KEY`

Copy 2 giá trị này, paste vào `.env` của VowVet (Bước 4).

---

## Bước 3 — Tạo Template OTP + lấy Access Token

### 3.1 Tạo template

1. Trong app vừa tạo, vào tab **"Templates"** → **"Tạo template mới"**
2. Chọn loại template: **OTP** (verification code)
3. Nội dung template (ví dụ):
   ```
   Mã OTP đăng nhập VowVet của bạn là: {{otp}}.
   Mã có hiệu lực 5 phút. Tuyệt đối không chia sẻ với người khác.
   ```
   - Variable bắt buộc: `{{otp}}` (sẽ được code Vowvet truyền vào)
4. Submit template → đợi Zalo duyệt (vài giờ - 24h)
5. Sau khi duyệt: lấy **Template ID** (số) → đây là `ZALO_ZNS_TEMPLATE_ID`

### 3.2 Lấy Access Token

Zalo OAuth flow để có ZNS access_token kéo dài 90 ngày:

1. Trong developers.zalo.me, vào app → **"OAuth"** tab
2. Generate authorization URL với scope `id_oa`:
   ```
   https://oauth.zaloapp.com/v4/oa/permission?app_id=<YOUR_APP_ID>&redirect_uri=<YOUR_REDIRECT>&state=<STATE>
   ```
3. Mở URL trong browser → consent → Zalo redirect kèm `code` query param
4. Đổi `code` lấy access_token (one-shot, dùng `curl`):
   ```bash
   curl -X POST https://oauth.zaloapp.com/v4/oa/access_token \
     -H "secret_key: <YOUR_SECRET_KEY>" \
     -F "code=<CODE_FROM_REDIRECT>" \
     -F "app_id=<YOUR_APP_ID>" \
     -F "grant_type=authorization_code"
   ```
5. Response chứa `access_token` (string ~150 chars) → đây là `ZALO_ZNS_ACCESS_TOKEN`

**Refresh:** Token này valid 90 ngày. Có thể refresh bằng `refresh_token` trong cùng response. (Phase 0: manually refresh — sẽ set cron tự động trong Phase 1.)

---

## Bước 4 — Nạp credit Zalo

Zalo tính phí mỗi OTP gửi qua ZNS. Giá ước tính:

| Mức gói | Đơn giá/OTP | Ghi chú |
|---|---|---|
| Pay-as-you-go | ~300đ | Không cam kết, nạp nhỏ |
| Gói 5,000 OTP | ~250đ | Tiết kiệm ~17% |
| Gói 50,000 OTP | ~200đ | Tiết kiệm ~33% |

(Giá thực sự xem tại https://business.zalo.me/zns/billing)

1. Vào https://business.zalo.me/zns/billing
2. Chọn gói phù hợp (recommend: pay-as-you-go cho tháng đầu để test traffic)
3. Thanh toán qua ngân hàng / Momo / ZaloPay
4. Credit sẽ active trong ~30 phút

---

## Bước 5 — Cấu hình env vars

Mở `C:\docker\vowvet\.env`, set 4 giá trị (đã có placeholder rỗng):

```env
ZALO_OA_ID=1293160799920765896          # đã có sẵn
ZALO_ZNS_APP_ID=<paste App ID từ Bước 2>
ZALO_ZNS_SECRET_KEY=<paste Secret Key từ Bước 2>
ZALO_ZNS_ACCESS_TOKEN=<paste Access Token từ Bước 3.2>
ZALO_ZNS_TEMPLATE_ID=<paste Template ID từ Bước 3.1>

# Khi sẵn sàng, đổi dòng này:
ZALO_MODE=zns_real
```

**LƯU Ý:** `.env` không commit lên git (đã trong `.gitignore`). Backup credentials riêng (e.g., 1Password).

---

## Bước 6 — Restart container

```powershell
cd C:\docker\vowvet
docker compose -f docker/docker-compose.yml restart vowvet-api
```

---

## Bước 7 — Verify

### Cách 1: trang admin

1. Login VowVet (admin phone: `+84779029133`)
2. Vào https://vowvet.monminpet.com/admin/zalo-status
3. Xem card "Chế độ hiện tại":
   - Mode `zns_real` (chữ uppercase màu cam/xanh)
   - "Real ZNS active" (badge xanh) → ✅ ready
   - Hoặc "Real ZNS mode set BUT credentials incomplete" → kiểm tra lại env
4. Bấm "Gửi OTP thử" với SĐT của bạn → kiểm tra điện thoại

### Cách 2: cURL trực tiếp

```bash
# Test endpoint admin (yêu cầu cookie session admin)
curl https://vowvet.monminpet.com/api/v1/admin/zalo-status \
  -H "Cookie: vowvet_session=<your_token>"
```

Response expect:
```json
{
  "status": {
    "mode": "zns_real",
    "ready_for_real": true,
    "has_access_token": true,
    "has_template_id": true
  }
}
```

### Cách 3: live login

1. Logout
2. Login lại bằng SĐT của bạn
3. Vào docker logs:
   ```
   docker logs vowvet-api --tail 10
   ```
4. Expect log line: `[ZALO OTP SENT] phone=+84... via=zns oa_id=1293160799920765896`
5. Điện thoại nhận tin Zalo trong vài giây

---

## Rollback nhanh nếu có vấn đề

Đổi 1 dòng:
```env
ZALO_MODE=mock
```
Restart vowvet-api → flow OTP fallback console.log. User vẫn login được qua dev_otp.

Code đã có graceful fallback — nếu Zalo API error (network/quota/credentials sai), tự log `[ZALO OTP FALLBACK]` và in OTP vào console, **user KHÔNG bị block**.

---

## Pricing tracking

Trang admin `/admin/zalo-status` đếm số OTP gửi hôm nay × 300đ. Để chính xác hơn:

- Future: hook vào notification_log với type=`otp_zalo` cho mỗi successful ZNS send
- Hiện tại: usage_today.otps_sent_zalo dựa vào count rows có type=`otp_zalo`. Lần đầu chưa có rows này — sẽ điền dần theo thực tế

Manual check Zalo dashboard: https://business.zalo.me/zns/dashboard → tab "Lịch sử gửi"

---

## Troubleshooting

| Vấn đề | Nguyên nhân + fix |
|---|---|
| Trang admin shows "Real ZNS mode set BUT credentials incomplete" | Thiếu `ZALO_ZNS_ACCESS_TOKEN` hoặc `ZALO_ZNS_TEMPLATE_ID` trong env. Check `.env`, restart container |
| Logs có `[ZALO OTP FALLBACK] Zalo ZNS fail (zalo error=...)` | Đọc error code ở https://developers.zalo.me/docs/api/zns-message-sending. Phổ biến: error=205 (quota), error=124 (token expired) |
| Logs có `[ZALO OTP FALLBACK] Zalo ZNS fail (http 401)` | Access token expired sau 90 ngày — refresh qua OAuth flow |
| User báo không nhận OTP nhưng logs nói SENT | Check user có app Zalo cài đặt + đăng ký với SĐT đó không. Zalo ZNS chỉ gửi tới user có Zalo |
| Trang admin trả 403 FORBIDDEN | SĐT login không trong `ADMIN_PHONES` env. Thêm SĐT vào (separator `,`) + restart |

---

## Code references

| File | Mục đích |
|---|---|
| `api/src/lib/otp-sender.ts` | Toggle mock/zns_real + send logic |
| `api/src/routes/auth.ts` | request-otp endpoint dùng sendOtp() |
| `api/src/routes/admin.ts` | GET /admin/zalo-status + POST /admin/zalo-test |
| `web/src/pages/admin/zalo-status.astro` | UI admin |
| `.env` | Env vars `ZALO_*` |

---

**Câu hỏi nhanh:** Zalo từ chối duyệt OA / template?
→ Liên hệ Zalo support: zns-support@vng.com.vn. Trong lúc chờ, vẫn dùng mock mode hoặc dev_otp (NODE_ENV !== production thì auth response trả `dev_otp` field — frontend có thể hiển thị cho admin/QA).
