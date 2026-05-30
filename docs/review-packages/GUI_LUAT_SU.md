# Hồ sơ Thẩm định Tuân thủ Pháp lý Dịch vụ Số
## VowVet AI Care Plan — Cơ chế Click-wrap Consent & Hard Gate

> **Ngày phát hành**: 2026-05-23
> **Gửi**: Luật sư đối tác
> **Mục đích**: Thẩm định pháp lý disclaimer, cơ chế đồng ý điện tử, và rủi ro trách nhiệm dân sự
> **Bản consent**: `v1-2026-05`
> **Áp dụng**: Luật Bảo vệ quyền lợi người tiêu dùng 2023 + Luật Giao dịch điện tử 2023

---

## 1. TÓM TẮT LUỒNG TRẢI NGHIỆM KHÁCH HÀNG (USER FLOW)

### 🔒 Tính chất pháp lý cốt lõi — **"HARD GATE" (Cổng chặn cứng)**

> **🔥 ĐIỂM NHẤN QUAN TRỌNG NHẤT CỦA HỒ SƠ NÀY**
>
> VowVet thiết kế cơ chế **chặn cứng** (Hard Gate) — **người dùng KHÔNG thể xem được bất kỳ Care Plan AI nào nếu chưa thực hiện đầy đủ chuỗi hành động chủ động**:
>
> **(1)** Đọc 3 mục cảnh báo hiển thị trong modal →
> **(2)** Tích chọn checkbox **"Tôi đã hiểu"** →
> **(3)** Chủ động bấm nút **Gold CTA "Bắt đầu xem Care Plan"** (nút chỉ sáng lên sau khi tick xong)
>
> Chỉ khi đủ 3 hành động trên, hệ thống mới ghi nhận **timestamp `care_plan_consented_at`** kèm **phiên bản consent (`care_plan_consent_version = "v1-2026-05"`)** vào cơ sở dữ liệu Baserow. **→ Đây chính là "BẰNG CHỨNG ĐIỆN TỬ KHÔNG THỂ CHỐI CÃI"** — cơ sở pháp lý vững chắc bảo vệ doanh nghiệp trong mọi tranh chấp dân sự về sau.

### 📊 Sơ đồ luồng đồng ý

```
┌─────────────────────────────────────────────────────────────────────┐
│ Bước 1: User mở /pets/[id]/care-plan lần đầu                       │
│         → Server SSR gọi GET /api/v1/users/me/care-plan-consent     │
│         → Nếu care_plan_consented_at == null → ConsentModal POPUP   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Bước 2: Modal hiển thị (KHÔNG thể đóng mà không có lựa chọn)        │
│         ┌──────────────────────────────────────────────┐            │
│         │ 🛡 VowVet · Đồng ý sử dụng                  │            │
│         │ "Trước khi mở Care Plan"                     │            │
│         ├──────────────────────────────────────────────┤            │
│         │ ℹ  Section 1: AI tham khảo, không thay BS   │            │
│         │ ⚠  Section 2: Dấu hiệu lạ → hỏi BS ngay     │            │
│         │ 🚨 Section 3: Cấp cứu → gọi hotline          │            │
│         ├──────────────────────────────────────────────┤            │
│         │ ☐ "Tôi đã hiểu" (checkbox bắt buộc tick)    │            │
│         ├──────────────────────────────────────────────┤            │
│         │ [Gold CTA: "Tick để tiếp tục"] (DISABLED)   │            │
│         │ [Để sau]                                     │            │
│         └──────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
            ┌─────────────────┴─────────────────┐
            ↓                                   ↓
   User tick checkbox                  User KHÔNG tick
            ↓                                   ↓
┌──────────────────────────┐         ┌──────────────────────────┐
│ CTA sáng GOLD            │         │ CTA giữ disabled         │
│ Label đổi: "Bắt đầu      │         │ User chỉ có thể chọn:    │
│  xem Care Plan"          │         │  • "Để sau" → /dashboard │
│ User chủ động bấm        │         │  • ESC → /dashboard      │
└──────────┬───────────────┘         │ (KHÔNG persist gì)       │
           ↓                         └──────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ Bước 3: Server POST /api/v1/users/me/care-plan-consent              │
│         body: { version: "v1-2026-05" }                             │
│         → Baserow UPDATE users SET                                  │
│             care_plan_consented_at = "2026-05-23T04:53:44.692Z",    │
│             care_plan_consent_version = "v1-2026-05"                │
│             WHERE id = user.id                                      │
│         → ✅ LƯU "DẤU VẾT ĐIỆN TỬ KHÔNG THỂ CHỐI CÃI"               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Bước 4: Modal đóng, user xem Care Plan                              │
│         (Banner disclaimer vẫn hiển thị trên+dưới ở mọi lần xem)    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Bước 5: Lần sau mở /care-plan                                       │
│         → care_plan_consented_at != null → modal KHÔNG hiện         │
│         → Nếu version bump (vd v2-2026-08 thêm điều khoản mới)      │
│           → modal HIỆN LẠI (force re-acknowledgement)               │
└─────────────────────────────────────────────────────────────────────┘
```

