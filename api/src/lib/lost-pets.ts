/**
 * Lost Pet Network service (M20).
 *
 * - Haversine distance
 * - 8-char slug generation (URL-safe)
 * - Broadcast push to users with active push_subscription
 *   (Phase 0: broadcast to ALL push-enabled users, geo-filter when user lat/lng added)
 * - Sighting CRUD + verified flag
 * - Vet partners list
 */
import { listRows, getRow, createRow, updateRow } from "@shared/baserow.ts";
import { sendPush } from "./web-push.ts";

// ================================================================
// Types
// ================================================================

export type LostStatus = "active" | "found" | "cancelled" | "resolved_no_match";

export interface LostReportRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  reporter_user_id: number;
  status: string | { id: number; value: string };
  last_seen_location: string;
  last_seen_lat: number;
  last_seen_lng: number;
  last_seen_at: string;
  circumstances: string | null;
  distinguishing_features: string | null;
  contact_phone: string;
  contact_phone_public: boolean;
  reward_amount: number;
  broadcast_radius_km: number;
  broadcast_count: number;
  sighting_count: number;
  created_at: string;
  resolved_at: string | null;
  public_url_slug: string;
  // Upgrade fields
  reference_photo_urls: string | null;
  reward_tier: string | { id: number; value: string } | null;
  reward_status: string | { id: number; value: string } | null;
  reward_recipient_id: number | null;
  reward_paid_at: string | null;
}

export interface LostReportApi {
  id: number;
  pet_id: number;
  reporter_user_id: number;
  status: LostStatus;
  last_seen_location: string;
  last_seen_lat: number;
  last_seen_lng: number;
  last_seen_at: string;
  circumstances: string;
  distinguishing_features: string;
  contact_phone: string;
  contact_phone_public: boolean;
  reward_amount: number;
  broadcast_radius_km: number;
  broadcast_count: number;
  sighting_count: number;
  created_at: string;
  resolved_at: string | null;
  public_url_slug: string;
  // Upgrade fields
  reference_photo_urls: string[];
  reward_tier: "none" | "bronze" | "silver" | "gold" | "diamond" | "custom";
  reward_status: "promised" | "paid_out" | "unclaimed";
  reward_recipient_id: number | null;
  reward_paid_at: string | null;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toReportApi(row: LostReportRow): LostReportApi {
  const petLink = (row.pet_id || [])[0];
  const status = flatVal<string>(row.status) as LostStatus;
  let refPhotos: string[] = [];
  try { refPhotos = JSON.parse(row.reference_photo_urls || "[]"); } catch {}
  const rewardTier = (flatVal<string>(row.reward_tier) || "none") as LostReportApi["reward_tier"];
  const rewardStatus = (flatVal<string>(row.reward_status) || "unclaimed") as LostReportApi["reward_status"];
  return {
    id: row.id,
    pet_id: petLink?.id ?? 0,
    reporter_user_id: Number(row.reporter_user_id) || 0,
    status: (["active", "found", "cancelled", "resolved_no_match"].includes(status) ? status : "active") as LostStatus,
    last_seen_location: row.last_seen_location || "",
    last_seen_lat: Number(row.last_seen_lat) || 0,
    last_seen_lng: Number(row.last_seen_lng) || 0,
    last_seen_at: row.last_seen_at || "",
    circumstances: row.circumstances || "",
    distinguishing_features: row.distinguishing_features || "",
    contact_phone: row.contact_phone || "",
    contact_phone_public: row.contact_phone_public === true,
    reward_amount: Number(row.reward_amount) || 0,
    broadcast_radius_km: Number(row.broadcast_radius_km) || 5,
    broadcast_count: Number(row.broadcast_count) || 0,
    sighting_count: Number(row.sighting_count) || 0,
    created_at: row.created_at || "",
    resolved_at: row.resolved_at || null,
    public_url_slug: row.public_url_slug || "",
    reference_photo_urls: refPhotos,
    reward_tier: rewardTier,
    reward_status: rewardStatus,
    reward_recipient_id: row.reward_recipient_id != null ? Number(row.reward_recipient_id) : null,
    reward_paid_at: row.reward_paid_at || null,
  };
}

// ================================================================
// Slug generation
// ================================================================

const SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789"; // exclude o,1,l,0 for clarity
export function generateReportSlug(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    out += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
  }
  return out;
}

// ================================================================
// Haversine distance (km)
// ================================================================

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ================================================================
// CRUD
// ================================================================

export async function findReportBySlug(slug: string): Promise<LostReportApi | null> {
  if (!slug || !/^[a-z0-9]{6,16}$/.test(slug)) return null;
  const res = await listRows<LostReportRow>("lost_pet_reports", {
    filter: { public_url_slug__equal: slug },
    size: 1,
  });
  return res.results[0] ? toReportApi(res.results[0]) : null;
}

