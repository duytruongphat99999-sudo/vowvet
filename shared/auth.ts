/**
 * Auth helpers dùng chung cho api + web.
 * - Phone normalization (VN số sang dạng +84)
 * - Validation regex
 * - Constants (cookie name, expire, OTP, lock)
 */

/** Tên cookie HTTP-only chứa JWT session. */
export const SESSION_COOKIE = "vowvet_session";

/** Session sống 30 ngày, refresh-on-use khi gọi /api/v1/auth/me. */
export const SESSION_EXPIRES_SEC = 30 * 24 * 3600;

/** OTP 6 chữ số, sống 5 phút. */
export const OTP_TTL_SEC = 5 * 60;

/** Cửa sổ rate limit: 3 OTP / 15 phút / số. */
export const OTP_RATE_LIMIT = 3;
export const OTP_RATE_LIMIT_WINDOW_SEC = 15 * 60;

/** 5 lần verify sai → lock 15 phút. */
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_DURATION_SEC = 15 * 60;

/** Regex validate phone VN (theo spec M2). */
export const VN_PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

/**
 * Chuẩn hoá số VN về dạng "+84xxxxxxxxx".
 * Throw nếu định dạng sai.
 *
 * Ví dụ:
 *   "0901234567"  → "+84901234567"
 *   "+84901234567" → "+84901234567"
 *   "84901234567"  → throw (theo regex spec phải có "0" hoặc "+84")
 *   "090 123 4567" → "+84901234567" (xử lý space/dash trước khi validate)
 */
export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-\(\)\.]/g, "");
  if (!VN_PHONE_REGEX.test(cleaned)) {
    throw new Error("Số điện thoại không hợp lệ. Ví dụ: 0901234567");
  }
  if (cleaned.startsWith("+84")) return cleaned;
  // "0xxxxxxxxx" → "+84xxxxxxxxx"
  return "+84" + cleaned.slice(1);
}

/** Validate-only, không throw. */
export function isValidPhone(input: string): boolean {
  try {
    normalizePhone(input);
    return true;
  } catch {
    return false;
  }
}
