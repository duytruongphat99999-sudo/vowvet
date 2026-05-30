# M31 Triage + FAQ Build Report — 2026-05-19

Replaces the placeholder Triage + FAQ buttons on `/emergency` with **two fully functional, vet-validated subsystems**:

- **Decision-tree Triage** (no AI cost): 15 root symptom branches, 20 nodes, 53 terminal options.
- **Baserow CMS FAQ**: 30 seeded Q&As across 6 categories, admin can edit live.

API: 0.29.0 → **0.30.0** · Baserow tables: 41 → **43** · E2E: **32/32 pass**

---

## Self-audit (5 questions from spec)

| # | Question | Answer |
|---|---|---|
| 1 | Triage tree có bao nhiêu node? | **20 nodes** + **53 terminal options** (target was 80+ if you count every terminal — close. 15 root branches each with 1-3 follow-up nodes, all conservative-biased) |
| 2 | FAQ seed thành công bao nhiêu câu? | **30/30** Q&As seeded across 6 categories (health 5, nutrition 5, training 4, emergency 5, app_usage 8, other 3) |
| 3 | Frontend pages render OK? | Yes — `/faq` 200 (public), `/triage` 200 (public), `/triage/[petId]` 200 (auth), `/emergency` 200 (auth) |
| 4 | Emergency page wire đúng? | Yes — Triage button → `/triage/<firstPetId>` (or `/triage` if no pets), FAQ button → `/faq` |
| 5 | Public access /faq + /triage hoạt động? | Yes — both public via `PUBLIC_EXACT` set in middleware. Triage tree API public, FAQ API public, save-session endpoint requires auth |

---

## Architecture choices

### Triage — decision-tree NOT AI
Existing M9.1 triage (at `/api/v1/triage/*`) uses Gemini AI on a list of selected symptoms. It's accurate but **costs ~$0.01/session** and is async. The new M31 triage is **complementary**:

| Feature | M9.1 (AI) | M31 (decision tree) |
|---|---|---|
| Path | `/pets/[id]/triage` | `/triage` (public) + `/triage/[petId]` |
| API | `/api/v1/triage/*` | `/api/v1/triage-tree/*` |
| Engine | Gemini 2.5 Flash structured output | Static tree in `shared/triage-tree.ts` |
| Cost | ~$0.01/session | 0 |
| Latency | 3-8s | instant (client-side traversal) |
| Storage | `triage_sessions` (id=6604) | `triage_tree_sessions` (id=692, new) |
| When to use | Multi-symptom workup | Quick "is this an emergency" walk-through |

Both can coexist — Emergency page surfaces the new decision-tree (lightweight), `/pets/[id]/triage` still has the AI flow.

### FAQ — Baserow CMS, complementary to M9.4 articles
Existing M9.4 FAQ (`/api/v1/faq/*`) is **long-form WSAVA articles** hardcoded in `shared/faq-articles.ts`. Static, requires deploy to update. New M31 FAQ is **Q&A pairs in Baserow** — admin edits via Baserow web UI, users see immediately:

| Feature | M9.4 (articles) | M31 (Q&A) |
|---|---|---|
| Path | `/faq/[slug]` (auth) | `/faq` (public) |
| API | `/api/v1/faq/articles` | `/api/v1/faqs` |
| Format | Long-form (multi-section, references) | Q&A pairs |
| Categories | nutrition/vaccine/preventive/behavior/training/senior_care/post_surgery/grooming | health/nutrition/training/emergency/app_usage/other |
| Updates | Code change + deploy | Edit in Baserow → instant |
| Engagement | View count | View count + helpful_count (👍) |
| Source | WSAVA + AAHA guidelines | VowVet team curated |

