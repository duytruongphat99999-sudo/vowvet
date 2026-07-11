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

1. **BƯỚC ĐẦU TIÊN, BẮT BUỘC**: chạy `bash .claude/scripts/verify.sh` cho tới khi XANH. Đây là ĐỊNH NGHĨA "verify" — **KHÔNG** dùng `curl`/hit endpoint thay cho nó (endpoint fail không có nghĩa là verify fail; verify.sh không cần network). Fail thì sửa, chạy lại. Tối đa 3 vòng, quá 3 vòng thì dừng và báo tôi. `curl` chỉ để kiểm chứng THÊM sau khi verify.sh đã XANH.
2. Gọi subagent `verifier` để review độc lập diff của bạn. Đưa cho nó spec + output `git diff`.
3. Verifier trả về `BLOCKER` → sửa rồi verify lại. Trả về `NIT` → ghi vào mô tả PR, không cần sửa.

---

## Giai đoạn 4 — BÀN GIAO (KHÔNG TÙY CHỌN)

Đây là điểm dừng — KHÔNG dừng ở "viết code xong", KHÔNG hỏi "commit không?".
Có sửa file nguồn thì PHẢI bàn giao; Stop hook `require-handoff.sh` chặn kết thúc lượt cho tới khi xong.

**TRƯỚC TIÊN đọc nhánh hiện tại: `git branch --show-current`. Nó quyết định — chỉ có một đường đúng cho mỗi ca:**

### A. Đang ở `task/*` hoặc `epic/*` (bạn đang TRONG một epic do `run-plan.sh` điều phối)
1. Commit thẳng vào **NHÁNH HIỆN TẠI** (script đã tạo sẵn nhánh này cho bạn).
2. **TUYỆT ĐỐI KHÔNG** tạo nhánh `auto/*`. **KHÔNG** `git push`. **KHÔNG** `gh pr create`.
   `run-plan.sh` sẽ tự merge nhánh của bạn vào epic. Bạn chỉ **commit rồi DỪNG**.
   (Tạo `auto/*` ở đây = việc của bạn lạc khỏi task branch → script không thấy → epic rỗng.)

### B. Đang ở `main` (một `/task` đơn lẻ)
1. Tạo branch: `git checkout -b auto/<slug-ngắn-gọn>`.
2. Commit theo đúng quy ước trong PROJECT.md.
3. `git push -u origin auto/<slug>` rồi **mở PR bằng `gh pr create`. TUYỆT ĐỐI KHÔNG MERGE.** Người merge là tôi.
4. Mô tả PR gồm: spec ở Giai đoạn 1, output `verify.sh`, danh sách NIT của verifier.

Kết thúc bằng đúng 3 dòng cho tôi đọc trên điện thoại (ca A: 🔗 ghi tên nhánh, chưa có PR):

```
✅ <mục tiêu, 1 câu>
🔗 <link PR — hoặc "nhánh <tên>, script sẽ merge" nếu ca A>
⚠️ <thứ tôi cần để mắt tới, hoặc "không có">
```
