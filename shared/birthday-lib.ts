/**
 * Birthday helpers (M14.1) — pure functions, testable.
 *
 * VN timezone (UTC+7) assumed cho "today" calculations.
 * DOB stored as ISO date YYYY-MM-DD (no time component).
 */

/** Parse DOB ISO → Date. Trả null nếu invalid. */
function parseDob(dob: string | null | undefined): Date | null {
  if (!dob) return null;
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Next birthday Date (anniversary trong năm hiện tại hoặc năm sau nếu đã qua). */
export function getNextBirthday(dob: string, today: Date = new Date()): Date | null {
  const birth = parseDob(dob);
  if (!birth) return null;
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < now) {
    next = new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }
  return next;
}

/** Days từ today đến next birthday. 0 = hôm nay. */
export function getDaysUntilBirthday(dob: string, today: Date = new Date()): number | null {
  const next = getNextBirthday(dob, today);
  if (!next) return null;
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((next.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** True nếu today trong ±3 ngày quanh next birthday. */
export function isBirthdayWeek(dob: string, today: Date = new Date()): boolean {
  const days = getDaysUntilBirthday(dob, today);
  if (days === null) return false;
  return days <= 3; // 0 = today, 1-3 = days remaining
}

/** Tuổi sẽ TRÒN vào next birthday (không phải tuổi hiện tại). */
export function getAgeTurning(dob: string, today: Date = new Date()): number | null {
  const birth = parseDob(dob);
  const next = getNextBirthday(dob, today);
  if (!birth || !next) return null;
  return next.getFullYear() - birth.getFullYear();
}

/** Tuổi hiện tại label VN: "X tuổi Y tháng" hoặc "X tháng tuổi". */
export function getAgeLabel(dob: string, today: Date = new Date()): string {
  const birth = parseDob(dob);
  if (!birth) return "không rõ tuổi";
  const months =
    (today.getFullYear() - birth.getFullYear()) * 12 +
    (today.getMonth() - birth.getMonth()) -
    (today.getDate() < birth.getDate() ? 1 : 0);
  if (months < 0) return "chưa sinh";
  if (months < 12) return `${months} tháng tuổi`;
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  return restMonths === 0 ? `${years} tuổi` : `${years} tuổi ${restMonths} tháng`;
}

/** Slug-ify pet name cho voucher code. */
export function petNameSlug(name: string): string {
  return (name || "pet")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16) || "pet";
}

/** Voucher code format: BIRTHDAY-{petname}-{year}. */
export function generateVoucherCode(petName: string, birthdayYear: number): string {
  return `BIRTHDAY-${petNameSlug(petName).toUpperCase()}-${birthdayYear}`;
}

/** Format Date thành YYYY-MM-DD theo LOCAL timezone (tránh UTC shift). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Voucher active window: từ 3 ngày trước → 4 ngày sau sinh nhật. */
export function getVoucherWindow(dob: string, today: Date = new Date()): { from: string; to: string } | null {
  const next = getNextBirthday(dob, today);
  if (!next) return null;
  const from = new Date(next);
  from.setDate(from.getDate() - 3);
  const to = new Date(next);
  to.setDate(to.getDate() + 4);
  return {
    from: formatLocalDate(from),
    to: formatLocalDate(to),
  };
}

export interface PartySuggestions {
  small: string;
  medium: string;
  large: string;
}

export const PARTY_SUGGESTIONS: PartySuggestions = {
  small: "Tiệc gia đình tại nhà với cake pet-safe (rau củ + meat patty không gia vị). 1-2 thành viên gia đình + bé. Thời gian 1h.",
  medium: "Playdate buổi chiều mời 3-5 pet bạn. Sân vườn hoặc dog park. Snack pet-safe + nước. 1.5-2h.",
  large: "Pet party 6-10 bạn — thuê venue pet-friendly tại HCM. Cần check vaccine status của khách. Photographer pet. 2-3h.",
};
