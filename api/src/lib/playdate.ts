/**
 * Pet Playdate service (M27).
 *
 * Flow:
 *   1. Owner opts-in pet → creates playdate_profile (vaccine gate ≥2 completed)
 *   2. Discovery: feed sorted by compatibility (5 components), filter ≥30
 *   3. Swipe like/pass (rate-limited 50/day per user)
 *   4. Mutual like → match → push notification 2 chiều
 *   5. Chat (polling 5s) until 7d expiry or block
 *   6. Report ≥3 → profile auto-hidden
 *
 * Compatibility components:
 *   - species_match      (40 pts max) — must be same species for safety
 *   - personality_match  (25 pts max) — uses M15 PERSONALITY_TYPES.compatible_types
 *   - age_proximity      (15 pts max) — within 2y full, decay
 *   - size_proximity     (10 pts max) — within 30% weight full, decay
 *   - distance_proximity (10 pts max) — within 5km full, decay
 */
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";
import { findUserById, type BaserowPet } from "./users.ts";
import { PERSONALITY_TYPES, type PersonalityTypeId } from "@shared/personality-types.ts";
import { haversineDistance } from "@shared/geo.ts";
import { ageInYears } from "@shared/senior.ts";
import { sendPush } from "./web-push.ts";

// ============================================================
// Types
// ============================================================
export type LookingFor = "play_buddy" | "walking_partner" | "breeding" | "all";
export type PlayStyle = "fetch" | "wrestle" | "chase" | "calm" | "swim";
export type SwipeDirection = "like" | "pass";
export type MatchStatus = "pending" | "active" | "expired" | "blocked";
export type ReportReason = "spam" | "harassment" | "inappropriate" | "fake" | "other";

export const PLAY_STYLES: Array<{ key: PlayStyle; label_vi: string; emoji: string }> = [
  { key: "fetch", label_vi: "Ném bắt", emoji: "🎾" },
  { key: "wrestle", label_vi: "Vật lộn", emoji: "🤼" },
  { key: "chase", label_vi: "Đuổi bắt", emoji: "💨" },
  { key: "calm", label_vi: "Nhẹ nhàng", emoji: "🧘" },
  { key: "swim", label_vi: "Bơi lội", emoji: "🏊" },
];

export interface ProfileRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  user_id: number;
  bio: string | null;
  max_distance_km: number;
  looking_for: string | { id: number; value: string };
  play_styles: string | null; // JSON array
  active: boolean;
  vaccinated: boolean;
  report_count: number;
  hidden_at: string | null;
  lat: number;
  lng: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileApi {
  id: number;
  pet_id: number;
  user_id: number;
  bio: string;
  max_distance_km: number;
  looking_for: LookingFor;
  play_styles: PlayStyle[];
  active: boolean;
  vaccinated: boolean;
  report_count: number;
  hidden: boolean;
  lat: number;
  lng: number;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toProfileApi(row: ProfileRow): ProfileApi {
  let styles: PlayStyle[] = [];
  try { styles = JSON.parse(row.play_styles || "[]"); } catch {}
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    user_id: Number(row.user_id) || 0,
    bio: row.bio || "",
    max_distance_km: Number(row.max_distance_km) || 10,
    looking_for: (flatVal<LookingFor>(row.looking_for) || "play_buddy") as LookingFor,
    play_styles: styles,
    active: row.active === true,
    vaccinated: row.vaccinated === true,
    report_count: Number(row.report_count) || 0,
    hidden: !!row.hidden_at,
    lat: Number(row.lat) || 0,
    lng: Number(row.lng) || 0,
    created_at: row.created_at || "",
  };
}

// ============================================================
// Vaccine gate
// ============================================================

/** Count vaccines with status=completed for a pet. Page limit 200. */
export async function countCompletedVaccines(petId: number): Promise<number> {
  try {
    const res = await listRows<any>("vaccines", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 200,
    });
    return res.results.filter((v: any) => flatVal<string>(v.status) === "completed").length;
  } catch (err) {
    console.error(`[playdate] countCompletedVaccines pet=${petId}:`, err);
    return 0;
  }
}

export interface EligibilityResult {
  eligible: boolean;
  vaccinated: boolean;
  vaccine_count: number;
  reason?: string;
}

