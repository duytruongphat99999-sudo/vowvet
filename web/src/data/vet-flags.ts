/**
 * vet-flags.ts — BẢNG DỮ LIỆU cho cụm "phân tích sản phẩm theo hồ sơ bé" (màn /scan/result).
 *
 * ⚠️ ĐÂY LÀ DATA THUẦN — KHÔNG có logic. Duy/bác sĩ sửa SỐ và THÊM DÒNG ở đây,
 *    KHÔNG cần đụng code matcher (nằm trong ScanResultCard.astro).
 *
 * Cách matcher dùng file này (tham khảo, KHÔNG cần hiểu để sửa số):
 *  - `kw` = danh sách TỪ KHOÁ. Matcher bỏ dấu tiếng Việt + viết thường rồi so:
 *      · từ khoá 1 chữ (vd "toi", "nho") → khớp khi nhãn có ĐÚNG token đó (tránh "ghee"≠"hẹ").
 *      · từ khoá nhiều chữ (vd "so co la") → khớp khi xuất hiện trong chuỗi.
 *    Viết có dấu hay không đều được (matcher tự bỏ dấu). Nên thêm cả tiếng Anh lẫn tiếng Việt.
 *  - `species`: "both" = cảnh báo cho cả chó & mèo · "cat" = CHỈ cảnh báo khi bé là MÈO.
 *  - `severity`: "fatal"|"severe" → box ĐỎ ("NGUY HIỂM…") · "caution" → box VÀNG ("CẦN THẬN TRỌNG").
 *
 * TRUNG THỰC: bảng này KHÔNG phải "vet-approved" như danger_kb (Baserow) — là danh sách khởi điểm
 * do đội VowVet nạp. Box hiển thị ghi rõ "dựa trên thành phần đọc được từ nhãn", KHÔNG mạo nhận BS duyệt.
 */

export interface ToxicFlag {
  /** Tên chất hiển thị trên box cảnh báo. */
  label: string;
  /** Từ khoá nhận diện trên nhãn (tiếng Việt/Anh, có dấu hay không đều được). */
  kw: string[];
  /** "both" = chó+mèo · "cat" = chỉ cảnh báo khi bé là mèo. */
  species: "both" | "cat";
  /** "fatal"|"severe" → đỏ · "caution" → vàng. */
  severity: "fatal" | "severe" | "caution";
  /** Cơ chế độc — 1 câu dễ hiểu. */
  reason: string;
  /** Người nuôi nên làm gì. */
  action: string;
}

export interface PraiseFlag {
  /** Tên thành phần hiển thị (in đậm). */
  label: string;
  /** Từ khoá nhận diện trên nhãn. */
  kw: string[];
  /** Mô tả lợi ích — giọng AN TOÀN, KHÔNG dùng "đặc trị"/"chữa". */
  plain: string;
}

