/**
 * v275: cache NGẮN cho /auth/me (user + pets thô) theo userId — tránh query Baserow
 * ~1.5s mỗi page SSR (mọi page đều gọi fetchMe). TTL ngắn + INVALIDATE khi user GHI
 * (non-GET) qua middleware ở index.ts → KHÔNG trả data cũ sau khi user vừa sửa.
 */
type MeEntry = { user: any; pets: any[]; exp: number };
const cache = new Map<number, MeEntry>();
const TTL_MS = 12_000;

export function getMeCache(userId: number): { user: any; pets: any[] } | null {
  const e = cache.get(userId);
  if (!e) return null;
  if (Date.now() > e.exp) {
    cache.delete(userId);
    return null;
  }
  return { user: e.user, pets: e.pets };
}

export function setMeCache(userId: number, user: any, pets: any[]): void {
  cache.set(userId, { user, pets, exp: Date.now() + TTL_MS });
}

export function invalidateMeCache(userId: number): void {
  cache.delete(userId);
}
