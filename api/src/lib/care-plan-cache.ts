/**
 * Care Plan v2 cache (M4.1 Phase 3).
 *
 * In-memory Map với TTL 24h, key by (pet_id, date YYYY-MM-DD VN timezone).
 * Restart vowvet-api = cache reset (acceptable Phase 0).
 *
 * Invalidation triggers:
 *   - User click "Làm mới"
 *   - New daily check-in
 *   - New triage session
 *
 * Cleanup: cron mỗi 6h clear expired (chỉ chạy nếu cache > 100 entries).
 */
import type { CarePlanV2Full } from "@shared/care-plan-v2-types.ts";

interface CacheEntry {
  value: CarePlanV2Full;
  expires_at: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

function buildKey(petId: number, date: string): string {
  return `careplan:v2:${petId}:${date}`;
}

/** Format today YYYY-MM-DD theo timezone VN (UTC+7). */
export function todayVN(): string {
  const now = new Date();
  // VN offset = +7h
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

export function getCached(petId: number, date?: string): CarePlanV2Full | null {
  const key = buildKey(petId, date || todayVN());
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires_at < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(petId: number, plan: CarePlanV2Full, date?: string): void {
  const key = buildKey(petId, date || todayVN());
  cache.set(key, {
    value: plan,
    expires_at: Date.now() + TTL_MS,
  });
}

/** Invalidate all entries cho 1 pet (any date). */
export function invalidate(petId: number): void {
  const prefix = `careplan:v2:${petId}:`;
  let removed = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[care-plan-v2] cache invalidate pet=${petId} (${removed} entries)`);
  }
}

/** Cleanup expired entries — gọi từ scheduler 6h/lần. */
export function cleanupExpired(): { removed: number; remaining: number } {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of cache.entries()) {
    if (entry.expires_at < now) {
      cache.delete(key);
      removed++;
    }
  }
  return { removed, remaining: cache.size };
}

/** Stats cho admin overview. */
export function getStats(): { entries: number; oldest_age_ms: number; newest_age_ms: number } {
  const now = Date.now();
  let oldest = 0;
  let newest = Infinity;
  for (const entry of cache.values()) {
    const age = now - (entry.expires_at - TTL_MS);
    if (age > oldest) oldest = age;
    if (age < newest) newest = age;
  }
  return {
    entries: cache.size,
    oldest_age_ms: cache.size > 0 ? oldest : 0,
    newest_age_ms: cache.size > 0 && newest !== Infinity ? newest : 0,
  };
}
