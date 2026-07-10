#!/usr/bin/env bash
# notify.sh — Stop hook. Chạy khi Claude kết thúc lượt trả lời.
# Dùng để bắn kết quả về Telegram khi chạy headless (không ai ngồi trước máy).
# Im lặng nếu chưa cấu hình env — không làm phiền phiên interactive.
set -uo pipefail

[ -z "${TELEGRAM_BOT_TOKEN:-}" ] && exit 0
[ -z "${TELEGRAM_CHAT_ID:-}" ]  && exit 0
[ "${HARNESS_HEADLESS:-0}" != "1" ] && exit 0   # chỉ bắn khi chạy tự động

REPO=$(basename "${CLAUDE_PROJECT_DIR:-$PWD}")
BRANCH=$(git branch --show-current 2>/dev/null || echo "?")

curl -sS -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=🤖 [${REPO}] phiên kết thúc trên nhánh ${BRANCH}" \
  >/dev/null 2>&1 || true

exit 0
