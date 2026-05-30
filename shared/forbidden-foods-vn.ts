/**
 * Forbidden foods cho chó/mèo — Vietnamese context (M7).
 * Hard-coded, không trong DB. Educational display + AI awareness baseline.
 *
 * Source: ASPCA + VOHC + WSAVA nutritional toxicity guidelines + Vietnam vet practice.
 */

export type ForbiddenLevel = "critical" | "high_caution";

export interface ForbiddenFood {
  id: string;
  name_vn: string;
  name_en?: string;
  level: ForbiddenLevel;
  reason_vn: string;
  applies_to: Array<"dog" | "cat" | "both">;
}

export const FORBIDDEN_FOODS_VN: ForbiddenFood[] = [
  // ===== CRITICAL — NEVER feed =====
  {
    id: "chocolate",
    name_vn: "Chocolate / Sô-cô-la",
    name_en: "Chocolate",
    level: "critical",
    reason_vn: "Chứa theobromine — độc với tim mạch và hệ thần kinh.",
    applies_to: ["both"],
  },
  {
    id: "grapes",
    name_vn: "Nho tươi và nho khô",
    name_en: "Grapes & raisins",
    level: "critical",
    reason_vn: "Gây suy thận cấp ngay cả với lượng nhỏ.",
    applies_to: ["dog", "cat"],
  },
  {
    id: "onion_garlic",
    name_vn: "Hành, tỏi (sống/chín/bột)",
    name_en: "Onions & garlic",
    level: "critical",
    reason_vn: "Phá vỡ hồng cầu → thiếu máu tan máu (mèo nhạy cảm hơn).",
    applies_to: ["both"],
  },
  {
    id: "xylitol",
    name_vn: "Xylitol (kẹo gum không đường, kem đánh răng người)",
    name_en: "Xylitol",
    level: "critical",
    reason_vn: "Hạ đường huyết cấp, suy gan trong vài giờ.",
    applies_to: ["dog"],
  },
  {
    id: "macadamia",
    name_vn: "Hạt macadamia",
    name_en: "Macadamia nuts",
    level: "critical",
    reason_vn: "Yếu cơ, run rẩy, sốt — chỉ ở chó.",
    applies_to: ["dog"],
  },
  {
    id: "avocado",
    name_vn: "Bơ (avocado)",
    name_en: "Avocado",
    level: "critical",
    reason_vn: "Chứa persin — gây nôn mửa, tiêu chảy.",
    applies_to: ["both"],
  },
  {
    id: "caffeine",
    name_vn: "Cà phê, trà, nước tăng lực",
    name_en: "Caffeine",
    level: "critical",
    reason_vn: "Tương tự chocolate — tăng nhịp tim, co giật.",
    applies_to: ["both"],
  },
  {
    id: "alcohol",
    name_vn: "Rượu, bia, hèm cơm rượu",
    name_en: "Alcohol",
    level: "critical",
    reason_vn: "Suy gan, hô hấp, hôn mê.",
    applies_to: ["both"],
  },
  {
    id: "cooked_bones",
    name_vn: "Xương gà nấu chín, xương cá nhỏ",
    name_en: "Cooked bones",
    level: "critical",
    reason_vn: "Mảnh xương đâm thủng dạ dày, ruột.",
    applies_to: ["both"],
  },
  {
    id: "raw_fish",
    name_vn: "Cá sống nước ngọt (cá hồi sống)",
    name_en: "Raw freshwater fish",
    level: "critical",
    reason_vn: "Ký sinh trùng salmon poisoning — đặc biệt chó.",
    applies_to: ["dog"],
  },

  // ===== HIGH CAUTION — Limit / Avoid =====
  {
    id: "cow_milk",
    name_vn: "Sữa bò tươi",
    name_en: "Cow milk",
    level: "high_caution",
    reason_vn: "Không dung nạp lactose ở >80% chó mèo trưởng thành → tiêu chảy.",
    applies_to: ["both"],
  },
  {
    id: "canned_tuna",
    name_vn: "Cá ngừ đóng hộp người",
    name_en: "Canned tuna (human)",
    level: "high_caution",
    reason_vn: "Mercury cao, sodium cao, không cân bằng dinh dưỡng nếu ăn thường xuyên.",
    applies_to: ["cat"],
  },
  {
    id: "human_sweets",
    name_vn: "Bánh kẹo, kem cho người",
    name_en: "Human sweets",
    level: "high_caution",
    reason_vn: "Đường + bơ + sữa = gây béo phì, viêm tụy.",
    applies_to: ["both"],
  },
  {
    id: "deli_meat",
    name_vn: "Thịt nguội, jambon, xúc xích",
    name_en: "Processed deli meat",
    level: "high_caution",
    reason_vn: "Sodium cao, chất bảo quản — không hợp tiêu hoá pet.",
    applies_to: ["both"],
  },
  {
    id: "raw_bones",
    name_vn: "Bone meal raw chưa khử trùng",
    name_en: "Raw bone meal",
    level: "high_caution",
    reason_vn: "Nguy cơ Salmonella, E. coli. Nên xương đông lạnh thương mại nếu cho ăn raw.",
    applies_to: ["dog"],
  },
];

/** List names tiếng Việt cho hiển thị UI Section 6 forbidden foods. */
export function listForbidden(speciesEN?: "dog" | "cat"): ForbiddenFood[] {
  if (!speciesEN) return FORBIDDEN_FOODS_VN;
  return FORBIDDEN_FOODS_VN.filter((f) => f.applies_to.includes(speciesEN) || f.applies_to.includes("both" as any));
}

/** Compact list cho AI prompt (chỉ critical, tên VN). */
export function forbiddenForPrompt(speciesEN?: "dog" | "cat"): string {
  const list = listForbidden(speciesEN)
    .filter((f) => f.level === "critical")
    .map((f) => f.name_vn);
  return list.join(", ");
}