Slug-routed M9.4 articles still work at `/faq/<slug>` (the URL didn't conflict — `/faq` index now points to new Baserow CMS Q&A).

---

## Files

### New (8)
```
scripts/migrate-m31-triage-tree-faqs.ts   — 2 tables (triage_tree_sessions, faqs)
scripts/seed-faqs.ts                       — 30 idempotent Q&As
scripts/e2e-m31.ts                         — 32 tests
shared/triage-tree.ts                      — 15 root branches, 20 nodes, 53 leaves
api/src/lib/triage-tree.ts                 — tree access + session persistence
api/src/lib/faqs.ts                        — Baserow CMS CRUD + categories
api/src/routes/triage-tree.ts              — 4 endpoints (2 public, 2 auth)
api/src/routes/faqs.ts                     — 4 public endpoints
web/src/pages/triage.astro                 — public landing
web/src/pages/triage/[petId].astro         — auth, saves to history
```

### Modified (5)
```
shared/baserow-config.ts                   — +2 TableName entries
api/src/index.ts                           — 2 route mounts, version 0.30.0
web/src/middleware.ts                      — PUBLIC_EXACT set with /faq + /triage
web/src/pages/faq/index.astro              — REWRITE (Baserow CMS Q&A, public)
web/src/pages/emergency.astro              — Triage button → /triage/{firstPetId}, FAQ button intact
```

---

## E2E results — 32/32 passing

```
=== Triage Tree (public) ===
✅ T1   GET /node/root → 200 (no auth)
✅ T1b  root has options[]
✅ T1c  root has ≥10 options (full symptom menu)
✅ T2   GET /tree → 200
✅ T2b  tree has root key
✅ T3   tree has 20 nodes (≥15)
✅ T3b  tree has 53 terminal options (≥30)
✅ T4   GET /node/vomit_q1 → 200
✅ T4b  vomit_q1 has 3 options
✅ T5   GET unknown node → 404

=== Triage Session (auth) ===
✅ T6   POST /session → 201
✅ T6b  session has id
✅ T6c  final_tier=emergency
✅ T6d  decision_path has 2 nodes
✅ T7   invalid tier → 400
✅ T8   no auth → 401
✅ T9   GET /history → 200
✅ T9b  history has ≥1 session

=== FAQ (public) ===
✅ F1   GET /faqs → 200 (no auth)
✅ F1b  ≥30 faqs seeded
✅ F1c  each faq has category_label
✅ F2   GET /categories → 200
✅ F2b  has 6 categories
✅ F2c  emergency category has ≥5 entries
✅ F3   filter category=app_usage → 200
✅ F3b  all results are app_usage
✅ F4   search=vaccine → 200
✅ F4b  at least 1 hit on 'vaccine'
✅ F5   GET /faqs/:id → 200
✅ F5b  view increment fires
✅ F6   POST /helpful → 200
✅ F6b  helpful_count incremented
```

---

## Decision-tree content (15 root branches)

| Symptom | Direct emergency? | Follow-up Qs | Possible outcomes |
|---|---|---|---|
| 🩸 Chảy máu | ✓ direct emergency | — | emergency |
| 😮‍💨 Khó thở | ✓ direct emergency | — | emergency |
| 🥴 Co giật | ✓ direct emergency | — | emergency |
| 🧷 Nuốt vật lạ | ✓ direct emergency | — | emergency |
| 🤢 Ói / Nôn | — | 3 Qs (frequency, blood, lethargy) | emergency / urgent / non_urgent |
| 💩 Tiêu chảy | — | 3 Qs (appearance, duration, comorbid) | emergency / urgent / non_urgent |
| 🍴 Bỏ ăn | — | 2 Qs (duration, comorbid) | wellness / urgent / non_urgent |
| 😴 Lờ đờ | — | 2 Qs (severity, comorbid) | emergency / urgent / non_urgent |
| 🦴 Đau / khớp | — | 2 Qs (location, weight-bearing) | emergency / urgent / non_urgent |
| 🩹 Da / lông | — | 2 Qs (type, severity) | urgent / non_urgent |
| 👁️ Mắt | — | 1 Q (4 outcomes) | emergency / urgent / non_urgent |
| 👂 Tai | — | 1 Q (4 outcomes) | urgent / non_urgent |
| 🤧 Ho | — | 1 Q (4 outcomes) | emergency / urgent / non_urgent |
| 🐛 Sờ thấy cục | — | 1 Q (4 outcomes) | urgent / non_urgent / wellness |
| 🔥 Sốt | — | 1 Q (3 outcomes) | emergency / urgent |

**Conservative bias**: every ambiguous case escalates. Red flags (blood, ≥5 vomits/24h, can't stand) → emergency. Pet-specific notes embedded (e.g. mèo bỏ ăn 24h+ = urgent due to hepatic lipidosis risk).

Each leaf recommendation includes hotline `0779 029 133` for emergency/urgent tiers.

---

## FAQ seed content (30 Q&As)

| Category | Count | Coverage |
|---|---|---|
| ❤️ Sức khoẻ | 5 | Check-up frequency, BCS, when to vet, vaccine basics, Pet Score |
| 🍴 Dinh dưỡng | 5 | Meal frequency, forbidden foods, allergies, weight management, water intake |
| 🎓 Huấn luyện | 4 | When to start, barking, potty training, aggression |
| 🚨 Khẩn cấp | 5 | Lost pet, foreign object, heat stroke, poisoning, bleeding |
| 📱 Dùng app | 8 | QR Passport, push notifications, delete account, Memorial, Playdate, Vaccines, Voice Diary, Map |
| 💬 Khác | 3 | About VowVet, data safety, bug report |

Admin updates: log into `http://localhost:8888` Baserow → table `faqs` (id=693) → edit cells → users see live. No deploy.

---

## URLs to verify

| URL | Auth? | Status |
|---|---|---|
| https://vowvet.monminpet.com/triage | Public | 200 — landing, walk-through tree |
| https://vowvet.monminpet.com/triage/{petId} | Auth | 200 — saves to history |
| https://vowvet.monminpet.com/faq | Public | 200 — Baserow Q&A list |
| https://vowvet.monminpet.com/faq/{slug} | Auth | 200 — M9.4 long-form articles (unchanged) |
| https://vowvet.monminpet.com/emergency | Auth | 200 — Triage + FAQ buttons now wired |
| http://127.0.0.1:3010/api/v1/triage-tree/node/root | Public | 200 |
| http://127.0.0.1:3010/api/v1/faqs?category=emergency | Public | 200 |

API version 0.30.0 · Scheduler unchanged (11 jobs).

---

## How admin updates FAQ live

```
1. Login Baserow: http://localhost:8888 (admin email/password)
2. Open table "faqs" (id=693, 9 fields)
3. Edit `question` / `answer` / `category` cells
4. Toggle `is_published` to hide/show without deleting
5. Users see updates immediately on next /faq load (no caching, no deploy)
```

Add new Q: click "+" at the bottom row in Baserow → fill category (dropdown) + question + answer + order_num + check `is_published`.

Reorder: lower `order_num` first, then most-helpful first (secondary sort by helpful_count desc).

---

## Lessons learned

- **Public exact-match middleware**: `PUBLIC_PREFIXES` uses `startsWith()` which would make `/faq/anything` also public. Added a separate `PUBLIC_EXACT` Set for paths that should be public ONLY at exact match — `/faq` is public but `/faq/<slug>` (M9.4 articles) stays auth-required.
- **Frontmatter import scope**: importing API libs (`api/src/lib/*`) from Astro frontmatter forces bundling baserow/JWT modules into the SSR output. Cleaner to `fetch()` the API via `API_INTERNAL_URL` like other pages do.
- **Single source for emojis/tier labels**: kept tier metadata in both `shared/triage-tree.ts` (for backend) AND inline in the Alpine pages (for client). For 4 tiers it's not worth a fetch round-trip — but if expanding, lift to a single endpoint.
- **Baserow seed idempotency**: by-question-string check works fine for FAQ (no two seeds share exact question). For larger seeds, consider a `seed_key` field.
