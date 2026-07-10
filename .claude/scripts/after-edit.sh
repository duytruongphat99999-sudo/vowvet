#!/usr/bin/env bash
# after-edit.sh — PostToolUse hook, matcher "Write|Edit"
#
# stdin: JSON. Lấy đường dẫn file vừa bị sửa từ .tool_input.file_path
#
# Script này GENERIC — không hardcode gì của dự án. Luật nằm trong
# .claude/on-edit.rules, mỗi dòng:   <glob><TAB><lệnh shell>
# Biến $FILE có sẵn trong lệnh.
#
# Đây là chỗ dán những "bước thủ công sau khi sửa code" mà bạn hay quên:
# restart container, bump cache version, chạy codegen, format...
set -uo pipefail

source "$(dirname "$0")/_json.sh"
INPUT=$(cat)
FILE=$(json_field "$INPUT" "tool_input.file_path") || exit 0  # fail open: đây là side-effect, không phải bảo mật
[ -z "$FILE" ] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
RULES="$ROOT/.claude/on-edit.rules"
[ -f "$RULES" ] || exit 0

# Windows: hook nhận C:\...\file — chuẩn hoá \ → / để glob khớp
FILE="${FILE//\\//}"
ROOT="${ROOT//\\//}"

# Đường dẫn tương đối cho glob dễ khớp
REL="${FILE#$ROOT/}"

export FILE REL

while IFS=$'\t' read -r glob cmd; do
  [ -z "${glob:-}" ] && continue
  case "$glob" in \#*) continue ;; esac
  [ -z "${cmd:-}" ] && continue

  # shellcheck disable=SC2254
  case "$REL" in
    $glob)
      # Không để lỗi side-effect làm hỏng phiên: log ra stderr, luôn exit 0.
      if ! eval "$cmd" >/dev/null 2>&1; then
        echo "⚠️  on-edit rule thất bại cho $REL: $cmd" >&2
      else
        echo "🔁 on-edit: $cmd  ($REL)" >&2
      fi
      ;;
  esac
done < "$RULES"

exit 0
