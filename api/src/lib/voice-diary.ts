/**
 * Voice Diary lib (M14).
 *
 * - CRUD: createEntry, updateEntry, listEntries, getEntry, deleteEntry, getTodayEntry
 * - Gemini POV diary generation (gemini-2.5-flash, max 300 words VN)
 * - Yearbook aggregator (groups by month, mood stats)
 */
import { listRows, createRow, updateRow, getRow, deleteRow } from "@shared/baserow.ts";
import { GoogleGenAI } from "@google/genai";

// ================================================================
// Types
// ================================================================

export type DiaryMood = "happy" | "sad" | "funny" | "exciting" | "ordinary";

export interface VoiceDiaryEntryRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  entry_date: string;
  audio_key?: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
  owner_transcript: string;
  pet_diary: string;
  pet_diary_title: string;
  mood_detected: string | { id: number; value: string } | null;
  word_count: number;
  gemini_model_used: string;
  created_at: string;
  photo_url?: string | null;
}

export interface VoiceDiaryEntryApi {
  id: number;
  pet_id: number;
  entry_date: string;
  audio_key: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  owner_transcript: string;
  pet_diary: string;
  pet_diary_title: string;
  mood_detected: DiaryMood | null;
  word_count: number;
  gemini_model_used: string;
  created_at: string;
  photo_url: string | null;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toApi(row: VoiceDiaryEntryRow): VoiceDiaryEntryApi {
  const petLink = (row.pet_id || [])[0];
  return {
    id: row.id,
    pet_id: petLink?.id ?? 0,
    entry_date: row.entry_date,
    audio_key: row.audio_key ?? null,
    audio_url: row.audio_url ?? null,
    duration_seconds: row.duration_seconds ?? null,
    owner_transcript: row.owner_transcript || "",
    pet_diary: row.pet_diary || "",
    pet_diary_title: row.pet_diary_title || "",
    mood_detected: flatVal<DiaryMood>(row.mood_detected),
    word_count: row.word_count ?? 0,
    gemini_model_used: row.gemini_model_used || "gemini-2.5-flash",
    created_at: row.created_at,
    photo_url: row.photo_url ?? null,
  };
}

export function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

// ================================================================
// Gemini POV diary generation
// ================================================================

const GEMINI_MODEL = "gemini-2.5-flash";

export interface GenerateParams {
  petName: string;
  breed: string | null;
  age: number | null;
  gender: "male" | "female" | null;
  species: string | null;
  personalityType?: string | null;
  ownerTranscript: string;
  entryDate: string;
}

export interface GeneratedDiary {
  title: string;
  mood: DiaryMood;
  diary: string;
}

export async function generatePetDiary(params: GenerateParams): Promise<GeneratedDiary> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  const speciesVn = params.species === "dog" ? "chó" : params.species === "cat" ? "mèo" : "thú cưng";
  const genderVn = params.gender === "male" ? "đực" : params.gender === "female" ? "cái" : "";
  const ageStr = params.age != null ? `${params.age} tuổi` : "";
  const breedStr = params.breed ? `giống ${params.breed}` : "";
  const personalityStr = params.personalityType ? `Tính cách của bạn: ${params.personalityType}.` : "";

  const prompt =
    `Bạn là bé ${speciesVn} tên "${params.petName}"${ageStr ? `, ${ageStr}` : ""}${breedStr ? `, ${breedStr}` : ""}${genderVn ? `, giới tính ${genderVn}` : ""}. ` +
    `${personalityStr}\n\n` +
    `Chủ vừa kể về ngày hôm nay (${params.entryDate}):\n"${params.ownerTranscript}"\n\n` +
    `Hãy viết lại thành nhật ký CỦA BẠN (ngôi thứ nhất "mình"), bằng tiếng Việt:\n` +
    `- Giọng ngây thơ, dễ thương\n` +
    `- 3-5 đoạn văn ngắn, ngăn cách bằng \\n\\n\n` +
    `- Thêm chi tiết cảm xúc của bé (ngửi mùi gì, nghe tiếng gì, cảm giác thế nào)\n` +
    `- Kết thúc bằng 1 câu "tâm tư" của bé với chủ\n` +
    `- Tối đa 300 từ\n\n` +
    `CHỈ trả về JSON (không markdown, không giải thích):\n` +
    `{"title":"tiêu đề ngắn ≤10 từ","mood":"happy|sad|funny|exciting|ordinary","diary":"nội dung nhật ký..."}`;

  const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const result = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 800, temperature: 0.8 },
  });

  const raw = result.text || "";
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: try to find { ... } in response
    const m = cleaned.match(/\{[\s\S]+\}/);
    if (!m) throw new Error("Gemini diary: invalid JSON");
    parsed = JSON.parse(m[0]);
  }

  const validMoods: DiaryMood[] = ["happy", "sad", "funny", "exciting", "ordinary"];
  const mood: DiaryMood = validMoods.includes(parsed.mood) ? parsed.mood : "ordinary";

  return {
    title: String(parsed.title || "Một ngày của bé").slice(0, 120),
    mood,
    diary: String(parsed.diary || "").slice(0, 4000),
  };
}

