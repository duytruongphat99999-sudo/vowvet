#!/usr/bin/env bash
# require-handoff.sh — Stop hook. CHỈ trong phiên /task,/epic (env HARNESS_TASK=1).
#
# Cổng đặt ở LỐI RA, không phải lối vào. require-verify.sh gác `git commit`, nhưng
# agent hay DỪNG trước khi tới commit ("bạn tự kiểm tra giúp"). Stop hook là nơi
# agent BẮT BUỘC đi qua để kết thúc lượt — không né được.
#   exit 0 → cho dừng.  exit 2 + stderr → Claude Code nạp stderr vào context, ép chạy tiếp.
#
# Đường DUY NHẤT để kết thúc khi có sửa file nguồn:
#   nhánh auto/* → verify.sh XANH → commit → push → PR mở.
#
# ⚠️ Vòng lặp: nếu verify.sh mãi ĐỎ, agent quay lại hoài → run-task.sh có --max-turns
#    + timeout làm trần cứng (đã kiểm bằng test typecheck đỏ). Stop hook KHÔNG tự vô hạn.
set -uo pipefail
[ "${HARNESS_TASK:-0}" = "1" ] || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
ROOT="${ROOT//\\//}"
[ -d "$ROOT/.git" ] || exit 0
cd "$ROOT" || exit 0

DIRTY=$(git status --porcelain -- '*.ts' '*.astro' 2>/dev/null)
BR=$(git branch --show-current 2>/dev/null)
is_work() { case "$1" in auto/*|epic/*|task/*) return 0 ;; *) return 1 ;; esac; }

# ── Cây sạch (không còn sửa nguồn chưa commit) ──
if [ -z "$DIRTY" ]; then
  # So với ORIGIN/main (không phải main local — main local có thể đã bị lỡ commit vào).
  AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
  case "$BR" in
    auto/*)
      [ "${AHEAD:-0}" = "0" ] && exit 0                       # chưa commit gì để PR
      if gh pr view "$BR" --json state -q .state 2>/dev/null | grep -q OPEN; then
        exit 0                                                # ĐÃ có PR → bàn giao xong
      fi
      echo "⛔ CHƯA BÀN GIAO XONG: đã commit trên '$BR' nhưng chưa có PR mở. Chạy: git push -u origin $BR && gh pr create --base main --head $BR --title '<type: mô tả>' --body '<spec + output verify.sh>'." >&2
      exit 2 ;;
    task/*|epic/*)
      exit 0 ;;                                               # run-plan.sh tự merge → không ép PR
    *)
      # main/nhánh khác, cây sạch: có commit NGUỒN chưa push = agent lỡ commit vào main
      if [ "${AHEAD:-0}" != "0" ] && [ -n "$(git diff --name-only origin/main..HEAD -- '*.ts' '*.astro' 2>/dev/null)" ]; then
        echo "⛔ CHƯA BÀN GIAO: đã commit file nguồn vào '$BR' (chưa push) thay vì nhánh việc. Chuyển: git checkout -b auto/<slug> (mang commit sang), rồi push + gh pr create. TUYỆT ĐỐI KHÔNG commit vào main." >&2
        exit 2
      fi
      exit 0 ;;
  esac
fi

# ── Có sửa file nguồn chưa bàn giao. Ép theo thứ tự. ──
if ! is_work "$BR"; then
  echo "⛔ CHƯA BÀN GIAO: đã sửa file nguồn nhưng còn trên '$BR'. Tạo nhánh TRƯỚC (CHỈ tạo, ĐỪNG gộp commit vào cùng lệnh — commit chưa được phép tới khi verify.sh XANH): git checkout -b auto/<slug-ngắn>." >&2
  exit 2
fi

# Trên nhánh việc, còn dirty → cần verify.sh XANH SAU lần sửa cuối
NEED_VERIFY=1
if [ -f .claude/.verify-ok ]; then
  NEWER=$(find "$ROOT" \( -path '*/.git' -o -path '*/node_modules' -o -path '*/dist' -o -path '*/.astro' -o -path '*/tmp' \) -prune -o \
          -type f \( -name '*.ts' -o -name '*.astro' \) -newer .claude/.verify-ok -print 2>/dev/null | head -1)
  [ -z "$NEWER" ] && NEED_VERIFY=0
fi
if [ "$NEED_VERIFY" = 1 ]; then
  echo "⛔ CHƯA BÀN GIAO: có file nguồn sửa chưa verify. Chạy: bash .claude/scripts/verify.sh cho XANH (KHÔNG dùng curl/endpoint thay verify.sh)." >&2
  exit 2
fi

echo "⛔ CHƯA BÀN GIAO: đã verify XANH nhưng còn thay đổi chưa commit. Chạy: git add -A && git commit -m '<type: mô tả (vXXX nếu đụng UI)>'." >&2
exit 2
