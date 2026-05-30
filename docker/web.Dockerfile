# VowVet Web — Astro + Tailwind + Alpine + PWA
# Build context: project root (..)
FROM oven/bun:1.3.14-alpine AS base

WORKDIR /app

# 1. Copy package files trước để cache install layer
COPY web/package.json web/bun.lock* ./web/
WORKDIR /app/web
RUN bun install --frozen-lockfile

# 2. Mã nguồn (bind mount sẽ đè trong dev)
WORKDIR /app
COPY shared ./shared
COPY web/astro.config.mjs web/tsconfig.json ./web/
COPY web/src ./web/src
COPY web/public ./web/public

WORKDIR /app/web
EXPOSE 4321

CMD ["bun", "run", "dev"]
