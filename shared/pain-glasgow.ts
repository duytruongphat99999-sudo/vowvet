/**
 * Glasgow Composite Measure Pain Scale - Short Form (CMPS-SF) — M23.
 *
 * 7-question vet-validated pain assessment (Reid et al. 2007).
 * Total range 0-24.
 *
 * Thresholds:
 *   0-5:   No pain to mild pain
 *   6-9:   Moderate pain — analgesia needed
 *   10-24: Severe pain — urgent vet referral
 *
 * Used post-surgery, chronic pain monitoring, geriatric care.
 */

export type PainLevel = "none" | "mild" | "moderate" | "severe";

export interface PainQuestion {
  id: string;
  question_vi: string;
  options: Array<{ score: number; label_vi: string }>;
}

/**
 * 7 categorical questions (Glasgow CMPS-SF official scale).
 * Each option score given by the literature; sum = total pain score.
 */
export const PAIN_QUESTIONS: PainQuestion[] = [
  {
    id: "q1_vocalization",
    question_vi: "Bé phát âm thế nào khi bạn quan sát?",
    options: [
      { score: 0, label_vi: "Im lặng" },
      { score: 1, label_vi: "Rên rỉ nhẹ" },
      { score: 2, label_vi: "Khóc/than" },
      { score: 3, label_vi: "Gào lên" },
      { score: 4, label_vi: "Gào liên tục" },
      { score: 5, label_vi: "Gào kèm vùng vẫy" },
    ],
  },
  {
    id: "q2_attention_to_wound",
    question_vi: "Bé chú ý đến chỗ đau như thế nào?",
    options: [
      { score: 0, label_vi: "Bỏ qua" },
      { score: 1, label_vi: "Nhìn thoáng qua" },
      { score: 2, label_vi: "Liếm/cào nhẹ" },
      { score: 3, label_vi: "Liếm/cào dữ dội" },
    ],
  },
  {
    id: "q3_mobility",
    question_vi: "Khi bạn gọi bé bước về phía bạn, bé:",
    options: [
      { score: 0, label_vi: "Đi/chạy bình thường" },
      { score: 1, label_vi: "Đi chậm" },
      { score: 2, label_vi: "Khập khiễng" },
      { score: 3, label_vi: "Đứng dậy khó" },
      { score: 4, label_vi: "Không chịu đứng/đi" },
      { score: 5, label_vi: "Hoàn toàn không thể di chuyển" },
    ],
  },
  {
    id: "q4_response_to_touch",
    question_vi: "Khi bạn chạm nhẹ vào chỗ đau, bé phản ứng:",
    options: [
      { score: 0, label_vi: "Không phản ứng" },
      { score: 1, label_vi: "Nhìn" },
      { score: 2, label_vi: "Co rút nhẹ" },
      { score: 3, label_vi: "Co rút mạnh / né" },
      { score: 4, label_vi: "Gầm / cắn cảnh báo" },
      { score: 5, label_vi: "Cắn / tấn công" },
    ],
  },
  {
    id: "q5_demeanor",
    question_vi: "Tính khí bé hôm nay:",
    options: [
      { score: 0, label_vi: "Vui vẻ, hài lòng" },
      { score: 1, label_vi: "Yên tĩnh" },
      { score: 2, label_vi: "Lo lắng, sợ" },
      { score: 3, label_vi: "Trầm cảm, ít phản ứng" },
      { score: 4, label_vi: "Không phản ứng với gì" },
    ],
  },
  {
    id: "q6_posture",
    question_vi: "Tư thế bé:",
    options: [
      { score: 0, label_vi: "Thoải mái, bình thường" },
      { score: 1, label_vi: "Lưng cong nhẹ / khom" },
      { score: 2, label_vi: "Cứng người, không dám động đậy" },
    ],
  },
  {
    id: "q7_appearance",
    question_vi: "Vẻ ngoài tổng quát:",
    options: [
      { score: 0, label_vi: "Bình thường" },
      { score: 1, label_vi: "Hơi căng thẳng / ủ rũ" },
      { score: 2, label_vi: "Rõ ràng đau đớn / kiệt sức" },
    ],
  },
];

export function categorizePain(score: number): PainLevel {
  if (score <= 5) return "none";
  if (score <= 9) return "moderate";
  return "severe";
}

export const PAIN_LABELS: Record<PainLevel, { label: string; color: string; emoji: string; description: string }> = {
  none: { label: "Không đau / nhẹ", color: "emerald", emoji: "🟢", description: "Bé có vẻ thoải mái, không cần can thiệp giảm đau" },
  mild: { label: "Nhẹ", color: "yellow", emoji: "🟡", description: "Theo dõi thêm, có thể cần giảm đau nhẹ" },
  moderate: { label: "Trung bình", color: "orange", emoji: "🟠", description: "CẦN giảm đau — đặt lịch vet trong 24h" },
  severe: { label: "Nặng", color: "red", emoji: "🔴", description: "Đưa bé đi vet NGAY — đau nghiêm trọng" },
};

