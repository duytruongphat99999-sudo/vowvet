/**
 * QR passport code generator.
 *
 * Format: "{8 random alphanumeric}-{2 chars checksum}"
 * - Random base 8 chars từ alphabet không nhầm lẫn (bỏ I/O/0/1/l).
 * - Checksum 2 chars derived từ SHA-256 hash của base — detect typos khi user
 *   nhập tay URL. Không phải security, chỉ là validation.
 *
 * Caller phải kiểm tra unique trong Baserow trước khi save (qrcodeIsUnique).
 */
import { createHash, randomInt } from "node:crypto";
import { listRows } from "@shared/baserow.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no I/O/0/1/l
const BASE_LENGTH = 8;
const CHECKSUM_LENGTH = 2;

function randomChars(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

function checksum(base: string): string {
  const hash = createHash("sha256").update(base).digest();
  // Lấy 2 byte đầu của hash → map vào ALPHABET (mỗi byte mod 32)
  return ALPHABET[hash[0] % ALPHABET.length] + ALPHABET[hash[1] % ALPHABET.length];
}

/** Sinh 1 candidate code. KHÔNG kiểm tra unique — caller làm. */
export function generateQrCode(): string {
  const base = randomChars(BASE_LENGTH);
  return `${base}-${checksum(base)}`;
}

/** Verify checksum của code có khớp với base không (typo detection). */
export function isValidQrFormat(code: string): boolean {
  const m = code.match(/^([A-Z2-9]{8})-([A-Z2-9]{2})$/);
  if (!m) return false;
  const [, base, sum] = m;
  return checksum(base) === sum;
}

/** Sinh code unique trong Baserow. Retry tối đa 5 lần (xác suất collision ~10^-12). */
export async function generateUniqueQrCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateQrCode();
    const existing = await listRows("pets", { filter: { qr_code__equal: code }, size: 1 });
    if (existing.count === 0) return code;
  }
  throw new Error("Không sinh được mã QR unique sau 5 lần thử");
}
