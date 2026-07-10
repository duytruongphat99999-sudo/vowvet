#!/usr/bin/env bash
# verify.sh — định nghĩa "XONG" bằng LỆNH cho VowVet. run-plan.sh gọi sau MỖI wave.
# Thực tế repo (2026-07-10): api có typecheck (tsc --noEmit), web chỉ có build (astro build).
# CHƯA có test runner — không bịa "bun test". Có test thật thì thêm vào đây.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "── typecheck api (tsc --noEmit) ──"
(cd api && bun run typecheck)

echo "── build web (astro build) ──"
(cd web && bun run build)

# Bằng chứng XANH cho require-verify.sh — chỉ chạm sau khi mọi lệnh trên pass.
touch "$ROOT/.claude/.verify-ok"
echo "✅ verify XANH — stamp .claude/.verify-ok cập nhật (mở cửa commit/PR)"
