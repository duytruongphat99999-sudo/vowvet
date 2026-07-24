/**
 * Birthday Events lib (M11).
 *
 * 1 row per pet per year in birthday_events table.
 * Stores push_sent flags, wishes JSON array, Gemini slideshow content.
 */
import { listRows, createRow, updateRow } from "@shared/baserow.ts";
import { getDaysUntilBirthday, getNextBirthday, getAgeTurning, formatLocalDate } from "@shared/birthday-lib.ts";
import { sendPush } from "./web-push.ts";

// ================================================================
// Types
// ================================================================

export interface BirthdayWish {
  name: string;
  message: string;
  emoji: string;
  created_at: string;
}

export interface BirthdayEvent {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  birthday_year: number;
  event_date: string;
  push_sent_30d: boolean;
  push_sent_7d: boolean;
  push_sent_1d: boolean;
  push_sent_today: boolean;
  wishes: string | null;
  wishes_count: number;
  slideshow_content: string | null;
  slideshow_generated: boolean;
  wall_enabled: boolean;
  created_at: string;
}

// ================================================================
// CRUD helpers
// ================================================================

export async function getOrCreateEvent(
  petId: number,
  year: number,
  eventDate: string
): Promise<BirthdayEvent> {
  const res = await listRows<BirthdayEvent>("birthday_events", {
    filter: {
      pet_id__link_row_has: String(petId),
      birthday_year__equal: String(year),
    },
    size: 1,
  });
  if (res.results.length > 0) return res.results[0];

  return createRow<BirthdayEvent>("birthday_events", {
    pet_id: [{ id: petId }],
    birthday_year: year,
    event_date: eventDate,
    push_sent_30d: false,
    push_sent_7d: false,
    push_sent_1d: false,
    push_sent_today: false,
    wishes: JSON.stringify([]),
    wishes_count: 0,
    slideshow_content: null,
    slideshow_generated: false,
    wall_enabled: true,
    created_at: new Date().toISOString(),
  });
}

/** Add a wish. Deduped by name (case-insensitive). Returns {added} flag. */
export async function addWish(
  petId: number,
  year: number,
  wish: Omit<BirthdayWish, "created_at">
): Promise<{ event: BirthdayEvent | null; added: boolean }> {
  const res = await listRows<BirthdayEvent>("birthday_events", {
    filter: {
      pet_id__link_row_has: String(petId),
      birthday_year__equal: String(year),
    },
    size: 1,
  });
  if (res.results.length === 0) return { event: null, added: false };

  const event = res.results[0];
  let existing: BirthdayWish[] = [];
  try { existing = JSON.parse(event.wishes || "[]"); } catch {}

  const nameKey = wish.name.trim().toLowerCase();
  if (existing.some((w) => w.name.trim().toLowerCase() === nameKey)) {
    return { event, added: false };
  }

  const newWish: BirthdayWish = { ...wish, created_at: new Date().toISOString() };
  const updated = [...existing, newWish];

  const updatedEvent = await updateRow<BirthdayEvent>("birthday_events", event.id, {
    wishes: JSON.stringify(updated),
    wishes_count: updated.length,
  });
  return { event: updatedEvent, added: true };
}

/** Public wall data — no auth required. */
export async function getPublicWall(petId: number): Promise<{
  event: BirthdayEvent | null;
  wishes: BirthdayWish[];
  current_year: number;
}> {
  const year = new Date().getFullYear();
  const res = await listRows<BirthdayEvent>("birthday_events", {
    filter: {
      pet_id__link_row_has: String(petId),
      birthday_year__equal: String(year),
    },
    size: 1,
  });

  if (res.results.length === 0) return { event: null, wishes: [], current_year: year };

  const event = res.results[0];
  let wishes: BirthdayWish[] = [];
  try { wishes = JSON.parse(event.wishes || "[]"); } catch {}

  return { event, wishes, current_year: year };
}

// ================================================================
// Gemini slideshow
// ================================================================

async function generateSlideshow(
  petName: string,
  age: number,
  breed: string | null,
  species: string | null
): Promise<string> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  const speciesVn = species === "dog" ? "chó" : species === "cat" ? "mèo" : "thú cưng";
  const breedPart = breed ? `, giống ${breed}` : "";

  const prompt =
    `Bé ${petName} hôm nay tròn ${age} tuổi${breedPart} — một ${speciesVn} đáng yêu. ` +
    `Viết một đoạn kỷ niệm nhìn lại 1 năm qua theo góc nhìn thứ nhất của bé (xưng "mình"), ` +
    `vui vẻ, ấm áp, có 3-4 kỷ niệm tưởng tượng dễ thương (đi vet, ngủ với chủ, ăn snack yêu thích, chơi đùa). ` +
    `Kết thúc bằng lời cảm ơn chủ. Tối đa 180 từ. Tiếng Việt. Không dùng emoji nhiều.`;

  const { GoogleGenAI } = await import("@google/genai");
  const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const result = await genai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 400, temperature: 0.8 },
  });
  return result.text || "";
}

