/**
 * Care plan engine — orchestrate weather + escalation + Gemini + persistence.
 *
 * Flow:
 *   1. Resolve pet info (species, breed, age, weight)
 *   2. Fetch weather (cached) cho HCM (Phase 0 hardcode)
 *   3. Quyết định model (Flash vs Pro) dựa trên escalation rules
 *   4. Build system + user prompt
 *   5. Call Gemini (Zod-validated output)
 *   6. Save plan_json + metadata vào care_plans (upsert theo plan_date+pet)
 *   7. Trả về plan + metadata
 */
import { listRows, getRow } from "@shared/baserow.ts";
import { isBrachycephalic, brachycephalicMatch } from "@shared/brachycephalic.ts";
import { isSenior, ageInYears } from "@shared/senior.ts";
import {
  symptomsEnToVi,
  stoolEnToVi,
  allergyTypeEnToVi,
  allergySeverityEnToVi,
} from "@shared/enum-mappers.ts";
import { forbiddenForPrompt } from "@shared/forbidden-foods-vn.ts";
import { lifeStageVi, activityLevelVi } from "@shared/nutrition-engine.ts";
import type { BaserowPet } from "./users.ts";
import type { CarePlanContentType, CarePlanMetadataType, WeatherSnapshotType, UrgencyLevelType } from "@shared/care-plan-types.ts";
import { getWeather } from "./weather.ts";
import { generateCarePlan, type GeminiModel } from "./gemini.ts";
import { upsertCarePlan, listRecentCarePlans } from "./care-plans.ts";

const SPECIES_VI: Record<string, string> = { dog: "chó", cat: "mèo", other: "thú cưng" };

export interface CheckInForPrompt {
  appetite: number; // 1-5
  energy: number; // 1-5
  stool_quality: string | null; // EN: normal/soft/liquid/hard/none
  water_ml: number | null;
  symptoms: string[]; // EN: vomit/cough/sneeze/itch/limp/other
  notes: string | null;
  photo_url?: string | null;
}

export interface PetForPrompt {
  id: number;
  name: string;
  species: string; // EN: dog/cat/other
  breed: string | null;
  dob: string | null; // YYYY-MM-DD
  weight_kg: number | null;

  // M3.5 profile fields (optional — null for legacy pets)
  personality_archetype?: string[] | null;
  energy_level?: number | null;
  noise_sensitivity?: number | null;
  trainability?: number | null;
  separation_anxiety?: number | null;
  fears?: string[] | null;

  diet_type?: string[] | null;
  diet_brand_primary?: string | null;

  special_notes_for_vet?: string | null;

  // M7 nutrition fields (optional — null for pets chưa migrate hoặc thiếu data)
  daily_calorie_target?: number | null;
  life_stage?: string | null; // EN: puppy/junior/adult/senior/geriatric
  activity_level?: string | null; // EN: sedentary/low/moderate/active/very_active
  body_condition_score?: number | null; // 1-9
  target_weight_kg?: number | null;
}

/** Xác định model + lý do escalation (cho metadata + logging). */
export async function decideModel(
  pet: PetForPrompt,
  checkIn: CheckInForPrompt,
  weather: WeatherSnapshotType
): Promise<{ model: GeminiModel; reason: string | null }> {
  const reasons: string[] = [];

  // Rule 1: Brachycephalic + feels_like > 32°C
  if (isBrachycephalic(pet.breed) && weather.feels_like > 32) {
    const match = brachycephalicMatch(pet.breed);
    reasons.push(`brachycephalic (${match}) + nóng ${weather.feels_like}°C`);
  }

  // Rule 2: Senior + có symptoms
  if (isSenior(pet.species, pet.dob) && checkIn.symptoms.length > 0) {
    const yrs = ageInYears(pet.dob);
    reasons.push(`senior (${yrs} tuổi) + ${checkIn.symptoms.length} symptoms`);
  }

  // Rule 3: ≥3 symptoms
  if (checkIn.symptoms.length >= 3) {
    reasons.push(`${checkIn.symptoms.length} symptoms (≥3)`);
  }

  // Rule 4: 3 ngày liên tiếp có concerns (urgency != normal)
  const recent = await listRecentCarePlans(pet.id, 3);
  if (recent.length >= 3) {
    const allConcerning = recent.every((p) => {
      const u = (typeof p.urgency_level === "object" ? (p.urgency_level as any)?.value : p.urgency_level) as string;
      return u && u !== "normal";
    });
    if (allConcerning) reasons.push("3 ngày liên tiếp có concerns");
  }

  if (reasons.length > 0) {
    return { model: "gemini-2.5-pro", reason: reasons.join("; ") };
  }
  return { model: "gemini-2.5-flash", reason: null };
}

