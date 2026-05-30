/**
 * Triage symptom library (M9.1).
 *
 * Hardcoded TS const (giống forbidden-foods-vn.ts pattern) — vet edit thẳng file
 * + git commit, KHÔNG cần migration. Đủ cho Phase 0 pilot (10-15 clinics).
 *
 * Schema:
 *   - id: string slug — stable identifier (lưu vào triage_sessions.symptoms_json)
 *   - name_vi: tên tiếng Việt user thấy
 *   - description_vi: clarify (optional, giúp user chọn đúng)
 *   - category: phân nhóm cho UI step 1
 *   - severity_weight: 1-5 — AI prompt dùng làm hint
 *   - red_flag: true → AI auto force urgency_level ≥ 4 (emergency-bias)
 *   - applies_to: dog/cat/both — UI filter theo loài pet
 *
 * Source: ASPCA + Petriage triage logic + Mon Min clinic experience VN.
 * 60+ symptoms, vet review pre-pilot.
 */

export type SymptomCategory =
  | "digestive"
  | "respiratory"
  | "skin"
  | "neurological"
  | "urinary"
  | "behavioral"
  | "mobility"
  | "ocular_aural"
  | "reproductive"
  | "traumatic"
  | "toxicity";

export interface TriageSymptom {
  id: string;
  name_vi: string;
  description_vi?: string;
  category: SymptomCategory;
  severity_weight: 1 | 2 | 3 | 4 | 5;
  red_flag: boolean;
  applies_to: "dog" | "cat" | "both";
}

export const CATEGORY_LABEL_VI: Record<SymptomCategory, string> = {
  digestive: "🍽️ Tiêu hóa",
  respiratory: "🫁 Hô hấp",
  skin: "🐾 Da & lông",
  neurological: "🧠 Thần kinh",
  urinary: "💧 Tiết niệu",
  behavioral: "😟 Hành vi & toàn thân",
  mobility: "🦴 Vận động",
  ocular_aural: "👁️ Mắt & tai",
  reproductive: "🤰 Sinh sản",
  traumatic: "🚨 Chấn thương",
  toxicity: "☠️ Ngộ độc",
};