export async function getReportById(reportId: number): Promise<LostReportApi | null> {
  try {
    const row = await getRow<LostReportRow>("lost_pet_reports", reportId);
    return toReportApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function listReportsByUser(userId: number): Promise<LostReportApi[]> {
  const res = await listRows<LostReportRow>("lost_pet_reports", {
    filter: { reporter_user_id__equal: String(userId) },
    size: 50,
  });
  return res.results.filter((r) => r.public_url_slug).map(toReportApi);
}

export async function listActiveNearby(lat: number, lng: number, radiusKm: number): Promise<Array<LostReportApi & { distance_km: number }>> {
  // Phase 0: fetch all active, filter by haversine client-side
  const res = await listRows<LostReportRow>("lost_pet_reports", {
    filter: { status__contains: "active" },
    size: 200,
  });
  const all = res.results.map(toReportApi).filter((r) => r.status === "active");
  return all
    .map((r) => ({ ...r, distance_km: haversineDistance(lat, lng, r.last_seen_lat, r.last_seen_lng) }))
    .filter((r) => r.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
}

export async function listActivePetActiveReport(petId: number): Promise<LostReportApi | null> {
  const res = await listRows<LostReportRow>("lost_pet_reports", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 10,
  });
  const active = res.results.map(toReportApi).find((r) => r.status === "active");
  return active || null;
}

// ================================================================
// Create + broadcast
// ================================================================

export interface CreateReportInput {
  petId: number;
  reporterId: number;
  last_seen_location: string;
  last_seen_lat: number;
  last_seen_lng: number;
  last_seen_at: string;
  circumstances: string;
  distinguishing_features: string;
  contact_phone: string;
  contact_phone_public: boolean;
  reward_amount?: number;
  broadcast_radius_km?: number;
  reference_photo_urls?: string[];
  reward_tier?: "none" | "bronze" | "silver" | "gold" | "diamond" | "custom";
}

export async function createReport(input: CreateReportInput): Promise<LostReportApi> {
  let slug = generateReportSlug();
  // Make sure unique (very low collision chance with 32^8 keyspace, but check)
  for (let i = 0; i < 3; i++) {
    const existing = await findReportBySlug(slug);
    if (!existing) break;
    slug = generateReportSlug();
  }
  const refPhotos = (input.reference_photo_urls || []).slice(0, 5);
  const row = await createRow<LostReportRow>("lost_pet_reports", {
    pet_id: [input.petId],
    reporter_user_id: input.reporterId,
    status: "active",
    last_seen_location: input.last_seen_location.slice(0, 500),
    last_seen_lat: input.last_seen_lat,
    last_seen_lng: input.last_seen_lng,
    last_seen_at: input.last_seen_at,
    circumstances: input.circumstances.slice(0, 1000),
    distinguishing_features: input.distinguishing_features.slice(0, 500),
    contact_phone: input.contact_phone,
    contact_phone_public: input.contact_phone_public,
    reward_amount: input.reward_amount || 0,
    broadcast_radius_km: input.broadcast_radius_km || 5,
    broadcast_count: 0,
    sighting_count: 0,
    created_at: new Date().toISOString(),
    resolved_at: null,
    public_url_slug: slug,
    reference_photo_urls: JSON.stringify(refPhotos),
    reward_tier: input.reward_tier || "none",
    reward_status: (input.reward_amount || 0) > 0 ? "promised" : "unclaimed",
    reward_recipient_id: null,
    reward_paid_at: null,
  });
  return toReportApi(row);
}

export async function updateReportStatus(reportId: number, status: LostStatus): Promise<LostReportApi> {
  const updates: Record<string, any> = { status };
  if (status === "found" || status === "resolved_no_match" || status === "cancelled") {
    updates.resolved_at = new Date().toISOString();
  }
  const row = await updateRow<LostReportRow>("lost_pet_reports", reportId, updates);
  return toReportApi(row);
}

// ================================================================
// Broadcast push (Phase 0: all users with push_subscription)
// ================================================================

const APP_DOMAIN = process.env.APP_DOMAIN || "https://vowvet.monminpet.com";

export async function broadcastLostPet(
  report: LostReportApi,
  pet: { name: string; species?: string | null; photo_url?: string | null }
): Promise<{ count: number; errors: number }> {
  const res = await listRows<any>("users", { size: 200 });
  const users = res.results.filter((u: any) => u.push_subscription && !u.deleted_at && u.id !== report.reporter_user_id);

  let count = 0;
  let errors = 0;
  const BATCH = 50;
  for (let i = 0; i < users.length; i += BATCH) {
    const slice = users.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (u: any) => {
        try {
          const { getRewardPushSuffix } = await import("./lost-pet-rewards.ts");
          const rewardSuffix = getRewardPushSuffix(report.reward_amount);
          const r = await sendPush(
            u.id,
            u.push_subscription,
            {
              title: `🚨 Bé ${pet.name} đang mất gần bạn${rewardSuffix}`,
              body: `${report.last_seen_location.slice(0, 80)} · Nếu thấy, gọi 0779029133`,
              icon: pet.photo_url || "/favicon.svg",
              data: { url: `/lost/${report.public_url_slug}`, lost_report_id: report.id },
            },
            { type: "alert_push", bypassRateLimit: true }
          );
          if (r.ok) count++;
          else errors++;
        } catch (err) {
          errors++;
        }
      })
    );
  }

  // Update broadcast_count
  try {
    await updateRow("lost_pet_reports", report.id, { broadcast_count: count });
  } catch (_) {}

  return { count, errors };
}