// ============================================================
// (4) BẢNG ĐỘC CHẤT — trúng thì hiện box đỏ + ép điểm về sàn
// ============================================================
export const TOXIC_FLAGS: ToxicFlag[] = [
  // --- CHUNG (chó + mèo) ---
  {
    label: "Sô-cô-la / Theobromine",
    kw: ["chocolate", "socola", "so co la", "cacao", "ca cao", "cocoa", "theobromine"],
    species: "both",
    severity: "severe",
    reason: "Theobromine trong sô-cô-la gây ngộ độc tim mạch và thần kinh ở chó mèo.",
    action: "Không cho bé ăn. Nếu bé đã ăn, liên hệ bác sĩ thú y ngay.",
  },
  {
    label: "Hành / Tỏi / Hẹ (Allium)",
    kw: ["hanh", "toi", "he", "cu nen", "hành", "tỏi", "onion", "garlic", "chive", "leek", "scallion", "allium"],
    species: "both",
    severity: "severe",
    reason: "Nhóm hành tỏi (Allium) phá huỷ hồng cầu, gây thiếu máu ở chó mèo — mèo nhạy hơn.",
    action: "Tránh sản phẩm có thành phần này. Hỏi bác sĩ thú y nếu bé đã dùng.",
  },
  {
    label: "Nho / Nho khô",
    kw: ["nho kho", "nho tuoi", "raisin", "grape"],
    species: "both",
    severity: "severe",
    reason: "Nho và nho khô có thể gây suy thận cấp ở chó (cơ chế chưa rõ hoàn toàn).",
    action: "Không cho bé ăn. Nếu lỡ ăn, đưa bé đi gặp bác sĩ thú y sớm.",
  },
  {
    label: "Xylitol",
    kw: ["xylitol"],
    species: "both",
    severity: "fatal",
    reason: "Xylitol gây tụt đường huyết nhanh và tổn thương gan, có thể tử vong.",
    action: "Tuyệt đối không cho bé dùng. Nghi ngờ đã ăn → cấp cứu thú y ngay.",
  },
  {
    label: "Cồn / Rượu",
    kw: ["alcohol", "ethanol", "ruou", "rượu"],
    species: "both",
    severity: "severe",
    reason: "Cồn gây ngộ độc thần kinh, hạ thân nhiệt và đường huyết ở chó mèo.",
    action: "Không cho bé tiếp xúc. Hỏi bác sĩ thú y nếu nghi ngờ.",
  },
  {
    label: "Caffeine",
    kw: ["caffeine", "cafein", "ca phe", "coffee", "guarana"],
    species: "both",
    severity: "severe",
    reason: "Caffeine kích thích tim và thần kinh quá mức, nguy hiểm cho chó mèo.",
    action: "Tránh sản phẩm chứa caffeine. Nghi ngờ ngộ độc → gặp bác sĩ thú y.",
  },
  {
    label: "Bột nở / Bột bánh mì sống",
    kw: ["bot no", "men banh mi", "bread dough", "raw dough", "baking yeast"],
    species: "both",
    severity: "caution",
    reason: "Bột bánh sống lên men trong dạ dày, sinh hơi và cồn — gây chướng bụng, ngộ độc.",
    action: "Không cho bé ăn bột bánh sống.",
  },
  {
    label: "Hạt Macadamia",
    kw: ["macadamia", "hat macca", "macca"],
    species: "both",
    severity: "caution",
    reason: "Macadamia gây yếu chi sau, run rẩy, sốt ở chó.",
    action: "Tránh cho bé ăn hạt macadamia.",
  },

  // --- RIÊNG MÈO (chỉ cảnh báo khi bé là mèo) ---
  {
    label: "Permethrin / Pyrethroid",
    kw: ["permethrin", "pyrethrin", "pyrethroid", "permethrine"],
    species: "cat",
    severity: "fatal",
    reason: "Permethrin (thường trong thuốc trị ve rận cho CHÓ) cực độc với mèo — co giật, tử vong.",
    action: "Tuyệt đối không dùng cho mèo. Nghi ngờ phơi nhiễm → cấp cứu thú y ngay.",
  },
  {
    label: "Paracetamol / Acetaminophen",
    kw: ["paracetamol", "acetaminophen", "panadol", "tylenol", "efferalgan", "hapacol"],
    species: "cat",
    severity: "fatal",
    reason: "Mèo không chuyển hoá được paracetamol — gây tổn thương máu và gan, dễ tử vong.",
    action: "Không bao giờ cho mèo dùng thuốc của người. Nghi ngờ → cấp cứu thú y ngay.",
  },
  {
    label: "Ibuprofen",
    kw: ["ibuprofen", "advil", "brufen", "mofen"],
    species: "cat",
    severity: "severe",
    reason: "Ibuprofen gây loét dạ dày và suy thận ở mèo, ngưỡng độc rất thấp.",
    action: "Không cho mèo dùng. Hỏi bác sĩ thú y nếu lỡ dùng.",
  },
  {
    label: "Aspirin",
    kw: ["aspirin", "acetylsalicylic", "acid acetylsalicylic"],
    species: "cat",
    severity: "severe",
    reason: "Mèo đào thải aspirin rất chậm, dễ tích luỹ gây ngộ độc.",
    action: "Chỉ dùng khi bác sĩ thú y kê — không tự cho mèo dùng.",
  },
  {
    label: "Tinh dầu / Terpenes",
    kw: ["tinh dau", "essential oil", "terpene", "tea tree", "tram tra", "bac ha", "peppermint", "eucalyptus", "khuynh diep", "tinh dau quy"],
    species: "cat",
    severity: "severe",
    reason: "Mèo thiếu men chuyển hoá nhiều loại tinh dầu (tràm trà, bạc hà…) — dễ ngộ độc qua da/hô hấp.",
    action: "Tránh dùng tinh dầu quanh mèo. Hỏi bác sĩ thú y nếu nghi ngờ.",
  },
  {
    label: "Hoa Lily (Loa kèn)",
    kw: ["hoa lily", "loa ken", "lilium", "hoa loa ken", "lily"],
    species: "cat",
    severity: "fatal",
    reason: "Mọi phần của hoa lily đều gây suy thận cấp ở mèo, kể cả phấn hoa.",
    action: "Không để mèo tiếp xúc hoa lily. Nghi ngờ ăn phải → cấp cứu thú y ngay.",
  },
];

