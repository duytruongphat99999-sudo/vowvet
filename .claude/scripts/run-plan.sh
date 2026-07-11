#!/usr/bin/env bash
# run-plan.sh — chạy .claude/plan.yaml theo từng WAVE.
#
# Mô hình nhánh (đây là chỗ giải quyết "A và B thông luồng"):
#
#   main ──┐                                    (agent KHÔNG chạm)
#          └─ epic/<tên> ──┬─ task/contract  ─┘ merge vào epic
#                          ├─ task/A1 ───────┘  (nhánh TỪ epic, nên thấy contract)
#                          ├─ task/B1 ───────┘
#                          ├─ task/A2 ───────┘  (thấy cả contract + A1)
#                          └─ task/B2 ───────┘
#                             └──▶ 1 PR duy nhất: epic → main   ← BẠN duyệt
#
# Vì sao task branch TỪ epic chứ không từ main:
#   B1 cần thấy types mà contract vừa viết. Branch từ main là không thấy.
#   Đây chính là nguyên nhân gốc của "lắc nhắc".
#
# Vì sao SCRIPT merge chứ không phải agent:
#   guard.sh chặn cứng `gh pr merge`. Agent không bao giờ được merge.
#   Script không đi qua hook — nó là bạn, không phải agent.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)" || { echo "Không phải git repo" >&2; exit 1; }
cd "$ROOT"
PLAN="${1:-.claude/plan.yaml}"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$ROOT/.claude/runs/plan-$STAMP.log"
mkdir -p "$(dirname "$LOG")"

LOCK="$ROOT/.claude/.queue.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  flock -n 9 || { echo "Một phiên khác đang chạy." >&2; exit 1; }
else
  # Windows/Git Bash không có flock — khoá bằng mkdir (atomic)
  if ! mkdir "$LOCK.d" 2>/dev/null; then
    echo "Một phiên khác đang chạy (chắc chắn không thì: rmdir .claude/.queue.lock.d)" >&2
    exit 1
  fi
  trap 'rmdir "$LOCK.d" 2>/dev/null' EXIT
fi

# Windows: python3 có thể là stub Microsoft Store — dò bản chạy được thật
PY=""
for c in python3 python py; do
  "$c" -c 'import sys' >/dev/null 2>&1 && { PY="$c"; break; }
done
[ -n "$PY" ] || { echo "❌ Không tìm thấy python chạy được. Cài Python 3." >&2; exit 1; }

[ -z "$(git status --porcelain)" ] || { echo "❌ Cây làm việc bẩn." >&2; exit 1; }

# ── Lập lịch. plan.py chặn ngay nếu plan sai. ─────────────────────────
SCHED=$("$PY" "$ROOT/.claude/scripts/plan.py" waves --plan "$PLAN" --json) || exit 1
EPIC=$(echo "$SCHED" | "$PY" -c 'import sys,json;print(json.load(sys.stdin)["epic"])')
BASE=$(echo "$SCHED" | "$PY" -c 'import sys,json;print(json.load(sys.stdin)["base"])')
NWAVE=$(echo "$SCHED" | "$PY" -c 'import sys,json;print(len(json.load(sys.stdin)["waves"]))')

EPIC_BR="epic/$EPIC"
echo "📐 epic=$EPIC  base=$BASE  waves=$NWAVE" | tee -a "$LOG"

git checkout -q "$BASE" && git pull -q --ff-only 2>/dev/null || true
git checkout -q -b "$EPIC_BR" 2>/dev/null || git checkout -q "$EPIC_BR"

export HARNESS_HEADLESS=1

