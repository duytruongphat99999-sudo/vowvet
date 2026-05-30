/**
 * Daily Quests routes (Session B + UX fix).
 *
 * Mount: app.route("/api/v1/quests", questsRoute)
 *
 *   GET    /quests/pets/:petId/today          — list today's 3 quests (auto-assign if first call of day)
 *   GET    /quests/pets/:petId/history?limit= — quest history
 *
 * NOTE: POST /quests/:code/complete is INTENTIONALLY REMOVED — quests must be completed
 * by performing the real action (upload photo, do BCS, etc.) which fires
 * trackQuestTrigger() from the corresponding endpoint. Allowing manual completion
 * would let users game Pet Score without doing the real work.
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { listRows } from "@shared/baserow.ts";
import {
  listTodayQuests,
  assignDailyQuests,
  listQuestHistory,
  trackQuestTrigger,
  type UserDailyQuest,
} from "../lib/daily-quests.ts";

export const questsRoute = new Hono();
questsRoute.use("*", requireAuth);

/**
 * Helper: resolve the user's first owned pet ID for user-scope triggers
 * (read_faq, check_weather, share_pet — none of which are pet-specific).
 */
async function getFirstPetIdForUser(userId: number): Promise<number | null> {
  try {
    const res = await listRows<any>("pets", {
      filter: { user_id__link_row_has: String(userId) },
      size: 1,
    });
    return res.results[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * UX fix: map quest trigger_condition → feature URL where user can complete it.
 * Verified every target route exists in /web/src/pages.
 *
 * History:
 *   - v1 had 3 triggers (checkin/upload_photo/log_meal) all → /pets/{petId} which
 *     duplicated the dashboard PetHeroCard CTA + QuickAccess "Check-in" card.
 *   - v2 (this version) points each trigger to its dedicated sub-route so every
 *     quest card lands on a distinct feature page. Check-in stays on pet detail
 *     because the check-in form is embedded there (no separate /check-in route).
 */
const QUEST_CTA_MAP: Record<string, string> = {
  checkin:            "/pets/{petId}",                                 // check-in form embedded on pet detail (no dedicated route)
  upload_photo:       "/pets/{petId}/photos",                          // → casual album (free-form). ID-mode wizard stays at /profile/complete?focus=photos
  log_meal:           "/pets/{petId}/care-plan",                       // → AI-suggested meal plan + DER calo
  read_faq:           "/faq",
  view_pet_score:     "/pets/{petId}/pet-score",
  voice_diary:        "/pets/{petId}/diary",
  check_water:        "/pets/{petId}/water",
  routine_complete:   "/pets/{petId}/routines",
  check_weather:      "/alerts",
  place_checkin:      "/map",
  playdate_swipe:     "/playdate/discover/{petId}",
  bcs_check:          "/pets/{petId}/bcs",
  share_pet:          "/pets/{petId}/share",
  help_hero:          "/lost/nearby",
  pet_score_increase: "/pets/{petId}/pet-score",
};

/**
 * Rich UI metadata per trigger — used by the expandable QuestStrip widget on dashboard.
 * The base `description` comes from quest_definitions Baserow row (longer "why does this exist" copy)
 * — these fields add the action-oriented short copy needed for inline cards.
 */
interface QuestRichMeta {
  why_text: string;             // 1-sentence "Tại sao quest này?" rationale
  cta_button_label: string;     // Action button label inside expanded detail
  completion_message: string;   // Short congratulation copy when completed
}

const QUEST_RICH_META: Record<string, QuestRichMeta> = {
  checkin: {
    why_text: "Theo dõi sức khoẻ hằng ngày giúp phát hiện sớm bệnh tật + xây streak Pet Score.",
    cta_button_label: "Mở check-in →",
    completion_message: "✓ Đã check-in. Streak +1 ngày!",
  },
  upload_photo: {
    why_text: "Xây kho ảnh + huấn luyện AI Lost Pet (nếu bé đi lạc).",
    cta_button_label: "Mở album bé →",
    completion_message: "✓ Đã đăng ảnh. Album bé đẹp hơn!",
  },
  log_meal: {
    why_text: "Track dinh dưỡng giúp phát hiện đột ngột bỏ ăn hoặc ăn quá nhiều.",
    cta_button_label: "Xem meal plan →",
    completion_message: "✓ Đã log. Dinh dưỡng được theo dõi!",
  },
  voice_diary: {
    why_text: "Nhật ký giọng nói lưu giữ khoảnh khắc + AI phân tích cảm xúc.",
    cta_button_label: "Mở Voice Diary →",
    completion_message: "✓ Đã ghi. Khoảnh khắc được lưu giữ.",
  },
  check_water: {
    why_text: "Mèo dễ bỏ uống nước → bệnh thận. Tracking giúp phát hiện sớm.",
    cta_button_label: "Log nước uống →",
    completion_message: "✓ Đã log nước. Tốt cho thận bé!",
  },
  routine_complete: {
    why_text: "Routine ổn định giảm stress cho bé + xây thói quen tốt.",
    cta_button_label: "Xem routine →",
    completion_message: "✓ Routine hôm nay xong!",
  },
  bcs_check: {
    why_text: "BCS lệch chuẩn = nguy cơ bệnh tim, tiểu đường, khớp.",
    cta_button_label: "Mở BCS AI →",
    completion_message: "✓ Đã đánh giá BCS. Kết quả lưu vào hồ sơ.",
  },
  read_faq: {
    why_text: "Học kiến thức = chăm bé tốt hơn, không cần Google bừa.",
    cta_button_label: "Đọc FAQ →",
    completion_message: "✓ Đã đọc. Kiến thức +1!",
  },
  view_pet_score: {
    why_text: "Biết điểm yếu nào cần cải thiện để bé khoẻ hơn.",
    cta_button_label: "Xem Pet Score →",
    completion_message: "✓ Đã xem. Biết hướng cải thiện rồi!",
  },
  check_weather: {
    why_text: "Sốc nhiệt + AQI cao gây bệnh cho pet. Biết trước = phòng được.",
    cta_button_label: "Xem cảnh báo →",
    completion_message: "✓ Đã xem. Chuẩn bị tốt cho bé!",
  },
  place_checkin: {
    why_text: "Khám phá nơi mới + chia sẻ cộng đồng pet HCM.",
    cta_button_label: "Mở Pet Map →",
    completion_message: "✓ Đã check-in. Cảm ơn chia sẻ!",
  },
  playdate_swipe: {
    why_text: "Bé giao tiếp với pet khác giảm stress, vui vẻ hơn.",
    cta_button_label: "Mở Playdate →",
    completion_message: "✓ Đã swipe. Match nào hợp với bé?",
  },
  help_hero: {
    why_text: "Cộng đồng Pet Hero — mỗi sighting cứu được 1 pet về nhà.",
    cta_button_label: "Mở Pet Hero Map →",
    completion_message: "✓ Đã xem. Bạn là Pet Hero tiềm năng!",
  },
  share_pet: {
    why_text: "Nhiều người biết về bé → nếu đi lạc, dễ tìm hơn.",
    cta_button_label: "Share Zalo →",
    completion_message: "✓ Đã share. Cảm ơn lan toả!",
  },
  pet_score_increase: {
    why_text: "Quest mở — tự do làm action bất kỳ để tăng điểm.",
    cta_button_label: "Xem cách tăng →",
    completion_message: "✓ Pet Score đã tăng!",
  },
};

const DEFAULT_RICH_META: QuestRichMeta = {
  why_text: "Giúp chăm sóc bé tốt hơn.",
  cta_button_label: "Bắt đầu →",
  completion_message: "✓ Hoàn thành!",
};

function attachCtaLink(quest: UserDailyQuest, petId: number): UserDailyQuest & {
  cta_link: string;
  why_text: string;
  cta_button_label: string;
  completion_message: string;
} {
  const trigger = quest.definition?.trigger_condition || "";
  const template = QUEST_CTA_MAP[trigger] || `/pets/{petId}/quests`;
  const cta_link = template.replace("{petId}", String(petId));
  const meta = QUEST_RICH_META[trigger] || DEFAULT_RICH_META;
  return { ...quest, cta_link, ...meta };
}

questsRoute.get("/pets/:petId{[0-9]+}/today", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    let quests = await listTodayQuests(session.sub, petId);
    // Top-up if partial assignment (cron job 14 race, manual data edit, etc.).
    // assignDailyQuests is now idempotent + top-up safe so we always converge to 3.
    if (quests.length < 3) {
      quests = await assignDailyQuests(session.sub, petId);
    }
    const enriched = quests.map((q) => attachCtaLink(q, petId));
    return c.json({
      quests: enriched,
      date: new Date().toISOString().slice(0, 10),
      completed_count: enriched.filter((q) => q.completed).length,
      // Trifecta bonus (+50 Pet Score when all 3 done today) — surfaced for UI
      trifecta_bonus: 50,
    });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[quests/today] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// REMOVED: POST /pets/:petId/:code/complete
// Quests must be completed by doing the real action (upload photo, BCS, etc.).
// trackQuestTrigger() fires from the corresponding feature endpoint server-side.

questsRoute.get("/pets/:petId{[0-9]+}/history", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 30)));
  try {
    await getOwnedPet(petId, session.sub);
    const history = await listQuestHistory(session.sub, petId, limit);
    return c.json({ history, total: history.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// Track endpoints — for triggers that don't have a natural POST endpoint
// (view actions, share actions, FAQ reads, etc.)
// Frontend calls these as fire-and-forget when the user performs the action.
// ============================================================

/**
 * POST /quests/track/read-faq      — user opened an FAQ article
 * POST /quests/track/view-pet-score — user opened the pet-score page (any pet)
 * POST /quests/track/check-weather  — user opened the weather/alerts page
 * POST /quests/track/share-pet      — user shared QR passport (body: {pet_id, platform})
 *
 * All require auth (so we know whose quest to credit). Body may include `pet_id`
 * for pet-scoped triggers; otherwise we resolve the user's first pet.
 */

async function handleTrack(
  c: any,
  trigger: string,
  opts: { requirePetId?: boolean } = {}
) {
  const session = c.get("user");
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const reqPetId = Number(body.pet_id || c.req.query("pet_id") || 0);

  let petId: number | null = null;
  if (reqPetId > 0) {
    try {
      await getOwnedPet(reqPetId, session.sub);
      petId = reqPetId;
    } catch {
      return c.json({ error: { code: "BAD_PET", message: "Pet không hợp lệ" } }, 400);
    }
  } else if (opts.requirePetId) {
    return c.json({ error: { code: "PET_REQUIRED", message: "Cần pet_id" } }, 400);
  } else {
    petId = await getFirstPetIdForUser(session.sub);
  }

  if (!petId) {
    return c.json({ tracked: false, reason: "no_pet" });
  }

  try {
    const completed = await trackQuestTrigger(session.sub, petId, trigger);
    return c.json({ tracked: true, completed_quests: completed });
  } catch (err) {
    console.error(`[quests/track ${trigger}] error:`, err);
    return c.json({ tracked: false, error: "INTERNAL" }, 500);
  }
}

questsRoute.post("/track/read-faq",       (c) => handleTrack(c, "read_faq"));
questsRoute.post("/track/view-pet-score", (c) => handleTrack(c, "view_pet_score", { requirePetId: true }));
questsRoute.post("/track/check-weather",  (c) => handleTrack(c, "check_weather"));
questsRoute.post("/track/share-pet",      (c) => handleTrack(c, "share_pet", { requirePetId: true }));
