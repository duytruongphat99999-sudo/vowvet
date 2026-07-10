#!/usr/bin/env bash
# protect-harness.sh — PreToolUse hook, matcher "Write|Edit|MultiEdit"
#
# Bịt vector mà guard.sh KHÔNG với tới: guard.sh chặn agent đụng file harness qua
# Bash (>, >>, tee, sed -i, rm). Nhưng agent còn có thể sửa guard.sh bằng chính
# tool Write/Edit/MultiEdit — không đi qua shell. Hook này chặn đúng đường đó.
# NGUYÊN TẮC: fail CLOSED — không parse được path thì chặn, không cho qua trong im lặng.
set -uo pipefail
source "$(dirname "$0")/_json.sh"

INPUT=$(cat)
if ! F=$(json_field "$INPUT" "tool_input.file_path"); then
  echo "⛔ HOOK CHẶN: protect-harness.sh không parse được input (cần jq hoặc python3)." >&2
  exit 2
fi
[ -z "$F" ] && exit 0

# Windows: hook nhận C:\...\file — chuẩn hoá \ → / để glob khớp
F="${F//\\//}"

# 1) File tri thức + kế hoạch: agent ĐƯỢC sửa (đó là việc của nó —
#    /onboard ghi PROJECT.md, /epic ghi plan.yaml, hàng đợi tick TASKS.md)
case "$F" in
  */.claude/PROJECT.md|*/.claude/plan.yaml|*/.claude/plan.example.yaml|*/TASKS.md|*/MILESTONES.md)
    exit 0 ;;
esac

# 2) Lớp phòng thủ: agent KHÔNG được sửa từ trong phiên
#    .verify-ok = bằng chứng verify (require-verify.sh dựa vào). CHỈ verify.sh touch nó.
#    Nếu agent Write/Edit thẳng file này = giả mạo cổng verify → chặn.
case "$F" in
  */.claude/scripts/*|*/.claude/settings.json|*/.claude/settings.local.json|*/.claude/deny-commands.txt|*/.claude/allowed-tools.txt|*/.claude/on-edit.rules|*/.claude/commands/*|*/.claude/agents/*|*/.claude/.verify-ok|*/CLAUDE.md|*/.gitattributes)
    echo "⛔ HOOK CHẶN: '$F' là lớp phòng thủ của harness. Sửa bằng tay, ngoài phiên agent." >&2
    exit 2 ;;
esac

exit 0
