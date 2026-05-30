/**
 * OpenWeather client — multi-city support (M5).
 *
 * Free tier endpoints (1000 calls/day):
 *   /data/2.5/weather             — current weather
 *   /data/2.5/air_pollution        — current AQI
 *   /data/2.5/forecast             — 5-day/3-hour forecast (~40 data points)
 *   /data/2.5/air_pollution/forecast — 5-day hourly AQI forecast
 *
 * Cache:
 *   - current weather: 10 min per city
 *   - forecast: 30 min per city
 *
 * Mock support:
 *   WEATHER_MOCK_FEELS_LIKE — override current.feels_like (M4 compat)
 *   WEATHER_MOCK_AQI         — override current.aqi (M5)
 *   WEATHER_MOCK_FORECAST_HOT — "1" → forecast với feels >35°C cho test alert
 */
import type { WeatherSnapshotType } from "@shared/care-plan-types.ts";
import { CITIES, type CitySlug } from "@shared/cities.ts";

const OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY || "";
const CACHE_TTL_CURRENT_MS = 10 * 60 * 1000;
const CACHE_TTL_FORECAST_MS = 30 * 60 * 1000;

const AQI_LABEL_VN: Record<number, string> = {
  1: "Tốt",
  2: "Khá",
  3: "Trung bình",
  4: "Kém",
  5: "Rất kém",
};

interface CachedCurrent {
  data: WeatherSnapshotType;
  expires_at: number;
}
const currentCache = new Map<string, CachedCurrent>();

interface CachedForecast {
  data: ForecastResponse;
  expires_at: number;
}
const forecastCache = new Map<string, CachedForecast>();

interface OpenWeatherCurrent {
  main: { temp: number; feels_like: number; humidity: number };
  weather: Array<{ id: number; main: string; description: string }>;
  name?: string;
}
interface OpenWeatherAir {
  list: Array<{ main: { aqi: number }; dt: number }>;
}
interface OpenWeatherForecastEntry {
  dt: number; // unix timestamp
  main: { temp: number; temp_min: number; temp_max: number; feels_like: number; humidity: number };
  weather: Array<{ id: number; main: string; description: string }>;
  dt_txt: string; // "2026-05-17 12:00:00"
}
interface OpenWeatherForecast {
  list: OpenWeatherForecastEntry[];
  city: { name: string };
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  temp_min: number;
  temp_max: number;
  feels_like_max: number;
  humidity: number;
  aqi: number; // worst AQI in day
  aqi_label_vn: string;
  weather_id: number;
  description_vn: string;
}

export interface ForecastResponse {
  city: string;
  city_slug: CitySlug;
  days: DailyForecast[];
  fetched_at: string;
  mocked?: boolean;
}

// ============================================================
// Internal fetches
// ============================================================

async function fetchOpenWeatherCurrent(lat: number, lon: number): Promise<OpenWeatherCurrent> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}&units=metric&lang=vi`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeather /weather ${res.status}: ${await res.text()}`);
  return res.json() as Promise<OpenWeatherCurrent>;
}

async function fetchAirPollution(lat: number, lon: number): Promise<OpenWeatherAir> {
  const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeather /air_pollution ${res.status}: ${await res.text()}`);
  return res.json() as Promise<OpenWeatherAir>;
}

async function fetchOpenWeatherForecast(lat: number, lon: number): Promise<OpenWeatherForecast> {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}&units=metric&lang=vi`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeather /forecast ${res.status}: ${await res.text()}`);
  return res.json() as Promise<OpenWeatherForecast>;
}

async function fetchAirPollutionForecast(lat: number, lon: number): Promise<OpenWeatherAir> {
  const url = `https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    // AQI forecast có thể không available → return empty list, fallback default 3
    return { list: [] };
  }
  return res.json() as Promise<OpenWeatherAir>;
}

// ============================================================
// CURRENT WEATHER (M4 compat + M5 extension)
// ============================================================

/**
 * Get current weather snapshot cho city. Cache 10 min.
 * Mock via WEATHER_MOCK_FEELS_LIKE + WEATHER_MOCK_AQI.
 *
 * Default city = "ho_chi_minh" (M4 backward compat).
 */
export async function getWeather(citySlug: string = "ho_chi_minh"): Promise<WeatherSnapshotType> {
  const city = CITIES[citySlug as CitySlug];
  if (!city) throw new Error(`City "${citySlug}" không được hỗ trợ.`);

  const mockFeels = process.env.WEATHER_MOCK_FEELS_LIKE;
  const mockAqi = process.env.WEATHER_MOCK_AQI;
  if (mockFeels || mockAqi) {
    const feels = mockFeels ? Number(mockFeels) : 28;
    const aqi = mockAqi ? Number(mockAqi) : 3;
    return {
      temp: feels - 2,
      feels_like: feels,
      humidity: 75,
      aqi: Math.max(1, Math.min(5, aqi)),
      aqi_label_vn: AQI_LABEL_VN[aqi] || "Không rõ",
      city: city.name_vn,
      fetched_at: new Date().toISOString(),
      mocked: true,
    };
  }

  const cached = currentCache.get(citySlug);
  if (cached && cached.expires_at > Date.now()) return cached.data;

  if (!OPENWEATHER_KEY) throw new Error("OPENWEATHER_API_KEY chưa cấu hình");

  const [weather, air] = await Promise.all([
    fetchOpenWeatherCurrent(city.lat, city.lon),
    fetchAirPollution(city.lat, city.lon),
  ]);

  const aqi = air.list[0]?.main?.aqi ?? 3;
  const snapshot: WeatherSnapshotType = {
    temp: Math.round(weather.main.temp * 10) / 10,
    feels_like: Math.round(weather.main.feels_like * 10) / 10,
    humidity: Math.round(weather.main.humidity),
    aqi,
    aqi_label_vn: AQI_LABEL_VN[aqi] || "Không rõ",
    city: city.name_vn,
    fetched_at: new Date().toISOString(),
  };

  currentCache.set(citySlug, { data: snapshot, expires_at: Date.now() + CACHE_TTL_CURRENT_MS });
  return snapshot;
}

