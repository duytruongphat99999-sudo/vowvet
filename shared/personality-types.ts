/**
 * Pet Personality Types (M13).
 *
 * 12 types — hardcoded, scoring matrix-based (KHÔNG AI).
 * Source: animal behavior research + Mon Min Clinic experience.
 */

export type PersonalityTypeId =
  | "explorer"
  | "cuddler"
  | "foodie"
  | "guardian"
  | "comedian"
  | "athlete"
  | "diplomat"
  | "loner"
  | "talker"
  | "sleeper"
  | "trickster"
  | "sensitive";

export const ALL_TYPE_IDS: PersonalityTypeId[] = [
  "explorer",
  "cuddler",
  "foodie",
  "guardian",
  "comedian",
  "athlete",
  "diplomat",
  "loner",
  "talker",
  "sleeper",
  "trickster",
  "sensitive",
];

export interface PersonalityType {
  id: PersonalityTypeId;
  emoji: string;
  name_vi: string;
  tagline_vi: string;
  description_vi: string;
  strengths: string[];
  needs: string[];
  best_for_lifestyle: string;
  compatible_types: PersonalityTypeId[];
  color_gradient: string;
  share_text_template: string;
}

export const PERSONALITY_TYPES: Record<PersonalityTypeId, PersonalityType> = {
  explorer: {
    id: "explorer",
    emoji: "🗺️",
    name_vi: "Người Khám Phá",
    tagline_vi: "Mọi ngóc ngách phải đi, mọi mùi phải ngửi",
    description_vi:
      "Bé luôn tò mò, năng lượng cao, không bao giờ chán việc khám phá. Đôi mắt sáng rực khi thấy điều mới — từ chiếc hộp giao hàng đến tiếng chim ngoài cửa sổ.",
    strengths: [
      "Năng động, không bao giờ chán",
      "Học nhanh khi có thử thách mới",
      "Thích nghi tốt với môi trường mới",
      "Tự giải trí giỏi",
    ],
    needs: [
      "Vận động ≥1h/ngày",
      "Đổi đồ chơi + tuyến đi dạo thường xuyên",
      "Puzzle feeder kích thích trí tuệ",
      "KHÔNG để pet một mình lâu (chán → phá đồ)",
    ],
    best_for_lifestyle: "Nhà rộng có sân + chủ năng động + có thời gian dắt đi",
    compatible_types: ["athlete", "trickster", "diplomat"],
    color_gradient: "from-orange-400 to-amber-500",
    share_text_template: "🎭 Bé {pet_name} của tôi là 🗺️ Người Khám Phá! Bé bạn type gì? Test thử: {url}",
  },

  cuddler: {
    id: "cuddler",
    emoji: "🤗",
    name_vi: "Bạn Ôm Ấp",
    tagline_vi: "Theo chủ mọi nơi, mê được vuốt",
    description_vi:
      "Affectionate đến mức theo chủ vào tận toilet. Năng lượng vừa phải, ưu tiên ngồi lòng chủ hơn là đi chạy ngoài. Bé là therapy live-in.",
    strengths: [
      "Bond cực sâu với chủ",
      "Calm môi trường lo âu cho chủ",
      "Dễ huấn luyện vì motivated bằng affection",
      "Tốt cho gia đình có trẻ nhỏ",
    ],
    needs: [
      "Tránh để một mình lâu (separation anxiety)",
      "Cuddle time + chỗ ngồi ấm áp",
      "Tập alone training từ nhỏ",
      "Vận động nhẹ nhàng",
    ],
    best_for_lifestyle: "Apartment + chủ work-from-home hoặc về nhà sớm",
    compatible_types: ["sleeper", "sensitive", "diplomat"],
    color_gradient: "from-pink-400 to-rose-500",
    share_text_template: "🤗 Bé {pet_name} là Bạn Ôm Ấp — affectionate level max! Bé bạn thế nào? {url}",
  },

  foodie: {
    id: "foodie",
    emoji: "🍴",
    name_vi: "Bé Háu Ăn",
    tagline_vi: "Cuộc đời = bữa ăn tiếp theo",
    description_vi:
      "Motivated 100% bởi đồ ăn. Treat-trainable cực dễ. Cảnh báo: nguy cơ overweight nếu chủ không kiểm soát portion. Mắt sáng khi nghe tiếng mở túi.",
    strengths: [
      "Cực dễ huấn luyện (treat reward)",
      "Tốt cho training command mới",
      "Vui vẻ trong giờ ăn",
      "Predictable behavior",
    ],
    needs: [
      "Kiểm soát portion nghiêm ngặt (cân hàng tháng)",
      "Treat low-calorie, đếm vào tổng calo/ngày",
      "Puzzle feeder làm chậm tốc độ ăn",
      "KHÔNG để đồ ăn người trên bàn (steal risk)",
    ],
    best_for_lifestyle: "Mọi gia đình + chủ kỷ luật về khẩu phần",
    compatible_types: ["cuddler", "diplomat", "talker"],
    color_gradient: "from-yellow-400 to-orange-500",
    share_text_template: "🍴 Bé {pet_name} là Bé Háu Ăn — cuộc đời = bữa kế tiếp! Bé bạn? {url}",
  },

  guardian: {
    id: "guardian",
    emoji: "🛡️",
    name_vi: "Người Bảo Vệ",
    tagline_vi: "Alert mọi tiếng động, cảnh giác mọi khách lạ",
    description_vi:
      "Bé có nature watchdog — sủa/kêu khi có người lạ, đứng giữa chủ và mối đe doạ. Cảnh giác cao + bond sâu với gia đình.",
    strengths: [
      "Cảnh báo nhà có người lạ",
      "Loyal cực cao với gia đình",
      "Protective với trẻ + người yếu thế",
      "Confident leader trong nhóm pet",
    ],
    needs: [
      "Socialization sớm để giảm aggression với khách",
      "Training command 'quiet' / 'đủ rồi'",
      "KHÔNG để ngoài sân không giám sát (lo overzealous)",
      "Tránh môi trường quá đông người (stress)",
    ],
    best_for_lifestyle: "Nhà riêng có sân + chủ kiên định + ít khách lạ",
    compatible_types: ["athlete", "loner", "sensitive"],
    color_gradient: "from-slate-600 to-zinc-700",
    share_text_template: "🛡️ Bé {pet_name} là Người Bảo Vệ — watchdog nature 100%! {url}",
  },

  comedian: {
    id: "comedian",
    emoji: "🎭",
    name_vi: "Bé Hài Hước",
    tagline_vi: "Cuộc đời là sân khấu, attention là tiền",
    description_vi:
      "Bé làm trò để được cười + vuốt ve. Playful, mischief có chủ đích. Khi chủ cười → bé biết và làm lại. TikTok material 24/7.",
    strengths: [
      "Mood booster cho cả nhà",
      "Tự nghĩ ra trò mới (creative)",
      "Tương tác xã hội cao",
      "Trainable cho tricks (hand shake, roll over)",
    ],
    needs: [
      "Audience + attention ≥30 phút/ngày",
      "Đồ chơi mới thường xuyên",
      "Trick training để release năng lượng tinh thần",
      "Tránh ignore lâu (bé sẽ phá đồ để gây attention)",
    ],
    best_for_lifestyle: "Gia đình có nhiều người + chủ social media + thích quay video",
    compatible_types: ["diplomat", "trickster", "explorer"],
    color_gradient: "from-fuchsia-400 to-pink-500",
    share_text_template: "🎭 Bé {pet_name} là Bé Hài Hước — comedian 24/7! Bé bạn? {url}",
  },

  athlete: {
    id: "athlete",
    emoji: "🏃",
    name_vi: "Vận Động Viên",
    tagline_vi: "Năng lượng vô tận, agility champion",
    description_vi:
      "Bé cần intense exercise mỗi ngày — chạy, nhảy, frisbee, agility. Working dog DNA (Husky, Border Collie, Aussie Shepherd, Maltipoo active).",
    strengths: [
      "Stamina cực cao",
      "Học agility + obedience nhanh",
      "Endurance hiking partner",
      "Fit + healthy nếu vận động đủ",
    ],
    needs: [
      "Vận động intense ≥1.5h/ngày (2 phiên)",
      "Mental challenge (trick, agility, sport)",
      "Tránh nóng quá 30°C khi tập",
      "Diet high-protein + đủ joint supplement",
    ],
    best_for_lifestyle: "Chủ tập gym/chạy bộ + nhà có sân lớn hoặc gần công viên",
    compatible_types: ["explorer", "trickster", "guardian"],
    color_gradient: "from-green-400 to-emerald-600",
    share_text_template: "🏃 Bé {pet_name} là Vận Động Viên — agility level max! {url}",
  },

  diplomat: {
    id: "diplomat",
    emoji: "🤝",
    name_vi: "Đại Sứ Thân Thiện",
    tagline_vi: "Mọi người là bạn, mọi pet là đồng minh",
    description_vi:
      "Bé chào đón mọi người + pet với đuôi vẫy. Dog park celebrity. Tốt nhất trong các gia đình đông + có nhiều pet.",
    strengths: [
      "Socialize cực tốt — không aggression",
      "Chào đón pet mới về nhà",
      "Tốt cho gia đình có trẻ em",
      "Therapy dog material",
    ],
    needs: [
      "Tương tác xã hội thường xuyên (dog park, pet meetup)",
      "Tránh isolation",
      "Train recall vì bé hay đi theo người lạ",
      "Vaccinate đầy đủ + tẩy giun (tiếp xúc nhiều)",
    ],
    best_for_lifestyle: "Gia đình đông + có nhiều pet + chủ hay đưa đi giao lưu",
    compatible_types: ["cuddler", "comedian", "foodie"],
    color_gradient: "from-sky-400 to-blue-500",
    share_text_template: "🤝 Bé {pet_name} là Đại Sứ Thân Thiện — friend of all! {url}",
  },

  loner: {
    id: "loner",
    emoji: "🌙",
    name_vi: "Bé Độc Lập",
    tagline_vi: "Cho tôi không gian riêng, đừng bother",
    description_vi:
      "Bé prefer solitude — có chỗ riêng + không thích bị ôm liên tục. Không phải antisocial, chỉ là introvert. Phổ biến ở mèo Anh lông ngắn, Persian, một số chó Shiba.",
    strengths: [
      "Low maintenance",
      "OK ở một mình lâu",
      "Predictable behavior",
      "Independent thinker",
    ],
    needs: [
      "Có chỗ trốn an toàn (cave bed, kệ cao)",
      "Tôn trọng signal 'đừng bother' (vẫy đuôi flick, lùi lại)",
      "Tương tác theo điều kiện bé (bé approach → chủ vuốt)",
      "Không ép socialize",
    ],
    best_for_lifestyle: "Chủ bận + apartment yên tĩnh + ít khách",
    compatible_types: ["sleeper", "guardian", "sensitive"],
    color_gradient: "from-indigo-500 to-purple-700",
    share_text_template: "🌙 Bé {pet_name} là Bé Độc Lập — introvert tinh tế! {url}",
  },

  talker: {
    id: "talker",
    emoji: "💬",
    name_vi: "Bé Hay Nói",
    tagline_vi: "Vocal communication, sủa/kêu để giao tiếp",
    description_vi:
      "Bé sủa/kêu/meow để giao tiếp — đói nói, vui nói, buồn nói. Husky, Beagle, Siamese phổ biến. Hàng xóm có thể không vui nếu apartment.",
    strengths: [
      "Giao tiếp rõ ràng với chủ",
      "Cảnh báo nếu có gì bất thường",
      "Personality rõ ràng + entertaining",
      "Bond communication 2 chiều",
    ],
    needs: [
      "Train command 'quiet' / 'đủ rồi'",
      "Apartment có cách âm tốt hoặc nhà riêng",
      "Vận động đủ để giảm bored barking",
      "Hiểu loại tiếng kêu (đói/đau/vui — đừng ignore)",
    ],
    best_for_lifestyle: "Nhà riêng + chủ tolerant tiếng ồn + không hàng xóm khó tính",
    compatible_types: ["foodie", "comedian", "explorer"],
    color_gradient: "from-cyan-400 to-teal-500",
    share_text_template: "💬 Bé {pet_name} là Bé Hay Nói — vocal communicator! {url}",
  },

  sleeper: {
    id: "sleeper",
    emoji: "😴",
    name_vi: "Chuyên Gia Ngủ",
    tagline_vi: "18h ngủ + 6h ăn uống = cuộc đời perfect",
    description_vi:
      "Low energy, chill, ngủ phần lớn ngày. Mèo lớn tuổi, chó Bulldog, Persian. Easy maintenance — chỉ cần thức ăn ngon + ổ ấm.",
    strengths: [
      "Cực low maintenance",
      "Calm cho gia đình lo âu",
      "OK ở một mình lâu",
      "Apartment-friendly",
    ],
    needs: [
      "Vận động nhẹ 20-30 phút/ngày (tránh obesity)",
      "Diet kiểm soát portion (low activity = ít calo)",
      "Khám sức khoẻ kỹ (lười có thể là dấu hiệu bệnh)",
      "Ổ ấm + góc yên tĩnh",
    ],
    best_for_lifestyle: "Chủ bận + apartment nhỏ + senior gia đình",
    compatible_types: ["cuddler", "loner", "sensitive"],
    color_gradient: "from-violet-300 to-purple-400",
    share_text_template: "😴 Bé {pet_name} là Chuyên Gia Ngủ — 18h/ngày! {url}",
  },

  trickster: {
    id: "trickster",
    emoji: "🎩",
    name_vi: "Bé Thông Minh",
    tagline_vi: "Problem solver, học nhanh, mischief có IQ",
    description_vi:
      "Cực thông minh — học trick nhanh, mở cửa, kéo dây, biết chờ. Cũng dễ bored → tự tìm trò để chơi (đôi khi gây phiền). Border Collie, Poodle, mèo Bengal.",
    strengths: [
      "Học command + trick nhanh",
      "Tự giải puzzle",
      "Predictable nếu hiểu motivation",
      "Suitable cho service/therapy training",
    ],
    needs: [
      "Mental stimulation hàng ngày (puzzle, trick training)",
      "Đổi đồ chơi + thử thách mới",
      "Tránh repetitive routine (boring → mischief)",
      "Training advanced (recall, off-leash discipline)",
    ],
    best_for_lifestyle: "Chủ thích training + có thời gian dạy + nhà rộng",
    compatible_types: ["athlete", "comedian", "explorer"],
    color_gradient: "from-lime-400 to-green-500",
    share_text_template: "🎩 Bé {pet_name} là Bé Thông Minh — problem solver! {url}",
  },

  sensitive: {
    id: "sensitive",
    emoji: "💎",
    name_vi: "Bé Nhạy Cảm",
    tagline_vi: "Đọc mood chủ, dễ stress, cần môi trường yên tĩnh",
    description_vi:
      "Emotional + intuitive. Cảm nhận mood chủ rõ — chủ buồn → bé ngồi cạnh. Stress dễ với tiếng ồn, thay đổi routine, khách lạ. Cavalier, Whippet, mèo Ragdoll.",
    strengths: [
      "Therapy companion tự nhiên",
      "Đọc body language chủ giỏi",
      "Bond sâu sắc emotional",
      "Phù hợp người introvert",
    ],
    needs: [
      "Môi trường yên tĩnh, predictable",
      "Tránh thay đổi đột ngột (chuyển nhà, có bé mới)",
      "KHÔNG la mắng (sẽ shut down)",
      "Pheromone diffuser nếu stress dài hạn",
    ],
    best_for_lifestyle: "Chủ calm + apartment yên + không nhiều khách",
    compatible_types: ["cuddler", "loner", "sleeper"],
    color_gradient: "from-rose-300 to-pink-400",
    share_text_template: "💎 Bé {pet_name} là Bé Nhạy Cảm — emotional therapist! {url}",
  },
};

