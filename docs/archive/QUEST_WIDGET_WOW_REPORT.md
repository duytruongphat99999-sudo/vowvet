# Daily Quest Widget — Fix + WOW Redesign Report

**Date**: 2026-05-21
**Trigger**: User clarified "Daily Quest ≠ Check-in" + reported dashboard widget shows only 1 quest instead of 3.

---

## Conceptual model (locked in)

|                | Check-in                              | Daily Quest                                                                       |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Mục đích        | Log sức khoẻ pet hôm nay              | Habit formation + feature discovery + variable reward (slot-machine)               |
| Tần suất       | 1 lần/ngày (1 form)                   | **3 quests/ngày** random từ pool 15 template (1 easy + 1 medium + 1 hard)         |
| Reward         | +10đ Pet Score                        | +15 / +20-30 / +50đ tuỳ difficulty                                                |
| Trigger        | Manual: user log mood + meals         | **Auto-complete** khi user dùng feature (upload photo, BCS assess, swipe playdate)|
| Bonus          | —                                     | **Trifecta**: hoàn thành cả 3 → **+50 Pet Score bonus** thêm                       |

→ Dashboard `Zone 1 PetHeroCard` xử lý check-in; `Zone 3 QuestStrip` xử lý daily quests. **Hai feature riêng biệt**.

---

## Bugs found

### A. `assignDailyQuests` early-returned on partial assignment

```ts
// Before:
const existing = await listTodayQuests(userId, petId, date);
if (existing.length > 0) return existing;   // ← stops at 1 or 2!
```

→ Nếu cron job 14 (7am) chạy gặp lỗi mid-way (e.g. Baserow API drop) chỉ tạo được 1 row, thì pet bị stuck ở 1/3 quest cả ngày — không có cách top-up.

### B. API route `/quests/today` chỉ auto-assign khi count === 0

```ts
// Before:
if (quests.length === 0) {
  quests = await assignDailyQuests(...)   // ← skipped if 1 or 2 already exist
}
```

### C. UI hiển thị bị flat — không có visual hierarchy

- Counter `1/3` ẩn trong text
- Không có progress bar visual
- Trifecta bonus (+50) **không được nhắc đến đâu** → user không biết về phần thưởng kích thích
- Difficulty badge ở góc dưới — không dễ scan

---

## Fixes

### 1. `api/src/lib/daily-quests.ts` — top-up logic

Đổi semantics từ "early-return if existing" → "top up to 3 with missing-difficulty preference":

```diff
- if (existing.length > 0) return existing;
+ if (existing.length >= 3) return existing.slice(0, 3);
+
+ const usedCodes = new Set(existing.map(e => e.definition?.code).filter(Boolean));
+ const usedDiffs = new Set(existing.map(e => e.definition?.difficulty).filter(Boolean));
+ const available = defs.filter(d => !usedCodes.has(d.code));
+
+ // Prefer missing difficulty tiers first (variable-reward UX: 1 easy + 1 medium + 1 hard)
+ const wantedDiffs = (["easy","medium","hard"] as QuestDifficulty[]).filter(d => !usedDiffs.has(d));
+ const slotsNeeded = 3 - existing.length;
+ const chosen: QuestDef[] = [];
+ for (const diff of wantedDiffs) {
+   if (chosen.length >= slotsNeeded) break;
+   const picks = pickRandom(byDifficulty[diff], 1);
+   if (picks.length) chosen.push(picks[0]);
+ }
+ // Fallback: fill remaining from any available (pool short edge case)
+ while (chosen.length < slotsNeeded) {
+   const remaining = available.filter(d => !chosen.find(c => c.code === d.code));
+   if (remaining.length === 0) break;
+   chosen.push(pickRandom(remaining, 1)[0]);
+ }
```

Function vẫn idempotent — nếu đã có 3+ quests, return immediately.
Function vẫn maintain difficulty diversity (easy + medium + hard).
Function chống duplicate `quest_code`.

Return statement đổi để bao gồm cả existing + newly created:
```diff
- return created;
+ return [...existing, ...created];
```

### 2. `api/src/routes/quests.ts` — top-up trigger condition

```diff
- if (quests.length === 0) {
+ if (quests.length < 3) {
    quests = await assignDailyQuests(session.sub, petId);
  }
```

Thêm `trifecta_bonus: 50` vào response để UI biết.

### 3. `web/src/components/dashboard/QuestStrip.astro` — WOW redesign

**Header** (3-element layout):
```
┌──────────────────────────────────────────────────────────┐
│ 🎯 Nhiệm vụ hôm nay        1/3        🏆 +50 bonus khi 3/3│
│   Tăng Pet Score · khám phá tính năng                    │
└──────────────────────────────────────────────────────────┘
```
- Gold cream icon chip (target SVG)
- Title + tagline ("Tăng Pet Score · khám phá tính năng") — clarify purpose
- Counter pill `N/3` với gold "3" highlight
- **Trifecta status pill**:
  - Khi chưa 3/3: gold pill `🏆 +50 bonus khi 3/3` (carrot — hidden on mobile to save space)
  - Khi 3/3: emerald pulsing `✨ Trifecta +50đ` (celebration)

**Progress bar** (NEW):
- 1.5px height gradient gold bar
- `width: completed_count / 3 * 100%`
- 700ms ease transition khi user complete quest → bar fills smoothly