/** System prompt cho Gemini — định nghĩa role + ngôn ngữ + safety. */
function buildSystemPrompt(): string {
  return `Bạn là trợ lý thú y AI cho VowVet (nền tảng chăm sóc thú cưng Việt Nam).
Nhiệm vụ: phân tích check-in hằng ngày của thú cưng + thời tiết, đưa ra:
- Đánh giá mức độ khẩn cấp (urgency_level)
- Tóm tắt tình trạng (summary, 1-2 câu)
- Concerns: dấu hiệu đáng lo (0-5 mục)
- 4 recommendations cụ thể (icon emoji, title ngắn, advice 1-2 câu)
- Alerts: cảnh báo môi trường khẩn (0-2 mục, vd sốc nhiệt với brachycephalic)

URGENCY GUIDE:
- normal: bé khoẻ, không có dấu hiệu bất thường
- monitor: có dấu hiệu nhẹ, cần theo dõi 24h
- consult: có concerns rõ, khuyên hỏi bác sĩ thú y qua chat/điện thoại
- urgent: cần đi khám trong 24-48h (vd sốt, bỏ ăn 2 ngày, tiêu chảy có máu)
- emergency: cần cấp cứu ngay (sốc, ngạt, co giật, đa triệu chứng nặng)

QUY TẮC:
- Trả lời 100% TIẾNG VIỆT (UI, summary, concerns, advice).
- KHÔNG chẩn đoán bệnh cụ thể. Chỉ gợi ý theo dõi + khám bác sĩ.
- Brachycephalic (mặt ngắn: Pug, Bulldog, Ba Tư...) + nóng > 32°C → CẢNH BÁO sốc nhiệt mạnh.
- Senior pet → khuyến khích khám định kỳ + giảm vận động cường độ cao.
- icon trong recommendations dùng 1 emoji.
- Output BẮT BUỘC đúng JSON schema (system tự enforce).`;
}

/** Lấy food allergies từ allergies_diet table (type=allergy hoặc forbidden). */
async function getFoodAllergies(petId: number): Promise<Array<{ item: string; type: string; severity?: string }>> {
  try {
    const res = await listRows<any>("allergies_diet", {
      filter: { pet_id__link_row_has: String(petId) },
      size: 50,
    });
    return res.results
      .filter((r) => {
        const t = typeof r.type === "object" ? r.type?.value : r.type;
        return t === "allergy" || t === "forbidden";
      })
      .map((r) => ({
        item: r.item,
        type: typeof r.type === "object" ? r.type?.value : r.type,
        severity: typeof r.severity === "object" ? r.severity?.value : r.severity,
      }));
  } catch {
    return [];
  }
}

const ARCHETYPE_VI: Record<string, string> = {
  explorer: "năng động khám phá",
  friendly: "thân thiện",
  shy: "nhút nhát",
  lazy: "lười biếng",
  smart: "lanh lợi",
  stubborn: "bướng bỉnh",
  cuddler: "tình cảm cuddler",
  athlete: "vận động viên",
};
const FEARS_VI: Record<string, string> = {
  fireworks: "pháo",
  thunder: "sấm sét",
  vacuum: "máy hút bụi",
  bath: "tắm",
  vet: "bác sĩ thú y",
  car_rides: "đi xe",
  alone: "ở một mình",
  strangers: "người lạ",
  children: "trẻ con",
  other: "khác",
};
const DIET_VI: Record<string, string> = {
  dry: "Hạt khô", wet: "Pate", raw: "Tươi sống", homemade: "Tự nấu", mixed: "Mix",
};

