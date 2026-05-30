# CONTEXT_SYNC — VowVet / Mon Min Pet

> Snapshot kỹ thuật — cập nhật **2026-05-30 (buổi 2 — WOW arc)**: 🌌 Constellation WOW v197-203 · 📈 Trend polish v204-205 · 🔒 token rotated. **SW hiện tại = `vowvet-v205-trend-clarity`**.
> Nền tảng: Pet Score Phase 1→8 + **arc WOW v197-205** (active-sync · comet hút lõi đồng bộ · constellation lines · trend auto-zoom + clarity headline) trên `/pets/[id]/pet-score`.
> Đọc TRƯỚC khi đụng pet-score.astro. Xem **🌌 WOW ARC v197-205** · **🔒 SECURITY** · **🛠️ BÀI HỌC HẠ TẦNG** · **🚨 TOMORROW QUEUE**.

---

## 1. TRẠNG THÁI HIỆN TẠI — Pet Score redesign HOÀN CHỈNH

> **STATUS: ✅ COMPLETE & PRODUCTION-READY** — Phase 1→8 (12 deliverables) **+ WOW arc v197-205** (Constellation sống động + Trend dễ hiểu). **SW cuối = `vowvet-v205-trend-clarity`**. → Bảng "8 section" dưới là baseline Phase-8; Constellation + Trend đã nâng cấp lớn ở section **🌌 WOW ARC v197-205**.

**File chính**: `web/src/pages/pets/[id]/pet-score.astro` (inline JS `scorePage()` + SSR frontmatter `stars`/`edges`).
**SW version cuối**: `vowvet-v205-trend-clarity` (`web/public/sw.js` line 17).
**Backup**: `pet-score.astro.phase8-pre.bak` (+ các phase trước: phase2/3/4/45/451/5/51/53/6/7-pre.bak).

### 8 section theo thứ tự + status

| # | Section | Class anchor | Phase | Trạng thái |
|---|---|---|---|---|
| 1 | **Hero Certificate XL** | `.hero-passport` (giữ global) + `.ps-cert-hero` (nuclear fix) | 2 | ✅ Stable — gauge SMIL 280 + WAAPI count + gold gradient + ink dark + identity stat (tier/percentile/delta) + tagline "Còn X điểm chinh phục Y Tier" + recalc gold |
| 2 | **Achievement Strip** | `.achievement-strip` | 3 + 4.5 | ✅ Horizontal scroll 110px badges + gold-thread top + fade gradient phải + icon "breath" pulse + badge-float stagger + header SVG trophy + "X / 5 cấp bậc" |
| 3 | **Recommendations** | `.recommendations-strip` | 4 + 4.5 + 4.5.1 | ✅ Top 3 cards + gold left-accent (vuông trái bo phải) + icon emoji gold circle + counter pill shimmer + first-card priority-pulse + chevron hover slide + header SVG lightbulb |
| 4 | **Constellation Star Map** | `.constellation-section` | 5 + 5.1 + 5.3 | ✅ Dark deep-space + SSR 15 stars `.map()` trong frontmatter + 4 cụm Cartesian fixed + bright/faint/penalty(white+gold ring)/neutral + const-rings rotate 80s + 20 star-dust twinkle + center ring r=56 dashed + ticker auto-cycle 3s + hover star → ticker swap + header SVG star "15 cực của Bé {name}" + "15 • THÀNH TỐ" pill |
| 5 | **Trend + Community merged** | `.trend-community` | 6 | ✅ Gold-thread + header trend-up SVG + counter pill +X/30d gold-or-slate + Chart.js 30d gold line + 3-cột stats + delta badge gold/slate + divider gold + percentile bar gold position-pulse + community-avg line + leaderboard CTA card hover slide |
| 6 | **Hụi Pet teaser** | `.hui-pet-section` | 7 + 8 | ✅ Dark luxury + 8 sparkle particles + COMING SOON pill shimmer + coin float/glow + tagline italic + **discount click-to-expand** 5 tier với range data-driven từ `levels` + 3-stats grid + CTA gold href="#" |
| 7 | **Footer note** | `<p>` plain | (keep) | Mon Min Pet Score gamification 1-line |
| 8 | **(XÓA Phase 8)** Tier accordion cũ | — | 8 | ✅ Removed; range nhúng vào Hụi Pet discount rows |

