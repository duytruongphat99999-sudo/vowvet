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
