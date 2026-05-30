/**
 * Alert evaluation engine cho Climate Sentinel (M5).
 *
 * Input: pet (với profile flags) + forecast day + sensitivity result.
 * Output: array of triggered alerts (có thể 0).
 *
 * Rules per spec:
 *   HEAT_WARNING:
 *     - feels > 32 + brachy             → urgent
 *     - feels > 35 + score > 60         → urgent
 *     - feels > 38                       → critical (all pets)
 *     - feels > 30 + senior              → warning
 *
 *   AQI_WARNING:
 *     - aqi >= 4 + brachy                → urgent
 *     - aqi >= 4                          → warning
 *     - aqi >= 5                          → critical
 *
 *   STORM_WARNING:
 *     - weather_id 200-232 (thunderstorm) + fears.thunder → urgent
 *     - weather_id 502+ (heavy rain) + fears.thunder      → warning
 *
 *   COLD_WARNING:
 *     - temp < 15 + short coat            → info
 *     - temp < 10 + senior                → warning
 *     - temp < 5                          → urgent
 *
 *   SUN_WARNING (UV) — deferred Phase 0 (free tier không có UV index).
 */
import type { AlertType, Severity } from "./zod-schemas/m5.ts";
import { isBrachycephalic } from "./brachycephalic.ts";
import { isSenior } from "./senior.ts";
import { isLongCoat } from "./coat.ts";
import { CITIES, type CitySlug } from "./cities.ts";
import type { SensitivityResult } from "./climate-sensitivity.ts";

export interface ForecastDayInput {
  date: string; // YYYY-MM-DD
  temp_min: number;
  temp_max: number;
  feels_like_max: number;
  humidity: number;
  aqi: number; // 1-5
  weather_id: number;
  description_vn: string;
}

export interface PetForAlertInput {
  id: number;
  name: string;
  species?: string | null;
  breed?: string | null;
  dob?: string | null;
  fears?: string[] | null;
}

export interface EvaluatedAlert {
  alert_type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  weather_snapshot: ForecastDayInput;
  pet_factors: {
    is_brachy: boolean;
    is_senior: boolean;
    is_long_coat: boolean;
    fears_thunder: boolean;
    sensitivity_score: number;
    sensitivity_level: string;
  };
}

function ratingHelper(p: PetForAlertInput) {
  return {
    isBrachy: isBrachycephalic(p.breed),
    isOld: isSenior(p.species, p.dob),
    isLong: isLongCoat(p.breed),
    fearsThunder: (p.fears || []).includes("thunder"),
    fearsFireworks: (p.fears || []).includes("fireworks"),
  };
}

function petFactors(p: PetForAlertInput, sens: SensitivityResult) {
  const h = ratingHelper(p);
  return {
    is_brachy: h.isBrachy,
    is_senior: h.isOld,
    is_long_coat: h.isLong,
    fears_thunder: h.fearsThunder,
    sensitivity_score: sens.score,
    sensitivity_level: sens.level,
  };
}

// ============================================================
// HEAT WARNING
// ============================================================
function evaluateHeat(
  pet: PetForAlertInput,
  day: ForecastDayInput,
  sens: SensitivityResult,
  city: CitySlug
): EvaluatedAlert | null {
  const h = ratingHelper(pet);
  const feels = day.feels_like_max;
  const cityName = CITIES[city].name_vn;

  let severity: Severity | null = null;
  let reason = "";

  if (feels > 38) {
    severity = "critical";
    reason = `Cảm giác ${feels}°C — NGUY HIỂM CHO MỌI THÚ CƯNG`;
  } else if (h.isBrachy && feels > 32) {
    severity = "urgent";
    reason = `Cảm giác ${feels}°C — bé ${pet.name} giống mặt ngắn rất nhạy cảm với nóng`;
  } else if (sens.score > 60 && feels > 35) {
    severity = "urgent";
    reason = `Cảm giác ${feels}°C — bé ${pet.name} thuộc nhóm rủi ro cao (${sens.level})`;
  } else if (h.isOld && feels > 30) {
    severity = "warning";
    reason = `Cảm giác ${feels}°C — bé ${pet.name} cao tuổi cần lưu ý hydration`;
  } else {
    return null;
  }

  return {
    alert_type: "heat_warning",
    severity,
    title: `🔥 ${pet.name} - Cảnh báo nóng (${cityName})`,
    message: `${reason}. Ngày ${day.date}: ${day.temp_min}-${day.temp_max}°C, cảm giác lên đến ${feels}°C. Khuyến nghị: giữ bé trong nhà mát, đủ nước, tránh nắng 11h-15h.`,
    weather_snapshot: day,
    pet_factors: petFactors(pet, sens),
  };
}

