/**
 * Public Pet Card field whitelist (M12).
 *
 * CRITICAL — SERVER ENFORCED. Bất kỳ field nào KHÔNG nằm trong list này
 * sẽ bị strip trước khi response. Privacy first.
 *
 * KHÔNG include: weight, BCS, allergies, medical conditions, owner_user_id,
 * phone, address, last_checkin_at, triage_history, vaccine_history.
 */

export const PUBLIC_PET_FIELDS = [
  "id", // chỉ dùng internal cho client cache, không leak owner info
  "public_slug",
  "name",
  "species",
  "breed",
  "dob", // tính age, KHÔNG show ngày sinh raw → frontend sanitize lần nữa
  "gender",
  "photo_url",
  "public_bio",
  "public_quote",
  "personality_type", // M13 — nullable nếu chưa làm quiz
  "personality_secondary_type", // M13
  "public_view_count",
] as const;

export type PublicPetField = (typeof PUBLIC_PET_FIELDS)[number];

/**
 * Sanitize raw Baserow pet row → public-safe object.
 * Bất kỳ field nào KHÔNG trong PUBLIC_PET_FIELDS bị strip.
 * Flatten single_select → string value.
 */
export function sanitizePetPublic(rawPet: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of PUBLIC_PET_FIELDS) {
    const value = rawPet[field];
    if (value === undefined || value === null) {
      out[field] = null;
      continue;
    }
    // Flatten single_select object {id, value}
    if (typeof value === "object" && "value" in value && !Array.isArray(value)) {
      out[field] = (value as { value: any }).value;
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && "value" in value[0]) {
      // Multi-select / link_row arrays: flatten to value array
      out[field] = value.map((v: any) => v.value);
    } else {
      out[field] = value;
    }
  }
  // DOB: chỉ trả về year-month để tính age ở client, KHÔNG ngày cụ thể (privacy)
  if (out.dob && typeof out.dob === "string") {
    const m = out.dob.match(/^(\d{4})-(\d{2})/);
    out.dob_yearmonth = m ? `${m[1]}-${m[2]}` : null;
    delete out.dob; // strip raw ngày sinh
  }
  return out;
}

/** Tính age từ dob ISO string. Return { years, months } hoặc null. */
export function calculatePetAge(dobIso: string | null | undefined): { years: number; months: number } | null {
  if (!dobIso) return null;
  const m = dobIso.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const now = new Date();
  let years = now.getFullYear() - year;
  let months = now.getMonth() + 1 - month;
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return null;
  return { years, months };
}

/* ============================================================
 * FOSTER public card (L1) — CHỈ áp khi pet.foster_public === true.
 * Mở rộng public card thường + dữ liệu "chứng minh chăm sóc" (vaccine/cân/
 * nhật-ký/bệnh-án) để người tài trợ thấy bé được nuôi tử tế.
 * KHÔNG đụng PUBLIC_PET_FIELDS / sanitizePetPublic ở trên.
 *
 * STRIP tuyệt đối (kể cả foster): user_id, *_phone, emergency_*, địa chỉ,
 * DOB đầy đủ (chỉ year-month), microchip_id, insurance_* — mọi field KHÔNG
 * nằm trong FOSTER_PUBLIC_FIELDS đều bị loại.
 * ============================================================ */

/** Field scalar trên pet được public cho foster (= public card + bệnh án + nguồn gốc). */
export const FOSTER_PUBLIC_FIELDS = [
  ...PUBLIC_PET_FIELDS,
  "foster_status",
  "adoption_story",
  "neutered",
  "neutered_date",
  "health_conditions",
  "current_medications",
] as const;

export type FosterPublicField = (typeof FOSTER_PUBLIC_FIELDS)[number];

/** Vaccine summary công khai (table vaccines 637) — CHỈ loại + trạng thái + mốc ngày. */
export const FOSTER_VACCINE_FIELDS = ["vaccine_type", "status", "administered_date", "next_due_date"] as const;

/** Weight curve công khai (table weight_logs 647) — số cân + ngày + BCS. */
export const FOSTER_WEIGHTLOG_FIELDS = ["weight_kg", "logged_at", "body_condition_score"] as const;

/**
 * RB-1 — nhật ký hằng ngày công khai (table daily_check_ins 639): CHỈ 4 metric + ngày.
 * CẤM (không bao giờ public ở L1): notes, symptoms, urgency_level, ai_summary, photo_url
 * (chưa có cờ "ảnh công khai từng tấm" → ảnh check-in KHÔNG public).
 */
export const FOSTER_DAILY_FIELDS = ["appetite", "energy", "stool_quality", "water_ml", "check_date"] as const;

/** Flatten 1 giá trị Baserow: single_select {value} → value; link/multi array → array value. */
function flattenBaserowValue(value: any): any {
  if (value === undefined || value === null) return null;
  if (typeof value === "object" && "value" in value && !Array.isArray(value)) {
    return (value as { value: any }).value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && "value" in value[0]) {
    return value.map((v: any) => v.value);
  }
  return value;
}

/**
 * Sanitize raw pet → foster-public-safe object (giống sanitizePetPublic nhưng
 * dùng FOSTER_PUBLIC_FIELDS). DOB → year-month. Field ngoài whitelist bị loại.
 */
export function sanitizePetFoster(rawPet: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of FOSTER_PUBLIC_FIELDS) {
    out[field] = flattenBaserowValue(rawPet[field]);
  }
  if (out.dob && typeof out.dob === "string") {
    const m = out.dob.match(/^(\d{4})-(\d{2})/);
    out.dob_yearmonth = m ? `${m[1]}-${m[2]}` : null;
    delete out.dob; // strip raw ngày sinh
  }
  return out;
}

/** Pick CHỈ các cột whitelist từ 1 child row (vaccine/weight/daily). Field khác bị loại. */
export function pickFosterChild(row: any, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) out[f] = flattenBaserowValue(row?.[f]);
  return out;
}