/** Helper: get type metadata. */
export function getPersonalityType(id: PersonalityTypeId | string | null | undefined): PersonalityType | null {
  if (!id) return null;
  return (PERSONALITY_TYPES as any)[id as PersonalityTypeId] || null;
}

// ============================================================
// K-FACTOR MAP — Pet Score multiplier per personality type
// ============================================================
/**
 * k_factor: how much each activity rewards (motivates owner of demanding pets).
 *
 * - OUTGOING (1.30-1.60): năng động cao, đốt cháy năng lượng nhanh → cần routine
 *   intense. Owner làm tốt được THƯỞNG NHIỀU để khuyến khích.
 * - BALANCED  (1.05-1.20): cân bằng → reward vừa phải.
 * - INTROVERT (0.75-0.95): nhạy cảm, cần chăm sóc tinh tế → reward khiêm tốn.
 *   Không penalty (modifier clamp >= 0) — bé không cần nhiều, owner đã đủ.
 * - SPECIAL  (1.25): sáng tạo, độc đáo.
 */
export interface PersonalityKMeta {
  k: number;
  group: "OUTGOING" | "BALANCED" | "INTROVERT" | "SPECIAL";
  badge_vi: string;
  plan_label: string;
  voucher_category: string;
}

export const PERSONALITY_K_FACTORS: Record<PersonalityTypeId, PersonalityKMeta> = {
  // OUTGOING
  explorer:  { k: 1.50, group: "OUTGOING",  badge_vi: "Nhà Thám Hiểm",      plan_label: "Outdoor 30d",  voucher_category: "Đồ chơi vận động" },
  athlete:   { k: 1.60, group: "OUTGOING",  badge_vi: "Vận Động Viên",      plan_label: "Active 30d",   voucher_category: "Dinh dưỡng tăng cơ" },
  talker:    { k: 1.30, group: "OUTGOING",  badge_vi: "Diễn Giả Tí Hon",    plan_label: "Bond 30d",     voucher_category: "Quà tương tác" },
  comedian:  { k: 1.35, group: "OUTGOING",  badge_vi: "Vua Hài Hước",       plan_label: "Play 30d",     voucher_category: "Đồ chơi quirky" },
  // BALANCED
  guardian:  { k: 1.20, group: "BALANCED",  badge_vi: "Vệ Sĩ Trung Thành",  plan_label: "Training 30d", voucher_category: "Huấn luyện cao cấp" },
  diplomat:  { k: 1.15, group: "BALANCED",  badge_vi: "Sứ Giả Hòa Bình",    plan_label: "Social 30d",   voucher_category: "Playdate pack" },
  foodie:    { k: 1.05, group: "BALANCED",  badge_vi: "Thực Khách Sành",    plan_label: "Nutrition 30d",voucher_category: "Đồ ăn premium" },
  // INTROVERT
  cuddler:   { k: 0.95, group: "INTROVERT", badge_vi: "Trái Tim Ấm",        plan_label: "Bonding 30d",  voucher_category: "Đồ giữ ấm + ổ" },
  loner:     { k: 0.80, group: "INTROVERT", badge_vi: "Người Cô Độc Êm",    plan_label: "Quiet 30d",    voucher_category: "Phụ kiện riêng tư" },
  sleeper:   { k: 0.75, group: "INTROVERT", badge_vi: "Triết Gia Ngủ Ngon", plan_label: "Rest 30d",     voucher_category: "Đệm + giấc ngủ" },
  sensitive: { k: 0.85, group: "INTROVERT", badge_vi: "Tâm Hồn Mong Manh",  plan_label: "Calm 30d",     voucher_category: "Anti-stress" },
  // SPECIAL
  trickster: { k: 1.25, group: "SPECIAL",   badge_vi: "Nghệ Sĩ Tinh Nghịch",plan_label: "Enrich 30d",   voucher_category: "Puzzle toy + treat" },
};

export function getPersonalityKMeta(id: PersonalityTypeId | string | null | undefined): PersonalityKMeta {
  if (id && (PERSONALITY_K_FACTORS as any)[id]) {
    return (PERSONALITY_K_FACTORS as any)[id];
  }
  return { k: 1.0, group: "BALANCED", badge_vi: "Tính cách Đặc biệt", plan_label: "Custom 30d", voucher_category: "Quà bí mật" };
}

/** Render share text với pet + url. */
export function renderShareText(id: PersonalityTypeId, petName: string, url: string): string {
  const t = PERSONALITY_TYPES[id];
  if (!t) return "";
  return t.share_text_template.replace("{pet_name}", petName).replace("{url}", url);
}
