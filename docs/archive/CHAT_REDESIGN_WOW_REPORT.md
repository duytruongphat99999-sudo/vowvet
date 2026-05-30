# /chat WOW Redesign — Report

**Date**: 2026-05-21
**Scope**: Full brand sync + WOW pass on the messaging hub
**File**: `web/src/pages/chat/index.astro` (the route is `/chat/` — `/messages` aliases to it via 308 redirect from earlier pass)

---

## Audit findings vs mega-prompt assumptions

| Mega-prompt assumption                                   | Reality                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| File at `web/src/pages/chat.astro`                        | File at `web/src/pages/chat/index.astro` (subdirectory: also `[id].astro` + `new.astro` exist)    |
| API: `GET /api/v1/conversations`                          | Real: `GET /api/v1/chat/threads?limit=50` returning `{ threads: [...] }`                          |
| Response fields: `unread_count`, `last_message_time`, `tags` | Real: `unread_count_owner`, `last_message_at`, `status` (waiting_vet / open / closed)         |
| `CLINIC_INFO` is a const                                  | `shared/clinic-info.ts` exports `getClinicInfo()` **function** (env-driven). No `CLINIC_INFO`.    |
| `CLINIC_INFO.founder` exists                              | Missing — clinic-info had no vet/founder shape                                                     |
| `isClinicOpenNow()` + `getNextOpenTime()` exist           | Missing — both helpers absent                                                                      |
| Vet name "BS Duy Trường Phát"                            | **FORBIDDEN** — task #57 renamed all refs to `"BSTY Mon Min Pet"` (brand-safe identity)            |
| Brand "Mon Min PetCoach"                                  | **FORBIDDEN** — task #97 fixed to `"Mon Min Pet"` everywhere                                       |
| Pre-fill query: `/chat/new?prompt=...`                    | Real pre-fill param: `?subject=` (used by `chat/new.astro:29`)                                     |

---

## Changes

### 1. Extended `shared/clinic-info.ts`

Added 3 things, all backward-compatible:

```ts
export interface ClinicVet {
  name: string;
  title: string;
  photo_url: string | null;
  bio: string;
  credentials: string[];      // chip array
}

// added to ClinicInfo interface:
hours_start: number;          // 8 (derived from hours_weekday parse)
hours_end:   number;          // 22
vet: ClinicVet;               // brand-safe vet identity

// new helpers
export function isClinicOpenNow(now?: Date): boolean;
export function getNextOpenTime(now?: Date): string;   // "08:00 hôm nay" | "08:00 ngày mai" | "24/7"
export function getResponseTimeLabel(now?: Date): string;  // "~ 15 phút" (in-hours) / "~ 8 giờ" (out)
```

Vet identity is **env-driven** with brand-safe defaults:
- `CLINIC_VET_NAME` defaults to `"BSTY Mon Min Pet"` (not the real-person name)
- `CLINIC_VET_CREDENTIALS` defaults to `"WSAVA Certified|5+ năm kinh nghiệm|Thú cưng nhỏ"` (pipe-separated)

If a future deployment wants to surface a real vet's name, set these env vars in `.env`.

### 2. Rewrote `web/src/pages/chat/index.astro`