### Phase 5.2 (orbit/star-pull) SKIPPED
User quyết bỏ vì: (a) perf risk (35 simultaneous animations + drop-shadow re-rasterize), (b) bug `transform-box: fill-box` cần fix `view-box`, (c) stars tĩnh + dust twinkle + ring rotate + bright twinkle + ticker swap đã đủ "vũ trụ feel".

### Backend (M1-M27 + Gamification A+B+C) — KHÔNG đụng phiên này
54 Baserow tables, 14 cron jobs, API v0.36.0, 119/119 E2E pass. Detail trong `BUILD_PROGRESS.json`.

---

## 🌌 WOW ARC v197-205 (2026-05-30 buổi 2) — Constellation sống động + Trend dễ hiểu

> Quy ước arc này (khác Phase 1-8): mỗi feature = phần **THÊM**, KHÔNG sửa cái cũ · commit checkpoint riêng mỗi lớp · chỉ touch `.constellation-section` / `.trend-community` theo task · precompute Alpine expr string trong frontmatter (proven-safe vs template-literal-in-JSX).

**Constellation (`.constellation-section`):**
- **v197 active-sync**: thread `<line>` sao→tâm sáng khi active (`threadOnExpr`); star-active scale+glow, dim sao khác (`activeClassExpr`); ticker icon đổi `iconSvg(componentIconKey)` (bỏ ✦ đen — BE không trả `.icon`).
- **v198 bright-counter**: pill "X / 15 CỰC SÁNG" — X = `stars.filter(stateClass==='star-bright')` đếm **SSR**; heading "Constellation" đồng bộ màu MMP·ID 12 (`rgba(255,255,255,0.55)`).
- **v199 align-fix**: pill căn dòng đầu heading (`items-start` + line-height 1.5 match).
- **v200-202 Comet hút lõi**: đốm gold chạy thread sao→tâm (CSS `transform` qua `--dx/--dy` precompute SSR) + đuôi mờ; **core-flash** ring + **shockwave** ripple quét chòm khi comet cắm; **v202 tách `coreLabel`** (getter) — chữ ticker đổi TRỄ 1s (`_labelTimer` setTimeout trong interval) → **comet cắm = lõi loé = shockwave = chữ đổi (1 cú, t≈1.0s)**; hover = tức thì (getter ưu tiên `hoveredComponent`); `destroy()` clear interval+timer.
- **v203 constellation lines**: net nearest-neighbor **SSR** (`edges[]`, K=2 sao gần nhất, dist≤90, dedup → **17 cạnh / 2 chòm**); đường nền gold-deep mờ 0.13, sáng `edge-on` (gold-bright) khi 1 đầu = active.

**Trend (`.trend-community`):**
- **v204**: Chart.js Y-axis **auto-zoom** quanh data (flat-safe range≥60, mid±30) thay thang cứng 0-1000 → đường thấy chuyển động thật; chấm "hôm nay" vẽ **canvas** (plugin `afterDatasetsDraw`, resize-proof — đọc lại `meta.data[last].x/y` mỗi draw) + glow `shadowBlur`; brand sync (slate→ink/gold, `pill-negative`/`delta-down`→ink, thêm icon `users` vào `ICON_PATHS`); empty-state khi 0 pet opt-in.
- **v205**: **headline kết luận** trung tính trên chart (`.trend-headline`, 3 trạng thái theo `delta_30d` >0/===0/<0, số delta gold-bright Fraunces 15px) + chú thích **"Thang 0–1000 · biểu đồ phóng to vùng thay đổi"** (chống hiểu nhầm zoom); giữ "TOP X%" (KHÔNG đổi "cao hơn X%" vì `percentile.percentile` chưa verify ở BE).

