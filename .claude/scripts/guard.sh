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

# ── 0. Interpreter: ALLOWLIST trước — deny-list không bao giờ đoán hết đường vòng ──
# Câu hỏi không phải "file này có nằm trong tmp không?" mà là "đây có phải script
# của harness / lệnh vàng không?". Câu thứ hai không có đường vòng.
# Miễn trừ CHỈ áp cho lệnh ĐƠN — lệnh ghép (;, &&, |) không được miễn, vì đuôi
# glob sẽ che phần lậu ("bun run x && python evil.py").
INTERP_OK=0
case "$CMD" in
  *';'*|*'&'*|*'|'*|*'$('*|*'`'*|*'..'*) ;;               # ghép / subst / traversal: KHÔNG miễn trừ
  python\ .claude/scripts/*.py|python3\ .claude/scripts/*.py) INTERP_OK=1 ;;
  python\ .claude/scripts/*.py\ *|python3\ .claude/scripts/*.py\ *) INTERP_OK=1 ;;  # .py + đối số (plan.py validate / waves --json)
  bash\ .claude/scripts/*.sh|bash\ .claude/scripts/*.sh\ *) INTERP_OK=1 ;;
  bun\ install|bun\ install\ --cwd\ *)                   INTERP_OK=1 ;;
  bun\ test|bun\ test\ *)                                INTERP_OK=1 ;;
  "bun run "*|"npm run "*|"pnpm run "*|"yarn "*|"yarn run "*)
    # CHỈ cho tên-script bareword ở token CUỐI. Chặn `bun run <file>`, ./x, .mjs/.ts, --cwd <file>
    # (bun run <file> = chạy code tuỳ ý — bài học task #2). `bun run --cwd api typecheck` qua (token cuối=typecheck).
    _tok="${CMD##* }"
    case "$_tok" in
      typecheck|build|lint|test|dev|start|preview|check) INTERP_OK=1 ;;
      *[/.\\]*) ;;   # có path/ext → KHÔNG cho (đây chính là lỗ bun run <file>)
      *)             # tên script riêng dự án: khai trong .claude/allowed-scripts.txt (bareword, không path/ext)
        _SF="${CLAUDE_PROJECT_DIR:-.}/.claude/allowed-scripts.txt"
        [ -f "$_SF" ] && grep -qxF "$_tok" "$_SF" && INTERP_OK=1 ;;
    esac ;;
esac
if [ "$INTERP_OK" != 1 ]; then
  deny '(^|[;&|][[:space:]]*)(env[[:space:]]+)?(py|python3?|node|bunx?|npx|deno|bash|sh|zsh|ruby|perl|php|npm|pnpm|yarn|corepack)(\.exe)?[[:space:]]+[^-]' \
       'Interpreter chỉ được chạy: script trong .claude/scripts/, hoặc bun run/install/test dạng lệnh ĐƠN (lệnh ghép thì tách ra từng lệnh). Cần thứ khác → DỪNG và hỏi người duyệt, đừng tìm đường vòng.'
  # Cờ chạy-code-inline: -c/-e/-r/--eval/--exec/-p/--print. Rule trên bỏ qua (vì cố ý cho -- qua như node --check),
  # nên phải bắt riêng. node --check / --version vẫn qua (không khớp các cờ này).
  deny '(^|[;&|][[:space:]]*)(env[[:space:]]+)?(py|python3?|node|bunx?|npx|deno|bash|sh|zsh|ruby|perl|php|npm|pnpm|yarn|corepack)(\.exe)?[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*(-c|-e|-r|-p|--eval|--exec|--print)([[:space:]"'"'"'=]|$)' \
       'Interpreter với cờ chạy-code-inline (-c/-e/-r/--eval/--print) bị cấm — đó là đường né soi file.'
  deny '\|[[:space:]]*(env[[:space:]]+)?(py|python3?|node|bunx?|npx|deno|bash|sh|zsh|ruby|perl|php|npm|pnpm|yarn|corepack)(\.exe)?([[:space:]]|$)' \
       'Không pipe dữ liệu vào interpreter.'
  # Command substitution $(...) và backtick nhúng interpreter — vector chạy code không qua tên file
  deny '\$\([[:space:]]*(env[[:space:]]+)?(py|python3?|node|bunx?|npx|deno|bash|sh|zsh|ruby|perl|php|npm|pnpm|yarn|corepack)(\.exe)?([[:space:]]|$)' \
       'Không nhúng interpreter trong $(...).'
  deny '`[[:space:]]*(env[[:space:]]+)?(py|python3?|node|bunx?|npx|deno|bash|sh|zsh|ruby|perl|php|npm|pnpm|yarn|corepack)(\.exe)?([[:space:]]|$)' \
       'Không nhúng interpreter trong backtick.'
  deny '(^|[;&|][[:space:]]*)(source|\.)[[:space:]]+' \
       'Không source file vào shell.'
  deny '(^|[;&|][[:space:]]*)\.{1,2}/' \
       'Không thực thi file trực tiếp (./ hay ../).'
fi

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
deny '(>|>>|tee|sed[[:space:]]+-i|rm|cp|mv|install)[^|;&]*\.claude/(scripts|settings\.json|settings\.local\.json|deny-commands|allowed-tools|on-edit)' \
     'Không sửa file harness từ trong phiên.'
# Stamp verify: CHỈ verify.sh được tạo (touch từ trong script, không qua tool). Chặn mọi
# đường giả mạo qua Bash — touch/redirect/cp. (Write tool thì protect-harness.sh chặn.)
deny '(>|>>|tee|touch|cp|mv|install|printf|echo)[^|;&]*\.claude/\.verify-ok' \
     'Chỉ verify.sh được tạo stamp .verify-ok. Cấm giả mạo — chạy verify.sh thật.'

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