export const GEMINI_MODEL_NAME = GEMINI_MODEL;

// ================================================================
// CRUD
// ================================================================

export async function getTodayEntry(petId: number, dateStr?: string): Promise<VoiceDiaryEntryApi | null> {
  const today = dateStr || new Date().toISOString().slice(0, 10);
  const res = await listRows<VoiceDiaryEntryRow>("voice_diary_entries", {
    filter: {
      pet_id__link_row_has: String(petId),
      entry_date__date_equal: today,
    },
    size: 1,
  });
  return res.results[0] ? toApi(res.results[0]) : null;
}

export async function listEntries(
  petId: number,
  year?: number,
  month?: number
): Promise<VoiceDiaryEntryApi[]> {
  const filter: Record<string, string> = {
    pet_id__link_row_has: String(petId),
  };
  if (year != null && month != null) {
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    filter.entry_date__date_after_or_equal = from;
    filter.entry_date__date_before_or_equal = to;
  } else if (year != null) {
    filter.entry_date__date_after_or_equal = `${year}-01-01`;
    filter.entry_date__date_before_or_equal = `${year}-12-31`;
  }

  const res = await listRows<VoiceDiaryEntryRow>("voice_diary_entries", {
    filter,
    size: 200,
    orderBy: "-entry_date",
  });
  return res.results
    .filter((r) => r.entry_date && r.pet_diary)
    .map(toApi);
}

export async function getEntry(entryId: number): Promise<VoiceDiaryEntryApi | null> {
  try {
    const row = await getRow<VoiceDiaryEntryRow>("voice_diary_entries", entryId);
    return toApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export interface CreateEntryInput {
  petId: number;
  entry_date: string;
  owner_transcript: string;
  audio_key?: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
  photo_url?: string | null;
  diary: GeneratedDiary;
}

export async function createEntry(input: CreateEntryInput): Promise<VoiceDiaryEntryApi> {
  const row = await createRow<VoiceDiaryEntryRow>("voice_diary_entries", {
    pet_id: [{ id: input.petId }],
    entry_date: input.entry_date,
    audio_key: input.audio_key || null,
    audio_url: input.audio_url || null,
    duration_seconds: input.duration_seconds ?? null,
    owner_transcript: input.owner_transcript,
    pet_diary: input.diary.diary,
    pet_diary_title: input.diary.title,
    mood_detected: input.diary.mood,
    word_count: countWords(input.diary.diary),
    gemini_model_used: GEMINI_MODEL,
    created_at: new Date().toISOString(),
    photo_url: input.photo_url || null,
  });
  return toApi(row);
}

export async function updateEntryDiary(
  entryId: number,
  ownerTranscript: string,
  diary: GeneratedDiary
): Promise<VoiceDiaryEntryApi> {
  const row = await updateRow<VoiceDiaryEntryRow>("voice_diary_entries", entryId, {
    owner_transcript: ownerTranscript,
    pet_diary: diary.diary,
    pet_diary_title: diary.title,
    mood_detected: diary.mood,
    word_count: countWords(diary.diary),
  });
  return toApi(row);
}

export async function deleteEntry(entryId: number): Promise<void> {
  await deleteRow("voice_diary_entries", entryId);
}

// ================================================================
// Yearbook
// ================================================================

export interface YearbookMonth {
  month: number;
  month_label: string;
  entries: VoiceDiaryEntryApi[];
}

export interface Yearbook {
  year: number;
  total_entries: number;
  by_mood: Record<DiaryMood, number>;
  months: YearbookMonth[];
}

const MONTH_LABELS_VN = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

export async function getYearbook(petId: number, year: number): Promise<Yearbook> {
  const entries = await listEntries(petId, year);
  entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date)); // ASC

  const by_mood: Record<DiaryMood, number> = {
    happy: 0, sad: 0, funny: 0, exciting: 0, ordinary: 0,
  };
  const groups = new Map<number, VoiceDiaryEntryApi[]>();

  for (const e of entries) {
    if (e.mood_detected) by_mood[e.mood_detected]++;
    const monthIdx = Number(e.entry_date.slice(5, 7)) - 1;
    if (!groups.has(monthIdx)) groups.set(monthIdx, []);
    groups.get(monthIdx)!.push(e);
  }

  const months: YearbookMonth[] = [];
  for (let m = 0; m < 12; m++) {
    const arr = groups.get(m);
    if (arr && arr.length > 0) {
      months.push({ month: m + 1, month_label: MONTH_LABELS_VN[m], entries: arr });
    }
  }

  return { year, total_entries: entries.length, by_mood, months };
}

// ================================================================
// Personality fetch helper (for diary generation context)
// ================================================================

export async function getPetPersonalityTypeName(pet: any): Promise<string | null> {
  const typeId = pet?.personality_type;
  if (!typeId) return null;
  try {
    const mod = await import("@shared/personality-types.ts");
    const meta = mod.getPersonalityType?.(typeId);
    if (meta) return `${meta.emoji} ${meta.name_vi}`;
    return null;
  } catch {
    return null;
  }
}
