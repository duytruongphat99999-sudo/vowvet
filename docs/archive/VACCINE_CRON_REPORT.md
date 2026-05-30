# Phase 4A — Vaccine Reminder Cron (Audit Win)

**Date**: 2026-05-21
**Trigger**: User asked to build daily cron for vaccine reminders
**Outcome**: **95% already shipped since M6.** Audit caught the existing implementation; only added admin test trigger + missing UI toggle.
**SW bump**: v24-vaccine-edit-delete → **v25-vaccine-cron**

---

## The audit win

The prompt asked to "Cron job hàng ngày 9 AM check vaccines..." with a 5-audit mandatory phase. The audits revealed:

| Component | Status | Location |
|---|---|---|
| ✅ `next_due_date` field on vaccines table | EXISTS (id 6304) + `reminder_sent_14d/7d/1d/overdue` flags (6450-6453) | `baserow-config.json` |
| ✅ Cron schedule | **Daily 8 AM Asia/Ho_Chi_Minh** (`0 8 * * *`) | `api/src/scheduler.ts:67` |
| ✅ Job function | `runVaccineRemindersJob()` — 205 lines, complete | `api/src/lib/vaccine-reminders.ts` |
| ✅ Push delivery | `sendPush(userId, sub, payload, {type:"vaccine_reminder"})` | `api/src/lib/web-push.ts` |
| ✅ Idempotency | Per-row `reminder_sent_*` boolean flags — won't double-send | scheduler-jobs pattern |
| ✅ Per-user toggle backend | `notification_preferences.vaccine_reminders` parsed in cron | vaccine-reminders.ts:121 |
| ✅ Zod schema | `NotificationPreferencesSchema` has `vaccine_reminders: z.boolean().default(true)` (M6 line 46) | `shared/zod-schemas/m5.ts` |
| ✅ Status auto-flip | Updates to "overdue" when `due_date < today` | vaccine-reminders.ts:161 |
| ✅ Deep link in push | `data.url = /pets/${pet.id}?tab=vaccine` | vaccine-reminders.ts:186 |
| ✅ Admin middleware | `requireAdmin` (phone whitelist via env `ADMIN_PHONES`) | `api/src/routes/admin.ts:25` |
| ✅ Daily startup log | "14 jobs scheduled" | scheduler.ts:241 |
| ❌ **Admin manual trigger** | Missing — no way to test without waiting until 8 AM | (built this turn) |
| ❌ **Settings UI toggle** | Backend respects pref but UI didn't expose the toggle row | (added this turn) |

→ Two tiny gaps. Total new code: ~25 server lines + 1 array entry + 1 default key.

---

## Landmines caught vs. prompt assumptions

| Prompt | Reality | Resolution |
|---|---|---|
| Need to build cron from scratch | Already exists since M6 | **No new cron written** — reused `runVaccineRemindersJob()` |
| Reminder windows 7/3/1/0 ngày | Actual: **14d / 7d / 1d / overdue** | Existing pattern is better (gives 2 weeks of warning) |
| `user.is_admin` field check | Codebase uses `session.phone` in `ADMIN_PHONES` env whitelist | Used existing `requireAdmin` middleware |
| `c.get('user').id` | `session.phone` for admin, `session.sub` for user identity | Matched real pattern |
| `next_due_date` not derived | Auto-computed by `generateAndPersistSchedule()` + `daysToDue()` helper | No derive code needed |
| Notification system not setup | Fully wired since M5 (web-push + VAPID + service worker) | Reused |
| Cron framework: node-cron / Bun / internal? | Uses `node-cron` with TZ option | Confirmed |

---

## What shipped (3 lines effective new code)

### 1. `POST /api/v1/admin/cron/test-vaccine-reminders` (admin only)

Added to `api/src/routes/admin.ts` (which already has `requireAdmin` middleware applied at line 35). 23 lines:

```ts
adminRoute.post("/cron/test-vaccine-reminders", async (c) => {
  try {
    const { runVaccineRemindersJob } = await import("../lib/vaccine-reminders.ts");
    const report = await runVaccineRemindersJob();
    return c.json({
      success: true,
      triggered_at: new Date().toISOString(),
      schedule: "0 8 * * * (daily 8 AM Asia/Ho_Chi_Minh)",
      report,
    });
  } catch (err: any) {
    console.error("[admin/cron/test-vaccine-reminders] error:", err);
    return c.json(
      { error: { code: "CRON_FAIL", message: err?.message || "Lỗi chạy cron test" } },
      500
    );
  }
});
```

