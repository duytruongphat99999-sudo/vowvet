#!/usr/bin/env bash
# run-task.sh "<yêu cầu thô>"
#
# Chạy MỘT task ở chế độ headless (không TUI, không người ngồi trước máy).
# In ra JSON gồm: result, session_id, cost.
#
# Headless dùng lại y nguyên settings/hooks/permission rules của phiên
# interactive — nên guard.sh và after-edit.sh vẫn có hiệu lực. Đó là lý do
# KHÔNG dùng cờ --bare ở đây (bare mode bỏ qua hooks, CLAUDE.md, skills).
set -euo pipefail

PROMPT="${1:?Cần truyền yêu cầu. Ví dụ: run-task.sh 'thêm nút quay lại trong chat'}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Cây làm việc phải sạch — nếu không, diff của agent sẽ lẫn với việc dở dang của bạn.
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Cây làm việc bẩn. Commit hoặc stash trước." >&2
  exit 1
fi

export HARNESS_HEADLESS=1

# Danh sách tool cho phép. Nguyên tắc: KHÔNG BAO GIỜ cho "Bash" trần.
# Scope theo từng lệnh cụ thể — đây là tuyến phòng thủ đầu tiên, guard.sh là tuyến hai.
ALLOWED="Read,Glob,Grep,Edit,Write,Task,\
Bash(git status:*),Bash(git diff:*),Bash(git add:*),Bash(git commit:*),\
Bash(git checkout -b:*),Bash(git branch:*),Bash(git log:*),\
Bash(gh pr create:*)"

# Nạp thêm tool riêng của dự án nếu có (test/lint/build/restart container)
EXTRA_FILE="$ROOT/.claude/allowed-tools.txt"
if [ -f "$EXTRA_FILE" ]; then
  EXTRA=$(grep -v '^\s*#' "$EXTRA_FILE" | grep -v '^\s*$' | paste -sd, -)
  [ -n "$EXTRA" ] && ALLOWED="$ALLOWED,$EXTRA"
fi

OUT=$(claude -p "/task $PROMPT" \
  --output-format json \
  --permission-mode acceptEdits \
  --allowedTools "$ALLOWED" \
  --max-turns 60)

# --output-format json trả về .result, .session_id, .total_cost_usd
echo "$OUT" | jq '{
  result:  .result,
  session: .session_id,
  cost_usd: .total_cost_usd
}'
