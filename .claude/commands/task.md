---
description: Nhận yêu cầu thô bằng tiếng Việt, tự chuẩn hoá thành spec, thực thi, tự kiểm chứng, mở PR
argument-hint: <mô tả thô, viết như đang nói chuyện>
---

Yêu cầu thô từ tôi: **$ARGUMENTS**

Đọc `.claude/PROJECT.md` trước tiên. Nếu file đó không tồn tại → dừng lại, bảo tôi chạy `/onboard`.

---

## Giai đoạn 1 — CHUẨN HOÁ (tuyệt đối không sửa file nào ở giai đoạn này)

Đây là giai đoạn thay thế việc tôi ngồi biên tập prompt bằng tay. Làm cho kỹ.

1. **Truy vết codebase.** Grep/đọc để tìm ra chính xác chỗ nào sẽ bị đụng. Không đoán tên file, không đoán tên hàm. Nếu yêu cầu nhắc đến một tính năng đã tồn tại, đọc code của nó trước.

2. **Phát hiện mơ hồ.** Nếu yêu cầu thô có chỗ hiểu được ≥ 2 cách và hai cách đó dẫn tới code khác nhau → hỏi tôi, gộp thành một câu hỏi duy nhất. Đừng chọn bừa rồi làm.

3. **Viết spec** theo đúng khung này:

```
MỤC TIÊU     : <1 câu, mô tả kết quả người dùng thấy được>
KHÔNG LÀM    : <ranh giới. thứ dễ bị làm lố mà tôi không yêu cầu>
FILE ĐỤNG    : <đường dẫn thật + sửa gì, mỗi file một dòng>
ACCEPTANCE   : <tiêu chí kiểm chứng ĐƯỢC BẰNG LỆNH, không phải bằng cảm giác>
RỦI RO       : <cái gì có thể vỡ. nếu không có rủi ro thật thì ghi "không">
LUẬT ÁP DỤNG : <trích từ PROJECT.md > Luật bất khả xâm phạm, những luật task này chạm vào>
```

4. **Cổng chặn.** 
   - Spec chạm **> 3 file** HOẶC có bất kỳ RỦI RO nào ≠ "không" → in spec ra và **DỪNG**, chờ tôi gõ `go`.
   - Ngược lại → làm tiếp luôn, không hỏi.

---

## Giai đoạn 2 — THỰC THI

- Bám sát spec. Phát sinh ngoài spec → dừng, báo tôi, đừng tự mở rộng phạm vi.
- Tuân thủ mọi dòng trong `PROJECT.md > Luật bất khả xâm phạm`.
- Đổi code là phải đổi/thêm test tương ứng.

---

## Giai đoạn 3 — TỰ KIỂM CHỨNG (bắt buộc, không được bỏ)

Đây là chỗ quyết định harness có đáng tin không. Tự chấm bài mình một cách thù địch.

1. Chạy đủ **Lệnh vàng**: test → lint → build. Fail thì sửa, chạy lại. Tối đa 3 vòng, quá 3 vòng thì dừng và báo tôi thay vì cố đấm.
2. Gọi subagent `verifier` để review độc lập diff của bạn. Đưa cho nó spec + output `git diff`.
3. Verifier trả về `BLOCKER` → sửa rồi verify lại. Trả về `NIT` → ghi vào mô tả PR, không cần sửa.

---

## Giai đoạn 4 — BÀN GIAO

1. Tạo branch: `auto/<slug-ngắn-gọn>`
2. Commit theo đúng quy ước trong PROJECT.md.
3. **Mở PR. TUYỆT ĐỐI KHÔNG MERGE.** Người merge là tôi.
4. Mô tả PR gồm: spec ở Giai đoạn 1, output lệnh test, danh sách NIT của verifier.

Kết thúc bằng đúng 3 dòng cho tôi đọc trên điện thoại:

```
✅ <mục tiêu, 1 câu>
🔗 <link PR>
⚠️ <thứ tôi cần để mắt tới, hoặc "không có">
```
