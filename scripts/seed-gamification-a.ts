/**
 * Seed Session A gamification data.
 *
 *  - 20 achievement_defs
 *  - 15 reward_definitions
 *  -  8 feature_gates
 *
 * Idempotent: skips rows whose `code` (or `feature_key`) already exists.
 */
import { listRows, createRow } from "../shared/baserow.ts";

interface AchievementSeed {
  code: string; name: string; desc: string; emoji: string;
  category: "health" | "social" | "milestone" | "hero" | "completion" | "secret";
  tier: "bronze" | "silver" | "gold" | "platinum" | "secret";
  bonus: number;
  unlock_type: string; unlock_value: string;
  is_secret?: boolean;
}

const ACHIEVEMENTS: AchievementSeed[] = [
  // HEALTH (5)
  { code: "vaccine_starter", name: "Vaccine Starter", emoji: "💉", category: "health", tier: "bronze", bonus: 30, unlock_type: "vaccine_count", unlock_value: "1", desc: "Hoàn thành vaccine đầu tiên" },
  { code: "vaccine_pro", name: "Vaccine Pro", emoji: "💉💉", category: "health", tier: "silver", bonus: 50, unlock_type: "vaccine_count", unlock_value: "5", desc: "Hoàn thành 5 vaccine" },
  { code: "vaccine_master", name: "Vaccine Master", emoji: "💉🏆", category: "health", tier: "gold", bonus: 100, unlock_type: "vaccine_count", unlock_value: "9", desc: "Hoàn thành đủ 9 WSAVA vaccines" },
  { code: "bcs_first", name: "Body Aware", emoji: "📊", category: "health", tier: "bronze", bonus: 30, unlock_type: "bcs_done", unlock_value: "1", desc: "BCS assessment đầu tiên" },
  { code: "ideal_weight", name: "Ideal Weight", emoji: "💚", category: "health", tier: "silver", bonus: 50, unlock_type: "bcs_done", unlock_value: "ideal", desc: "Bé đạt BCS 4-5 (ideal weight)" },

  // MILESTONE / streaks (4)
  { code: "streak_7", name: "7-day Streak", emoji: "🔥", category: "milestone", tier: "bronze", bonus: 50, unlock_type: "streak_days", unlock_value: "7", desc: "Check-in 7 ngày liên tục" },
  { code: "streak_30", name: "30-day Streak", emoji: "🔥🔥", category: "milestone", tier: "silver", bonus: 100, unlock_type: "streak_days", unlock_value: "30", desc: "Check-in 30 ngày liên tục" },
  { code: "streak_100", name: "100-day Streak", emoji: "🔥🔥🔥", category: "milestone", tier: "gold", bonus: 200, unlock_type: "streak_days", unlock_value: "100", desc: "Check-in 100 ngày liên tục" },
  { code: "streak_365", name: "Year Long Devotion", emoji: "💎", category: "milestone", tier: "platinum", bonus: 500, unlock_type: "streak_days", unlock_value: "365", desc: "Check-in cả năm 365 ngày" },

  // COMPLETION (4)
  { code: "profile_complete", name: "Profile Master", emoji: "📋", category: "completion", tier: "silver", bonus: 80, unlock_type: "profile_completion", unlock_value: "100", desc: "Pet Passport 100%" },
  { code: "personality_done", name: "Know Thyself", emoji: "🎭", category: "completion", tier: "bronze", bonus: 50, unlock_type: "personality_done", unlock_value: "1", desc: "Làm xong Personality test 20 câu" },
  { code: "nutrition_setup", name: "Diet Pro", emoji: "🍴", category: "completion", tier: "bronze", bonus: 50, unlock_type: "nutrition_done", unlock_value: "1", desc: "Setup Nutrition profile" },
  { code: "photo_enthusiast", name: "Photo Enthusiast", emoji: "📸", category: "completion", tier: "silver", bonus: 60, unlock_type: "photo_count", unlock_value: "20", desc: "Upload 20+ ảnh pet" },

  // SOCIAL (3)
  { code: "first_match", name: "First Match", emoji: "💜", category: "social", tier: "bronze", bonus: 50, unlock_type: "mutual_matches", unlock_value: "1", desc: "Match Playdate đầu tiên" },
  { code: "social_butterfly", name: "Social Butterfly", emoji: "🦋", category: "social", tier: "silver", bonus: 100, unlock_type: "mutual_matches", unlock_value: "5", desc: "5 matches successful" },
  { code: "first_birthday", name: "Birthday Celebrant", emoji: "🎂", category: "social", tier: "bronze", bonus: 80, unlock_type: "first_birthday", unlock_value: "1", desc: "Tổ chức sinh nhật pet đầu tiên" },

  // HERO (3)
  { code: "pet_helper", name: "Pet Helper", emoji: "🤝", category: "hero", tier: "bronze", bonus: 100, unlock_type: "hero_count", unlock_value: "1", desc: "Giúp tìm pet hàng xóm lần đầu" },
  { code: "pet_hero", name: "Pet Hero", emoji: "🦸", category: "hero", tier: "gold", bonus: 300, unlock_type: "hero_count", unlock_value: "3", desc: "Giúp tìm 3+ pets" },
  { code: "pet_guardian", name: "Pet Guardian", emoji: "👑", category: "hero", tier: "platinum", bonus: 1000, unlock_type: "hero_count", unlock_value: "10", desc: "Giúp tìm 10+ pets — top tier" },

  // SECRET (1)
  { code: "midnight_warrior", name: "Midnight Warrior", emoji: "🌙", category: "secret", tier: "secret", bonus: 100, unlock_type: "midnight_checkin", unlock_value: "5", desc: "Check-in giữa đêm 5 lần (12am-3am)", is_secret: true },
];

