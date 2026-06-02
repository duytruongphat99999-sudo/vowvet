/**
 * v275/v276: cache NGẮN theo user — tránh query Baserow ~1.3-3s mỗi GET đọc-nhiều.
 *   - /auth/me (user+pets): getMeCache/setMeCache (TTL 12s)
 *   - endpoint pet đọc-nhiều (pet-score/profile/mood/nudges/alerts/care-plan): cacheGet/cacheSet
 *     qua middleware ở index.ts (TTL 20s, key = path+query)
 * INVALIDATE: invalidateUser(userId) gọi khi user GHI (non-GET) → bust TOÀN BỘ cache của user
 *   → KHÔNG bao giờ trả data cũ sau khi user vừa sửa.
 */
const store = new Map<string, { data: any; exp: number }>();
const byUser = new Map<number, Set<string>>();

function fullKey(userId: number, key: string): string {
  return userId + "::" + key;
}

export function cacheGet(userId: number, key: string): any | null {
  const fk = fullKey(userId, key);
  const e = store.get(fk);
  if (!e) return null;
  if (Date.now() > e.exp) {
    store.delete(fk);
    return null;
  }
  return e.data;
}

export function cacheSet(userId: number, key: string, data: any, ttlMs: number): void {
  const fk = fullKey(userId, key);
  store.set(fk, { data, exp: Date.now() + ttlMs });
  let set = byUser.get(userId);
  if (!set) {
    set = new Set();
    byUser.set(userId, set);
  }
  set.add(fk);
}

/** Bust TOÀN BỘ cache của 1 user (gọi khi user ghi bất kỳ) — chống stale. */
export function invalidateUser(userId: number): void {
  const set = byUser.get(userId);
  if (set) {
    for (const fk of set) store.delete(fk);
    byUser.delete(userId);
  }
}

// ── Wrappers cho /auth/me (giữ API cũ ở auth.ts) ──
export function getMeCache(userId: number): { user: any; pets: any[] } | null {
  return cacheGet(userId, "me");
}
export function setMeCache(userId: number, user: any, pets: any[]): void {
  cacheSet(userId, "me", { user, pets }, 12_000);
}
