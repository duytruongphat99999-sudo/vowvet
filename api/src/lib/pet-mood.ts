/**
 * Pet Mood mascot — computes 1 of 6 states based on real signals.
 *
 * States (precedence: emergency > sleeping > sad > needy > excited > happy > chill):
 *   sleeping  — local hour 22-06 (mascot ZZZ regardless of stats)
 *   sad       — overdue vaccine OR pet_score < 300
 *   needy     — no check-in today AND current_streak ≥ 3 (streak at risk)
 *   excited   — achievement unlocked within last 24h
 *   happy     — pet_score ≥ 700 AND current_streak ≥ 7
 *   chill     — default (everything OK)
 *
 * Each state has emoji, label_vi, color, and contextual Vietnamese message.
 */
import { listRows, getRow } from "@shared/baserow.ts";
import { getPetScore } from "./pet-score.ts";

export type MoodState = "happy" | "excited" | "chill" | "needy" | "sad" | "sleeping";

export interface SuggestedAction {
  label: string;
  link: string;
  reward: string;
}

export interface MoodResult {
  state: MoodState;
  emoji: string;
  label_vi: string;
  message: string;
  color_class: string;
  reason: string;
  suggested_actions: SuggestedAction[];
  pet_score?: number;
  streak?: number;
}

const MOOD_META: Record<MoodState, { emoji: string; label_vi: string; color_class: string }> = {
  happy:    { emoji: "😊", label_vi: "Vui vẻ",     color_class: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  excited:  { emoji: "🤩", label_vi: "Hứng khởi",  color_class: "bg-violet-50 text-violet-700 border-violet-200" },
  chill:    { emoji: "😌", label_vi: "Thư giãn",   color_class: "bg-sky-50 text-sky-700 border-sky-200" },
  needy:    { emoji: "🥺", label_vi: "Nhớ chủ",    color_class: "bg-amber-50 text-amber-700 border-amber-200" },
  sad:      { emoji: "😔", label_vi: "Buồn",       color_class: "bg-orange-50 text-orange-700 border-orange-200" },
  sleeping: { emoji: "💤", label_vi: "Đang ngủ",   color_class: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

async function getStreakAndRecentCheckin(petId: number): Promise<{ streak: number; checkedInToday: boolean }> {
  let streak = 0;
  let checkedInToday = false;
  try {
    const sRes = await listRows<any>("routine_streaks", {
      filter: { pet_id__link_row_has: String(petId) }, size: 5,
    });
    streak = Number(sRes.results[0]?.current_streak) || 0;
  } catch {}
  try {
    const today = new Date().toISOString().slice(0, 10);
    const cRes = await listRows<any>("daily_check_ins", {
      filter: { pet_id__link_row_has: String(petId), check_date__equal: today }, size: 1,
    });
    checkedInToday = (cRes.results.length > 0);
  } catch {}
  return { streak, checkedInToday };
}

async function hasOverdueVaccine(petId: number): Promise<boolean> {
  try {
    const res = await listRows<any>("vaccines", {
      filter: { pet_id__link_row_has: String(petId), status__contains: "overdue" }, size: 5,
    });
    return res.results.length > 0;
  } catch { return false; }
}

async function hasRecentAchievementUnlock(userId: number, petId: number): Promise<boolean> {
  try {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await listRows<any>("user_achievements", {
      filter: {
        user_id__equal: String(userId),
        pet_id__link_row_has: String(petId),
        unlocked_at__date_after_or_equal: dayAgo.slice(0, 10),
      },
      size: 5,
    });
    return res.results.length > 0;
  } catch { return false; }
}

export async function calculatePetMood(petId: number, userId: number, now: Date = new Date()): Promise<MoodResult> {
  // 1. Sleeping window — 22:00–06:00 local
  const hour = now.getHours();
  if (hour >= 22 || hour < 6) {
    return buildMood("sleeping", petId, {
      message: "Bé đang ngon giấc. Chúc bạn ngày mới năng lượng!",
      reason: "Giờ ngủ của bé — phù hợp với chu kỳ sinh học.",
      actions: [
        { label: "🏆 Xem Pet Score hôm nay", link: `/pets/${petId}/pet-score`, reward: "Track tiến độ" },
      ],
    });
  }

  // Gather real signals (parallel-ish)
  let petScore = 0;
  let pet: any = null;
  try {
    pet = await getRow<any>("pets", petId);
    const r = await getPetScore(pet);
    petScore = r.score;
  } catch {}

  const [{ streak, checkedInToday }, overdue, justUnlocked] = await Promise.all([
    getStreakAndRecentCheckin(petId),
    hasOverdueVaccine(petId),
    hasRecentAchievementUnlock(userId, petId),
  ]);

  const petName = pet?.name || "bé";

  // 2. Sad — overdue vaccine OR very low score
  if (overdue) {
    return buildMood("sad", petId, {
      message: `${petName} có vaccine quá hạn. Hãy đặt lịch tiêm bù sớm nhé.`,
      reason: "Có ít nhất 1 vaccine quá hạn → ảnh hưởng miễn dịch của bé.",
      actions: [
        { label: "💉 Xem lịch vaccine", link: `/vaccines`, reward: "Đặt lịch tiêm" },
        { label: "🩺 Chat bác sĩ", link: `/chat/new`, reward: "Tư vấn miễn phí" },
      ],
      pet_score: petScore, streak,
    });
  }
  if (petScore < 300) {
    return buildMood("sad", petId, {
      message: `Pet Score đang thấp (${petScore}). Hoàn thiện profile + tiêm vaccine để tăng nhanh.`,
      reason: `Pet Score ${petScore}/1000 — dưới ngưỡng Silver (301). Hoàn thiện hồ sơ + vaccine sẽ tăng nhanh.`,
      actions: [
        { label: "📋 Hoàn thiện hồ sơ", link: `/pets/${petId}/profile/complete`, reward: "+50 Pet Score" },
        { label: "💉 Tiêm vaccine", link: `/vaccines`, reward: "+30 mỗi mũi" },
        { label: "🎭 Làm Personality test", link: `/pets/${petId}/personality`, reward: "+50" },
      ],
      pet_score: petScore, streak,
    });
  }

  // 3. Needy — streak active but no check-in today (afternoon onwards)
  if (!checkedInToday && streak >= 3 && hour >= 12) {
    return buildMood("needy", petId, {
      message: `Chuỗi ${streak} ngày của ${petName} sắp đứt — vào check-in nhanh nhé!`,
      reason: `Đã ${streak} ngày liên tục, hôm nay chưa check-in. Đợi quá nửa đêm là mất streak.`,
      actions: [
        { label: "📊 Check-in ngay", link: `/pets/${petId}`, reward: "+10 + giữ streak" },
        { label: "Nhiệm vụ hôm nay", link: `/pets/${petId}/quests`, reward: "Bonus điểm" },
      ],
      pet_score: petScore, streak,
    });
  }

  // 4. Excited — recent achievement unlock
  if (justUnlocked) {
    return buildMood("excited", petId, {
      message: `${petName} vừa unlock huy hiệu mới! 🎉`,
      reason: "Bé unlock huy hiệu mới trong 24 giờ qua. Chưa xem chi tiết?",
      actions: [
        { label: "🏆 Xem huy hiệu mới", link: `/pets/${petId}/achievements`, reward: "Mở khoá Pet Score" },
        { label: "🎁 Check reward unlock", link: `/pets/${petId}/rewards`, reward: "Có voucher mới?" },
      ],
      pet_score: petScore, streak,
    });
  }

  // 5. Happy — high score + streak
  if (petScore >= 700 && streak >= 7) {
    return buildMood("happy", petId, {
      message: `${petName} đang khỏe + bạn chăm sóc rất đều. Tuyệt!`,
      reason: `Pet Score ${petScore} + streak ${streak} ngày — bạn đang ở top performer của HCM.`,
      actions: [
        { label: "🏆 Xem leaderboard", link: `/leaderboard`, reward: "Bạn top mấy?" },
        { label: "Nhiệm vụ hôm nay", link: `/pets/${petId}/quests`, reward: "Bonus điểm" },
        { label: "🎁 Reward sẵn", link: `/pets/${petId}/rewards`, reward: "Voucher Mon Min" },
      ],
      pet_score: petScore, streak,
    });
  }

  // 6. Chill — default
  return buildMood("chill", petId, {
    message: `${petName} đang ổn. Hôm nay làm gì cùng bé nhỉ?`,
    reason: "Không có cảnh báo nào — bé khoẻ mạnh, chăm sóc đều đặn.",
    actions: [
      { label: "Nhiệm vụ hôm nay", link: `/pets/${petId}/quests`, reward: "Bonus 35-60đ" },
      { label: "📊 Check-in nhanh", link: `/pets/${petId}`, reward: "+10đ + streak" },
      { label: "🏆 Pet Score", link: `/pets/${petId}/pet-score`, reward: "Track tiến độ" },
    ],
    pet_score: petScore, streak,
  });
}

// Build full MoodResult with state defaults + per-mood reason/actions
function buildMood(state: MoodState, petId: number, opts: {
  message: string;
  reason: string;
  actions: SuggestedAction[];
  pet_score?: number;
  streak?: number;
}): MoodResult {
  const meta = MOOD_META[state];
  return {
    state,
    emoji: meta.emoji,
    label_vi: meta.label_vi,
    color_class: meta.color_class,
    message: opts.message,
    reason: opts.reason,
    suggested_actions: opts.actions,
    pet_score: opts.pet_score,
    streak: opts.streak,
  };
}