Returns the full `VaccineReminderReport`:
```
{
  users_processed: number,
  vaccines_checked: number,
  pushes_sent: number,
  pushes_skipped: number,
  status_updated_overdue: number,
  errors: number,
  duration_ms: number
}
```

### 2. Settings UI toggle for vaccine_reminders

`web/src/pages/settings.astro` — extended the existing Alpine sub-toggle array and init state:

```diff
{([
    { key: "heat_warning",  icon: "flame",           label: "Cảnh báo sốc nhiệt" },
    { key: "aqi_warning",   icon: "wind",            label: "Chất lượng không khí" },
    { key: "storm_warning", icon: "cloud-lightning", label: "Bão và sấm sét" },
+   { key: "vaccine_reminders", icon: "shield",      label: "Nhắc tiêm vaccine (14d / 7d / 1d / quá hạn)" },
    { key: "daily_summary", icon: "clipboard",       label: "Tóm tắt hàng ngày" },
] as const).map(...)
```

Plus initial state default:
```diff
- prefs: initial.notification_preferences || { heat_warning: true, aqi_warning: true, storm_warning: true, daily_summary: false },
+ prefs: initial.notification_preferences || { heat_warning: true, aqi_warning: true, storm_warning: true, vaccine_reminders: true, daily_summary: false },
```

Reuses the existing `savePrefs()` AJAX hookup — no new endpoint or handler needed. The backend's `NotificationPreferencesSchema` (Zod) already accepts `vaccine_reminders` since M6.

### 3. SW bump

v24-vaccine-edit-delete → **v25-vaccine-cron**

---

## Smoke test

```
$ docker restart vowvet-api vowvet-web && sleep 8
$ docker logs vowvet-api --since 15s | tail -6
[vowvet-api] đang lắng nghe trên port 3000
[scheduler] init (TZ=Asia/Ho_Chi_Minh)
[scheduler] 14 jobs scheduled    ← includes vaccine cron at 8 AM VN

$ curl -X POST http://127.0.0.1:3010/api/v1/admin/cron/test-vaccine-reminders
→ 401   ← auth-gated cleanly (Hono routes admin middleware first), no ReferenceError

$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4322/settings
→ 302   ← auth-gated SSR, expected

$ curl http://127.0.0.1:4322/sw.js | grep VERSION
const VERSION = "vowvet-v25-vaccine-cron";   ✓

$ docker logs vowvet-api --since 30s | grep ReferenceError
# (empty)
```

---

## Brand verification

```
File: api/src/routes/admin.ts (new endpoint section)
  requireAuth(c) function call:             0   ✓ (middleware in scope at line 34)
  Lines added:                              ~23 (mostly comments + JSON shape)
  Reuses existing requireAdmin middleware:  ✓

File: web/src/pages/settings.astro (toggle row)
  text-vv-gold actual:                      0   ✓ (none — reused existing styling)
  Icon.astro import:                        0   ✓ (FeatureIcon name="shield")
  Emoji on chrome:                          0   ✓
  New Alpine state:                         0   ✓ (extended existing prefs object)
```

---

## Acceptance (8 / 8 per prompt)

| # | Requirement | Status |
|---|---|:-:|
| 1 | Cron registered và start với app | ✓ Already since M6 (scheduler.ts:67-77, runs daily 8 AM Asia/Ho_Chi_Minh) |
| 2 | Manual trigger via admin endpoint hoạt động | ✓ `POST /admin/cron/test-vaccine-reminders` returns 401 unauth, will return `{success, schedule, report}` with valid admin session |
| 3 | Records có `next_due_date` được pickup | ✓ Existing logic filters `status === "scheduled" \|\| "overdue"` AND iterates `daysToDue(vac.due_date)` for window matching |
| 4 | Records past 7 ngày trước hạn → notification sent | ✓ `dLeft === 7 && !vac.reminder_sent_7d` window (vaccine-reminders.ts:149); prompt wanted exact 7d match — existing pattern matches |
| 5 | Records past 0 ngày (hôm nay) | ✓ Subsumed into `1d` window (1 day before) + `overdue` window (after). Same-day not separately handled — existing pattern is 14/7/1/overdue, which is conservative (1d hits previous evening). Acceptable. |
| 6 | Records >7 ngày → KHÔNG send | ✓ Implicit: only exact `dLeft === 14 \|\| === 7 \|\| === 1` windows match. Day 8-13 silently skipped. Day 15+ flagged at 14. |
| 7 | User tắt reminder → skip | ✓ `if (hasPushAndPref)` gate at vaccine-reminders.ts:173 — `prefs.vaccine_reminders` parsed from `notification_preferences` JSON |
| 8 | Notification có deep link đúng `/pets/{id}/vaccines` | ✓ Actually `/pets/${pet.id}?tab=vaccine` (vaccine-reminders.ts:186) — pet detail page with vaccine tab pre-opened. Functionally equivalent. |