interface RewardSeed {
  code: string; name: string; emoji: string;
  category: "tier_reward" | "streak_reward" | "hero_reward" | "event_reward" | "seasonal";
  unlock_type: string; unlock_value: string;
  reward_type: "voucher_discount" | "free_service" | "physical_gift" | "feature_unlock" | "badge_only" | "banner_feature";
  reward_value: string;
  provider: "mon_min" | "external_partner" | "platform";
  partner_name?: string;
  voucher_pattern?: string;
  validity_days?: number;
  instructions?: string;
  max_per_user: number;
  display_order?: number;
  description: string;
}

const REWARDS: RewardSeed[] = [
  // TIER REWARDS
  { code: "silver_tier_unlock", name: "Pet Silver — Mở khoá ưu tiên", emoji: "🥈",
    category: "tier_reward", unlock_type: "pet_score_tier", unlock_value: "silver",
    reward_type: "feature_unlock", reward_value: "priority_playdate_discovery",
    provider: "platform", partner_name: "VowVet", max_per_user: 1, display_order: 1,
    description: "Profile bé hiện top trong discovery Playdate. Bật khi đạt tier Silver (Pet Score 301+)." },

  { code: "gold_tier_checkup", name: "Voucher 20% Khám Mon Min", emoji: "🥇",
    category: "tier_reward", unlock_type: "pet_score_tier", unlock_value: "gold",
    reward_type: "voucher_discount", reward_value: "20%",
    provider: "mon_min", partner_name: "Mon Min Pet Clinic",
    voucher_pattern: "GOLD-{random6}", validity_days: 60, max_per_user: 1, display_order: 2,
    instructions: "Đến Mon Min Clinic. Show QR + screen app. Áp dụng cho 1 lần khám bất kỳ.",
    description: "Voucher 20% cho 1 lần khám tại Mon Min Clinic. Mở khoá khi đạt Gold tier (Pet Score 501+)." },

  { code: "diamond_bcs_free", name: "Đánh giá BCS miễn phí (200k value)", emoji: "💎",
    category: "tier_reward", unlock_type: "pet_score_tier", unlock_value: "diamond",
    reward_type: "free_service", reward_value: "bcs_assessment_in_clinic",
    provider: "mon_min", partner_name: "Mon Min Pet Clinic",
    voucher_pattern: "DMD-{random8}", validity_days: 90, max_per_user: 1, display_order: 3,
    instructions: "Đặt lịch qua Zalo VowVet OA. Free BCS assessment do bác sĩ thực hiện trực tiếp.",
    description: "Free BCS đánh giá tại clinic. Diamond tier (Pet Score 851+)." },

  { code: "diamond_tier_vip", name: "Diamond VIP — Tất cả tính năng", emoji: "💎✨",
    category: "tier_reward", unlock_type: "pet_score_tier", unlock_value: "diamond",
    reward_type: "feature_unlock", reward_value: "all_premium_features",
    provider: "platform", max_per_user: 1, display_order: 4,
    description: "Toàn bộ premium features mở khoá vĩnh viễn." },

  // STREAK REWARDS
  { code: "streak_7_badge", name: "Huy hiệu 7-day Streak", emoji: "🔥",
    category: "streak_reward", unlock_type: "streak_days", unlock_value: "7",
    reward_type: "badge_only", reward_value: "",
    provider: "platform", max_per_user: 1, display_order: 5,
    description: "Huy hiệu công nhận 7 ngày liên tiếp chăm sóc bé." },

  { code: "streak_30_vaccine", name: "Miễn phí 1 mũi vaccine", emoji: "🔥🔥",
    category: "streak_reward", unlock_type: "streak_days", unlock_value: "30",
    reward_type: "free_service", reward_value: "vaccine_1_shot",
    provider: "mon_min", partner_name: "Mon Min Pet Clinic",
    voucher_pattern: "STK30-{random8}", validity_days: 60, max_per_user: 1, display_order: 6,
    instructions: "Áp dụng cho 1 mũi vaccine bất kỳ tại Mon Min Clinic.",
    description: "Streak 30 ngày → 1 mũi vaccine free." },

  { code: "streak_100_grooming", name: "Free grooming session", emoji: "🔥🔥🔥",
    category: "streak_reward", unlock_type: "streak_days", unlock_value: "100",
    reward_type: "free_service", reward_value: "grooming_session",
    provider: "mon_min", partner_name: "Mon Min Pet Clinic",
    voucher_pattern: "STK100-{random8}", validity_days: 90, max_per_user: 1, display_order: 7,
    instructions: "1 buổi grooming full (tắm + cắt + tỉa móng) tại Mon Min.",
    description: "Streak 100 ngày → 1 buổi grooming full free." },

  // HERO REWARDS
  { code: "pet_helper_voucher", name: "Voucher 50k Pet Shop Mon Min", emoji: "🤝",
    category: "hero_reward", unlock_type: "hero_count", unlock_value: "1",
    reward_type: "voucher_discount", reward_value: "50000",
    provider: "mon_min", partner_name: "Mon Min Pet Clinic",
    voucher_pattern: "HLP-{random6}", validity_days: 30, max_per_user: 1, display_order: 8,
    description: "Giúp tìm pet hàng xóm lần đầu → voucher 50k pet shop." },

  { code: "pet_hero_grooming", name: "Free grooming Mon Min (500k value)", emoji: "🦸",
    category: "hero_reward", unlock_type: "hero_count", unlock_value: "3",
    reward_type: "free_service", reward_value: "grooming_session_500k",
    provider: "mon_min", partner_name: "Mon Min Pet Clinic",
    voucher_pattern: "HERO-{random8}", validity_days: 90, max_per_user: 1, display_order: 9,
    description: "Giúp tìm 3+ pets → free grooming premium." },

  { code: "pet_guardian_vip", name: "Lifetime VIP Mon Min Clinic", emoji: "👑",
    category: "hero_reward", unlock_type: "hero_count", unlock_value: "10",
    reward_type: "feature_unlock", reward_value: "lifetime_vip",
    provider: "mon_min", partner_name: "Mon Min Pet Clinic", max_per_user: 1, display_order: 10,
    instructions: "Mon Min liên hệ trực tiếp qua Zalo VowVet để confirm VIP card.",
    description: "Top-tier hero. Lifetime VIP access tại Mon Min Clinic." },

  // EVENT REWARDS
  { code: "birthday_voucher_100k", name: "Voucher sinh nhật 100k", emoji: "🎂",
    category: "event_reward", unlock_type: "achievement_code", unlock_value: "first_birthday",
    reward_type: "voucher_discount", reward_value: "100000",
    provider: "mon_min", voucher_pattern: "BDAY-{random6}", validity_days: 14, max_per_user: -1, display_order: 11,
    description: "Voucher 100k mỗi sinh nhật pet. Hạn 14 ngày." },

  { code: "profile_complete_voucher", name: "Voucher 30k Pet Shop", emoji: "📋",
    category: "event_reward", unlock_type: "achievement_code", unlock_value: "profile_complete",
    reward_type: "voucher_discount", reward_value: "30000",
    provider: "mon_min", voucher_pattern: "PRO-{random6}", validity_days: 30, max_per_user: 1, display_order: 12,
    description: "Hoàn thiện Pet Passport 100% → voucher 30k." },

  { code: "social_butterfly_voucher", name: "5 matches — Free pet treat box", emoji: "🦋",
    category: "event_reward", unlock_type: "achievement_code", unlock_value: "social_butterfly",
    reward_type: "physical_gift", reward_value: "treat_box",
    provider: "mon_min", voucher_pattern: "SOC-{random6}", validity_days: 30, max_per_user: 1, display_order: 13,
    description: "Đạt 5 mutual matches → 1 hộp treat free tại Mon Min." },

  // LEADERBOARD (manual admin-grant)
  { code: "leaderboard_top10_monthly", name: "Top 10 monthly — Featured banner", emoji: "🏆",
    category: "seasonal", unlock_type: "manual_admin", unlock_value: "",
    reward_type: "banner_feature", reward_value: "mon_min_clinic_banner",
    provider: "mon_min", validity_days: 30, max_per_user: -1, display_order: 14,
    instructions: "Top 10 tháng tự động được feature trên banner Mon Min.",
    description: "Top 10 leaderboard tháng → featured trên trang chủ Mon Min Clinic." },

  // SECONDARY tier reward to bring count to 15
  { code: "platinum_bcs_followup", name: "Platinum — BCS follow-up free", emoji: "✨",
    category: "tier_reward", unlock_type: "pet_score_tier", unlock_value: "platinum",
    reward_type: "free_service", reward_value: "bcs_followup",
    provider: "mon_min", voucher_pattern: "PLT-{random8}", validity_days: 60, max_per_user: 1, display_order: 15,
    description: "Tier Platinum (Pet Score 701+) → 1 lượt BCS follow-up free do vet." },
];

