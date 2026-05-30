/**
 * VN ↔ EN mapping cho Baserow select fields.
 *
 * Lý do tách: Baserow setup script (scripts/setup-baserow.ts) đã tạo options
 * bằng English ("dog", "cat", "male", "female"), trong khi UI + API contract
 * dùng tiếng Việt cho UX. Mapper chỉ áp dụng tại boundary API ↔ Baserow.
 *
 * Phase 0 không hỗ trợ "Khác" (species) và "Không rõ" (gender) vì Baserow
 * chưa có option tương ứng. UI dropdown chỉ show Chó/Mèo và Đực/Cái.
 */

// ===== Species =====
const SPECIES_VI_TO_EN: Record<string, string> = {
  "Chó": "dog",
  "Mèo": "cat",
};

const SPECIES_EN_TO_VI: Record<string, string> = {
  dog: "Chó",
  cat: "Mèo",
};

export function speciesViToEn(vi: string): string {
  const en = SPECIES_VI_TO_EN[vi];
  if (!en) throw new Error(`Loài "${vi}" không được hỗ trợ. Chỉ chấp nhận: Chó, Mèo`);
  return en;
}

export function speciesEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return SPECIES_EN_TO_VI[en] || en;
}

// ===== Gender =====
const GENDER_VI_TO_EN: Record<string, string> = {
  "Đực": "male",
  "Cái": "female",
};

const GENDER_EN_TO_VI: Record<string, string> = {
  male: "Đực",
  female: "Cái",
  male_neutered: "Đực (đã thiến)",
  female_neutered: "Cái (đã thiến)",
};

export function genderViToEn(vi: string | null | undefined): string | null {
  if (!vi) return null;
  return GENDER_VI_TO_EN[vi] || null;
}

export function genderEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return GENDER_EN_TO_VI[en] || null;
}

// ===== Stool quality (sau migration M4) =====
const STOOL_EN_TO_VI: Record<string, string> = {
  normal: "Bình thường",
  soft: "Mềm",
  liquid: "Lỏng",
  hard: "Cứng",
  none: "Không có",
};
const STOOL_VI_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(STOOL_EN_TO_VI).map(([k, v]) => [v, k])
);
const STOOL_VALID_EN = new Set(Object.keys(STOOL_EN_TO_VI));

export function stoolEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return STOOL_EN_TO_VI[en] || null;
}
export function isValidStoolEn(en: string): boolean {
  return STOOL_VALID_EN.has(en);
}

// ===== Symptoms (multi_select sau migration M4) =====
const SYMPTOMS_EN_TO_VI: Record<string, string> = {
  vomit: "Nôn",
  cough: "Ho",
  sneeze: "Hắt hơi",
  itch: "Ngứa",
  limp: "Đi khập khiễng",
  other: "Khác",
};
const SYMPTOMS_VALID_EN = new Set(Object.keys(SYMPTOMS_EN_TO_VI));

export function symptomEnToVi(en: string): string {
  return SYMPTOMS_EN_TO_VI[en] || en;
}
export function symptomsEnToVi(arr: string[] | null | undefined): string[] {
  return (arr || []).map(symptomEnToVi);
}
export function isValidSymptomEn(en: string): boolean {
  return SYMPTOMS_VALID_EN.has(en);
}
export const ALL_SYMPTOMS_EN = Object.keys(SYMPTOMS_EN_TO_VI);

// ===== Urgency (5 levels EN cho care_plans sau migration M4) =====
const URGENCY_EN_TO_VI: Record<string, string> = {
  normal: "Khoẻ mạnh",
  monitor: "Cần theo dõi",
  consult: "Nên hỏi bác sĩ",
  urgent: "Cần khám gấp",
  emergency: "CẤP CỨU",
};

export function urgencyEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return URGENCY_EN_TO_VI[en] || null;
}

// ===== Health resources (M3.5) =====

