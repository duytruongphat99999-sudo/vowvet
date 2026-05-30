/**
 * Routine Badges (M19).
 *
 * Earned by hitting streak/completion milestones. Stored as JSON array of badge IDs
 * in `routine_streaks.badges_earned`. Frontend renders the metadata.
 */

export type RoutineBadgeId =
  | "starter"
  | "week_warrior"
  | "month_master"
  | "century"
  | "perfectionist"
  | "early_bird"
  | "night_owl"
  | "triple_crown";

export interface RoutineBadge {
  id: RoutineBadgeId;
  emoji: string;
  label_vi: string;
  description_vi: string;
  condition: string;
}

export const ROUTINE_BADGES: Record<RoutineBadgeId, RoutineBadge> = {
  starter: {
    id: "starter",
    emoji: "🌱",
    label_vi: "Khởi đầu",
    description_vi: "Hoàn thành routine đầu tiên",
    condition: "first_completion",
  },
  week_warrior: {
    id: "week_warrior",
    emoji: "⚔️",
    label_vi: "Chiến binh tuần",
    description_vi: "Streak 7 ngày liên tiếp",
    condition: "streak_7",
  },
  month_master: {
    id: "month_master",
    emoji: "🏆",
    label_vi: "Bậc thầy tháng",
    description_vi: "Streak 30 ngày liên tiếp",
    condition: "streak_30",
  },
  century: {
    id: "century",
    emoji: "💯",
    label_vi: "Trăm ngày",
    description_vi: "Streak 100 ngày liên tiếp",
    condition: "streak_100",
  },
  perfectionist: {
    id: "perfectionist",
    emoji: "✨",
    label_vi: "Hoàn hảo",
    description_vi: "Hoàn thành 100% tasks trong routine",
    condition: "completion_100_perfect",
  },
  early_bird: {
    id: "early_bird",
    emoji: "🐤",
    label_vi: "Dậy sớm",
    description_vi: "Hoàn thành routine sáng (trước 9:00) 30 lần",
    condition: "morning_routine_30",
  },
  night_owl: {
    id: "night_owl",
    emoji: "🦉",
    label_vi: "Cú đêm",
    description_vi: "Hoàn thành routine tối (sau 18:00) 30 lần",
    condition: "evening_routine_30",
  },
  triple_crown: {
    id: "triple_crown",
    emoji: "👑",
    label_vi: "Tam vương",
    description_vi: "Hoàn thành 3+ routines cùng ngày, 7 lần",
    condition: "3_routines_same_day_7x",
  },
};

export const ALL_BADGE_IDS: RoutineBadgeId[] = Object.keys(ROUTINE_BADGES) as RoutineBadgeId[];

export type RoutineScheduleType = "daily" | "weekdays" | "weekends" | "custom";

export type RoutineTaskCategory =
  | "food"
  | "exercise"
  | "grooming"
  | "health"
  | "training"
  | "play"
  | "other";

export interface RoutineTask {
  id: string;
  title: string;
  emoji: string;
  duration_minutes: number;
  points: number;
  category: RoutineTaskCategory;
  notes?: string;
}

export const TASK_CATEGORY_LABELS: Record<RoutineTaskCategory, string> = {
  food: "Ăn uống",
  exercise: "Vận động",
  grooming: "Vệ sinh",
  health: "Sức khoẻ",
  training: "Huấn luyện",
  play: "Vui chơi",
  other: "Khác",
};

// ============================================================
// Built-in templates (returned by GET /routines/templates)
// ============================================================
export interface RoutineTemplate {
  template_id: string;
  name: string;
  icon: string;
  color: string;
  schedule_type: RoutineScheduleType;
  start_time: string;
  tasks: RoutineTask[];
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    template_id: "morning_basic",
    name: "Routine sáng cơ bản",
    icon: "☀️",
    color: "#F59E0B",
    schedule_type: "daily",
    start_time: "06:30",
    tasks: [
      { id: "t1", title: "Cho ăn sáng", emoji: "🍴", duration_minutes: 10, points: 2, category: "food" },
      { id: "t2", title: "Đi dạo 20 phút", emoji: "🚶", duration_minutes: 20, points: 3, category: "exercise" },
      { id: "t3", title: "Đổ nước sạch", emoji: "💧", duration_minutes: 2, points: 1, category: "food" },
      { id: "t4", title: "Chải lông nhẹ", emoji: "🪮", duration_minutes: 5, points: 1, category: "grooming" },
    ],
  },
  {
    template_id: "evening_basic",
    name: "Routine tối",
    icon: "🌙",
    color: "#6366F1",
    schedule_type: "daily",
    start_time: "19:00",
    tasks: [
      { id: "t1", title: "Cho ăn tối", emoji: "🍴", duration_minutes: 10, points: 2, category: "food" },
      { id: "t2", title: "Đi dạo nhẹ", emoji: "🌆", duration_minutes: 15, points: 2, category: "exercise" },
      { id: "t3", title: "Chơi với bé 10p", emoji: "🎾", duration_minutes: 10, points: 2, category: "play" },
      { id: "t4", title: "Đánh răng", emoji: "🦷", duration_minutes: 3, points: 2, category: "health" },
    ],
  },
  {
    template_id: "weekend_training",
    name: "Training cuối tuần",
    icon: "🎓",
    color: "#10B981",
    schedule_type: "weekends",
    start_time: "09:00",
    tasks: [
      { id: "t1", title: "Dạy lệnh mới 10p", emoji: "🧠", duration_minutes: 10, points: 3, category: "training" },
      { id: "t2", title: "Ôn lệnh cũ", emoji: "🔁", duration_minutes: 5, points: 2, category: "training" },
      { id: "t3", title: "Reward + nghỉ", emoji: "🎁", duration_minutes: 5, points: 1, category: "play" },
    ],
  },
  {
    template_id: "grooming_weekly",
    name: "Grooming cuối tuần",
    icon: "🛁",
    color: "#06B6D4",
    schedule_type: "weekends",
    start_time: "10:00",
    tasks: [
      { id: "t1", title: "Tắm sạch", emoji: "🛁", duration_minutes: 20, points: 3, category: "grooming" },
      { id: "t2", title: "Sấy & chải lông", emoji: "💨", duration_minutes: 15, points: 2, category: "grooming" },
      { id: "t3", title: "Cắt móng", emoji: "✂️", duration_minutes: 10, points: 2, category: "grooming" },
      { id: "t4", title: "Vệ sinh tai", emoji: "👂", duration_minutes: 5, points: 1, category: "health" },
    ],
  },
];

// ============================================================
// Constants
// ============================================================

/** Required min completion rate (%) for a routine to count toward streak. */
export const STREAK_MIN_COMPLETION_RATE = 50;

/** Monthly streak freeze budget — refilled by Job 8 on day 1 of each month. */
export const MONTHLY_FREEZE_BUDGET = 3;