export function calculatePain(answers: Record<string, number>): {
  total: number;
  level: PainLevel;
  needs_vet: boolean;
} {
  let total = 0;
  for (const q of PAIN_QUESTIONS) {
    const a = Number(answers[q.id]) || 0;
    const max = Math.max(...q.options.map((o) => o.score));
    total += Math.max(0, Math.min(max, a));
  }
  const level = categorizePain(total);
  return { total, level, needs_vet: total >= 6 };
}

// ================================================================
// Mobility survey (5 questions, no AI for now)
// ================================================================

export interface MobilityQuestion {
  id: string;
  question_vi: string;
  options: Array<{ score: number; label_vi: string }>;
}

export const MOBILITY_QUESTIONS: MobilityQuestion[] = [
  {
    id: "jump_ability",
    question_vi: "Bé nhảy lên sofa/giường",
    options: [
      { score: 3, label_vi: "Bình thường, dễ dàng" },
      { score: 2, label_vi: "Có lưỡng lự / phải cố sức" },
      { score: 1, label_vi: "Cần đẩy / hỗ trợ" },
      { score: 0, label_vi: "Không thể nhảy" },
    ],
  },
  {
    id: "stair_climbing",
    question_vi: "Bé leo cầu thang",
    options: [
      { score: 3, label_vi: "Bình thường" },
      { score: 2, label_vi: "Chậm hơn trước" },
      { score: 1, label_vi: "Khó khăn, dừng nghỉ" },
      { score: 0, label_vi: "Không leo được" },
    ],
  },
  {
    id: "walk_pace",
    question_vi: "Tốc độ đi dạo",
    options: [
      { score: 3, label_vi: "Bình thường / nhanh" },
      { score: 2, label_vi: "Chậm hơn trước" },
      { score: 1, label_vi: "Rất chậm, hay dừng" },
      { score: 0, label_vi: "Không chịu đi" },
    ],
  },
  {
    id: "stand_after_rest",
    question_vi: "Khi đứng dậy sau khi nằm/ngủ",
    options: [
      { score: 3, label_vi: "Đứng lên ngay" },
      { score: 2, label_vi: "Hơi cứng người, mất vài giây" },
      { score: 1, label_vi: "Cứng người rõ, cần thời gian dài" },
      { score: 0, label_vi: "Cần hỗ trợ để đứng" },
    ],
  },
  {
    id: "play_intensity",
    question_vi: "Mức độ chơi đùa",
    options: [
      { score: 3, label_vi: "Bình thường / hăng hái" },
      { score: 2, label_vi: "Giảm so với trước" },
      { score: 1, label_vi: "Chỉ chơi ngắn rồi nghỉ" },
      { score: 0, label_vi: "Không chịu chơi" },
    ],
  },
];

export type MobilityLevel = "excellent" | "good" | "limited" | "severely_limited";

/** Total range 0-15. Convert to 0-100 score for UX. */
export function calculateMobility(answers: Record<string, number>): {
  raw_score: number;
  pct_score: number;
  level: MobilityLevel;
  needs_vet: boolean;
} {
  let raw = 0;
  for (const q of MOBILITY_QUESTIONS) {
    const a = Number(answers[q.id]) || 0;
    raw += Math.max(0, Math.min(3, a));
  }
  const max = MOBILITY_QUESTIONS.length * 3;
  const pct = Math.round((raw / max) * 100);
  let level: MobilityLevel;
  if (pct >= 85) level = "excellent";
  else if (pct >= 65) level = "good";
  else if (pct >= 40) level = "limited";
  else level = "severely_limited";
  return { raw_score: raw, pct_score: pct, level, needs_vet: pct < 65 };
}

export const MOBILITY_LABELS: Record<MobilityLevel, { label: string; color: string; emoji: string; description: string }> = {
  excellent: { label: "Tốt", color: "emerald", emoji: "🟢", description: "Vận động bình thường, không lo ngại" },
  good: { label: "Khá", color: "yellow", emoji: "🟡", description: "Hơi giảm — theo dõi, bổ sung omega-3 + glucosamine" },
  limited: { label: "Hạn chế", color: "orange", emoji: "🟠", description: "Vận động giảm rõ — đi vet kiểm tra xương khớp" },
  severely_limited: { label: "Nghiêm trọng", color: "red", emoji: "🔴", description: "Đưa bé đi vet — có thể đau / viêm khớp / hip dysplasia" },
};
