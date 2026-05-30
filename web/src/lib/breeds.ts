/**
 * Top 20 giống thú cưng phổ biến tại Việt Nam (Phase 0 list cứng).
 * Khi có nhiều data hơn → chuyển sang fetch từ Baserow.
 */

export const DOG_BREEDS_VN = [
  "Phú Quốc",
  "Poodle",
  "Corgi",
  "Husky",
  "Pug",
  "Chihuahua",
  "Alaska",
  "Golden Retriever",
  "Labrador",
  "Becgie (German Shepherd)",
  "Shiba Inu",
  "Samoyed",
  "Bull Pháp (French Bulldog)",
  "H'mông cộc",
  "Chó ta (chó cỏ)",
];

export const CAT_BREEDS_VN = [
  "Mèo ta",
  "Anh lông ngắn (British Shorthair)",
  "Munchkin",
  "Ragdoll",
  "Mèo Ba Tư (Persian)",
  "Maine Coon",
  "Bengal",
  "Scottish Fold",
  "Mèo Xiêm (Siamese)",
  "Mèo tam thể",
];

export function getBreedsFor(species: string): string[] {
  if (species === "Chó") return DOG_BREEDS_VN;
  if (species === "Mèo") return CAT_BREEDS_VN;
  return [];
}