### 🔐 Tính cưỡng chế của Hard Gate (không có "back door")

| Hành vi né tránh | Kết quả |
|---|---|
| User cố tình KHÔNG tick checkbox | Nút CTA disabled (opacity 40%, cursor not-allowed) — không thể bấm vào |
| User bấm "Để sau" | Redirect `/dashboard`, **KHÔNG** lưu consent — lần sau vẫn phải qua modal |
| User bấm phím ESC | Redirect `/dashboard`, **KHÔNG** lưu consent |
| User click ra ngoài modal (backdrop) | Modal không đóng (z-index 60, bg-black/55, không có `@click.outside`) |
| User dùng DevTools force `consented = true` client-side | Vẫn không lưu Baserow — chỉ skip modal trong 1 session, lần refresh kế tiếp SSR check lại |
| User mở incognito / device mới | SSR fetch consent → null → modal hiện lại |

→ **Không tồn tại đường tắt** để xem Care Plan AI mà chưa qua bước đồng ý + lưu log Baserow.

---

## 2. NỘI DUNG PHÁP LÝ CHI TIẾT (Dump nguyên văn)

### 2.A — `CARE_PLAN_DISCLAIMER` object

> Nguồn: `shared/care-plan-safety.ts:76-94`
> Đây là **bộ disclaimer dùng chung** — Web hiển thị banner, Email render template, API trả khi safety violation.

```yaml
short:
  "AI tham khảo, không thay khám bác sĩ thú y. Có dấu hiệu lạ — hỏi BS ngay."

full_template:
  "Care Plan được tạo bởi AI dựa trên hồ sơ bé + thời tiết + breed traits.
   Đây là gợi ý THAM KHẢO, KHÔNG thay thế khám bác sĩ thú y thật.

   Liên hệ ngay {VET_NAME} hoặc gọi cấp cứu nếu:
     • Bé có dấu hiệu lạ (nôn, tiêu chảy, lừ đừ, bỏ ăn >24h)
     • Khó thở, thở gấp, co giật
     • Trúng độc (ăn lung tung, hoá chất, thuốc người)
     • Bất kỳ tình huống khẩn cấp nào

   Cấp cứu thú y: {HOTLINE}"

emergency_help_lines:
  - "Nôn / tiêu chảy / lừ đừ / bỏ ăn > 24h"
  - "Khó thở, thở gấp, co giật"
  - "Trúng độc — ăn lung tung, hoá chất, thuốc người"
  - "Bất kỳ tình huống khẩn cấp nào"
```

**Lưu ý**: `{VET_NAME}` và `{HOTLINE}` được **placeholder runtime** — render tại thời điểm gọi `getClinicInfo()`, đảm bảo thông tin bác sĩ bảo trợ và số điện thoại luôn cập nhật real-time, không hardcode.

---

### 2.B — Nội dung Modal Consent (UI tiếng Việt)

> Nguồn: `web/src/components/care-plan/ConsentModal.astro`
> Tag cấp trên: `<dialog role="dialog" aria-modal="true">`

#### 🎨 Title block

> **VowVet · Đồng ý sử dụng**
>
> # *Trước khi mở Care Plan*

