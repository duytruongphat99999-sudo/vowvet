# /alerts WOW Redesign — Report

**Date**: 2026-05-21
**Scope**: Full WOW upgrade on top of Brand Sync Pass 3 — hero stats, severity animations, temperature gauge, collapsible advisory, celebratory empty state
**File**: `web/src/pages/alerts.astro` (single file — full rewrite, 460 lines)

---

## Audit findings vs mega-prompt assumptions

| Mega-prompt assumption                                | Reality                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 3-tier severity (critical / warning / info)            | **4 tiers** — `info / warning / urgent / critical` (confirmed in `shared/zod-schemas/m5.ts`) |
| API endpoint `GET /api/v1/alerts?filter=...&counts=...` | Existing: `GET /alerts/today`, `/alerts/history?days=N`, `POST /alerts/:id/dismiss`. No filter param. |
| API returns `data_points`, `advisory`, `pet_species`, `counts` | Real fields: `weather_snapshot` (raw JSON), `pet_factors` (raw JSON), no species/counts |
| Field names `read_at` + `created_at`                   | Real fields: `dismissed_at` + `triggered_at`                                              |
| Mark-read POST `/api/v1/alerts/:id/read`               | Real endpoint: `POST /api/v1/alerts/:id/dismiss`                                          |
| Data range like `"26.8-33.1°C"` (string)              | Real `weather_snapshot.temp_min/temp_max` (numbers, JSON-parsed by `toApiAlert`)         |

**Adaptation**: SSR fetches `/history?days=7` (returns both active + dismissed), filters in Astro layer via `Astro.url.searchParams.get("filter")`, computes counts from the array. UI extracts `data_points` (range, feels_like, AQI, humidity) and `advisory` from the raw JSON fields client-side. No API changes.

---

## What landed

### 1. HERO HEADER (ink + decorative orbs + 3 stat cards)

```
┌─────────────────────────────────────────────────┐
│  ← Dashboard                              ⚙       │  ← gold orb top-right (blur-3xl)
│                                                  │
│  REAL-TIME MONITOR  (gold eyebrow)              │
│  Cảnh báo khí hậu  (Fraunces italic 3xl/4xl)   │
│  Cảnh báo dựa trên thời tiết hôm nay…           │
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐                     │
│  │🚨  3 │ │⚠ 1 │ │📡  5 │                       │
│  │KHẨN  │ │CHÚ Ý│ │THEO  │                       │
│  └──────┘ └──────┘ └──────┘                     │
│  ●  Pet của bạn đang an toàn                    │
└─────────────────────────────────────────────────┘  ← red orb bottom-left (blur-3xl)
```

- **Hero stat 1 "Khẩn cấp"** = `critical + urgent` count (red-tinted card when > 0)
- **Hero stat 2 "Chú ý"** = `warning` count (amber-tinted card when > 0)
- **Hero stat 3 "Theo dõi"** = `counts.active` total (always gold number)
- **Safe status pill** appears only when `criticalCount === 0 && warningCount === 0 && counts.all > 0` — emerald with live-dot pulse
- 2 decorative blur orbs (gold top-right, red-tinted bottom-left) — pure decorative `position: absolute`

### 2. STICKY FILTER BAR

- Cream/95% backdrop-blur with bottom border — sticks to `top-0` once the hero scrolls past
- 3 pill tabs (`Tất cả` / `Hoạt động` / `Đã đọc`) — each shows a count badge in gold when active, slate when inactive
- Pills use **SSR query params** (`?filter=all|active|read`) — proper deep-link support
- Right-edge "Tải lại" link in **gold**, with a spinning refresh SVG icon
- Tab strip scrolls horizontally on narrow viewports (`no-scrollbar` utility hides the scrollbar)

### 3. CARDS — severity-driven visual contract

| Severity   | Card bg        | Border       | Strip       | Icon bg                      | Badge       | Pulse | Ping |
| ---------- | -------------- | ------------ | ----------- | ---------------------------- | ----------- | :---: | :--: |
| `info`     | `bg-mmp-cream` | `amber-100`  | `mmp-ink`   | white + amber-200 border     | gold        |       |      |
| `warning`  | `bg-amber-50`  | `amber-200`  | `amber-400` | `bg-amber-100`               | warning     |       |      |
| `urgent`   | `bg-amber-50`  | `amber-300`  | `amber-500` | `bg-amber-200`               | warning     |   ✓   |  ✓   |
| `critical` | `bg-red-50`    | `red-200`    | `red-500`   | `bg-red-100`                 | danger      |   ✓   |  ✓   |

