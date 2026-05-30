/**
 * Mon Min Pet Score formula (M14.2) — pure functions, testable.
 *
 * Input: raw signals từ tables (counts + flags + dates)
 * Output: ScoreBreakdown với 9 components, clamp 0-1000, level mapping
 *
 * Formula: base 500 + adjustments. Recommendations dựa trên gap to max.
 */

export interface ScoreInputs {
  // Vaccine compliance (M6)
  vaccines_total: number;
  vaccines_up_to_date: number;
  vaccines_expired: number;

  // BCS (M7 hoặc M3.5)
  bcs: number | null; // 1-9 scale

  // Daily check-in streak (M4 daily_check_ins)
  checkin_streak_days: number;

  // Last vet visit (M9.2 closed chat threads OR vaccine administered date)
  last_vet_visit_days_ago: number | null; // null = never

  // Chronic conditions (M3.5 medical_conditions — defer Phase 0 default 0)
  chronic_conditions_count: number;

  // Age modifier (years)
  age_years: number | null;
  species: "dog" | "cat" | "other";

  // Recent emergency triage (M9.1 urgency=5 trong 90 ngày)
  recent_emergency_triage: boolean;

  // Allergies (M3.5 allergies_diet count)
  allergies_count: number;

  // Routine streak (M19) — 0 if no routines tracked
  routine_streak_days: number;

  // M23+M24+M25: assessment-based health signals
  pain_level?: "none" | "mild" | "moderate" | "severe" | null;
  mobility_pct?: number | null; // 0-100
  cognitive_category?: "normal" | "mild" | "moderate" | "severe" | null;
  water_status?: "low" | "normal" | "high" | null;

  // Lost Pet upgrade: Pet Hero community bonus (lifetime)
  pet_hero_bonus_raw?: number; // raw bonus points from user.pet_score_bonus

  // M15 Personality k-factor: bonus multiplier on activity (0.75-1.60)
  // Default 1.0 if pet hasn't completed quiz yet.
  personality_k_factor?: number;
}

export interface ScoreComponent {
  key: string;
  label_vi: string;
  current_value: number;
  max_possible: number; // max positive contribution
  min_possible: number; // max negative contribution
  description?: string;
}

export interface ScoreBreakdown {
  base: number;
  components: ScoreComponent[];
  total: number; // clamped 0-1000
  raw_sum: number; // unclamped
}

// ============================================================
// Component calculators
// ============================================================

function vaccineCompliance(input: ScoreInputs): ScoreComponent {
  // Tối đa +200 nếu all up-to-date, penalty cho expired
  let value = 0;
  if (input.vaccines_total === 0) {
    // Pet mới chưa có vaccine plan → neutral (chờ schedule)
    value = 0;
  } else {
    const ratio = input.vaccines_up_to_date / input.vaccines_total;
    if (ratio >= 1) value = 200;
    else if (ratio >= 0.7) value = 100;
    else value = 0;
    // Penalty -50 per expired (max -150)
    value -= Math.min(150, input.vaccines_expired * 50);
  }
  return {
    key: "vaccine_compliance",
    label_vi: "Vaccine đúng lịch",
    current_value: value,
    max_possible: 200,
    min_possible: -150,
    description: `${input.vaccines_up_to_date}/${input.vaccines_total} vaccine up-to-date${input.vaccines_expired > 0 ? `, ${input.vaccines_expired} expired` : ""}`,
  };
}

function bcsOptimal(input: ScoreInputs): ScoreComponent {
  let value = 0;
  if (input.bcs === null) {
    value = 0;
  } else if (input.bcs >= 4 && input.bcs <= 6) {
    value = 100;
  } else if (input.bcs === 3 || input.bcs === 7) {
    value = 0;
  } else {
    value = -50;
  }
  return {
    key: "bcs_optimal",
    label_vi: "Cân nặng phù hợp (BCS)",
    current_value: value,
    max_possible: 100,
    min_possible: -50,
    description: input.bcs ? `BCS ${input.bcs}/9${input.bcs >= 7 ? " (thừa cân)" : input.bcs <= 3 ? " (thiếu cân)" : " (ideal)"}` : "Chưa có BCS",
  };
}

function checkinStreak(input: ScoreInputs): ScoreComponent {
  let value = 0;
  const days = input.checkin_streak_days;
  if (days >= 30) value = 100;
  else if (days >= 14) value = 75;
  else if (days >= 7) value = 50;
  else if (days >= 1) value = 25;
  return {
    key: "checkin_streak",
    label_vi: "Check-in hằng ngày",
    current_value: value,
    max_possible: 100,
    min_possible: 0,
    description: days > 0 ? `Streak ${days} ngày liên tiếp` : "Chưa có check-in",
  };
}

