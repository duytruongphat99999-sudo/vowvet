/**
 * Lost Pet Network routes (M20).
 *
 * Mount:
 *   app.route("/api/v1/lost-pets", lostPetsRoute)     — owner + community
 *   app.route("/api/v1/public", lostPetsPublicRoute)  — public (no auth)
 *   app.route("/api/v1/vet", vetScanRoute)            — vet QR scan
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { ipRateLimit } from "../lib/rate-limit.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { getRow } from "@shared/baserow.ts";
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import {
  createReport,
  updateReportStatus,
  getReportById,
  findReportBySlug,
  listReportsByUser,
  listActiveNearby,
  listActivePetActiveReport,
  broadcastLostPet,
  createSighting,
  listSightings,
  listActiveVetPartners,
  matchScannedPet,
  attachAIMatchToSighting,
  getSightingById,
} from "../lib/lost-pets.ts";
import { sendPush } from "../lib/web-push.ts";
import { setReward, markRewardPaid, isValidTier, getRewardPushSuffix } from "../lib/lost-pet-rewards.ts";
import { clusterSightings } from "../lib/lost-pet-cluster.ts";
import { recordHeroAct } from "../lib/pet-heroes.ts";
import { updateRow } from "@shared/baserow.ts";

const REPORTS_PER_USER_PER_DAY = 5;

// ============================================================
// /api/v1/lost-pets/* — owner + community (auth required)
// ============================================================
export const lostPetsRoute = new Hono();
lostPetsRoute.use("*", requireAuth);

// ── POST /:petId/report — create report ──
const reportSchema = z.object({
  last_seen_lat: z.number(),
  last_seen_lng: z.number(),
  last_seen_location: z.string().min(3).max(500),
  last_seen_at: z.string(),
  circumstances: z.string().min(3).max(1000),
  distinguishing_features: z.string().max(500).optional().default(""),
  contact_phone: z.string().min(8).max(20),
  contact_phone_public: z.boolean().optional().default(true),
  reward_amount: z.number().optional().default(0),
  broadcast_radius_km: z.number().optional().default(5),
  reference_photo_urls: z.array(z.string().url()).max(5).optional().default([]),
  reward_tier: z.enum(["none", "bronze", "silver", "gold", "diamond", "custom"]).optional().default("none"),
});

lostPetsRoute.post("/:petId{[0-9]+}/report", zValidator("json", reportSchema), async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  const body = c.req.valid("json");

  try {
    const pet = (await getOwnedPet(petId, session.sub)) as any;

    // Rate limit: max 5 reports/user/day
    const my = await listReportsByUser(session.sub);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = my.filter((r) => new Date(r.created_at).getTime() >= todayStart.getTime()).length;
    if (todayCount >= REPORTS_PER_USER_PER_DAY) {
      return c.json({ error: { code: "RATE_LIMIT", message: "Đã đạt giới hạn 5 báo cáo/ngày" } }, 429);
    }

    // If pet already has active report, return it instead of duplicating
    const existing = await listActivePetActiveReport(petId);
    if (existing) {
      return c.json({ report: existing, broadcastCount: existing.broadcast_count, alreadyActive: true });
    }

    const report = await createReport({
      petId,
      reporterId: session.sub,
      last_seen_lat: body.last_seen_lat,
      last_seen_lng: body.last_seen_lng,
      last_seen_location: body.last_seen_location,
      last_seen_at: body.last_seen_at,
      circumstances: body.circumstances,
      distinguishing_features: body.distinguishing_features || "",
      contact_phone: body.contact_phone,
      contact_phone_public: body.contact_phone_public,
      reward_amount: body.reward_amount,
      broadcast_radius_km: body.broadcast_radius_km,
      reference_photo_urls: body.reference_photo_urls || [],
      reward_tier: body.reward_tier,
    });

    // Broadcast push (fire-and-forget, but await count for response)
    const speciesValue = typeof pet.species === "object" ? pet.species?.value : pet.species;
    const broadcast = await broadcastLostPet(report, {
      name: pet.name,
      species: speciesValue,
      photo_url: pet.photo_url || null,
    });
    console.log(`[lost-pets/report] pet=${petId} broadcast count=${broadcast.count} errors=${broadcast.errors}`);

    return c.json({ report, broadcastCount: broadcast.count, slug: report.public_url_slug }, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[lost-pets/report] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo báo cáo" } }, 500);
  }
});

// ── POST /:reportId/resolve ──
lostPetsRoute.post("/:reportId{[0-9]+}/resolve", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  try {
    const report = await getReportById(reportId);
    if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy báo cáo" } }, 404);
    if (report.reporter_user_id !== session.sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
    }
    const updated = await updateReportStatus(reportId, "found");
    return c.json({ report: updated });
  } catch (err: any) {
    console.error("[lost-pets/resolve] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi resolve" } }, 500);
  }
});

// ── POST /:reportId/cancel ──
lostPetsRoute.post("/:reportId{[0-9]+}/cancel", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  try {
    const report = await getReportById(reportId);
    if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    if (report.reporter_user_id !== session.sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
    }
    const updated = await updateReportStatus(reportId, "cancelled");
    return c.json({ report: updated });
  } catch (err: any) {
    console.error("[lost-pets/cancel] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi cancel" } }, 500);
  }
});

// ── GET /my ──
lostPetsRoute.get("/my", async (c) => {
  const session = c.get("user");
  try {
    const reports = await listReportsByUser(session.sub);
    return c.json({ reports, total: reports.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi list" } }, 500);
  }
});

// ── GET /nearby ──
lostPetsRoute.get("/nearby", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  const radius = Math.min(50, Math.max(1, Number(c.req.query("radius")) || 5));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return c.json({ error: { code: "BAD_COORDS", message: "Cần lat & lng" } }, 400);
  }
  try {
    const reports = await listActiveNearby(lat, lng, radius);
    return c.json({ reports, total: reports.length, radius_km: radius });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi nearby" } }, 500);
  }
});

// ── GET /:reportId/sightings — owner only ──
lostPetsRoute.get("/:reportId{[0-9]+}/sightings", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  try {
    const report = await getReportById(reportId);
    if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    if (report.reporter_user_id !== session.sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
    }
    const sightings = await listSightings(reportId);
    return c.json({ sightings, total: sightings.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ── POST /upload-photo — generic photo upload for reference / sighting photos ──
const MAX_LOST_PHOTO_SIZE = 8 * 1024 * 1024;
lostPetsRoute.post("/upload-photo", async (c) => {
  const session = c.get("user");
  let formData: FormData;
  try { formData = await c.req.formData(); }
  catch { return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400); }
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return c.json({ error: { code: "MISSING_PHOTO", message: "Thiếu file (field 'photo')" } }, 400);
  }
  if (file.size > MAX_LOST_PHOTO_SIZE) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Ảnh tối đa 8MB" } }, 413);
  }
  const ext = imageExtFromMime(file.type);
  if (!ext) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ JPEG/PNG/WebP" } }, 415);
  }
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const key = `lost-pets/${session.sub}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadObject(key, buf, file.type);
    return c.json({ url, key });
  } catch (err) {
    console.error("[lost-pets/upload-photo] error:", err);
    return c.json({ error: { code: "UPLOAD_FAILED", message: "Upload thất bại" } }, 500);
  }
});

// ── POST /:reportId/reward — set/update reward tier ──
lostPetsRoute.post("/:reportId{[0-9]+}/reward", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  const tier = body.tier;
  if (!isValidTier(tier)) return c.json({ error: { code: "BAD_TIER", message: "Tier không hợp lệ" } }, 400);

  const report = await getReportById(reportId);
  if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy báo cáo" } }, 404);
  if (report.reporter_user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }
  try {
    const r = await setReward({ reportId, tier, customAmount: Number(body.custom_amount) || 0 });
    return c.json({ tier: r.tier, amount: r.amount });
  } catch (err) {
    console.error("[lost-pets/reward] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi set reward" } }, 500);
  }
});

// ── POST /:reportId/mark-paid — owner marks reward paid out ──
lostPetsRoute.post("/:reportId{[0-9]+}/mark-paid", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  const recipientId = Number(body.recipient_user_id);
  if (!recipientId) return c.json({ error: { code: "RECIPIENT_REQUIRED", message: "Cần recipient_user_id" } }, 400);

  const report = await getReportById(reportId);
  if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
  if (report.reporter_user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }
  try {
    await markRewardPaid(reportId, recipientId);
    return c.json({ ok: true, recipient_user_id: recipientId });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi mark paid" } }, 500);
  }
});

// ── GET /:reportId/clusters — heatmap data ──
lostPetsRoute.get("/:reportId{[0-9]+}/clusters", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  const report = await getReportById(reportId);
  if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
  if (report.reporter_user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }
  try {
    const sightings = await listSightings(reportId);
    const radius = Math.min(5, Math.max(0.1, Number(c.req.query("radius_km")) || 0.5));
    const clusters = clusterSightings(sightings, radius);
    return c.json({ clusters, total_sightings: sightings.length, radius_km: radius });
  } catch (err) {
    console.error("[lost-pets/clusters] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi cluster" } }, 500);
  }
});

// ── POST /:reportId/sightings/:sightingId/confirm — owner confirms ──
lostPetsRoute.post("/:reportId{[0-9]+}/sightings/:sightingId{[0-9]+}/confirm", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  const sightingId = Number(c.req.param("sightingId"));

  const report = await getReportById(reportId);
  if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy báo cáo" } }, 404);
  if (report.reporter_user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }

  const sighting = await getSightingById(sightingId);
  if (!sighting || sighting.report_id !== reportId) {
    return c.json({ error: { code: "NOT_FOUND", message: "Sighting không thuộc báo cáo này" } }, 404);
  }

  try {
    await updateRow("lost_pet_sightings", sightingId, {
      status: "confirmed_by_owner",
      confirmed_at: new Date().toISOString(),
    });

    // Record hero act if sighting was submitted by an authenticated user
    let heroActId: number | null = null;
    let helperAchievements: any[] = [];
    if (sighting.reporter_user_id && sighting.reporter_user_id !== session.sub) {
      try {
        const act = await recordHeroAct({
          userId: sighting.reporter_user_id,
          petId: report.pet_id,
          reportId,
          sightingId,
          actType: "sighting_confirmed",
          rewardReceived: report.reward_amount > 0 ? report.reward_amount : 0,
        });
        heroActId = act.id;
      } catch (err) {
        console.error("[lost-pets/confirm] hero act failed:", err);
      }

      // Session C: Community feed — hero_action event
      try {
        const { createCommunityEvent } = await import("../lib/community-feed.ts");
        await createCommunityEvent({
          eventType: "hero_action",
          userId: sighting.reporter_user_id,
          petId: report.pet_id,
          eventData: {
            report_id: reportId,
            sighting_id: sightingId,
            reward_amount: report.reward_amount,
          },
        });
      } catch (err) {
        console.error("[lost-pets/confirm] community event failed:", err);
      }

      // Hook: achievement check for HELPER (pet_helper / pet_hero / pet_guardian)
      // Helper's own pet — find their first pet (best-effort)
      try {
        const { checkAndUnlockAchievements } = await import("../lib/achievements.ts");
        const { listRows } = await import("@shared/baserow.ts");
        const helperPets = await listRows<any>("pets", {
          filter: { user_id__link_row_has: String(sighting.reporter_user_id) },
          size: 1,
        });
        const helperPetId = helperPets.results[0]?.id;
        if (helperPetId) {
          helperAchievements = await checkAndUnlockAchievements({
            userId: sighting.reporter_user_id,
            petId: helperPetId,
            trigger: "hero_act_recorded",
          });
        }
      } catch (err) {
        console.error("[lost-pets/confirm] helper achievement check failed:", err);
      }
    }

    return c.json({
      confirmed: true,
      hero_act_id: heroActId,
      helper_new_achievements: helperAchievements,
      reporter: {
        user_id: sighting.reporter_user_id,
        phone: sighting.spotter_phone,
        name: sighting.spotter_name,
        address: sighting.sighting_address,
        witnessed_at: sighting.sighting_at,
      },
    });
  } catch (err) {
    console.error("[lost-pets/confirm] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi confirm" } }, 500);
  }
});

// ── POST /:reportId/sightings/:sightingId/dismiss ──
lostPetsRoute.post("/:reportId{[0-9]+}/sightings/:sightingId{[0-9]+}/dismiss", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  const sightingId = Number(c.req.param("sightingId"));
  const report = await getReportById(reportId);
  if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
  if (report.reporter_user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }
  try {
    await updateRow("lost_pet_sightings", sightingId, {
      status: "dismissed_by_owner",
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi dismiss" } }, 500);
  }
});

// ── GET /:reportId/sightings/:sightingId — owner view single sighting ──
lostPetsRoute.get("/:reportId{[0-9]+}/sightings/:sightingId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const reportId = Number(c.req.param("reportId"));
  const sightingId = Number(c.req.param("sightingId"));
  const report = await getReportById(reportId);
  if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
  if (report.reporter_user_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }
  const sighting = await getSightingById(sightingId);
  if (!sighting || sighting.report_id !== reportId) {
    return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
  }
  return c.json({ sighting, reference_photo_urls: report.reference_photo_urls });
});

// ============================================================
// /api/v1/public/* — public routes
// ============================================================
export const lostPetsPublicRoute = new Hono();
lostPetsPublicRoute.use("*", ipRateLimit("lost-public", 60, 60));

// ── GET /lost/:slug ──
lostPetsPublicRoute.get("/lost/:slug{[a-z0-9]{6,16}}", async (c) => {
  const slug = c.req.param("slug");
  try {
    const report = await findReportBySlug(slug);
    if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    if (report.status !== "active") {
      return c.json({ report, pet: null, resolved: true });
    }

    const pet = await getRow<any>("pets", report.pet_id).catch(() => null);
    const speciesValue = pet ? (typeof pet.species === "object" ? pet.species?.value : pet.species) : null;

    return c.json({
      report: {
        ...report,
        // Mask phone if not public
        contact_phone: report.contact_phone_public ? report.contact_phone : "***" + (report.contact_phone || "").slice(-4),
      },
      pet: pet ? {
        id: pet.id,
        name: pet.name,
        species: speciesValue,
        breed: pet.breed || null,
        photo_url: pet.photo_url || null,
        gender: typeof pet.gender === "object" ? pet.gender?.value : pet.gender,
        distinguishing_marks: pet.distinguishing_marks || null,
      } : null,
    });
  } catch (err: any) {
    console.error("[public/lost] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load" } }, 500);
  }
});

// ── GET /lost/:slug/clusters — public heatmap data (sanitized) ──
lostPetsPublicRoute.get("/lost/:slug{[a-z0-9]{6,16}}/clusters", async (c) => {
  const slug = c.req.param("slug");
  try {
    const report = await findReportBySlug(slug);
    if (!report || report.status !== "active") {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    }
    const sightings = await listSightings(report.id);
    const radius = Math.min(5, Math.max(0.1, Number(c.req.query("radius_km")) || 0.5));
    const fullClusters = clusterSightings(sightings, radius);
    // Strip PII (sighting array contents) for public response
    const safeClusters = fullClusters.map((c) => ({
      center_lat: Number(c.center_lat.toFixed(5)),
      center_lng: Number(c.center_lng.toFixed(5)),
      sighting_count: c.sighting_count,
      avg_match_score: c.avg_match_score,
      has_confirmed: c.has_confirmed,
      hottest: c.hottest,
      earliest_at: c.earliest_at,
      latest_at: c.latest_at,
    }));
    return c.json({ clusters: safeClusters, total_sightings: sightings.length });
  } catch (err) {
    console.error("[public/lost/clusters] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ── POST /lost/:slug/sighting ──
const sightingSchema = z.object({
  spotter_name: z.string().min(2).max(60),
  spotter_phone: z.string().min(8).max(20),
  sighting_address: z.string().min(3).max(300),
  sighting_at: z.string().optional(),
  description: z.string().max(1000).optional().default(""),
  sighting_lat: z.number().optional().nullable(),
  sighting_lng: z.number().optional().nullable(),
  photo_url: z.string().optional().nullable(),
});

lostPetsPublicRoute.post("/lost/:slug{[a-z0-9]{6,16}}/sighting", zValidator("json", sightingSchema), async (c) => {
  const slug = c.req.param("slug");
  const body = c.req.valid("json");
  try {
    const report = await findReportBySlug(slug);
    if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    if (report.status !== "active") {
      return c.json({ error: { code: "RESOLVED", message: "Báo cáo đã đóng" } }, 400);
    }

    // Optional reporter user id (if visitor was authenticated when submitting).
    // Public route has no requireAuth, so manually parse the session cookie.
    let reporterUserId: number | null = null;
    try {
      const { verifySession } = await import("@shared/jwt.ts");
      const { SESSION_COOKIE } = await import("@shared/auth.ts");
      const cookieHeader = c.req.header("cookie") || "";
      const match = cookieHeader.split(/;\s*/).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
      if (match) {
        const token = match.slice(SESSION_COOKIE.length + 1);
        const session = verifySession(token);
        if (session?.sub) reporterUserId = Number(session.sub);
      }
    } catch (err) {
      console.warn("[public/lost/sighting] cookie parse failed:", err);
    }

    const sighting = await createSighting({
      reportId: report.id,
      spotterUserId: null,
      reporterUserId,
      spotterName: body.spotter_name,
      spotterPhone: body.spotter_phone,
      sightingLat: body.sighting_lat ?? null,
      sightingLng: body.sighting_lng ?? null,
      sightingAddress: body.sighting_address,
      sightingAt: body.sighting_at || new Date().toISOString(),
      description: body.description || "",
      photoUrl: body.photo_url || null,
    });

    // AI Match (fire-and-forget for UX, but await to send accurate push)
    let aiResult: { score: number; confidence: string; threshold_passed: boolean; is_mock: boolean } | null = null;
    if (body.photo_url && report.reference_photo_urls.length > 0) {
      try {
        const pet = await getRow<any>("pets", report.pet_id).catch(() => null);
        if (pet) {
          const speciesValue = typeof pet.species === "object" ? pet.species?.value : pet.species;
          aiResult = await attachAIMatchToSighting(sighting.id, {
            petName: pet.name,
            species: speciesValue,
            breed: pet.breed || null,
            color: pet.distinguishing_marks || pet.coat_color || null,
            distinctive_marks: report.distinguishing_features,
            reference_photo_urls: report.reference_photo_urls,
            sighting_photo_url: body.photo_url,
          });
        }
      } catch (err) {
        console.error("[public/lost/sighting] AI match failed:", err);
      }
    }

    // Notify owner ONLY if AI threshold passed OR no AI photo available
    const shouldNotify = !aiResult || aiResult.threshold_passed;
    try {
      if (shouldNotify) {
        const owner = await getRow<any>("users", report.reporter_user_id);
        if (owner?.push_subscription) {
          const scoreHint = aiResult ? ` · AI match ${aiResult.score}%` : "";
          await sendPush(
            owner.id,
            owner.push_subscription,
            {
              title: `🔍 Có người báo thấy bé!${scoreHint}`,
              body: `${body.spotter_name} báo thấy tại ${body.sighting_address.slice(0, 80)}`,
              data: { url: `/lost/${slug}/sightings/${sighting.id}`, sighting_id: sighting.id },
            },
            { type: "alert_push", bypassRateLimit: true }
          );
        }
      }
    } catch (err) {
      console.error("[public/lost/sighting] notify owner failed:", err);
    }

    // Quest hook: help_hero fires for the spotter (authenticated only — anonymous gets no credit).
    // Fire against the spotter's first owned pet (quests are per-pet, but help_hero is a user-scope action).
    let completedQuests: any[] = [];
    if (reporterUserId) {
      try {
        const { listRows } = await import("@shared/baserow.ts");
        const pets = await listRows<any>("pets", {
          filter: { user_id__link_row_has: String(reporterUserId) },
          size: 1,
        });
        const spotterFirstPetId = pets.results[0]?.id;
        if (spotterFirstPetId) {
          const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
          completedQuests = await trackQuestTrigger(reporterUserId, spotterFirstPetId, "help_hero");
        }
      } catch (err) {
        console.error("[public/lost/sighting] quest track failed:", err);
      }
    }

    return c.json({
      ok: true,
      sighting_id: sighting.id,
      ai_match: aiResult,
      owner_notified: shouldNotify,
      completed_quests: completedQuests,
    }, 201);
  } catch (err: any) {
    console.error("[public/lost/sighting] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi gửi báo cáo" } }, 500);
  }
});

