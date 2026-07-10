#!/usr/bin/env bash
# guard.sh — PreToolUse hook, matcher "Bash"
#
#   stdin  : JSON có .tool_input.command
#   exit 0 : cho lệnh chạy
#   exit 2 : CHẶN. stderr trả về cho Claude để nó biết vì sao.
#
# Lớp phòng thủ deterministic, không phụ thuộc model có nhớ lời dặn hay không.
# NGUYÊN TẮC: fail CLOSED. Không parse được input → chặn, chứ không cho qua.
set -uo pipefail
source "$(dirname "$0")/_json.sh"

INPUT=$(cat)
if ! CMD=$(json_field "$INPUT" "tool_input.command"); then
  echo "⛔ HOOK CHẶN: guard.sh cần jq hoặc python3 để hoạt động. Cài jq rồi thử lại." >&2
  exit 2   # fail closed — thà chặn nhầm còn hơn tắt phòng thủ trong im lặng
fi
[ -z "$CMD" ] && exit 0

deny() {
  if printf '%s' "$CMD" | grep -Eq -- "$1"; then
    echo "⛔ HOOK CHẶN: $2" >&2
    echo "   Lệnh: $CMD" >&2
    exit 2
  fi
}

# ── 1. Agent chỉ được đi tới PR ───────────────────────────────────────
deny 'git[[:space:]]+push([^|;&]*[[:space:]])?(origin[[:space:]]+)?(main|master|prod|production)([[:space:]]|$)' \
     'Cấm push thẳng nhánh production. Tạo branch auto/* và mở PR.'
deny 'git[[:space:]]+push[^|;&]*--force'  'Cấm force push.'
deny 'gh[[:space:]]+pr[[:space:]]+merge'  'Cấm tự merge PR. Người duyệt là con người.'

# ── 2. Không phá huỷ dữ liệu / lịch sử ────────────────────────────────
deny 'rm[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-[a-zA-Z]*[rf]' 'rm -rf bị cấm.'
deny 'git[[:space:]]+reset[[:space:]]+--hard'   'reset --hard làm mất việc chưa commit.'
deny 'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f' 'git clean -f không phục hồi được.'
deny 'DROP[[:space:]]+(TABLE|DATABASE)'  'DDL huỷ diệt bị cấm.'
deny 'TRUNCATE[[:space:]]'               'TRUNCATE bị cấm.'
# DELETE FROM không có WHERE (ERE không có lookahead → kiểm tra 2 bước)
if printf '%s' "$CMD" | grep -Eqi 'DELETE[[:space:]]+FROM' && \
   ! printf '%s' "$CMD" | grep -Eqi 'WHERE'; then
  echo "⛔ HOOK CHẶN: DELETE FROM không có WHERE." >&2; exit 2
fi

# ── 3. Không rò rỉ secret ─────────────────────────────────────────────
deny 'cat[^|;&]*\.env'  'Không đọc .env ra stdout.'
deny 'curl[^|;&]*(TOKEN|KEY|SECRET|PASSWORD)' 'Có vẻ đang gửi secret ra ngoài.'
deny '(cat|cp|scp)[^|;&]*(id_rsa|id_ed25519|\.ssh/)' 'Đụng tới SSH key.'

# ── 4. Không sửa chính lớp phòng thủ ──────────────────────────────────
deny '(>|>>|tee|sed[[:space:]]+-i|rm)[^|;&]*\.claude/(scripts|settings\.json|deny-commands)' \
     'Không sửa file harness từ trong phiên.'

# ── 5. Luật riêng dự án ───────────────────────────────────────────────
DENYFILE="${CLAUDE_PROJECT_DIR:-.}/.claude/deny-commands.txt"
if [ -f "$DENYFILE" ]; then
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    case "$p" in \#*) continue ;; esac
    deny "$p" "Vi phạm deny-commands.txt của dự án."
  done < "$DENYFILE"
fi
exit 0
