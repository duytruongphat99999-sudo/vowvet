#!/usr/bin/env bash
# verify.sh — định nghĩa "XONG" bằng LỆNH cho VowVet. run-plan.sh gọi sau MỖI wave.
# Thực tế repo (2026-07-10): api có typecheck (tsc --noEmit), web chỉ có build (astro build).
# CHƯA có test runner — không bịa "bun test". Có test thật thì thêm vào đây.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "── typecheck api (tsc --noEmit) ──"
(cd api && bun run typecheck)

echo "── build web (astro build) ──"
(cd web && bun run build)

echo "✅ verify XANH"
