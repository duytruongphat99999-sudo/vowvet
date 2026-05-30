# Climate Alerts (`/alerts`) — Redesign Report

**Date**: 2026-05-21
**Scope**: Full brand-sync redesign of the climate alerts page per mega-prompt
**File**: `web/src/pages/alerts.astro` (single file — not `/climate/alerts`)

---

## Audit findings (vs mega-prompt assumptions)

| Assumption                          | Reality                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Route is `/climate/alerts`          | Route is `/alerts` (single-segment). `cta_link: "/alerts"` already wired across the app.  |
| 3 severity tiers (critical/warning/info) | **4 tiers** — `info / warning / urgent / critical` — confirmed in `shared/zod-schemas/m5.ts` |
| API endpoint is `/api/v1/climate/alerts?filter=...` | API is `/api/v1/alerts/today` + `/history?days=N` + `/:id/dismiss` |
| Schema field `read_at` + `created_at` | Real fields: `dismissed_at` + `triggered_at`                                              |
| API returns `data_points` + `advisory` + `counts` | API returns `weather_snapshot` (raw JSON) + `pet_factors` (raw JSON). No `counts`. |
| Need new climate.ts API route        | Not needed — existing `alerts.ts` route serves all needs                                  |

**Decision**: kept the existing route paths + schema. The new UI extracts `data_points` and `advisory` client-side from `weather_snapshot` / `pet_factors` JSON. `counts` is computed from the SSR-pre-fetched array in Alpine — no API change required.

---

## What changed

### 1. Sticky header

```astro
<header class="bg-white border-b border-slate-200 sticky top-0 z-30">
  <a href="/dashboard">← Dashboard</a>
  <h1 class="font-display italic">
    🌡 (FeatureIcon thermometer in gold cream chip)  Cảnh báo khí hậu
  </h1>
  <a href="/settings" aria-label="Cài đặt thông báo"> (settings SVG) </a>
</header>
```

- Was: in-flow header, no icon, settings shown as raw 「⚙️」 emoji
- Now: sticky on scroll, Fraunces italic title, gold thermometer chip, SVG settings icon

### 2. Filter tabs + Refresh

- Was: 3 pill buttons `bg-sky-600` (active) or `bg-white` (inactive); "Tải lại" link was `text-sky-600`
- Now: 3 pill buttons `bg-mmp-ink` (active) / `bg-white border-slate-200 hover:border-mmp-ink` (inactive); each shows a count badge (`{counts[key]}`); "Tải lại" link is **gold** (`var(--c-gold)`) with spinning SVG icon while loading

### 3. Card hierarchy (single severity color contract)

| Severity   | Card bg        | Border        | Stripe        | Icon container        | Badge bg          | Badge text      | VN label  |
| ---------- | -------------- | ------------- | ------------- | --------------------- | ----------------- | --------------- | --------- |
| `info`     | `bg-mmp-cream` | `amber-100`   | gold          | white + amber-200 border | gold `#ecb921` | ink             | Tham khảo |
| `warning`  | `bg-amber-50`  | `amber-200`   | amber-400     | `bg-amber-100`        | amber-50          | amber-700       | Chú ý     |
| `urgent`   | `bg-amber-50`  | `amber-300`   | amber-500     | `bg-amber-200`        | amber-100         | amber-800       | Khẩn cấp  |
| `critical` | `bg-red-50`    | `red-300` + `animate-pulse-urgent-critical` | red-500 | `bg-red-100` | red-50 | red-700 | Nguy hiểm |

**Zero blue / cyan / sky** anywhere in the new source. Verified via grep:

```
bg-blue-:   0   text-blue-: 0
bg-cyan-:   0   text-cyan-: 0
bg-sky-:    0   text-sky-:  0
text-mmp-ink:  12
bg-mmp-cream:   6
var(--c-gold):  4
```

### 4. Card layout: icon + title + meta + body + data + advisory + actions

Each card renders (in order):

1. **Severity stripe** — 1px left-edge color band, rounded to match the card
2. **Top row** — 12×12 icon container (severity-tinted) + title (`font-bold text-mmp-ink`) + severity Badge (inline, dotted)
3. **Meta line** — `pet_name · location · time-ago`
4. **Body** — `a.message` (slate-700 leading-relaxed)
5. **Data row** (only if any of `temp / feels_like / aqi / humidity` present) — white/70 backdrop pill with SVG-prefixed stat chips. `feels_like` is highlighted red, temp/AQI/humidity slate
6. **Advisory** (only if `pet_factors.recommendation || .advisory || .action`) — white card with gold lightbulb icon + "KHUYẾN NGHỊ" eyebrow uppercase
7. **Actions** — "Xem pet →" button (`bg-mmp-ink text-white`) + "Đánh dấu đã đọc" ghost (`border-slate-200 hover:border-mmp-ink hover:bg-mmp-cream`) OR "Đã đọc {time-ago}" with emerald check

### 5. Empty state

- Was: `<p class="text-6xl mb-3">💚</p>` + 2 short lines
- Now: 64×64 rounded-2xl `bg-emerald-50` with a `sun-rays` SVG; **3 different titles + messages** depending on state:
  - No alerts at all → "Pet của bạn đang an toàn" / "Thời tiết hôm nay an toàn cho bé…"
  - Filtered "active" empty → "Không còn cảnh báo nào" / "Bạn đã xử lý hết các cảnh báo hoạt động trong 7 ngày qua."
  - Filtered "dismissed" empty → "Chưa có cảnh báo đã đọc" / "Khi bạn đánh dấu đã đọc một cảnh báo, nó sẽ xuất hiện ở đây."

