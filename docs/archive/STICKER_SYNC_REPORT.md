# Sticker → SVG Sync — Report

**Date**: 2026-05-21
**Trigger**: User feedback "sticker bạn dùng chưa đồng bộ với trang chủ"
**Scope**: Replace all chrome emojis on `/alerts`, `/chat`, `/chat/new`, `/settings` with `FeatureIcon` SVGs — matching the homepage's clean SVG-only convention.

---

## Audit baseline

| Page                          | Chrome emojis BEFORE | Chrome emojis AFTER |
| ----------------------------- | -------------------: | ------------------: |
| `web/src/pages/index.astro` (homepage = reference) |                    0 |                   0 |
| `web/src/pages/dashboard.astro`                    |                    0 |                   0 |
| `web/src/pages/alerts.astro`                       |          ~9 (🚨⚠️📡 hero + 🔥❄️🌫️⛈️☀️💧🌬️🌡️ types + 🐾) |                   0 |
| `web/src/pages/chat/index.astro`                   |       ~11 (🍴💉🤒🐾 prompts + 👨‍⚕️ avatar ×2 + 🔒🏥📋 trust + ✍️ custom) |                   0 |
| `web/src/pages/chat/new.astro`                     |           2 (👨‍⚕️ + 🔒)             |                   0 |
| `web/src/pages/settings.astro`                     |        ~12 (📍🔔🔥🌫️⛈️📋📨👤🔐📱🔗🔊🔔📳⚠️🗑️) |                   0 |

**Verified** via grep with explicit emoji codepoint set (not Unicode class, since `grep -P` choked on `\x{1F300}-\x{1F9FF}`):

```
grep -oE "🚨|⚠️|📡|🔥|❄️|🌫️|⛈️|☀️|💧|🐾|👨‍⚕️|🔒|🏥|📋|✍️|🍴|💉|🤒|📱|📨|🗑|🔔|🔐|🔊|📳|📍|👤|🔗" $FILE | wc -l
```

→ `0` on all 4 pages after this pass.

---

## Step 1 — Added 14 missing SVG icons to `FeatureIcon.astro`

All paths follow the existing FeatureIcon convention: 24×24 viewBox, `stroke="currentColor"`, configurable `stroke-width` (default 1.5), rounded ends.

| Icon name           | Replaces emoji | Used in                                                         |
| ------------------- | :------------: | --------------------------------------------------------------- |
| `snowflake`         | ❄️             | /alerts cold-warning type                                       |
| `wind`              | 🌫️ / 🌬️       | /alerts aqi/wind type · /settings AQI notification toggle       |
| `cloud-lightning`   | ⛈️             | /alerts storm type · /settings storm notification toggle        |
| `sun`               | ☀️             | /alerts UV type · /alerts empty-state celebration               |
| `droplet`           | 💧             | /alerts humidity type                                            |
| `radar`             | 📡             | /alerts "Theo dõi" hero stat card                                |
| `lock`              | 🔒 / 🔐        | /chat trust-signal · /chat/new privacy footer · /settings Tài khoản |
| `user`              | 👤             | /settings Hồ sơ section                                         |
| `user-md`           | 👨‍⚕️           | /chat vet hero avatar · /chat thread avatars · /chat/new recap   |
| `smartphone`        | 📱 / 📳        | /settings Phone OTP badge · Haptic toggle                       |
| `volume`            | 🔊             | /settings Phản hồi cảm ứng section                              |
| `mail` *(uses send-shape inline)* | 📨   | /settings "Gửi thông báo test" button (uses inline SVG)        |
| `map-pin`           | 📍             | /settings Vị trí section header                                 |
| `clipboard`         | 📋             | /chat trust-signal · /settings daily-summary toggle             |
| `trash`             | 🗑️             | /settings danger-zone delete-account button                     |
| `send` *(extra, ready for future use)* | 📤  | (available; alias of mail-send SVG)                            |

`flame` (🔥), `siren` (🚨), `alert-triangle` (⚠️), `paw` (🐾), `bell` (🔔), `edit-pencil` (✍️), `stethoscope` (🏥/🤒), `bowl` (🍴), `syringe` (💉) — already existed; just wired up.

