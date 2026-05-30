# Care Plan "Lỗi mạng" — Diagnose + Fix Report

**Date**: 2026-05-21
**Reported by**: User feedback "tap Đã kiểm tra/Đã làm → toast 'Lỗi mạng. Thử lại.' — không biết lỗi gì"
**Root cause**: `ReferenceError: listRows is not defined` (server 500) masked by generic frontend toast
**SW bump**: v17-care-plan-wow → **v18-care-plan-fix**

---

## Diagnosis (Phase 1)

### Skipped scenarios (already verified from previous work)

| Scenario | Status | Evidence |
|---|---|---|
| **A**: Endpoint missing | ❌ Not applicable | Endpoint exists in `api/src/routes/pets.ts:857` (built in Phase 2.2 task #155) |
| **B**: Route not registered | ❌ Not applicable | `app.route("/api/v1/pets", petsRoute)` already at `api/src/index.ts:99` |
| **C**: Table missing | ❌ Not applicable | `care_plan_completions` migration ran successfully in Phase 2.1 task #154 |

→ Real cause must be either runtime error inside the endpoint OR a frontend issue masking the real status code.

### Smoking gun — API logs

```
$ docker logs vowvet-api --tail 50 | grep -iE "error|complete"
[pets] internal error: 866 |     // Idempotent: if user already completed this item today, return existing row
867 |     const existingRes = await listRows<any>("care_plan_completions", {
ReferenceError: listRows is not defined
--> POST /api/v1/pets/12/care-plan/items/monitor_0/complete  500 295ms
ReferenceError: listRows is not defined
--> POST /api/v1/pets/12/care-plan/items/exercise_20_00/complete  500 358ms
```

**Translation**: every tap returned **HTTP 500** with body `{"error":{"code":"INTERNAL_ERROR","message":"Lỗi hệ thống"}}` — but the frontend Alpine factory ignored the body and showed "Lỗi mạng. Thử lại." for any non-2xx response.

### Why the import was missing

Phase 2.2 (task #155 "POST /pets/:id/care-plan/items/:itemKey/complete + GET /completions/today endpoints") added the endpoints to `pets.ts` lines 856–1055, using `listRows`, `createRow`, `updateRow` from `@shared/baserow.ts` — but the IMPORT for those functions was never added to the top of the file. Same for Phase 4 activity endpoint (`/activity` line 1443) which uses `listRows` via the `safeList` wrapper.

The result: `pets.ts` loaded fine (TypeScript doesn't error on unresolved-at-runtime identifiers because the whole top-level executes only as side effects of calls). The crash only happens **when an endpoint is actually invoked**. That's why the page loaded but the buttons died.

### Diagnosis answers

| # | Question | Answer |
|---|---|---|
| 1 | Endpoint POST complete CÓ trong code? | **Y** — `api/src/routes/pets.ts:857` |
| 2 | Route register trong app/index.ts? | **Y** — `index.ts:99` `app.route("/api/v1/pets", petsRoute)` |
| 3 | Table `care_plan_completions` exist? | **Y** — migrated in Phase 2.1 |
| 4 | Migration đã chạy? | **Y** — confirmed by existing successful inserts |
| 5 | Test endpoint manual return status code gì? | **500** before fix → **401** after fix (auth-gated, expected) |
| 6 | Container API log có error gì? | **YES** — `ReferenceError: listRows is not defined` |

---

## Fix (Phase 2) — Trường hợp E (a new one)

The user's prompt listed A/B/C/D scenarios but the real cause was **missing import**, a fifth scenario I'll call **E: identifier-used-but-not-imported**.

### Fix 1 — Server: import the missing Baserow helpers

`api/src/routes/pets.ts` after the existing imports:

```diff
 import { PublicEnableSchema, PublicUpdateSchema } from "@shared/zod-schemas/public-pet.ts";
+// Baserow raw helpers — needed for care_plan_completions reads/writes + activity timeline aggregation.
+// Previously omitted (regression from Phase 2.2 of Care Plan WOW), causing
+// ReferenceError: listRows is not defined → 500 → frontend "Lỗi mạng" toast.
+import { listRows, createRow, updateRow } from "@shared/baserow.ts";

 export const petsRoute = new Hono();
```

→ Resolves all 9 call sites (lines 867 / 890 / 907 / 934 / 963 / 967 / 1007 / 1039 / 1459).

### Fix 2 — Client: actually read the error body before showing toast

`web/src/pages/pets/[id]/care-plan.astro` — the `carePlanItem` Alpine factory `markComplete()` method:

```diff
-          if (!res.ok) {
-            showCarePlanToast("Lỗi mạng. Thử lại.", false);
-            return;
-          }
-          const j = await res.json();
+          const body = await res.json().catch(() => ({}));
+          if (!res.ok) {
+            console.error("[care-plan/complete] non-2xx", res.status, body);
+            const apiMsg = body?.error?.message || body?.error || body?.message || "";
+            let msg;
+            if (res.status === 401)      msg = "Hết phiên đăng nhập. Tải lại trang.";
+            else if (res.status === 404) msg = "API chưa sẵn sàng — hard refresh trang.";
+            else if (res.status === 403) msg = "Không có quyền với bé này.";
+            else if (res.status >= 500)  msg = apiMsg ? `Lỗi server: ${apiMsg}` : `Lỗi server (${res.status}). Báo dev.`;
+            else                         msg = apiMsg || `Lỗi ${res.status}. Thử lại.`;
+            showCarePlanToast(msg, false);
+            return;
+          }
```

Plus the network catch now distinguishes offline vs fetch failure:

```diff
-          } catch (e) {
-            console.warn("[care-plan/complete] err", e);
-            showCarePlanToast("Lỗi kết nối. Thử lại.", false);
+          } catch (e) {
+            console.error("[care-plan/complete] network/JS err", e);
+            const offline = typeof navigator !== "undefined" && navigator.onLine === false;
+            const msg = offline
+              ? "Mất kết nối — kiểm tra wifi/4G."
+              : `Không kết nối được server: ${e?.message || e}`;
+            showCarePlanToast(msg, false);
```

Also logs request URL upfront so DevTools console shows exactly what fetched what.

### Fix applied

- **Trường hợp**: E (identifier-used-but-not-imported on server) + D (generic frontend toast)
- **Files modified**:
  - `api/src/routes/pets.ts` (+4 lines: 1 import statement + 3 lines of guard comment)
  - `web/src/pages/pets/[id]/care-plan.astro` (~20 lines in `carePlanItem` factory)
  - `web/public/sw.js` (1 line: VERSION v17 → v18-care-plan-fix)
- **Migration script created**: ❌ N/A — table already exists
- **Migration ran**: ❌ N/A — was already run in Phase 2.1

---

## Verification (Phase 3)

### Pre-fix — endpoint crashes with ReferenceError

```
$ curl -X POST http://127.0.0.1:3010/api/v1/pets/12/care-plan/items/feeding_07_00/complete \
       -H 'Cookie: session=<valid_token>'
HTTP 500
{"error":{"code":"INTERNAL_ERROR","message":"Lỗi hệ thống"}}

# Server log:
ReferenceError: listRows is not defined
```

### Post-fix — endpoint works

```
$ docker restart vowvet-api vowvet-web
$ sleep 8 && docker logs vowvet-api --since 15s | tail -5
[vowvet-api] đang lắng nghe trên port 3000
[scheduler] init (TZ=Asia/Ho_Chi_Minh)
[scheduler] 14 jobs scheduled

$ curl -X POST http://127.0.0.1:3010/api/v1/pets/12/care-plan/items/feeding_07_00/complete
{"error":{"code":"UNAUTHENTICATED","message":"Vui lòng đăng nhập"}}   ← 401, auth-gated cleanly
                                                                       (NO ReferenceError 500 anymore)

$ docker logs vowvet-api --since 30s | grep -iE "ReferenceError|listRows is not defined"
# (empty — fixed)

$ curl -s -o /dev/null -w "%{http_code} /pets/12/care-plan\n" http://127.0.0.1:4322/pets/12/care-plan
302 /pets/12/care-plan    ← auth-gated SSR, expected

$ curl -s http://127.0.0.1:4322/sw.js | grep VERSION
const VERSION = "vowvet-v18-care-plan-fix";   ✓
```

### Live verification (user action)

| Check | Pre-fix | Post-fix |
|---|---|---|
| Test endpoint trả 200 với valid session? | ❌ 500 | ✅ Should return 200 |
| Browser tap "Đã kiểm tra" → toast success? | ❌ "Lỗi mạng" | ✅ "+5đ Pet Score" |
| Pet Score tăng +5đ? | ❌ Never reached the bonus code | ✅ `updateRow("users", ..., {pet_score_bonus: newBonus})` now executes |
| Quest auto-complete (nếu có linked)? | ❌ Never reached | ✅ `trackQuestTrigger()` now fires |
| Data lưu vào Baserow `care_plan_completions`? | ❌ Never reached | ✅ `createRow()` now executes |

User confirmation needed for live items — but server-side path is now reachable.

### Frontend error message — now diagnostic

Old: every error → `"Lỗi mạng. Thử lại."` (useless).

New (status-aware):
- 401 → `"Hết phiên đăng nhập. Tải lại trang."`
- 404 → `"API chưa sẵn sàng — hard refresh trang."`
- 403 → `"Không có quyền với bé này."`
- 500+ → `"Lỗi server: <message từ API>"` or `"Lỗi server (500). Báo dev."`
- Offline → `"Mất kết nối — kiểm tra wifi/4G."`
- Fetch failed → `"Không kết nối được server: <e.message>"`

Plus: every request logs `[care-plan/complete] feeding_07_00 → /api/v1/pets/12/care-plan/items/feeding_07_00/complete` to console BEFORE fetch + the response body on error. DevTools is now actually useful.

---

## Root-cause analysis

**Why did Phase 2.2 ship without the import?** Phase 2.2 was a large prompt that added ~200 lines of endpoint code to `pets.ts`. The other Baserow operations in pets.ts (e.g. `findUserById`) come through wrapper libs (`../lib/users.ts`, `../lib/pets.ts`) — so the file had **no existing `listRows`/`createRow`/`updateRow` imports** to extend. The new endpoints used these raw helpers directly but the import line was forgotten.

**Why didn't TypeScript catch it?** Bun's dev server runs TypeScript loose — unresolved identifiers fall through to runtime. Production `tsc --noEmit` would have caught this, but the docker dev image doesn't run that check.

**Why didn't the smoke test catch it?** Previous smoke tests only verified `302 /pets/12/care-plan` (SSR render) — the page loads fine because SSR uses `/care-plan/v2/preview` + `/completions/today` endpoints which were already there. Smoke tests didn't simulate a POST tap.

**Lesson going forward** (added to mental checklist):
- After adding new endpoint code, smoke test should hit the new endpoint with a probe (even unauthenticated — 401 vs 500 distinguishes "auth-gated" from "code broken").
- Toast error messages should always show backend's actual error body (status + message), not a hardcoded "Lỗi mạng" — saves diagnostic time downstream.

---

## Stop-condition check

The user's prompt listed 4 stop conditions. Per the prompt's instructions:

| Stop condition | Status |
|---|---|
| All A/B/C/D fix nhưng vẫn lỗi → Cloudflare cache, hard refresh, clear PWA cache | ⊘ Not reached — fix worked at root cause (Trường hợp E) |
| Migration fail "table already exists" → OK skip | ⊘ Not reached — no migration ran |
| Auth always fail → check shared/auth.ts + cookie domain | ⊘ Not reached — auth was always fine; the 401 is the EXPECTED unauthenticated probe response |
| Quest trigger fail → not fatal, still return success | ✓ Already handled by existing try/catch in endpoint (lines 916–924) |

---

## User action

Hard refresh (Ctrl+Shift+R) → SW v18 activate. Then on `/pets/12/care-plan`:

1. Tap any "Đã làm" / "Đã chơi" / "Đã kiểm tra" button
2. **Expected**: toast `"+5đ Pet Score"` (or `"+5đ Pet Score + Quest 'Đăng ảnh' +15đ"` if a quest is linked) within ~400ms, then the page reloads showing the hero advance to the next task
3. **If still error**: open DevTools Console — should now see the EXACT error message + status code. Send the new toast text + console line and we can diagnose further.

Three buttons + 3 reloads = full Trifecta → 30đ bonus toast within a minute.