// ============================================================
// (3) BẢNG CÂU-KHEN THÀNH PHẦN — chỉ nhấn thành phần CÓ ở đây (không tự khen)
// ============================================================
export const PRAISE_FLAGS: PraiseFlag[] = [
  {
    label: "S. boulardii",
    kw: ["boulardii", "s.boulardii", "s boulardii", "saccharomyces boulardii", "saccharomyces"],
    // ⚠️ Wording an toàn — Duy/BS điền câu chuẩn sau. KHÔNG dùng "đặc trị".
    plain: "lợi khuẩn hỗ trợ tiêu hóa",
  },
];

// ============================================================
// (1) RUBRIC CHẤM ĐIỂM — chỉ trừ theo lý do KIỂM CHỨNG ĐƯỢC từ nhãn + hồ sơ
//      Các số ở đây Duy/BS chỉnh thoải mái (đơn vị: điểm trừ, đều âm).
// ============================================================
export interface ScoreRubric {
  speciesMismatch: number; // nhãn ghi cho chó nhưng bé là mèo (hoặc ngược lại)
  lifeStageMismatch: number; // nhãn kitten/adult/senior ≠ giai đoạn bé
  allergenMatch: number; // nhãn có chất bé đã khai dị ứng
  toxic: number; // (dự phòng) trừ khi dính độc nếu KHÔNG ép sàn — xem toxicForcesFloor
  looseForm: number; // dạng bột rời, khó kiểm soát liều
  missingInfo: number; // nhãn không ghi liều/đối tượng dùng
  floor: number; // điểm SÀN, không xuống dưới mức này
  /** true = dính bảng độc thì ép thẳng điểm về `floor` (thay vì chỉ trừ `toxic`). */
  toxicForcesFloor: boolean;
  /** Từ khoá nhận diện "dạng bột rời/sang chiết" (cho looseForm). */
  looseFormKw: string[];
}

export const SCORE_RUBRIC: ScoreRubric = {
  speciesMismatch: -3,
  lifeStageMismatch: -2,
  allergenMatch: -3,
  toxic: -4,
  looseForm: -1,
  missingInfo: -1,
  floor: 1,
  toxicForcesFloor: true, // chất độc → điểm về 1 luôn (6/10 mà dính độc là phản trực giác)
  looseFormKw: ["powder", "dang bot", "bot pha", "bot roi", "sang chiet"],
};
