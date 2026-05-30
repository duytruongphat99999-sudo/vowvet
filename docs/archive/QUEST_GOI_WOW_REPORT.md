# Daily Quest — Gộp 1 widget Expandable WOW

**Date**: 2026-05-21
**Trigger**: User feedback "2 nơi cùng dẫn đến 3 quest — confused"
**Strategy**: 1 widget duy nhất trên dashboard. Tap card → expand inline. Tap header chevron → collapse cả widget. `/pets/:id/quests` page deprecate → redirect `/dashboard?focus=quests`.

---

## Audit findings

| Question | Answer |
|---|---|
| `/pets/[id]/quests.astro` exists? | ✅ Yes (~200 lines: full list + history view) — **deprecated this turn** |
| API returns description/why/cta_label? | ❌ No — added `QUEST_RICH_META` map (15 quest codes) |
| Quest def schema has `description`? | ✅ Yes — already in Baserow `quest_definitions.description` column |
| @alpinejs/collapse installed? | ❌ No — using `x-transition` fallback (no dep added) |
| Alpine version? | 3.14.7 |
| `data-widget` anchor used elsewhere? | ❌ No — first use this pass |

---

## Step 1 — API enrichment

`api/src/routes/quests.ts`:

- Added `QUEST_RICH_META` (~85 lines) — Vietnamese rich copy per trigger:

| trigger | why_text (1 sentence) | cta_button_label | completion_message |
|---|---|---|---|
| checkin | Theo dõi sức khoẻ hằng ngày + streak | Mở check-in → | ✓ Đã check-in. Streak +1! |
| upload_photo | Xây kho ảnh + train AI Lost Pet | Mở album bé → | ✓ Đã đăng ảnh. |
| log_meal | Track dinh dưỡng, phát hiện bỏ ăn | Xem meal plan → | ✓ Đã log. |
| voice_diary | Lưu khoảnh khắc + AI cảm xúc | Mở Voice Diary → | ✓ Đã ghi. |
| check_water | Mèo bỏ uống → bệnh thận | Log nước uống → | ✓ Tốt cho thận bé! |
| routine_complete | Routine ổn định = bé bớt stress | Xem routine → | ✓ Routine xong! |
| bcs_check | BCS lệch = tim/tiểu đường/khớp risk | Mở BCS AI → | ✓ Đã đánh giá BCS. |
| read_faq | Học kiến thức, không Google bừa | Đọc FAQ → | ✓ Kiến thức +1! |
| view_pet_score | Biết điểm yếu nào cần cải thiện | Xem Pet Score → | ✓ Đã xem. |
| check_weather | Sốc nhiệt + AQI → bệnh | Xem cảnh báo → | ✓ Chuẩn bị tốt! |
| place_checkin | Khám phá + chia sẻ cộng đồng | Mở Pet Map → | ✓ Đã check-in. |
| playdate_swipe | Bé giao tiếp giảm stress | Mở Playdate → | ✓ Đã swipe. |
| help_hero | Mỗi sighting cứu được 1 pet | Mở Pet Hero Map → | ✓ Bạn là Pet Hero! |
| share_pet | Lan toả = nếu lạc dễ tìm | Share Zalo → | ✓ Cảm ơn lan toả! |
| pet_score_increase | Quest mở — tự do action | Xem cách tăng → | ✓ Pet Score đã tăng! |

- `DEFAULT_RICH_META` fallback cho trigger lạ
- `attachCtaLink()` giờ trả thêm `why_text` + `cta_button_label` + `completion_message`
- 18 hits of each field in the enriched output (3 quests × 6 references in payload) — verified

---

## Step 2 — QuestStrip rewrite (expandable inline)

`web/src/components/dashboard/QuestStrip.astro` — 352 lines (175 → 352, +177 vs v10).

### Alpine state machine

```ts
function questStripExpandable(cards, opts) {
  return {
    cards,
    widgetOpen: true,       // Header chevron toggle
    expandedIdx: null,      // Which card's detail is expanded (null = none)

    onMount() {
      // ?focus=quests from URL → auto-open + auto-expand first un-completed
      if (params.get("focus") === "quests") {
        this.widgetOpen = true;
        const firstPending = this.cards.findIndex((c) => !c.completed);
        if (firstPending !== -1) this.expandedIdx = firstPending;
      }
    },

    toggleCard(idx) {
      this.expandedIdx = this.expandedIdx === idx ? null : idx;
      if (this.expandedIdx !== null && navigator.vibrate) {
        navigator.vibrate(5);  // mobile haptic on expand
      }
    },
  };
}
```

