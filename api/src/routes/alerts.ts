/**
 * Climate alert routes (M5) + urgent dashboard aggregator:
 *   GET    /api/v1/alerts/today
 *   POST   /api/v1/alerts/:id/dismiss
 *   GET    /api/v1/alerts/history?days=30
 *   GET    /api/v1/alerts/urgent/:petId        — top-priority urgent items for dashboard hero
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { listRows } from "@shared/baserow.ts";
import {
  listActiveAlertsForUser,
  listAlertsHistory,
  getAlertIfOwned,
  dismissAlert,
  toApiAlert,
} from "../lib/alerts.ts";
import { getOwnedPet } from "../lib/pets.ts";

export const alertsRoute = new Hono();
alertsRoute.use("*", requireAuth);

// GET /alerts/today
alertsRoute.get("/today", async (c) => {
  const session = c.get("user");
  try {
    const alerts = await listActiveAlertsForUser(session.sub);
    return c.json({ alerts: alerts.map(toApiAlert) });
  } catch (err: any) {
    console.error("[alerts/today] error:", err);
    return c.json({ error: { code: "ALERTS_FAIL", message: err.message } }, 500);
  }
});

// POST /alerts/:id/dismiss
alertsRoute.post("/:id{[0-9]+}/dismiss", async (c) => {
  const session = c.get("user");
  const alertId = Number(c.req.param("id"));

  const row = await getAlertIfOwned(alertId, session.sub);
  if (!row) {
    return c.json({ error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "Alert không tồn tại hoặc không thuộc bạn" } }, 404);
  }
  if (row.dismissed_at) {
    return c.json({ success: true, already_dismissed: true });
  }
  await dismissAlert(alertId);
  return c.json({ success: true });
});

// GET /alerts/urgent/:petId — dashboard hero urgency aggregator
// Returns up to 1 highest-priority item across: vaccine overdue, active lost pet,
// climate alerts critical, voucher expiring ≤3 days. Used by PetHeroCard / UrgencyBar.
alertsRoute.get("/urgent/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);

    const urgent: Array<{
      severity: "critical" | "urgent";
      icon: string;
      title: string;
      message: string;
      cta_link: string;
      cta_label: string;
      priority: number;
    }> = [];

    // L7: 4 nguồn cảnh báo ĐỘC LẬP → chạy SONG SONG (Promise.allSettled, fail-soft từng nhánh).
    // Cuối vẫn sort theo priority (distinct 100/90/80/50) + slice(0,1) → thứ tự push vô nghĩa →
    // output y hệt bản tuần tự cũ, chỉ nhanh hơn (~1.3s thay vì ~4×1.3s).
    const [lostR, vaxR, cAlertsR, rewardsR] = await Promise.allSettled([
      listRows<any>("lost_pet_reports", {
        filter: { pet_id__link_row_has: String(petId), status__single_select_equal: "active" },
        size: 1,
      }),
      listRows<any>("vaccines", {
        filter: { pet_id__link_row_has: String(petId), status__single_select_equal: "overdue" },
        size: 5,
      }),
      listActiveAlertsForUser(session.sub),
      listRows<any>("user_rewards", {
        filter: { user_id__equal: String(session.sub), status__single_select_equal: "active" },
        size: 10,
      }),
    ]);

    // 1) Active lost-pet report = TOP priority
    if (lostR.status === "fulfilled" && lostR.value.results[0]) {
      const slug = lostR.value.results[0].public_url_slug;
      urgent.push({
        severity: "critical",
        icon: "🚨",
        title: "Pet đang bị mất",
        message: "Xem sightings + mạng lưới Pet Hero gần bạn",
        cta_link: slug ? `/lost/${slug}` : `/lost/nearby`,
        cta_label: "Xem ngay",
        priority: 100,
      });
    }

    // 2) Vaccines overdue (status = overdue)
    if (vaxR.status === "fulfilled") {
      const n = vaxR.value.results.length;
      if (n > 0) {
        urgent.push({
          severity: "critical",
          icon: "💉",
          title: `Vaccine quá hạn · ${n} mũi`,
          message: "Tiêm sớm để bảo vệ bé khỏi bệnh truyền nhiễm",
          cta_link: "/vaccines",
          cta_label: "Đặt lịch",
          priority: 90,
        });
      }
    }

    // 3) Climate alerts CRITICAL active
    if (cAlertsR.status === "fulfilled") {
      const critical = cAlertsR.value.find((a: any) => {
        const sev = typeof a.severity === "object" ? a.severity?.value : a.severity;
        return sev === "critical";
      });
      if (critical) {
        urgent.push({
          severity: "critical",
          icon: "🌡️",
          title: critical.title || "Cảnh báo khí hậu nguy hiểm",
          message: critical.message?.slice?.(0, 80) || "Mở để xem hành động khuyến nghị",
          cta_link: "/alerts",
          cta_label: "Xem",
          priority: 80,
        });
      }
    }

    // 4) Voucher expiring ≤3 days (user-scope, not per-pet)
    if (rewardsR.status === "fulfilled") {
      const now = Date.now();
      for (const r of rewardsR.value.results) {
        if (!r.expires_at) continue;
        const daysLeft = Math.ceil((new Date(r.expires_at).getTime() - now) / 86_400_000);
        if (daysLeft > 0 && daysLeft <= 3) {
          urgent.push({
            severity: "urgent",
            icon: "⏰",
            title: `Voucher sắp hết hạn · ${daysLeft} ngày`,
            message: r.voucher_code || "Dùng trước khi quá hạn",
            cta_link: `/rewards/${r.id}`,
            cta_label: "Mở",
            priority: 50,
          });
          break;
        }
      }
    }

    urgent.sort((a, b) => b.priority - a.priority);
    return c.json({ alerts: urgent.slice(0, 1) });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[alerts/urgent] error:", err);
    return c.json({ alerts: [] }); // fail-soft: empty so dashboard still renders
  }
});

// GET /alerts/history?days=30
alertsRoute.get("/history", async (c) => {
  const session = c.get("user");
  const daysRaw = Number(c.req.query("days") || "30");
  const days = Math.max(1, Math.min(90, Number.isNaN(daysRaw) ? 30 : daysRaw));
  try {
    const rows = await listAlertsHistory(session.sub, days);
    return c.json({ alerts: rows.map(toApiAlert) });
  } catch (err: any) {
    console.error("[alerts/history] error:", err);
    return c.json({ error: { code: "ALERTS_FAIL", message: err.message } }, 500);
  }
});