// ================================================================
// Sightings
// ================================================================

export interface SightingRow {
  id: number;
  report_id: number;
  spotter_user_id: number | null;
  reporter_user_id: number | null;
  spotter_name: string;
  spotter_phone: string;
  sighting_lat: number;
  sighting_lng: number;
  sighting_address: string;
  sighting_at: string;
  description: string;
  photo_key: string | null;
  photo_url: string | null;
  verified: boolean;
  created_at: string;
  // AI Match
  ai_match_score: number;
  ai_match_confidence: string | { id: number; value: string } | null;
  ai_match_analysis: string | null;
  ai_processed_at: string | null;
  ai_is_mock: boolean;
  match_threshold_passed: boolean;
  // Status
  status: string | { id: number; value: string } | null;
  confirmed_at: string | null;
  geocoded_method: string | { id: number; value: string } | null;
}

export interface SightingApi {
  id: number;
  report_id: number;
  spotter_user_id: number | null;
  reporter_user_id: number | null;
  spotter_name: string;
  spotter_phone: string;
  sighting_lat: number;
  sighting_lng: number;
  sighting_address: string;
  sighting_at: string;
  description: string;
  photo_url: string | null;
  verified: boolean;
  created_at: string;
  ai_match_score: number;
  ai_match_confidence: "high" | "medium" | "low" | "failed" | null;
  ai_match_analysis: string;
  ai_matching_features: string[];
  ai_differences: string[];
  ai_processed_at: string | null;
  ai_is_mock: boolean;
  match_threshold_passed: boolean;
  status: "pending" | "confirmed_by_owner" | "dismissed_by_owner" | "resolved";
  confirmed_at: string | null;
  geocoded_method: "user_pick" | "address_lookup" | "none";
}

export function toSightingApi(row: SightingRow): SightingApi {
  // ai_match_analysis is stored as either plain text OR JSON {analysis, matching_features, differences}
  let analysisText = "";
  let matchingFeatures: string[] = [];
  let differences: string[] = [];
  if (row.ai_match_analysis) {
    try {
      const parsed = JSON.parse(row.ai_match_analysis);
      analysisText = parsed.analysis || "";
      matchingFeatures = Array.isArray(parsed.matching_features) ? parsed.matching_features : [];
      differences = Array.isArray(parsed.differences) ? parsed.differences : [];
    } catch {
      analysisText = row.ai_match_analysis;
    }
  }
  return {
    id: row.id,
    report_id: Number(row.report_id) || 0,
    spotter_user_id: row.spotter_user_id != null ? Number(row.spotter_user_id) : null,
    reporter_user_id: row.reporter_user_id != null ? Number(row.reporter_user_id) : null,
    spotter_name: row.spotter_name || "",
    spotter_phone: row.spotter_phone || "",
    sighting_lat: Number(row.sighting_lat) || 0,
    sighting_lng: Number(row.sighting_lng) || 0,
    sighting_address: row.sighting_address || "",
    sighting_at: row.sighting_at || "",
    description: row.description || "",
    photo_url: row.photo_url || null,
    verified: row.verified === true,
    created_at: row.created_at || "",
    ai_match_score: Number(row.ai_match_score) || 0,
    ai_match_confidence: (flatVal<any>(row.ai_match_confidence) || null) as SightingApi["ai_match_confidence"],
    ai_match_analysis: analysisText,
    ai_matching_features: matchingFeatures,
    ai_differences: differences,
    ai_processed_at: row.ai_processed_at || null,
    ai_is_mock: row.ai_is_mock === true,
    match_threshold_passed: row.match_threshold_passed === true,
    status: (flatVal<string>(row.status) || "pending") as SightingApi["status"],
    confirmed_at: row.confirmed_at || null,
    geocoded_method: (flatVal<string>(row.geocoded_method) || "none") as SightingApi["geocoded_method"],
  };
}