/** User prompt: pet context + check-in data + weather + profile (nếu có). */
async function buildUserPrompt(
  pet: PetForPrompt,
  checkIn: CheckInForPrompt,
  weather: WeatherSnapshotType
): Promise<string> {
  const speciesVi = SPECIES_VI[pet.species] || "thú cưng";
  const age = ageInYears(pet.dob);
  const ageStr = age !== null ? `${age} tuổi` : "không rõ tuổi";
  const isBrachy = isBrachycephalic(pet.breed);
  const isOld = isSenior(pet.species, pet.dob);
  const symptomsVi = symptomsEnToVi(checkIn.symptoms);
  const stoolVi = checkIn.stool_quality ? stoolEnToVi(checkIn.stool_quality) : "Không nhập";

  // M3.5: thêm 3 sections optional nếu profile có data
  let profileBlock = "";

  // Section 1: Tính cách (chỉ include nếu có archetype HOẶC ratings)
  const archetypes = pet.personality_archetype || [];
  const hasPersonality = archetypes.length > 0 || pet.energy_level || pet.fears?.length;
  if (hasPersonality) {
    profileBlock += `\n[TÍNH CÁCH BÉ ${pet.name}]`;
    if (archetypes.length > 0) {
      profileBlock += `\n- Archetype: ${archetypes.map((a) => ARCHETYPE_VI[a] || a).join(", ")}`;
    }
    if (pet.energy_level) profileBlock += `\n- Năng lượng: ${pet.energy_level}/5`;
    if (pet.trainability) profileBlock += `\n- Trainability: ${pet.trainability}/5`;
    if (pet.separation_anxiety && pet.separation_anxiety >= 3) {
      profileBlock += `\n- Separation anxiety: ${pet.separation_anxiety}/5 (LƯU Ý nếu chủ vắng)`;
    }
    if (pet.fears && pet.fears.length > 0) {
      profileBlock += `\n- Sợ: ${pet.fears.map((f) => FEARS_VI[f] || f).join(", ")}`;
    }
  }

  // Section 2: Dinh dưỡng (diet_type + brand + food_allergies + M7 calorie target/life_stage)
  const dietTypes = pet.diet_type || [];
  const foodAllergies = await getFoodAllergies(pet.id);
  const hasDiet =
    dietTypes.length > 0 ||
    pet.diet_brand_primary ||
    foodAllergies.length > 0 ||
    pet.daily_calorie_target ||
    pet.life_stage ||
    pet.activity_level ||
    pet.body_condition_score;
  if (hasDiet) {
    profileBlock += `\n\n[DINH DƯỠNG]`;
    if (dietTypes.length > 0) {
      profileBlock += `\n- Loại thức ăn: ${dietTypes.map((t) => DIET_VI[t] || t).join(", ")}`;
    }
    if (pet.diet_brand_primary) profileBlock += `\n- Brand: ${pet.diet_brand_primary}`;
    // M7 nutrition profile context (cho AI biết DER target + life_stage để adapt suggestion)
    if (pet.daily_calorie_target) {
      profileBlock += `\n- Mục tiêu calo hằng ngày: ${pet.daily_calorie_target} kcal (đã tính RER + activity + life stage)`;
    }
    if (pet.life_stage) {
      profileBlock += `\n- Giai đoạn cuộc đời: ${lifeStageVi(pet.life_stage)}`;
    }
    if (pet.activity_level) {
      profileBlock += `\n- Mức vận động: ${activityLevelVi(pet.activity_level)}`;
    }
    if (pet.body_condition_score != null) {
      const bcsNote =
        pet.body_condition_score >= 7
          ? " — THỪA CÂN, cần giảm khẩu phần"
          : pet.body_condition_score <= 3
          ? " — THIẾU CÂN, cần tăng calo + khám vet"
          : "";
      profileBlock += `\n- BCS: ${pet.body_condition_score}/9${bcsNote}`;
    }
    if (pet.target_weight_kg) {
      profileBlock += `\n- Cân nặng mục tiêu: ${pet.target_weight_kg} kg`;
    }
    if (foodAllergies.length > 0) {
      const list = foodAllergies
        .map((a) => `${a.item} (${allergyTypeEnToVi(a.type)}${a.severity ? `, ${allergySeverityEnToVi(a.severity)}` : ""})`)
        .join(", ");
      profileBlock += `\n- ⚠️ DỊ ỨNG/CẤM (TUYỆT ĐỐI KHÔNG SUGGEST): ${list}`;
    }

    // M7: forbidden foods baseline (critical level, species-specific) cho AI awareness
    const speciesEN = pet.species === "dog" || pet.species === "cat" ? pet.species : undefined;
    const forbidden = forbiddenForPrompt(speciesEN);
    if (forbidden) {
      profileBlock += `\n- ⛔ THỰC PHẨM CẤM (KHÔNG GỢI Ý, KHÔNG BAO GIỜ): ${forbidden}`;
    }
  }

  // Section 3: Lưu ý đặc biệt từ chủ
  if (pet.special_notes_for_vet && pet.special_notes_for_vet.trim()) {
    profileBlock += `\n\n[LƯU Ý ĐẶC BIỆT TỪ CHỦ]\n${pet.special_notes_for_vet.trim()}`;
  }

  return `THÔNG TIN THÚ CƯNG:
- Tên: ${pet.name}
- Loài: ${speciesVi}
- Giống: ${pet.breed || "chưa nhập"}${isBrachy ? " (BRACHYCEPHALIC — mặt ngắn, nhạy cảm nóng)" : ""}
- Tuổi: ${ageStr}${isOld ? " (SENIOR)" : ""}
- Cân nặng: ${pet.weight_kg ? `${pet.weight_kg} kg` : "chưa nhập"}
${profileBlock}

CHECK-IN HÔM NAY:
- Thèm ăn (1-5): ${checkIn.appetite}/5
- Năng lượng (1-5): ${checkIn.energy}/5
- Tiêu hoá: ${stoolVi}
- Nước uống: ${checkIn.water_ml ? `${checkIn.water_ml} ml` : "không nhập"}
- Triệu chứng: ${symptomsVi.length > 0 ? symptomsVi.join(", ") : "không có"}
- Ghi chú chủ: ${checkIn.notes || "(trống)"}

THỜI TIẾT HÔM NAY (${weather.city}):
- Nhiệt độ: ${weather.temp}°C (cảm giác ${weather.feels_like}°C)
- Độ ẩm: ${weather.humidity}%
- Chất lượng không khí: AQI ${weather.aqi}/5 — ${weather.aqi_label_vn}

Sinh care plan cho bé ${pet.name} hôm nay (JSON theo schema).
${profileBlock ? "LƯU Ý: dùng profile data ở trên để adapt recommendations (vd: bé sợ pháo + Tết → chỗ trốn an toàn; dị ứng gà → KHÔNG suggest gà; separation_anxiety cao → khuyến cáo nếu chủ vắng)." : ""}`;
}

/**
 * Sinh + lưu care plan cho pet hôm nay.
 * Upsert: nếu đã có row cho (pet_id, plan_date=today) → update, không thì insert.
 */
export async function generateAndSaveCarePlan(
  pet: PetForPrompt,
  checkIn: CheckInForPrompt,
  userId: number,
  citySlug = "hcm"
): Promise<{ plan: CarePlanContentType; metadata: CarePlanMetadataType; rowId: number }> {
  const weather = await getWeather(citySlug);
  const { model, reason } = await decideModel(pet, checkIn, weather);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = await buildUserPrompt(pet, checkIn, weather);

  const { plan, metadata: gemMeta } = await generateCarePlan(systemPrompt, userPrompt, model, {
    pet_id: pet.id,
    user_id: userId,
  });

  const metadata: CarePlanMetadataType = {
    cost_usd: gemMeta.cost_usd,
    model: gemMeta.model,
    input_tokens: gemMeta.input_tokens,
    output_tokens: gemMeta.output_tokens,
    weather,
    generated_at: new Date().toISOString(),
    escalation_reason: reason,
  };

  const rowId = await upsertCarePlan(pet.id, plan, metadata);
  return { plan, metadata, rowId };
}
