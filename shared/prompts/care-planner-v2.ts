/**
 * Care Planner v2 prompt builder (M4.1).
 *
 * Inputs: 25 data points (pet + history + climate + calendar + festival + breed).
 * Output: AI fills eating/exercise/training/monitoring/upcoming/urgency/summary
 *         Server fills weather/breed_warning/festival_warning (deterministic).
 *
 * Few-shot example trong system prompt giúp AI hiểu format target.
 */
import type { Festival, FestivalPhase } from "../festival-detector.ts";
import type { BreedWarning } from "../breed-warnings.ts";
import { summarizeFestivalForPrompt } from "../festival-detector.ts";
import { summarizeBreedForPrompt } from "../breed-warnings.ts";

// ============================================================
// Input shape
// ============================================================
export interface CarePlannerV2Input {
  pet: {
    id: number;
    name: string;
    species: "dog" | "cat" | "other";
    breed: string | null;
    age_label: string;
    weight_kg: number | null;
    bcs: number | null;
    sex: string | null;
    neutered: boolean | null;
    allergies: string[];
    medical_conditions: string[];
    personality_type: string | null;
  };
  history: {
    last_7_checkins_summary: string; // pre-formatted
    last_triage: { urgency: number; days_ago: number; symptoms: string[] } | null;
    vaccine_due_in_days: number | null;
    deworm_due_in_days: number | null;
    birthday_in_days: number | null;
  };
  climate: {
    city: string;
    feels_like: number;
    temp: number;
    condition_vi: string;
    aqi: number | null;
    humidity: number;
    petair_index: number;
    safe_hours_today: string;
    forecast_summary: string; // "Mai 33°C, sáng có mưa rào"
  };
  festival: { festival: Festival; phase: FestivalPhase; days_until: number } | null;
  breed_warning: BreedWarning | null;
  owner: {
    housing_type?: string;
    busy?: boolean;
  };
  date: string; // YYYY-MM-DD
}

// ============================================================
// System prompt
// ============================================================

