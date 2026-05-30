/**
 * Tính tuổi pet từ ngày sinh, format tiếng Việt.
 *   - ≥12 tháng:  "3 tuổi 2 tháng" (hoặc "3 tuổi" nếu = 0 tháng dư)
 *   - <12 tháng: "10 tháng tuổi"
 *   - 0 tháng:    "Mới sinh"
 *   - null/missing: "—"
 */
export function formatAge(dob: string | null | undefined, now: Date = new Date()): string {
  if (!dob) return "—";
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "—";
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth.getTime()) || birth > now) return "—";

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years === 0 && months === 0) return "Mới sinh";
  if (years === 0) return `${months} tháng tuổi`;
  if (months === 0) return `${years} tuổi`;
  return `${years} tuổi ${months} tháng`;
}
