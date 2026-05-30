/**
 * Slug helpers (M12) — generate URL-safe public slugs cho pet.
 *
 * Format: `{petname-lowercase-nodiacritics}-{4-char-random}`
 *   Bé Béo → "be-beo-a3f9"
 *   Mon    → "mon-x7k2"
 */
import { listRows } from "@shared/baserow.ts";

const SLUG_CHARS = "0123456789abcdefghjkmnpqrstuvwxyz"; // no l/i/o (confusing)

/** Bỏ dấu tiếng Việt + lowercase + chỉ giữ a-z 0-9. */
export function removeVietnameseDiacritics(s: string): string {
  if (!s) return "";
  // Decompose Unicode → strip combining marks
  let result = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Convert đ/Đ → d
  result = result.replace(/đ/g, "d").replace(/Đ/g, "D");
  // Lowercase + replace whitespace → hyphen + strip non-alphanumeric
  result = result.toLowerCase().trim();
  result = result.replace(/\s+/g, "-");
  result = result.replace(/[^a-z0-9-]/g, "");
  // Collapse multiple hyphens
  result = result.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return result || "pet";
}

/** Random 4-char suffix (no l/i/o/0 conflicting). */
function randomSuffix(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)];
  }
  return out;
}

/** Generate slug base từ pet name. */
export function generatePetSlug(petName: string): string {
  const base = removeVietnameseDiacritics(petName).slice(0, 30); // cap 30 char base
  return `${base}-${randomSuffix(4)}`;
}

/**
 * Check slug duplicate trong Baserow + retry với suffix mới (max 5 retries).
 * Return slug đầu tiên unique.
 */
export async function ensureUniqueSlug(petName: string, maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = generatePetSlug(petName);
    const existing = await findPetBySlug(candidate);
    if (!existing) return candidate;
  }
  // Cuối cùng: append timestamp để đảm bảo unique
  const base = removeVietnameseDiacritics(petName).slice(0, 30);
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}

/** Lookup pet by public_slug. Return raw Baserow row or null. */
export async function findPetBySlug(slug: string): Promise<any | null> {
  if (!slug) return null;
  try {
    const res = await listRows<any>("pets", {
      filter: { public_slug__equal: slug },
      size: 1,
    });
    return res.results[0] || null;
  } catch {
    return null;
  }
}