interface GateSeed {
  feature_key: string;
  feature_name: string;
  gate_type: "pet_score_min" | "tier_min" | "hero_count_min" | "achievement_required";
  gate_value: string;
  benefit: string;
  locked_message: string;
  next_action: string;
}

const GATES: GateSeed[] = [
  { feature_key: "playdate_basic", feature_name: "Tham gia Playdate cơ bản",
    gate_type: "pet_score_min", gate_value: "100",
    benefit: "Tạo profile playdate và swipe",
    locked_message: "Pet Score < 100. Hoàn thiện profile cơ bản trước.",
    next_action: "Thêm vaccine + làm Personality test" },

  { feature_key: "playdate_priority_discovery", feature_name: "Priority Playdate discovery",
    gate_type: "tier_min", gate_value: "silver",
    benefit: "Profile bé hiện top trong discovery của user khác",
    locked_message: "Cần tier Silver (Pet Score 301+).",
    next_action: "Tăng Pet Score lên 300+" },

  { feature_key: "playdate_unlimited_swipes", feature_name: "Unlimited swipes (free = 50/ngày)",
    gate_type: "tier_min", gate_value: "gold",
    benefit: "Swipe không giới hạn",
    locked_message: "Cần tier Gold (Pet Score 501+).",
    next_action: "Tăng Pet Score lên 500+" },

  { feature_key: "lost_pet_premium_broadcast", feature_name: "Broadcast 10km thay vì 5km",
    gate_type: "tier_min", gate_value: "gold",
    benefit: "Tìm pet mất hiệu quả gấp đôi",
    locked_message: "Cần tier Gold để broadcast rộng hơn.",
    next_action: "Tăng Pet Score lên 500+" },

  { feature_key: "vet_buddy_chat", feature_name: "Chat với Vet Buddy",
    gate_type: "pet_score_min", gate_value: "300",
    benefit: "Chat trực tiếp với vet primary",
    locked_message: "Cần Pet Score 300+ để vet có đủ info tư vấn.",
    next_action: "Hoàn thiện profile + làm BCS + setup Nutrition" },

  { feature_key: "vet_buddy_priority_response", feature_name: "Priority vet response (SLA 6h)",
    gate_type: "tier_min", gate_value: "gold",
    benefit: "Vet trả lời trong 6h thay vì 24h",
    locked_message: "Cần tier Gold.",
    next_action: "Tăng Pet Score lên 500+" },

  { feature_key: "places_submit", feature_name: "Submit địa điểm mới",
    gate_type: "pet_score_min", gate_value: "200",
    benefit: "Đóng góp địa điểm pet-friendly cho cộng đồng",
    locked_message: "Cần Pet Score 200+ (chống spam).",
    next_action: "Hoàn thiện profile cơ bản" },

  { feature_key: "memorial_premium", feature_name: "Memorial premium features",
    gate_type: "tier_min", gate_value: "silver",
    benefit: "Custom theme, unlimited photos, background music",
    locked_message: "Cần tier Silver.",
    next_action: "Tăng Pet Score lên 300+" },
];

