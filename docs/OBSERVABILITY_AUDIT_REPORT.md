# VowVet — A4 Observability Audit Report
**Date**: 2026-05-23
**Auditor**: Claude Code (READ-ONLY audit — no code modified)
**Scope**: Pre-launch launch-readiness across 10 observability categories

---

## Overall Launch Readiness: 🟡 YELLOW — Shippable for pilot, has gaps for production scale

**Score**: 4 GREEN / 4 YELLOW / 2 RED (no show-stoppers, 2 high-priority gaps before scale)

---

## Category Results

### 1. Sentry / Error Tracking — 🔴 NOT_INSTALLED

**Status**: No `@sentry/node`, `@sentry/astro`, or `Sentry.init()` anywhere in codebase. No `SENTRY_DSN` env var.

**Impact**: Production exceptions are invisible unless someone is watching Docker logs. A bug that silently affects 10% of users will not be detected.

**Recommendation** (P0 before scale):
```bash
# api/: bun add @sentry/node
# web/: bun add @sentry/astro
# .env: SENTRY_DSN=https://...@sentry.io/...
```
Free tier: 5K errors/month. Takes ~30 min to wire in.

---

### 2. Error Logging Patterns — 🟡 INSTALLED_NOT_STRUCTURED

**Status**:
- 290 `console.error(...)` calls across `api/src/` — good coverage with `[module]` prefixes
- 31 `throw new Error(...)` at boundary checks
- No structured logging library (no pino/winston/bunyan)
- Pattern is consistent: `console.error("[module] description:", err)` — grep-friendly

**Impact**: Logs go to Docker stdout only. No aggregation, no search, no alerting. Fine for single-server pilot, painful at scale.

**Recommendation** (P2): Replace `console` with `pino` later. For now, set up Docker log driver → file + logrotate.

---

### 3. Health Check Endpoint — 🟢 ACTIVE

**Status**: Endpoint confirmed working.
```
GET http://localhost:3010/api/v1/health
→ 200 {"status":"ok","services":{"baserow":"ok","r2":"ok"},"timestamp":"..."}
```
- Checks Baserow connectivity ✓
- Checks R2 connectivity ✓
- Returns 503 if either is degraded ✓
- Source: `api/src/routes/health.ts`

**Gap**: No automated uptime monitoring calls this endpoint (no UptimeRobot/BetterUptime configured).

---

### 4. Performance Metrics — 🟡 PARTIAL

**Status**:
- **Custom `duration_ms` tracking**: `scheduler-jobs.ts`, `care-plan-reminders.ts` track elapsed time per cron run ✓
- **Gemini cost per request**: `care-planner-v2.ts:463` logs `cost=$X tok=X/X elapsed=Xms` ✓
- **No APM**: No NewRelic, Datadog, or OpenTelemetry — zero distributed tracing or p99 latency visibility

**Sample log** (already live):
```
[care-plan-v2] generated pet=3 cost=$0.0028 tok=2386/853 elapsed=3241ms
```

**Recommendation** (P2): Axe the full APM cost for pilot. Consider adding response time logging middleware to Hono for the 3 slowest endpoints (care-plan, triage, photos).

---

### 5. DB / API Monitoring — 🟡 PARTIAL

**Status**:
- **Gemini cost log**: `/app/data/gemini-usage.log.jsonl` IS ACTIVE and being written (confirmed entries from 2026-05-21) ✓
  ```json
  {"ts":"2026-05-21T20:26:06Z","model":"gemini-2.5-flash","input_tokens":2386,"output_tokens":853,"cost_usd":0.0028,...}
  ```
- **Analytics endpoint** (`api/src/lib/analytics.ts`) reads this file for admin dashboard ✓
- **R2 errors**: caught and `console.warn`'d in `photos.ts` ✓

**Critical gaps**:
- `shared/baserow.ts` has **no request timeout** — a Baserow hang will block a Hono request indefinitely (no `AbortSignal`, no `signal: AbortSignal.timeout(10000)`)
- No Gemini quota alarm — `429` errors are logged but nothing alerts you when you hit the daily limit until users start seeing failures

---

### 6. User Analytics — 🔴 NOT_INSTALLED

**Status**: No Posthog, Plausible, Google Analytics, Mixpanel, or Amplitude in codebase. The `analytics.ts` lib exists but it aggregates internal operational metrics (AI costs, push delivery, triage distribution) for admin — NOT user behavior tracking.

**Impact**: You cannot answer: "Which features do users actually use? Where do they drop off? What is the funnel from signup → first care plan?"

**Recommendation** (P1 for launch insights):
- **Plausible Analytics** (GDPR-friendly, no cookie banner needed, ~$9/mo): one `<script>` tag in `Layout.astro`
- Or use **Posthog** free tier for event-level tracking

---

### 7. Critical Path Monitoring — 🟡 PARTIAL

**Status**:

| Path | Logged | Alerted on failure |
|---|---|---|
| Cron job run (daily forecast, vaccine reminders, care plan) | ✓ `console.log` start/done with duration_ms | ✗ No alert if exception |
| Push delivery | ✓ `notification_log` table row per send | ✗ No alert on high failure rate |
| AI generation (care plan) | ✓ `gemini-usage.log.jsonl` per call | ✗ No alert on `429` quota |
| Safety violation detection | ✓ `console.error [care-plan-v2] SAFETY VIOLATION pet=X` | ✗ **Not pushed to admin** |
| Urgency-5 triage | ✓ Push to `ADMIN_PHONES` | ✓ Alerted |
| Baserow connectivity | ✓ via `/api/v1/health` | ✗ Nothing auto-checks |