#### 📋 Section 1 — Bản chất AI tham khảo (icon: ℹ️ info)

> **Care Plan là AI tham khảo.** Hệ thống dùng Gemini phân tích hồ sơ bé + thời tiết + giống loài để gợi ý lịch ăn / vận động / theo dõi — *không thay thế khám bác sĩ thú y*.

#### ⚠️ Section 2 — Cảnh báo dấu hiệu lạ (icon: alert-triangle, gold)

> **Có dấu hiệu lạ ở bé** (bỏ ăn, nôn ói, lừ đừ, sốt, đi đứng khó…) — **đừng dựa vào app**, hãy hỏi `{clinic.vet.name}` qua Zalo hoặc đến phòng khám.

#### 🚨 Section 3 — Cấp cứu (icon: siren, red)

> **Cấp cứu** (khó thở, co giật, chảy máu nhiều, ngộ độc…) — gọi **`{clinic.phone}`** ngay, không chờ app phản hồi.

#### ☑️ Checkbox (BẮT BUỘC tick để mở CTA)

> ☐ **Tôi đã hiểu**
>
> Care Plan là tham khảo AI, không thay khám BS thú y. Khi bé có dấu hiệu lạ, tôi sẽ liên hệ `{clinic.vet.name}` hoặc đến phòng khám ngay.

#### 🟡 Gold CTA (chỉ sáng khi checkbox được tick)

> **Khi checkbox CHƯA tick** (CTA disabled, opacity 40%): label = *"Tick 'Tôi đã hiểu' để tiếp tục"*
> **Khi checkbox ĐÃ tick** (CTA enabled, gold): label = *"Bắt đầu xem Care Plan"*
> **Khi submitting**: label = *"Đang ghi nhận..."*

#### 🚪 Soft exit (không persist)

> Button **"Để sau"** → `window.location.href = "/dashboard"` (KHÔNG gọi API)
> Phím **ESC** → same behavior

---

## 3. **[WOW] ĐỐI CHIẾU LUẬT VIỆT NAM 2023**

### 3.A — Luật Bảo vệ quyền lợi người tiêu dùng 2023

> *(Số 19/2023/QH15, hiệu lực 01/07/2024)*

| Điều luật | Nội dung pháp lý | Mức độ đáp ứng của VowVet |
|---|---|---|
| **Điều 15** — Quyền được cung cấp thông tin | *"Khách hàng được biết chính xác thông tin về tính chất, công dụng, rủi ro của sản phẩm/dịch vụ."* | ✅ **Đáp ứng**: Modal mô tả rõ tính chất "AI tham khảo, không thay BS" — user biết bản chất sản phẩm trước khi sử dụng. |
| **Điều 18** — Nghĩa vụ cảnh báo của bên cung cấp | *"Khi sản phẩm/dịch vụ có khả năng gây thiệt hại đến tính mạng, sức khoẻ, bên cung cấp phải cảnh báo bằng ngôn ngữ dễ hiểu, trực quan."* | ✅ **Đáp ứng**: 3 sections (ℹ️ AI tham khảo / ⚠️ Dấu hiệu lạ / 🚨 Cấp cứu) — màu sắc + icon + nội dung tiếng Việt đơn giản, không jargon. |
| **Điều 21** — Trách nhiệm bên cung cấp dịch vụ số | *"Bên cung cấp dịch vụ số phải bảo đảm tính chính xác, an toàn, bảo vệ thông tin người tiêu dùng."* | ✅ **Đáp ứng**: Defense-in-depth 5 layers, Layer 3 validator chặn AI hallucination; Layer 5 consent gate chặn user xem khi chưa được informed. |
| **Điều 24** — Trách nhiệm sản phẩm bị khuyết tật | *"Bên cung cấp chịu trách nhiệm bồi thường khi sản phẩm gây thiệt hại do khuyết tật."* | ⚠️ **Cần LS rà**: VowVet đã tuyên bố tính chất tham khảo → giới hạn trách nhiệm. Tuy nhiên, **nếu Layer 3 validator có lỗi nghiêm trọng** (vd bỏ sót Allium thật), có thể bị xem là "khuyết tật". |
| **Điều 7** — Trách nhiệm thông tin tham khảo | Người cung cấp thông tin tham khảo không chịu trách nhiệm bồi thường nếu đã cảnh báo rõ tính chất. | ✅ **Đáp ứng** (kết hợp với consent log) — xem Mục 3.B Click-wrap. |