// ============================================================
// Run seeds
// ============================================================
const now = new Date().toISOString();

// ---- Achievements ----
console.log("\n=== Seeding achievements ===");
const existingAch = await listRows<{ id: number; code: string }>("achievement_defs", { size: 200 });
const haveAchCodes = new Set(existingAch.results.map((r) => r.code));
let ach_created = 0, ach_skip = 0;
for (const a of ACHIEVEMENTS) {
  if (haveAchCodes.has(a.code)) { ach_skip++; continue; }
  try {
    await createRow("achievement_defs", {
      code: a.code,
      name: a.name,
      description: a.desc,
      emoji: a.emoji,
      category: a.category,
      tier: a.tier,
      pet_score_bonus: a.bonus,
      unlock_condition_type: a.unlock_type,
      unlock_condition_value: a.unlock_value,
      is_active: true,
      is_secret: a.is_secret === true,
      created_at: now,
    });
    ach_created++;
  } catch (err) {
    console.error(`  ❌ ${a.code}:`, String(err).slice(0, 150));
  }
}
console.log(`  achievements: ${ach_created} created, ${ach_skip} skipped (already exist)`);

// ---- Rewards ----
console.log("\n=== Seeding rewards ===");
const existingRew = await listRows<{ id: number; code: string }>("reward_definitions", { size: 200 });
const haveRewCodes = new Set(existingRew.results.map((r) => r.code));
let rew_created = 0, rew_skip = 0;
for (const r of REWARDS) {
  if (haveRewCodes.has(r.code)) { rew_skip++; continue; }
  try {
    await createRow("reward_definitions", {
      code: r.code,
      name: r.name,
      description: r.description,
      emoji: r.emoji,
      category: r.category,
      unlock_condition_type: r.unlock_type,
      unlock_condition_value: r.unlock_value,
      reward_type: r.reward_type,
      reward_value: r.reward_value,
      reward_provider: r.provider,
      partner_name: r.partner_name || "",
      voucher_code_pattern: r.voucher_pattern || "",
      voucher_validity_days: r.validity_days || 0,
      season_start: "",
      season_end: "",
      max_redemptions_per_user: r.max_per_user,
      max_total_redemptions: -1,
      current_redemptions: 0,
      redemption_instructions: r.instructions || "",
      terms: "VowVet không giữ tiền — voucher sử dụng trực tiếp tại Mon Min Clinic. Áp dụng đúng đối tượng. Không quy đổi ra tiền mặt.",
      is_active: true,
      display_order: r.display_order || 0,
      created_at: now,
      updated_at: now,
    });
    rew_created++;
  } catch (err) {
    console.error(`  ❌ ${r.code}:`, String(err).slice(0, 150));
  }
}
console.log(`  rewards: ${rew_created} created, ${rew_skip} skipped`);

// ---- Feature gates ----
console.log("\n=== Seeding feature gates ===");
const existingG = await listRows<{ id: number; feature_key: string }>("feature_gates", { size: 200 });
const haveGKeys = new Set(existingG.results.map((r) => r.feature_key));
let gate_created = 0, gate_skip = 0;
for (const g of GATES) {
  if (haveGKeys.has(g.feature_key)) { gate_skip++; continue; }
  try {
    await createRow("feature_gates", {
      feature_key: g.feature_key,
      feature_name: g.feature_name,
      gate_type: g.gate_type,
      gate_value: g.gate_value,
      benefit_description: g.benefit,
      locked_message: g.locked_message,
      next_action: g.next_action,
      is_active: true,
      created_at: now,
    });
    gate_created++;
  } catch (err) {
    console.error(`  ❌ ${g.feature_key}:`, String(err).slice(0, 150));
  }
}
console.log(`  feature_gates: ${gate_created} created, ${gate_skip} skipped`);

console.log(`\n✅ Seed Session A done — ${ach_created + rew_created + gate_created} new rows.`);