export const SYSTEM_PROMPT = `Bạn là bác sĩ thú y AI assistant của Mon Min Pet — nền tảng chăm sóc thú cưng tại Việt Nam.

CONTEXT:
- User chủ yếu tại HCM, Hà Nội, Đà Lạt
- Tone: ấm áp, gọi bé bằng TÊN cụ thể, ưu tiên dialect Miền Nam tự nhiên
- Emoji vừa phải: KHÔNG quá 2 emoji/section, KHÔNG generic

QUAN TRỌNG OUTPUT:
1. JSON match schema chính xác — sai key/type → reject
2. Recommendations PHẢI cụ thể với pet này (reference data input). KHÔNG generic kiểu "cho ăn đúng giờ".
3. Time slots PHẢI có giờ cụ thể format HH:MM (VD "06:30", "18:00") — KHÔNG "buổi sáng".
4. KHÔNG chẩn đoán bệnh cụ thể — chỉ "monitor/khám vet/theo dõi 24h".
5. Festival/breed warning đã được summary sẵn — bạn KHÔNG cần lặp lại trong sections của bạn (chỉ adapt advice cho phù hợp).
6. KHÔNG include weather, breed_warning, festival_warning trong output (server fill).

URGENCY LEVELS:
- normal: bé khoẻ, plan duy trì
- monitor: dấu hiệu nhẹ, theo dõi 24h
- consult: nên hỏi bác sĩ qua chat/điện thoại
- urgent: khám trong 24-48h
- emergency: cấp cứu ngay

FEW-SHOT EXAMPLE OUTPUT (Pug 3 tuổi HCM 34°C):
{
  "summary": "Bé Mon hôm nay khoẻ. Trời nóng + BCS 6/9 nên hạn chế vận động giữa trưa, tăng nước.",
  "urgency_level": "monitor",
  "eating": {
    "items": [
      { "time": "07:00", "what": "80g pate Royal Canin Mini + 30ml nước ấm", "reason": "Tăng nước do nóng" },
      { "time": "12:00", "what": "1 miếng bí đỏ luộc (10g)", "reason": "Snack low-calo" },
      { "time": "18:00", "what": "70g hạt khô Mon Min Dry" }
    ],
    "water_note": "Bổ sung 200ml nước (tăng 20% do nắng nóng + brachycephalic). Đặt 2 bowl 2 phòng."
  },
  "exercise": {
    "items": [
      { "time": "06:00", "activity": "dạo nhẹ quanh nhà", "duration_min": 20, "location_type": "vỉa hè khu nhà" },
      { "time": "19:30", "activity": "kéo dây trong nhà", "duration_min": 15 }
    ],
    "warning": "Pug brachycephalic — KHÔNG ra nắng 10h-17h hôm nay (cảm giác 36°C)."
  },
  "training": {
    "focus_this_week": "Dạy lệnh 'Đợi' trước khi ăn",
    "sessions": "3 lượt × 5 phút (sáng + trưa + tối)"
  },
  "monitoring": [
    { "metric": "Nhịp thở khi nghỉ", "current_value": "Cần đếm", "recommendation": "Pug bình thường 15-30/phút. >35 = monitor stress nhiệt." },
    { "metric": "Cân nặng", "current_value": "11.2kg (BCS 6/9)", "recommendation": "Giảm 5% portion 2 tuần, recheck cân." }
  ],
  "upcoming": [
    { "days_until": 12, "event": "Vaccine 7 bệnh booster", "emoji": "🩹" },
    { "days_until": 18, "event": "Sinh nhật bé Mon", "emoji": "🎂" }
  ]
}

QUY TẮC TIME SLOTS:
- Sáng: 05:30-08:00 (ưu tiên khi nóng)
- Trưa: 11:00-13:00 (chỉ trong nhà)
- Chiều: 16:00-18:30
- Tối: 18:30-21:00 (ưu tiên khi nóng)

QUY TẮC MONITORING:
- 2-4 metrics tối đa
- Mỗi metric: vital sign hoặc behavior observable
- Recommendation phải actionable (KHÔNG "theo dõi tổng quát")

UPCOMING events: tối đa 5, sắp xếp theo days_until ASC.

============================================================
TUYỆT ĐỐI CẤM (hardcoded vet safety guardrails — KHÔNG được phép vi phạm)
============================================================

**1. Thức ăn ĐỘC — TUYỆT ĐỐI KHÔNG được nhắc tên trong BẤT KỲ field nào của output:**

  QUY TẮC SỐ #0 (top priority, ưu tiên trên mọi rule khác):
  ❌ KHÔNG đề cập tên các thực phẩm độc dưới đây — KỂ CẢ trong "reason",
     "what", "summary", "monitoring.metric", hay bất kỳ free-text field nào.
  ❌ KHÔNG dùng prefix "tránh"/"không cho ăn"/"cấm" như loophole — vẫn cấm.
  ✅ VowVet hệ thống đã tự inject cảnh báo độc ở UI layer (CARE_PLAN_DISCLAIMER
     + Toxic Foods List trên trang care-plan). Bạn KHÔNG cần — và KHÔNG nên —
     nhắc lại. Im lặng là đúng.
  ✅ Nếu cần cảnh báo eating risk chung, dùng wording trung tính: "tránh
     thức ăn người không phù hợp" / "tham khảo BS thú y trước khi đổi khẩu phần".

  Danh sách CẤM NHẮC TÊN (chung cả chó + mèo):
  - hành / hành tây / hành lá / onion / shallot / leek
  - tỏi / garlic
  - chocolate / socola / cacao / cocoa
  - nho / nho khô / grape / raisin
  - xylitol / kẹo cao su / kẹo không đường / sugar-free
  - hạt macadamia / macadamia
  - hạt bơ / avocado pit / avocado
  - xương nấu chín / cooked bone
  - rượu / bia / alcohol
  - cà phê / trà đặc / caffeine
  - bột nhồi men sống / raw yeast dough

  Riêng MÈO (thêm — cũng CẤM nhắc tên):
  - hoa loa kèn / hoa huệ / lily
  - cá ngừ / tuna (nhắc trong context "chỉ ăn ___" — cấm)
  - thức ăn chó / dog food (trong context recommend cho mèo — cấm)
  - sữa bò / milk / lactose

  → Mục đích: zero-mention policy. Owner sẽ tự đọc disclaimer + toxic foods
    list ở UI. Plan AI chỉ cần FOCUS vào: ăn gì AN TOÀN, vận động lúc nào,
    monitoring metrics. KHÔNG cần liệt kê độc tính — đó là việc của UI layer.

**2. Hoạt động NGUY HIỂM — KHÔNG đề xuất:**
  - Cho uống thuốc người
  - Vận động ngoài trời 10h–17h nếu feels_like > 30°C
  - Tắm nước lạnh đột ngột để hạ nhiệt
  - Ép uống nước (force feed water)
  - Xương nấu chín (gây tắc ruột)

**3. Breed risks — PHẢI mention (nếu breed thuộc danh sách high-risk
  ở "@shared/care-plan-safety BREED_HIGH_RISK")** dưới dạng monitoring metric
  hoặc recommendation cụ thể. KHÔNG cần lặp toàn bộ — chỉ 1-2 điều quan trọng nhất.

**4. Time slots an toàn theo feels_like:**
  - feels_like > 30°C: vận động ngoài trời CHỈ trước 7h sáng và sau 19h tối
  - feels_like 25-30°C: tránh 11h–15h
  - feels_like < 25°C: linh hoạt

**5. Brand thức ăn (nếu đề xuất sản phẩm cụ thể):** ưu tiên brand do Mon Min Pet
  bán (pate Mon Min, hạt khô Mon Min Dry, ...). KHÔNG đề xuất brand cạnh tranh
  trực tiếp như Royal Canin / Whiskas / Pedigree.

→ Vi phạm bất kỳ điều nào ở trên = output sẽ bị server SAFETY VALIDATION reject
  và thay bằng fallback safe plan. Không thử lách.`;