for (( w=0; w<NWAVE; w++ )); do
  echo -e "\n╔═══ WAVE $w ═══════════════════════════════" | tee -a "$LOG"

  mapfile -t IDS < <(echo "$SCHED" | "$PY" -c "
import sys,json
for t in json.load(sys.stdin)['waves'][$w]: print(t['id'])")

  for id in "${IDS[@]}"; do
    GOAL=$(echo "$SCHED" | "$PY" -c "
import sys,json
print(next(t['goal'] for t in json.load(sys.stdin)['waves'][$w] if t['id']=='$id'))")

    echo -e "\n── [$id] ──" | tee -a "$LOG"

    # Nhánh task đẻ TỪ epic → thấy toàn bộ công việc của các wave trước
    git checkout -q "$EPIC_BR"
    git checkout -q -B "task/$EPIC/$id"

    # Agent làm việc. Nó commit vào task branch. Nó KHÔNG merge, KHÔNG push main.
    if ! timeout 1800 "$ROOT/.claude/scripts/run-task.sh" \
         "[$id] $GOAL" >>"$LOG" 2>&1; then
      echo "❌ [$id] HỎNG — dừng epic. Log: $LOG" | tee -a "$LOG"
      git checkout -q "$EPIC_BR"
      exit 1
    fi

    # SCRIPT merge, không phải agent.
    git checkout -q "$EPIC_BR"
    if ! git merge --no-ff -q -m "merge($EPIC): $id" "task/$EPIC/$id"; then
      echo "❌ [$id] xung đột khi merge vào $EPIC_BR." | tee -a "$LOG"
      echo "   Nghĩa là 'touches' trong plan.yaml khai thiếu. Sửa plan rồi chạy lại." | tee -a "$LOG"
      git merge --abort
      exit 1
    fi
    echo "✅ [$id] đã merge vào $EPIC_BR" | tee -a "$LOG"
  done

  # ── Cổng liên thông: sau mỗi wave, cả epic phải còn xanh ────────────
  # Đây là chỗ bắt lỗi "A1 và B1 riêng lẻ đều pass, ghép vào thì vỡ".
  echo "🔬 kiểm tra liên thông sau WAVE $w..." | tee -a "$LOG"
  if [ -f "$ROOT/.claude/scripts/verify.sh" ]; then
    if ! bash "$ROOT/.claude/scripts/verify.sh" >>"$LOG" 2>&1; then
      echo "❌ WAVE $w merge xong nhưng epic vỡ. Dừng. Log: $LOG" | tee -a "$LOG"
      exit 1
    fi
  else
    echo "⚠️  chưa có .claude/scripts/verify.sh — bỏ qua cổng liên thông" | tee -a "$LOG"
  fi
  echo "✅ WAVE $w xanh" | tee -a "$LOG"

  # Dừng-sau-wave (giám sát lần đầu): HARNESS_STOP_AFTER_WAVE=0 → chạy hết wave 0 rồi dừng,
  # KHÔNG push, KHÔNG PR, giữ nguyên epic branch để con người kiểm.
  if [ -n "${HARNESS_STOP_AFTER_WAVE:-}" ] && [ "$w" -ge "${HARNESS_STOP_AFTER_WAVE}" ]; then
    echo "⏸ DỪNG sau WAVE $w (HARNESS_STOP_AFTER_WAVE=$HARNESS_STOP_AFTER_WAVE). Nhánh $EPIC_BR giữ nguyên, chưa bàn giao." | tee -a "$LOG"
    exit 0
  fi
done

# ── Bàn giao: đúng MỘT PR cho con người ───────────────────────────────
git push -q -u origin "$EPIC_BR"
gh pr create --base "$BASE" --head "$EPIC_BR" \
  --title "epic($EPIC): $NWAVE wave, $(git rev-list --count "$BASE".."$EPIC_BR") commit" \
  --body "$(printf 'Sinh bởi run-plan.sh\n\nPlan: `%s`\nLog: `%s`\n\nMỗi merge commit là một task. Review theo từng merge commit sẽ dễ hơn đọc diff phẳng.' "$PLAN" "$LOG")" \
  2>&1 | tee -a "$LOG"

echo -e "\n📦 Epic xong. Duyệt PR rồi merge tay." | tee -a "$LOG"