export const TRIAGE_SYMPTOMS: TriageSymptom[] = [
  // ============================================================
  // DIGESTIVE (12)
  // ============================================================
  { id: "vomit_once", name_vi: "Nôn 1 lần", description_vi: "Không lặp lại trong 12h", category: "digestive", severity_weight: 1, red_flag: false, applies_to: "both" },
  { id: "vomit_repeated", name_vi: "Nôn 3+ lần trong 24h", category: "digestive", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "vomit_blood", name_vi: "Nôn ra máu", description_vi: "Có vệt máu đỏ tươi hoặc bã cà phê", category: "digestive", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "vomit_foreign", name_vi: "Nôn ra dị vật/đồ chơi", category: "digestive", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "diarrhea_mild", name_vi: "Tiêu chảy nhẹ (1-2 lần)", category: "digestive", severity_weight: 2, red_flag: false, applies_to: "both" },
  { id: "diarrhea_severe", name_vi: "Tiêu chảy nặng (>3 lần/ngày)", category: "digestive", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "diarrhea_blood", name_vi: "Tiêu chảy ra máu", description_vi: "Phân đỏ, đen như hắc ín, hoặc có máu tươi", category: "digestive", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "anorexia_24h", name_vi: "Bỏ ăn 24h", category: "digestive", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "anorexia_48h", name_vi: "Bỏ ăn >48h", category: "digestive", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "bloated_belly", name_vi: "Bụng trướng to bất thường", description_vi: "Đặc biệt chó lớn → có thể xoắn dạ dày (GDV)", category: "digestive", severity_weight: 5, red_flag: true, applies_to: "dog" },
  { id: "drooling_excess", name_vi: "Chảy dãi nhiều bất thường", category: "digestive", severity_weight: 2, red_flag: false, applies_to: "both" },
  { id: "swallowed_object", name_vi: "Nuốt phải dị vật (xương, kim, dây)", category: "digestive", severity_weight: 5, red_flag: true, applies_to: "both" },

  // ============================================================
  // RESPIRATORY (8)
  // ============================================================
  { id: "dyspnea", name_vi: "Khó thở / thở gấp", description_vi: "Há mồm thở, nướu xanh tím", category: "respiratory", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "cough_mild", name_vi: "Ho nhẹ thỉnh thoảng", category: "respiratory", severity_weight: 1, red_flag: false, applies_to: "both" },
  { id: "cough_severe", name_vi: "Ho liên tục / ho ra dịch", category: "respiratory", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "wheezing", name_vi: "Thở khò khè / thở rít", category: "respiratory", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "nasal_discharge", name_vi: "Chảy nước mũi / mũi có dịch", category: "respiratory", severity_weight: 2, red_flag: false, applies_to: "both" },
  { id: "heatstroke_signs", name_vi: "Dấu hiệu sốc nhiệt (thở dốc, nướu đỏ tươi, lả người)", category: "respiratory", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "blue_gums", name_vi: "Nướu/lưỡi tím xanh (cyanosis)", category: "respiratory", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "choking", name_vi: "Nghi bị nghẹn / cào miệng liên tục", category: "respiratory", severity_weight: 5, red_flag: true, applies_to: "both" },

  // ============================================================
  // SKIN (7)
  // ============================================================
  { id: "itching_mild", name_vi: "Ngứa nhẹ (gãi thỉnh thoảng)", category: "skin", severity_weight: 1, red_flag: false, applies_to: "both" },
  { id: "itching_severe", name_vi: "Ngứa dữ dội (gãi đến trầy da)", category: "skin", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "skin_redness", name_vi: "Da mẩn đỏ / phát ban", category: "skin", severity_weight: 2, red_flag: false, applies_to: "both" },
  { id: "hair_loss", name_vi: "Rụng lông nhiều bất thường", category: "skin", severity_weight: 2, red_flag: false, applies_to: "both" },
  { id: "open_wound", name_vi: "Vết thương hở / đang chảy máu", category: "skin", severity_weight: 4, red_flag: false, applies_to: "both" },
  { id: "abscess_lump", name_vi: "Khối u/cục mới xuất hiện, sưng đau", category: "skin", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "hives_swelling", name_vi: "Nổi mề đay / sưng mặt đột ngột", description_vi: "Có thể phản vệ (anaphylaxis)", category: "skin", severity_weight: 4, red_flag: true, applies_to: "both" },

  // ============================================================
  // NEUROLOGICAL (7)
  // ============================================================
  { id: "seizure", name_vi: "Co giật (động kinh)", category: "neurological", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "unconscious", name_vi: "Mất ý thức / không phản ứng", category: "neurological", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "loss_balance", name_vi: "Mất thăng bằng / đi vòng tròn", category: "neurological", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "head_tilt", name_vi: "Nghiêng đầu sang một bên", category: "neurological", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "tremor", name_vi: "Run rẩy không tự chủ", category: "neurological", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "paralysis", name_vi: "Liệt chân (không cử động được)", category: "neurological", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "disorientation", name_vi: "Lờ đờ, không nhận ra chủ", category: "neurological", severity_weight: 4, red_flag: true, applies_to: "both" },

  // ============================================================
  // URINARY (6)
  // ============================================================
  { id: "no_urine_24h", name_vi: "Không tiểu được >24h", description_vi: "Đặc biệt mèo đực — có thể tắc niệu đạo", category: "urinary", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "urine_blood", name_vi: "Tiểu ra máu", category: "urinary", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "urinary_pain", name_vi: "Rặn tiểu / kêu khi tiểu", category: "urinary", severity_weight: 4, red_flag: false, applies_to: "both" },
  { id: "frequent_urination", name_vi: "Tiểu nhiều lần, lượng ít", category: "urinary", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "urine_inappropriate", name_vi: "Tiểu bừa bãi (không trong khay/đúng chỗ)", category: "urinary", severity_weight: 2, red_flag: false, applies_to: "cat" },
  { id: "increased_thirst", name_vi: "Uống nước nhiều bất thường", category: "urinary", severity_weight: 2, red_flag: false, applies_to: "both" },

  // ============================================================
  // BEHAVIORAL (6)
  // ============================================================
  { id: "lethargy_severe", name_vi: "Lờ đờ nặng / không đứng dậy", category: "behavioral", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "lethargy_mild", name_vi: "Ít hoạt động hơn bình thường", category: "behavioral", severity_weight: 2, red_flag: false, applies_to: "both" },
  { id: "hiding_unusual", name_vi: "Trốn / lẩn tránh bất thường", description_vi: "Mèo đặc biệt — có thể đau", category: "behavioral", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "aggression_new", name_vi: "Hung dữ đột ngột", category: "behavioral", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "no_water_24h", name_vi: "Bỏ uống nước >24h", category: "behavioral", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "vocalize_pain", name_vi: "Kêu rên đau bất thường", category: "behavioral", severity_weight: 3, red_flag: false, applies_to: "both" },

  // ============================================================
  // MOBILITY (5)
  // ============================================================
  { id: "limping_mild", name_vi: "Khập khiễng nhẹ", category: "mobility", severity_weight: 2, red_flag: false, applies_to: "both" },
  { id: "limping_severe", name_vi: "Khập khiễng nặng / không dùng chân", category: "mobility", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "cant_stand", name_vi: "Không đứng dậy được", category: "mobility", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "joint_swelling", name_vi: "Sưng/đau khớp", category: "mobility", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "stiff_movement", name_vi: "Cứng cơ, đi đứng cứng đờ", category: "mobility", severity_weight: 3, red_flag: false, applies_to: "both" },

  // ============================================================
  // OCULAR + AURAL (6)
  // ============================================================
  { id: "eye_red", name_vi: "Mắt đỏ / sưng", category: "ocular_aural", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "eye_discharge", name_vi: "Chảy mủ/dịch từ mắt", category: "ocular_aural", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "eye_pawing", name_vi: "Dụi mắt liên tục / không mở mắt", category: "ocular_aural", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "eye_cloudy", name_vi: "Mắt đục bất thường", category: "ocular_aural", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "ear_discharge", name_vi: "Tai có mủ / mùi hôi", category: "ocular_aural", severity_weight: 3, red_flag: false, applies_to: "both" },
  { id: "ear_pain", name_vi: "Lắc đầu nhiều / kêu khi sờ tai", category: "ocular_aural", severity_weight: 2, red_flag: false, applies_to: "both" },

  // ============================================================
  // REPRODUCTIVE (5)
  // ============================================================
  { id: "pyometra_signs", name_vi: "Chảy mủ từ âm hộ (cái chưa triệt sản)", description_vi: "Pyometra — viêm tử cung, cấp cứu", category: "reproductive", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "difficulty_birth", name_vi: "Đẻ khó / rặn lâu không ra con", category: "reproductive", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "miscarriage", name_vi: "Nghi sảy thai (chảy máu, dịch lạ)", category: "reproductive", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "scrotum_swelling", name_vi: "Tinh hoàn/bìu sưng (đực)", category: "reproductive", severity_weight: 4, red_flag: false, applies_to: "both" },
  { id: "post_birth_no_milk", name_vi: "Mẹ sau sinh không có sữa / không cho bú", category: "reproductive", severity_weight: 3, red_flag: false, applies_to: "both" },

  // ============================================================
  // TRAUMATIC (5)
  // ============================================================
  { id: "hit_by_vehicle", name_vi: "Bị xe đâm / va chạm mạnh", description_vi: "Dù trông không sao — chấn thương nội tạng có thể delay", category: "traumatic", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "fall_height", name_vi: "Ngã từ độ cao >2m", category: "traumatic", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "bite_wound", name_vi: "Vết cắn lớn từ động vật khác", category: "traumatic", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "burn_wound", name_vi: "Bỏng (lửa, dầu, hóa chất)", category: "traumatic", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "bleeding_uncontrolled", name_vi: "Chảy máu không cầm sau 5 phút", category: "traumatic", severity_weight: 5, red_flag: true, applies_to: "both" },

  // ============================================================
  // TOXICITY (5)
  // ============================================================
  { id: "ate_chocolate", name_vi: "Nghi ăn chocolate / cacao", category: "toxicity", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "ate_grapes", name_vi: "Nghi ăn nho / nho khô", category: "toxicity", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "ate_onion_garlic", name_vi: "Nghi ăn hành / tỏi (số lượng lớn)", category: "toxicity", severity_weight: 4, red_flag: true, applies_to: "both" },
  { id: "ate_medication", name_vi: "Nghi ăn thuốc người (paracetamol, ibuprofen, etc.)", category: "toxicity", severity_weight: 5, red_flag: true, applies_to: "both" },
  { id: "ate_rodenticide", name_vi: "Nghi ăn thuốc diệt chuột / mồi độc", category: "toxicity", severity_weight: 5, red_flag: true, applies_to: "both" },
];