/** Eligibility = ≥2 completed vaccines. */
export async function checkCanCreatePlaydateProfile(petId: number): Promise<EligibilityResult> {
  const count = await countCompletedVaccines(petId);
  if (count < 2) {
    return {
      eligible: false,
      vaccinated: false,
      vaccine_count: count,
      reason: `Cần ít nhất 2 mũi vaccine đã tiêm. Hiện có ${count}. Hãy hoàn tất vaccine để bảo vệ bé khi gặp gỡ.`,
    };
  }
  return { eligible: true, vaccinated: true, vaccine_count: count };
}

// ============================================================
// CRUD profile
// ============================================================

export async function getProfileByPet(petId: number): Promise<ProfileApi | null> {
  const res = await listRows<ProfileRow>("playdate_profiles", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 1,
  });
  const row = res.results[0];
  return row ? toProfileApi(row) : null;
}

export async function getProfileById(profileId: number): Promise<ProfileApi | null> {
  try {
    const row = await getRow<ProfileRow>("playdate_profiles", profileId);
    return toProfileApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export interface UpsertProfileInput {
  petId: number;
  userId: number;
  bio?: string;
  max_distance_km?: number;
  looking_for?: LookingFor;
  play_styles?: PlayStyle[];
  active?: boolean;
  lat?: number;
  lng?: number;
}

export async function upsertProfile(input: UpsertProfileInput): Promise<ProfileApi> {
  const elig = await checkCanCreatePlaydateProfile(input.petId);
  const now = new Date().toISOString();
  const existing = await getProfileByPet(input.petId);
  const data: any = {
    pet_id: [input.petId],
    user_id: input.userId,
    bio: (input.bio || "").slice(0, 500),
    max_distance_km: Math.max(1, Math.min(100, input.max_distance_km || 10)),
    looking_for: input.looking_for || "play_buddy",
    play_styles: JSON.stringify((input.play_styles || []).slice(0, 5)),
    active: input.active !== false,
    vaccinated: elig.eligible,
    lat: input.lat || 0,
    lng: input.lng || 0,
    updated_at: now,
  };
  if (!existing) {
    const row = await createRow<ProfileRow>("playdate_profiles", {
      ...data,
      report_count: 0,
      hidden_at: null,
      created_at: now,
    });
    return toProfileApi(row);
  }
  const row = await updateRow<ProfileRow>("playdate_profiles", existing.id, data);
  return toProfileApi(row);
}

export async function deleteProfile(profileId: number): Promise<void> {
  await updateRow("playdate_profiles", profileId, { active: false });
}

// ============================================================
// Compatibility scoring
// ============================================================

export interface CompatBreakdown {
  species_match: number;
  personality_match: number;
  age_proximity: number;
  size_proximity: number;
  distance_proximity: number;
}

export interface CompatResult {
  total: number;
  breakdown: CompatBreakdown;
  distance_km: number | null;
}

interface PetInfo {
  id: number;
  species: string;
  personality?: string | null;
  age_years: number | null;
  weight_kg: number | null;
  lat: number;
  lng: number;
}

function petInfoFromPetRow(pet: BaserowPet, profile: ProfileApi): PetInfo {
  const species = flatVal<string>(pet.species) || "other";
  const personality = flatVal<string>((pet as any).personality_type) || null;
  return {
    id: pet.id,
    species,
    personality,
    age_years: ageInYears(pet.dob || undefined),
    weight_kg: pet.weight_kg ? Number(pet.weight_kg) : null,
    lat: profile.lat,
    lng: profile.lng,
  };
}

export function calculateCompatibility(a: PetInfo, b: PetInfo): CompatResult {
  // Species (must match for safety) — 40 pts
  const speciesMatch = a.species === b.species ? 40 : 0;

  // Personality (M15 compatible_types) — 25 pts
  let personalityScore = 0;
  if (a.personality && b.personality) {
    if (a.personality === b.personality) personalityScore = 20; // same = compatible-ish
    else {
      const aType = PERSONALITY_TYPES[a.personality as PersonalityTypeId];
      const bType = PERSONALITY_TYPES[b.personality as PersonalityTypeId];
      if (aType && bType) {
        const aIncludesB = aType.compatible_types.includes(b.personality as PersonalityTypeId);
        const bIncludesA = bType.compatible_types.includes(a.personality as PersonalityTypeId);
        if (aIncludesB && bIncludesA) personalityScore = 25;
        else if (aIncludesB || bIncludesA) personalityScore = 15;
      }
    }
  } else {
    personalityScore = 5; // neutral when one or both lack personality
  }

  // Age proximity — 15 pts. Within 2y full, decays to 0 at 6y diff
  let ageScore = 0;
  if (a.age_years != null && b.age_years != null) {
    const ageDiff = Math.abs(a.age_years - b.age_years);
    if (ageDiff <= 2) ageScore = 15;
    else if (ageDiff <= 4) ageScore = 10;
    else if (ageDiff <= 6) ageScore = 5;
    else ageScore = 0;
  } else {
    ageScore = 5; // partial when unknown
  }

  // Size proximity — 10 pts. Within 30% weight full
  let sizeScore = 0;
  if (a.weight_kg && b.weight_kg) {
    const ratio = Math.min(a.weight_kg, b.weight_kg) / Math.max(a.weight_kg, b.weight_kg);
    if (ratio >= 0.7) sizeScore = 10;
    else if (ratio >= 0.5) sizeScore = 6;
    else if (ratio >= 0.3) sizeScore = 3;
    else sizeScore = 0;
  } else {
    sizeScore = 3;
  }

  // Distance proximity — 10 pts. Within 5km full, decays to 0 at 50km
  let distanceKm: number | null = null;
  let distanceScore = 0;
  if (a.lat && a.lng && b.lat && b.lng) {
    distanceKm = haversineDistance(a.lat, a.lng, b.lat, b.lng);
    if (distanceKm <= 5) distanceScore = 10;
    else if (distanceKm <= 15) distanceScore = 7;
    else if (distanceKm <= 30) distanceScore = 4;
    else if (distanceKm <= 50) distanceScore = 1;
    else distanceScore = 0;
  } else {
    distanceScore = 3;
  }

  const total = speciesMatch + personalityScore + ageScore + sizeScore + distanceScore;
  return {
    total,
    distance_km: distanceKm,
    breakdown: {
      species_match: speciesMatch,
      personality_match: personalityScore,
      age_proximity: ageScore,
      size_proximity: sizeScore,
      distance_proximity: distanceScore,
    },
  };
}

// ============================================================
// Discovery feed
// ============================================================

export interface DiscoveryCandidate {
  profile: ProfileApi;
  pet: {
    id: number;
    name: string;
    species: string;
    breed: string | null;
    age_years: number | null;
    weight_kg: number | null;
    photo_url: string | null;
    personality_type: string | null;
  };
  compatibility: CompatResult;
}

/** Sorted by compatibility, filter ≥30 total, exclude already-swiped. */
export async function getDiscoveryCandidates(
  myPetId: number,
  myUserId: number,
  limit = 50
): Promise<DiscoveryCandidate[]> {
  const myProfile = await getProfileByPet(myPetId);
  if (!myProfile) return [];
  const myPet = await getRow<BaserowPet>("pets", myPetId);
  const myInfo = petInfoFromPetRow(myPet, myProfile);
  const mySpecies = myInfo.species;

  // Get all active profiles (not hidden, not self, not my own user's pets)
  const res = await listRows<ProfileRow>("playdate_profiles", {
    filter: { active__boolean: "true", vaccinated__boolean: "true" },
    size: 200,
  });

  // Get swipes I've already made (to exclude)
  const swipeRes = await listRows<any>("playdate_swipes", {
    filter: { from_pet_id__link_row_has: String(myPetId) },
    size: 200,
  });
  const swipedIds = new Set<number>(swipeRes.results.map((s) => (s.to_pet_id || [])[0]?.id).filter(Boolean));

  const candidates: DiscoveryCandidate[] = [];
  for (const row of res.results) {
    const profile = toProfileApi(row);
    if (profile.hidden) continue;
    if (profile.pet_id === myPetId) continue;
    if (profile.user_id === myUserId) continue;
    if (swipedIds.has(profile.pet_id)) continue;

    // Load other pet
    let otherPet: BaserowPet;
    try { otherPet = await getRow<BaserowPet>("pets", profile.pet_id); }
    catch { continue; }
    const otherInfo = petInfoFromPetRow(otherPet, profile);

    // Cross-species hard skip (safety)
    if (otherInfo.species !== mySpecies) continue;

    const compat = calculateCompatibility(myInfo, otherInfo);
    if (compat.total < 30) continue;

    // Max distance respect from MY profile
    if (compat.distance_km != null && compat.distance_km > myProfile.max_distance_km) continue;

    candidates.push({
      profile,
      pet: {
        id: otherPet.id,
        name: otherPet.name || "",
        species: otherInfo.species,
        breed: otherPet.breed || null,
        age_years: otherInfo.age_years,
        weight_kg: otherInfo.weight_kg,
        photo_url: otherPet.photo_url || null,
        personality_type: otherInfo.personality || null,
      },
      compatibility: compat,
    });
  }

  candidates.sort((a, b) => b.compatibility.total - a.compatibility.total);
  return candidates.slice(0, limit);
}

// ============================================================
// Swipes + matches
// ============================================================

const RATE_LIMIT_SWIPES_PER_DAY = 50;

export interface SwipeResult {
  swipe_recorded: boolean;
  matched: boolean;
  match_id?: number;
  rate_limited?: boolean;
  swipes_today: number;
}

export async function countSwipesToday(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const res = await listRows<any>("playdate_swipes", {
      filter: {
        user_id__equal: String(userId),
        created_at__date_after_or_equal: since.slice(0, 10),
      },
      size: 200,
    });
    return res.results.length;
  } catch {
    return 0;
  }
}

export async function recordSwipe(
  fromPetId: number,
  toPetId: number,
  userId: number,
  direction: SwipeDirection
): Promise<SwipeResult> {
  // Rate limit by user (50/day)
  const swipesToday = await countSwipesToday(userId);
  if (swipesToday >= RATE_LIMIT_SWIPES_PER_DAY) {
    return { swipe_recorded: false, matched: false, rate_limited: true, swipes_today: swipesToday };
  }

  await createRow("playdate_swipes", {
    from_pet_id: [fromPetId],
    to_pet_id: [toPetId],
    user_id: userId,
    direction,
    created_at: new Date().toISOString(),
  });

  // If pass → done
  if (direction === "pass") {
    return { swipe_recorded: true, matched: false, swipes_today: swipesToday + 1 };
  }

  // If like → check for reciprocal like
  const reciprocalRes = await listRows<any>("playdate_swipes", {
    filter: {
      from_pet_id__link_row_has: String(toPetId),
      to_pet_id__link_row_has: String(fromPetId),
    },
    size: 5,
  });
  const reciprocal = reciprocalRes.results.find((s) => flatVal<string>(s.direction) === "like");
  if (!reciprocal) {
    return { swipe_recorded: true, matched: false, swipes_today: swipesToday + 1 };
  }

  // MUTUAL LIKE → create match (idempotent)
  const otherUserId = Number(reciprocal.user_id);
  const petA = Math.min(fromPetId, toPetId);
  const petB = Math.max(fromPetId, toPetId);
  const userA = petA === fromPetId ? userId : otherUserId;
  const userB = petA === fromPetId ? otherUserId : userId;

  const existingMatch = await listRows<any>("playdate_matches", {
    filter: { pet_a_id__link_row_has: String(petA), pet_b_id__link_row_has: String(petB) },
    size: 1,
  });
  let matchId: number;
  if (existingMatch.results.length > 0) {
    matchId = existingMatch.results[0].id;
  } else {
    const m = await createRow<any>("playdate_matches", {
      pet_a_id: [petA],
      pet_b_id: [petB],
      user_a_id: userA,
      user_b_id: userB,
      status: "pending",
      matched_at: new Date().toISOString(),
      last_message_at: null,
      last_message_by_user: 0,
      block_reason: null,
      blocked_by_user: 0,
    });
    matchId = m.id;

    // Push notifications 2-way
    pushMatchNotification(userA, userB, fromPetId, toPetId).catch((err) =>
      console.error("[playdate] match push fail:", err)
    );
  }

  return { swipe_recorded: true, matched: true, match_id: matchId, swipes_today: swipesToday + 1 };
}

async function pushMatchNotification(userA: number, userB: number, petX: number, petY: number): Promise<void> {
  for (const uid of [userA, userB]) {
    try {
      const user = await findUserById(uid);
      if (!user) continue;
      const sub = (user as any).push_subscription;
      if (!sub) continue;
      await sendPush(
        uid,
        sub,
        {
          title: "🐾 Match mới trên Playdate!",
          body: "Bé của bạn vừa match với một người bạn mới. Vào nói lời chào nhé!",
          data: { url: "/playdate/matches", playdate_match: true },
        },
        { type: "vaccine_reminder" }
      );
    } catch (err) {
      console.error(`[playdate] push fail user=${uid}:`, err);
    }
  }
}

// ============================================================
// Matches API
// ============================================================

export interface MatchRow {
  id: number;
  pet_a_id: Array<{ id: number; value: string }>;
  pet_b_id: Array<{ id: number; value: string }>;
  user_a_id: number;
  user_b_id: number;
  status: string | { id: number; value: string };
  matched_at: string;
  last_message_at: string | null;
  last_message_by_user: number;
  block_reason: string | null;
  blocked_by_user: number;
}

export interface MatchApi {
  id: number;
  pet_a_id: number;
  pet_b_id: number;
  user_a_id: number;
  user_b_id: number;
  status: MatchStatus;
  matched_at: string;
  last_message_at: string | null;
  last_message_by_user: number;
  is_blocked: boolean;
  blocked_by_user: number;
  other_pet_id?: number;
  other_user_id?: number;
}

export function toMatchApi(row: MatchRow, viewerUserId?: number): MatchApi {
  const petA = (row.pet_a_id || [])[0]?.id ?? 0;
  const petB = (row.pet_b_id || [])[0]?.id ?? 0;
  const userA = Number(row.user_a_id) || 0;
  const userB = Number(row.user_b_id) || 0;
  const m: MatchApi = {
    id: row.id,
    pet_a_id: petA,
    pet_b_id: petB,
    user_a_id: userA,
    user_b_id: userB,
    status: (flatVal<MatchStatus>(row.status) || "pending") as MatchStatus,
    matched_at: row.matched_at || "",
    last_message_at: row.last_message_at || null,
    last_message_by_user: Number(row.last_message_by_user) || 0,
    is_blocked: flatVal<string>(row.status) === "blocked",
    blocked_by_user: Number(row.blocked_by_user) || 0,
  };
  if (viewerUserId != null) {
    if (viewerUserId === userA) {
      m.other_pet_id = petB;
      m.other_user_id = userB;
    } else if (viewerUserId === userB) {
      m.other_pet_id = petA;
      m.other_user_id = userA;
    }
  }
  return m;
}

export async function getMatch(matchId: number): Promise<MatchApi | null> {
  try {
    const row = await getRow<MatchRow>("playdate_matches", matchId);
    return toMatchApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function listMatchesForUser(userId: number): Promise<MatchApi[]> {
  const aRes = await listRows<MatchRow>("playdate_matches", {
    filter: { user_a_id__equal: String(userId) },
    size: 100,
    orderBy: "-matched_at",
  });
  const bRes = await listRows<MatchRow>("playdate_matches", {
    filter: { user_b_id__equal: String(userId) },
    size: 100,
    orderBy: "-matched_at",
  });
  const all = [...aRes.results, ...bRes.results]
    .filter((r) => r.matched_at && flatVal<string>(r.status) !== "expired")
    .map((r) => toMatchApi(r, userId));
  // Dedupe by id (shouldn't overlap, but safety)
  const seen = new Set<number>();
  return all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .sort((x, y) => (y.last_message_at || y.matched_at).localeCompare(x.last_message_at || x.matched_at));
}

export async function blockMatch(matchId: number, byUserId: number, reason: string): Promise<MatchApi> {
  const row = await updateRow<MatchRow>("playdate_matches", matchId, {
    status: "blocked",
    blocked_by_user: byUserId,
    block_reason: reason.slice(0, 500),
  });
  return toMatchApi(row);
}

// ============================================================
// Messages
// ============================================================

export interface MessageRow {
  id: number;
  match_id: number;
  sender_user_id: number;
  sender_pet_id: number;
  body: string;
  sent_at: string;
}

export interface MessageApi {
  id: number;
  match_id: number;
  sender_user_id: number;
  sender_pet_id: number;
  body: string;
  sent_at: string;
}

export function toMessageApi(row: MessageRow): MessageApi {
  return {
    id: row.id,
    match_id: Number(row.match_id) || 0,
    sender_user_id: Number(row.sender_user_id) || 0,
    sender_pet_id: Number(row.sender_pet_id) || 0,
    body: row.body || "",
    sent_at: row.sent_at || "",
  };
}

export async function listMessages(matchId: number, limit = 100): Promise<MessageApi[]> {
  const res = await listRows<MessageRow>("playdate_messages", {
    filter: { match_id__equal: String(matchId) },
    size: Math.min(limit, 200),
    orderBy: "sent_at", // oldest first for chat display
  });
  return res.results.filter((r) => r.body).map(toMessageApi);
}

export async function sendMessage(
  matchId: number,
  senderUserId: number,
  senderPetId: number,
  body: string
): Promise<MessageApi> {
  const now = new Date().toISOString();
  const m = await createRow<MessageRow>("playdate_messages", {
    match_id: matchId,
    sender_user_id: senderUserId,
    sender_pet_id: senderPetId,
    body: body.slice(0, 2000),
    sent_at: now,
  });
  // Update match status to active + bump last_message_at
  const match = await getMatch(matchId);
  if (match) {
    await updateRow("playdate_matches", matchId, {
      status: match.status === "pending" ? "active" : match.status,
      last_message_at: now,
      last_message_by_user: senderUserId,
    });
    // Push to recipient
    const recipientUserId = match.user_a_id === senderUserId ? match.user_b_id : match.user_a_id;
    pushMessageNotification(recipientUserId, matchId, body).catch((err) =>
      console.error("[playdate] msg push fail:", err)
    );
  }
  return toMessageApi(m);
}

async function pushMessageNotification(recipientUserId: number, matchId: number, body: string): Promise<void> {
  try {
    const user = await findUserById(recipientUserId);
    if (!user) return;
    const sub = (user as any).push_subscription;
    if (!sub) return;
    await sendPush(
      recipientUserId,
      sub,
      {
        title: "💬 Tin nhắn Playdate mới",
        body: body.length > 80 ? body.slice(0, 80) + "..." : body,
        data: { url: `/playdate/chat/${matchId}`, playdate_message: true },
      },
      { type: "vaccine_reminder" }
    );
  } catch (err) {
    console.error(`[playdate] msg push user=${recipientUserId}:`, err);
  }
}

// ============================================================
// Reports
// ============================================================

const AUTO_HIDE_REPORT_THRESHOLD = 3;

export async function reportPet(
  reporterUserId: number,
  reportedPetId: number,
  reportedUserId: number,
  reason: ReportReason,
  notes?: string
): Promise<{ report_id: number; auto_hidden: boolean }> {
  await createRow("playdate_reports", {
    reporter_user_id: reporterUserId,
    reported_pet_id: [reportedPetId],
    reported_user_id: reportedUserId,
    reason,
    notes: (notes || "").slice(0, 1000) || null,
    reviewed: false,
    admin_notes: null,
    created_at: new Date().toISOString(),
  });

  // Increment report_count on profile, auto-hide if ≥3
  const profile = await getProfileByPet(reportedPetId);
  let autoHidden = false;
  if (profile) {
    const newCount = profile.report_count + 1;
    const updates: any = { report_count: newCount };
    if (newCount >= AUTO_HIDE_REPORT_THRESHOLD && !profile.hidden) {
      updates.hidden_at = new Date().toISOString();
      updates.active = false;
      autoHidden = true;
    }
    await updateRow("playdate_profiles", profile.id, updates);
  }

  // Count reports for return data
  const r = await listRows<any>("playdate_reports", {
    filter: { reported_pet_id__link_row_has: String(reportedPetId) },
    size: 50,
  });
  return { report_id: r.results.length, auto_hidden: autoHidden };
}

// ============================================================
// Expiry sweep (cron Job 10)
// ============================================================

const EXPIRY_DAYS = 7;

/** Expire pending matches with no messages after 7d. */
export async function expirePendingMatches(): Promise<{ scanned: number; expired: number }> {
  const cutoff = new Date(Date.now() - EXPIRY_DAYS * 24 * 3600 * 1000);
  const res = await listRows<MatchRow>("playdate_matches", {
    filter: { status__contains: "pending" },
    size: 200,
  });
  let expired = 0;
  for (const row of res.results) {
    if (flatVal<string>(row.status) !== "pending") continue;
    if (!row.matched_at) continue;
    if (row.last_message_at) continue; // has chat → not expired
    const matchedAt = new Date(row.matched_at);
    if (Number.isNaN(matchedAt.getTime())) continue;
    if (matchedAt > cutoff) continue;
    try {
      await updateRow("playdate_matches", row.id, { status: "expired" });
      expired++;
    } catch (err) {
      console.error(`[playdate] expire match=${row.id}:`, err);
    }
  }
  return { scanned: res.results.length, expired };
}
