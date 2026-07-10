#!/usr/bin/env bash
# require-verify.sh — PreToolUse hook, matcher "Bash"
#
# verify.sh là CƠ CHẾ, không phải lời dặn. Hook này chặn `git commit` và
# `gh pr create` nếu chưa có bằng chứng verify.sh chạy XANH SAU lần sửa nguồn cuối.
# Bằng chứng = stamp .claude/.verify-ok (verify.sh touch khi mọi lệnh pass).
#   - Không có stamp        → agent chưa từng verify → CHẶN.
#   - Có file .ts/.astro mới hơn stamp → sửa sau verify → CHẶN, bắt verify lại.
# NGUYÊN TẮC: fail CLOSED.
set -uo pipefail
source "$(dirname "$0")/_json.sh"

INPUT=$(cat)
if ! CMD=$(json_field "$INPUT" "tool_input.command"); then
  echo "⛔ HOOK CHẶN: require-verify.sh cần jq hoặc python3." >&2
  exit 2
fi
[ -z "$CMD" ] && exit 0

# Chỉ gác hai cửa bàn giao. Mọi lệnh khác cho qua.
case "$CMD" in
  *"git commit"*|*"gh pr create"*) ;;
  *) exit 0 ;;
esac

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ROOT="${ROOT//\\//}"
STAMP="$ROOT/.claude/.verify-ok"

if [ ! -f "$STAMP" ]; then
  echo "⛔ HOOK CHẶN: chưa có bằng chứng verify. Chạy 'bash .claude/scripts/verify.sh' cho XANH rồi mới commit/PR." >&2
  echo "   (verify.sh pass sẽ tạo .claude/.verify-ok — cửa này mở khi có nó.)" >&2
  exit 2
fi

# File nguồn .ts/.astro nào sửa SAU stamp? (prune .git, node_modules lồng nhau, dist, .astro cache, tmp)
NEWER=$(find "$ROOT" \
  \( -path '*/.git' -o -path '*/node_modules' -o -path '*/dist' -o -path '*/.astro' -o -path '*/tmp' \) -prune -o \
  -type f \( -name '*.ts' -o -name '*.astro' \) -newer "$STAMP" -print 2>/dev/null | head -1)
if [ -n "$NEWER" ]; then
  REL="${NEWER#$ROOT/}"
  echo "⛔ HOOK CHẶN: '$REL' sửa SAU lần verify cuối. Chạy lại 'bash .claude/scripts/verify.sh' rồi mới commit/PR." >&2
  exit 2
fi
exit 0
