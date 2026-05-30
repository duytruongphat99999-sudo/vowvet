/**
 * OTP state machine — in-memory Map, đủ cho Phase 0 (single-instance).
 *
 * 3 store độc lập:
 *   - otpStore: phone → { code, expires_at, attempts_used }
 *   - rateLimitStore: phone → timestamps[] (sliding 15-phút window)
 *   - lockStore: phone → locked_until (unix sec)
 *
 * Restart vowvet-api container = wipe state. Acceptable Phase 0.
 */
import {
  OTP_TTL_SEC,
  OTP_RATE_LIMIT,
  OTP_RATE_LIMIT_WINDOW_SEC,
  OTP_MAX_ATTEMPTS,
  OTP_LOCK_DURATION_SEC,
} from "@shared/auth.ts";

interface OtpState {
  code: string;
  expires_at: number;
  attempts_used: number;
}

const otpStore = new Map<string, OtpState>();
const rateLimitStore = new Map<string, number[]>();
const lockStore = new Map<string, number>();

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sinh OTP 6 chữ số (random, không bắt đầu bằng 0). */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Đang bị lock? Trả số giây còn lại, 0 nếu không lock. */
export function getLockSecondsLeft(phone: string): number {
  const locked_until = lockStore.get(phone);
  if (!locked_until) return 0;
  const left = locked_until - nowSec();
  if (left <= 0) {
    lockStore.delete(phone);
    return 0;
  }
  return left;
}

/** Đã gửi bao nhiêu OTP trong cửa sổ 15 phút? */
function countRecentRequests(phone: string): number {
  const cutoff = nowSec() - OTP_RATE_LIMIT_WINDOW_SEC;
  const recent = (rateLimitStore.get(phone) || []).filter((t) => t > cutoff);
  rateLimitStore.set(phone, recent);
  return recent.length;
}

/**
 * Request OTP mới.
 * Throws nếu locked hoặc vượt rate limit.
 * Trả { code, expires_in } — caller console.log code (Phase 0 mock Zalo).
 */
export function requestOtp(phone: string): { code: string; expires_in: number } {
  const lockLeft = getLockSecondsLeft(phone);
  if (lockLeft > 0) {
    const err = new Error(`Tài khoản tạm khoá. Thử lại sau ${Math.ceil(lockLeft / 60)} phút`);
    (err as any).code = "OTP_LOCKED";
    (err as any).retry_after = lockLeft;
    throw err;
  }

  const recentCount = countRecentRequests(phone);
  if (recentCount >= OTP_RATE_LIMIT) {
    const err = new Error(`Đã gửi quá nhiều mã. Thử lại sau ít phút`);
    (err as any).code = "RATE_LIMITED";
    throw err;
  }

  const code = generateCode();
  const expires_at = nowSec() + OTP_TTL_SEC;
  otpStore.set(phone, { code, expires_at, attempts_used: 0 });

  const recent = rateLimitStore.get(phone) || [];
  recent.push(nowSec());
  rateLimitStore.set(phone, recent);

  return { code, expires_in: OTP_TTL_SEC };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; code: "OTP_EXPIRED" | "OTP_WRONG" | "OTP_LOCKED"; attempts_left?: number; retry_after?: number };

/**
 * Verify OTP. Tăng attempts_used khi sai.
 * Sau OTP_MAX_ATTEMPTS lần sai liên tiếp → set lock, xoá OTP.
 * Verify đúng → xoá OTP (one-shot).
 */
export function verifyOtp(phone: string, code: string): VerifyResult {
  const lockLeft = getLockSecondsLeft(phone);
  if (lockLeft > 0) {
    return { ok: false, code: "OTP_LOCKED", retry_after: lockLeft };
  }

  const state = otpStore.get(phone);
  if (!state || state.expires_at < nowSec()) {
    otpStore.delete(phone);
    return { ok: false, code: "OTP_EXPIRED" };
  }

  if (state.code !== code) {
    state.attempts_used += 1;
    const attempts_left = OTP_MAX_ATTEMPTS - state.attempts_used;
    if (attempts_left <= 0) {
      // Lock + xoá OTP để buộc xin lại sau khi unlock
      lockStore.set(phone, nowSec() + OTP_LOCK_DURATION_SEC);
      otpStore.delete(phone);
      return { ok: false, code: "OTP_LOCKED", retry_after: OTP_LOCK_DURATION_SEC };
    }
    otpStore.set(phone, state);
    return { ok: false, code: "OTP_WRONG", attempts_left };
  }

  // Đúng — xoá OTP (one-shot)
  otpStore.delete(phone);
  return { ok: true };
}

/** Tiện cho dev/test: xoá hết state. KHÔNG dùng từ HTTP. */
export function _resetAllOtpState(): void {
  otpStore.clear();
  rateLimitStore.clear();
  lockStore.clear();
}
