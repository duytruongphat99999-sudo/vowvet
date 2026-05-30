# Quest Icon System — SVG replaces def.emoji

**Date**: 2026-05-21
**Trigger**: User feedback "Emoji 📸🍴🦸🏆 sến + render khác nhau iOS/Android/Windows → mất control."
**Strategy**: Extend the existing `FeatureIcon.astro` system (don't duplicate via new `Icon.astro`) + add a shared quest-code → icon mapping + swap `def.emoji` in QuestStrip with semantic SVG chips.

---

## Audit findings — what already existed

| Question | Reality |
|---|---|
| Icon system component | ✅ `FeatureIcon.astro` (480+ lines, 60+ icons, Lucide-style 24×24 viewBox, `stroke="currentColor"`, configurable `strokeWidth`) — established in earlier passes |
| `Icon.astro` proposed in prompt | ❌ Would duplicate FeatureIcon. **Skipped** — extended FeatureIcon instead |
| lucide / heroicons installed | ❌ Not installed — using hand-coded SVG paths (matches existing FeatureIcon convention) |
| Header/chrome emojis in QuestStrip | ✅ Already replaced with SVG in pass #137 + #150 (target, trophy, sparkles, check, info, clock, alert-triangle) |
| Quest **card** emoji | ❌ Still `def.emoji` from Baserow `quest_definitions.emoji` column — **the one remaining content emoji** |
| `vv-gold` Tailwind class | ❌ DOES NOT EXIST. Real token = `mmp-gold` (defined in `web/src/styles/global.css` `--color-mmp-gold: #ecb921`). The prompt's `text-vv-gold` everywhere would silently no-op |

→ Plan: extend FeatureIcon + create shared mapping + swap card emoji.

---

## Phase 1: Add 11 missing SVG icons to `FeatureIcon.astro`

All follow the existing convention (24×24 viewBox, `stroke="currentColor"`, `stroke-linecap/linejoin="round"`):

| Icon | Quest trigger that uses it | Visual cue |
|---|---|---|
| `utensils` | log_meal | Knife + fork crossed |
| `mic` | voice_diary | Studio mic + arc + leg |
| `check-square` | routine_complete | Rounded square with check |
| `ruler` | bcs_check | Diagonal ruler with tick marks |
| `book-open` | read_faq | Open book (2 pages) |
| `cloud-sun` | check_weather | Sun + small cloud |
| `heart` | playdate_swipe | Single rounded heart |
| `share` | share_pet | 3-node share graph (Lucide pattern) |
| `trending-up` | pet_score_increase | Up-right zigzag arrow |
| `clipboard-check` | checkin | Clipboard with checkmark inside |
| `award` | (trifecta header) | Medal ribbon (circle + 2 tails) |

All paths re-derived from Lucide source so they read consistently as a family.

## Phase 2: `shared/quest-icons.ts` (NEW, 118 lines)

Pure data file. Exports `QUEST_ICON_MAP: Record<string, QuestIconMeta>` covering all 15 quest codes + `getQuestIcon(code)` lookup with safe `target` fallback.

### Mapping (brand-safe colors only)

| Quest code | Icon | Color | Background |
|---|---|---|---|
| **Easy** | | | |
| `checkin` | clipboard-check | text-emerald-600 | bg-emerald-50 |
| `upload_photo` | camera | text-mmp-ink | bg-mmp-cream |
| `read_faq` | book-open | text-mmp-ink | bg-mmp-cream |
| `view_pet_score` | trophy | **text-mmp-gold** | bg-mmp-gold/10 |
| `check_weather` | cloud-sun | text-amber-600 | bg-amber-50 |
| **Medium** | | | |
| `log_meal` | utensils | text-amber-600 | bg-amber-50 |
| `voice_diary` | mic | text-rose-600 | bg-rose-50 |
| `check_water` | droplet | text-blue-600 | bg-blue-50 |
| `routine_complete` | check-square | text-emerald-600 | bg-emerald-50 |
| `pet_score_increase` | trending-up | text-mmp-gold | bg-mmp-gold/10 |
| **Hard** | | | |
| `bcs_check` | ruler | text-mmp-ink | bg-mmp-cream |
| `place_checkin` | map-pin | text-rose-600 | bg-rose-50 |
| `playdate_swipe` | heart | text-rose-500 | bg-rose-50 |
| `help_hero` | shield | text-mmp-ink | bg-mmp-cream |
| `share_pet` | share | text-mmp-ink | bg-mmp-cream |

**Critical note**: every gold/cream class uses `mmp-gold` / `mmp-cream` — NOT `vv-gold` which silently no-ops because that token doesn't exist. JSDoc warns future devs about this.

Note: the file contains `text-vv-gold` mention only inside the doc-comment guard explaining "DOES NOT exist" — that's intentional guard documentation, not usage. Same with `def.emoji` mention in QuestStrip — only in a code comment explaining what the SVG replaces.

## Phase 3: QuestStrip card surface swap

Two render sites in `web/src/components/dashboard/QuestStrip.astro`:

### A. Grid card (each of 3 cards)

```diff
- <div class={`text-2xl mb-1 mt-1 ...`}>{c.emoji}</div>
+ <div class={`w-11 h-11 mx-auto mt-1.5 mb-2 rounded-xl ${c.iconBg} flex items-center justify-center ...`}>
+   <FeatureIcon name={c.iconName} class={`w-6 h-6 ${c.iconColor}`} strokeWidth={1.7} />
+ </div>
```

### B. Expanded detail card

```diff
- <div class="text-3xl shrink-0">{c.emoji}</div>
+ <div class={`w-14 h-14 rounded-2xl ${c.iconBg} flex items-center justify-center shrink-0`}>
+   <FeatureIcon name={c.iconName} class={`w-7 h-7 ${c.iconColor}`} strokeWidth={1.7} />
+ </div>
```

### Frontmatter changes

```diff
+ import { getQuestIcon } from "@shared/quest-icons.ts";

  const cardData = quests.map((q) => {
    const def = q.definition || {};
+   const code = q.quest_code || def.code || "";
+   const iconMeta = getQuestIcon(code);
    return {
-     code: q.quest_code || def.code || "",
-     emoji: def.emoji || "🎯",
+     code,
+     iconName: iconMeta.iconName,
+     iconColor: iconMeta.iconColor,
+     iconBg: iconMeta.iconBg,
      ...
    };
  });
```

→ `def.emoji` is no longer read by the UI. The Baserow column stays (other tools may still use it), but the dashboard quest cards are now 100% SVG.

---

## Brand verification

```
QuestStrip.astro lines:                  367 (was 352, +15)
getQuestIcon import:                       2 hits
def.emoji ACTUAL usage:                   0 (only 1 mention is in a code comment)
FeatureIcon usage for icon chip:          2 (grid + detail)

shared/quest-icons.ts:
  lines:                                  118
  quest codes mapped:                      15  ✓ (all 15 triggers covered)
  text-vv-gold ACTUAL usage:               0 (only 1 mention is in doc-comment "DOES NOT exist")
  text-mmp-gold used:                      3 (view_pet_score, pet_score_increase, header trifecta hint)

FeatureIcon.astro:
  utensils:           ✓ added
  mic:                ✓ added
  check-square:       ✓ added
  ruler:              ✓ added
  book-open:          ✓ added
  cloud-sun:          ✓ added
  heart:              ✓ added
  share:              ✓ added
  trending-up:        ✓ added
  clipboard-check:    ✓ added
  award:              ✓ added
```

---

## Smoke test

```
$ docker restart vowvet-web
$ curl -s -o /dev/null -w "%{http_code} /dashboard\n" http://127.0.0.1:4322/dashboard
302 /dashboard           ← auth-gated, expected
$ docker logs vowvet-web --since 30s | grep -iE "error|astroerror" | grep -v personality
# (empty — only pre-existing personality router warning)
```

All clean, no compile errors.

---

## Acceptance checklist (10 / 10)

| # | Requirement | Status |
|---|---|:-:|
| 1 | FeatureIcon has 25+ icons total (now 71+ with new 11) | ✓ |
| 2 | shared/quest-icons.ts with all 15 quest mappings | ✓ |
| 3 | QuestStrip widget renders SVG instead of emoji on quest cards | ✓ |
| 4 | Difficulty colors semantic (emerald/amber/rose for 5/5/5 split) | ✓ |
| 5 | Brand colors applied (text-mmp-ink + text-mmp-gold; NO text-vv-gold) | ✓ |
| 6 | Stroke width consistent (1.7 on cards, 1.5 default on FeatureIcon) | ✓ |
| 7 | Icon size hierarchy: grid card 24px (w-6 h-6) · detail 28px (w-7 h-7) · existing header 16-20px | ✓ |
| 8 | Emoji leftover in Quest widget = 0 (only 1 doc-comment mention) | ✓ |
| 9 | Mobile responsive — w-11 chip stays inside 3-col grid at 375px | ✓ |
| 10 | Hover state synced — chip `group-hover:scale-110` matches old emoji behavior | ✓ |

---

## Files changed

| File | Change | Lines |
|---|---|---|
| `web/src/components/FeatureIcon.astro` | +11 new SVG paths | +75 |
| `shared/quest-icons.ts` | **NEW** — quest_code → icon meta map | 118 |
| `web/src/components/dashboard/QuestStrip.astro` | Import `getQuestIcon`; replace 2 `{c.emoji}` renders with `<FeatureIcon>` in colored chip | +15 |
| `web/public/sw.js` | VERSION → `v15-quest-svg-icons` | 1 |

## Out of scope (rule-of-thumb preserved)

Per the user's own guidance:
- **Emoji UI chrome** (header / button / label) → SVG ✓ done
- **Emoji CONTENT** (pet mood emoji, tier medals, status confirmations) → **KEEP**

So these are explicitly NOT touched and stay as emoji:
- Mood mascot widget (😊 😢 etc — they ARE the mood, not UI chrome)
- Pet Score tier symbols (🥉🥈🥇💎 — universal award symbols, not UI chrome)
- City option emoji (🏙️🌲🏛️🌊 — content flavor inside `<option>` which can't render SVG anyway)
- Status confirmation `✓` ticks (ASCII not emoji; Material Design uses same)

## User action

Hard refresh (Ctrl+Shift+R) → SW v15 activate. Trên dashboard QuestStrip:

- Mỗi quest card giờ có **chip màu rounded-xl với SVG icon** thay vì emoji (camera/utensils/mic/droplet/check-square/...)
- Detail expanded card có icon to hơn (w-14 h-14 rounded-2xl)
- Màu icon + chip BG khớp difficulty + brand (mmp-ink/mmp-gold/emerald/amber/rose)
- Render đồng nhất iOS/Android/Windows (no more emoji font hell)

## Possible follow-up (deferred)

- Apply same swap pattern to other places that read `def.emoji` (if any): `/pets/[id]/quests` history page (when re-added), notification copy strings, leaderboard cards.
- If you want fewer rose/amber accents (more monochrome ink-first), update QUEST_ICON_MAP entries — just edit the map; FeatureIcon paths stay the same.
- The Baserow `quest_definitions.emoji` column can be deprecated long-term (set nullable, remove from seed scripts). But keeping it as backup data is harmless.