**Biggest gap — Safety violations are silent to admin**: When `validateCarePlanSafety()` flags a violation, it logs to stdout but never notifies the vet or admin. In production, you want an admin push when `safe: false` occurs so BS Duy Trường Phát can review. This is a **2-line fix** (call `sendPush` on violation) — but requires admin user IDs.

---

### 8. Disk / Resource — 🟢 HEALTHY

**Status**:
```
vowvet-api:  CPU=0.94%   MEM=74.73MiB / 13.54GiB   (0.5% memory)
vowvet-web:  CPU=0.12%   MEM=132.1MiB / 13.54GiB   (1.0% memory)
Disk:        1006.9G total, 177.9G used (19%)
```
Both containers are lightweight. Disk is not a concern for months.

**Gap**: No log rotation in Docker. Container stdout accumulates indefinitely. At current volume this is fine, but set `--log-opt max-size=50m --log-opt max-file=3` in `docker-compose.yml` before scale.

---

### 9. Backup Strategy — 🟡 PARTIAL

**Status**:
- **Manual backups exist** ✓: `backups/pre-launch-2026-05-17.sql` + `backups/pre-pilot-2026-05-17.tar.gz` (created 2026-05-17)
- **No automated backup cron** in `api/src/scheduler.ts` — zero scheduled Baserow exports
- **No R2 lifecycle rules** — old vaccine photos accumulate indefinitely

**Risk**: Last backup was 2026-05-17. Any data loss since then is unrecoverable without a new manual backup. With real user data post-launch, this is a P0.

**Recommendation** (P1 before launch):
```bash
# Add to scheduler: daily 3 AM — bun run scripts/backup-baserow.ts
# → exports all tables to backups/YYYY-MM-DD.json + keeps last 7 days
```

---

### 10. Alert Routing — 🟡 PARTIAL

**Status**:

| Alert type | Routing |
|---|---|
| Urgency-5 triage | ✓ Push to `ADMIN_PHONES` users |
| Chat new thread (vet notification) | ✓ Push to all `is_vet=true` users |
| Safety violation (care plan) | ✗ `console.error` only — not sent to admin |
| Cron job failure | ✗ `console.error` only |
| Baserow down | ✗ Health endpoint shows status but no auto-alert |
| Gemini quota `429` | ✗ Logged but not alerted |
| R2 upload fail | ✗ `console.warn` only |

No external routing: no Webhook, no PagerDuty, no Opsgenie, no Telegram bot.

**For pilot** (small team, VN timezone): Zalo group notification via Webhook is cheap and sufficient. One webhook call on critical errors beats setting up PagerDuty.

---

## Priority Action Plan

| Priority | Action | Effort | Impact |
|---|---|---|---|
| **P0** | Install Sentry (free tier, 5K errors/mo) in api + web | 30 min | Catches all unhandled exceptions |
| **P0** | Add Baserow request timeout `AbortSignal.timeout(10_000)` in `shared/baserow.ts` | 5 min | Prevents indefinite hang on Baserow failure |
| **P1** | Push safety violations to admin when `safe: false` | 15 min | Vet loop-in on AI safety failures |
| **P1** | Daily automated Baserow backup cron script | 1h | Data safety post-launch |
| **P2** | Add Docker log rotation (`max-size=50m, max-file=3`) to compose | 5 min | Prevents unbounded log growth |
| **P2** | Install Plausible Analytics script in `Layout.astro` | 15 min | User behavior visibility |
| **P3** | Zalo/Webhook alert on cron critical failures | 2h | Operations awareness |

---

## Summary Table

| # | Category | Status | Notes |
|---|---|---|---|
| 1 | Sentry / Error tracking | 🔴 NOT_INSTALLED | **P0 fix needed** |
| 2 | Error logging | 🟡 PARTIAL | 290 console.errors, no aggregation |
| 3 | Health check endpoint | 🟢 ACTIVE | `/api/v1/health` checks Baserow + R2 |
| 4 | Performance metrics | 🟡 PARTIAL | Custom duration_ms + Gemini cost log |
| 5 | DB/API monitoring | 🟡 PARTIAL | Cost log active, no Baserow timeout |
| 6 | User analytics | 🔴 NOT_INSTALLED | No Plausible/Posthog |
| 7 | Critical path monitoring | 🟡 PARTIAL | Logs exist, no failure alerting |
| 8 | Disk/resource | 🟢 HEALTHY | 19% disk, <1% memory each |
| 9 | Backup strategy | 🟡 PARTIAL | Manual backups only, no automation |
| 10 | Alert routing | 🟡 PARTIAL | Only urgency-5 triage alerts admin |

---

## Key Positive Findings (không cần fix)

- **Gemini cost log is live**: `/app/data/gemini-usage.log.jsonl` tracks every AI call with cost, tokens, pet_id — ready for billing analytics
- **Health endpoint covers both dependencies**: Baserow + R2 check in one call, returns 503 on degraded state — drop-in ready for Docker healthcheck
- **Memory footprint is excellent**: 74 MB API + 132 MB Web on 13.5 GB host — room to grow 50x before hardware is a constraint
- **Manual backups exist**: Data was backed up at pre-launch milestone — not automated but not zero
- **Push delivery logged**: Every push send creates a `notification_log` row — can query delivery rates from Baserow

---

*Generated by Claude Code — READ-ONLY audit, no source code was modified.*