/** Get slideshow (generate if not yet generated). */
export async function ensureSlideshow(
  petId: number,
  year: number,
  petName: string,
  age: number,
  breed: string | null,
  species: string | null
): Promise<string | null> {
  const res = await listRows<BirthdayEvent>("birthday_events", {
    filter: {
      pet_id__link_row_has: String(petId),
      birthday_year__equal: String(year),
    },
    size: 1,
  });
  if (res.results.length === 0) return null;

  const event = res.results[0];
  if (event.slideshow_generated && event.slideshow_content) {
    return event.slideshow_content;
  }

  try {
    const content = await generateSlideshow(petName, age, breed, species);
    await updateRow("birthday_events", event.id, {
      slideshow_content: content,
      slideshow_generated: true,
    });
    return content;
  } catch (err) {
    console.error("[birthday-events] slideshow gen error:", err);
    return null;
  }
}

// ================================================================
// Birthday reminder cron job
// ================================================================

interface UserRow {
  id: number;
  push_subscription?: string | null;
}

interface PetRow {
  id: number;
  name: string;
  dob?: string | null;
  species?: string | { value: string } | null;
  breed?: string | null;
  user_id?: Array<{ id: number; value: string }>;
}

function buildBirthdayPush(
  petName: string,
  daysLeft: number,
  ageTurning: number | null
): { title: string; body: string } {
  const ageStr = ageTurning ? `tròn ${ageTurning} tuổi` : "";
  if (daysLeft === 0) {
    return {
      title: `🎂 Sinh nhật bé ${petName}!`,
      body: `Hôm nay bé ${ageStr ? ageStr + " " : ""}rồi! Đừng quên chúc mừng bé nhé 🎉`,
    };
  }
  if (daysLeft === 1) {
    return {
      title: `🎂 Ngày mai sinh nhật ${petName}!`,
      body: `Ngày mai bé ${ageStr}. Chuẩn bị party nào! 🎊`,
    };
  }
  if (daysLeft === 7) {
    return {
      title: `🎂 Còn 7 ngày sinh nhật ${petName}`,
      body: `Đặt cake pet-safe và chuẩn bị quà cho bé nhé!`,
    };
  }
  return {
    title: `🎂 Còn 1 tháng sinh nhật ${petName}`,
    body: `Sinh nhật bé sắp đến! Vào VowVet để lên kế hoạch party 🎉`,
  };
}

export async function runBirthdayReminderJob(): Promise<{
  processed: number;
  pushes_sent: number;
  events_created: number;
  errors: number;
}> {
  const report = { processed: 0, pushes_sent: 0, events_created: 0, errors: 0 };
  const today = new Date();

  let users: UserRow[];
  try {
    const res = await listRows<UserRow>("users", { size: 200 });
    users = res.results;
  } catch (err) {
    console.error("[birthday-reminder] load users failed:", err);
    report.errors++;
    return report;
  }

  for (const user of users) {
    try {
      const petsRes = await listRows<PetRow>("pets", {
        filter: { user_id__link_row_has: String(user.id), deleted_at__empty: "" },
        size: 50,
      });

      for (const pet of petsRes.results) {
        if (!pet.dob) continue;
        report.processed++;

        const days = getDaysUntilBirthday(pet.dob, today);
        if (days === null || ![0, 1, 7, 30].includes(days)) continue;

        const next = getNextBirthday(pet.dob, today);
        if (!next) continue;

        const year = next.getFullYear();
        const eventDate = formatLocalDate(next);

        let event: BirthdayEvent;
        try {
          const before = (await listRows<BirthdayEvent>("birthday_events", {
            filter: { pet_id__link_row_has: String(pet.id), birthday_year__equal: String(year) },
            size: 1,
          })).results[0];
          event = await getOrCreateEvent(pet.id, year, eventDate);
          if (!before) report.events_created++;
        } catch (err) {
          console.error(`[birthday-reminder] getOrCreate pet=${pet.id}:`, err);
          report.errors++;
          continue;
        }

        const flagKey =
          days === 0 ? "push_sent_today" :
          days === 1 ? "push_sent_1d" :
          days === 7 ? "push_sent_7d" :
          "push_sent_30d";

        if ((event as any)[flagKey]) continue;

        // Mark sent flag immediately (even if push fails, avoid double-send)
        try {
          await updateRow("birthday_events", event.id, { [flagKey]: true });
        } catch (err) {
          console.error(`[birthday-reminder] flag update pet=${pet.id}:`, err);
          report.errors++;
        }

        if (!user.push_subscription) continue;

        const ageTurning = getAgeTurning(pet.dob, today);
        const push = buildBirthdayPush(pet.name, days, ageTurning);
        try {
          const result = await sendPush(
            user.id,
            user.push_subscription,
            {
              title: push.title,
              body: push.body,
              icon: "/favicon.svg",
              data: { url: `/pets/${pet.id}/birthday`, pet_id: pet.id },
            },
            { type: "vaccine_reminder" }
          );
          if (result.ok) report.pushes_sent++;
        } catch (err) {
          console.error(`[birthday-reminder] push fail pet=${pet.id}:`, err);
          report.errors++;
        }
      }
    } catch (err) {
      console.error(`[birthday-reminder] user ${user.id} failed:`, err);
      report.errors++;
    }
  }

  console.log("[birthday-reminder] done:", report);
  return report;
}
