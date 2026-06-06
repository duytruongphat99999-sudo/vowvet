---
description: Sinh/cập nhật docs/CONTEXT_SYNC.md cho phiên sau (đọc git + sw.js, tóm tắt done/pending/gotcha)
allowed-tools: Bash(git log:*), Bash(git status:*), Bash(git rev-parse:*), Read, Write
argument-hint: [ghi chú tập trung, vd "Bước 3 DER"]
---

Cập nhật file `docs/CONTEXT_SYNC.md` để mình paste vào phiên chat tư vấn (Bồ) sau. Tuân theo `vowvet/CLAUDE.md`.

LÀM:
1. Lấy state thật: `git rev-parse --short HEAD`, `git log --oneline -12`, `git status -s`. Đọc SW version trong `web/public/sw.js`.
2. Ghi lại `docs/CONTEXT_SYNC.md` theo khung:
   - 🛠️ DỰ ÁN — 1 đoạn ngắn (stack, domain, account test). KHÔNG chép lại toàn bộ quy ước (đã ở CLAUDE.md).
   - 📊 STATE — HEAD <hash> · SW <vXXX> · số commit local · mốc perf mới nhất (TTFB trước→sau).
   - ✅ ĐÃ XONG PHIÊN NÀY — gạch đầu dòng theo commit + thay đổi UI/Baserow chính.
   - ⚠️ GOTCHA MỚI phát hiện phiên này (nếu có). Nếu là quy ước bền → đề xuất thêm vào `CLAUDE.md` luôn.
   - 🎯 VIỆC ĐANG DỞ — đánh số, ⭐ cho việc lõi, ghi rõ file sẽ đụng + cổng duyệt (số/schema).
   - 💾 BACKUP — bundle mới nhất + đã kéo off-machine chưa.
3. QUY TẮC: chỉ ghi STATE phiên, KHÔNG lặp quy ước bền. Trung thực số (cache lạnh vẫn 3–4s thì ghi rõ).
4. In ra đường dẫn file + 3 dòng tóm tắt để mình copy nhanh.

Trọng tâm thêm (nếu mình truyền vào): $ARGUMENTS