// ============================================================
// AQI WARNING
// ============================================================
function evaluateAqi(
  pet: PetForAlertInput,
  day: ForecastDayInput,
  sens: SensitivityResult,
  city: CitySlug
): EvaluatedAlert | null {
  const h = ratingHelper(pet);
  const aqi = day.aqi;
  const cityName = CITIES[city].name_vn;

  let severity: Severity | null = null;
  let reason = "";

  if (aqi >= 5) {
    severity = "critical";
    reason = `AQI 5/5 (Rất kém) — không khí nguy hiểm cho cả người và pet`;
  } else if (h.isBrachy && aqi >= 4) {
    severity = "urgent";
    reason = `AQI ${aqi}/5 — bé ${pet.name} giống mặt ngắn dễ khó thở khi không khí kém`;
  } else if (aqi >= 4) {
    severity = "warning";
    reason = `AQI ${aqi}/5 — chất lượng không khí kém`;
  } else {
    return null;
  }

  return {
    alert_type: "aqi_warning",
    severity,
    title: `🌫️ ${pet.name} - Cảnh báo không khí (${cityName})`,
    message: `${reason}. Ngày ${day.date}. Khuyến nghị: hạn chế đưa bé ra ngoài, đóng cửa sổ, dùng máy lọc không khí nếu có.`,
    weather_snapshot: day,
    pet_factors: petFactors(pet, sens),
  };
}

// ============================================================
// STORM WARNING
// ============================================================
function evaluateStorm(
  pet: PetForAlertInput,
  day: ForecastDayInput,
  sens: SensitivityResult,
  city: CitySlug
): EvaluatedAlert | null {
  const h = ratingHelper(pet);
  const wid = day.weather_id;
  const cityName = CITIES[city].name_vn;
  const isThunderstorm = wid >= 200 && wid <= 232;
  const isHeavyRain = wid >= 502 && wid <= 531;

  if (!isThunderstorm && !isHeavyRain) return null;
  if (!h.fearsThunder && !h.fearsFireworks) return null; // Only alert nếu pet sợ

  let severity: Severity;
  let reason = "";

  if (isThunderstorm && h.fearsThunder) {
    severity = "urgent";
    reason = `Dự báo có sấm sét, bé ${pet.name} sợ sấm`;
  } else if (isHeavyRain && h.fearsThunder) {
    severity = "warning";
    reason = `Dự báo mưa to, có thể có sấm, bé ${pet.name} nhạy cảm`;
  } else {
    severity = "info";
    reason = `Dự báo thời tiết xấu, bé ${pet.name} có lịch sử sợ ${h.fearsThunder ? "sấm" : "pháo"}`;
  }

  return {
    alert_type: "storm_warning",
    severity,
    title: `⛈️ ${pet.name} - Cảnh báo bão (${cityName})`,
    message: `${reason}. Ngày ${day.date}: ${day.description_vn}. Khuyến nghị: chuẩn bị chỗ trốn an toàn (góc tối, tiếng nhạc nhẹ), KHÔNG để bé một mình.`,
    weather_snapshot: day,
    pet_factors: petFactors(pet, sens),
  };
}

// ============================================================
// COLD WARNING
// ============================================================
function evaluateCold(
  pet: PetForAlertInput,
  day: ForecastDayInput,
  sens: SensitivityResult,
  city: CitySlug
): EvaluatedAlert | null {
  const h = ratingHelper(pet);
  const temp = day.temp_min;
  const cityName = CITIES[city].name_vn;
  const isShortCoat = !h.isLong; // không phải long coat → short coat

  let severity: Severity | null = null;
  let reason = "";

  if (temp < 5) {
    severity = "urgent";
    reason = `Nhiệt độ ${temp}°C — quá lạnh cho thú cưng`;
  } else if (temp < 10 && h.isOld) {
    severity = "warning";
    reason = `Nhiệt độ ${temp}°C — bé ${pet.name} cao tuổi dễ nhiễm lạnh`;
  } else if (temp < 15 && isShortCoat) {
    severity = "info";
    reason = `Nhiệt độ ${temp}°C — bé ${pet.name} lông ngắn cần giữ ấm`;
  } else {
    return null;
  }

  return {
    alert_type: "cold_warning",
    severity,
    title: `❄️ ${pet.name} - Cảnh báo lạnh (${cityName})`,
    message: `${reason}. Ngày ${day.date}: ${day.temp_min}-${day.temp_max}°C. Khuyến nghị: chuẩn bị chăn ấm, hạn chế ra ngoài sáng sớm/tối muộn.`,
    weather_snapshot: day,
    pet_factors: petFactors(pet, sens),
  };
}

// ============================================================
// MAIN EVALUATOR
// ============================================================

/**
 * Evaluate ALL rules cho 1 pet + 1 forecast day.
 * Trả về 0..4 alerts (có thể trigger nhiều type cùng lúc).
 */
export function evaluateAlertsForDay(
  pet: PetForAlertInput,
  day: ForecastDayInput,
  sensitivity: SensitivityResult,
  city: CitySlug
): EvaluatedAlert[] {
  const alerts: EvaluatedAlert[] = [];
  const heat = evaluateHeat(pet, day, sensitivity, city);
  if (heat) alerts.push(heat);
  const aqi = evaluateAqi(pet, day, sensitivity, city);
  if (aqi) alerts.push(aqi);
  const storm = evaluateStorm(pet, day, sensitivity, city);
  if (storm) alerts.push(storm);
  const cold = evaluateCold(pet, day, sensitivity, city);
  if (cold) alerts.push(cold);
  return alerts;
}

/**
 * Evaluate cho TODAY only (day 0 trong forecast).
 * Dùng cho daily scheduler.
 */
export function evaluateTodayAlerts(
  pet: PetForAlertInput,
  forecastDays: ForecastDayInput[],
  sensitivity: SensitivityResult,
  city: CitySlug
): EvaluatedAlert[] {
  if (forecastDays.length === 0) return [];
  return evaluateAlertsForDay(pet, forecastDays[0], sensitivity, city);
}