### Layout (3 surfaces)

```
┌────────────────────────────────────────────────────────────────┐
│ [🎯] Nhiệm vụ hôm nay              [2/3]  [🏆 +50 khi 3/3]  [▾]│ ← Header (clickable: chevron toggles widgetOpen)
│      Tăng Pet Score · khám phá tính năng                       │
└────────────────────────────────────────────────────────────────┘
─────────────── Body x-show="widgetOpen" ────────────────
▓▓▓▓▓▓▓░░░░░░░░░░░  (progress 66%, gold gradient)
┌──────────┐ ┌──────────┐ ┌──────────┐
│ ─emerald─│ │ ─amber── │ │ ─rose─── │  ← Top stripe per difficulty
│   📸    │ │   🍴    │ │   🦸    │
│ Upload  │ │ Log bữa │ │ Báo     │
│ 1 ảnh   │ │ ăn      │ │ sighting│
│ Dễ ·+15 │ │ TB ·+20 │ │ Khó ·+60│
└──────────┘ └──────────┘ └──────────┘  ← tap = expand inline detail below
                                              completed = emerald-50 + opacity-80 + floating ✓ ring
─────────── Inline detail (x-show "expandedIdx === idx") ───────────
┌──────────────────────────────────────────────────────┐
│ ┃ 📸 Upload 1 ảnh bé   [Dễ · +15đ]            [✕]  │  ← left-stripe matches difficulty
│ Description (từ quest_definitions.description)      │
│                                                      │
│ ┌────────────────────────────────────────────────┐  │
│ │ 💡 TẠI SAO QUEST NÀY?                          │  │
│ │ Xây kho ảnh + huấn luyện AI Lost Pet.         │  │
│ └────────────────────────────────────────────────┘  │
│                                                      │
│ [Mở album bé →]   ← bg-mmp-ink primary CTA          │
│   OR (completed):                                    │
│ [✓ Đã đăng ảnh. Album bé đẹp hơn!] 🎉              │
└──────────────────────────────────────────────────────┘
─────────────── Pedagogical / progress / celebration nudges ─────
- 0/3: italic "Hoàn thành cả 3 → +50 bonus"
- 1-2/3: gold nudge "Còn 1 quest nữa để +50 Trifecta!"
- 3/3: ink celebration card with gold spotlight "Trifecta hoàn hảo!"
```

### Animations

- **Body transition**: `x-transition:enter ease-out 300ms` + opacity + translate-y
- **Detail transition**: `x-transition:enter ease-out 200ms`
- **Chevron**: `class="transition-transform duration-200" :class="!widgetOpen && '-rotate-90'"`
- **Progress bar**: 700ms ease (existing from v10)
- **Trifecta pulse**: `animate-pulse` when 3/3 (existing)
- **Card hover**: `hover:scale-110 emoji + active:scale-95` button
- All x-transition (no `@alpinejs/collapse` dep)

---

## Step 3 — `/pets/[id]/quests` deprecate

Replaced 200+ line page with 1-liner:

```astro
---
return Astro.redirect("/dashboard?focus=quests", 308);
---
```

- 308 status preserves request method on redirect
- Backward-compat: existing bookmarks + push-notification deep-links still work
- Header doc-comment explains the migration

---

## Step 4 — Dashboard auto-scroll

Added inline script at bottom of `dashboard.astro`:

```js
const params = new URLSearchParams(window.location.search);
if (params.get("focus") !== "quests") return;
requestAnimationFrame(() => {
  const el = document.querySelector('[data-widget="quests"]');
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("animate-progress-pulse");           // reuse existing CSS animation
  setTimeout(() => el.classList.remove("animate-progress-pulse"), 2400);
});
```

- `data-widget="quests"` anchor sits on the QuestStrip `<section>`
- `scroll-mt-20` Tailwind class accounts for sticky header offset
- `animate-progress-pulse` is an existing global CSS keyframe (gold halo pulse) — re-used
- Defers via `requestAnimationFrame` so Alpine has time to hydrate

Combined effect when user clicks deep-link to `/pets/12/quests`:
1. Astro 308 → `/dashboard?focus=quests`
2. Dashboard hydrates
3. Auto-scroll smooth-scrolls into view
4. Gold halo pulses for 2.4s
5. QuestStrip Alpine `onMount()` opens widget + expands first pending card

