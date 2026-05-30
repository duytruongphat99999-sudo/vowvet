/**
 * Seed 15 daily quest templates.
 * Idempotent: skips rows whose `code` already exists.
 */
import { listRows, createRow } from "../shared/baserow.ts";

interface QuestSeed {
  code: string; name: string; desc: string; emoji: string;
  difficulty: "easy" | "medium" | "hard";
  bonus: number;
  trigger: string;
}

const QUESTS: QuestSeed[] = [
  { code: "checkin_today",      name: "Check-in hôm nay",            emoji: "📊", difficulty: "easy",   bonus: 10, trigger: "checkin",            desc: "Hoàn thành check-in cảm xúc / sức khỏe hôm nay" },
  { code: "upload_photo",       name: "Upload 1 ảnh bé",             emoji: "📸", difficulty: "easy",   bonus: 15, trigger: "upload_photo",       desc: "Thêm 1 ảnh vào album bé" },
  { code: "read_faq",           name: "Đọc 1 câu FAQ",               emoji: "📚", difficulty: "easy",   bonus: 10, trigger: "read_faq",           desc: "Đọc một câu hỏi trong tab FAQ" },
  { code: "view_pet_score",     name: "Xem Pet Score",               emoji: "🏆", difficulty: "easy",   bonus: 5,  trigger: "view_pet_score",     desc: "Mở trang Pet Score của bé" },
  { code: "log_meal",           name: "Log bữa ăn",                  emoji: "🍴", difficulty: "medium", bonus: 20, trigger: "log_meal",           desc: "Ghi nhận khẩu phần ăn hôm nay" },
  { code: "voice_diary",        name: "Voice diary 1 entry",         emoji: "🎙️", difficulty: "medium", bonus: 25, trigger: "voice_diary",        desc: "Ghi âm 30 giây kỷ niệm trong ngày" },
  { code: "check_water",        name: "Log nước uống",               emoji: "💧", difficulty: "medium", bonus: 20, trigger: "check_water",        desc: "Ghi lượng nước bé uống hôm nay" },
  { code: "routine_complete",   name: "Hoàn thành routine ngày",     emoji: "✅", difficulty: "medium", bonus: 30, trigger: "routine_complete",   desc: "Tick xong toàn bộ task trong routine" },
  { code: "check_weather",      name: "Xem climate alert",           emoji: "🌤️", difficulty: "easy",   bonus: 10, trigger: "check_weather",      desc: "Mở widget thời tiết / cảnh báo khí hậu" },
  { code: "place_checkin",      name: "Check-in 1 địa điểm",         emoji: "📍", difficulty: "hard",   bonus: 40, trigger: "place_checkin",      desc: "Đến 1 địa điểm pet-friendly + check-in" },
  { code: "playdate_swipe",     name: "Swipe Playdate 10 lần",       emoji: "🤝", difficulty: "hard",   bonus: 35, trigger: "playdate_swipe",     desc: "Khám phá 10 bé trong Playdate" },
  { code: "bcs_check",          name: "BCS assessment",              emoji: "📊", difficulty: "hard",   bonus: 50, trigger: "bcs_check",          desc: "Chấm BCS bằng AI từ 2 ảnh" },
  { code: "share_pet",          name: "Share QR Passport",           emoji: "💬", difficulty: "medium", bonus: 25, trigger: "share_pet",          desc: "Chia sẻ trang public của bé qua Zalo" },
  { code: "help_hero",          name: "Báo sighting cho pet mất",    emoji: "🦸", difficulty: "hard",   bonus: 60, trigger: "help_hero",          desc: "Báo cáo nhìn thấy 1 pet đang mất gần bạn" },
  { code: "pet_score_increase", name: "Tăng Pet Score 10 điểm",      emoji: "📈", difficulty: "hard",   bonus: 50, trigger: "pet_score_increase", desc: "Pet Score hôm nay tăng ≥ 10 điểm so với hôm qua" },
];

const now = new Date().toISOString();
const existing = await listRows<{ id: number; code: string }>("quest_definitions", { size: 200 });
const have = new Set(existing.results.map((r) => r.code));
let created = 0, skipped = 0;

for (const q of QUESTS) {
  if (have.has(q.code)) { skipped++; continue; }
  try {
    await createRow("quest_definitions", {
      code: q.code,
      name: q.name,
      description: q.desc,
      emoji: q.emoji,
      difficulty: q.difficulty,
      pet_score_bonus: q.bonus,
      trigger_condition: q.trigger,
      is_active: true,
      created_at: now,
    });
    created++;
  } catch (err) {
    console.error(`  ❌ ${q.code}:`, String(err).slice(0, 150));
  }
}

console.log(`\n✅ Quests seeded: ${created} new, ${skipped} already existed.`);
