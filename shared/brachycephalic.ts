/**
 * Brachycephalic (mặt ngắn) breeds — nhạy cảm với nóng, dễ sốc nhiệt + suy hô hấp.
 * Case-insensitive substring matching để cover các biến thể chính tả VN/EN.
 *
 * Dùng cho escalation: brachycephalic + feels_like > 32°C → Gemini Pro.
 */

const BRACHYCEPHALIC_KEYWORDS = [
  // Chó
  "pug",
  "bulldog",       // English Bulldog, French Bulldog
  "boxer",
  "boston",        // Boston Terrier
  "pekingese",
  "shih tzu",
  "shihtzu",
  "bull pháp",     // VN biến thể của French Bulldog
  "bull anh",      // VN biến thể của English Bulldog
  "lhasa",         // Lhasa Apso (cận brachycephalic)
  "cavalier",      // Cavalier King Charles Spaniel
  // Mèo
  "persian",
  "ba tư",         // VN cho Persian
  "himalayan",
  "himalaya",
  "exotic shorthair",
  "exotic",
  "scottish fold",
  "british shorthair",  // BSH có thể có flat-face
  "anh lông ngắn",      // British Shorthair VN
  "munchkin",           // Một số dòng có flat-face
  "burmese",
  "miến điện",
];

/**
 * Kiểm tra breed có thuộc brachycephalic không.
 * Substring match (case-insensitive). Trả false nếu breed null/empty.
 *
 *   isBrachycephalic("Pug")                  → true
 *   isBrachycephalic("pug mix")              → true
 *   isBrachycephalic("Mèo Ba Tư")            → true
 *   isBrachycephalic("Anh lông ngắn (BSH)")  → true
 *   isBrachycephalic("Labrador")             → false
 *   isBrachycephalic(null)                   → false
 */
export function isBrachycephalic(breed: string | null | undefined): boolean {
  if (!breed) return false;
  const normalized = breed.toLowerCase().trim();
  if (!normalized) return false;
  return BRACHYCEPHALIC_KEYWORDS.some((kw) => normalized.includes(kw));
}

/** Trả keyword đầu tiên match (cho logging / explainability). */
export function brachycephalicMatch(breed: string | null | undefined): string | null {
  if (!breed) return null;
  const normalized = breed.toLowerCase().trim();
  return BRACHYCEPHALIC_KEYWORDS.find((kw) => normalized.includes(kw)) || null;
}
