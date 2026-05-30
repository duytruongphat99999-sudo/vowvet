/**
 * PetAir Index (M4.1 v2) — composite weather-air score 0-100 cho pet outdoor safety.
 *
 * 100 = perfect (T 20-28°C, AQI<50, humidity 40-60%, UV<6)
 * 0   = nguy hiểm tuyệt đối (heatstroke + AQI hazardous)
 *
 * Thresholds simplified — tránh over-engineering Phase 0.
 */
import type { WeatherSnapshotType } from "@shared/care-plan-types.ts";

export interface PetAirResult {
  score: number; // 0-100
  level: "excellent" | "good" | "fair" | "poor" | "dangerous";
  level_label_vi: string;
  safe_hours_today: string; // VD: "5h30-7h, 19h-21h"
  factors: { temp_penalty: number; aqi_penalty: number; humidity_penalty: number };
}

export function computePetAirIndex(weather: Partial<WeatherSnapshotType>): PetAirResult {
  let score = 100;

  // Temperature penalty (feels_like)
  const feels = weather.feels_like ?? 28;
  let tempPenalty = 0;
  if (feels > 32) {
    tempPenalty = Math.min(50, (feels - 32) * 5);
  } else if (feels < 10) {
    tempPenalty = Math.min(30, (10 - feels) * 3);
  }
  score -= tempPenalty;

  // AQI penalty (Baserow lưu AQI 1-5 scale OpenWeather, hoặc absolute 0-300+)
  const aqi = weather.aqi ?? 2;
  let aqiPenalty = 0;
  if (aqi <= 5 && aqi >= 1) {
    // OpenWeather 1-5 scale
    if (aqi === 3) aqiPenalty = 5;
    else if (aqi === 4) aqiPenalty = 15;
    else if (aqi === 5) aqiPenalty = 30;
  } else if (aqi > 50) {
    // US AQI absolute
    if (aqi > 100) aqiPenalty = Math.min(30, (aqi - 100) / 3);
  }
  score -= aqiPenalty;

  // Humidity penalty
  const humidity = weather.humidity ?? 70;
  let humidityPenalty = 0;
  if (humidity > 85) humidityPenalty = 10;
  else if (humidity > 75) humidityPenalty = 5;
  score -= humidityPenalty;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let level: PetAirResult["level"];
  let label: string;
  if (score >= 80) {
    level = "excellent";
    label = "Tuyệt vời — thoải mái ra ngoài";
  } else if (score >= 60) {
    level = "good";
    label = "Tốt — ra ngoài bình thường";
  } else if (score >= 40) {
    level = "fair";
    label = "Trung bình — hạn chế khung nóng";
  } else if (score >= 20) {
    level = "poor";
    label = "Kém — chỉ ra ngoài khi cần";
  } else {
    level = "dangerous";
    label = "NGUY HIỂM — KHÔNG ra ngoài";
  }

  return {
    score,
    level,
    level_label_vi: label,
    safe_hours_today: getSafeHoursToday(weather),
    factors: {
      temp_penalty: Math.round(tempPenalty),
      aqi_penalty: Math.round(aqiPenalty),
      humidity_penalty: Math.round(humidityPenalty),
    },
  };
}

/**
 * Phỏng đoán khung giờ an toàn dựa trên temp.
 * HCM/HN/Đà Nẵng nóng: 5h30-7h sáng + 19h-21h tối là chuẩn.
 * Đà Lạt mát: cả ngày OK (chỉ tránh 12-14h nắng gắt).
 */
export function getSafeHoursToday(weather: Partial<WeatherSnapshotType>): string {
  const feels = weather.feels_like ?? 28;
  const city = (weather.city || "").toLowerCase();

  // Đà Lạt mát quanh năm
  if (city.includes("đà lạt") || city.includes("lat") || city.includes("dalat")) {
    if (feels < 25) return "Cả ngày OK (mát mẻ)";
    return "6h-11h, 15h-20h";
  }

  // Nóng (HCM/HN/Đà Nẵng hè)
  if (feels >= 33) {
    return "5h30-7h sáng, 19h-21h tối (TRÁNH 10h-17h)";
  }
  if (feels >= 30) {
    return "5h30-8h sáng, 18h-21h tối";
  }
  if (feels >= 26) {
    return "6h-10h sáng, 16h-20h tối";
  }
  // Mát
  return "Cả ngày OK (6h-21h)";
}
