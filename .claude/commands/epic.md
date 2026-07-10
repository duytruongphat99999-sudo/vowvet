---
description: Chẻ một mục tiêu lớn (A, B, C...) thành plan.yaml có hợp đồng + đồ thị phụ thuộc
argument-hint: <mục tiêu lớn, mô tả thoải mái bằng tiếng Việt>
---

Mục tiêu lớn: **$ARGUMENTS**

Đọc `.claude/PROJECT.md` trước. Nhiệm vụ: sinh ra `.claude/plan.yaml`.
**Bạn KHÔNG viết code ở lệnh này.** Chỉ lập kế hoạch.

---

## Bước 1 — Tìm ĐƯỜNG NỐI trước khi chia việc

Đây là bước quyết định. Đừng vội chẻ A1, A2, A3.

Trả lời trước: **hai mảng việc bất kỳ sẽ gặp nhau ở chỗ nào?**
- Type/interface nào cả hai cùng dùng?
- API contract nào một bên gọi, một bên phục vụ?
- Bảng DB / schema nào cả hai cùng đọc ghi?
- Event / message shape nào truyền qua lại?

Mọi thứ vừa liệt kê gộp thành **một task duy nhất, `contract: true`, không có `needs`**.
Task này chỉ định nghĩa hình dạng — types, schema, OpenAPI, stub trả 501.
Nó KHÔNG chứa logic. Nó phải merge trước mọi thứ khác.

> Nếu bạn không tìm được đường nối nào, tức là bạn chưa hiểu bài toán.
> Đọc code thêm, đừng đoán.

## Bước 2 — Chẻ việc

Mỗi task phải:
- **Bounded**: một agent làm xong trong < 25 phút. To hơn thì chẻ tiếp.
- **Verifiable**: có `verify` là một LỆNH chạy được, không phải câu mô tả cảm tính.
- **Owned**: khai `touches` — danh sách glob file mà task này sẽ sửa.

## Bước 3 — Nối đồ thị

- `needs` phản ánh phụ thuộc THẬT (cần code của task kia mới làm được),
  không phải thứ tự bạn thích.
- **Hai task cùng wave TUYỆT ĐỐI không được `touches` chồng nhau.**
  Chồng nhau → hoặc gộp làm một, hoặc cho cái này `needs` cái kia.
- Mỗi epic phải có ít nhất một task `integration` cuối cùng, `needs` tất cả các
  nhánh, và `verify` là test e2e chứng minh A thật sự nói chuyện được với B.

## Bước 4 — Ghi và tự kiểm

Ghi `.claude/plan.yaml` theo đúng khung của `.claude/plan.example.yaml`.

Rồi **tự chạy**:

```bash
python .claude/scripts/plan.py validate
```
(Server này là Windows — `python3` là stub Microsoft Store, phải dùng `python`.)

Nó sẽ chặn nếu: id trùng, `needs` trỏ vào hư không, có chu trình, task
`contract` không nằm một mình ở wave 0, hoặc hai task cùng wave đụng cùng file.

**Sửa cho tới khi lệnh trên in `✅ plan hợp lệ`.** Đừng đưa tôi plan chưa validate.

## Bước 5 — Trình bày

In sơ đồ wave ra cho tôi. Với mỗi wave, nói một câu: *wave này xong thì cái gì
chạy được rồi?* Rồi dừng, chờ tôi gõ `go`.

Tôi gõ `go` → bạn KHÔNG chạy. Tôi tự chạy `.claude/scripts/run-plan.sh`.
