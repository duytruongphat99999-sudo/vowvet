/**
 * Allergen VN ↔ EN normalize (M7).
 *
 * Pet allergies (M3.5 allergies_diet.item) là free-text tiếng Việt do user nhập.
 * Brand contains_allergens là array EN standardized: chicken/beef/fish/dairy/egg/soy/grain/shellfish/peanut.
 *
 * Allergy guard cần match: normalize VN input → EN code → compare.
 */

export type AllergenCode =
  | "chicken"
  | "beef"
  | "fish"
  | "dairy"
  | "egg"
  | "soy"
  | "grain"
  | "shellfish"
  | "peanut";

export const ALLERGEN_CODES: AllergenCode[] = [
  "chicken",
  "beef",
  "fish",
  "dairy",
  "egg",
  "soy",
  "grain",
  "shellfish",
  "peanut",
];

/**
 * Map từ keyword (VN hoặc EN) → standardized code. Word-boundary match.
 * Dùng lookaround Unicode `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])` + cờ /iu (KHÔNG `\b`):
 * `\b` không có /u coi ký tự có dấu (à, đ…) là non-word → token tiếng Việt CÓ DẤU
 * ("gà"/"cá"/"đậu nành") không khớp. Lookaround Unicode coi mọi chữ-cái là word-char nên khớp đúng.
 * THỨ TỰ QUAN TRỌNG: dairy ĐẶT TRƯỚC beef để "sữa bò" → dairy (không bị từ "bò" nuốt).
 */
const KEYWORD_TO_CODE: Array<[RegExp, AllergenCode]> = [
  // chicken
  [/(?<![\p{L}\p{N}_])(gà|thịt gà|chicken)(?![\p{L}\p{N}_])/iu, "chicken"],
  // fish (include common VN fish names)
  [/(?<![\p{L}\p{N}_])(cá ngừ|cá hồi|cá thu|cá biển|cá nục|cá|fish|tuna|salmon)(?![\p{L}\p{N}_])/iu, "fish"],
  // dairy — trước beef (xem ghi chú thứ tự ở trên)
  [/(?<![\p{L}\p{N}_])(sữa bò|sữa tươi|sữa|phô mai|milk|dairy|cheese|lactose)(?![\p{L}\p{N}_])/iu, "dairy"],
  // beef
  [/(?<![\p{L}\p{N}_])(bò|thịt bò|beef)(?![\p{L}\p{N}_])/iu, "beef"],
  // egg
  [/(?<![\p{L}\p{N}_])(trứng|egg)(?![\p{L}\p{N}_])/iu, "egg"],
  // soy
  [/(?<![\p{L}\p{N}_])(đậu nành|đậu hũ|tofu|soy|soya)(?![\p{L}\p{N}_])/iu, "soy"],
  // grain
  [/(?<![\p{L}\p{N}_])(ngũ cốc|lúa mì|yến mạch|wheat|grain|oat|corn|ngô|gluten)(?![\p{L}\p{N}_])/iu, "grain"],
  // shellfish
  [/(?<![\p{L}\p{N}_])(tôm|cua|ghẹ|nghêu|shellfish|shrimp|crab)(?![\p{L}\p{N}_])/iu, "shellfish"],
  // peanut
  [/(?<![\p{L}\p{N}_])(đậu phộng|lạc|peanut)(?![\p{L}\p{N}_])/iu, "peanut"],
];

/**
 * Normalize 1 allergen string sang code chuẩn EN.
 * Trả null nếu không match (caller có thể lưu raw text).
 *
 * normalizeAllergen("Cá ngừ đóng hộp")  → "fish"
 * normalizeAllergen("Thịt gà")           → "chicken"
 * normalizeAllergen("Chicken breast")     → "chicken"
 * normalizeAllergen("Sữa bò")             → "dairy"
 * normalizeAllergen("Cá biển")           → "fish"
 * normalizeAllergen("Random food")        → null
 */
export function normalizeAllergen(input: string | null | undefined): AllergenCode | null {
  if (!input) return null;
  const text = input.trim();
  if (!text) return null;
  for (const [pattern, code] of KEYWORD_TO_CODE) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/** Normalize 1 array các allergen string → array of unique codes. */
export function normalizeAllergens(inputs: Array<string | null | undefined>): AllergenCode[] {
  const codes = new Set<AllergenCode>();
  for (const it of inputs) {
    const c = normalizeAllergen(it);
    if (c) codes.add(c);
  }
  return [...codes];
}

/** VN label hiển thị từ code. */
export const ALLERGEN_LABEL_VI: Record<AllergenCode, string> = {
  chicken: "Gà",
  beef: "Bò",
  fish: "Cá",
  dairy: "Sữa & sản phẩm sữa",
  egg: "Trứng",
  soy: "Đậu nành",
  grain: "Ngũ cốc",
  shellfish: "Hải sản (tôm/cua)",
  peanut: "Đậu phộng",
};

export function allergenLabelVi(code: string | null | undefined): string {
  if (!code) return "—";
  return ALLERGEN_LABEL_VI[code as AllergenCode] || code;
}