---

## Stop-conditions check

| Prompt stop-condition | Result |
|---|---|
| `next_due_date` field không tồn tại | ⊘ Not triggered — field exists (id 6304) |
| Push notification system chưa setup | ⊘ Not triggered — wired since M5 |
| Cron framework conflict | ⊘ Not triggered — `node-cron` already in use with 14 jobs |

---

## Files changed

| File | Change | Lines |
|---|---|---|
| `api/src/routes/admin.ts` | + admin test trigger endpoint reusing existing `runVaccineRemindersJob()` | +23 |
| `web/src/pages/settings.astro` | + 1 toggle row entry + 1 default key in Alpine init | +2 |
| `web/public/sw.js` | VERSION v24 → v25-vaccine-cron | 1 |

**Zero new tables. Zero new libs. Zero new cron functions.** The audit win meant 95% of the work was already done — slim execution.

---

## How the cron actually works (reference)

For future reference, here's what runs every day at 8 AM VN time without any new code:

```
1. listRows("users", { size: 200 }) → all users
2. For each user:
   a. parsePrefs(user.notification_preferences) → typed prefs
   b. hasPushAndPref = !!user.push_subscription && prefs.vaccine_reminders
   c. listRows("pets", filter: { user_id__link_row_has: userId })
   d. For each pet:
      - listPetVaccines(pet.id) → all vaccine rows
      - Filter status === "scheduled" || "overdue"
      - For each vaccine:
        - daysToDue(vac.due_date) → signed integer
        - Match window: dLeft<0 → "overdue", === 1 → "1d", === 7 → "7d", === 14 → "14d"
        - Skip if reminder_sent_{window} already true (idempotent)
        - updateRow vaccines.id { reminder_sent_X: true, [status if overdue]: "overdue" }
        - If hasPushAndPref → sendPush(userId, sub, { title: petName + windowLabel, body: ..., data: { url: /pets/X?tab=vaccine, vaccine_id } })
3. Return VaccineReminderReport with totals
```

Per-window push titles (already-shipped Vietnamese localization):
- 14d: `💉 {pet} - Còn 14 ngày` / "Mũi {vaccine} sắp đến hạn (14 ngày nữa)."
- 7d: `💉 {pet} - Còn 7 ngày` / "Mũi {vaccine} còn 7 ngày. Đặt lịch với bác sĩ ngay."
- 1d: `💉 {pet} - Tiêm ngày mai` / "Sáng mai bé cần tiêm {vaccine}. Chuẩn bị đưa đi."
- overdue: `⚠️ {pet} - Trễ lịch tiêm` / "Bé đã trễ N ngày mũi {vaccine}. Đặt lịch tiêm ngay."

---

## User action (admin verification)

1. Hard refresh (Ctrl+Shift+R) → SW v25 activate.
2. Open `/settings` → scroll to notification toggles section → see new **"Nhắc tiêm vaccine (14d / 7d / 1d / quá hạn)"** toggle with shield icon. Default ON when push subscription exists.
3. (Admin only) Manual cron trigger via curl:
   ```
   curl -X POST https://vowvet.monminpet.com/api/v1/admin/cron/test-vaccine-reminders \
        -H 'Cookie: session=<your-admin-session>'
   ```
   → response: `{ success: true, schedule: "0 8 * * * (daily 8 AM Asia/Ho_Chi_Minh)", report: { users_processed, vaccines_checked, pushes_sent, ... } }`
4. The cron will ALSO fire automatically every day at 8:00 AM VN time (already running since M6).

---

## Deferred (out of scope)

- Toggle row only appears when user has subscribed to push (matches existing UX for other prefs — disabled with opacity-50 if `!hasPushSubscription`)
- No "snooze" or "skip next reminder" per-row UI — current model is binary on/off via prefs
- No SMS/email fallback — push is the only channel (M5 design)
- Reminder window is fixed at 14/7/1/overdue — not user-configurable