### 6. Footer settings link

- Was: `text-sky-600 hover:text-sky-700` plain text link
- Now: `var(--c-gold)` with shield SVG + chevron, `hover:underline`

### 7. Misc polish

- Background: `bg-slate-50` → `bg-mmp-cream` (matches Mon Min brand)
- Container padding: `py-6` page wrapper + `py-12` bottom padding for breathing room
- Read alerts use `opacity-60` (was: no visual differentiation)
- Critical alerts get `animate-pulse-urgent-critical` (existing CSS animation defined in `styles/global.css`)
- Page-load quest hook `track/check-weather` preserved verbatim

---

## API mapping (no backend changes)

The new UI extracts richer data from existing API fields:

| UI needs           | Source field                                          |
| ------------------ | ----------------------------------------------------- |
| Severity tier      | `a.severity` (4 enum values)                          |
| Type icon + label  | `a.alert_type` (5 enum values)                        |
| Title / body       | `a.title` / `a.message`                               |
| Pet name           | `a.pet_name`                                          |
| Location           | `a.weather_snapshot.city_label` ?? `.city` ?? `.location` |
| Time-ago           | `a.triggered_at` / `a.dismissed_at`                   |
| Temp data          | `weather_snapshot.temp_min/max` ?? `.temperature` ?? `.temp` |
| Feels-like         | `weather_snapshot.feels_like` ?? `.heat_index`        |
| AQI                | `weather_snapshot.aqi` ?? `.pm25`                     |
| Humidity           | `weather_snapshot.humidity`                           |
| Advisory           | `pet_factors.recommendation` ?? `.advisory` ?? `.action` |
| Counts (tab badges)| Client-computed from full alerts[] array              |
| Refresh action     | `GET /api/v1/alerts/history?days=7`                   |
| Mark-read action   | `POST /api/v1/alerts/:id/dismiss`                     |

All data extractors return `null` gracefully so missing fields just hide the chip / row.

---

## Acceptance checklist (per mega-prompt)

| # | Requirement                                                          | Status |
| - | -------------------------------------------------------------------- | :---:  |
| 1 | Header sticky với title icon + settings link                         |   ✓    |
| 2 | Tabs brand (Tất cả / Hoạt động / Đã đọc) với count badge             |   ✓    |
| 3 | "Tải lại" link vv-gold thay vì blue                                  |   ✓    |
| 4 | Card severity colors đúng (critical=red, warning/urgent=amber, info=cream+gold) |   ✓    |
| 5 | Card layout: icon container + title + meta + body + data row + advisory + actions |   ✓    |
| 6 | Data row (temperature range, feels_like, AQI, humidity) visual rõ    |   ✓    |
| 7 | Advisory box "💡 Khuyến nghị" tách riêng với bg-white                |   ✓    |
| 8 | Buttons (Xem pet, Đánh dấu đã đọc) brand variants                    |   ✓    |
| 9 | Empty state khi không có alert (3 variants)                          |   ✓    |
| 10 | Read alert opacity 60%                                              |   ✓    |
| 11 | Footer "Cài đặt thông báo" gold accent thay vì blue                 |   ✓    |
| 12 | Mark read AJAX (POST + optimistic UI update)                         |   ✓    |
| 13 | Mobile responsive (max-w-3xl, flex-wrap, sm: breakpoints)           |   ✓    |
| 14 | No blue/cyan/purple leftover                                         |   ✓ (0 matches in source) |

---

## Verification

```bash
$ curl -sIL http://127.0.0.1:4322/alerts | grep -iE "^(HTTP|location)"
HTTP/1.1 302 Found
Location: /login?return_to=%2Falerts
HTTP/1.1 200 OK
```

Auth-gated as expected. Source-file verification:

```
=== Forbidden urgency colors in source ===
bg-blue-:   0   text-blue-: 0
bg-cyan-:   0   text-cyan-: 0
bg-sky-:    0   text-sky-:  0

=== Brand tokens in source ===
text-mmp-ink:  12
bg-mmp-cream:   6
var(--c-gold):  4
font-display:   1

=== Required strings in source ===
Cảnh báo khí hậu: 4
Severity labels (Tham khảo / Chú ý / Khẩn cấp / Nguy hiểm): 5
Cài đặt thông báo: 2
Empty state copy:  3 (no-alerts / active-empty / dismissed-empty)
Khuyến nghị:       1
Tải lại:           2
```

No container errors in `docker logs vowvet-web --since 60s`.

---

## Files changed

- **Modified**: `web/src/pages/alerts.astro` (full rewrite — 240 lines)

No API or migration changes. Existing `alerts.ts` route + `alerts.ts` lib are untouched.

## Out of scope

- `/login` page still has dirty sky/blue colors (visible in the auth-redirect HTML). Not part of this redesign — separate task if needed.
- `weather_snapshot` JSON shape varies by alert type; if you discover a field name the extractor missed (e.g. `uv_index`), add it to the corresponding `dataXxx()` helper.
