/**
 * Đợt 2a — Bệnh sử y khoa của bé (single source of truth cho web + api).
 *
 * health_conditions lưu trong Baserow (pets.health_conditions, Long text) dạng JSON:
 *   PetHealthCondition[] = [{ code, status, since }]
 * Tầng (tier) KHÔNG lưu trong Baserow — suy từ code qua HEALTH_CONDITIONS ở đây.
 * Đợt 2b/3 đọc tier để dẫn luồng dinh dưỡng (1 đổi công thức · 2 đổi kết cấu · 3 cảnh báo bác sĩ).
 */

export type ConditionTier = 1 | 2 | 3;
export type ConditionStatus = "active" | "managed" | "resolved";

export interface HealthConditionDef {
  code: string;
  label: string;          // nhãn tiếng Việt hiển thị
  tier: ConditionTier;
  catOnly?: boolean;      // chỉ áp dụng cho mèo (vd sỏi tiết niệu)
}

/** Item lưu per-pet trong JSON array. `since` = "YYYY-MM" hoặc null. */
export interface PetHealthCondition {
  code: string;
  status: ConditionStatus;
  since: string | null;
}

/** 18 tình trạng × 3 tầng tác động. */
export const HEALTH_CONDITIONS: HealthConditionDef[] = [
  // ── TẦNG 1 — đổi CÔNG THỨC dinh dưỡng ──
  { code: "kidney_ckd",          label: "Thận / Suy thận (CKD)",        tier: 1 },
  { code: "diabetes_endocrine",  label: "Tiểu đường / Nội tiết",         tier: 1 },
  { code: "liver_biliary",       label: "Gan mật",                       tier: 1 },
  { code: "gi_ibd",              label: "Tiêu hóa / IBD",                tier: 1 },
  { code: "cardiac",             label: "Tim mạch",                      tier: 1 },
  { code: "urinary_stones",      label: "Tiết niệu / Sỏi",               tier: 1, catOnly: true },
  { code: "obesity_weightloss",  label: "Béo phì / Cần giảm cân",        tier: 1 },
  { code: "skin_allergy",        label: "Da liễu / Dị ứng da",           tier: 1 },
  { code: "musculoskeletal",     label: "Cơ xương khớp",                 tier: 1 },
  { code: "pregnancy_lactation", label: "Mang thai / Cho bú",            tier: 1 },
  // ── TẦNG 2 — đổi KẾT CẤU / cách cho ăn (cùng kcal, khác dạng) ──
  { code: "dental_loss",         label: "Gãy / Mất răng",                tier: 2 },
  { code: "post_surgery",        label: "Hậu phẫu / Hồi phục",           tier: 2 },
  { code: "senior_chewing",      label: "Lớn tuổi yếu nhai",             tier: 2 },
  { code: "dysphagia",           label: "Khó nuốt / Megaesophagus",      tier: 2 },
  // ── TẦNG 3 — HỖ TRỢ + CẢNH BÁO (không tự đổi số, đẩy bác sĩ) ──
  { code: "cancer",              label: "Ung bướu",                      tier: 3 },
  { code: "neuro_seizure",       label: "Thần kinh / Co giật",           tier: 3 },
  { code: "infectious",          label: "Truyền nhiễm (Parvo/Care/FIP)", tier: 3 },
  { code: "severe_debility",     label: "Suy nhược nặng",                tier: 3 },
];

/** Metadata mỗi tầng — `color` là tên semantic, UI map sang class Tailwind. */
export const TIER_META: Record<ConditionTier, { label: string; color: string; desc: string }> = {
  1: { label: "Đổi công thức dinh dưỡng", color: "amber", desc: "Cần điều chỉnh thành phần (đạm/béo/khoáng…) theo bệnh lý." },
  2: { label: "Đổi kết cấu / cách cho ăn", color: "blue",  desc: "Giữ năng lượng, đổi dạng/độ mềm/chia bữa cho dễ ăn." },
  3: { label: "Hỗ trợ & cảnh báo bác sĩ",  color: "red",   desc: "VowVet KHÔNG tự đổi số — ưu tiên hỏi bác sĩ thú y." },
};

export const CONDITION_STATUSES: Array<{ value: ConditionStatus; label: string }> = [
  { value: "active",   label: "Đang mắc / điều trị" },
  { value: "managed",  label: "Đã kiểm soát" },
  { value: "resolved", label: "Đã khỏi" },
];

/** coat_condition (single_select) — code → nhãn VN. */
export const COAT_CONDITIONS: Array<{ value: string; label: string }> = [
  { value: "normal",   label: "Bình thường" },
  { value: "dry",      label: "Khô xơ" },
  { value: "shedding", label: "Rụng nhiều" },
  { value: "oily",     label: "Da nhờn" },
];

/** dental_status (single_select) — code → nhãn VN. */
export const DENTAL_STATUSES: Array<{ value: string; label: string }> = [
  { value: "good",            label: "Tốt" },
  { value: "tartar",          label: "Cao răng" },
  { value: "missing_teeth",   label: "Mất răng" },
  { value: "under_treatment", label: "Đang điều trị" },
];