function vetVisitRecent(input: ScoreInputs): ScoreComponent {
  let value = 0;
  const days = input.last_vet_visit_days_ago;
  if (days === null) value = -100;
  else if (days <= 180) value = 100;
  else if (days <= 365) value = 50;
  else if (days <= 730) value = -50;
  else value = -100;
  return {
    key: "vet_visit_recent",
    label_vi: "Khám vet gần đây",
    current_value: value,
    max_possible: 100,
    min_possible: -100,
    description: days === null ? "Chưa từng khám vet (qua VowVet)" : `Khám gần nhất ${days} ngày trước`,
  };
}

function chronicConditions(input: ScoreInputs): ScoreComponent {
  let value = 0;
  const n = input.chronic_conditions_count;
  if (n === 0) value = 100;
  else if (n === 1) value = 0;
  else if (n === 2) value = -50;
  else value = -150;
  return {
    key: "no_chronic_conditions",
    label_vi: "Không có bệnh mạn",
    current_value: value,
    max_possible: 100,
    min_possible: -150,
    description: n === 0 ? "Không có bệnh mạn" : `${n} bệnh mạn`,
  };
}

function ageModifier(input: ScoreInputs): ScoreComponent {
  let value = 0;
  if (input.age_years !== null) {
    const isSeniorDog = input.species === "dog" && input.age_years >= 8;
    const isSeniorCat = input.species === "cat" && input.age_years >= 10;
    if (isSeniorDog || isSeniorCat) value = -50;
  }
  return {
    key: "age_modifier",
    label_vi: "Tuổi (senior penalty)",
    current_value: value,
    max_possible: 0,
    min_possible: -50,
    description: input.age_years === null ? "Chưa nhập tuổi" : `${input.age_years} tuổi${value < 0 ? " (senior)" : ""}`,
  };
}

function recentEmergency(input: ScoreInputs): ScoreComponent {
  return {
    key: "recent_emergency",
    label_vi: "Không cấp cứu gần đây",
    current_value: input.recent_emergency_triage ? -100 : 0,
    max_possible: 0,
    min_possible: -100,
    description: input.recent_emergency_triage ? "Có triage L5 trong 90 ngày" : "Không cấp cứu",
  };
}

function painStatusComponent(input: ScoreInputs): ScoreComponent {
  let value = 0;
  if (input.pain_level === "none" || input.pain_level === undefined || input.pain_level === null) value = 0;
  else if (input.pain_level === "mild") value = -10;
  else if (input.pain_level === "moderate") value = -50;
  else if (input.pain_level === "severe") value = -100;
  return {
    key: "pain_status",
    label_vi: "Mức đau (Glasgow CMPS-SF)",
    current_value: value,
    max_possible: 0,
    min_possible: -100,
    description: input.pain_level == null ? "Chưa đánh giá" : `Pain level: ${input.pain_level}`,
  };
}

function mobilityComponent(input: ScoreInputs): ScoreComponent {
  if (input.mobility_pct == null) {
    return {
      key: "mobility",
      label_vi: "Vận động",
      current_value: 0,
      max_possible: 50,
      min_possible: -50,
      description: "Chưa đánh giá",
    };
  }
  let value = 0;
  if (input.mobility_pct >= 85) value = 50;
  else if (input.mobility_pct >= 65) value = 25;
  else if (input.mobility_pct >= 40) value = -20;
  else value = -50;
  return {
    key: "mobility",
    label_vi: "Vận động",
    current_value: value,
    max_possible: 50,
    min_possible: -50,
    description: `${input.mobility_pct}% mobility score`,
  };
}

function cognitiveStatusComponent(input: ScoreInputs): ScoreComponent {
  if (input.cognitive_category == null) {
    return {
      key: "cognitive_status",
      label_vi: "Nhận thức (CCDS)",
      current_value: 0,
      max_possible: 0,
      min_possible: -100,
      description: "Chưa đánh giá",
    };
  }
  let value = 0;
  if (input.cognitive_category === "normal") value = 0;
  else if (input.cognitive_category === "mild") value = -15;
  else if (input.cognitive_category === "moderate") value = -50;
  else value = -100;
  return {
    key: "cognitive_status",
    label_vi: "Nhận thức (CCDS)",
    current_value: value,
    max_possible: 0,
    min_possible: -100,
    description: `Category: ${input.cognitive_category}`,
  };
}