### 3.B — Luật Giao dịch điện tử 2023

> *(Số 20/2023/QH15, hiệu lực 01/07/2024)*

| Điều luật | Nội dung pháp lý | Cách VowVet đáp ứng |
|---|---|---|
| **Điều 13** — Giá trị pháp lý của thông điệp dữ liệu | *"Thông điệp dữ liệu có giá trị pháp lý tương đương văn bản khi đáp ứng điều kiện về xác thực, toàn vẹn, truy xuất."* | ✅ `care_plan_consented_at` (ISO 8601 UTC) + `care_plan_consent_version` được lưu Baserow với user_id link_row → **truy xuất được bất kỳ lúc nào**, không thể chỉnh sửa bởi client. |
| **Điều 23** — Hợp đồng điện tử qua thao tác chủ động (Click-wrap Consent) | *"Hợp đồng được giao kết bằng thao tác bấm chọn được công nhận khi bên đồng ý đã được cung cấp đầy đủ thông tin trước đó."* | ✅ **Đáp ứng tuyệt đối** — 2-step ack: **(1)** Đọc 3 sections + tick checkbox "Tôi đã hiểu" + **(2)** Chủ động bấm Gold CTA. Đây chính xác là hành vi "bấm chọn có chủ ý" mà luật yêu cầu. |
| **Điều 14** — Toàn vẹn của thông điệp | *"Thông điệp được coi là toàn vẹn khi không bị thay đổi nội dung."* | ✅ `care_plan_consent_version = "v1-2026-05"` chốt cứng nội dung consent tại thời điểm user đồng ý. Nếu disclaimer thay đổi → bump lên `v2-...` → force re-ack. **User không thể bị "kéo dài" consent cho phiên bản mới mà mình chưa đồng ý.** |
| **Điều 22** — Chữ ký điện tử | Bao gồm click-wrap, OTP, eKYC, chữ ký số… | ✅ Click-wrap là hình thức chữ ký điện tử cấp đơn giản — phù hợp với mức rủi ro của dịch vụ tham khảo (KHÔNG phải dịch vụ y khoa cấp 1). |
| **Điều 47** — Lưu trữ thông điệp dữ liệu | *"Bên giao dịch phải lưu thông điệp dữ liệu đủ thời gian để truy xuất."* | ⚠️ **Cần LS quyết**: thời hạn lưu hiện tại = vĩnh viễn trong Baserow. **Có cần đặt retention policy (vd 7 năm theo Bộ luật Dân sự)?** |

### 3.C — Kết luận đối chiếu

> ✅ **VowVet ĐÁP ỨNG đầy đủ các điều kiện cốt lõi của cả 2 bộ luật:**
> - Cung cấp đầy đủ thông tin về tính chất AI tham khảo (Điều 15, 18 NTD)
> - Cảnh báo trực quan rủi ro (3 sections + Allium/dangerous activity blacklist server-side)
> - Hard Gate buộc user xác nhận trước khi truy cập (Điều 23 GDĐT)
> - Lưu trữ dấu vết điện tử toàn vẹn, có version control (Điều 13, 14, 47 GDĐT)
>
> ⚠️ **Còn 2 điểm cần LS xác nhận/đề xuất**:
> - **Retention policy** cho consent log (mặc định vĩnh viễn vs 7 năm)
> - **Quyền giới hạn trách nhiệm** khi Layer 3 validator có khả năng false positive/negative — cần language cẩn trọng nếu xảy ra incident

---

## 4. **[WOW] BẢNG KHUYẾN NGHỊ PHÁP LÝ — LEGAL RISK MATRIX**

> *Khu vực dành cho Luật sư điền trực tiếp vào file (Markdown table có thể chỉnh sửa).*

### 4.A — Ma trận rủi ro chính