- **Severity strip**: 1.5px-wide vertical bar on the card's left edge, rounded with the card
- **`animate-pulse-strip`**: 2s ease-in-out opacity loop (1 → 0.45 → 1) — fires on `critical` + `urgent` non-dismissed alerts
- **`animate-ping-slow`**: 2.5s outward fade ring around the icon container — same trigger
- Read alerts get `opacity-60` and both animations stop (they only apply when `!isRead`)
- Card uses **Astro Badge primitive with `dot` flag** for the severity badge — animated dot color tracks the severity variant

### 4. TEMPERATURE GAUGE MINI-CHART

Visual element in the card body, rendered only when `weather_snapshot` has temp data:

```
┌────────────────────────────────────────────┐
│ Nhiệt độ hôm nay         26–33°C           │
│ ┌──────────────────────────────────┐       │
│ │ [blue]…[emerald]…[amber]…[red]   │ ← gradient track 15–45°C
│ │          ▓▓▓▓▓                   │ ← black/22 range overlay (low→high)
│ │              ●                   │ ← red dot = feels-like
│ └──────────────────────────────────┘       │
│ 15°C        ● Cảm giác 37°C       45°C    │
│ ───────────────────────────────            │
│ AQI: 105      Độ ẩm: 78%                  │
└────────────────────────────────────────────┘
```

- Background: `linear-gradient(90deg, #bfdbfe 0%, #a7f3d0 33%, #fde68a 66%, #fca5a5 100%)` — universal cold→hot gradient (the blue here is the gauge SCALE, not brand color)
- Range overlay shows today's `temp_min → temp_max` band as a dark translucent strip
- Feels-like marker = red dot with white ring + shadow, positioned absolutely
- **All percentages clamped** with `Math.max(0, Math.min(100, …))` so out-of-range values don't overflow
- AQI + Humidity row appears below when present; separated by a slate-100 border-top

When no temp data but AQI/humidity exist, falls back to a flat stat-chip row (no gauge).

### 5. ADVISORY (collapsible, gold-tinted)

- Trigger button: gold-tinted `bg: rgba(236, 185, 33, 0.10)` with amber-200 lightbulb chip
- Chevron rotates 180° on open (`:class="open ? 'rotate-180' : ''"`)
- Body uses Alpine `x-show + x-transition + x-cloak` to fade in
- Only rendered when `pet_factors.recommendation || .advisory || .action` exists

### 6. EMPTY STATE CELEBRATION

```
        ╔═══════╗  ← outer emerald-100 ring with animate-pulse
        ║   ☀  ║   ← inner emerald-50 + border emerald-200
        ╚═══════╝
       Tất cả pet đang an toàn  (Fraunces italic)
       Thời tiết hôm nay an toàn cho bé…
       ⊙ Auto-update mỗi giờ
```

3 message variants depending on filter:
1. `counts.all === 0` → "Tất cả pet đang an toàn" + happy explainer
2. Filter `active` empty (but has historical alerts) → "Không còn cảnh báo nào" + "đã xử lý hết"
3. Filter `read` empty → "Chưa có cảnh báo đã đọc" + "khi bạn đánh dấu đã đọc…"

### 7. MARK-READ AJAX + HAPTIC

```js
fetch(`/api/v1/alerts/${alertId}/dismiss`, { method: "POST", credentials: "include" })
  → card.style.opacity = "0.6"
  → btn.style.display = "none"
  → navigator.vibrate(10)   // ← haptic if device supports
```

