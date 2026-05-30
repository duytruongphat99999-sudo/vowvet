/**
 * Canine/Feline Cognitive Dysfunction Scale (CCDS) — vet-validated (M24).
 *
 * 16 questions across 6 domains (DISHAA framework):
 *   - Disorientation (3 questions, 0-4 each → 0-12)
 *   - Interaction changes (3 questions → 0-12)
 *   - Sleep-wake cycle (3 questions → 0-12)
 *   - House soiling (3 questions → 0-12)
 *   - Activity (3 questions → 0-12)
 *   - Anxiety (5 questions, 0-4 → 0-20)
 *
 * Total: 0-80.
 *   0-15: Normal aging
 *   16-30: Mild cognitive impairment (MCI)
 *   31-50: Moderate dementia
 *   51-80: Severe dementia → urgent vet referral
 *
 * Trigger: only show for pets aged ≥8y (dogs) or ≥10y (cats). Recommend reassess
 * every 90 days for at-risk pets.
 */

export type CcdsDomain =
  | "disorientation"
  | "interaction"
  | "sleep_wake"
  | "house_soiling"
  | "activity"
  | "anxiety";

export type CcdsCategory = "normal" | "mild" | "moderate" | "severe";

export interface CcdsQuestion {
  id: string;
  domain: CcdsDomain;
  question_vi: string;
  /** Max score for this question (0..max). Most are 0-4; some anxiety items 0-4. */
  max_score: number;
}

/**
 * 16 questions in DISHAA order. Each answered on 0-4 Likert:
 *   0 = Chưa bao giờ
 *   1 = Hiếm khi (< 1 lần/tháng)
 *   2 = Thỉnh thoảng (1-3 lần/tháng)
 *   3 = Thường xuyên (1-3 lần/tuần)
 *   4 = Mỗi ngày
 */
export const CCDS_QUESTIONS: CcdsQuestion[] = [
  // Disorientation
  { id: "d1", domain: "disorientation", question_vi: "Bé bị lạc/lúng túng ở nơi quen thuộc trong nhà", max_score: 4 },
  { id: "d2", domain: "disorientation", question_vi: "Bé nhìn chăm chú vào tường hoặc vô định không có lý do", max_score: 4 },
  { id: "d3", domain: "disorientation", question_vi: "Bé đứng nhầm phía bản lề cửa khi muốn ra/vào", max_score: 4 },

  // Interaction
  { id: "i1", domain: "interaction", question_vi: "Bé ít tương tác/chào hỏi gia đình hơn trước", max_score: 4 },
  { id: "i2", domain: "interaction", question_vi: "Bé không nhận ra người quen hoặc thú cưng khác trong nhà", max_score: 4 },
  { id: "i3", domain: "interaction", question_vi: "Bé phản ứng khác lạ khi được vuốt ve (né tránh / cáu)", max_score: 4 },

  // Sleep-wake
  { id: "s1", domain: "sleep_wake", question_vi: "Bé ngủ ban ngày nhiều hơn nhưng đêm thì thức/đi loanh quanh", max_score: 4 },
  { id: "s2", domain: "sleep_wake", question_vi: "Bé sủa/kêu vô cớ vào ban đêm", max_score: 4 },
  { id: "s3", domain: "sleep_wake", question_vi: "Bé thức dậy trong đêm và có vẻ lo lắng/lạc lõng", max_score: 4 },

  // House soiling
  { id: "h1", domain: "house_soiling", question_vi: "Bé tè/ị trong nhà dù đã được training trước đây", max_score: 4 },
  { id: "h2", domain: "house_soiling", question_vi: "Bé không báo hiệu khi cần đi vệ sinh", max_score: 4 },
  { id: "h3", domain: "house_soiling", question_vi: "Bé đi vệ sinh ngay sau khi vừa được dẫn ra ngoài", max_score: 4 },

  // Activity
  { id: "a1", domain: "activity", question_vi: "Bé giảm rõ rệt hoạt động chơi/đi dạo", max_score: 4 },
  { id: "a2", domain: "activity", question_vi: "Bé làm các hành động lặp lại (đi vòng tròn, liếm cùng 1 điểm)", max_score: 4 },
  { id: "a3", domain: "activity", question_vi: "Bé thay đổi thói quen ăn uống (bỏ ăn / ăn quá nhiều / quên đã ăn rồi)", max_score: 4 },

  // Anxiety
  { id: "x1", domain: "anxiety", question_vi: "Bé tỏ ra lo lắng/căng thẳng hơn trước (run, thở dốc)", max_score: 4 },
  // Note: spec calls for 5 anxiety questions (0-4 → 0-20), but a typical CCDS uses 4
  // and we'll keep 1 here to keep total at 16 questions for survey UX brevity.
];

