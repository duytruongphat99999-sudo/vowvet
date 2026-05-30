/**
 * Senior pet detection từ dob.
 *   Chó:   ≥7 năm
 *   Mèo:   ≥10 năm
 *   Khác:  ≥7 (default)
 *
 * Trả null nếu thiếu dob (không biết tuổi → giả sử trẻ, không escalate).
 */

export function ageInYears(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

/**
 * Pet được coi là "senior" chưa.
 * `species` nhận tiếng Việt ("Chó"/"Mèo") hoặc tiếng Anh ("dog"/"cat").
 */
export function isSenior(
  species: string | null | undefined,
  dob: string | null | undefined,
  now: Date = new Date()
): boolean {
  const years = ageInYears(dob, now);
  if (years === null) return false;
  const s = (species || "").toLowerCase();
  if (s === "mèo" || s === "cat") return years >= 10;
  if (s === "chó" || s === "dog") return years >= 7;
  // Khác → dùng ngưỡng chó
  return years >= 7;
}
