/**
 * Overpass (OSM) suggestions service — Map-Lai GĐ1 (Tầng 1 only).
 *
 * Read-only: query pet-friendly POIs in a bbox from OpenStreetMap via Overpass API.
 * Tầng 1 (precision cao, vốn liên quan pet):
 *   amenity=veterinary  → vet
 *   shop=pet            → pet_shop
 *   shop=pet_grooming   → grooming
 *   leisure=dog_park    → park
 *
 * KHÔNG ghi DB. Caller (route) lo dedup vs Baserow + guard bbox + cache.
 * Overpass miễn phí, không cần key, nhưng có Acceptable Use Policy → định danh qua
 * User-Agent, giữ query nhỏ (giới hạn bbox), để route cache/giới hạn tần suất.
 */
import type { PlaceCategory } from "./places.ts";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
// Định danh app theo Overpass Acceptable Use Policy (không nhúng email cá nhân).
const OVERPASS_UA = "MonMinPet-VowVet/1.0 (pet-friendly places discovery)";
const OVERPASS_TIMEOUT_MS = 25000;

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface SuggestPOI {
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  osm_id: string; // "node/123" | "way/456" | "relation/789"
  source: "osm";
  address: string; // best-effort từ addr:* ("" nếu OSM không có)
}

/** Map tags của 1 element OSM → category Tầng 1, hoặc null nếu không thuộc Tầng 1. */
export function mapTagsToCategory(tags: Record<string, string> | undefined): PlaceCategory | null {
  if (!tags) return null;
  if (tags.amenity === "veterinary") return "vet";
  if (tags.shop === "pet") return "pet_shop";
  if (tags.shop === "pet_grooming") return "grooming";
  if (tags.leisure === "dog_park") return "park";
  return null;
}

/** Build Overpass QL cho POI pet Tầng 1 trong bbox. */
export function buildTier1Query(b: Bbox): string {
  const bb = `${b.south},${b.west},${b.north},${b.east}`;
  return `[out:json][timeout:20];
(
  nwr["amenity"="veterinary"](${bb});
  nwr["shop"="pet"](${bb});
  nwr["shop"="pet_grooming"](${bb});
  nwr["leisure"="dog_park"](${bb});
);
out tags center 80;`;
}

function bestEffortAddress(tags: Record<string, string>): string {
  if (tags["addr:full"]) return tags["addr:full"];
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean);
  return parts.join(" ").trim();
}

/** Parse elements thô từ Overpass → SuggestPOI[] (bỏ POI thiếu name/coords/không-Tầng1). */
export function parseElements(elements: any[]): SuggestPOI[] {
  const out: SuggestPOI[] = [];
  for (const el of elements || []) {
    const tags = el.tags || {};
    const name = String(tags.name || "").trim();
    if (!name) continue; // bỏ POI không có tên
    const category = mapTagsToCategory(tags);
    if (!category) continue;
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lng = el.type === "node" ? el.lon : el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    out.push({
      name: name.slice(0, 200),
      lat,
      lng,
      category,
      osm_id: `${el.type}/${el.id}`,
      source: "osm",
      address: bestEffortAddress(tags).slice(0, 300),
    });
  }
  return out;
}

/**
 * Fetch gợi ý Tầng 1 từ Overpass cho 1 bbox.
 * Throw khi network/timeout/HTTP lỗi → caller bắt → trả degraded (map vẫn chạy).
 */
export async function fetchOverpassSuggestions(b: Bbox): Promise<SuggestPOI[]> {
  const query = buildTier1Query(b);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": OVERPASS_UA,
    },
    body: new URLSearchParams({ data: query }).toString(),
    signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json: any = await res.json();
  return parseElements(json.elements || []);
}