**Git checkpoints arc:** `c1ad2fc` baseline → `3220c7f` docs → `fa0c977` (v197-199) → `7f67245` (v200-202) → `ad8826e` (v203) → `8504494` (v204-205). 6 commit, history 0 secret, **chưa push**.

---

## 2. CẤU TRÚC CỐT LÕI

### Stack (Docker containers running)
- **Frontend**: Astro 5 SSR + Bun → `vowvet-web` :4322
- **API**: Hono + Bun → `vowvet-api` :3010
- **Data**: Baserow REST → :8888
- **Media**: Cloudflare R2 bucket `vowvet`
- **AI**: Gemini 2.5 Flash ONLY (NO OpenAI)
- **Cache**: SW (`web/public/sw.js`) — doc network-first, static cache-first, API network-only

### Pet Score Alpine architecture (`scorePage()`)
State: `pet/score/levels/tierHex/refreshing/gaugeProgress/displayScore/showCelebration/trend/trendLoaded/percentile/age/_loadingTrend/tickerIndex/tickerPaused/hoveredComponent/_tickerTimer`

Module-level consts: `GROUP_DEFS` (4 nhóm × 15 keys) · `COMPONENT_ICON` (15 keys → icon name) · `ICON_PATHS` (23 lucide outlines + lightbulb) — inside `<script is:inline>`.

Frontmatter SSR data: `STAR_POSITIONS` (15 keys → {x,y}) · `KEY_GROUP` (keys → groupKey, *prepared cho Phase 5.2 orbit nhưng skipped*) · `stars` array (15 entries với enterExpr/x/y/r/bucket/stateClass/tipX/tipY).

Methods/getters: `onMount/animateScore/startGauge/startTicker/loadTrend/renderChart/refresh/fmtTime/_comp/groupedComponents/groupNet/nextTier/pointsToNextTier/pointsToNextTierLabel/tierIconKey/topRecommendations/achievements/starState/componentIconKey/iconSvg(name, sw)` + getter `displayedComponent/sortedComponents/barWidth/barFillClass/barWrapClass`.

### Design language (proven across 8 phases)

**Palette strict** — gold/white/ink only:
- gold-deep `#B48608` · gold-bright `#ecb921` · gold-light `#f4c842` · cream `#FAF6EC` `#FFFEF9` · ink `#0a0a0a` `#1a1a1a` · slate (text mờ) `#475569/64748b/94a3b8/cbd5e1`
- **LOẠI BỎ**: red (delta override gold/slate), purple #8b5cf6 (nebula bỏ), navy #1a1a2e (bg ink), emerald (delta override)
- Functional exceptions: emoji icons (component recommendations cho dấu vui), slate cho text phụ — sanctioned

**Section design 2-tone**:
- **Sáng (white card)**: `bg-white rounded-2xl border-2 border-mmp-cream p-5 mb-4 shadow-sm` — Achievement, Recommendations, Trend-Community
- **Dark luxury**: `radial-gradient(ellipse at center, #1a1a1a 0%, #0a0a0a 70%, #050505 100%)` + `border: 1px solid rgba(236,185,33,0.25)` — Hero passport, Constellation, Hụi Pet
- **Gold-thread `::before`** 1px animated linear-gradient → liên kết visual 4 sections (Achievement/Rec/Trend/Hụi Pet)
- **Counter pill** gold gradient `135deg #ecb921 → #B48608` + ::after white sweep shimmer 3.5-4s → header rhetoric