/** activity_level (single_select có sẵn) — code → nhãn VN. */
export const ACTIVITY_LEVELS: Array<{ value: string; label: string }> = [
  { value: "sedentary",   label: "Ít vận động" },
  { value: "low",         label: "Vận động nhẹ" },
  { value: "moderate",    label: "Bình thường" },
  { value: "active",      label: "Năng động" },
  { value: "very_active", label: "Làm việc / thể thao" },
];

/** life_stage (single_select có sẵn) — code → nhãn VN. Suy tự động từ dob ở UI. */
export const LIFE_STAGES: Array<{ value: string; label: string }> = [
  { value: "puppy",     label: "Sơ sinh / Con non" },
  { value: "junior",    label: "Vị thành niên" },
  { value: "adult",     label: "Trưởng thành" },
  { value: "senior",    label: "Lớn tuổi" },
  { value: "geriatric", label: "Cao niên" },
];

/**
 * TẦNG 1 — gợi ý dinh dưỡng theo bệnh (food-brands: re-rank + banner + lý do card).
 * CHỈ phục vụ XẾP HẠNG / HIỂN THỊ — KHÔNG đổi kcal/gram (số do Đợt 3 duyệt).
 * attr (protein/fat/carb/calories) = thuộc tính brand nên ƯU TIÊN; keywords khớp brand_name/product_line.
 */
export interface ConditionNutrition {
  focus: string;
  keywords: string[];
  protein?: "low" | "high";
  fat?: "low" | "high";
  carb?: "low";
  calories?: "low" | "high";
}
export const CONDITION_NUTRITION: Record<string, ConditionNutrition> = {
  kidney_ckd:          { focus: "đạm vừa-thấp chất lượng cao, phốt-pho thấp", keywords: ["renal", "thận", "kidney", "k/d"], protein: "low" },
  diabetes_endocrine:  { focus: "ít tinh bột, đạm cao", keywords: ["diabetic", "tiểu đường", "glyco"], carb: "low", protein: "high" },
  liver_biliary:       { focus: "đạm dễ hấp thu, ít béo, hỗ trợ gan", keywords: ["hepatic", "gan", "l/d"], fat: "low" },
  gi_ibd:              { focus: "dễ tiêu, ít béo, chất xơ phù hợp", keywords: ["gastro", "digestive", "tiêu hóa", "sensitive", "i/d"], fat: "low" },
  cardiac:             { focus: "ít natri, ít béo, hỗ trợ tim", keywords: ["cardiac", "tim", "c/d"], fat: "low" },
  urinary_stones:      { focus: "kiểm soát khoáng, tăng uống nước (ưu tiên pate)", keywords: ["urinary", "struvite", "tiết niệu", "s/o", "c/d"] },
  obesity_weightloss:  { focus: "ít béo, ít calo, nhiều xơ tạo no", keywords: ["light", "weight", "giảm cân", "metabolic", "satiety", "r/d"], fat: "low", calories: "low" },
  skin_allergy:        { focus: "đạm thủy phân / đạm mới + Omega-3 cho da-lông", keywords: ["hydrolyzed", "thủy phân", "sensitive", "derma", "skin", "novel", "z/d"] },
  musculoskeletal:     { focus: "bổ sung glucosamine/chondroitin, kiểm soát cân", keywords: ["joint", "mobility", "khớp", "j/d", "glucosamine"] },
  pregnancy_lactation: { focus: "năng lượng & đạm cao cho thai kỳ / tiết sữa", keywords: ["puppy", "kitten", "growth", "mang thai", "mẹ"], protein: "high", calories: "high" },
};

/** TẦNG 2 — gợi ý KẾT CẤU / cách cho ăn (chỉ banner; KHÔNG re-rank dinh dưỡng). */
export const CONDITION_TEXTURE: Record<string, string> = {
  dental_loss:    "ưu tiên thức ăn mềm / pate, ngâm mềm hạt, tránh hạt cứng to",
  post_surgery:   "chia nhỏ nhiều bữa, thức ăn dễ tiêu, đảm bảo đủ nước",
  senior_chewing: "hạt nhỏ-mềm hoặc pate, dễ nhai nuốt",
  dysphagia:      "thức ăn dạng sệt / viên nhỏ, cho ăn tư thế cao đầu, chia bữa nhỏ",
};

const _byCode = new Map(HEALTH_CONDITIONS.map((c) => [c.code, c]));

export function getConditionDef(code: string): HealthConditionDef | undefined {
  return _byCode.get(code);
}

export function conditionTier(code: string): ConditionTier | null {
  return _byCode.get(code)?.tier ?? null;
}

/** Parse an toàn giá trị Baserow (JSON string / null / mảng) → PetHealthCondition[] hợp lệ. */
export function parseHealthConditions(raw: unknown): PetHealthCondition[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try { arr = JSON.parse(s); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: PetHealthCondition[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const code = (item as any).code;
    if (typeof code !== "string" || !_byCode.has(code)) continue;
    const status = (item as any).status;
    const since = (item as any).since;
    out.push({
      code,
      status: status === "managed" || status === "resolved" ? status : "active",
      since: typeof since === "string" && /^\d{4}-\d{2}$/.test(since) ? since : null,
    });
  }
  return out;
}
