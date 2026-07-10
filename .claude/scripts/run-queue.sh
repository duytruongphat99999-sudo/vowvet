#!/usr/bin/env bash
# run-queue.sh — CÂU TRẢ LỜI CHO "áp dự án vào nó tự chạy tới hoàn chỉnh".
#
# Bạn viết TASKS.md, mỗi dòng một task:
#     - [ ] thêm entry point chat user-to-user
#     - [ ] sửa badge unread bên admin đếm sai
#     - [x] đã xong, bỏ qua
#
# Script chạy tuần tự từng dòng chưa tick, mỗi task một branch + một PR,
# rồi tự tick lại vào TASKS.md. Bạn ngủ, sáng dậy duyệt PR.
#
# Vì sao là hàng đợi chứ không phải "một prompt ra cả dự án":
#   - Mỗi task là một đơn vị idempotent, bounded, verifiable.
#   - Task 7 hỏng không kéo theo task 1-6.
#   - Bạn review được từng miếng, thay vì một PR 4000 dòng không ai đọc nổi.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
QUEUE="${1:-TASKS.md}"
LOG="$ROOT/.claude/runs/$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG")"

[ -f "$QUEUE" ] || { echo "Không thấy $QUEUE" >&2; exit 1; }

# Khoá chống chạy chồng (cron + tay cùng lúc là công thức của thảm hoạ)
LOCK="$ROOT/.claude/.queue.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  flock -n 9 || { echo "Một hàng đợi khác đang chạy." >&2; exit 1; }
else
  # Windows/Git Bash không có flock — khoá bằng mkdir (atomic)
  if ! mkdir "$LOCK.d" 2>/dev/null; then
    echo "Một hàng đợi khác đang chạy (chắc chắn không thì: rmdir .claude/.queue.lock.d)" >&2
    exit 1
  fi
  trap 'rmdir "$LOCK.d" 2>/dev/null' EXIT
fi

BASE=$(git branch --show-current)
FAILED=0

# Đọc các dòng chưa tick:  "- [ ] nội dung"
mapfile -t TASKS < <(grep -n '^\s*-\s\[ \]\s\+' "$QUEUE" | sed 's/^\([0-9]*\):.*\[ \]\s*/\1\t/')

echo "📋 ${#TASKS[@]} task chờ xử lý. Log: $LOG"

for entry in "${TASKS[@]}"; do
  LINENO_="${entry%%$'\t'*}"
  TEXT="${entry#*$'\t'}"

  echo -e "\n──────── [$LINENO_] $TEXT ────────" | tee -a "$LOG"

  git checkout -q "$BASE"
  git pull -q --ff-only 2>/dev/null || true

  # Ngân sách cứng: 20 phút/task. Treo thì giết, đi tiếp task sau.
  if timeout 1200 "$ROOT/.claude/scripts/run-task.sh" "$TEXT" >>"$LOG" 2>&1; then
    # Tick vào TASKS.md ở đúng dòng đó
    sed -i.bak "${LINENO_}s/\[ \]/[x]/" "$QUEUE" && rm -f "$QUEUE.bak"
    # Commit tick ngay — không thì run-task.sh của task SAU thấy cây bẩn và từ chối chạy
    git add "$QUEUE" && git commit -q -m "chore(queue): tick — $TEXT" || true
    echo "✅ xong: $TEXT" | tee -a "$LOG"
  else
    echo "❌ HỎNG: $TEXT (xem $LOG)" | tee -a "$LOG"
    FAILED=$((FAILED+1))

    # Fail-fast: 2 task hỏng liên tiếp thường nghĩa là môi trường vỡ,
    # không phải task khó. Dừng lại thay vì đốt tiền 20 task nữa.
    if [ "$FAILED" -ge 2 ]; then
      echo "⛔ Dừng hàng đợi: $FAILED task hỏng. Kiểm tra môi trường." | tee -a "$LOG"
      break
    fi
  fi
done

git checkout -q "$BASE"
echo -e "\n📦 Hàng đợi kết thúc. Duyệt PR: gh pr list" | tee -a "$LOG"