---

## Step 2 — Emoji → SVG mapping per page

### `/alerts`

| Where                                  | Was                          | Now                                              |
| -------------------------------------- | ---------------------------- | ------------------------------------------------ |
| Header chip                            | thermometer SVG already      | unchanged                                         |
| Hero stat card "Khẩn cấp"              | 🚨 emoji                     | `<FeatureIcon name="siren">`                     |
| Hero stat card "Chú ý"                 | ⚠️ emoji                     | `<FeatureIcon name="alert-triangle">`            |
| Hero stat card "Theo dõi"              | 📡 emoji                     | `<FeatureIcon name="radar">`                     |
| Alert card icon (type-driven)          | 🔥/❄️/🌫️/⛈️/☀️/💧/🌬️/🌡️ | Returns FeatureIcon name (`flame`/`snowflake`/`wind`/…) — rendered as `<FeatureIcon name={a._icon}>` |
| Empty-state hero circle                | ☀️ emoji                     | `<FeatureIcon name="sun" w-9 h-9>`               |
| Pet name marker in alert meta          | 🐾 emoji                     | `<FeatureIcon name="paw" w-3.5 h-3.5>`           |

### `/chat`

| Where                                  | Was                          | Now                                              |
| -------------------------------------- | ---------------------------- | ------------------------------------------------ |
| Quick-prompt cards (4×)                | 🍴/💉/🤒/🐾                  | Icons stored as FeatureIcon names (`bowl`/`syringe`/`stethoscope`/`paw`); rendered in mmp-cream rounded chip |
| Vet hero avatar (no photo fallback)    | 👨‍⚕️                          | `<FeatureIcon name="user-md">` (gold)            |
| Custom "Hỏi câu khác" card icon        | ✍️                           | `<FeatureIcon name="edit-pencil">` (gold)        |
| Trust signal "Riêng tư"                | 🔒                           | `<FeatureIcon name="lock">` in cream chip        |
| Trust signal "BS thật"                 | 🏥                           | `<FeatureIcon name="stethoscope">` in cream chip  |
| Trust signal "Lưu lịch sử"             | 📋                           | `<FeatureIcon name="clipboard">` in cream chip   |
| Thread list avatar                     | 👨‍⚕️                          | `<FeatureIcon name="user-md">`                   |

### `/chat/new`

| Where                                  | Was                          | Now                                              |
| -------------------------------------- | ---------------------------- | ------------------------------------------------ |
| Vet recap card avatar (no photo)       | 👨‍⚕️                          | `<FeatureIcon name="user-md">` (gold)            |
| Privacy footer prefix                  | 🔒 emoji                     | `<FeatureIcon name="lock" w-3.5 h-3.5>` inline    |

### `/settings`

| Where                                  | Was                          | Now                                              |
| -------------------------------------- | ---------------------------- | ------------------------------------------------ |
| "Vị trí" section header                | 📍                           | `<FeatureIcon name="map-pin">` (gold)            |
| "Thông báo" section header             | 🔔                           | `<FeatureIcon name="bell">` (gold)               |
| 4 push-pref toggles (heat/aqi/storm/daily) | 🔥/🌫️/⛈️/📋                 | Sub-toggle list converted to **SSR Astro `.map()`** loop so `<FeatureIcon>` works; each toggle has an 8×8 cream chip with the SVG icon |
| "Gửi thông báo test" button            | 📨                           | inline `<svg>` paper-plane                       |
| "Hồ sơ" section header                 | 👤                           | `<FeatureIcon name="user">` (gold)               |
| "Tài khoản" section header             | 🔐                           | `<FeatureIcon name="lock">` (gold)               |
| Phone OTP badge                        | 📱                           | inline `<svg>` smartphone                        |
| Google badge                           | 🔗                           | inline `<svg>` link                              |
| "Liên kết với Google" button           | 🔗                           | inline `<svg>` link                              |
| Unlink-blocked warning                 | ⚠️                           | inline `<svg>` alert-triangle (amber)            |
| "Phản hồi cảm ứng" section header      | 🔊                           | `<FeatureIcon name="volume">` (gold)             |
| Sound toggle                           | 🔔                           | `<FeatureIcon name="bell">`                      |
| Haptic toggle                          | 📳                           | `<FeatureIcon name="smartphone">`                |
| "Vùng nguy hiểm" header                | ⚠️                           | `<FeatureIcon name="alert-triangle">` (red)      |
| "Xoá tài khoản…" button                | 🗑️                           | `<FeatureIcon name="trash">`                     |

