/**
 * Places service (M26).
 *
 * - listPlaces with optional lat/lng radius filter (Haversine)
 * - createPlace (user submissions, verified=false)
 * - checkInPlace + update place stats
 */
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";
import { haversineDistance } from "@shared/geo.ts";

// ================================================================
// Types
// ================================================================
export type PlaceCategory =
  | "cafe" | "restaurant" | "park" | "hotel"
  | "grooming" | "vet" | "pet_shop" | "beach" | "other";

export type PetPolicy = "allowed" | "leash_only" | "small_pets_only" | "private_only" | "by_request";

export interface PlaceRow {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string | { id: number; value: string };
  pet_policy: string | { id: number; value: string };
  amenities: string | null;
  avg_rating: number;
  total_checkins: number;
  total_reviews: number;
  contact_phone: string | null;
  contact_website: string | null;
  photo_urls: string | null;
  created_by: number | null;
  verified: boolean;
  verified_by?: number;
  verified_at?: string;
  active: boolean;
  created_at: string;
}

export interface PlaceApi {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  pet_policy: PetPolicy;
  amenities: string[];
  avg_rating: number;
  total_checkins: number;
  total_reviews: number;
  contact_phone: string | null;
  contact_website: string | null;
  photo_urls: string[];
  verified: boolean;
  distance_km?: number;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toApi(row: PlaceRow): PlaceApi {
  let amenities: string[] = [];
  let photos: string[] = [];
  try { amenities = JSON.parse(row.amenities || "[]"); } catch {}
  try { photos = JSON.parse(row.photo_urls || "[]"); } catch {}
  return {
    id: row.id,
    name: row.name || "",
    address: row.address || "",
    lat: Number(row.lat) || 0,
    lng: Number(row.lng) || 0,
    category: (flatVal<PlaceCategory>(row.category) || "other") as PlaceCategory,
    pet_policy: (flatVal<PetPolicy>(row.pet_policy) || "by_request") as PetPolicy,
    amenities,
    avg_rating: Number(row.avg_rating) || 0,
    total_checkins: Number(row.total_checkins) || 0,
    total_reviews: Number(row.total_reviews) || 0,
    contact_phone: row.contact_phone || null,
    contact_website: row.contact_website || null,
    photo_urls: photos,
    verified: row.verified === true,
  };
}

// ================================================================
// CRUD
// ================================================================

export interface ListFilters {
  lat?: number;
  lng?: number;
  radius_km?: number;
  category?: PlaceCategory | null;
  search?: string | null;
  verified_only?: boolean;
}

export async function listPlaces(filters: ListFilters = {}): Promise<PlaceApi[]> {
  const baseFilter: Record<string, string> = { active__boolean: "true" };
  if (filters.verified_only) baseFilter.verified__boolean = "true";
  if (filters.category) baseFilter.category__contains = filters.category;
  if (filters.search) baseFilter.name__contains = filters.search;

  const res = await listRows<PlaceRow>("places", { filter: baseFilter, size: 200 });
  let places = res.results.filter((r) => r.name).map(toApi);

  // Geo filter + distance calc
  if (filters.lat != null && filters.lng != null) {
    const r = filters.radius_km || 50;
    places = places
      .map((p) => ({ ...p, distance_km: haversineDistance(filters.lat!, filters.lng!, p.lat, p.lng) }))
      .filter((p) => p.distance_km! <= r)
      .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
  }

  return places;
}

export async function getPlace(placeId: number): Promise<PlaceApi | null> {
  try {
    const row = await getRow<PlaceRow>("places", placeId);
    return toApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export interface CreatePlaceInput {
  userId: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  pet_policy: PetPolicy;
  amenities?: string[];
  contact_phone?: string | null;
  contact_website?: string | null;
  photo_urls?: string[];
}

export async function createPlace(input: CreatePlaceInput): Promise<PlaceApi> {
  // Baserow field lat/lng giới hạn 6 chữ số thập phân; OSM/map-picker có thể gửi 7+ → làm tròn,
  // tránh 400 ERROR_REQUEST_BODY_VALIDATION (max_decimal_places). Guard NaN/string → giữ nguyên giá trị cũ.
  const round6 = (v: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Number(n.toFixed(6)) : v;
  };
  const row = await createRow<PlaceRow>("places", {
    name: input.name.slice(0, 200),
    address: input.address.slice(0, 300),
    lat: round6(input.lat),
    lng: round6(input.lng),
    category: input.category,
    pet_policy: input.pet_policy,
    amenities: JSON.stringify(input.amenities || []),
    avg_rating: 0,
    total_checkins: 0,
    total_reviews: 0,
    contact_phone: input.contact_phone || null,
    contact_website: input.contact_website || null,
    photo_urls: JSON.stringify(input.photo_urls || []),
    created_by: input.userId,
    verified: false,
    active: true,
    created_at: new Date().toISOString(),
  });
  return toApi(row);
}

// ================================================================
// Admin moderation (duyệt place user thêm — Phase 1)
// ================================================================

export interface PendingPlace {
  id: number;
  name: string;
  address: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  photo_urls: string[];
  created_by: number | null;
  created_at: string;
}

/**
 * Admin: list place chờ duyệt — verified=false AND active=true.
 * Map shape RIÊNG từ PlaceRow để giữ created_by/created_at (toApi() bỏ 2 field này).
 * Trả raw created_by id, KHÔNG lookup user (Phase 3 lo).
 */
export async function listPendingPlaces(): Promise<PendingPlace[]> {
  const res = await listRows<PlaceRow>("places", {
    filter: { active__boolean: "true", verified__boolean: "false" },
    size: 200,
  });
  return res.results
    .filter((r) => r.name)
    .map((r) => {
      let photos: string[] = [];
      try { photos = JSON.parse(r.photo_urls || "[]"); } catch {}
      return {
        id: r.id,
        name: r.name || "",
        address: r.address || "",
        category: (flatVal<PlaceCategory>(r.category) || "other") as PlaceCategory,
        lat: Number(r.lat) || 0,
        lng: Number(r.lng) || 0,
        photo_urls: photos,
        created_by: r.created_by ?? null,
        created_at: r.created_at || "",
      };
    });
}

/**
 * Admin: duyệt place — set verified=true + lưu vết (verified_by, verified_at ISO UTC).
 * Trả place đã update (toApi).
 */
export async function verifyPlace(placeId: number, adminUserId: number): Promise<PlaceApi> {
  const row = await updateRow<PlaceRow>("places", placeId, {
    verified: true,
    verified_by: adminUserId,
    verified_at: new Date().toISOString(),
  });
  return toApi(row);
}

/** Admin: từ chối place — set active=false (ẩn, GIỮ row, KHÔNG xoá). */
export async function rejectPlace(placeId: number): Promise<void> {
  await updateRow("places", placeId, { active: false });
}

// ================================================================
// Check-ins
// ================================================================

export interface CheckinRow {
  id: number;
  place_id: Array<{ id: number; value: string }>;
  pet_id: Array<{ id: number; value: string }>;
  user_id: number;
  visited_at: string;
  rating: number;
  review: string | null;
  photo_urls: string | null;
  created_at: string;
}

export interface CheckinApi {
  id: number;
  place_id: number;
  pet_id: number;
  user_id: number;
  visited_at: string;
  rating: number;
  review: string;
  photo_urls: string[];
  created_at: string;
}

export function toCheckinApi(row: CheckinRow): CheckinApi {
  let photos: string[] = [];
  try { photos = JSON.parse(row.photo_urls || "[]"); } catch {}
  return {
    id: row.id,
    place_id: (row.place_id || [])[0]?.id ?? 0,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    user_id: Number(row.user_id) || 0,
    visited_at: row.visited_at || "",
    rating: Number(row.rating) || 0,
    review: row.review || "",
    photo_urls: photos,
    created_at: row.created_at || "",
  };
}

export interface CheckInInput {
  placeId: number;
  petId: number;
  userId: number;
  rating?: number;
  review?: string;
  photoUrls?: string[];
}

export async function checkIn(input: CheckInInput): Promise<CheckinApi> {
  const row = await createRow<CheckinRow>("place_checkins", {
    place_id: [input.placeId],
    pet_id: [input.petId],
    user_id: input.userId,
    visited_at: new Date().toISOString(),
    rating: Math.max(1, Math.min(5, input.rating || 5)),
    review: input.review || null,
    photo_urls: JSON.stringify((input.photoUrls || []).slice(0, 3)),
    created_at: new Date().toISOString(),
  });
  // Update place stats (fire-and-forget)
  updatePlaceStats(input.placeId).catch((e) => console.error("[places] updatePlaceStats:", e));
  return toCheckinApi(row);
}

export async function listPlaceCheckins(placeId: number, limit = 50): Promise<CheckinApi[]> {
  const res = await listRows<CheckinRow>("place_checkins", {
    filter: { place_id__link_row_has: String(placeId) },
    size: limit,
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.visited_at).map(toCheckinApi);
}

export async function listPetCheckins(petId: number, limit = 50): Promise<CheckinApi[]> {
  const res = await listRows<CheckinRow>("place_checkins", {
    filter: { pet_id__link_row_has: String(petId) },
    size: limit,
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.visited_at).map(toCheckinApi);
}

export async function updatePlaceStats(placeId: number): Promise<void> {
  try {
    const checkins = await listPlaceCheckins(placeId, 200);
    const total = checkins.length;
    const ratings = checkins.filter((c) => c.rating > 0);
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, c) => s + c.rating, 0) / ratings.length) * 100) / 100
      : 0;
    const reviewCount = checkins.filter((c) => c.review && c.review.length > 0).length;
    await updateRow("places", placeId, {
      total_checkins: total,
      avg_rating: avgRating,
      total_reviews: reviewCount,
    });
  } catch (err) {
    console.error(`[places] stat refresh place=${placeId}:`, err);
  }
}

// ================================================================
// Categories
// ================================================================
export const CATEGORIES: Array<{ key: PlaceCategory; label_vi: string; emoji: string }> = [
  { key: "park", label_vi: "Công viên", emoji: "🌳" },
  { key: "cafe", label_vi: "Cafe", emoji: "☕" },
  { key: "vet", label_vi: "Phòng khám", emoji: "🏥" },
  { key: "restaurant", label_vi: "Nhà hàng", emoji: "🍽️" },
  { key: "hotel", label_vi: "Khách sạn", emoji: "🏨" },
  { key: "grooming", label_vi: "Spa & grooming", emoji: "✂️" },
  { key: "pet_shop", label_vi: "Pet shop", emoji: "🛒" },
  { key: "beach", label_vi: "Bãi biển", emoji: "🏖️" },
  { key: "other", label_vi: "Khác", emoji: "📍" },
];

export async function getCategoriesWithCounts(): Promise<Array<{ key: PlaceCategory; label_vi: string; emoji: string; count: number }>> {
  const all = await listPlaces({});
  const counts = new Map<string, number>();
  for (const p of all) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  return CATEGORIES.map((c) => ({ ...c, count: counts.get(c.key) || 0 }));
}