| Section                | Before                                                | After                                                                                                                       |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Header**             | `bg-sky-600 hover:bg-sky-700` "+ Mới" button         | Sticky `bg-white`; Fraunces italic title; gold message-circle chip; total-unread `<Badge variant="danger">`; gold `<Button variant="gold">` "+ Mới" |
| **Vet hero**           | (none)                                                | `bg-mmp-ink text-white` card + decorative gold orb top-right + 16×16 avatar with emerald online dot (animate-ping when open) + name + title + status pill + 3 credential chips + response time + privacy badge |
| **Empty state**        | 🐾 emoji + 1 sky-600 button                          | "Bắt đầu nhanh" gold eyebrow + Fraunces "Bạn cần tư vấn gì hôm nay?" + 4 quick-prompt cards (2-col) + "Hỏi câu khác" CTA + 3 trust signals (Riêng tư / BS thật / Lưu lịch sử) |
| **Thread list**        | sky-200 border on hover                                | mmp-ink border on hover; **gold unread pill** (was red); status badge via `<Badge variant=...>` primitive; "Cuộc trò chuyện mới" card at bottom |
| **Bottom info**        | tiny "8h-22h" text                                    | Rounded card with info icon, mentions vet name + clinic name, real phone tel:, link to `/emergency` for after-hours          |
| **FAB (mobile)**       | sky-600 round button                                  | Gold (#ecb921) round button, ink icon; only renders when threads exist (empty state already has CTAs)                       |

### 3. Quick prompt cards (4)

All link to `/chat/new?subject=...` so `chat/new.astro` pre-fills the form (existing flow).

| Icon | Title                  | Subject pre-fill                       |
| :--: | ---------------------- | -------------------------------------- |
| 🍴   | Tư vấn dinh dưỡng      | "Tư vấn dinh dưỡng cho bé"             |
| 💉   | Lịch tiêm vaccine      | "Tư vấn lịch tiêm vaccine"             |
| 🤒   | Triệu chứng bất thường | "Triệu chứng bất thường — cần khám không?" |
| 🐾   | Chăm sóc hằng ngày     | "Hỏi cách chăm sóc hằng ngày cho bé"    |

### 4. Identity correction

The mega-prompt uses two strings that were already renamed in earlier tasks:

- "**Mon Min PetCoach**" → "**Mon Min Pet**" (task #97)
- "**BS Duy Trường Phát**" → "**BSTY Mon Min Pet**" (task #57)

The new page uses the corrected identities. The 2 remaining grep hits for these strings are **inside the JSDoc comment** at the top of the file, where they explain the brand rule as a guard for future maintainers (`"NOT 'Mon Min PetCoach' — fixed in task #97"`). They're not user-facing.

---

## Acceptance checklist (10 / 10)

| # | Requirement                                                                | Source check / line                              | Status |
| - | -------------------------------------------------------------------------- | ------------------------------------------------ | :---:  |
| 1 | Header brand ink/gold, button "+ Mới" gold accent                          | `<Button variant="gold" size="sm">+ Mới</Button>` | ✓ |
| 2 | Vet hero card with avatar + online indicator + status pill + 3 chips + response time + privacy badge | bg-mmp-ink card + `animate-ping` (1) + `vet.credentials.map` + response time + "Riêng tư + mã hoá" | ✓ |
| 3 | 4 quick-prompt cards on empty state (Dinh dưỡng / Vaccine / Triệu chứng / Chăm sóc) | quickPrompts array literal w/ 4 entries | ✓ |
| 4 | "Hỏi câu khác" custom CTA (full-width card)                                | 3 hits in source                                  | ✓ |
| 5 | 3 trust signals grid (🔒 Riêng tư / 🏥 BS thật / 📋 Lưu lịch sử)            | `Riêng tư`, `BS thật`, `Lưu lịch sử` — 5 combined hits | ✓ |
| 6 | Conversation list with unread badge when threads exist                     | `unread_count_owner` → gold pill `background: var(--c-gold)` | ✓ |
| 7 | Bottom info card with clinic name + hours + `/emergency` link              | clinic.name + hours_weekday + `/emergency` + `tel:` | ✓ |
| 8 | NO blue/cyan/sky leftover (urgency colors)                                  | bg-blue/cyan/sky: 0, text-blue/cyan/sky: 0       | ✓ |
| 9 | Mobile 375px responsive (FAB on mobile, 2-col prompts, sm: breakpoints)    | `sm:hidden fixed bottom-6 right-6` + `grid-cols-2 gap-3` + `sm:` modifiers | ✓ |
| 10 | Online indicator animate-ping smooth                                       | `animate-ping` on emerald-400 layer of status dot | ✓ |

---

## Source verification (grep)

```
=== Forbidden urgency colors ===
bg-blue-:    0   text-blue-: 0
bg-cyan-:    0   text-cyan-: 0
bg-sky-:     0   text-sky-:  0

=== Brand tokens ===
text-mmp-ink:   15
bg-mmp-ink:      1   (the vet hero)
bg-mmp-cream:    4
var(--c-gold):  12
font-display:    2

=== Required strings ===
Tư vấn dinh dưỡng / Lịch tiêm vaccine / Triệu chứng bất thường / Chăm sóc hằng ngày: 6 hits combined
Riêng tư / BS thật / Lưu lịch sử (trust signals): 5 hits
Bắt đầu nhanh: 2
Đang online | Offline · trả lời: 2
Phản hồi … | Riêng tư + mã hoá: 3
animate-ping: 1
FAB sm:hidden fixed bottom-6: 1
```

---

## Smoke test

```bash
$ curl -s -o /dev/null -w "%{http_code} /chat\n" http://127.0.0.1:4322/chat
302 /chat            # auth-redirect (expected for anon)

$ docker logs vowvet-web --since 60s | grep -i "error\|fail\|astroerror"
# (empty)
```

Page compiles + redirects correctly without 500. The 302 → `/login?return_to=/chat` is correct behavior for anonymous visitors.

---

## Files changed

- **Extended**: `shared/clinic-info.ts` — added `vet` shape + `hours_start/end` + 3 new helper functions
- **Rewritten**: `web/src/pages/chat/index.astro` — 360-line full WOW pass

## Out of scope / known limitations

- Vet avatar uses `👨‍⚕️` emoji fallback when `CLINIC_VET_PHOTO` env var is unset. Set the env to a real `/img/...` URL when ready.
- Status badge "Chờ bác sĩ" uses warning variant — but the underlying badge dot uses amber, which may be too similar to "Open" if both appear in the same list. Acceptable tradeoff; can revisit if user reports confusion.
- The mega-prompt mentioned "AI bot" disambiguation in the trust signal "BS thật" — clinic.vet.name + the response-time (~ 15 phút / ~ 8 giờ) already communicate this is a real-vet workflow, not a chatbot. The trust signal copy ("Không phải AI bot") is explicit.
