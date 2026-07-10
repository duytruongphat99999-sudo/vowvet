# PROJECT.md — VowVet / Mon Min Pet (tri thức riêng của dự án)

> `/task` và `/epic` đọc file này TRƯỚC TIÊN. Chi tiết sâu (vùng cấm nutrition, design
> tokens, bẫy Baserow, hiệu năng) ở `CLAUDE.md` gốc repo — mâu thuẫn thì CLAUDE.md thắng
> và phải sửa lại file này.

## Ngăn xếp
- Astro 5 SSR (`web/`) · Bun · Alpine.js · Tailwind v4 — container `vowvet-web`
- Hono + Bun (`api/`) — container `vowvet-api` (bun --watch, bind-mount Windows)
- Baserow = DB/backend (bảng `pets` id **636**) · Leaflet (map)
- Docker Desktop trên **Windows server** · stack: `docker/docker-compose.yml`
- `shared/` — code dùng chung 2 phía (`nutrition-engine.ts` CANONICAL, `health-conditions.ts`)

## Lệnh vàng (LỆNH ĐƠN — guard chặn interpreter trong lệnh ghép, đừng `cd X && bun ...`)
- Cài:       `bun install --cwd web` và `bun install --cwd api`
- Dev stack: `docker compose -f docker/docker-compose.yml up -d`
- Typecheck: `bun run --cwd api typecheck`
- Build web: `bun run --cwd web build`
- Test:      **CHƯA CÓ** — đừng bao giờ khai "test pass". "Xong" = typecheck + build.
- Verify:    `bash .claude/scripts/verify.sh`  ← định nghĩa "XONG" duy nhất

## Luật bất khả xâm phạm
- **KHÔNG hard-delete.** Mọi xoá là soft-delete (set `deleted_at`). DB là Baserow.
- Sửa `api/src/*` hoặc `shared/*` xong **PHẢI**: `docker restart vowvet-api`
  (bun --watch không hot-reload đáng tin trên bind-mount Windows — hook after-edit tự chạy,
  kiểm lại có dòng 🔁 hiện ra).
- **Vì sao có luật restart này**: API mount code từ Windows host qua bind-mount Docker. Sự kiện
  file-change không truyền tin cậy qua ranh giới đó → `bun --watch` thường KHÔNG nạp lại code mới.
  Đó là lý do `after-edit.sh` tự `docker restart vowvet-api`. **ĐỪNG nói "không cần restart vì có --watch"** —
  câu đó SAI trên môi trường này. Hook là bảo đảm; luật này giải thích để không ai gỡ nhầm hook.
- **verify.sh là CƠ CHẾ, không phải lời khuyên**: hook `require-verify.sh` CHẶN `git commit` và
  `gh pr create` nếu chưa `bash .claude/scripts/verify.sh` cho XANH sau lần sửa nguồn cuối.
  Bỏ qua verify = không bàn giao được. Đo endpoint bằng curl là BỔ SUNG, KHÔNG thay verify.sh.
- Sửa `web/src/*`: restart **KHÔNG đủ** — prod chạy `dist` baked trong image.
  Cuối task: `docker compose -f docker/docker-compose.yml up -d --build vowvet-web`.
- Đụng file được service worker cache → **bump `CACHE_VERSION` (vXXX, tăng dần)** trong `web/public/sw.js`.
- `<script is:inline>` là **JS THUẦN** (không TS) → `node --check` từng file đã sửa.
- **CẤM đụng logic dinh dưỡng DER/RER/gram**: `shared/nutrition-engine.ts` (CANONICAL),
  `api/src/lib/nutrition.ts`, `api/src/routes/nutrition.ts`, hằng DRY 360 / WET 85 trong
  `web/src/pages/food-brands.astro`. Chỉ sửa khi có TASK riêng + duyệt số cũ→mới từng dòng.
- **Schema Baserow**: KHÔNG tự thêm/đổi field. Đề xuất → đợi Duy duyệt → mới làm.
- Nhãn UI trung thực: backend AI chạy Gemini → UI ghi "AI của VowVet" (trung tính),
  KHÔNG lộ vendor, KHÔNG ghi "Claude". Tính năng Google-search → không gắn nhãn "AI".
- `.env` đổi → `docker compose -f docker/docker-compose.yml up -d --force-recreate vowvet-api vowvet-web`
  (`docker restart` KHÔNG nạp lại `.env`).

## Bản đồ thư mục
- `web/src/pages/` — trang Astro (`pets/[id].astro`, `food-brands.astro`, wizard `pets/new`…)
- `web/src/lib/` — helper FE (`breeds.ts`, `age.ts`, `api-client.ts`, `articles.ts`)
- `web/src/middleware.ts` — Astro middleware (guard onboarding)
- `web/public/sw.js` — service worker (bump vXXX mỗi release UI)
- `api/src/routes/` — HTTP routes (Hono) · `api/src/lib/` — logic, `me-cache.ts` (TTL 20s, bust khi ghi)
- `shared/` — engine + types dùng chung
- `docker/docker-compose.yml` — stack · `baserow-config.json` — gitignored (field IDs local)

## Định nghĩa "XONG"
1. `bash .claude/scripts/verify.sh` XANH (typecheck api + build web)
2. Sửa api/shared → đã restart `vowvet-api` · sửa web/src → đã rebuild `vowvet-web` · UI đổi → đã bump SW vXXX
3. Commit theo quy ước thật: `type: mô tả (vXXX)` (conventional + đuôi SW version khi có UI)
4. Nhánh `auto/<slug>` → mở PR. **KHÔNG merge** — người merge là Duy.

## Cấm tuyệt đối
- `git push` vào `main`/`master` (guard.sh chặn cứng). Nhánh `auto/*`, `epic/*` thì ĐƯỢC push để mở PR.
- `gh pr merge` — không bao giờ.
- `docker compose down` · `docker volume rm/prune` (bay dữ liệu Baserow).
- `rm -rf` · `git reset --hard` · `DROP`/`TRUNCATE`/`DELETE` không `WHERE`.
- Account test giữ nguyên: pet "min" id **12** (user **10**) · `lyvu2004DTP@gmail.com` (user **18**).