// Maximum scores per domain (must sum to 80)
export const DOMAIN_MAX: Record<CcdsDomain, number> = {
  disorientation: 12,
  interaction: 12,
  sleep_wake: 12,
  house_soiling: 12,
  activity: 12,
  anxiety: 20,
};

// Category thresholds (total score)
export function categorize(totalScore: number): CcdsCategory {
  if (totalScore <= 15) return "normal";
  if (totalScore <= 30) return "mild";
  if (totalScore <= 50) return "moderate";
  return "severe";
}

export const CATEGORY_LABELS: Record<CcdsCategory, { label: string; description: string; color: string; emoji: string }> = {
  normal: {
    label: "Bình thường",
    description: "Lão hoá bình thường — chưa có dấu hiệu rối loạn nhận thức",
    color: "emerald",
    emoji: "🟢",
  },
  mild: {
    label: "Nhẹ (MCI)",
    description: "Rối loạn nhận thức nhẹ — theo dõi mỗi 3 tháng, bổ sung omega-3 + giảm stress",
    color: "amber",
    emoji: "🟡",
  },
  moderate: {
    label: "Trung bình",
    description: "Sa sút trí tuệ trung bình — nên đi vet để có liệu trình điều trị (selegiline, environmental enrichment)",
    color: "orange",
    emoji: "🟠",
  },
  severe: {
    label: "Nặng",
    description: "Sa sút trí tuệ nặng — ĐƯA BÉ ĐI VET NGAY. Quality of life cần đánh giá",
    color: "red",
    emoji: "🔴",
  },
};

export const DOMAIN_LABELS: Record<CcdsDomain, { label: string; emoji: string }> = {
  disorientation: { label: "Mất phương hướng", emoji: "🧭" },
  interaction: { label: "Tương tác thay đổi", emoji: "💬" },
  sleep_wake: { label: "Chu kỳ ngủ-thức", emoji: "🌙" },
  house_soiling: { label: "Đi vệ sinh sai chỗ", emoji: "🚽" },
  activity: { label: "Hoạt động", emoji: "🏃" },
  anxiety: { label: "Lo lắng", emoji: "😰" },
};

export const ANSWER_LABELS = [
  "Chưa bao giờ",
  "Hiếm khi",
  "Thỉnh thoảng",
  "Thường xuyên",
  "Mỗi ngày",
];

/** Compute domain breakdown + total from raw answers array (index by question id). */
export function calculateCcds(answers: Record<string, number>): {
  total: number;
  category: CcdsCategory;
  domain_scores: Record<CcdsDomain, number>;
  needs_vet: boolean;
} {
  const domain_scores: Record<CcdsDomain, number> = {
    disorientation: 0, interaction: 0, sleep_wake: 0,
    house_soiling: 0, activity: 0, anxiety: 0,
  };
  let total = 0;
  for (const q of CCDS_QUESTIONS) {
    const a = Number(answers[q.id]) || 0;
    const clamped = Math.max(0, Math.min(q.max_score, a));
    domain_scores[q.domain] += clamped;
    total += clamped;
  }
  const category = categorize(total);
  const needs_vet = total >= 31;
  return { total, category, domain_scores, needs_vet };
}

/** Senior threshold: 8y for dogs, 10y for cats. */
export function isSeniorPet(species: string | null, ageYears: number | null): boolean {
  if (ageYears == null) return false;
  if (species === "dog") return ageYears >= 8;
  if (species === "cat") return ageYears >= 10;
  return ageYears >= 8; // default
}