// vaccines.vaccine_type — Baserow có 6 options, frontend hiển thị nhãn VN
export const VACCINE_TYPE_EN_TO_VI: Record<string, string> = {
  "5-in-1": "5 trong 1 (DHPPL chó)",
  "7-in-1": "7 trong 1 (chó)",
  "rabies": "Dại",
  "feline-3": "3 trong 1 (FVRCP - mèo)",
  "feline-4": "4 trong 1 (FVRCP+ - mèo)",
  "felv": "FeLV (Bạch cầu - mèo)",
};
export const VACCINE_OPTIONS_DOG = ["5-in-1", "7-in-1", "rabies"];
export const VACCINE_OPTIONS_CAT = ["feline-3", "feline-4", "felv", "rabies"];

export function vaccineTypeEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return VACCINE_TYPE_EN_TO_VI[en] || en;
}

// ===== M6: vaccine_code (15 options) ↔ VN label =====
export const VACCINE_CODE_EN_TO_VI: Record<string, string> = {
  parvo: "Parvo",
  distemper: "Care (Distemper)",
  dhppl_5in1: "5 trong 1 (DHPPL)",
  dhppl_7in1: "7 trong 1 (DHPPL+)",
  rabies: "Dại (chó)",
  rabies_cat: "Dại (mèo)",
  lepto: "Leptospirosis",
  bordetella: "Bordetella (Ho cũi)",
  corona: "Corona",
  fvrcp: "FVRCP (3 trong 1)",
  calicivirus: "Calicivirus",
  rhinotracheitis: "Rhinotracheitis",
  panleukopenia: "Panleukopenia",
  felv: "FeLV (Bạch cầu mèo)",
  fiv: "FIV (Suy giảm miễn dịch)",
};

export function vaccineCodeEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return VACCINE_CODE_EN_TO_VI[en] || en;
}

/** Map legacy vaccine_type → new vaccine_code (M6 backfill compat). */
export function vaccineTypeToCode(
  vaccineType: string | null | undefined,
  species: string | null | undefined
): string | null {
  if (!vaccineType) return null;
  const sp = species?.toLowerCase();
  switch (vaccineType) {
    case "5-in-1":
      return "dhppl_5in1";
    case "7-in-1":
      return "dhppl_7in1";
    case "rabies":
      return sp === "cat" ? "rabies_cat" : "rabies";
    case "feline-3":
    case "feline-4":
      return "fvrcp";
    case "felv":
      return "felv";
    default:
      return null;
  }
}

// dewormers.type
export const DEWORMER_TYPE_EN_TO_VI: Record<string, string> = {
  internal: "Nội ký sinh",
  external: "Ngoại ký sinh",
  both: "Cả hai",
};
export function dewormerTypeEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return DEWORMER_TYPE_EN_TO_VI[en] || en;
}

// allergies_diet.type
export const ALLERGY_TYPE_EN_TO_VI: Record<string, string> = {
  allergy: "Dị ứng",
  dislike: "Không thích",
  loves: "Yêu thích",
  forbidden: "Cấm",
};
export function allergyTypeEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return ALLERGY_TYPE_EN_TO_VI[en] || en;
}

// allergies_diet.severity
export const ALLERGY_SEVERITY_EN_TO_VI: Record<string, string> = {
  mild: "Nhẹ",
  moderate: "Trung bình",
  severe: "Nặng",
};
export function allergySeverityEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return ALLERGY_SEVERITY_EN_TO_VI[en] || en;
}

// health_events.event_type
export const HEALTH_EVENT_EN_TO_VI: Record<string, string> = {
  illness: "Bệnh",
  injury: "Tai nạn / Chấn thương",
  vet_visit: "Khám",
  surgery: "Phẫu thuật",
  medication: "Tiêm / Thuốc",
};
export function healthEventTypeEnToVi(en: string | null | undefined): string | null {
  if (!en) return null;
  return HEALTH_EVENT_EN_TO_VI[en] || en;
}