**Animation 3-tier** (memory `design_wow_animation_playbook.md`):
- SMIL `<animate>` (gauge stroke-dashoffset, on mount, begin="indefinite" + JS beginElement)
- WAAPI rAF count-up (score 0→target 1.8s ease-out, sync với gauge)
- CSS keyframes (breath, twinkle, shimmer, pulse, gold-thread, ring-rotate, dotPulse, badge-float, position-pulse, hui-coin-float/glow)
- **Fill-mode `backwards`** (KHÔNG `both`) — proven Phase 3+: hover transform không bị animation freeze chặn
- **Reduced-motion guard** đầy đủ mọi animation

**SSR `.map()` pattern cho SVG**:
- 15 stars render server-side trong template `{stars.map(s => <g>...</g>)}` thay vì Alpine `<template x-for>` trong SVG
- Né pitfall documented trong `memory/learning_alpine_scope.md` (importNode/namespace clone)
- `@mouseenter={s.enterExpr}` precompute string trong frontmatter → tránh template-literal-in-Astro-JSX parsing risk

**Robust SVG transforms**:
- `transform-box: fill-box; transform-origin: center` cho `.const-rings` (bbox đối xứng quanh 160,160)
- `r` là attribute thật (không CSS `r` property — Safari cũ không support → tránh sao tàng hình)
- Hover scale qua `transform: scale()` + `transform-box: fill-box` thay vì `r: calc(attr(r)*1.2)` invalid CSS

---

## 3. LỖI TỒN ĐỌNG

