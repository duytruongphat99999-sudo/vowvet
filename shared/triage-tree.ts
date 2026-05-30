/**
 * Symptom decision-tree (M31).
 *
 * 4 tiers (matches WSAVA + 1-2-1 vet practice triage):
 *   emergency  — đe doạ tính mạng, đến vet trong 1-2h hoặc gọi hotline ngay
 *   urgent     — khám trong 12-24h
 *   non_urgent — theo dõi tại nhà, đặt lịch nếu kéo dài
 *   wellness   — bé ổn, chỉ cần routine care
 *
 * Tree structure: terminal node has `tier + recommendation`, non-terminal has `next`.
 * Each leaf prefers conservative bias (escalate when ambiguous).
 *
 * Helper guidance numbers:
 *   - Hotline: 0779 029 133
 *   - Zalo OA: https://zalo.me/1136810892220003266
 *
 * Content reviewed against VowVet vet-buddy + faq-articles content (2026-05).
 * If updating, keep recommendations in Vietnamese and end emergency tiers
 * with a clear "Gọi 0779029133" callout.
 */

export type TriageTier = "emergency" | "urgent" | "non_urgent" | "wellness";

export interface TriageOption {
  label: string;
  emoji?: string;
  next?: string;
  tier?: TriageTier;
  recommendation?: string;
}

export interface TriageNode {
  id: string;
  question: string;
  helper?: string;
  options: TriageOption[];
}

const HOTLINE_NOTE = "Gọi 0779 029 133 hoặc chat Zalo VowVet để được hướng dẫn cụ thể.";