export interface CreateSightingInput {
  reportId: number;
  spotterUserId?: number | null;
  reporterUserId?: number | null; // authenticated submitter (for hero acts)
  spotterName: string;
  spotterPhone: string;
  sightingLat?: number | null;
  sightingLng?: number | null;
  sightingAddress: string;
  sightingAt: string;
  description: string;
  photoKey?: string | null;
  photoUrl?: string | null;
  verified?: boolean;
  geocodedMethod?: "user_pick" | "address_lookup" | "none";
}

export async function createSighting(input: CreateSightingInput): Promise<SightingApi> {
  const row = await createRow<SightingRow>("lost_pet_sightings", {
    report_id: input.reportId,
    spotter_user_id: input.spotterUserId ?? null,
    reporter_user_id: input.reporterUserId ?? null,
    spotter_name: input.spotterName.slice(0, 60),
    spotter_phone: input.spotterPhone.slice(0, 20),
    sighting_lat: input.sightingLat ?? 0,
    sighting_lng: input.sightingLng ?? 0,
    sighting_address: input.sightingAddress.slice(0, 300),
    sighting_at: input.sightingAt,
    description: (input.description || "").slice(0, 1000),
    photo_key: input.photoKey || null,
    photo_url: input.photoUrl || null,
    verified: input.verified === true,
    created_at: new Date().toISOString(),
    status: "pending",
    geocoded_method: input.geocodedMethod || (input.sightingLat && input.sightingLng ? "user_pick" : "none"),
    ai_match_score: 0,
    ai_is_mock: false,
    match_threshold_passed: false,
  });
  // Bump sighting count on parent
  try {
    const parent = await getRow<LostReportRow>("lost_pet_reports", input.reportId);
    const cur = Number(parent.sighting_count) || 0;
    await updateRow("lost_pet_reports", input.reportId, { sighting_count: cur + 1 });
  } catch (_) {}
  return toSightingApi(row);
}

// ============================================================
// AI Match hook (called after createSighting + photo upload)
// ============================================================

export async function attachAIMatchToSighting(sightingId: number, params: {
  petName: string;
  species: string;
  breed?: string | null;
  color?: string | null;
  distinctive_marks?: string | null;
  reference_photo_urls: string[];
  sighting_photo_url: string;
}): Promise<{
  score: number;
  confidence: "high" | "medium" | "low" | "failed";
  threshold_passed: boolean;
  is_mock: boolean;
}> {
  const { matchPetSighting, shouldNotifyOwner } = await import("./lost-pet-vision.ts");
  const result = await matchPetSighting({
    lostPet: {
      name: params.petName,
      species: params.species,
      breed: params.breed,
      color: params.color,
      distinctive_marks: params.distinctive_marks,
      reference_photo_urls: params.reference_photo_urls,
    },
    sightingPhotoUrl: params.sighting_photo_url,
  });
  const threshold = shouldNotifyOwner(result.match_score, result.confidence);
  await updateRow("lost_pet_sightings", sightingId, {
    ai_match_score: result.match_score,
    ai_match_confidence: result.confidence,
    ai_match_analysis: JSON.stringify({
      analysis: result.analysis,
      matching_features: result.matching_features,
      differences: result.differences,
    }),
    ai_processed_at: new Date().toISOString(),
    ai_is_mock: result.is_mock,
    match_threshold_passed: threshold,
  });
  return {
    score: result.match_score,
    confidence: result.confidence,
    threshold_passed: threshold,
    is_mock: result.is_mock,
  };
}

export async function getSightingById(sightingId: number): Promise<SightingApi | null> {
  try {
    const row = await getRow<SightingRow>("lost_pet_sightings", sightingId);
    return toSightingApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function listSightings(reportId: number): Promise<SightingApi[]> {
  const res = await listRows<SightingRow>("lost_pet_sightings", {
    filter: { report_id__equal: String(reportId) },
    size: 100,
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.spotter_name).map(toSightingApi);
}

// ================================================================
// Vet partners
// ================================================================

export interface VetPartnerRow {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  email: string;
  can_scan_qr: boolean;
  can_scan_nose_print: boolean;
  verified: boolean;
  active: boolean;
}

export async function listActiveVetPartners(): Promise<VetPartnerRow[]> {
  const res = await listRows<VetPartnerRow>("vet_partners", {
    filter: { active__boolean: "true" },
    size: 100,
  });
  return res.results.filter((r) => r.name);
}

// ================================================================
// QR scan match
// ================================================================

export async function matchScannedPet(qrPetId: number): Promise<LostReportApi | null> {
  return listActivePetActiveReport(qrPetId);
}
