/**
 * Birthday card image generator (M14.1 Phase 5).
 *
 * GET /api/v1/pets/:id/birthday-card.svg  → SVG image
 *
 * Phase 0: server-side SVG generation (lightweight, no extra deps).
 * Cache 24h trong-memory để giảm Baserow load.
 *
 * SVG renders như Open Graph card 1200x630:
 *   - Gradient background (pink/orange)
 *   - Pet photo placeholder (circle với emoji fallback)
 *   - "🎉 Chúc mừng sinh nhật {name}!"
 *   - Sub-text: tuổi + breed
 *   - Footer: "Mon Min Pet 🐾"
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { getAgeTurning, getNextBirthday } from "@shared/birthday-lib.ts";

interface CacheEntry {
  svg: string;
  expires_at: number;
}
const cache = new Map<number, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pickGradient(species: string | null): { start: string; mid: string; end: string } {
  if (species === "dog") return { start: "#fb923c", mid: "#ec4899", end: "#f43f5e" };
  if (species === "cat") return { start: "#a78bfa", mid: "#ec4899", end: "#f59e0b" };
  return { start: "#34d399", mid: "#22d3ee", end: "#fbbf24" };
}

function generateSvg(opts: {
  petName: string;
  petAgeTurning: number | null;
  petBreed: string | null;
  petSpecies: string | null;
  photoUrl: string | null;
  birthdayDate: string;
}): string {
  const grad = pickGradient(opts.petSpecies);
  const speciesEmoji = opts.petSpecies === "cat" ? "🐱" : "🐶";
  const safeName = escapeXml(opts.petName);
  const safeBreed = escapeXml(opts.petBreed || "");
  const ageStr = opts.petAgeTurning != null ? `Tròn ${opts.petAgeTurning} tuổi` : "";
  const safePhoto = opts.photoUrl ? escapeXml(opts.photoUrl) : null;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${grad.start}"/>
      <stop offset="50%" stop-color="${grad.mid}"/>
      <stop offset="100%" stop-color="${grad.end}"/>
    </linearGradient>
    <radialGradient id="paw" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <clipPath id="photoCircle">
      <circle cx="600" cy="220" r="120"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Paw pattern decorations -->
  <circle cx="100" cy="100" r="60" fill="url(#paw)"/>
  <circle cx="1100" cy="120" r="80" fill="url(#paw)"/>
  <circle cx="150" cy="550" r="70" fill="url(#paw)"/>
  <circle cx="1050" cy="530" r="90" fill="url(#paw)"/>

  <!-- Confetti dots -->
  <g opacity="0.7">
    <circle cx="200" cy="200" r="6" fill="#fff"/>
    <circle cx="950" cy="250" r="5" fill="#fff"/>
    <circle cx="300" cy="450" r="7" fill="#fde68a"/>
    <circle cx="900" cy="450" r="6" fill="#fde68a"/>
    <circle cx="450" cy="500" r="5" fill="#fff"/>
    <circle cx="750" cy="500" r="5" fill="#fff"/>
  </g>

  <!-- Pet photo circle -->
  <circle cx="600" cy="220" r="128" fill="white" opacity="0.95"/>
  ${
    safePhoto
      ? `<image href="${safePhoto}" x="480" y="100" width="240" height="240" clip-path="url(#photoCircle)" preserveAspectRatio="xMidYMid slice"/>`
      : `<text x="600" y="270" text-anchor="middle" font-size="140" font-family="system-ui, sans-serif">${speciesEmoji}</text>`
  }
  <circle cx="600" cy="220" r="124" fill="none" stroke="white" stroke-width="6"/>

  <!-- Cake emoji decorations -->
  <text x="350" y="220" text-anchor="middle" font-size="60" opacity="0.9">🎂</text>
  <text x="850" y="220" text-anchor="middle" font-size="60" opacity="0.9">🎉</text>

  <!-- Headline -->
  <text x="600" y="420" text-anchor="middle" fill="white" font-size="56" font-weight="800"
    font-family="system-ui, -apple-system, sans-serif" style="text-shadow: 0 2px 8px rgba(0,0,0,0.25)">
    🎉 Chúc mừng sinh nhật ${safeName}!
  </text>

  <!-- Sub: age + breed -->
  <text x="600" y="480" text-anchor="middle" fill="white" font-size="34" font-weight="500"
    font-family="system-ui, -apple-system, sans-serif" opacity="0.95">
    ${ageStr}${safeBreed ? " · " + safeBreed : ""}
  </text>

  <!-- Date -->
  <text x="600" y="525" text-anchor="middle" fill="white" font-size="22" font-weight="400"
    font-family="system-ui, -apple-system, sans-serif" opacity="0.85">
    ${opts.birthdayDate}
  </text>

  <!-- Footer brand -->
  <text x="600" y="595" text-anchor="middle" fill="white" font-size="20" font-weight="700"
    font-family="system-ui, -apple-system, sans-serif" opacity="0.92"
    letter-spacing="2">
    🐾 MON MIN PET
  </text>
</svg>`.trim();
}

export const birthdayCardRoute = new Hono();
birthdayCardRoute.use("*", requireAuth);

birthdayCardRoute.get("/:id{[0-9]+}/birthday-card.svg", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  // Cache check
  const cached = cache.get(petId);
  if (cached && cached.expires_at > Date.now()) {
    return c.body(cached.svg, 200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Cache": "HIT",
    });
  }

  try {
    const pet = (await getOwnedPet(petId, session.sub)) as any;
    const species = typeof pet.species === "object" ? pet.species?.value : pet.species;
    const ageTurning = pet.dob ? getAgeTurning(pet.dob) : null;
    const next = pet.dob ? getNextBirthday(pet.dob) : null;
    const birthdayDate = next ? next.toLocaleDateString("vi-VN", { day: "2-digit", month: "long", year: "numeric" }) : "";

    const svg = generateSvg({
      petName: pet.name,
      petAgeTurning: ageTurning,
      petBreed: pet.breed || null,
      petSpecies: species || null,
      photoUrl: pet.photo_url || null,
      birthdayDate,
    });

    cache.set(petId, { svg, expires_at: Date.now() + TTL_MS });

    return c.body(svg, 200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Cache": "MISS",
    });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[birthday-card] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo card" } }, 500);
  }
});
