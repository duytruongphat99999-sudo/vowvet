/**
 * Regression lock cho allergen normalizer (file dính an-toàn-tính-mạng).
 *
 * Bug đã fix (PHƯƠNG ÁN A): `\b` không-/u coi ký tự tiếng Việt CÓ DẤU là non-word
 * → "gà"/"cá"/"đậu nành" trả null (false-negative ở allergy guard). Sửa = lookaround
 * Unicode + cờ /iu. Test khoá lại 3 nhóm: khớp đúng / chống-collision / chống false-positive.
 *
 * Chạy: bun test shared/allergen-normalizer.test.ts
 */
import { test, expect } from "bun:test";
import { normalizeAllergen, normalizeAllergens, ALLERGEN_CODES } from "./allergen-normalizer.ts";

// [name, input, expected]
const CASES: Array<[string, string, string | null]> = [
  // --- VN CÓ DẤU (đây là phần bug cũ trả null) ---
  ["vn gà", "Gà", "chicken"],
  ["vn gà lower", "gà", "chicken"],
  ["vn cá", "Cá", "fish"],
  ["vn bò", "Bò", "beef"],
  ["vn trứng", "Trứng", "egg"],
  ["vn đậu nành", "Đậu nành", "soy"],
  ["vn đậu phộng", "Đậu phộng", "peanut"],
  ["vn ngũ cốc", "Ngũ cốc", "grain"],
  ["vn tôm", "Tôm", "shellfish"],
  ["vn sữa", "Sữa", "dairy"],

  // --- EN ---
  ["en chicken", "chicken", "chicken"],
  ["en beef", "beef", "beef"],
  ["en fish", "fish", "fish"],
  ["en dairy", "dairy", "dairy"],
  ["en egg", "egg", "egg"],
  ["en soy", "soy", "soy"],
  ["en grain", "grain", "grain"],
  ["en shellfish", "shellfish", "shellfish"],
  ["en peanut", "peanut", "peanut"],

  // --- MULTIWORD VN (token nhiều chữ, có dấu) ---
  ["mw thịt gà", "thịt gà", "chicken"],
  ["mw thịt bò", "thịt bò", "beef"],
  ["mw cá ngừ", "cá ngừ", "fish"],
  ["mw cá hồi", "cá hồi", "fish"],
  ["mw đậu hũ", "đậu hũ", "soy"],
  ["mw lúa mì", "lúa mì", "grain"],

  // --- PHRASE THẬT (token allergen nằm trong cụm dài) ---
  ["phrase cá ngừ đóng hộp", "Cá ngừ đóng hộp", "fish"],
  ["phrase sữa bò ít béo", "Sữa bò ít béo", "dairy"],

  // --- VOCAB MỚI (free-safety, trước đây null) ---
  ["new soya", "soya", "soy"],
  ["new gluten", "gluten", "grain"],
  ["new gluten phrase", "chứa gluten", "grain"],

  // --- CHỐNG-COLLISION: "sữa bò" PHẢI là dairy, KHÔNG beef ---
  ["collision sữa bò", "sữa bò", "dairy"],
  ["collision sữa bò cap", "Sữa Bò", "dairy"],

  // --- CHỐNG FALSE-POSITIVE: từ vô hại gần-giống KHÔNG được khớp ---
  ["fp cà chua", "cà chua", null],
  ["fp cà rốt", "cà rốt", null],
  ["fp cà phê", "cà phê", null],
  ["fp bơ", "bơ", null],
  ["fp ngò", "ngò", null],

  // --- Không match / rỗng ---
  ["none random", "Random food", null],
  ["none empty", "", null],
  ["none spaces", "   ", null],
];

for (const [name, input, expected] of CASES) {
  test(`normalizeAllergen: ${name} (${JSON.stringify(input)}) → ${expected}`, () => {
    expect(normalizeAllergen(input)).toBe(expected as any);
  });
}

test("null/undefined input → null", () => {
  expect(normalizeAllergen(null)).toBeNull();
  expect(normalizeAllergen(undefined)).toBeNull();
});

test("normalizeAllergens: gộp + unique, bỏ rác", () => {
  const got = normalizeAllergens(["Gà", "cá", "thịt gà", "xyz", null]);
  expect(got.sort()).toEqual(["chicken", "fish"]);
});

test("mọi code chuẩn đều round-trip qua label EN của chính nó", () => {
  // sanity: 9 code khai báo khớp giữa ALLERGEN_CODES và keyword table (qua EN token)
  const enToken: Record<string, string> = {
    chicken: "chicken", beef: "beef", fish: "fish", dairy: "dairy", egg: "egg",
    soy: "soy", grain: "grain", shellfish: "shellfish", peanut: "peanut",
  };
  for (const code of ALLERGEN_CODES) {
    expect(normalizeAllergen(enToken[code])).toBe(code);
  }
});