// ============================================================
// Root: primary symptom selection (15 branches)
// ============================================================
export const TRIAGE_TREE: Record<string, TriageNode> = {
  root: {
    id: "root",
    question: "Bé đang gặp vấn đề gì?",
    helper: "Chọn triệu chứng nổi bật nhất. Nếu nhiều, chọn cái nguy hiểm nhất.",
    options: [
      { label: "Ói / Nôn", emoji: "🤢", next: "vomit_q1" },
      { label: "Tiêu chảy", emoji: "💩", next: "diarrhea_q1" },
      { label: "Chảy máu", emoji: "🩸", tier: "emergency", recommendation: `Chảy máu rõ là cấp cứu. Băng ép vết thương + đến vet ngay (trong 1h). ${HOTLINE_NOTE}` },
      { label: "Khó thở", emoji: "😮‍💨", tier: "emergency", recommendation: `Khó thở là cấp cứu. Giữ bé yên tĩnh, tránh stress, đến vet ngay. ${HOTLINE_NOTE}` },
      { label: "Co giật", emoji: "🥴", tier: "emergency", recommendation: `Co giật là cấp cứu. Đừng giữ bé, dời vật cứng xung quanh, ghi video 30s để vet xem, đến cấp cứu. ${HOTLINE_NOTE}` },
      { label: "Bỏ ăn", emoji: "🍴", next: "noeat_q1" },
      { label: "Lờ đờ / yếu", emoji: "😴", next: "lethargy_q1" },
      { label: "Đau / khớp", emoji: "🦴", next: "pain_q1" },
      { label: "Da / lông bất thường", emoji: "🩹", next: "skin_q1" },
      { label: "Mắt sưng / đỏ", emoji: "👁️", next: "eye_q1" },
      { label: "Tai gãi nhiều", emoji: "👂", next: "ear_q1" },
      { label: "Ho / hắt hơi", emoji: "🤧", next: "cough_q1" },
      { label: "Sờ thấy cục", emoji: "🐛", next: "lump_q1" },
      { label: "Sốt cao", emoji: "🔥", next: "fever_q1" },
      { label: "Nuốt vật lạ", emoji: "🧷", tier: "emergency", recommendation: `Nuốt vật lạ là cấp cứu. KHÔNG gây ói. Đem theo mẫu vật (nếu còn) đến vet. ${HOTLINE_NOTE}` },
    ],
  },

  // ===================== VOMIT =====================
  vomit_q1: {
    id: "vomit_q1",
    question: "Bé đã ói bao nhiêu lần trong 24h qua?",
    options: [
      { label: "1-2 lần", next: "vomit_q2" },
      { label: "3-5 lần", next: "vomit_q3" },
      { label: "Trên 5 lần", tier: "emergency", recommendation: `Ói liên tục > 5 lần/24h gây mất nước nguy hiểm — cấp cứu. ${HOTLINE_NOTE}` },
    ],
  },
  vomit_q2: {
    id: "vomit_q2",
    question: "Trong chất ói có máu hoặc dịch nâu đậm không?",
    options: [
      { label: "Có máu hoặc dịch nâu", tier: "emergency", recommendation: `Ói máu / dịch nâu là cấp cứu (xuất huyết tiêu hoá). ${HOTLINE_NOTE}` },
      { label: "Không, chỉ đồ ăn hoặc bọt", next: "vomit_q3" },
    ],
  },
  vomit_q3: {
    id: "vomit_q3",
    question: "Bé vẫn uống nước, đi lại bình thường, không lờ đờ chứ?",
    options: [
      { label: "Bé bình thường", tier: "non_urgent", recommendation: "Theo dõi 24h: nhịn ăn 12h, chỉ cho uống nước từng ngụm nhỏ. Nếu hết ói + bé tỉnh táo → cho ăn nhẹ (cơm trắng + thịt gà luộc). Ói tiếp tục sau 24h → đặt lịch vet." },
      { label: "Bé lờ đờ / không phản ứng", tier: "urgent", recommendation: `Ói + lờ đờ là dấu hiệu mất nước hoặc bệnh nội tạng. Cần khám trong 12h. ${HOTLINE_NOTE}` },
    ],
  },

  // ===================== DIARRHEA =====================
  diarrhea_q1: {
    id: "diarrhea_q1",
    question: "Phân bé thế nào?",
    options: [
      { label: "Lỏng, không máu", next: "diarrhea_q2" },
      { label: "Có máu tươi", tier: "emergency", recommendation: `Tiêu chảy có máu tươi là cấp cứu (parvo, HGE, ngộ độc). ${HOTLINE_NOTE}` },
      { label: "Đen như nhựa đường", tier: "emergency", recommendation: `Phân đen như nhựa đường = xuất huyết đường tiêu hoá trên — cấp cứu. ${HOTLINE_NOTE}` },
    ],
  },
  diarrhea_q2: {
    id: "diarrhea_q2",
    question: "Bé tiêu chảy bao lâu rồi?",
    options: [
      { label: "Mới hôm nay", next: "diarrhea_q3" },
      { label: "2-3 ngày", tier: "urgent", recommendation: `Tiêu chảy > 48h cần khám trong 24h. Đem mẫu phân (nếu được) đến vet. ${HOTLINE_NOTE}` },
      { label: "Trên 3 ngày", tier: "urgent", recommendation: `Tiêu chảy mãn cần khám sớm + xét nghiệm phân. ${HOTLINE_NOTE}` },
    ],
  },
  diarrhea_q3: {
    id: "diarrhea_q3",
    question: "Bé có lờ đờ hoặc nôn kèm theo không?",
    options: [
      { label: "Có (lờ đờ HOẶC nôn)", tier: "urgent", recommendation: `Tiêu chảy + nôn / lờ đờ có nguy cơ mất nước. Khám trong 12h. ${HOTLINE_NOTE}` },
      { label: "Bé vẫn vui vẻ ăn uống", tier: "non_urgent", recommendation: "Theo dõi 24h, nhịn ăn 6-8h rồi cho ăn nhẹ. Cho uống ORS pha loãng. Nếu kéo dài > 48h hoặc xuất hiện máu → đặt lịch vet." },
    ],
  },

  // ===================== NO EAT =====================
  noeat_q1: {
    id: "noeat_q1",
    question: "Bé bỏ ăn bao lâu rồi?",
    options: [
      { label: "1 bữa", tier: "wellness", recommendation: "1 bữa bỏ ăn thường không đáng lo. Có thể do nóng, thức ăn mới, hoặc tâm trạng. Theo dõi 24h." },
      { label: "1 ngày", next: "noeat_q2" },
      { label: "2 ngày trở lên (chó)", tier: "urgent", recommendation: `Chó bỏ ăn > 48h cần khám. ${HOTLINE_NOTE}` },
      { label: "Mèo bỏ ăn 24h+", tier: "urgent", recommendation: `Mèo bỏ ăn > 24h có nguy cơ gan nhiễm mỡ (hepatic lipidosis) — cần khám sớm. ${HOTLINE_NOTE}` },
    ],
  },
  noeat_q2: {
    id: "noeat_q2",
    question: "Bé có dấu hiệu khác đi kèm không?",
    options: [
      { label: "Có nôn / tiêu chảy / sốt", tier: "urgent", recommendation: `Bỏ ăn + triệu chứng khác — khám trong 24h. ${HOTLINE_NOTE}` },
      { label: "Lờ đờ rõ rệt", tier: "urgent", recommendation: `Bỏ ăn + lờ đờ cần khám trong 24h. ${HOTLINE_NOTE}` },
      { label: "Chỉ bỏ ăn, không có gì khác", tier: "non_urgent", recommendation: "Thử đổi thức ăn (warm-up hoặc thêm pate), kiểm tra thức ăn không bị hỏng. Nếu > 48h vẫn bỏ ăn → đặt lịch vet." },
    ],
  },

  // ===================== LETHARGY =====================
  lethargy_q1: {
    id: "lethargy_q1",
    question: "Bé yếu / lờ đờ ở mức nào?",
    options: [
      { label: "Không đứng dậy được", tier: "emergency", recommendation: `Không đứng dậy được là cấp cứu (sốc, mất máu trong, hạ đường huyết). ${HOTLINE_NOTE}` },
      { label: "Đi loạng choạng", tier: "emergency", recommendation: `Đi loạng choạng / mất thăng bằng là cấp cứu thần kinh. ${HOTLINE_NOTE}` },
      { label: "Vẫn đi được, chỉ ít chơi đùa", next: "lethargy_q2" },
    ],
  },
  lethargy_q2: {
    id: "lethargy_q2",
    question: "Có triệu chứng khác kèm theo không?",
    options: [
      { label: "Có (sốt / nôn / tiêu chảy / bỏ ăn)", tier: "urgent", recommendation: `Lờ đờ + triệu chứng khác — khám trong 12-24h. ${HOTLINE_NOTE}` },
      { label: "Chỉ lờ đờ, không có gì khác", tier: "non_urgent", recommendation: "Theo dõi 24h. Có thể do thời tiết nóng, mới vận động nhiều, hoặc stress. Nếu > 48h vẫn lờ đờ → đặt lịch vet." },
    ],
  },

  // ===================== PAIN =====================
  pain_q1: {
    id: "pain_q1",
    question: "Bé đau ở vị trí nào rõ nhất?",
    options: [
      { label: "Bụng (cứng / phồng)", tier: "emergency", recommendation: `Bụng cứng / phồng có thể là xoắn dạ dày (GDV) hoặc tắc ruột — cấp cứu trong 1-2h. ${HOTLINE_NOTE}` },
      { label: "Chân / khớp", next: "pain_q2" },
      { label: "Lưng / cột sống", tier: "urgent", recommendation: `Đau lưng có thể là thoát vị đĩa đệm (IVDD) — cần khám trong 12h. Giữ bé bất động + đến vet. ${HOTLINE_NOTE}` },
      { label: "Cổ / đầu (rên rỉ khi sờ)", tier: "urgent", recommendation: `Đau đầu / cổ ở pet không phổ biến — cần khám sớm. ${HOTLINE_NOTE}` },
    ],
  },
  pain_q2: {
    id: "pain_q2",
    question: "Bé có chống chân được không?",
    options: [
      { label: "Không chống được", tier: "urgent", recommendation: `Không chống được chân có thể là gãy xương hoặc trật khớp — khám trong 12h. ${HOTLINE_NOTE}` },
      { label: "Chống được nhưng đi cà nhắc", tier: "non_urgent", recommendation: "Cho bé nghỉ ngơi, không vận động mạnh 48-72h. Chườm lạnh 10 phút x 3 lần/ngày nếu sưng. Nếu sau 3 ngày vẫn cà nhắc → đặt lịch vet." },
    ],
  },

  // ===================== SKIN =====================
  skin_q1: {
    id: "skin_q1",
    question: "Da / lông bé có dấu hiệu gì?",
    options: [
      { label: "Phồng đỏ + nóng + đau (nhiễm trùng)", tier: "urgent", recommendation: `Da nhiễm trùng cần khám trong 24h. KHÔNG tự bôi thuốc kháng sinh người. ${HOTLINE_NOTE}` },
      { label: "Ngứa nhiều, gãi liên tục", next: "skin_q2" },
      { label: "Vết thương hở / chảy mủ", tier: "urgent", recommendation: `Vết thương hở cần khám trong 24h để phòng nhiễm trùng. Rửa nước muối sinh lý, giữ sạch. ${HOTLINE_NOTE}` },
      { label: "Rụng lông nhiều, không ngứa", tier: "non_urgent", recommendation: "Có thể do dị ứng, ký sinh trùng, nội tiết. Chụp ảnh vùng rụng + đặt lịch vet tuần này." },
    ],
  },
  skin_q2: {
    id: "skin_q2",
    question: "Bé gãi đến chảy máu / loét chưa?",
    options: [
      { label: "Có loét / chảy máu", tier: "urgent", recommendation: `Loét da cần khám + cấp cứu nhiễm trùng. Đeo loa chống liếm ngay. ${HOTLINE_NOTE}` },
      { label: "Chỉ gãi nhiều", tier: "non_urgent", recommendation: "Có thể là dị ứng (thức ăn / môi trường) hoặc bọ chét. Kiểm tra lông tìm bọ chét, đặt lịch vet để soi da nếu kéo dài > 1 tuần." },
    ],
  },

  // ===================== EYE =====================
  eye_q1: {
    id: "eye_q1",
    question: "Mắt bé có dấu hiệu gì?",
    options: [
      { label: "Lồi mắt / chấn thương", tier: "emergency", recommendation: `Mắt lồi / chấn thương mắt là cấp cứu trong 2h. Giữ ẩm mắt với gạc ướt, đến vet ngay. ${HOTLINE_NOTE}` },
      { label: "Sưng đỏ + chảy mủ vàng/xanh", tier: "urgent", recommendation: `Mủ mắt cần khám trong 24h (viêm kết mạc / loét giác mạc). KHÔNG tự nhỏ thuốc của người. ${HOTLINE_NOTE}` },
      { label: "Chảy nước mắt nhiều", tier: "non_urgent", recommendation: "Lau bằng gạc sạch + nước muối sinh lý. Nếu > 3 ngày không cải thiện → đặt lịch vet." },
      { label: "Đục thuỷ tinh thể (mắt mờ trắng)", tier: "non_urgent", recommendation: "Có thể là cataract (đặc biệt bé senior). Đặt lịch vet để soi mắt + đánh giá thị lực." },
    ],
  },

  // ===================== EAR =====================
  ear_q1: {
    id: "ear_q1",
    question: "Tai bé có dấu hiệu gì?",
    options: [
      { label: "Đỏ + mùi hôi", tier: "urgent", recommendation: `Viêm tai có mùi cần khám trong 24-48h (otitis externa). ${HOTLINE_NOTE}` },
      { label: "Lắc đầu liên tục", tier: "non_urgent", recommendation: "Có thể do ráy tai, vật lạ, hoặc bọ tai (ear mites). Đặt lịch vet để soi tai." },
      { label: "Chảy dịch đen / vàng", tier: "urgent", recommendation: `Dịch tai bất thường = viêm tai. Khám trong 24-48h. ${HOTLINE_NOTE}` },
      { label: "Bị cụp xuống / sưng", tier: "urgent", recommendation: `Tai cụp + sưng có thể là tụ máu vành tai (aural hematoma). Khám trong 24h. ${HOTLINE_NOTE}` },
    ],
  },

  // ===================== COUGH =====================
  cough_q1: {
    id: "cough_q1",
    question: "Bé ho như thế nào?",
    options: [
      { label: "Ho khan + thở khò khè", tier: "urgent", recommendation: `Ho + khò khè có thể là viêm khí quản hoặc hen — khám trong 24h. ${HOTLINE_NOTE}` },
      { label: "Ho ra máu / dịch hồng", tier: "emergency", recommendation: `Ho ra máu là cấp cứu (xuất huyết phổi, phù phổi). ${HOTLINE_NOTE}` },
      { label: "Ho khan + ho gà (kennel cough)", tier: "non_urgent", recommendation: "Có thể là ho cũi chó (Bordetella). Cách ly khỏi pet khác, giữ ấm. Nếu > 5 ngày hoặc bé yếu → đặt lịch vet." },
      { label: "Hắt hơi nhiều, sổ mũi", tier: "non_urgent", recommendation: "Có thể cảm cúm thông thường hoặc viêm mũi dị ứng. Giữ ấm, vệ sinh mũi. Nếu kéo dài > 5 ngày → đặt lịch vet." },
    ],
  },

  // ===================== LUMP =====================
  lump_q1: {
    id: "lump_q1",
    question: "Cục bạn sờ thấy có đặc điểm gì?",
    options: [
      { name: "Mọc nhanh trong 1-2 tuần", label: "Mọc nhanh (1-2 tuần)", tier: "urgent", recommendation: `Cục mọc nhanh cần khám sớm để loại trừ ung thư. ${HOTLINE_NOTE}` },
      { label: "Đau khi sờ + nóng đỏ", tier: "urgent", recommendation: `Cục đau + nóng có thể là áp xe — cần dẫn lưu. Khám trong 24h. ${HOTLINE_NOTE}` },
      { label: "Mềm, di chuyển, không đau (lipoma?)", tier: "non_urgent", recommendation: "Có thể là u mỡ (lipoma) lành tính. Đo kích thước, chụp ảnh, đặt lịch vet để xác định." },
      { label: "Đã có từ lâu, không thay đổi", tier: "wellness", recommendation: "Cục lâu năm không đổi thường lành tính. Vẫn nên cho vet xem trong lần khám định kỳ kế tiếp." },
    ] as any,
  },

  // ===================== FEVER =====================
  fever_q1: {
    id: "fever_q1",
    question: "Bé có dấu hiệu sốt cao? (nóng tai, thở nhanh, mệt)",
    helper: "Nhiệt độ pet bình thường 38-39°C. Trên 39.5°C là sốt.",
    options: [
      { label: "Đo > 40°C", tier: "emergency", recommendation: `Sốt > 40°C là cấp cứu. Làm mát bằng khăn ướt (KHÔNG đá lạnh) + đến vet trong 1-2h. ${HOTLINE_NOTE}` },
      { label: "Đo 39.5-40°C + có triệu chứng khác", tier: "urgent", recommendation: `Sốt + triệu chứng khác — khám trong 12-24h. ${HOTLINE_NOTE}` },
      { label: "Nghi sốt nhưng không đo được", tier: "urgent", recommendation: `Mua nhiệt kế hậu môn (giá 50-100k) hoặc đến vet để đo chính xác trong 24h. ${HOTLINE_NOTE}` },
    ],
  },
};

// ============================================================
// Helpers
// ============================================================

export function getNode(id: string): TriageNode | null {
  return TRIAGE_TREE[id] || null;
}

export function isValidTier(t: any): t is TriageTier {
  return ["emergency", "urgent", "non_urgent", "wellness"].includes(t);
}

export const TIER_META: Record<TriageTier, { emoji: string; label_vi: string; color: string }> = {
  emergency: { emoji: "🚨", label_vi: "Cấp cứu — đi vet NGAY", color: "red" },
  urgent: { emoji: "⚠️", label_vi: "Khẩn — khám trong 12-24h", color: "orange" },
  non_urgent: { emoji: "👁️", label_vi: "Theo dõi tại nhà", color: "amber" },
  wellness: { emoji: "✅", label_vi: "Bé ổn", color: "emerald" },
};

/** Count total nodes (for reporting). */
export function countNodes(): number {
  return Object.keys(TRIAGE_TREE).length;
}

/** Count terminal options (with tier set). */
export function countTerminalOptions(): number {
  let n = 0;
  for (const node of Object.values(TRIAGE_TREE)) {
    for (const opt of node.options) {
      if (opt.tier) n++;
    }
  }
  return n;
}
