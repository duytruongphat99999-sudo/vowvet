/**
 * Clinic info reader (M9.3).
 *
 * Đọc env vars → return clinic object. Public-safe (KHÔNG sensitive).
 * Cả web SSR + api endpoint dùng chung.
 *
 * Defaults pull from shared/contact-info.ts (single source of truth).
 */
import { VOWVET_CONTACT, getZaloLink } from "./contact-info.ts";

export interface ClinicVet {
  name: string;
  title: string;
  photo_url: string | null;
  bio: string;
  credentials: string[]; // chips: e.g. ["WSAVA Certified", "5+ năm kinh nghiệm", "Thú cưng nhỏ"]
}

export interface ClinicInfo {
  name: string;
  phone: string;
  phone_tel_link: string; // dạng tel:+84... (đã chuẩn hoá cho href)
  address: string;
  hours_weekday: string;
  hours_weekend: string;
  hours_start: number;    // numeric hour (24h) — for isOpenNow logic
  hours_end: number;
  emergency_24_7: boolean;
  google_maps_url: string | null;
  zalo_url: string;
  note: string;
  vet: ClinicVet;         // primary on-duty vet shown in /chat hero (brand-safe identity)
}

function normalizePhoneForTel(raw: string): string {
  // tel: scheme — bỏ space, giữ + nếu có
  return raw.replace(/\s+/g, "");
}

/** Parse "08:00 - 22:00" → { start: 8, end: 22 }. Fallback 8/22 on parse error. */
function parseHoursRange(s: string): { start: number; end: number } {
  const m = s.match(/(\d{1,2})(?::\d{2})?\s*-\s*(\d{1,2})(?::\d{2})?/);
  if (!m) return { start: 8, end: 22 };
  return { start: Math.max(0, Math.min(24, Number(m[1]))), end: Math.max(0, Math.min(24, Number(m[2]))) };
}

export function getClinicInfo(): ClinicInfo {
  const phone = process.env.CLINIC_PHONE || VOWVET_CONTACT.hotline.e164;
  const hours_weekday = process.env.CLINIC_HOURS_WEEKDAY || "08:00 - 22:00";
  const hours_weekend = process.env.CLINIC_HOURS_WEEKEND || "08:00 - 22:00";
  const { start, end } = parseHoursRange(hours_weekday);
  return {
    name: process.env.CLINIC_NAME || "Mon Min Pet Clinic - HCMC",
    phone,
    phone_tel_link: normalizePhoneForTel(phone),
    address: process.env.CLINIC_ADDRESS || "TP.HCM (địa chỉ sẽ cập nhật)",
    hours_weekday,
    hours_weekend,
    hours_start: start,
    hours_end: end,
    emergency_24_7: process.env.CLINIC_24_7 === "true",
    google_maps_url: process.env.CLINIC_MAPS_URL || null,
    zalo_url: process.env.CLINIC_ZALO_URL || getZaloLink(),
    note: process.env.CLINIC_NOTE || "Ngoài giờ: gọi để được hỗ trợ qua điện thoại",
    vet: {
      // Brand-safe identity per task #57 (renamed from real person to brand handle)
      name: process.env.CLINIC_VET_NAME || "BSTY Mon Min Pet",
      title: process.env.CLINIC_VET_TITLE || "Bác sĩ thú y · Mon Min Pet Clinic",
      photo_url: process.env.CLINIC_VET_PHOTO || null,
      bio: process.env.CLINIC_VET_BIO || "Chuyên thú cưng nhỏ · tư vấn dinh dưỡng + vaccine + bệnh thường gặp",
      credentials:
        (process.env.CLINIC_VET_CREDENTIALS || "WSAVA Certified|5+ năm kinh nghiệm|Thú cưng nhỏ")
          .split("|").map((s) => s.trim()).filter(Boolean),
    },
  };
}

/** True if current local time is inside today's clinic hours. */
export function isClinicOpenNow(now: Date = new Date()): boolean {
  const c = getClinicInfo();
  if (c.emergency_24_7) return true;
  const hour = now.getHours();
  return hour >= c.hours_start && hour < c.hours_end;
}

/** Human-readable "khi nào mở lại" string in Vietnamese. */
export function getNextOpenTime(now: Date = new Date()): string {
  const c = getClinicInfo();
  if (c.emergency_24_7) return "24/7";
  const hour = now.getHours();
  const startLabel = `${String(c.hours_start).padStart(2, "0")}:00`;
  if (hour < c.hours_start) return `${startLabel} hôm nay`;
  return `${startLabel} ngày mai`;
}

/** Estimated response-time copy (in/out hours). */
export function getResponseTimeLabel(now: Date = new Date()): string {
  return isClinicOpenNow(now) ? "~ 15 phút" : "~ 8 giờ";
}
