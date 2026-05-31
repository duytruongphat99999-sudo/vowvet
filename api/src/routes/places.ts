/**
 * Places routes (M26).
 *
 * Mix of public + auth-required endpoints.
 *   GET    /api/v1/places                                ?lat&lng&radius&category&search&verified — PUBLIC
 *   GET    /api/v1/places/categories                    — PUBLIC
 *   GET    /api/v1/places/:placeId                      — PUBLIC
 *   POST   /api/v1/places                                — auth, user submit (verified=false)
 *   GET    /api/v1/places/:placeId/checkins              — PUBLIC list (reviews)
 *   POST   /api/v1/places/:placeId/checkin               — auth
 *   GET    /api/v1/places/checkin-history/:petId         — auth (owner verifies pet)
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  listPlaces, getPlace, createPlace, checkIn, listPlaceCheckins, listPetCheckins,
  getCategoriesWithCounts, CATEGORIES,
  type PlaceCategory, type PetPolicy,
} from "../lib/places.ts";
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import { haversineDistance } from "@shared/geo.ts";
import { fetchOverpassSuggestions } from "../lib/overpass.ts";

export const placesRoute = new Hono();

const VALID_CATEGORIES = CATEGORIES.map((c) => c.key);
const VALID_POLICIES: PetPolicy[] = ["allowed", "leash_only", "small_pets_only", "private_only", "by_request"];

// ============================================================
// Public endpoints
// ============================================================

placesRoute.get("/", async (c) => {
  const lat = c.req.query("lat") ? Number(c.req.query("lat")) : undefined;
  const lng = c.req.query("lng") ? Number(c.req.query("lng")) : undefined;
  const radius = c.req.query("radius") ? Number(c.req.query("radius")) : 50;
  const category = c.req.query("category") as PlaceCategory | undefined;
  const search = c.req.query("search") || undefined;
  const verifiedOnly = c.req.query("verified") === "1";

  try {
    const places = await listPlaces({
      lat: !Number.isNaN(lat || NaN) ? lat : undefined,
      lng: !Number.isNaN(lng || NaN) ? lng : undefined,
      radius_km: radius,
      category: category && VALID_CATEGORIES.includes(category) ? category : null,
      search,
      verified_only: verifiedOnly,
    });
    return c.json({ places, total: places.length });
  } catch (err: any) {
    console.error("[places/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load places" } }, 500);
  }
});

placesRoute.get("/categories", async (c) => {
  try {
    const cats = await getCategoriesWithCounts();
    return c.json({ categories: cats });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ── GET /suggest?bbox=S,W,N,E — gợi ý OSM Overpass Tầng 1 (PUBLIC, read-only, KHÔNG ghi DB) ──
const SUGGEST_MAX_SPAN_DEG = 0.5; // ~55km/trục (tính trên bbox GỐC client, TRƯỚC pad); query Tầng 1 thưa nên rẻ
const SUGGEST_PAD_DEG = 0.03; // ~3km nới mỗi phía trước khi query Overpass → zoom chặt vẫn kéo được POI lân cận (POI VN thưa, gần nhất 2-3km)
const DEDUP_RADIUS_KM = 0.08; // 80m: POI OSM trùng place Baserow → loại
const SUGGEST_TTL_MS = 10 * 60 * 1000; // cache 10 phút theo bbox-tile
const suggestCache = new Map<string, { data: any; expires: number }>();

placesRoute.get("/suggest", async (c) => {
  const raw = c.req.query("bbox") || "";
  const parts = raw.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return c.json({ error: { code: "BAD_BBOX", message: "bbox phải là S,W,N,E (4 số)" } }, 400);
  }
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) {
    return c.json({ error: { code: "BAD_BBOX", message: "bbox không hợp lệ (cần S<N, W<E)" } }, 400);
  }
  // Guard tính trên bbox GỐC client gửi (trước khi pad)
  if (north - south > SUGGEST_MAX_SPAN_DEG || east - west > SUGGEST_MAX_SPAN_DEG) {
    return c.json({ error: { code: "BBOX_TOO_LARGE", message: "Khu vực quá rộng để tìm — thu nhỏ vùng xem lại" } }, 400);
  }

  // Pad ~3km mỗi phía → query Overpass + dedup chạy trên vùng đã nới (zoom chặt vẫn thấy POI lân cận)
  const bbox = {
    south: south - SUGGEST_PAD_DEG,
    west: west - SUGGEST_PAD_DEG,
    north: north + SUGGEST_PAD_DEG,
    east: east + SUGGEST_PAD_DEG,
  };
  const cacheKey = parts.map((n) => n.toFixed(3)).join(",");
  const cached = suggestCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return c.json({ ...cached.data, cached: true });
  }

  // 1) Query Overpass — lỗi/timeout → degraded (KHÔNG 500, map vẫn chạy)
  let pois;
  try {
    pois = await fetchOverpassSuggestions(bbox);
  } catch (err: any) {
    console.error("[places/suggest] Overpass error:", err?.name || err);
    return c.json({ suggestions: [], total: 0, degraded: true });
  }

  // 2) Dedup vs place Baserow trong bbox (<80m → coi là trùng, loại khỏi gợi ý)
  let existing: Array<{ lat: number; lng: number }> = [];
  try {
    const all = await listPlaces({});
    existing = all.filter(
      (p) => p.lat >= bbox.south && p.lat <= bbox.north && p.lng >= bbox.west && p.lng <= bbox.east
    );
  } catch (err) {
    console.error("[places/suggest] dedup list error (bỏ qua dedup):", err);
  }
  const suggestions = pois.filter(
    (s) => !existing.some((p) => haversineDistance(s.lat, s.lng, p.lat, p.lng) < DEDUP_RADIUS_KM)
  );

  const payload = {
    suggestions,
    total: suggestions.length,
    raw_count: pois.length,
    deduped: pois.length - suggestions.length,
  };
  suggestCache.set(cacheKey, { data: payload, expires: Date.now() + SUGGEST_TTL_MS });
  return c.json(payload);
});

placesRoute.get("/:placeId{[0-9]+}", async (c) => {
  const placeId = Number(c.req.param("placeId"));
  try {
    const place = await getPlace(placeId);
    if (!place) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy địa điểm" } }, 404);
    return c.json(place);
  } catch (err: any) {
    console.error("[places/get] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

placesRoute.get("/:placeId{[0-9]+}/checkins", async (c) => {
  const placeId = Number(c.req.param("placeId"));
  try {
    const checkins = await listPlaceCheckins(placeId);
    return c.json({ checkins, total: checkins.length });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

// ============================================================
// Auth-required endpoints
// ============================================================

// ── POST /upload-image — generic photo upload for place / check-in photos ──
const MAX_PLACE_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB per spec
placesRoute.post("/upload-image", requireAuth, async (c) => {
  const session = c.get("user");
  let formData: FormData;
  try { formData = await c.req.formData(); }
  catch { return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400); }

  // Accept either "file" or "photo" field for flexibility
  const file = (formData.get("file") || formData.get("photo")) as File | null;
  if (!(file instanceof File)) {
    return c.json({ error: { code: "MISSING_FILE", message: "Thiếu file (field 'file')" } }, 400);
  }
  if (file.size > MAX_PLACE_PHOTO_SIZE) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Ảnh tối đa 5MB" } }, 413);
  }
  const ext = imageExtFromMime(file.type);
  if (!ext) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ JPEG/PNG/WebP" } }, 415);
  }

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const key = `places/${session.sub}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadObject(key, buf, file.type);
    return c.json({ url, key });
  } catch (err) {
    console.error("[places/upload-image] error:", err);
    return c.json({ error: { code: "UPLOAD_FAILED", message: "Upload thất bại" } }, 500);
  }
});

placesRoute.post("/", requireAuth, async (c) => {
  const session = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 200);
  const address = String(body.address || "").trim().slice(0, 300);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const category = body.category as PlaceCategory;
  const pet_policy = body.pet_policy as PetPolicy;

  if (!name) return c.json({ error: { code: "NAME_REQUIRED", message: "Cần tên địa điểm" } }, 400);
  if (!address) return c.json({ error: { code: "ADDRESS_REQUIRED", message: "Cần địa chỉ" } }, 400);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return c.json({ error: { code: "BAD_COORDS", message: "Cần lat/lng hợp lệ" } }, 400);
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return c.json({ error: { code: "BAD_CATEGORY", message: "Loại không hợp lệ" } }, 400);
  }
  if (!VALID_POLICIES.includes(pet_policy)) {
    return c.json({ error: { code: "BAD_POLICY", message: "Chính sách không hợp lệ" } }, 400);
  }

  // Feature gate: places_submit (Pet Score ≥ 200 — anti-spam)
  try {
    const { checkFeatureAccess } = await import("../lib/feature-gates.ts");
    const { listRows } = await import("@shared/baserow.ts");
    const userPets = await listRows<any>("pets", {
      filter: { user_id__link_row_has: String(session.sub) },
      size: 1,
    });
    const firstPet = userPets.results[0];
    if (firstPet) {
      const access = await checkFeatureAccess(session.sub, firstPet.id, "places_submit");
      if (!access.allowed) {
        return c.json({ error: { code: "FEATURE_LOCKED", message: access.reason, gate: access } }, 403);
      }
    }
    // If user has no pet, we just let it through — onboarding will be redirected separately
  } catch (err) {
    console.error("[places/post] gate check failed (allowing):", err);
  }

  try {
    const place = await createPlace({
      userId: session.sub,
      name, address, lat, lng, category, pet_policy,
      amenities: Array.isArray(body.amenities) ? body.amenities.slice(0, 20) : [],
      contact_phone: body.contact_phone || null,
      contact_website: body.contact_website || null,
      photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls.slice(0, 5) : [],
    });
    return c.json(place, 201);
  } catch (err: any) {
    console.error("[places/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo địa điểm" } }, 500);
  }
});

placesRoute.post("/:placeId{[0-9]+}/checkin", requireAuth, async (c) => {
  const session = c.get("user");
  const placeId = Number(c.req.param("placeId"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const petId = Number(body.pet_id || body.petId);
  if (!petId) return c.json({ error: { code: "PET_REQUIRED", message: "Cần chọn bé để check-in" } }, 400);

  try {
    // Verify user owns the pet
    await getOwnedPet(petId, session.sub);
    // Verify place exists
    const place = await getPlace(placeId);
    if (!place) return c.json({ error: { code: "PLACE_NOT_FOUND", message: "Không tìm thấy địa điểm" } }, 404);

    const checkin = await checkIn({
      placeId,
      petId,
      userId: session.sub,
      rating: body.rating ? Number(body.rating) : 5,
      review: typeof body.review === "string" ? body.review.slice(0, 500) : undefined,
      photoUrls: Array.isArray(body.photo_urls) ? body.photo_urls.slice(0, 3) : [],
    });

    // Quest hook: real place check-in
    let completedQuests: any[] = [];
    try {
      const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
      completedQuests = await trackQuestTrigger(session.sub, petId, "place_checkin");
    } catch (err) {
      console.error("[places/checkin] quest track failed:", err);
    }

    return c.json({ ...checkin, completed_quests: completedQuests }, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[places/checkin] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi check-in" } }, 500);
  }
});

placesRoute.get("/checkin-history/:petId{[0-9]+}", requireAuth, async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const checkins = await listPetCheckins(petId);
    return c.json({ checkins, total: checkins.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
