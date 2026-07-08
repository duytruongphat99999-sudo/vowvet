/**
 * Admin routes (M8) — protect by phone whitelist từ env ADMIN_PHONES.
 *
 * KHÔNG dùng auth role system Phase 0. Whitelist trong env:
 *   ADMIN_PHONES=+84939233398,+84xxx
 *
 * Endpoints:
 *   GET  /admin/stats           — dashboard counters + AI cost today
 *   POST /admin/users/:id/disable — soft delete user (set deleted_at)
 *   GET  /admin/export/users    — CSV dump users (id, phone, email, created_at, deleted_at)
 *   GET  /admin/export/pets     — CSV dump pets
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { listRows } from "@shared/baserow.ts";
import { getPlace, listPendingPlaces, verifyPlace, rejectPlace } from "../lib/places.ts";
import { findUserById, softDeleteUser } from "../lib/users.ts";
import { adminAnalyticsOverview } from "../lib/analytics.ts";
import { getZaloStatus, sendOtp } from "../lib/otp-sender.ts";
import { normalizePhone } from "@shared/auth.ts";
import { listFosterOrders, updateOrderStatus, FosterOrderError } from "../lib/foster-orders.ts";
import { reclaimPet, reclaimPetByPassport } from "../lib/foster-reclaim.ts";
import { getPendingRequests, approveRequest } from "../lib/reclaim-requests.ts";

const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);

/** Middleware: require admin (must be authenticated + phone trong whitelist). */
const requireAdmin: MiddlewareHandler = async (c, next) => {
  const session = c.get("user");
  if (!session?.phone || !ADMIN_PHONES.includes(session.phone)) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền admin" } }, 403);
  }
  await next();
};

export const adminRoute = new Hono();
adminRoute.use("*", requireAuth);
adminRoute.use("*", requireAdmin);