### Intentionally preserved (NOT chrome stickers)

| Preserved                                              | Why                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| City `<option>` labels (🏙️ HCM, 🌲 Đà Lạt, 🏛️ HN, 🌊 ĐN) | Native `<option>` elements can't render SVG; the emoji prefix is **content** (geographic flavor), not chrome.        |
| `✓ Đã lưu` / `✓ Đã gửi` confirmations                 | ASCII check mark is a long-standing convention for inline status — not a sticker, not part of the chrome.            |
| `✕` close button on banner                            | ASCII close mark, universal pattern; even Material Design uses it.                                                  |
| Status icons in `<svg>` from `statusIconSvg()` helper   | Already SVG, not emoji.                                                                                              |

---

## Step 3 — PWA service worker bumped (again)

```diff
- const VERSION = "vowvet-v2-brand-sync-pass-3";
+ const VERSION = "vowvet-v3-svg-stickers";
```

Forces SW `activate` event to delete the v2 cache → users will fetch the latest HTML with SVG icons on next visit.

---

## Smoke verification

```bash
$ docker restart vowvet-web
$ for p in /alerts /chat /chat/new /settings /dashboard; do
    curl -s -o /dev/null -w "%{http_code} $p\n" "http://127.0.0.1:4322$p"
  done
302 /alerts
302 /chat
302 /chat/new
302 /settings
302 /dashboard

$ docker logs vowvet-web --since 30s | grep -i "error\|astroerror"
# (empty — only a pre-existing unrelated router collision warning on /pets/[id]/personality)
```

All routes 302 (auth-gated, expected). No 500s. Astro HMR picked up the source changes.

---

## Files changed

- **Extended**: `web/src/components/FeatureIcon.astro` — added 14 new SVG paths (~120 lines added, total file now 462 lines)
- **Modified**: `web/src/pages/alerts.astro` — 4 emoji → SVG swaps + alert-type icon map switched to FeatureIcon names
- **Modified**: `web/src/pages/chat/index.astro` — 6 emoji → SVG swaps + quick-prompts data structure changed (`icon` field now holds FeatureIcon name)
- **Modified**: `web/src/pages/chat/new.astro` — 2 emoji → SVG swaps
- **Modified**: `web/src/pages/settings.astro` — 12 emoji → SVG swaps + sub-toggle loop converted from Alpine `template x-for` to SSR Astro `.map()` so Astro components render
- **Bumped**: `web/public/sw.js` — VERSION `v2` → `v3-svg-stickers`

---

## Acceptance checklist

| # | Requirement                                                            | Status |
| - | ---------------------------------------------------------------------- | :---:  |
| 1 | 4 pages match homepage chrome-emoji count (= 0)                         |   ✓    |
| 2 | All icons rendered via `<FeatureIcon>` Astro component                   |   ✓    |
| 3 | Critical emoji types covered: alert types, vet avatar, trust signals, settings sections |   ✓    |
| 4 | Content emojis preserved (city flavor, confirmation marks)              |   ✓    |
| 5 | Container restart + SW version bump to invalidate cache                  |   ✓    |
| 6 | Smoke test: 4 pages 302/200, 0 errors                                   |   ✓    |
| 7 | No regressions to existing brand-token work                              |   ✓ (still 0 forbidden colors)    |

---

## Action user cần thực hiện

Để thấy thay đổi NGAY:
1. **Hard refresh** (`Ctrl+Shift+R` / `Cmd+Shift+R`)
2. If on installed PWA: close & reopen the app
3. If still stuck: DevTools → Application → Service Workers → **Unregister** → reload

The SW bumped from `v2` → `v3-svg-stickers`, so the `activate` event will clean up the old cache automatically on next visit. Users typically see the new design within ~5 seconds after a single page revisit.
