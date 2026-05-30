/**
 * Long-coat breed detection (cho climate sensitivity score).
 * Long-coat breeds nhạy cảm với nóng — overheat dễ hơn breeds lông ngắn.
 *
 * Case-insensitive substring match.
 */

const LONG_COAT_KEYWORDS = [
  // Chó
  "husky",
  "malamute",
  "samoyed",
  "pomeranian",
  "phú quốc",
  "rough collie",
  "border collie",
  "shetland",
  "afghan",
  "lhasa",
  "shih tzu",
  "shihtzu",
  "maltese",
  "yorkie",
  "yorkshire",
  "golden retriever",
  "saint bernard",
  "newfoundland",
  "old english sheepdog",
  // Mèo
  "persian",
  "ba tư",
  "maine coon",
  "ragdoll",
  "norwegian forest",
  "turkish angora",
  "siberian",
  "himalayan",
  "himalaya",
  "ragamuffin",
  "balinese",
  "somali",
];

export function isLongCoat(breed: string | null | undefined): boolean {
  if (!breed) return false;
  const n = breed.toLowerCase().trim();
  if (!n) return false;
  return LONG_COAT_KEYWORDS.some((kw) => n.includes(kw));
}

export function longCoatMatch(breed: string | null | undefined): string | null {
  if (!breed) return null;
  const n = breed.toLowerCase().trim();
  return LONG_COAT_KEYWORDS.find((kw) => n.includes(kw)) || null;
}