// ============================================================
// Helper functions
// ============================================================

/** Trả list symptom filter theo species + category. */
export function listSymptoms(filter?: {
  species?: "dog" | "cat";
  category?: SymptomCategory;
}): TriageSymptom[] {
  return TRIAGE_SYMPTOMS.filter((s) => {
    if (filter?.species && s.applies_to !== "both" && s.applies_to !== filter.species) return false;
    if (filter?.category && s.category !== filter.category) return false;
    return true;
  });
}

/** Lookup symptom theo id. */
export function getSymptom(id: string): TriageSymptom | null {
  return TRIAGE_SYMPTOMS.find((s) => s.id === id) || null;
}

/** Validate array ID — trả list invalid IDs nếu có. */
export function validateSymptomIds(ids: string[]): { valid: TriageSymptom[]; invalid: string[] } {
  const valid: TriageSymptom[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    const s = getSymptom(id);
    if (s) valid.push(s);
    else invalid.push(id);
  }
  return { valid, invalid };
}

/** Có triệu chứng nào red_flag? */
export function hasRedFlag(symptoms: TriageSymptom[]): boolean {
  return symptoms.some((s) => s.red_flag);
}

/** Tổng severity score (max severity_weight trong selection). */
export function maxSeverity(symptoms: TriageSymptom[]): number {
  if (symptoms.length === 0) return 0;
  return Math.max(...symptoms.map((s) => s.severity_weight));
}