// ===== FOSTER L5b — đơn góp (admin-only; SĐT chủ bé chỉ ở đây) =====
adminRoute.get("/foster-orders", async (c) => {
  try {
    const orders = await listFosterOrders();
    return c.json({ orders });
  } catch (err) {
    console.error("[admin/foster-orders] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

adminRoute.patch("/foster-orders/:code/status", async (c) => {
  const code = c.req.param("code");
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400); }
  try {
    await updateOrderStatus(code, String(body?.status || ""));
    return c.json({ ok: true, order_code: code, status: body.status });
  } catch (err) {
    if (err instanceof FosterOrderError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 404 | 500);
    console.error("[admin/foster-orders status] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== FOSTER P3b — admin lấy lại bé trao nhầm (reclaim, hoàn tác 1 bước) =====
// :petId nhận MÃ PASSPORT (qr_code, có chữ) — dễ dùng thật. Vẫn chấp nhận ID số
// (chuỗi toàn digit) cho gọi nội bộ/backward-compat.
adminRoute.post("/pets/:petId/reclaim", async (c) => {
  const raw = (c.req.param("petId") || "").trim();
  if (!raw) {
    return c.json({ error: { code: "BAD_PET_ID", message: "Thiếu mã passport bé" } }, 400);
  }
  try {
    const result = /^\d+$/.test(raw)
      ? await reclaimPet(Number(raw))
      : await reclaimPetByPassport(raw);
    // Guard RECON fail (không có handover / trạng thái lệch / sai mã) → 409, không phải lỗi server.
    if (!result.ok) return c.json({ error: { code: "CANNOT_RECLAIM", message: result.reason } }, 409);
    return c.json(result);
  } catch (err) {
    console.error("[admin/reclaim] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== FOSTER Hướng B — queue yêu cầu lấy lại bé (admin duyệt) =====
adminRoute.get("/reclaim-requests", async (c) => {
  try {
    const requests = await getPendingRequests();
    return c.json({ requests });
  } catch (err) {
    console.error("[admin/reclaim-requests] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

adminRoute.post("/reclaim-requests/:requestId/approve", async (c) => {
  const requestId = Number(c.req.param("requestId"));
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return c.json({ error: { code: "BAD_ID", message: "requestId không hợp lệ" } }, 400);
  }
  try {
    const result = await approveRequest(requestId);
    if (!result.ok) return c.json({ error: { code: "CANNOT_APPROVE", message: result.reason } }, 409);
    return c.json(result);
  } catch (err) {
    console.error("[admin/reclaim-approve] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ============================================================
// GET /admin/stats
// ============================================================
adminRoute.get("/stats", async (c) => {
  try {
    const [usersRes, petsRes, alertsRes, vaccinesRes, plansRes, checkInsRes] = await Promise.all([
      listRows<any>("users", { size: 200 }),
      listRows<any>("pets", { size: 200 }),
      listRows<any>("climate_alerts", { size: 200 }),
      listRows<any>("vaccines", { size: 200 }),
      listRows<any>("care_plans", { size: 50 }),
      listRows<any>("daily_check_ins", { size: 50 }),
    ]);

    // Recent signups (7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentSignups = usersRes.results.filter((u: any) => {
      const ts = u.created_at ? new Date(u.created_at).getTime() : 0;
      return ts >= sevenDaysAgo;
    });

    // Active (not soft-deleted) users
    const activeUsers = usersRes.results.filter((u: any) => !u.deleted_at && u.phone);

    // Pets by species
    const speciesCounts: Record<string, number> = { dog: 0, cat: 0, other: 0 };
    for (const p of petsRes.results) {
      if (!p.name) continue; // skip stub rows
      const sp = typeof p.species === "object" ? p.species?.value : p.species;
      if (sp === "dog") speciesCounts.dog++;
      else if (sp === "cat") speciesCounts.cat++;
      else speciesCounts.other++;
    }

    // Active alerts (chưa dismiss)
    const activeAlerts = alertsRes.results.filter((a: any) => !a.dismissed_at && a.severity);

    // Care plans today
    const today = new Date().toISOString().slice(0, 10);
    const plansToday = plansRes.results.filter((p: any) => p.plan_date === today);

    // Vaccine reminders sent today (via notification_log)
    let vaccineRemindersToday = 0;
    try {
      const notifRes = await listRows<any>("notification_log", { size: 200 });
      vaccineRemindersToday = notifRes.results.filter((n: any) => {
        const sentAt = n.sent_at || n.created_at;
        if (!sentAt) return false;
        const t = typeof n.notification_type === "object" ? n.notification_type?.value : n.notification_type;
        return sentAt.startsWith(today) && t === "vaccine_reminder";
      }).length;
    } catch (_) {}

    return c.json({
      users: {
        total: usersRes.count,
        active: activeUsers.length,
        recent_signups_7d: recentSignups.length,
        signups_list: recentSignups.slice(0, 10).map((u: any) => ({
          id: u.id,
          phone: u.phone,
          email: u.email || null,
          name: u.name || null,
          created_at: u.created_at,
        })),
      },
      pets: {
        total: petsRes.results.filter((p: any) => p.name).length,
        by_species: speciesCounts,
      },
      alerts: {
        total: alertsRes.count,
        active: activeAlerts.length,
        critical: activeAlerts.filter((a: any) => {
          const s = typeof a.severity === "object" ? a.severity?.value : a.severity;
          return s === "critical";
        }).length,
      },
      vaccines: {
        total: vaccinesRes.count,
        reminders_sent_today: vaccineRemindersToday,
      },
      care_plans: {
        total_today: plansToday.length,
        total_check_ins_recent: checkInsRes.count,
      },
      ai_cost: {
        today_usd: 0, // TODO M9: integrate gemini-usage.log.jsonl reader
        note: "AI cost tracking defer M9 — xem /app/data/gemini-usage.log.jsonl",
      },
      admin: {
        whitelist_count: ADMIN_PHONES.length,
        whitelist_active: !!ADMIN_PHONES.length,
      },
    });
  } catch (err: any) {
    console.error("[admin/stats] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load stats" } }, 500);
  }
});

// ============================================================
// GET /admin/zalo-status — Zalo ZNS integration status + today usage + cost
// ============================================================

/** Zalo ZNS pricing (VNĐ per OTP message, approximate). */
const ZALO_OTP_COST_VND = 300;

adminRoute.get("/zalo-status", async (c) => {
  const status = getZaloStatus();
  const today = new Date().toISOString().slice(0, 10);

  // Count OTPs sent today from notification_log (type field stores message kind).
  // We don't have a dedicated "otp" type — OTP delivery is logged separately by sendOtp's
  // console hook. Best approximation: count messages from today where type doesn't match
  // the known push types. For accuracy, future iteration can add an "otp_zalo" type to
  // notification_log when ZNS sends.
  //
  // Phase 0: just count rows in notification_log per day as a rough usage proxy + show
  // a clearer hint for the admin.
  let otpsToday = 0;
  let totalNotificationsToday = 0;
  try {
    const res = await listRows<any>("notification_log", {
      filter: { sent_at__date_equal: today },
      size: 500,
    });
    totalNotificationsToday = res.count || 0;
    // For now we count `type=otp_zalo` rows if any; fallback to 0
    otpsToday = res.results.filter((n: any) => {
      const t = typeof n.type === "object" ? n.type?.value : n.type;
      return t === "otp_zalo";
    }).length;
  } catch (err) {
    console.error("[admin/zalo-status] notification_log read error:", err);
  }

  const estimatedCostVnd = otpsToday * ZALO_OTP_COST_VND;

  return c.json({
    status: {
      mode: status.mode,
      mode_label:
        status.mode === "zns_real"
          ? status.ready_for_real
            ? "Real ZNS active"
            : "Real ZNS mode set BUT credentials incomplete (auto-fallback to console)"
          : "Mock mode (free, console log)",
      oa_id: status.oa_id,
      has_access_token: status.has_access_token,
      has_template_id: status.has_template_id,
      has_app_id: status.has_app_id,
      ready_for_real: status.ready_for_real,
    },
    usage_today: {
      date: today,
      otps_sent_zalo: otpsToday,
      total_notifications: totalNotificationsToday,
      estimated_cost_vnd: estimatedCostVnd,
      estimated_cost_formatted: new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(estimatedCostVnd),
    },
    pricing: {
      per_otp_vnd: ZALO_OTP_COST_VND,
      note: "Approximate Zalo ZNS OTP template price (subject to Zalo's actual rate)",
    },
  });
});

// ============================================================
// POST /admin/zalo-test — gửi OTP test tới SĐT bất kỳ (admin only)
// ============================================================
adminRoute.post("/zalo-test", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const rawPhone = String(body.phone || "");
  if (!rawPhone) return c.json({ error: { code: "PHONE_REQUIRED", message: "Cần SĐT để test" } }, 400);

  let phone: string;
  try { phone = normalizePhone(rawPhone); }
  catch {
    return c.json({ error: { code: "INVALID_PHONE", message: "SĐT không hợp lệ" } }, 400);
  }

  // Generate test OTP (random 6-digit, not stored in real OTP store)
  const testCode = String(Math.floor(100000 + Math.random() * 900000));

  const result = await sendOtp(phone, testCode);

  return c.json({
    test: true,
    phone,
    code_sent: testCode, // visible vì là endpoint admin
    result,
    hint:
      result.mode === "mock"
        ? "Mock mode — code logged tới docker logs vowvet-api"
        : result.via === "zns"
        ? `Đã gửi qua Zalo ZNS thật. Phí ~${ZALO_OTP_COST_VND}đ.`
        : `Real mode nhưng fallback console (lỗi: ${result.error}). Code logged tới docker logs.`,
  });
});

// ============================================================
// GET /admin/analytics (M10) — overview
// ============================================================
adminRoute.get("/analytics", async (c) => {
  try {
    const overview = await adminAnalyticsOverview();
    return c.json(overview);
  } catch (err: any) {
    console.error("[admin/analytics] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load analytics" } }, 500);
  }
});

// ============================================================
// POST /admin/users/:id/disable
// ============================================================
adminRoute.post("/users/:id{[0-9]+}/disable", async (c) => {
  const session = c.get("user");
  const targetId = Number(c.req.param("id"));

  // Can't disable yourself
  if (targetId === session.sub) {
    return c.json({ error: { code: "SELF_DISABLE", message: "Không thể disable chính mình" } }, 400);
  }

  const target = await findUserById(targetId);
  if (!target) {
    return c.json({ error: { code: "NOT_FOUND", message: "User không tồn tại" } }, 404);
  }
  if (target.deleted_at) {
    return c.json({ success: true, already_disabled: true });
  }
  await softDeleteUser(targetId);
  console.log(`[admin] user ${targetId} disabled by admin ${session.phone}`);
  return c.json({ success: true });
});

// ============================================================
// GET /admin/export/users.csv
// ============================================================
adminRoute.get("/export/users", async (c) => {
  try {
    const res = await listRows<any>("users", { size: 200 });
    const rows = res.results.filter((u: any) => u.phone || u.email);
    const headers = ["id", "phone", "email", "name", "auth_method", "created_at", "last_login_at", "deleted_at"];
    const csv = [
      headers.join(","),
      ...rows.map((u: any) => {
        const am = typeof u.auth_method === "object" ? u.auth_method?.value : u.auth_method;
        return headers
          .map((h) => {
            let v = h === "auth_method" ? am : u[h];
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
          })
          .join(",");
      }),
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vowvet-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[admin/export/users] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi export" } }, 500);
  }
});

// ============================================================
// GET /admin/export/pets.csv
// ============================================================
adminRoute.get("/export/pets", async (c) => {
  try {
    const res = await listRows<any>("pets", { size: 200 });
    const rows = res.results.filter((p: any) => p.name);
    const headers = ["id", "name", "species", "breed", "dob", "gender", "weight_kg", "user_id", "qr_code", "created_at"];
    const csv = [
      headers.join(","),
      ...rows.map((p: any) => {
        return headers
          .map((h) => {
            let v: any = p[h];
            if (h === "species") v = typeof p.species === "object" ? p.species?.value : p.species;
            if (h === "gender") v = typeof p.gender === "object" ? p.gender?.value : p.gender;
            if (h === "user_id") {
              const links = Array.isArray(p.user_id) ? p.user_id : [];
              v = links.map((l: any) => l.id).join("|");
            }
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
          })
          .join(",");
      }),
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vowvet-pets-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[admin/export/pets] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi export" } }, 500);
  }
});

// ============================================================
// POST /admin/cron/test-care-plan-reminders — Phase 4D manual trigger
// Reuses runCarePlanRemindersJob() from lib/care-plan-reminders.ts
// (cron daily 7:15 AM Asia/Ho_Chi_Minh). Verifies the job logic without
// waiting for the next scheduled run. Returns the full CarePlanReminderReport.
// ============================================================
adminRoute.post("/cron/test-care-plan-reminders", async (c) => {
  try {
    const { runCarePlanRemindersJob } = await import("../lib/care-plan-reminders.ts");
    const report = await runCarePlanRemindersJob();
    return c.json({
      success: true,
      triggered_at: new Date().toISOString(),
      schedule: "15 7 * * * (daily 7:15 AM Asia/Ho_Chi_Minh)",
      report,
    });
  } catch (err: any) {
    console.error("[admin/cron/test-care-plan-reminders] error:", err);
    return c.json(
      { error: { code: "CRON_FAIL", message: err?.message || "Lỗi chạy cron test" } },
      500
    );
  }
});

// ============================================================
// POST /admin/cron/test-vaccine-reminders — manually trigger vaccine reminder cron
// Reuses runVaccineRemindersJob() from lib/vaccine-reminders.ts (M6, daily 8 AM VN).
// Allows verifying the job logic without waiting for the next scheduled run.
// Returns the full VaccineReminderReport so admin can see users_processed,
// vaccines_checked, pushes_sent, status_updated_overdue, errors, duration_ms.
// ============================================================
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

// ============================================================
// Place moderation (duyệt place user thêm — Phase 1)
//   GET  /admin/places/pending     — list verified=false AND active=true
//   POST /admin/places/:id/verify  — set verified=true + verified_by/at
//   POST /admin/places/:id/reject  — set active=false (ẩn, GIỮ row)
// (đã sau requireAuth + requireAdmin qua adminRoute.use("*"))
// ============================================================
adminRoute.get("/places/pending", async (c) => {
  try {
    const places = await listPendingPlaces();
    return c.json({ places, total: places.length });
  } catch (err: any) {
    console.error("[admin/places/pending] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load place chờ duyệt" } }, 500);
  }
});

adminRoute.post("/places/:id{[0-9]+}/verify", async (c) => {
  const session = c.get("user");
  const placeId = Number(c.req.param("id"));
  const existing = await getPlace(placeId);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Place không tồn tại" } }, 404);
  }
  try {
    const place = await verifyPlace(placeId, session.sub);
    console.log(`[admin] place ${placeId} verified by admin ${session.phone}`);
    return c.json({ place });
  } catch (err: any) {
    console.error(`[admin/places/${placeId}/verify] error:`, err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi duyệt place" } }, 500);
  }
});

adminRoute.post("/places/:id{[0-9]+}/reject", async (c) => {
  const session = c.get("user");
  const placeId = Number(c.req.param("id"));
  const existing = await getPlace(placeId);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Place không tồn tại" } }, 404);
  }
  try {
    await rejectPlace(placeId);
    console.log(`[admin] place ${placeId} rejected (active=false) by admin ${session.phone}`);
    return c.json({ success: true });
  } catch (err: any) {
    console.error(`[admin/places/${placeId}/reject] error:`, err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi từ chối place" } }, 500);
  }
});