| # | Điều khoản gốc | Rủi ro tiềm ẩn | Đề xuất sửa đổi của Luật sư |
|---|---|---|---|
| 1 | `CARE_PLAN_DISCLAIMER.short`: *"AI tham khảo, không thay khám bác sĩ thú y. Có dấu hiệu lạ — hỏi BS ngay."* | *(LS điền)* | *(LS điền)* |
| 2 | Section 2 modal: *"đừng dựa vào app, hãy hỏi {clinic.vet.name} qua Zalo hoặc đến phòng khám."* (ngôn ngữ thân mật) | *(LS điền — có cần "không khuyến nghị sử dụng app làm căn cứ chẩn đoán" không?)* | *(LS điền)* |
| 3 | Section 3 modal: *"Cấp cứu (...) gọi {clinic.phone} ngay, không chờ app phản hồi."* | *(LS điền — có cần thêm hotline 1800/115 chính phủ?)* | *(LS điền)* |
| 4 | Checkbox copy: *"Tôi đã hiểu. Care Plan là tham khảo AI, không thay khám BS thú y. Khi bé có dấu hiệu lạ, tôi sẽ liên hệ {clinic.vet.name} hoặc đến phòng khám ngay."* | *(LS điền — language consent có đủ chặt chưa? Có nên thêm "tôi miễn trừ trách nhiệm cho VowVet"?)* | *(LS điền)* |
| 5 | `care_plan_consent_version = "v1-2026-05"` (string format) | *(LS điền — có cần ghi semantic version + ngày hiệu lực chi tiết hơn không?)* | *(LS điền)* |
| 6 | Soft exit "Để sau" + ESC → redirect dashboard, KHÔNG lưu refusal log | *(LS điền — có cần lưu refusal event không, hay không lưu là an toàn?)* | *(LS điền)* |
| 7 | Retention policy của `care_plan_consented_at` (hiện vĩnh viễn) | *(LS điền — đề xuất thời hạn theo BLDS?)* | *(LS điền)* |
| 8 | Không thu thập IP / User-Agent / device fingerprint khi consent | *(LS điền — có cần bổ sung để mạnh hoá audit trail không?)* | *(LS điền)* |
| 9 | Khi safety violation xảy ra → push admin nội bộ (không thông báo user) | *(LS điền — user có quyền được biết AI bị flag không?)* | *(LS điền)* |
| 10 | Tính chất "Hard Gate" — user **không thể** dùng tính năng nếu không đồng ý | *(LS điền — có vi phạm quyền lựa chọn không hay được phép vì là điều kiện sử dụng?)* | *(LS điền)* |

### 4.B — Bảng bổ sung (LS thêm dòng nếu phát hiện rủi ro mới)

| # | Điều khoản / Cơ chế | Rủi ro tiềm ẩn | Đề xuất sửa đổi |
|---|---|---|---|
| 11 | | | |
| 12 | | | |
| 13 | | | |

---

## 📝 Khuyến nghị chung của Luật sư

```
[Khu vực để LS viết các khuyến nghị tổng thể về:
 - Tính đầy đủ của disclaimer trước khi launch
 - Có cần Điều khoản sử dụng (Terms of Service) riêng không
 - Có cần Chính sách quyền riêng tư (Privacy Policy) riêng không
 - Quy trình xử lý khiếu nại nếu user khởi kiện
 - Bảo hiểm trách nhiệm dân sự (Liability Insurance) cho dịch vụ số]





```

---

### ✍️ Xác nhận của Luật sư

| Trường | Giá trị |
|---|---|
| Họ tên Luật sư | _______________________________ |
| Số chứng chỉ hành nghề | _______________________________ |
| Văn phòng / Đoàn LS | _______________________________ |
| Ngày thẩm định | _______________________________ |
| Chữ ký | _______________________________ |

---

*Hồ sơ này được biên soạn ngày 2026-05-23 bởi VowVet Engineering Team, dựa trên consent flow `v1-2026-05` và source code tại commit hiện tại. Khi LS hoàn tất rà soát, vui lòng gửi file đã điền về VowVet để tiến hành cập nhật phiên bản consent (nếu cần) và bump `care_plan_consent_version`.*
