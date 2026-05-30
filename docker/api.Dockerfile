# VowVet API — Bun + Hono
# Build context: project root (..)
FROM oven/bun:1.3.14-alpine AS base

WORKDIR /app

# 1. Root deps trước (zod, @aws-sdk/client-s3 dùng cho shared/)
#    Tách layer để cache khi chỉ đổi source.
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# 2. API workspace deps (hono, @hono/zod-validator, ...)
COPY api/package.json api/bun.lock* ./api/
WORKDIR /app/api
RUN bun install --frozen-lockfile

# 3. Mã nguồn (sẽ bị bind-mount đè trong dev, nhưng vẫn cần cho build image)
WORKDIR /app
COPY shared ./shared
COPY baserow-config.json ./baserow-config.json
COPY api/tsconfig.json ./api/tsconfig.json
COPY api/src ./api/src

WORKDIR /app/api
EXPOSE 3000

# Dev: hot reload qua --watch (bind mount sẽ cung cấp source code mới nhất)
CMD ["bun", "run", "--watch", "src/index.ts"]
