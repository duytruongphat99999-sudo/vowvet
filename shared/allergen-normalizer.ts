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

/** Map từ keyword (VN hoặc EN) → standardized code. Case-insensitive substring match. */
const KEYWORD_TO_CODE: Array<[RegExp, AllergenCode]> = [
  // chicken
  [/\b(gà|thịt gà|chicken)\b/i, "chicken"],
  // beef
  [/\b(bò|thịt bò|beef)\b/i, "beef"],
  // fish (include common VN fish names)
  [/\b(cá ngừ|cá hồi|cá thu|cá biển|cá nục|cá|fish|tuna|salmon)\b/i, "fish"],
  // dairy
  [/\b(sữa bò|sữa tươi|sữa|phô mai|milk|dairy|cheese|lactose)\b/i, "dairy"],
  // egg
  [/\b(trứng|egg)\b/i, "egg"],
  // soy
  [/\b(đậu nành|đậu hũ|tofu|soy)\b/i, "soy"],
  // grain
  [/\b(ngũ cốc|lúa mì|yến mạch|wheat|grain|oat|corn|ngô)\b/i, "grain"],
  // shellfish
  [/\b(tôm|cua|ghẹ|nghêu|shellfish|shrimp|crab)\b/i, "shellfish"],
  // peanut
  [/\b(đậu phộng|lạc|peanut)\b/i, "peanut"],
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