function waterStatusComponent(input: ScoreInputs): ScoreComponent {
  if (input.water_status == null) {
    return {
      key: "water_intake",
      label_vi: "Lượng nước",
      current_value: 0,
      max_possible: 30,
      min_possible: -30,
      description: "Chưa log",
    };
  }
  let value = 0;
  if (input.water_status === "normal") value = 30;
  else if (input.water_status === "low") value = -20;
  else if (input.water_status === "high") value = -30; // polydipsia warning
  return {
    key: "water_intake",
    label_vi: "Lượng nước",
    current_value: value,
    max_possible: 30,
    min_possible: -30,
    description: `Status: ${input.water_status}`,
  };
}

function routineConsistency(input: ScoreInputs): ScoreComponent {
  // 0-30 ngày: 0-100 linear; 30+ cap 100
  const days = input.routine_streak_days;
  let value = 0;
  if (days > 0) value = Math.min(100, Math.round((days / 30) * 100));
  return {
    key: "routine_consistency",
    label_vi: "Routine đều đặn",
    current_value: value,
    max_possible: 100,
    min_possible: 0,
    description: days > 0
      ? `Streak ${days} ngày (max 100đ ở 30 ngày)`
      : "Chưa có streak — tạo routine để bắt đầu",
  };
}

function personalityModifier(input: ScoreInputs): ScoreComponent {
  // M15: bonus dựa trên k_factor × tổng activity (checkin + routine streak).
  // Chỉ thưởng (clamp >= 0) — không penalty owner của pet introvert (đã đủ thoải mái).
  const k = input.personality_k_factor ?? 1.0;

  // Activity base = checkin + routine streak contribution
  const checkinValue = Math.min(150, input.checkin_streak_days * 5);
  const routineValue = input.routine_streak_days > 0
    ? Math.min(100, Math.round((input.routine_streak_days / 30) * 100))
    : 0;
  const activityBase = checkinValue + routineValue;

  // Bonus = activity × (k - 1), clamped >= 0
  const bonus = k > 1
    ? Math.max(0, Math.round(activityBase * (k - 1)))
    : 0;

  let description: string;
  if (!input.personality_k_factor) {
    description = "Chưa làm quiz tính cách — làm để bật bonus";
  } else if (k > 1) {
    description = `×${k.toFixed(2)} — bé năng động → ${activityBase}đ activity × ${(k - 1).toFixed(2)} = +${bonus}đ thưởng`;
  } else if (k < 1) {
    description = `×${k.toFixed(2)} — bé nhẹ nhàng, không cần bonus (bạn đã đủ tốt rồi)`;
  } else {
    description = "Type cân bằng — không bonus đặc biệt";
  }

  return {
    key: "personality_modifier",
    label_vi: "Bộ nhân tính cách",
    current_value: bonus,
    max_possible: 150, // theoretical: activity 250 × 0.6 = 150 (athlete k=1.6)
    min_possible: 0,
    description,
  };
}

function petHeroBonus(input: ScoreInputs): ScoreComponent {
  // 100 pts per sighting_confirmed, capped 50 points effective Pet Score contribution
  // user.pet_score_bonus accumulates 100/500/1000 per act; map → 0..50 component score
  const raw = input.pet_hero_bonus_raw || 0;
  let value = 0;
  if (raw >= 1000) value = 50;
  else if (raw >= 500) value = 30;
  else if (raw >= 100) value = 15;
  else if (raw > 0) value = 5;
  return {
    key: "pet_hero_bonus",
    label_vi: "Cộng đồng (Pet Hero)",
    current_value: value,
    max_possible: 50,
    min_possible: 0,
    description: raw > 0 ? `Chủ đã giúp cộng đồng — bonus ${raw} pts` : "Tham gia giúp pet mất để nhận bonus",
  };
}

function allergiesScore(input: ScoreInputs): ScoreComponent {
  let value = 0;
  const n = input.allergies_count;
  if (n === 0) value = 0;
  else if (n <= 2) value = -25;
  else value = -50;
  return {
    key: "allergies",
    label_vi: "Dị ứng (penalty)",
    current_value: value,
    max_possible: 0,
    min_possible: -50,
    description: n === 0 ? "Không dị ứng" : `${n} dị ứng đã ghi`,
  };
}

// ============================================================
// Compute breakdown + clamp
// ============================================================

const BASE_SCORE = 500;

export function computePetScore(input: ScoreInputs): ScoreBreakdown {
  const components: ScoreComponent[] = [
    vaccineCompliance(input),
    bcsOptimal(input),
    checkinStreak(input),
    vetVisitRecent(input),
    chronicConditions(input),
    ageModifier(input),
    recentEmergency(input),
    allergiesScore(input),
    routineConsistency(input),
    personalityModifier(input),
    painStatusComponent(input),
    mobilityComponent(input),
    cognitiveStatusComponent(input),
    waterStatusComponent(input),
    petHeroBonus(input),
  ];
  const raw = BASE_SCORE + components.reduce((s, c) => s + c.current_value, 0);
  const total = Math.max(0, Math.min(1000, raw));
  return {
    base: BASE_SCORE,
    components,
    raw_sum: raw,
    total,
  };
}