### Đã giải quyết phiên này
- ✅ Hero VV monogram đè header calendar + flourish vàng "bơ vơ" dưới name → Phase 2-after nuclear fix CSS `display:none !important; content:none !important` scoped `.ps-cert-hero`
- ✅ Nebula vàng "vô duyên" → Phase 5.3 xóa sạch
- ✅ Sao penalty đỏ → Phase 5.1 đổi white + gold ring
- ✅ Tím nebula-2 + navy bg #1a1a2e → Phase 5.1 strict gold/ink
- ✅ Confetti cầu vồng (#8b5cf6/#06b6d4/#ec4899/#10b981/#fbbf24) → Phase 5.1 recolor gold palette (đóng note B Phase 1)
- ✅ Delta badge emerald/red → Phase 6 strict gold (up) / slate (down)
- ✅ Tier accordion redundant → Phase 8 xóa, range nhúng Hụi Pet data-driven từ `levels`
- ✅ Astro `@mouseenter`/`:class` trong `.map()` JSX → proven compile + runtime OK (curl 302 + authed 200)

### Còn tồn (đã flag, chưa fix — priority order)
1. ✅ **GIT BASELINE DONE** (2026-05-30): `git init` + commit `c1ad2fc` (478 files). Loại khỏi git: `node_modules`, `.env*`, `baserow-config.json`, `*.bak*`, `docs/archive/MIGRATION_REPORT.md`. Backup `.bak`/`.env.backup` vẫn còn trên đĩa (chỉ untrack). → chi tiết section 🔒 SECURITY AUDIT.
2. ✅ **`/pets/12/personality` 302 loop — ĐÃ ĐIỀU TRA** (2026-05-30): server ĐÚNG, loop là client-side SW reload, KHÔNG active hiện tại, KHÔNG phải nguồn Exit 255. → chi tiết section 🔍 INVESTIGATION 302 LOOP. Fix để mai.
3. **🟢 CTA `/hui-pet/register` route không tồn tại**: glob `web/src/pages/**/hui*` = 0 file. Hiện `href="#"` (Phase 7 A=a). Khi route ready → đổi link 1 dòng.
4. **🟢 Stats Hụi Pet placeholder**: 1,234+ pet / 2.5M+ điểm / 01/07 khai vận — chờ data thật từ user.
5. **🟢 `#ffd56b` coin highlight** (Phase 7): gold-family nhưng không trong palette chính (deep/bright/light). Có thể swap `#f4c842` để khít strict (cosmetic).
6. **🟢 Phase 5.2 orbit SKIPPED**: nếu sau này muốn stars di chuyển → cần fix `transform-box: view-box` (KHÔNG `fill-box`) + cân nhắc perf trên mobile yếu.

---

## 🔒 SECURITY AUDIT (2026-05-30)

- **Secret leak chặn KỊP trước commit đầu tiên:** `.env.backup` (chứa `BASEROW_TOKEN` + `BASEROW_USER_PASSWORD` thật) và `docs/archive/MIGRATION_REPORT.md` (token + password + email plaintext) — đã thêm vào `.gitignore`, KHÔNG vào git.
- **Đã verify HEAD sạch:** quét toàn bộ giá trị secret ≥16 ký tự trong `.env` khắp 478 file tracked → 0 leak. `GEMINI_API_KEY` / `JWT_SECRET` / `R2_*` KHÔNG hardcode đâu cả. Working tree + HEAD clean (`git grep` token = 0).
- **Non-secret bị flag (an toàn, KHÔNG cần lo):** `BASEROW_URL`, `APP_URL`, `API_URL`, `R2_PUBLIC_URL`, `TZ`, `VAPID_SUBJECT`, `GOOGLE_OAUTH_REDIRECT_URI`, `ZALO_OA_ID` — đều là URL/config công khai, vốn dĩ nằm trong source.
- **✅ ĐÃ ROTATE (buổi 2): `BASEROW_TOKEN`** — token cũ đã chết; token mới verify OK (leaderboard 200, 0 lỗi `ERROR_TOKEN_DOES_NOT_EXIST`). `.env.backup` **đã xoá** (chỉ chứa token chết, gitignored). *(KHÔNG ghi giá trị token vào file này.)*
- **⚠️ CÒN TREO: `BASEROW_USER_PASSWORD` CHƯA rotate.** `docs/archive/MIGRATION_REPORT.md` vẫn còn **password live** (gitignored, giữ tới khi rotate xong). **Rủi ro THẤP**: chỉ trên đĩa local · git history sạch (pickaxe 0 commit) · chưa từng push. Khi rotate: đổi pass Baserow → update `.env` → `docker compose up -d --force-recreate` → verify → xoá `MIGRATION_REPORT.md`.
- **Bài học rotate** (xem 🛠️ BÀI HỌC HẠ TẦNG): đổi `.env` PHẢI `docker compose up -d --force-recreate` — `docker restart` KHÔNG nạp lại env_file.

---

## 🔍 INVESTIGATION 302 LOOP (2026-05-30)

- **Loop `/pets/12/personality` KHÔNG active hiện tại** (sau restart web 09:59 chỉ có 1 hit do curl test).
- **Server hành xử ĐÚNG:** request không session → middleware [`middleware.ts:246`] redirect `302 /login?return_to=…`. Không có bug server-side.
- **Root cause = SW reload loop pattern (3 mảnh ghép):**
  - `sw.js:35` — `install → self.skipWaiting()` (SW mới kích hoạt ngay)
  - `sw.js:50` — `activate → self.clients.claim()` (chiếm quyền mọi tab)
  - `Layout.astro:185-189` — `controllerchange → window.location.reload()` (đổi quyền SW → tự reload)
- **Catalyst:** chạy `astro dev` mode (server tưởng `/sw.js` có bản mới liên tục) + **12 lần bump VERSION** (v184→v196) trong arc redesign → SW liên tục activate → reload.
- **ĐÍNH CHÍNH CONTEXT_SYNC cũ:**
  1. "Spam mỗi 0.5-0.7s" thực ra phần lớn là **bot quét lỗ hổng** (`/.env`, `/wp-includes/...`, `/phpinfo.php`), KHÔNG phải /personality.
  2. Loop /personality thật ~**2.45s**, status 302, **0ms** (redirect rẻ, không render SSR) → **KHÔNG đủ gây Exit 255**. Exit 255 nhiều khả năng do `astro dev` + SSR nặng (personality 2.4-2.8s, pet-score 3.7s) + file-watch restart.
- **Mức độ chắc:** CAO cho "client-side SW loop + server OK"; mắt xích "vì sao tái kích hoạt đều 2.45s" cần repro browser mới khẳng định 100%.

---

## 🛠️ BÀI HỌC HẠ TẦNG (2026-05-30 buổi 2 — QUAN TRỌNG, đọc trước khi deploy/đổi env)

1. **Sửa `.astro`/code → KHÔNG hot-reload** (Docker trên Windows): source mount từ Windows host → **inotify miss qua mount** → Vite không thấy file đổi → serve transform CŨ. **Fix: `docker restart vowvet-web`** (Vite cold-start, đọc lại file từ mount). `sw.js` (static) update ngay; chỉ `.astro` SSR kẹt cache Vite.
2. **Đổi `.env` → `docker restart` KHÔNG nạp env**: `env_file` bake lúc TẠO container (`compose up`); `restart` giữ env cũ. **Fix: `docker compose -f docker/docker-compose.yml up -d --force-recreate vowvet-api vowvet-web`** (recreate = đọc lại `.env`). *(Đã dính lúc rotate token: `docker restart` 2 lần vẫn token cũ → tới khi recreate mới nạp token mới.)*
3. **Phân biệt rõ:** code `.astro` → **`docker restart vowvet-web`** · đổi `.env` → **`docker compose up -d --force-recreate`**. KHÔNG lẫn.

---

## 🚨 TOMORROW PRIORITY QUEUE (cập nhật 2026-05-30 buổi 2)

1. **Update Hụi Pet stats placeholder** → số thật (1.234+ pet / 2.5M+ điểm / 01/07 khai vận) khi có data BE.
2. **Chuyển `astro dev` → `astro build` production** — dev server đang làm prod (chậm 1-3.7s/req, file-watch restart). Xem `docker/docker-compose.yml` + `docker/web.Dockerfile`. *(Lưu ý: build mode → sửa code phải rebuild, mất cold-start nhanh — cân nhắc trade-off.)*
3. **(Optional) Rotate `BASEROW_USER_PASSWORD`** — xem 🔒 SECURITY (rủi ro thấp) → xong thì xoá `MIGRATION_REPORT.md`.

**✅ Đã xong buổi 2:** rotate token · xoá `.env.backup` · WOW arc v197-205 (6 commit).
**Backlog (chưa ưu tiên):** Fix SW reload loop (`controllerchange→reload` — chưa gây sự cố thực qua 9 lần bump SW v197-205, hạ ưu tiên) · CTA `/hui-pet/register` route · `#ffd56b` cosmetic · Phase 5.2 orbit · dashboard polish · DESIGN.md · M28 Vet Buddy.

---

## 4. BACKLOG (từ phiên redesign — tham khảo, KHÔNG ưu tiên bằng queue trên)

### ✅ ĐÃ XONG phiên 2026-05-30 (không còn là next-step)
1. ~~git init + baseline commit~~ → **DONE** (commit `c1ad2fc`, 478 files). Xem section 🔒 SECURITY AUDIT.
2. ~~Đào root cause `/pets/12/personality` 302 loop~~ → **DONE** (root cause = SW reload pattern). Xem section 🔍 INVESTIGATION 302 LOOP.

### 🟡 HIGH — vẫn còn (xem 🚨 TOMORROW PRIORITY QUEUE cho thứ tự ưu tiên thật)

3. **Polish `dashboard.astro`** (17KB, entry chính của app) apply design language Pet Score đã proven: 
   - Gold-thread `::before` cho main sections
   - Counter pill gold cho stats
   - 2-tone section (sáng/dark luxury)
   - Strict palette gold/white/ink
   - Backwards fill-mode cho stagger animations
   Hiện dashboard plain Tailwind, không đồng bộ với pet-score.

4. **Viết `DESIGN.md`** lock-in 7 patterns đã proven:
   - Section 2-tone (white card vs dark luxury)
   - Gold-thread `::before` connector
   - Counter pill gold + shimmer convention
   - Animation 3-tier (SMIL > WAAPI > CSS) + reduced-motion guard
   - Backwards fill-mode rule (không both)
   - SSR `.map()` pattern cho SVG (né Alpine x-for-in-SVG pitfall)
   - Palette strict + functional exceptions (emoji/slate)
   → File này thành source-of-truth cho mọi page sau (dashboard, settings, food-brands, …).

### 🟢 MEDIUM — backlog
5. **M28 Vet Buddy** (telehealth + primary care) — pending trong `BUILD_PROGRESS.json`. Scope sẵn: 3 tables, 8 mock vets seed, bot triage logic. ~2 ngày work. *(Hoặc thay bằng feature khác user ưu tiên hơn.)*

---

## 5. MEMORY FILES (đọc tiếp khi cần)
- `~/.claude/projects/C--docker-vowvet/memory/MEMORY.md` — index toàn bộ
- `memory/feedback_strict_brief.md` — implement detailed spec verbatim
- `memory/design_wow_animation_playbook.md` — SMIL > WAAPI > CSS 3-tier
- `memory/learning_alpine_scope.md` — Alpine SVG/importNode pitfall (lý do dùng SSR `.map()` cho stars)
- `memory/project_stack.md` — Astro+Bun+Hono+Baserow+R2 conventions
- `memory/user_profile.md` — non-coder owner, prefers being asked when unclear, exhausted by over-engineering

---

## 6. SESSION HEALTH

- **Phases applied (theo thứ tự)**: 1 (setup) → 2 (Hero) → 2-after (fix VV monogram/flourish) → 3 (Achievement) → 4 (Rec) → 4.5 (polish) → 4.5.1 (tweaks) → 5 (Constellation) → 5.1 (galaxy + ticker) → 5.3 (xóa nebula, SKIP 5.2 orbit) → 6 (Trend-Community merge) → 7 (Hụi Pet teaser) → 8 (cleanup tier accordion)
- **Protocol mỗi phase**: plan + diff text → user APPROVE → backup `.phaseN-pre.bak` → Edit tool literal match → 6 checkpoint (backup/size/markers/SW/curl 302/node new Function) → restart vowvet-web → authed render 200 → screenshot user verify → next phase
- **11 backup files** trong scope: `pet-score.astro.{phase2,phase3,phase4,phase45,phase451,phase5,phase51,phase53,phase6,phase7,phase8}-pre.bak`
- **SW version progression**: v184 → v185 → v186 → v187 → v188 → v189 → v190 → v191 → **v193** (skip v192 = Phase 5.2 skipped) → v194 → v195 → **v196** (final)
- **File pet-score.astro size**: 26.8KB (v184 start) → 79.1KB (v196 end). Tăng chủ yếu inline CSS các phase + SSR stars data + ticker logic + Hụi Pet teaser.
- **Verification record**: 6/6 checkpoint pass mỗi phase. Authed render `[200] /pets/12/pet-score` verified Phase 2, 5, 5.1, 8 (logs `vowvet-web --tail`).
- **ZERO rollback** cần dùng. Backup mechanism proven nhưng chưa kích hoạt thật.
- **Palette discipline**: 4 lần phát hiện màu lệch (red penalty / purple nebula / navy bg / emerald-red delta) → user enforce strict mỗi lần → tôi flag + override. Cuối phiên: 4/4 color check `#1a1a2e/8b5cf6/rgba(220,38,38)/rgba(16,185,129)` = 0.
- **Lesson lớn**: SSR `.map()` cho SVG là pattern an toàn hơn Alpine `<template x-for>` trong SVG (project memory đã ghi pitfall; Phase 5 áp dụng → curl 302 + 200 confirm).

---

*Cuối CONTEXT_SYNC. Phiên kế tiếp đọc file này TRƯỚC khi đụng `pet-score.astro` hoặc các trang khác cần áp design language.*