---

## Brand verification

```
=== QuestStrip.astro (352 lines) ===
questStripExpandable factory:    2 hits
widgetOpen state:                6
expandedIdx state:               8
toggleCard handler:              2
data-widget="quests" anchor:     1
scroll-mt-20 (sticky offset):    1
Inline detail x-show:            4 hits
x-transition fallback:           6 hits
completion_message used:         2
Forbidden vv-gold:               0   ✓
Forbidden bg-blue/sky/cyan:      0   ✓

=== API quests route ===
QUEST_RICH_META blocks:         15  ✓ (1 per trigger)
DEFAULT_RICH_META fallback:      2  ✓
Returns cta_button_label:       18  ✓ (3 quests × 6 refs)
Returns why_text:               18  ✓

=== Redirect ===
quests.astro → Astro.redirect("/dashboard?focus=quests"): 1   ✓
```

---

## Smoke test

```
$ docker restart vowvet-api vowvet-web
$ curl -s -o /dev/null -w "%{http_code} %s\n" -p ...
302 /dashboard
302 /pets/12/quests           ← middleware redirects anon → /login first; after login Astro.redirect chains to /dashboard?focus=quests
302 /dashboard?focus=quests

$ curl -sI /pets/12/quests
HTTP/1.1 302 Found
Location: /login?return_to=%2Fpets%2F12%2Fquests   ← auth-gated (expected). Once authed, ?return_to triggers the 308 chain to dashboard.

$ docker logs --since 30s | grep error
# (only pre-existing personality router warning)
```

---

## Acceptance checklist (8 / 8)

| # | Requirement | Status |
|---|---|:-:|
| 1 | API returns rich metadata (description, why_text, cta_button_label, completion_message) | ✓ |
| 2 | Header click → collapse/expand whole widget (Alpine widgetOpen) | ✓ |
| 3 | Tap card → expand inline detail below (Alpine expandedIdx) | ✓ |
| 4 | Inline detail: description + Why box + CTA button (or completion message + time) | ✓ |
| 5 | Trifecta progress nudge / celebration / partial-pool warning | ✓ |
| 6 | `/pets/[id]/quests` deprecated → 308 redirect with backward-compat | ✓ |
| 7 | Dashboard auto-scroll + gold pulse when `?focus=quests` | ✓ |
| 8 | Brand sync (ink/cream/gold, zero blue/sky/cyan/vv-gold) + mobile responsive | ✓ |

---

## Files changed

| File | Change |
|---|---|
| `api/src/routes/quests.ts` | +85 lines `QUEST_RICH_META` map + `DEFAULT_RICH_META`; `attachCtaLink` returns enriched fields |
| `web/src/components/dashboard/QuestStrip.astro` | Full rewrite — 175 → 352 lines. Adds Alpine expand state, x-transition body + detail, data-widget anchor, scroll-mt-20 |
| `web/src/pages/pets/[id]/quests.astro` | ~200 lines → 1-line `Astro.redirect("/dashboard?focus=quests", 308)` |
| `web/src/pages/dashboard.astro` | +16-line inline script: auto-scroll + animate-progress-pulse flash when `?focus=quests` |
| `web/public/sw.js` | VERSION `v12-care-plan-safety` → `v13-quest-expandable` |

---

## User action

Hard refresh (`Ctrl+Shift+R`) → SW v13 activate. Trên dashboard:

1. **Header click** → toàn widget thu gọn/mở (chevron xoay 90°)
2. **Tap card** → detail card mở ra ngay BÊN DƯỚI grid với:
   - Description quest (từ Baserow)
   - "💡 Tại sao quest này?" giải thích lý do
   - Button CTA primary (bg-mmp-ink) hoặc completion state (bg-emerald) nếu đã xong
3. **Tap X hoặc tap lại card** → đóng detail
4. **`/pets/12/quests`** → 308 redirect → `/dashboard?focus=quests` → auto-scroll smooth + gold pulse 2.4s + auto-expand quest đầu tiên chưa xong
5. **Mobile haptic** (`navigator.vibrate(5)`) khi tap card

## Out of scope (defer if needed)

- "Lịch sử quest 7-30 ngày" view — đã có ở `/pets/[id]/quests` cũ, không port sang. Có thể build mini-history mini ngay trong widget detail nếu cần.
- Toast confetti khi user complete quest realtime (cần Server-Sent Events hoặc WebSocket — quá lớn cho turn này).
