/**
 * Pet Personality Quiz Questions (M13).
 *
 * 20 questions across 6 dimensions:
 *   - Energy: 4 questions
 *   - Social: 4 questions
 *   - Food: 3 questions
 *   - Independence: 3 questions
 *   - Communication: 2 questions
 *   - Stress: 4 questions
 *
 * Mỗi option contributes points cho 2-4 personality types (matrix scoring).
 * Coverage check: mỗi type được trigger qua nhiều dimensions (no bias toward 1).
 */
import type { PersonalityTypeId } from "./personality-types.ts";

export type QuestionDimension =
  | "energy"
  | "social"
  | "food"
  | "independence"
  | "communication"
  | "stress";

export interface PersonalityOption {
  id: string; // "a" | "b" | "c" | "d"
  text_vi: string;
  scores: Partial<Record<PersonalityTypeId, number>>;
}

export interface PersonalityQuestion {
  id: string; // "q1" ... "q20"
  dimension: QuestionDimension;
  emoji: string;
  question_vi: string;
  options: PersonalityOption[];
}

export const PERSONALITY_QUESTIONS: PersonalityQuestion[] = [
  // ============================================================
  // ENERGY (4 questions)
  // ============================================================
  {
    id: "q1",
    dimension: "energy",
    emoji: "🌅",
    question_vi: "Sáng dậy bé thường:",
    options: [
      { id: "a", text_vi: "Chạy lăng xăng đòi ra ngoài", scores: { explorer: 3, athlete: 2 } },
      { id: "b", text_vi: "Vào giường chủ ôm thêm 1 chút", scores: { cuddler: 3, sleeper: 2 } },
      { id: "c", text_vi: "Sủa/kêu báo chủ dậy cho ăn", scores: { foodie: 2, talker: 2, guardian: 1 } },
      { id: "d", text_vi: "Ngáp dài, từ từ thức dậy", scores: { sleeper: 3, loner: 1 } },
    ],
  },
  {
    id: "q2",
    dimension: "energy",
    emoji: "🏃",
    question_vi: "Mỗi ngày bé cần vận động bao nhiêu?",
    options: [
      { id: "a", text_vi: "1.5h+ chạy nhảy intensive", scores: { athlete: 3, explorer: 2 } },
      { id: "b", text_vi: "30-60 phút đi bộ vừa phải", scores: { diplomat: 2, comedian: 2 } },
      { id: "c", text_vi: "15-30 phút nhẹ nhàng đủ rồi", scores: { cuddler: 2, sleeper: 1, sensitive: 1 } },
      { id: "d", text_vi: "Bé tự chơi, không cần lịch cố định", scores: { loner: 2, sleeper: 2, trickster: 1 } },
    ],
  },
  {
    id: "q3",
    dimension: "energy",
    emoji: "🎾",
    question_vi: "Khi thấy đồ chơi bóng/dây:",
    options: [
      { id: "a", text_vi: "Lao vào ngay, đuổi bắt không mỏi", scores: { athlete: 3, comedian: 1 } },
      { id: "b", text_vi: "Chơi nhẹ rồi bỏ, tìm trò khác", scores: { trickster: 2, explorer: 1 } },
      { id: "c", text_vi: "Mang về cho chủ, đòi tương tác", scores: { cuddler: 2, comedian: 2 } },
      { id: "d", text_vi: "Lười, nhìn từ xa", scores: { sleeper: 3, loner: 2 } },
    ],
  },
  {
    id: "q4",
    dimension: "energy",
    emoji: "🏞️",
    question_vi: "Khi đến công viên / nơi mới:",
    options: [
      { id: "a", text_vi: "Chạy điên cuồng khám phá mọi góc", scores: { explorer: 3, athlete: 1 } },
      { id: "b", text_vi: "Lăn xăn chào pet + người khác", scores: { diplomat: 3, comedian: 1 } },
      { id: "c", text_vi: "Đi sát chủ, cảnh giác xung quanh", scores: { sensitive: 2, guardian: 2, loner: 1 } },
      { id: "d", text_vi: "Chỉ quan tâm khi có ai cho ăn", scores: { foodie: 3 } },
    ],
  },

  // ============================================================
  // SOCIAL (4 questions)
  // ============================================================
  {
    id: "q5",
    dimension: "social",
    emoji: "🚪",
    question_vi: "Khi người lạ đến nhà:",
    options: [
      { id: "a", text_vi: "Chạy lại vẫy đuôi xin vuốt", scores: { diplomat: 3, cuddler: 1 } },
      { id: "b", text_vi: "Sủa cảnh báo, đứng giữa chủ và khách", scores: { guardian: 3, talker: 1 } },
      { id: "c", text_vi: "Trốn dưới ghế / sau chân chủ", scores: { sensitive: 3, loner: 1 } },
      { id: "d", text_vi: "Mặc kệ, tiếp tục việc của mình", scores: { sleeper: 2, loner: 2 } },
    ],
  },
  {
    id: "q6",
    dimension: "social",
    emoji: "🐶",
    question_vi: "Gặp pet khác (chó/mèo lạ):",
    options: [
      { id: "a", text_vi: "Chào hỏi vẫy đuôi, làm bạn ngay", scores: { diplomat: 3, comedian: 1 } },
      { id: "b", text_vi: "Cảnh giác, sủa/hiss để mark territory", scores: { guardian: 2, talker: 2 } },
      { id: "c", text_vi: "Trốn / muốn về", scores: { sensitive: 3, loner: 1 } },
      { id: "d", text_vi: "Chỉ chơi nếu pet kia chủ động", scores: { loner: 2, sleeper: 1 } },
    ],
  },
  {
    id: "q7",
    dimension: "social",
    emoji: "👥",
    question_vi: "Khi nhà đông người (party, Tết):",
    options: [
      { id: "a", text_vi: "Vui vẻ hoà nhập, ai cũng được vuốt", scores: { diplomat: 3, comedian: 2 } },
      { id: "b", text_vi: "Bám chủ liên tục, không rời", scores: { cuddler: 2, sensitive: 2 } },
      { id: "c", text_vi: "Trốn phòng riêng cho đến khi yên", scores: { sensitive: 3, loner: 2 } },
      { id: "d", text_vi: "Làm trò để được attention", scores: { comedian: 3, talker: 1 } },
    ],
  },
  {
    id: "q8",
    dimension: "social",
    emoji: "🛋️",
    question_vi: "Chủ ngồi đọc sách trên sofa, bé sẽ:",
    options: [
      { id: "a", text_vi: "Nằm sát bên / lên đùi chủ", scores: { cuddler: 3, sleeper: 1 } },
      { id: "b", text_vi: "Mang đồ chơi đến đòi chơi", scores: { comedian: 2, explorer: 2 } },
      { id: "c", text_vi: "Tự chơi/khám phá ở phòng khác", scores: { loner: 3, trickster: 1 } },
      { id: "d", text_vi: "Nằm gần nhưng giữ khoảng cách", scores: { sensitive: 2, loner: 2 } },
    ],
  },

  // ============================================================
  // FOOD (3 questions)
  // ============================================================
  {
    id: "q9",
    dimension: "food",
    emoji: "🍽️",
    question_vi: "Khi nghe tiếng mở túi thức ăn:",
    options: [
      { id: "a", text_vi: "Lao tới ngay lập tức, mắt sáng rực", scores: { foodie: 3, athlete: 1 } },
      { id: "b", text_vi: "Đi tới từ tốn nhưng quan tâm", scores: { diplomat: 1, cuddler: 1, comedian: 1 } },
      { id: "c", text_vi: "Không phản ứng đặc biệt", scores: { loner: 2, sleeper: 1 } },
      { id: "d", text_vi: "Kêu hỏi 'có gì cho con không?'", scores: { talker: 3, foodie: 1 } },
    ],
  },
  {
    id: "q10",
    dimension: "food",
    emoji: "🦴",
    question_vi: "Khi đói + chưa được cho ăn đúng giờ:",
    options: [
      { id: "a", text_vi: "Quẩy sủa/kêu liên tục cho đến khi có ăn", scores: { talker: 3, foodie: 2 } },
      { id: "b", text_vi: "Ngồi cạnh tủ lạnh / bát ăn, mắt thèm", scores: { foodie: 3, cuddler: 1 } },
      { id: "c", text_vi: "Tự đi kiếm — mở tủ, lục thùng rác", scores: { trickster: 3, foodie: 1 } },
      { id: "d", text_vi: "Đợi chờ kiên nhẫn", scores: { sensitive: 2, sleeper: 2, loner: 1 } },
    ],
  },
  {
    id: "q11",
    dimension: "food",
    emoji: "🥩",
    question_vi: "Khi training với treat reward:",
    options: [
      { id: "a", text_vi: "Học cực nhanh, sẵn sàng làm mọi trick", scores: { foodie: 3, trickster: 2 } },
      { id: "b", text_vi: "Quan tâm vừa phải, learn theo tốc độ riêng", scores: { diplomat: 2, comedian: 1 } },
      { id: "c", text_vi: "Thích affection hơn treat", scores: { cuddler: 3 } },
      { id: "d", text_vi: "Không hứng thú training", scores: { loner: 2, sleeper: 2 } },
    ],
  },

  // ============================================================
  // INDEPENDENCE (3 questions)
  // ============================================================
  {
    id: "q12",
    dimension: "independence",
    emoji: "🚶",
    question_vi: "Khi chủ ra khỏi nhà (đi làm):",
    options: [
      { id: "a", text_vi: "Bám cửa, kêu/sủa, có thể phá đồ", scores: { cuddler: 2, sensitive: 3 } },
      { id: "b", text_vi: "Buồn 5 phút, sau đó tự chơi/ngủ", scores: { diplomat: 1, sleeper: 2 } },
      { id: "c", text_vi: "Vui vẻ vẫy đuôi 'bye', tự làm việc của mình", scores: { loner: 3, trickster: 1 } },
      { id: "d", text_vi: "Đứng cửa sổ canh chừng", scores: { guardian: 3, explorer: 1 } },
    ],
  },
  {
    id: "q13",
    dimension: "independence",
    emoji: "🛏️",
    question_vi: "Chỗ ngủ ưa thích của bé:",
    options: [
      { id: "a", text_vi: "Giường chủ — sát bên hoặc trên người", scores: { cuddler: 3, sensitive: 1 } },
      { id: "b", text_vi: "Sofa hoặc thảm gần khu sinh hoạt", scores: { diplomat: 2, comedian: 1 } },
      { id: "c", text_vi: "Ổ riêng / cave bed yên tĩnh", scores: { loner: 3, sensitive: 2 } },
      { id: "d", text_vi: "Bất cứ đâu — bé ngủ mọi nơi", scores: { sleeper: 3 } },
    ],
  },
  {
    id: "q14",
    dimension: "independence",
    emoji: "🎯",
    question_vi: "Khi giải puzzle (puzzle feeder / hide & seek):",
    options: [
      { id: "a", text_vi: "Giải nhanh, đôi khi chủ phải tăng độ khó", scores: { trickster: 3, explorer: 1 } },
      { id: "b", text_vi: "Cố gắng vài lần rồi bỏ", scores: { sleeper: 2, foodie: 1 } },
      { id: "c", text_vi: "Đòi chủ giải giúp", scores: { cuddler: 2, talker: 1 } },
      { id: "d", text_vi: "Không quan tâm puzzle", scores: { loner: 2, sleeper: 2 } },
    ],
  },

  // ============================================================
  // COMMUNICATION (2 questions)
  // ============================================================
  {
    id: "q15",
    dimension: "communication",
    emoji: "🗣️",
    question_vi: "Bé thường vocal (sủa/kêu) bao nhiêu trong ngày?",
    options: [
      { id: "a", text_vi: "Rất nhiều — báo mọi thứ, kêu khi vui buồn", scores: { talker: 3, comedian: 1 } },
      { id: "b", text_vi: "Vừa phải — chỉ khi cần (đói, có người lạ)", scores: { guardian: 2, foodie: 1 } },
      { id: "c", text_vi: "Hiếm khi — chỉ khi rất khẩn cấp", scores: { loner: 2, sleeper: 2, sensitive: 1 } },
      { id: "d", text_vi: "Có 'giọng' riêng để giao tiếp với chủ", scores: { talker: 2, cuddler: 1, trickster: 1 } },
    ],
  },
  {
    id: "q16",
    dimension: "communication",
    emoji: "👀",
    question_vi: "Khi muốn gì đó (đi vệ sinh, đói, chơi):",
    options: [
      { id: "a", text_vi: "Sủa/kêu thẳng — rất rõ ràng", scores: { talker: 3 } },
      { id: "b", text_vi: "Làm trò ngộ nghĩnh để gây attention", scores: { comedian: 3, trickster: 1 } },
      { id: "c", text_vi: "Nhìn chăm chú vào chủ", scores: { sensitive: 2, cuddler: 2 } },
      { id: "d", text_vi: "Tự đi giải quyết (mở cửa, kiếm đồ ăn)", scores: { trickster: 3, loner: 1 } },
    ],
  },

  // ============================================================
  // STRESS (4 questions)
  // ============================================================
  {
    id: "q17",
    dimension: "stress",
    emoji: "🌩️",
    question_vi: "Khi có tiếng ồn lớn (sấm, pháo, máy hút):",
    options: [
      { id: "a", text_vi: "Run rẩy, trốn dưới giường", scores: { sensitive: 3, loner: 1 } },
      { id: "b", text_vi: "Sủa/kêu phản ứng dữ dội", scores: { guardian: 2, talker: 2 } },
      { id: "c", text_vi: "Mặc kệ, tiếp tục việc đang làm", scores: { sleeper: 2, loner: 2 } },
      { id: "d", text_vi: "Bám chủ tìm comfort", scores: { cuddler: 3, sensitive: 2 } },
    ],
  },
  {
    id: "q18",
    dimension: "stress",
    emoji: "🚗",
    question_vi: "Khi đi xe (ô tô, xe máy):",
    options: [
      { id: "a", text_vi: "Vui vẻ thích đi, nhìn ra cửa sổ", scores: { explorer: 3, diplomat: 1 } },
      { id: "b", text_vi: "Bồn chồn, nôn ói (motion sickness)", scores: { sensitive: 3 } },
      { id: "c", text_vi: "Bình thản, ngủ trong giỏ", scores: { sleeper: 3, loner: 1 } },
      { id: "d", text_vi: "Kêu/sủa liên tục", scores: { talker: 2, sensitive: 2 } },
    ],
  },
  {
    id: "q19",
    dimension: "stress",
    emoji: "🏥",
    question_vi: "Khi đi vet / cạo lông:",
    options: [
      { id: "a", text_vi: "Bình tĩnh, hợp tác", scores: { sleeper: 2, diplomat: 2 } },
      { id: "b", text_vi: "Run lẩy bẩy, kêu thảm", scores: { sensitive: 3 } },
      { id: "c", text_vi: "Phản kháng, cắn/cào", scores: { guardian: 2, loner: 2 } },
      { id: "d", text_vi: "Cần treat + train để cooperate", scores: { foodie: 2, trickster: 1 } },
    ],
  },
  {
    id: "q20",
    dimension: "stress",
    emoji: "🏠",
    question_vi: "Khi có thay đổi lớn (chuyển nhà, có pet mới):",
    options: [
      { id: "a", text_vi: "Thích nghi nhanh trong 1-2 ngày", scores: { diplomat: 2, explorer: 2, sleeper: 1 } },
      { id: "b", text_vi: "Mất 1-2 tuần adjust, lo âu", scores: { sensitive: 3 } },
      { id: "c", text_vi: "Tự lập kế hoạch khám phá khu vực mới", scores: { explorer: 3, trickster: 1 } },
      { id: "d", text_vi: "Trốn / rút lui cho đến quen", scores: { loner: 3, sensitive: 1 } },
    ],
  },
];

/** Get question by id. */
export function getQuestion(id: string): PersonalityQuestion | null {
  return PERSONALITY_QUESTIONS.find((q) => q.id === id) || null;
}

/** Get option của 1 question. */
export function getOption(questionId: string, optionId: string): PersonalityOption | null {
  const q = getQuestion(questionId);
  if (!q) return null;
  return q.options.find((o) => o.id === optionId) || null;
}
