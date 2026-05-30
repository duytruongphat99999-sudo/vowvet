/**
 * Community feed — real-time activity stream visible at /community (PUBLIC).
 *
 * Events:
 *   tier_up             — pet reached new tier (silver/gold/platinum/diamond)
 *   achievement_unlock  — non-secret achievement unlocked
 *   hero_action         — sighting confirmed (pet helper credited)
 *   new_match           — playdate mutual like → match
 *   birthday            — pet birthday today
 *
 * createCommunityEvent() is fire-and-forget from various endpoints/hooks.
 * Pet name + avatar denormalized into the row so the feed can render fast
 * without N+1 joins.
 */
import { listRows, createRow, getRow } from "@shared/baserow.ts";

export type CommunityEventType = "tier_up" | "achievement_unlock" | "hero_action" | "new_match" | "birthday";

export interface CommunityEventInput {
  eventType: CommunityEventType;
  userId: number;
  petId: number;
  eventData?: any;
  isPublic?: boolean;
}

export interface CommunityEventApi {
  id: number;
  event_type: CommunityEventType;
  user_id: number;
  pet_id: number;
  pet_name: string;
  pet_avatar_url: string | null;
  event_data: any;
  is_public: boolean;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function toApi(row: any): CommunityEventApi {
  let eventData: any = null;
  try { eventData = row.event_data ? JSON.parse(row.event_data) : null; } catch {}
  return {
    id: row.id,
    event_type: (flatVal<CommunityEventType>(row.event_type) || "achievement_unlock") as CommunityEventType,
    user_id: Number(row.user_id) || 0,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    pet_name: row.pet_name || "",
    pet_avatar_url: row.pet_avatar_url || null,
    event_data: eventData,
    is_public: row.is_public === true,
    created_at: row.created_at || "",
  };
}

export async function createCommunityEvent(input: CommunityEventInput): Promise<CommunityEventApi | null> {
  let petName = "";
  let avatar: string | null = null;
  try {
    const pet: any = await getRow("pets", input.petId);
    petName = pet.name || "";
    avatar = pet.photo_url || null;
  } catch (err) {
    // best-effort — if pet missing, skip the event (it would be useless without pet name)
    console.warn(`[community] cannot resolve pet ${input.petId}:`, String(err).slice(0, 100));
    return null;
  }

  try {
    const row: any = await createRow("community_events", {
      event_type: input.eventType,
      user_id: input.userId,
      pet_id: [input.petId],
      pet_name: petName.slice(0, 100),
      pet_avatar_url: (avatar || "").slice(0, 500),
      event_data: JSON.stringify(input.eventData || {}),
      is_public: input.isPublic !== false,
      created_at: new Date().toISOString(),
    });
    return toApi(row);
  } catch (err) {
    console.error(`[community] persist failed:`, String(err).slice(0, 200));
    return null;
  }
}

export async function getRecentCommunityEvents(limit = 30): Promise<CommunityEventApi[]> {
  const res = await listRows<any>("community_events", {
    filter: { is_public__boolean: "true" },
    size: Math.min(limit, 100),
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.event_type).map(toApi);
}
