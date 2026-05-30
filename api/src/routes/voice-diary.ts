/**
 * Voice Diary routes (M14).
 *
 * Mount: app.route("/api/v1/pets", voiceDiaryRoute)
 *
 *   POST   /pets/:id/diary/upload-audio  — upload audio file → R2, returns {audio_key, audio_url}
 *   GET    /pets/:id/diary               ?year=2026&month=5 → list entries (default current month)
 *   GET    /pets/:id/diary/today         — { exists, entry? }
 *   GET    /pets/:id/diary/yearbook/:year — grouped by month + mood stats
 *   POST   /pets/:id/diary               — create entry (calls Gemini)
 *   GET    /pets/:id/diary/:entryId      — single entry
 *   PUT    /pets/:id/diary/:entryId      — update transcript + regenerate
 *   DELETE /pets/:id/diary/:entryId      — delete entry
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { uploadObject, audioExtFromMime } from "@shared/r2.ts";
import {
  listEntries,
  getEntry,
  getTodayEntry,
  createEntry,
  updateEntryDiary,
  deleteEntry,
  getYearbook,
  generatePetDiary,
  countWords,
  getPetPersonalityTypeName,
} from "../lib/voice-diary.ts";
import { ageInYears } from "@shared/senior.ts";

const MAX_AUDIO_SIZE = 5 * 1024 * 1024;
const MIN_WORDS = 5;
const MAX_WORDS = 1000;

export const voiceDiaryRoute = new Hono();
voiceDiaryRoute.use("*", requireAuth);

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

// ============================================================
// POST /pets/:id/diary/upload-audio
// ============================================================
voiceDiaryRoute.post("/:id{[0-9]+}/diary/upload-audio", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);

    const form = await c.req.formData();
    const file = form.get("audio");
    if (!file || !(file instanceof File)) {
      return c.json({ error: { code: "NO_FILE", message: "Thiếu file audio (field 'audio')" } }, 400);
    }
    if (file.size > MAX_AUDIO_SIZE) {
      return c.json({ error: { code: "TOO_LARGE", message: "Audio quá 5MB" } }, 400);
    }
    const ext = audioExtFromMime(file.type || "");
    if (!ext) {
      return c.json({ error: { code: "BAD_MIME", message: `MIME không hỗ trợ: ${file.type}` } }, 400);
    }

    const today = new Date().toISOString().slice(0, 10);
    const key = `voice-diary/${petId}/${today}-${Date.now()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const url = await uploadObject(key, buf, file.type || `audio/${ext}`);

    return c.json({ audio_key: key, audio_url: url, size: file.size });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/upload-audio] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi upload audio" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/diary/today
// ============================================================
voiceDiaryRoute.get("/:id{[0-9]+}/diary/today", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const entry = await getTodayEntry(petId);
    return c.json({ exists: !!entry, entry });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/today] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load today" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/diary/yearbook/:year
// ============================================================
voiceDiaryRoute.get("/:id{[0-9]+}/diary/yearbook/:year{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const year = Number(c.req.param("year"));
  try {
    await getOwnedPet(petId, session.sub);
    const yearbook = await getYearbook(petId, year);
    return c.json(yearbook);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/yearbook] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load yearbook" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/diary
// ============================================================
voiceDiaryRoute.get("/:id{[0-9]+}/diary", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const year = c.req.query("year") ? Number(c.req.query("year")) : undefined;
  const month = c.req.query("month") ? Number(c.req.query("month")) : undefined;

  try {
    await getOwnedPet(petId, session.sub);
    const entries = await listEntries(petId, year, month);
    return c.json({ entries, total: entries.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load diary" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/diary/:entryId
// ============================================================
voiceDiaryRoute.get("/:id{[0-9]+}/diary/:eid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const entryId = Number(c.req.param("eid"));
  try {
    await getOwnedPet(petId, session.sub);
    const entry = await getEntry(entryId);
    if (!entry || entry.pet_id !== petId) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy entry" } }, 404);
    }
    return c.json(entry);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/get] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load entry" } }, 500);
  }
});

// ============================================================
// POST /pets/:id/diary
// ============================================================
voiceDiaryRoute.post("/:id{[0-9]+}/diary", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải là JSON" } }, 400);
  }

  const entry_date = String(body.entry_date || "").slice(0, 10);
  const owner_transcript = String(body.owner_transcript || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
    return c.json({ error: { code: "BAD_DATE", message: "entry_date phải YYYY-MM-DD" } }, 400);
  }
  const wc = countWords(owner_transcript);
  if (wc < MIN_WORDS) {
    return c.json({ error: { code: "TOO_SHORT", message: `Cần ít nhất ${MIN_WORDS} từ` } }, 400);
  }
  if (wc > MAX_WORDS) {
    return c.json({ error: { code: "TOO_LONG", message: `Tối đa ${MAX_WORDS} từ` } }, 400);
  }

  try {
    const pet = await getOwnedPet(petId, session.sub) as any;

    // Check existing entry for date
    const existing = await getTodayEntry(petId, entry_date);
    if (existing) {
      return c.json({
        error: { code: "DUPLICATE", message: "Đã có nhật ký cho ngày này. Dùng PUT để cập nhật." },
        existing_entry_id: existing.id,
      }, 409);
    }

    const species = flatVal<string>(pet.species);
    const gender = flatVal<string>((pet as any).gender);
    const personalityName = await getPetPersonalityTypeName(pet);

    const diary = await generatePetDiary({
      petName: pet.name,
      breed: pet.breed || null,
      age: ageInYears(pet.dob || undefined),
      gender: gender === "male" || gender === "female" ? gender : null,
      species,
      personalityType: personalityName,
      ownerTranscript: owner_transcript,
      entryDate: entry_date,
    });

    const entry = await createEntry({
      petId,
      entry_date,
      owner_transcript,
      audio_key: body.audio_key || null,
      audio_url: body.audio_url || null,
      duration_seconds: typeof body.duration_seconds === "number" ? body.duration_seconds : null,
      photo_url: pet.photo_url || null,
      diary,
    });

    // Quest hook: real diary entry created
    let completedQuests: any[] = [];
    try {
      const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
      completedQuests = await trackQuestTrigger(session.sub, petId, "voice_diary");
    } catch (err) {
      console.error("[diary/create] quest track failed:", err);
    }

    return c.json({ ...entry, completed_quests: completedQuests }, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/create] error:", err);
    return c.json({ error: { code: "GEMINI_FAIL", message: "Lỗi tạo nhật ký (Gemini)" } }, 500);
  }
});

// ============================================================
// PUT /pets/:id/diary/:eid
// ============================================================
voiceDiaryRoute.put("/:id{[0-9]+}/diary/:eid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const entryId = Number(c.req.param("eid"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải là JSON" } }, 400);
  }

  const owner_transcript = String(body.owner_transcript || "").trim();
  const wc = countWords(owner_transcript);
  if (wc < MIN_WORDS) {
    return c.json({ error: { code: "TOO_SHORT", message: `Cần ít nhất ${MIN_WORDS} từ` } }, 400);
  }
  if (wc > MAX_WORDS) {
    return c.json({ error: { code: "TOO_LONG", message: `Tối đa ${MAX_WORDS} từ` } }, 400);
  }

  try {
    const pet = await getOwnedPet(petId, session.sub) as any;
    const existing = await getEntry(entryId);
    if (!existing || existing.pet_id !== petId) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy entry" } }, 404);
    }

    const species = flatVal<string>(pet.species);
    const gender = flatVal<string>((pet as any).gender);
    const personalityName = await getPetPersonalityTypeName(pet);

    const diary = await generatePetDiary({
      petName: pet.name,
      breed: pet.breed || null,
      age: ageInYears(pet.dob || undefined),
      gender: gender === "male" || gender === "female" ? gender : null,
      species,
      personalityType: personalityName,
      ownerTranscript: owner_transcript,
      entryDate: existing.entry_date,
    });

    const updated = await updateEntryDiary(entryId, owner_transcript, diary);
    return c.json(updated);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/update] error:", err);
    return c.json({ error: { code: "GEMINI_FAIL", message: "Lỗi cập nhật" } }, 500);
  }
});

// ============================================================
// DELETE /pets/:id/diary/:eid
// ============================================================
voiceDiaryRoute.delete("/:id{[0-9]+}/diary/:eid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const entryId = Number(c.req.param("eid"));
  try {
    await getOwnedPet(petId, session.sub);
    const existing = await getEntry(entryId);
    if (!existing || existing.pet_id !== petId) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy entry" } }, 404);
    }
    await deleteEntry(entryId);
    return c.json({ ok: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[diary/delete] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xoá entry" } }, 500);
  }
});