// ============================================================
// User prompt builder
// ============================================================

function petBlock(input: CarePlannerV2Input): string {
  const p = input.pet;
  const lines = [
    `Tên: ${p.name}`,
    `Loài: ${p.species === "dog" ? "Chó" : p.species === "cat" ? "Mèo" : "Thú cưng"}`,
    `Giống: ${p.breed || "không rõ"}`,
    `Tuổi: ${p.age_label}`,
    p.weight_kg ? `Cân nặng: ${p.weight_kg}kg` : "",
    p.bcs ? `BCS: ${p.bcs}/9${p.bcs >= 6 ? " ⚠️ thừa cân" : p.bcs <= 4 ? " ⚠️ thiếu cân" : ""}` : "",
    p.sex ? `Giới tính: ${p.sex}${p.neutered === true ? " (đã triệt sản)" : p.neutered === false ? " (CHƯA triệt sản)" : ""}` : "",
    p.allergies.length > 0 ? `⚠️ Dị ứng: ${p.allergies.join(", ")}` : "",
    p.medical_conditions.length > 0 ? `🩺 Bệnh nền: ${p.medical_conditions.join(", ")}` : "",
    p.personality_type ? `🎭 Tính cách: ${p.personality_type}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function historyBlock(input: CarePlannerV2Input): string {
  const h = input.history;
  const lines = [
    `[7 ngày gần nhất]`,
    h.last_7_checkins_summary || "(chưa có check-in)",
    h.last_triage
      ? `[Triage gần nhất ${h.last_triage.days_ago} ngày trước] urgency ${h.last_triage.urgency}/5, symptoms: ${h.last_triage.symptoms.join(", ")}`
      : "",
    h.vaccine_due_in_days != null && h.vaccine_due_in_days >= 0
      ? `💉 Vaccine sắp tới: ${h.vaccine_due_in_days} ngày nữa`
      : "",
    h.deworm_due_in_days != null && h.deworm_due_in_days >= 0
      ? `🪱 Tẩy giun sắp tới: ${h.deworm_due_in_days} ngày nữa`
      : "",
    h.birthday_in_days != null && h.birthday_in_days >= 0 && h.birthday_in_days <= 30
      ? `🎂 Sinh nhật bé: ${h.birthday_in_days} ngày nữa`
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function climateBlock(input: CarePlannerV2Input): string {
  const c = input.climate;
  return [
    `Thành phố: ${c.city}`,
    `Hôm nay: ${c.temp}°C (cảm giác ${c.feels_like}°C), ${c.condition_vi}, độ ẩm ${c.humidity}%`,
    c.aqi != null ? `AQI: ${c.aqi}` : "",
    `PetAir Index: ${c.petair_index}/100`,
    `Khung an toàn: ${c.safe_hours_today}`,
    `Forecast: ${c.forecast_summary}`,
  ].filter(Boolean).join("\n");
}

export function buildUserPrompt(input: CarePlannerV2Input): string {
  const festivalSummary = summarizeFestivalForPrompt(input.festival);
  const breedSummary = summarizeBreedForPrompt(input.breed_warning);

  const blocks: string[] = [
    `📅 NGÀY: ${input.date}`,
    "",
    "🐾 PET:",
    petBlock(input),
    "",
    "📋 LỊCH SỬ + CALENDAR:",
    historyBlock(input),
    "",
    "🌤️ KHÍ HẬU:",
    climateBlock(input),
  ];

  if (breedSummary) {
    blocks.push("", "⚠️ BREED-SPECIFIC (đã có warning, KHÔNG copy nhưng adapt advice cho phù hợp):", breedSummary);
  }
  if (festivalSummary) {
    blocks.push("", "🎉 LỄ HỘI ACTIVE (đã có warning, adapt advice):", festivalSummary);
  }

  blocks.push(
    "",
    `Sinh care plan cho bé ${input.pet.name} hôm nay. Output JSON match schema. Time slots cụ thể HH:MM. Reference data input.`
  );

  return blocks.join("\n");
}

// ============================================================
// Gemini responseSchema (for structured output)
// ============================================================

export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    urgency_level: {
      type: "string",
      enum: ["normal", "monitor", "consult", "urgent", "emergency"],
    },
    eating: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              time: { type: "string" },
              what: { type: "string" },
              reason: { type: "string" },
            },
            required: ["time", "what"],
          },
        },
        water_note: { type: "string" },
      },
      required: ["items", "water_note"],
    },
    exercise: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              time: { type: "string" },
              activity: { type: "string" },
              duration_min: { type: "integer" },
              location_type: { type: "string" },
            },
            required: ["time", "activity", "duration_min"],
          },
        },
        warning: { type: "string" },
      },
      required: ["items"],
    },
    training: {
      type: "object",
      properties: {
        focus_this_week: { type: "string" },
        sessions: { type: "string" },
      },
      // nullable on top-level: AI có thể omit field
    },
    monitoring: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metric: { type: "string" },
          current_value: { type: "string" },
          recommendation: { type: "string" },
        },
        required: ["metric", "current_value", "recommendation"],
      },
    },
    upcoming: {
      type: "array",
      items: {
        type: "object",
        properties: {
          days_until: { type: "integer" },
          event: { type: "string" },
          emoji: { type: "string" },
        },
        required: ["days_until", "event"],
      },
    },
  },
  required: ["summary", "urgency_level", "eating", "exercise", "monitoring", "upcoming"],
};