**3 quest cards** (grid-cols-3):
- **Top difficulty stripe** (1px colored bar — emerald/amber/rose) — easier to scan
- Large emoji (2xl) với hover scale-110
- Quest name (min-height 2.1em to align cards)
- **Unified badge**: `[Dễ · +15]` thay vì 2 chip riêng → less visual noise
- Completed state: emerald-50 BG + emerald stripe + floating ✓ ring + opacity-80

**Edge states**:
- Empty (0 quests, never happens after top-up): friendly "Quest hôm nay sắp tới" card
- Partial (1-2 quests, rare): amber warning với SVG alert-triangle
- Pedagogical hint khi 0/3: italic "Hoàn thành cả 3 quest hôm nay → **+50 Pet Score bonus**"

### 4. `dashboard.astro` — wire `trifecta_bonus` prop

```diff
  <QuestStrip
    quests={questsInfo.quests}
    completed_count={questsInfo.completed_count || 0}
    petId={primaryPet.id}
+   trifecta_bonus={questsInfo.trifecta_bonus || 50}
  />
```

### 5. SW bumped `v9-photo-focus` → `v10-quest-wow`

---

## Brand verification (no leak)

```
=== Source verify ===
QuestStrip grid-cols-3 still present:    1
QuestStrip difficulty stripe (top-1):    2 (1 for active + 1 for completed states)
QuestStrip Trifecta references:         11 (label + 2 variants + prop wiring)
QuestStrip progress bar:                 2
daily-quests top-up logic:               3 (slotsNeeded references)
api/quests.ts top-up condition <3:       1
api/quests.ts returns trifecta_bonus:    1
Forbidden urgency colors in QuestStrip:  0   ← 0 bg-blue/sky/cyan
```

---

## Smoke

```
$ docker restart vowvet-api vowvet-web
$ curl -s -o /dev/null -w "%{http_code} %p\n" -p /dashboard /pets/12/quests
302 /dashboard
302 /pets/12/quests
$ docker logs --since 30s | grep -iE "error|fail"
# (only pre-existing personality router warning)
```

---

## Expected user behavior after fix

| Scenario | Before | After |
|---|---|---|
| Cron job runs successfully at 7am | 3 quests shown | 3 quests shown (no change) |
| Cron job partially failed (1/3 row created) | **Stuck at 1/3 all day** | Next dashboard load → API tops up to 3/3 automatically |
| User completes 1 quest | Counter `1/3` text update | Counter + progress bar fills 33% + cards re-render |
| User completes 2 quests | Counter `2/3` | + gold trifecta pill ("+50 bonus khi 3/3") still visible |
| User completes all 3 | No celebration | **Emerald pulsing "Trifecta +50đ" badge** + progress bar 100% gold |
| Mood lib's suggested action is `/pets/{id}/quests` | PetHeroCard CTA duplicates QuestStrip header | Already fixed in task #131 (occupiedLinks) |

---

## Acceptance checklist

| # | Requirement | Status |
|---|---|:-:|
| 1 | API returns 3 quests even when partial assignment exists | ✓ |
| 2 | `assignDailyQuests` is now top-up safe (preserves existing, adds missing) | ✓ |
| 3 | Auto-fallback when `quests.length < 3` (not just `=== 0`) | ✓ |
| 4 | API returns `trifecta_bonus: 50` for UI surfacing | ✓ |
| 5 | Header: title + tagline + counter pill + trifecta pill | ✓ |
| 6 | Progress bar gold gradient with smooth 700ms transition | ✓ |
| 7 | Difficulty stripe at TOP of each card (1px) | ✓ |
| 8 | Unified difficulty + bonus chip `[Dễ · +15]` | ✓ |
| 9 | Completed state: emerald + floating ✓ ring + opacity-80 | ✓ |
| 10 | Trifecta pill: gold carrot before 3/3, emerald celebration when 3/3 | ✓ |
| 11 | Pedagogical hint shown when 0/3 completed | ✓ |
| 12 | Empty/partial state messaging | ✓ |
| 13 | Brand sync: 0 blue/sky/cyan | ✓ |
| 14 | Mobile responsive (grid-cols-3 with smaller gap) | ✓ |

---

## Files changed

| File | Change |
|---|---|
| `api/src/lib/daily-quests.ts` | top-up logic (replaces early-return) |
| `api/src/routes/quests.ts` | `< 3` trigger + return `trifecta_bonus: 50` |
| `web/src/components/dashboard/QuestStrip.astro` | full WOW redesign (~165 lines) |
| `web/src/pages/dashboard.astro` | wire `trifecta_bonus` prop |
| `web/public/sw.js` | VERSION → `v10-quest-wow` |

## User action

Hard refresh (Ctrl+Shift+R) — SW v10 activate. Dashboard sẽ hiển thị **3 cards** với difficulty stripes, progress bar, và Trifecta bonus indicator.

## Optional follow-ups (deferred)

- **Toast khi unlock Trifecta** — sau khi user complete quest cuối, hiện toast confetti "+50 Pet Score bonus!" — cần wire vào celebrations.js lib.
- **Quest history page enhancement** — `/pets/[id]/quests` page có thể list past 7 days với streak indicator.
- **Mid-day re-roll** — admin tool để force re-assign quest cho pet (debug/testing).
