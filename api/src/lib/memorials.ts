/**
 * Memorial Hall service (M30).
 *
 * LEGAL: Free tier hoạt động đầy đủ. Premium tiers (tribute/lifetime/pro)
 * KHÔNG xử lý payment, CHỈ thu thập "interest" qua memorial_interest table.
 * Strategy doc cảnh báo "sai một cái là phốt thảm" → tránh hứa cremation services.
 */
import { listRows, createRow, getRow, updateRow, deleteRow } from "@shared/baserow.ts";

export type MemorialTier = "free" | "tribute" | "lifetime" | "pro";
export type MemorialStatus = "active" | "private" | "archived";

// ============================================================
// Types
// ============================================================

export interface MemorialRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  user_id: number;
  passed_away_date: string | null;
  tribute_message: string | null;
  cover_photo_url: string | null;
  photo_urls: string | null; // JSON array
  music_url: string | null;
  memorial_status: string | { id: number; value: string };
  tier: string | { id: number; value: string };
  public_slug: string;
  visitor_count: number;
  candles_lit_count: number;
  anniversary_reminder_year: number;
  created_at: string;
}

export interface MemorialApi {
  id: number;
  pet_id: number;
  user_id: number;
  passed_away_date: string | null;
  tribute_message: string;
  cover_photo_url: string | null;
  photo_urls: string[];
  music_url: string | null;
  memorial_status: MemorialStatus;
  tier: MemorialTier;
  public_slug: string;
  public_url: string;
  visitor_count: number;
  candles_lit_count: number;
  anniversary_reminder_year: number;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

const PUBLIC_BASE = process.env.WEB_PUBLIC_URL || "https://vowvet.monminpet.com";

export function toApi(row: MemorialRow): MemorialApi {
  let photos: string[] = [];
  try { photos = JSON.parse(row.photo_urls || "[]"); } catch {}
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    user_id: Number(row.user_id) || 0,
    passed_away_date: row.passed_away_date || null,
    tribute_message: row.tribute_message || "",
    cover_photo_url: row.cover_photo_url || null,
    photo_urls: photos,
    music_url: row.music_url || null,
    memorial_status: (flatVal<MemorialStatus>(row.memorial_status) || "active") as MemorialStatus,
    tier: (flatVal<MemorialTier>(row.tier) || "free") as MemorialTier,
    public_slug: row.public_slug || "",
    public_url: row.public_slug ? `${PUBLIC_BASE}/memorial/${row.public_slug}` : "",
    visitor_count: Number(row.visitor_count) || 0,
    candles_lit_count: Number(row.candles_lit_count) || 0,
    anniversary_reminder_year: Number(row.anniversary_reminder_year) || 0,
    created_at: row.created_at || "",
  };
}