// ============================================================
// 5 levels
// ============================================================

export type LevelId = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface ScoreLevel {
  id: LevelId;
  emoji: string;
  name_vi: string;
  range: [number, number];
  color: string; // Tailwind color name (cho frontend mapping)
  gradient: string; // Tailwind gradient class
}

export const SCORE_LEVELS: ScoreLevel[] = [
  { id: "bronze", emoji: "🥉", name_vi: "Mới bắt đầu", range: [0, 300], color: "amber", gradient: "from-amber-400 to-orange-500" },
  { id: "silver", emoji: "🥈", name_vi: "Tốt", range: [301, 500], color: "slate", gradient: "from-slate-400 to-zinc-500" },
  { id: "gold", emoji: "🥇", name_vi: "Rất tốt", range: [501, 700], color: "yellow", gradient: "from-yellow-400 to-amber-500" },
  { id: "platinum", emoji: "✨", name_vi: "Xuất sắc", range: [701, 850], color: "sky", gradient: "from-sky-400 to-cyan-500" },
  { id: "diamond", emoji: "👑", name_vi: "Hoàn hảo", range: [851, 1000], color: "purple", gradient: "from-purple-400 to-fuchsia-500" },
];

export function getScoreLevel(score: number): ScoreLevel {
  for (const lv of SCORE_LEVELS) {
    if (score >= lv.range[0] && score <= lv.range[1]) return lv;
  }
  return SCORE_LEVELS[0]; // fallback bronze
}

// ============================================================
// Actionable recommendations
// ============================================================

export interface ScoreRecommendation {
  icon: string;
  title: string;
  advice: string;
  potential_points: number;
  action_url?: string;
  component_key: string;
}

const RECO_TEMPLATES: Record<string, { icon: string; title: string; advice: string; action_url?: string }> = {
  vaccine_compliance: {
    icon: "💉",
    title: "Vaccine cần tiêm",
    advice: "Tiêm các mũi đang đến hạn để đảm bảo bảo vệ + tăng score.",
    action_url: "/vaccines",
  },
  bcs_optimal: {
    icon: "⚖️",
    title: "Điều chỉnh cân nặng",
    advice: "BCS chưa optimal (4-6 ideal). Vào nutrition plan để giảm/tăng portion phù hợp.",
    action_url: "/pets/{pet_id}",
  },
  checkin_streak: {
    icon: "📊",
    title: "Check-in hằng ngày",
    advice: "Check-in mỗi ngày để build streak. 30 ngày streak → +100 điểm.",
    action_url: "/pets/{pet_id}",
  },
  vet_visit_recent: {
    icon: "🩺",
    title: "Đặt lịch khám vet",
    advice: "Pet nên khám vet định kỳ 6-12 tháng/lần. Chat với bác sĩ Mon Min để đặt.",
    action_url: "/chat/new",
  },
  no_chronic_conditions: {
    icon: "🏥",
    title: "Theo dõi bệnh mạn",
    advice: "Pet có bệnh mạn — giữ kế hoạch điều trị nhất quán + tái khám định kỳ.",
    action_url: "/chat/new",
  },
  allergies: {
    icon: "⚠️",
    title: "Quản lý dị ứng",
    advice: "Tránh các chất pet dị ứng (xem nutrition plan). Báo vet nếu xuất hiện symptom mới.",
    action_url: "/pets/{pet_id}",
  },
  routine_consistency: {
    icon: "🔥",
    title: "Tạo routine hàng ngày",
    advice: "Streak routine càng dài, điểm càng cao (max ở 30 ngày). Tạo routine và tick đều mỗi ngày.",
    action_url: "/pets/{pet_id}/routines",
  },
};

export function buildRecommendations(breakdown: ScoreBreakdown, petId: number, max = 3): ScoreRecommendation[] {
  // Gap = max_possible - current_value (positive = có thể tăng)
  const gaps = breakdown.components
    .map((c) => ({ ...c, gap: c.max_possible - c.current_value }))
    .filter((c) => c.gap > 0 && RECO_TEMPLATES[c.key]) // chỉ recommend những cái có template
    .sort((a, b) => b.gap - a.gap)
    .slice(0, max);

  return gaps.map((c) => {
    const tpl = RECO_TEMPLATES[c.key];
    return {
      icon: tpl.icon,
      title: tpl.title,
      advice: tpl.advice,
      potential_points: c.gap,
      action_url: tpl.action_url?.replace("{pet_id}", String(petId)),
      component_key: c.key,
    };
  });
}
