/**
 * Pet Playdate routes (M27).
 *
 * Mount:
 *   app.route("/api/v1/playdate", playdateRoute)
 *
 * Endpoints (mix of auth + public):
 *   GET    /playdate/can-create/:petId         — auth, vaccine gate check
 *   GET    /playdate/profile/:petId            — auth, owner only
 *   POST   /playdate/profile/:petId            — auth, create/update profile
 *   DELETE /playdate/profile/:petId            — auth, deactivate
 *
 *   GET    /playdate/discover?petId=X          — auth, ranked candidates
 *   POST   /playdate/swipe                     — auth, {from_pet_id,to_pet_id,direction}
 *   GET    /playdate/matches                   — auth, my matches list
 *   GET    /playdate/matches/:matchId          — auth, detail (with messages)
 *   POST   /playdate/matches/:matchId/messages — auth, send message
 *   GET    /playdate/matches/:matchId/messages — auth, list messages (polling)
 *   POST   /playdate/matches/:matchId/block    — auth, block + reason
 *
 *   POST   /playdate/report                    — auth, abuse report
 *   GET    /playdate/safety-tips               — PUBLIC, 10 rules
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  checkCanCreatePlaydateProfile,
  upsertProfile,
  getProfileByPet,
  deleteProfile,
  getDiscoveryCandidates,
  recordSwipe,
  getMatch,
  listMatchesForUser,
  listMessages,
  sendMessage,
  blockMatch,
  reportPet,
  PLAY_STYLES,
  type LookingFor,
  type PlayStyle,
  type SwipeDirection,
  type ReportReason,
} from "../lib/playdate.ts";

export const playdateRoute = new Hono();

const VALID_LOOKING_FOR: LookingFor[] = ["play_buddy", "walking_partner", "breeding", "all"];
const VALID_PLAY_STYLES = new Set<PlayStyle>(PLAY_STYLES.map((s) => s.key));
const VALID_REPORT_REASONS: ReportReason[] = ["spam", "harassment", "inappropriate", "fake", "other"];

// ============================================================
// PUBLIC: safety tips (no auth required)
// ============================================================
playdateRoute.get("/safety-tips", (c) => {
  return c.json({
    // Section 1 (NEW): Why Playdate via VowVet is safer than FB/Zalo groups
    why_safer: [
      {
        icon: "💉",
        title: "Vaccine verify tự động",
        problem: 'Facebook/Zalo: tin lời người lạ rằng "pet đã tiêm phòng đầy đủ"',
        solution: "VowVet check ≥2 vaccine completed thực tế trong app → không thể fake",
      },
      {
        icon: "🆔",
        title: "Owner đã verify danh tính",
        problem: "Facebook/Zalo: clone account vô danh, không biết người thật",
        solution: "Mỗi owner đã verify phone/email + có Pet Score history → traceable",
      },
      {
        icon: "🛡️",
        title: "Profile fake bị tự động ẩn",
        problem: "Facebook/Zalo: scam profile lừa đảo, không cách phát hiện",
        solution: "≥3 user report → tự động ẩn pending VowVet review trong 24h",
      },
      {
        icon: "🚫",
        title: "Block 1-tap, ẩn 2 chiều",
        problem: "Facebook/Zalo: bị làm phiền phải xoá tài khoản, đổi số",
        solution: "Block trong app → 2 bên không thấy nhau nữa, không thông báo",
      },
      {
        icon: "🤖",
        title: "AI match compatibility",
        problem: "Facebook/Zalo: gặp mới biết pet có hợp tính không, lãng phí thời gian",
        solution: "AI VowVet tính 5 yếu tố trước → chỉ show match ≥30%",
      },
      {
        icon: "📍",
        title: "22+ địa điểm pet-friendly verified",
        problem: "Facebook/Zalo: tự tìm chỗ gặp, có thể không cho phép dắt pet",
        solution: "VowVet suggest cafe/park đã verified → không bị đuổi",
      },
      {
        icon: "💬",
        title: "Chat log lưu trong app",
        problem: "Facebook/Zalo: tin nhắn xoá được, không evidence nếu tranh chấp",
        solution: "Toàn bộ chat lưu trong VowVet → evidence nếu cần xử lý vi phạm",
      },
      {
        icon: "🩺",
        title: "Hotline + Triage sẵn sàng",
        problem: "Facebook/Zalo: pet bị thương tự xử, gọi ai cũng không biết",
        solution: "Khẩn cấp 1-tap: gọi 0779 029 133 hoặc mở Triage tree trong app",
      },
      {
        icon: "🔞",
        title: "Owner ≥18 tuổi verified",
        problem: "Facebook/Zalo: trẻ con dùng tài khoản người lớn, không legal liability",
        solution: "VowVet require owner ≥18 tuổi trong onboarding",
      },
      {
        icon: "📊",
        title: "Pet Score history minh bạch",
        problem: "Facebook/Zalo: không biết pet partner chăm sóc ra sao",
        solution: "Xem Pet Score của bé partner → biết owner có trách nhiệm không",
      },
    ],

    // Section 2: 10 rules (existing — unchanged behaviour, kept for backward compat under both keys)
    tips: [
      { id: 1, emoji: "💉", title: "Vaccine đầy đủ", body: "Cả 2 bé phải hoàn tất tối thiểu 2 mũi vaccine cơ bản trước khi gặp gỡ. Đem theo sổ vaccine khi đi chơi." },
      { id: 2, emoji: "📍", title: "Gặp nơi công cộng", body: "Lần đầu luôn gặp ở công viên/quán cafe pet-friendly đông người. KHÔNG hẹn về nhà riêng." },
      { id: 3, emoji: "👀", title: "Có chủ giám sát", body: "KHÔNG để 2 bé chơi một mình. Chủ phải luôn cách 2-3m và nhìn được cả 2." },
      { id: 4, emoji: "🪢", title: "Dây buộc khi cần", body: "Mở dây dần sau khi 2 bé đã đánh hơi an toàn (5-10 phút). Bé hung dữ giữ dây cả buổi." },
      { id: 5, emoji: "🎾", title: "Bắt đầu nhẹ nhàng", body: "Cho 2 bé chơi 15-20 phút trước. Nếu căng thẳng → tách ra, hẹn lần khác." },
      { id: 6, emoji: "🚫", title: "Không ép socialize", body: "Nếu bé thoái lui/sủa cảnh báo → dừng. Ép socialize có thể gây trauma." },
      { id: 7, emoji: "🧴", title: "Mang nước + treat riêng", body: "Mỗi bé bowl riêng. Treats riêng để tránh dị ứng/đánh nhau giành đồ." },
      { id: 8, emoji: "🚨", title: "Đề phòng khẩn", body: "Lưu số phòng khám gần nhất. Pet bị cắn → rửa nước + dung dịch sát khuẩn + đến vet trong 2h." },
      { id: 9, emoji: "🧬", title: "Breeding cần nghiên cứu", body: "KHÔNG nên breed nghiệp dư. Nếu chọn breeding, làm health screening (hip, eye, heart) trước." },
      { id: 10, emoji: "🚩", title: "Report nếu khả nghi", body: "Profile fake/spam/harassment → tap nút Báo cáo. Mon Min sẽ review trong 24h." },
    ],

    // Section 3: Emergency block
    emergency: {
      hotline: "0779 029 133",
      hotline_e164: "+84779029133",
      zalo_oa: "https://zalo.me/1136810892220003266",
      instructions: "Nếu pet bị thương trong playdate: gọi vet gần nhất ngay. Mở Triage trong app để phân loại mức khẩn cấp.",
    },

    play_styles: PLAY_STYLES,
  });
});

// ============================================================
// Auth required from here on
// ============================================================
playdateRoute.use("*", requireAuth);

// ============================================================
// Eligibility + profile CRUD
// ============================================================
playdateRoute.get("/can-create/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const r = await checkCanCreatePlaydateProfile(petId);
    return c.json(r);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi check eligibility" } }, 500);
  }
});

playdateRoute.get("/profile/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const profile = await getProfileByPet(petId);
    return c.json({ profile });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

playdateRoute.post("/profile/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }

  // Eligibility gate
  const elig = await checkCanCreatePlaydateProfile(petId);
  if (!elig.eligible) {
    return c.json({ error: { code: "NOT_ELIGIBLE", message: elig.reason }, eligibility: elig }, 403);
  }

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  const looking_for = VALID_LOOKING_FOR.includes(body.looking_for) ? body.looking_for : "play_buddy";
  const play_styles: PlayStyle[] = Array.isArray(body.play_styles)
    ? body.play_styles.filter((s: any): s is PlayStyle => VALID_PLAY_STYLES.has(s))
    : [];

  try {
    const profile = await upsertProfile({
      petId,
      userId: session.sub,
      bio: typeof body.bio === "string" ? body.bio : "",
      max_distance_km: Number(body.max_distance_km) || 10,
      looking_for,
      play_styles,
      active: body.active !== false,
      lat: Number(body.lat) || 0,
      lng: Number(body.lng) || 0,
    });
    return c.json({ profile }, 201);
  } catch (err: any) {
    console.error("[playdate/profile/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo profile" } }, 500);
  }
});

playdateRoute.delete("/profile/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const profile = await getProfileByPet(petId);
    if (!profile) return c.json({ error: { code: "NOT_FOUND", message: "Không có profile" } }, 404);
    await deleteProfile(profile.id);
    return c.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xoá" } }, 500);
  }
});

// ============================================================
// Discovery + swipe
// ============================================================
playdateRoute.get("/discover", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.query("petId") || 0);
  if (!petId) return c.json({ error: { code: "PET_REQUIRED", message: "Cần petId" } }, 400);
  try {
    await getOwnedPet(petId, session.sub);
    const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") || 20)));
    const candidates = await getDiscoveryCandidates(petId, session.sub, limit);
    return c.json({ candidates, total: candidates.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[playdate/discover] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tìm bạn" } }, 500);
  }
});

playdateRoute.post("/swipe", async (c) => {
  const session = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  const fromPetId = Number(body.from_pet_id);
  const toPetId = Number(body.to_pet_id);
  const direction = body.direction as SwipeDirection;

  if (!fromPetId || !toPetId) return c.json({ error: { code: "BAD_INPUT", message: "Cần from_pet_id + to_pet_id" } }, 400);
  if (fromPetId === toPetId) return c.json({ error: { code: "SELF_SWIPE", message: "Không swipe chính bé mình" } }, 400);
  if (direction !== "like" && direction !== "pass") {
    return c.json({ error: { code: "BAD_DIRECTION", message: "direction phải là like/pass" } }, 400);
  }

  try {
    await getOwnedPet(fromPetId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }

  // Verify target pet has a playdate profile + not hidden
  const targetProfile = await getProfileByPet(toPetId);
  if (!targetProfile || !targetProfile.active || targetProfile.hidden) {
    return c.json({ error: { code: "TARGET_UNAVAILABLE", message: "Bé này không khả dụng" } }, 404);
  }

  // Feature gate: playdate_basic (Pet Score ≥ 100)
  try {
    const { checkFeatureAccess } = await import("../lib/feature-gates.ts");
    const access = await checkFeatureAccess(session.sub, fromPetId, "playdate_basic");
    if (!access.allowed) {
      return c.json({ error: { code: "FEATURE_LOCKED", message: access.reason, gate: access } }, 403);
    }
  } catch (err) {
    console.error("[playdate/swipe] gate check failed (allowing):", err);
  }

  try {
    const result = await recordSwipe(fromPetId, toPetId, session.sub, direction);
    if (result.rate_limited) {
      return c.json({
        error: { code: "RATE_LIMITED", message: "Đã swipe tối đa 50 lần hôm nay. Quay lại ngày mai!" },
        ...result,
      }, 429);
    }

    // Hook: achievement check (first_match + social_butterfly when matched)
    let newAchievements: any[] = [];
    if (result.matched) {
      try {
        const { checkAndUnlockAchievements } = await import("../lib/achievements.ts");
        newAchievements = await checkAndUnlockAchievements({
          userId: session.sub, petId: fromPetId, trigger: "first_match",
        });
      } catch (err) {
        console.error("[playdate/swipe] achievement check failed:", err);
      }

      // Session C: Community feed — new_match event (single emit for the initiator)
      try {
        const { createCommunityEvent } = await import("../lib/community-feed.ts");
        await createCommunityEvent({
          eventType: "new_match",
          userId: session.sub,
          petId: fromPetId,
          eventData: { matched_pet_id: toPetId, match_id: result.match_id },
        });
      } catch (err) {
        console.error("[playdate/swipe] community event failed:", err);
      }
    }

    // Quest hook: playdate_swipe fires when user has hit ≥10 swipes today
    let completedQuests: any[] = [];
    if (result.swipe_recorded && (result.swipes_today || 0) >= 10) {
      try {
        const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
        completedQuests = await trackQuestTrigger(session.sub, fromPetId, "playdate_swipe");
      } catch (err) {
        console.error("[playdate/swipe] quest track failed:", err);
      }
    }

    return c.json({ ...result, new_achievements: newAchievements, completed_quests: completedQuests }, 201);
  } catch (err: any) {
    console.error("[playdate/swipe] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi swipe" } }, 500);
  }
});

// ============================================================
// Matches + messages
// ============================================================
playdateRoute.get("/matches", async (c) => {
  const session = c.get("user");
  try {
    const matches = await listMatchesForUser(session.sub);
    return c.json({ matches, total: matches.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load matches" } }, 500);
  }
});

playdateRoute.get("/matches/:matchId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const matchId = Number(c.req.param("matchId"));
  try {
    const m = await getMatch(matchId);
    if (!m) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy match" } }, 404);
    if (m.user_a_id !== session.sub && m.user_b_id !== session.sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "Match không thuộc bạn" } }, 403);
    }
    return c.json({ match: { ...m, other_pet_id: m.user_a_id === session.sub ? m.pet_b_id : m.pet_a_id, other_user_id: m.user_a_id === session.sub ? m.user_b_id : m.user_a_id } });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

playdateRoute.get("/matches/:matchId{[0-9]+}/messages", async (c) => {
  const session = c.get("user");
  const matchId = Number(c.req.param("matchId"));
  try {
    const m = await getMatch(matchId);
    if (!m) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy match" } }, 404);
    if (m.user_a_id !== session.sub && m.user_b_id !== session.sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "Match không thuộc bạn" } }, 403);
    }
    if (m.is_blocked) {
      return c.json({ messages: [], blocked: true });
    }
    const messages = await listMessages(matchId);
    return c.json({ messages, total: messages.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load messages" } }, 500);
  }
});

playdateRoute.post("/matches/:matchId{[0-9]+}/messages", async (c) => {
  const session = c.get("user");
  const matchId = Number(c.req.param("matchId"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  const text = String(body.body || "").trim();
  if (!text) return c.json({ error: { code: "EMPTY", message: "Tin nhắn rỗng" } }, 400);
  if (text.length > 2000) return c.json({ error: { code: "TOO_LONG", message: "Tin nhắn tối đa 2000 ký tự" } }, 400);

  const m = await getMatch(matchId);
  if (!m) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy match" } }, 404);
  if (m.user_a_id !== session.sub && m.user_b_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Match không thuộc bạn" } }, 403);
  }
  if (m.is_blocked) {
    return c.json({ error: { code: "BLOCKED", message: "Match đã bị chặn" } }, 403);
  }

  const senderPetId = m.user_a_id === session.sub ? m.pet_a_id : m.pet_b_id;
  try {
    const msg = await sendMessage(matchId, session.sub, senderPetId, text);
    return c.json({ message: msg }, 201);
  } catch (err: any) {
    console.error("[playdate/message/send] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi gửi tin" } }, 500);
  }
});

playdateRoute.post("/matches/:matchId{[0-9]+}/block", async (c) => {
  const session = c.get("user");
  const matchId = Number(c.req.param("matchId"));
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const reason = String(body.reason || "").slice(0, 500);

  const m = await getMatch(matchId);
  if (!m) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy match" } }, 404);
  if (m.user_a_id !== session.sub && m.user_b_id !== session.sub) {
    return c.json({ error: { code: "FORBIDDEN", message: "Match không thuộc bạn" } }, 403);
  }
  try {
    const updated = await blockMatch(matchId, session.sub, reason);
    return c.json({ match: updated });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi block" } }, 500);
  }
});

// ============================================================
// Reports
// ============================================================
playdateRoute.post("/report", async (c) => {
  const session = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  const reportedPetId = Number(body.reported_pet_id);
  if (!reportedPetId) return c.json({ error: { code: "PET_REQUIRED", message: "Cần reported_pet_id" } }, 400);

  const reason = body.reason as ReportReason;
  if (!VALID_REPORT_REASONS.includes(reason)) {
    return c.json({ error: { code: "BAD_REASON", message: "reason không hợp lệ" } }, 400);
  }

  const targetProfile = await getProfileByPet(reportedPetId);
  if (!targetProfile) {
    return c.json({ error: { code: "NOT_FOUND", message: "Bé này không có profile" } }, 404);
  }
  if (targetProfile.user_id === session.sub) {
    return c.json({ error: { code: "SELF_REPORT", message: "Không thể tự báo cáo chính mình" } }, 400);
  }

  try {
    const r = await reportPet(session.sub, reportedPetId, targetProfile.user_id, reason, body.notes);
    return c.json(r, 201);
  } catch (err: any) {
    console.error("[playdate/report] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi report" } }, 500);
  }
});