// ============================================================
// FORECAST (M5)
// ============================================================

/** Aggregate 5-day/3-hour forecast → daily summary. */
function aggregateForecast(
  list: OpenWeatherForecastEntry[],
  airList: Array<{ main: { aqi: number }; dt: number }>
): DailyForecast[] {
  // Group by date (YYYY-MM-DD)
  const byDate = new Map<string, OpenWeatherForecastEntry[]>();
  for (const entry of list) {
    const date = entry.dt_txt.slice(0, 10);
    const arr = byDate.get(date) || [];
    arr.push(entry);
    byDate.set(date, arr);
  }

  // Aggregate AQI per date (max = worst)
  const aqiByDate = new Map<string, number>();
  for (const a of airList) {
    const date = new Date(a.dt * 1000).toISOString().slice(0, 10);
    const curr = aqiByDate.get(date) || 0;
    aqiByDate.set(date, Math.max(curr, a.main.aqi));
  }

  const days: DailyForecast[] = [];
  const sortedDates = [...byDate.keys()].sort();
  for (const date of sortedDates) {
    const entries = byDate.get(date)!;
    let tempMin = Infinity;
    let tempMax = -Infinity;
    let feelsMax = -Infinity;
    let humSum = 0;
    const weatherIdCounts = new Map<number, number>();
    let dominantWeather: { id: number; desc: string } | null = null;

    for (const e of entries) {
      tempMin = Math.min(tempMin, e.main.temp_min);
      tempMax = Math.max(tempMax, e.main.temp_max);
      feelsMax = Math.max(feelsMax, e.main.feels_like);
      humSum += e.main.humidity;
      const wid = e.weather[0]?.id;
      if (wid) {
        const c = (weatherIdCounts.get(wid) || 0) + 1;
        weatherIdCounts.set(wid, c);
        if (!dominantWeather || c > (weatherIdCounts.get(dominantWeather.id) || 0)) {
          dominantWeather = { id: wid, desc: e.weather[0].description };
        }
      }
    }

    const aqi = aqiByDate.get(date) ?? 3;
    days.push({
      date,
      temp_min: Math.round(tempMin * 10) / 10,
      temp_max: Math.round(tempMax * 10) / 10,
      feels_like_max: Math.round(feelsMax * 10) / 10,
      humidity: Math.round(humSum / entries.length),
      aqi,
      aqi_label_vn: AQI_LABEL_VN[aqi] || "Không rõ",
      weather_id: dominantWeather?.id ?? 800,
      description_vn: dominantWeather?.desc ?? "không rõ",
    });
  }

  return days;
}

/**
 * Get N-day forecast cho city. Cache 30 min.
 * Free tier giới hạn 5 ngày (40 data points). days param chỉ slice.
 */
export async function getForecast(citySlug: string = "ho_chi_minh", maxDays = 7): Promise<ForecastResponse> {
  const city = CITIES[citySlug as CitySlug];
  if (!city) throw new Error(`City "${citySlug}" không được hỗ trợ.`);

  // Mock support — generate fake hot forecast cho test
  const mockHot = process.env.WEATHER_MOCK_FORECAST_HOT === "1";
  if (mockHot) {
    const today = new Date();
    const days: DailyForecast[] = [];
    for (let i = 0; i < Math.min(maxDays, 5); i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push({
        date: d.toISOString().slice(0, 10),
        temp_min: 28,
        temp_max: 37,
        feels_like_max: 40,
        humidity: 75,
        aqi: 4,
        aqi_label_vn: AQI_LABEL_VN[4],
        weather_id: 800,
        description_vn: "nắng nóng gay gắt",
      });
    }
    return {
      city: city.name_vn,
      city_slug: city.slug,
      days,
      fetched_at: new Date().toISOString(),
      mocked: true,
    };
  }

  const cached = forecastCache.get(citySlug);
  if (cached && cached.expires_at > Date.now()) {
    return { ...cached.data, days: cached.data.days.slice(0, maxDays) };
  }

  if (!OPENWEATHER_KEY) throw new Error("OPENWEATHER_API_KEY chưa cấu hình");

  const [forecast, airForecast] = await Promise.all([
    fetchOpenWeatherForecast(city.lat, city.lon),
    fetchAirPollutionForecast(city.lat, city.lon),
  ]);

  const days = aggregateForecast(forecast.list, airForecast.list);
  const response: ForecastResponse = {
    city: city.name_vn,
    city_slug: city.slug,
    days,
    fetched_at: new Date().toISOString(),
  };

  forecastCache.set(citySlug, { data: response, expires_at: Date.now() + CACHE_TTL_FORECAST_MS });
  return { ...response, days: response.days.slice(0, maxDays) };
}
