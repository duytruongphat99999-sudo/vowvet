/**
 * Tải config Baserow (table IDs + field IDs) từ baserow-config.json ở project root.
 * File này do scripts/setup-baserow.ts sinh ra sau khi tạo schema lần đầu.
 */
import config from "../baserow-config.json" with { type: "json" };

export type TableName =
  | "users"
  | "pets"
  | "vaccines"
  | "dewormers"
  | "daily_check_ins"
  | "care_plans"
  | "allergies_diet"
  | "health_events"
  | "pet_photos"
  | "climate_alerts"
  | "notification_log"
  | "vaccine_schedules"
  | "weight_logs"
  | "food_brands"
  | "triage_sessions"
  | "chat_threads"
  | "chat_messages"
  | "voice_diary_entries"
  | "pet_routines"
  | "routine_completions"
  | "water_intake_logs"
  | "vet_bills"
  | "birthday_events"
  | "voice_diary_entries"
  | "routines"
  | "routine_completions"
  | "routine_streaks"
  | "lost_pet_reports"
  | "lost_pet_sightings"
  | "vet_partners"
  | "cognitive_assessments"
  | "pain_assessments"
  | "mobility_assessments"
  | "water_intake_logs"
  | "places"
  | "place_checkins"
  | "bcs_assessments"
  | "memorials"
  | "memorial_visits"
  | "memorial_interest"
  | "playdate_profiles"
  | "playdate_swipes"
  | "playdate_matches"
  | "playdate_messages"
  | "playdate_reports"
  | "triage_tree_sessions"
  | "faqs"
  | "hero_acts"
  | "achievement_defs"
  | "user_achievements"
  | "reward_definitions"
  | "user_rewards"
  | "feature_gates"
  | "user_nudges_sent"
  | "leaderboard_snapshots"
  | "quest_definitions"
  | "user_daily_quests"
  | "community_events"
  | "insurance_waitlist"
  | "care_plan_completions"
  | "pet_exercise_logs"
  | "pet_water_logs"
  | "scan_logs"
  | "danger_kb";

export interface TableMeta {
  id: number;
  fields: Record<string, number>;
}

export interface BaserowConfig {
  database_id: number;
  // Partial vì pet_photos chỉ có sau migration M3.5; rest đã có từ setup
  tables: Partial<Record<TableName, TableMeta>>;
}

export const baserowConfig = config as unknown as BaserowConfig;

export function tableId(name: TableName): number {
  const t = baserowConfig.tables[name];
  if (!t) throw new Error(`Table "${name}" chưa tồn tại trong baserow-config.json. Chạy migration?`);
  return t.id;
}

export function fieldId(table: TableName, field: string): number {
  const t = baserowConfig.tables[table];
  if (!t) throw new Error(`Table "${table}" chưa tồn tại`);
  const id = t.fields[field];
  if (!id) throw new Error(`Field "${field}" not found in table "${table}"`);
  return id;
}
