# CONTEXT_SYNC — VowVet / Mon Min Pet

> Snapshot kỹ thuật cuối phiên 2026-05-30 — **Pet Score redesign arc Phase 1→8 HOÀN TẤT**.
> Phiên này KHÔNG đụng SEO/Schema — toàn bộ là visual/UX redesign trang `/pets/[id]/pet-score`.
> Đọc TRƯỚC khi tiếp tục đụng pet-score.astro.

---

## 1. TRẠNG THÁI HIỆN TẠI — Pet Score redesign HOÀN CHỈNH

**File chính**: `web/src/pages/pets/[id]/pet-score.astro` (~79KB, 335 dòng inline JS `scorePage()`, ~1100 dòng tổng).
**SW version cuối**: `vowvet-v196-phase8-cleanup` (`web/public/sw.js` line 17).
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
1. **🔴 NO `.git` history**: tất cả 8 phase + 11 backup files KHÔNG có git baseline. Rủi ro cao nếu cần revert lùi nhiều phase.
2. **🟡 `/pets/12/personality` redirect loop**: vowvet-web logs spam `[302] /pets/12/personality` mỗi 0.5-0.7s — phát hiện đầu phiên. Có thể source của vowvet-web Exit 255 trước. User pending note "đào sau Phase 10".
3. **🟢 CTA `/hui-pet/register` route không tồn tại**: glob `web/src/pages/**/hui*` = 0 file. Hiện `href="#"` (Phase 7 A=a). Khi route ready → đổi link 1 dòng.
4. **🟢 Stats Hụi Pet placeholder**: 1,234+ pet / 2.5M+ điểm / 01/07 khai vận — chờ data thật từ user.
5. **🟢 `#ffd56b` coin highlight** (Phase 7): gold-family nhưng không trong palette chính (deep/bright/light). Có thể swap `#f4c842` để khít strict (cosmetic).
6. **🟢 Phase 5.2 orbit SKIPPED**: nếu sau này muốn stars di chuyển → cần fix `transform-box: view-box` (KHÔNG `fill-box`) + cân nhắc perf trên mobile yếu.

---

## 4. NEXT STEPS (5 nhiệm vụ tiếp theo, theo priority)

### 🔴 CRITICAL — làm NGAY trước mọi thứ khác
1. **`git init` + baseline commit** trong `C:/docker/vowvet/`. Trang Pet Score sau 8 phase đã production-ready → đây là moment đúng để chốt snapshot lịch sử. Lệnh:
   ```bash
   cd C:/docker/vowvet
   git init
   git add -A
   git commit -m "feat(pet-score): complete redesign Phase 1-8 — Hero Cert XL + Achievement Strip + Recommendations + Constellation Star Map + Trend-Community merged + Hụi Pet teaser + tier cleanup"
   ```
   Sau đó mỗi phase/feature → commit riêng. Có thể `git branch backup-bak-files` rồi `git rm *.bak` để gọn (backup giờ trong git history).

### 🟡 HIGH — sau khi có git baseline
2. **Đào root cause `/pets/12/personality` 302 loop**: vowvet-web logs cho thấy request mỗi 0.5-0.7s. Hypothesis: setInterval poll trong tab cũ chưa close, hoặc cookie expired → redirect /login loop, hoặc Alpine x-init recurse. Audit personality.astro + check Network tab khi mở page.

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
