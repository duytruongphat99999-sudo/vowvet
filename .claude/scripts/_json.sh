#!/usr/bin/env bash
# _json.sh — trích field từ JSON trên stdin. Thứ tự ưu tiên: jq → python3.
# Không có cái nào → trả về mã 3 để caller quyết định fail-open hay fail-closed.
json_field() {  # json_field <json-string> <dotted.path>
  local raw="$1" path="$2"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$raw" | jq -r ".$path // empty"; return 0
  fi
  # Windows: python3 có thể là stub Microsoft Store — phải thử chạy thật
  local py=""
  for c in python3 python py; do
    "$c" -c 'import sys' >/dev/null 2>&1 && { py="$c"; break; }
  done
  if [ -n "$py" ]; then
    printf '%s' "$raw" | "$py" -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for k in sys.argv[1].split("."):
    if not isinstance(d, dict): sys.exit(0)
    d = d.get(k)
    if d is None: sys.exit(0)
print(d)' "$path"; return 0
  fi
  return 3
}