// ============================================================
// Slug generation
// ============================================================
function genSlug(): string {
  // 8 char alphanumeric uppercase + dash + 2 char (e.g. "K9X4MZ8P-A2")
  // No lowercase to avoid case-sensitivity issues in URL (M20 lesson)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  s += "-";
  for (let i = 0; i < 2; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ============================================================
// CRUD memorials
// ============================================================

export interface CreateMemorialInput {
  petId: number;
  userId: number;
  passed_away_date?: string | null;
  tribute_message?: string;
  cover_photo_url?: string | null;
  photo_urls?: string[];
  music_url?: string | null;
  memorial_status?: MemorialStatus;
}

export async function createMemorial(input: CreateMemorialInput): Promise<MemorialApi> {
  const slug = genSlug();
  const row = await createRow<MemorialRow>("memorials", {
    pet_id: [input.petId],
    user_id: input.userId,
    passed_away_date: input.passed_away_date || null,
    tribute_message: (input.tribute_message || "").slice(0, 5000),
    cover_photo_url: input.cover_photo_url || null,
    photo_urls: JSON.stringify((input.photo_urls || []).slice(0, 20)),
    music_url: input.music_url || null,
    memorial_status: input.memorial_status || "active",
    tier: "free",
    public_slug: slug,
    visitor_count: 0,
    candles_lit_count: 0,
    anniversary_reminder_year: 0,
    created_at: new Date().toISOString(),
  });
  return toApi(row);
}

export async function getMemorial(id: number): Promise<MemorialApi | null> {
  try {
    const row = await getRow<MemorialRow>("memorials", id);
    return toApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function getMemorialBySlug(slug: string): Promise<MemorialApi | null> {
  const res = await listRows<MemorialRow>("memorials", {
    filter: { public_slug__equal: slug },
    size: 1,
  });
  const row = res.results[0];
  return row ? toApi(row) : null;
}

export async function getMemorialByPet(petId: number): Promise<MemorialApi | null> {
  const res = await listRows<MemorialRow>("memorials", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 1,
  });
  const row = res.results[0];
  return row ? toApi(row) : null;
}

export async function listUserMemorials(userId: number): Promise<MemorialApi[]> {
  const res = await listRows<MemorialRow>("memorials", {
    filter: { user_id__equal: String(userId) },
    size: 50,
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.public_slug).map(toApi);
}

export interface UpdateMemorialInput {
  passed_away_date?: string | null;
  tribute_message?: string;
  cover_photo_url?: string | null;
  photo_urls?: string[];
  music_url?: string | null;
  memorial_status?: MemorialStatus;
}

export async function updateMemorial(id: number, input: UpdateMemorialInput): Promise<MemorialApi> {
  const patch: any = {};
  if (input.passed_away_date !== undefined) patch.passed_away_date = input.passed_away_date || null;
  if (input.tribute_message !== undefined) patch.tribute_message = (input.tribute_message || "").slice(0, 5000);
  if (input.cover_photo_url !== undefined) patch.cover_photo_url = input.cover_photo_url;
  if (input.photo_urls !== undefined) patch.photo_urls = JSON.stringify((input.photo_urls || []).slice(0, 20));
  if (input.music_url !== undefined) patch.music_url = input.music_url;
  if (input.memorial_status !== undefined) patch.memorial_status = input.memorial_status;
  const row = await updateRow<MemorialRow>("memorials", id, patch);
  return toApi(row);
}

export async function deleteMemorialRow(id: number): Promise<void> {
  await deleteRow("memorials", id);
}

// ============================================================
// Memorial visits (public visit log + candles)
// ============================================================

export interface VisitRow {
  id: number;
  memorial_id: number;
  visitor_name: string | null;
  visitor_email: string | null;
  message: string | null;
  candle_lit: boolean;
  visited_at: string;
}

export interface VisitApi {
  id: number;
  memorial_id: number;
  visitor_name: string;
  message: string;
  candle_lit: boolean;
  visited_at: string;
}

export function toVisitApi(row: VisitRow): VisitApi {
  return {
    id: row.id,
    memorial_id: Number(row.memorial_id) || 0,
    visitor_name: row.visitor_name || "Vô danh",
    message: row.message || "",
    candle_lit: row.candle_lit === true,
    visited_at: row.visited_at || "",
  };
}

export interface CreateVisitInput {
  memorialId: number;
  visitor_name?: string;
  visitor_email?: string;
  message?: string;
  candle_lit?: boolean;
}

export async function logVisit(input: CreateVisitInput): Promise<VisitApi> {
  const row = await createRow<VisitRow>("memorial_visits", {
    memorial_id: input.memorialId,
    visitor_name: (input.visitor_name || "").slice(0, 100) || null,
    visitor_email: (input.visitor_email || "").slice(0, 200) || null,
    message: (input.message || "").slice(0, 1000) || null,
    candle_lit: input.candle_lit === true,
    visited_at: new Date().toISOString(),
  });
  return toVisitApi(row);
}

export async function listVisits(memorialId: number, limit = 100): Promise<VisitApi[]> {
  const res = await listRows<VisitRow>("memorial_visits", {
    filter: { memorial_id__equal: String(memorialId) },
    size: Math.min(limit, 200),
    orderBy: "-visited_at",
  });
  return res.results.filter((r) => r.visited_at).map(toVisitApi);
}

export async function refreshMemorialStats(memorialId: number): Promise<void> {
  try {
    const visits = await listVisits(memorialId, 200);
    const visitorCount = visits.length;
    const candles = visits.filter((v) => v.candle_lit).length;
    await updateRow("memorials", memorialId, {
      visitor_count: visitorCount,
      candles_lit_count: candles,
    });
  } catch (err) {
    console.error(`[memorials] stats refresh memorial=${memorialId}:`, err);
  }
}

// ============================================================
// Memorial interest (premium tier signup, NO payment)
// ============================================================

export interface InterestRow {
  id: number;
  user_id: number;
  pet_id: Array<{ id: number; value: string }>;
  memorial_id: number;
  tier_interested: string | { id: number; value: string };
  contact_phone: string | null;
  contact_preferred_time: string | null;
  notes: string | null;
  contacted_back: boolean;
  contacted_at: string | null;
  admin_notes: string | null;
  created_at: string;
}

export interface InterestApi {
  id: number;
  user_id: number;
  pet_id: number;
  memorial_id: number;
  tier_interested: Exclude<MemorialTier, "free">;
  contact_phone: string;
  contact_preferred_time: string;
  notes: string;
  contacted_back: boolean;
  created_at: string;
}

export function toInterestApi(row: InterestRow): InterestApi {
  return {
    id: row.id,
    user_id: Number(row.user_id) || 0,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    memorial_id: Number(row.memorial_id) || 0,
    tier_interested: (flatVal<Exclude<MemorialTier, "free">>(row.tier_interested) || "tribute"),
    contact_phone: row.contact_phone || "",
    contact_preferred_time: row.contact_preferred_time || "",
    notes: row.notes || "",
    contacted_back: row.contacted_back === true,
    created_at: row.created_at || "",
  };
}

export interface RegisterInterestInput {
  userId: number;
  petId: number;
  memorialId: number;
  tier: Exclude<MemorialTier, "free">;
  contact_phone: string;
  contact_preferred_time?: string;
  notes?: string;
}

export async function registerInterest(input: RegisterInterestInput): Promise<InterestApi> {
  const row = await createRow<InterestRow>("memorial_interest", {
    user_id: input.userId,
    pet_id: [input.petId],
    memorial_id: input.memorialId,
    tier_interested: input.tier,
    contact_phone: input.contact_phone.slice(0, 20),
    contact_preferred_time: (input.contact_preferred_time || "").slice(0, 100) || null,
    notes: (input.notes || "").slice(0, 1000) || null,
    contacted_back: false,
    contacted_at: null,
    admin_notes: null,
    created_at: new Date().toISOString(),
  });
  return toInterestApi(row);
}

export async function listInterestForUser(userId: number): Promise<InterestApi[]> {
  const res = await listRows<InterestRow>("memorial_interest", {
    filter: { user_id__equal: String(userId) },
    size: 20,
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.contact_phone).map(toInterestApi);
}

// ============================================================
// Anniversary check (cron Job 11)
// ============================================================

/**
 * Tìm memorials cần gửi anniversary reminder hôm nay.
 * Match passed_away_date MM-DD == today MM-DD AND anniversary_reminder_year < current year.
 */
export async function findAnniversariesDue(today: Date = new Date()): Promise<MemorialApi[]> {
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const currentYear = today.getFullYear();

  const res = await listRows<MemorialRow>("memorials", { size: 200 });
  const due: MemorialApi[] = [];
  for (const row of res.results) {
    if (!row.passed_away_date) continue;
    const status = flatVal<string>(row.memorial_status);
    if (status === "archived") continue;
    const d = new Date(row.passed_away_date);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getFullYear() >= currentYear) continue; // not anniversary yet
    if (d.getMonth() + 1 !== todayMonth || d.getDate() !== todayDay) continue;
    if (Number(row.anniversary_reminder_year) >= currentYear) continue;
    due.push(toApi(row));
  }
  return due;
}

export async function markAnniversaryReminded(memorialId: number, year: number): Promise<void> {
  await updateRow("memorials", memorialId, { anniversary_reminder_year: year });
}
