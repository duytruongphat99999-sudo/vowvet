# syntax=docker/dockerfile:1
# VowVet web — PROD build (SSR, @astrojs/node standalone). Thay cho web.Dockerfile (bun run dev).

# ---------- Stage build: full deps + astro build → dist/ ----------
FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
# deps trước để cache layer (chỉ rebuild khi lockfile đổi)
COPY web/package.json web/bun.lock* ./web/
WORKDIR /app/web
RUN bun install --frozen-lockfile          # cần devDeps (astro/vite/adapter) để build
WORKDIR /app
COPY shared ./shared
COPY web/astro.config.mjs web/tsconfig.json ./web/
COPY web/src ./web/src
COPY web/public ./web/public
WORKDIR /app/web
RUN bun run build                          # astro build → /app/web/dist (server + client + sw.js)

# ---------- Stage runtime: dist + node_modules (Vite externalize deps → cần lúc chạy) ----------
FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app/web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=build /app/web/dist ./dist
# full node_modules (gồm sharp); tối ưu prune để sau
COPY --from=build /app/web/node_modules ./node_modules
COPY --from=build /app/web/package.json ./package.json
COPY --from=build /app/shared /app/shared
EXPOSE 4321
# entrypoint adapter node standalone; Bun chạy được file Node-compatible này
CMD ["bun", "./dist/server/entry.mjs"]
