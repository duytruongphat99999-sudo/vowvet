/**
 * Sliding-window rate limit theo key (IP, phone, user_id...).
 * In-memory Map, đủ cho Phase 0 single-instance.
 *
 * Dùng cho public endpoints để chặn scrape.
 */
import type { Context, MiddlewareHandler } from "hono";

interface Bucket {
  timestamps: number[];
}

const stores = new Map<string, Map<string, Bucket>>();

function getStore(scope: string): Map<string, Bucket> {
  let s = stores.get(scope);
  if (!s) {
    s = new Map();
    stores.set(scope, s);
  }
  return s;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check rate limit. Trả về { ok, retry_after_sec }.
 * Tự prune timestamps cũ.
 */
export function checkRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowSec: number
): { ok: boolean; retry_after_sec: number } {
  const now = nowSec();
  const cutoff = now - windowSec;
  const store = getStore(scope);
  const bucket = store.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    return { ok: false, retry_after_sec: Math.max(1, oldest + windowSec - now) };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return { ok: true, retry_after_sec: 0 };
}

/**
 * Extract real client IP. Ưu tiên Cloudflare → nginx-proxy → fallback.
 * Phase 0 trust toàn bộ chain vì traffic chỉ qua CF→nginx→api.
 */
export function getClientIp(c: Context): string {
  // Cloudflare's trusted header
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf.trim();

  // nginx-proxy forwards X-Forwarded-For (có thể có nhiều IP cách bằng dấu phẩy)
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  const xri = c.req.header("x-real-ip");
  if (xri) return xri.trim();

  // Bun's Hono context không có req.ip trực tiếp — fallback "unknown"
  return "unknown";
}

/**
 * Middleware factory: rate-limit theo IP cho public endpoint.
 *   ipRateLimit("public-passport", 30, 60) → 30 req / 60 sec / IP
 */
export function ipRateLimit(scope: string, limit: number, windowSec: number): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIp(c);
    const result = checkRateLimit(scope, ip, limit, windowSec);
    if (!result.ok) {
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: `Truy cập quá nhanh. Thử lại sau ${result.retry_after_sec}s`,
          },
        },
        429,
        { "Retry-After": String(result.retry_after_sec) }
      );
    }
    await next();
  };
}
