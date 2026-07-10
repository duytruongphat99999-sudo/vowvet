---
description: Chạy MỘT LẦN khi áp harness vào dự án mới. Claude tự khảo sát repo và sinh .claude/PROJECT.md
---

Đây là lần đầu harness được cài vào repo này. Nhiệm vụ của bạn là **khảo sát rồi ghi ra `.claude/PROJECT.md`** — file duy nhất chứa tri thức riêng của dự án. Toàn bộ phần còn lại của harness là generic.

## Bước 1 — Khảo sát (chỉ đọc, không sửa gì)

Tự tìm hiểu, KHÔNG hỏi tôi những thứ bạn có thể tự đọc được:

- `package.json` / `bun.lockb` / `pyproject.toml` / `go.mod` / `Cargo.toml` → runtime, package manager
- `docker-compose.yml` / `Dockerfile` → tên các service, container nào cần restart khi sửa file nào
- `.github/workflows/` → CI đang chạy lệnh gì
- `README.md`, `CONTRIBUTING.md`
- `git log --oneline -30` → quy ước commit message thực tế đang dùng
- Cấu trúc thư mục 2 tầng đầu
- Test runner: tìm script `test` trong package.json, tìm thư mục `tests/` `__tests__/` `*_test.go`
- Lint/format: `.eslintrc*`, `biome.json`, `.prettierrc*`, `ruff.toml`

## Bước 2 — Hỏi tôi ĐÚNG những gì không tự suy ra được

Gom thành **một câu hỏi duy nhất, tối đa 5 gạch đầu dòng**. Ví dụ những thứ không đọc được từ code:

- Có ràng buộc dữ liệu nào tuyệt đối không được vi phạm không? (vd: soft-delete, không xoá cứng)
- Có bước thủ công nào sau khi sửa code không? (vd: restart container, bump version cache)
- Branch nào là production? Được push thẳng không?
- Lệnh nào TUYỆT ĐỐI cấm agent chạy?

## Bước 3 — Ghi `.claude/PROJECT.md`

Theo đúng khung dưới đây. Viết cụ thể, không viết chung chung. Mỗi dòng phải là thứ mà một dev mới vào sẽ làm sai nếu không được nói.

```markdown
# PROJECT.md — tri thức riêng của dự án

## Ngăn xếp
<runtime, framework, DB, hạ tầng — mỗi thứ một dòng>

## Lệnh vàng
- Cài:      <lệnh>
- Dev:      <lệnh>
- Test:     <lệnh>          # phải chạy được không cần network
- Lint:     <lệnh>
- Build:    <lệnh>

## Luật bất khả xâm phạm
<Mỗi luật là một dòng mệnh lệnh. Ví dụ:
- KHÔNG hard-delete. Mọi xoá đều là soft-delete (set deleted_at).
- Sửa file trong api/ xong PHẢI chạy: docker restart <tên-container>
- Đụng file được service worker cache → bump CACHE_VERSION trong sw.js>

## Bản đồ thư mục
<đường-dẫn> — <trách nhiệm, một câu>

## Định nghĩa "XONG"
Một task chỉ được coi là xong khi:
1. <lệnh test> pass
2. <lệnh lint> pass
3. Commit theo quy ước: <quy ước thật, lấy từ git log>
4. Đã mở PR. KHÔNG merge.

## Cấm tuyệt đối
- git push vào <branch-production>
- <các lệnh khác>
```

## Bước 4 — Tự kiểm chứng

Chạy thử từng lệnh trong "Lệnh vàng". Lệnh nào fail thì sửa lại PROJECT.md cho đúng, đừng ghi lệnh bạn chưa chạy thử.

Cuối cùng in ra `.claude/PROJECT.md` để tôi duyệt.