// ============================================================
// /api/v1/vet/* — vet partner endpoints
// ============================================================
export const vetScanRoute = new Hono();
vetScanRoute.use("*", requireAuth);

vetScanRoute.get("/partners", async (c) => {
  try {
    const partners = await listActiveVetPartners();
    return c.json({ partners, total: partners.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load partners" } }, 500);
  }
});

const scanSchema = z.object({
  pet_id: z.number(),
  vet_id: z.number().optional(),
  location: z.string().optional(),
});

vetScanRoute.post("/scan-qr", zValidator("json", scanSchema), async (c) => {
  const session = c.get("user");
  const body = c.req.valid("json");
  try {
    const report = await matchScannedPet(body.pet_id);
    if (!report) {
      return c.json({ matched: false, message: "Pet không có báo cáo mất tích đang hoạt động" });
    }
    // Auto-create verified sighting
    const sighting = await createSighting({
      reportId: report.id,
      spotterUserId: session.sub,
      spotterName: "Vet partner",
      spotterPhone: "",
      sightingLat: null,
      sightingLng: null,
      sightingAddress: body.location || "Vet clinic",
      sightingAt: new Date().toISOString(),
      description: "Vet partner đã scan QR collar",
      verified: true,
    });
    // Notify owner
    try {
      const owner = await getRow<any>("users", report.reporter_user_id);
      if (owner?.push_subscription) {
        await sendPush(
          owner.id,
          owner.push_subscription,
          {
            title: `🎉 Bé được tìm thấy!`,
            body: `Vet partner đã scan QR. Liên hệ ngay để đón bé về.`,
            data: { url: `/lost/${report.public_url_slug}` },
          },
          { type: "alert_push", bypassRateLimit: true }
        );
      }
    } catch (_) {}
    return c.json({ matched: true, report, sighting_id: sighting.id });
  } catch (err: any) {
    console.error("[vet/scan-qr] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi scan" } }, 500);
  }
});