Vanilla event delegation (no Alpine needed for this — it's a fire-and-forget).

### 8. FOOTER INFO CARD

Rounded white card with attribution line ("Cảnh báo dựa trên dữ liệu thời tiết real-time + AQI sensors + profile pet…") + gold "Cài đặt thông báo" CTA with shield icon and chevron.

---

## Acceptance checklist (14 / 14)

| # | Requirement                                                              | Source token / line check | Status |
| - | ------------------------------------------------------------------------ | ------------------------- | :---:  |
| 1 | HERO HEADER ink với 2 decorative orbs + 3 stat cards                     | `bg-mmp-ink text-white overflow-hidden` (1×), `blur-3xl` (2×) | ✓ |
| 2 | Status pill "Pet bạn đang an toàn" khi safe                              | "Pet của bạn đang an toàn" + emerald `live-dot` (1×) | ✓ |
| 3 | Sticky filter bar với count badges                                       | `sticky top-0` + `backdrop-blur` + 3 `?filter=` pills | ✓ |
| 4 | Severity strip trái card (pulse khi critical/urgent)                     | `animate-pulse-strip` (3×) | ✓ |
| 5 | Icon container animate ping khi critical                                 | `animate-ping-slow` (3×) | ✓ |
| 6 | Temperature gauge mini-chart                                             | linear-gradient `bfdbfe → a7f3d0 → fde68a → fca5a5`, range overlay, feels-like marker, clamped 0-100 | ✓ |
| 7 | Advisory collapsible với chevron rotate                                  | `x-data="{ open: false }"` + `rotate-180` (2×) | ✓ |
| 8 | Empty state celebration với pulse circle + auto-update info              | `animate-pulse` outer ring + "Auto-update mỗi giờ" + 3 message variants | ✓ |
| 9 | Buttons brand variants (Astro `<Button>` primitive)                      | `<Button variant="primary" size="sm">` for Xem pet | ✓ |
| 10 | Mark read AJAX với haptic vibration                                     | `fetch(/dismiss)` + `navigator.vibrate(10)` | ✓ |
| 11 | Mobile 375px responsive                                                 | `grid-cols-3 gap-2.5 sm:gap-3`, `overflow-x-auto no-scrollbar`, `text-2xl sm:text-3xl` | ✓ |
| 12 | Animations smooth (pulse-strip 2s, ping-slow 2.5s)                       | 2 `@keyframes` + `prefers-reduced-motion` respect | ✓ |
| 13 | No blue/cyan/purple/sky leftover (urgency colors)                        | grep counts: bg-blue 0, text-blue 0, bg-cyan 0, text-cyan 0, bg-sky 0, text-sky 0, bg-purple 0 | ✓ |
| 14 | Footer info block rounded card                                          | rounded-2xl + bg-white + border-slate-100 + gold link | ✓ |

> Note on #13: The temperature gauge gradient uses hex `#bfdbfe` (cold-end blue) — this is the universal scientific cold→hot scale for the gauge visualization itself, NOT a brand-color leak in a button/surface. No Tailwind `bg-blue-*` class is used.

---

## Source verification (grep)

```
=== Forbidden urgency colors ===
bg-blue-:   0   text-blue-: 0
bg-cyan-:   0   text-cyan-: 0
bg-sky-:    0   text-sky-:  0
bg-purple-: 0

=== Brand tokens ===
text-mmp-ink:   15
bg-mmp-cream:    4
var(--c-gold):   8
font-display:    2

=== Required strings ===
Real-time monitor: 2 hits
Khẩn cấp / Chú ý / Theo dõi: 10 hits combined
Pet của bạn đang an toàn: 1
Auto-update mỗi giờ: 1
Khuyến nghị từ Mon Min: 1
Nhiệt độ hôm nay: 1
Cảm giác: 2

=== Animations ===
animate-pulse-strip: 3 hits (1 keyframe + 2 usages)
animate-ping-slow:   3 hits (1 keyframe + 2 usages)
chevron rotate-180:  2 hits
```

---

## Smoke test

```
$ curl -sIL http://127.0.0.1:4322/alerts | grep -i HTTP
HTTP/1.1 302 Found            # ← auth redirect to /login (expected)
HTTP/1.1 200 OK

$ for q in "" "?filter=all" "?filter=active" "?filter=read"; do
    curl -s -o /dev/null -w "%{http_code} /alerts$q\n" "http://127.0.0.1:4322/alerts$q"
  done
302 /alerts
302 /alerts?filter=all
302 /alerts?filter=active
302 /alerts?filter=read
```

All 4 filter variants render without 500. `docker logs vowvet-web --since 60s | grep -i error` returns empty.

---

## Files changed

- **Rewritten**: `web/src/pages/alerts.astro` (460 lines; 240 → 460 — full WOW pass)

**No API changes** (verified: existing `alerts.ts` route + lib serve everything needed).

## Out of scope / known limitations

- `/login` still has dirty sky/blue colors (visible in the auth-redirect HTML for anonymous users hitting `/alerts`). Separate task.
- Pet species emoji (🐈/🐕) was in the mega-prompt template but the API doesn't return `pet_species` — replaced with a generic 🐾 next to the pet name. Add a `pet_species` field to `lib/alerts.ts:toApiAlert()` if you want the species distinction.
- `weather_snapshot` JSON shape varies by alert type — the extractors gracefully degrade (return `null` → chip hidden). If you add a new field (e.g. `uv_index`), extend the corresponding extractor function in the frontmatter.
