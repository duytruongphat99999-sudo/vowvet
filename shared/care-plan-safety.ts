/**
 * Care Plan Safety Layer — shared between API (validation) + web (disclaimer copy).
 *
 * Hardcoded blacklist + disclaimer. **KHÔNG sửa nếu chưa có vet review.**
 *
 * Why shared:
 *   - API uses TOXIC_FOODS_* + validateCarePlanSafety() to gate AI output before
 *     returning to client.
 *   - Web imports CARE_PLAN_DISCLAIMER for the banner; vet name + hotline come
 *     from `shared/clinic-info.ts` at runtime (NOT hardcoded here — task #57 brand-safe identity).
 */

// ─── Toxic foods (NEVER recommend; only acceptable in "TRÁNH"/"KHÔNG cho ăn" warning context) ──
export const TOXIC_FOODS_DOG: readonly string[] = [
  "onion", "hành", "hành tây", "hành lá",
  "garlic", "tỏi",
  "chocolate", "socola", "cacao", "cocoa",
  "grape", "nho", "raisin", "nho khô",
  "xylitol", "kẹo cao su", "kẹo không đường",
  "macadamia", "hạt macadamia",
  "avocado pit", "hạt bơ",
  "cooked bone", "xương nấu chín",
  "alcohol", "rượu", "bia",
  "caffeine", "cà phê", "trà đặc",
  "raw yeast dough", "bột nhồi men sống",
] as const;

export const TOXIC_FOODS_CAT: readonly string[] = [
  ...TOXIC_FOODS_DOG,
  "lily", "hoa loa kèn", "hoa huệ",
  "tuna only", "chỉ cho ăn cá ngừ",   // gây thiamine deficiency
  "dog food", "thức ăn chó",            // thiếu taurine
  "milk", "sữa bò",                     // lactose intolerance
] as const;

// ─── Dangerous activity strings (block if AI generates) ────────────────────
export const DANGEROUS_ACTIVITY_PHRASES: readonly string[] = [
  "walk in midday heat above 32",
  "exercise after meal within 30",
  "force feed water",
  "give human medication",
  "cho uống thuốc người",
  "tắm nước lạnh đột ngột",
  "ép uống nước",
] as const;

// ─── Breed high-risk conditions ────────────────────────────────────────────
// Used both by AI prompt (PHẢI mention) + by validateCarePlanSafety (no enforce yet)
export const BREED_HIGH_RISK: Record<string, readonly string[]> = {
  // Cats
  "British Shorthair": ["HCM (Hypertrophic Cardiomyopathy)", "PKD (Polycystic Kidney Disease)"],
  "Persian":           ["PKD", "BAOS (Brachycephalic Airway Obstructive Syndrome)"],
  "Maine Coon":        ["HCM", "Hip Dysplasia", "SMA (Spinal Muscular Atrophy)"],
  "Scottish Fold":     ["Osteochondrodysplasia (đột biến gen)", "HCM"],
  "Sphynx":            ["HCM", "Skin issues"],
  "Ragdoll":           ["HCM", "PKD"],
  // Dogs (brachycephalic — high heat-stroke risk)
  "Bulldog":           ["BAOS", "Hip Dysplasia", "Heat stroke risk"],
  "French Bulldog":    ["BAOS", "IVDD", "Heat stroke risk"],
  "Pug":               ["BAOS", "Heat stroke risk", "Eye proptosis"],
  "Boxer":             ["Heart disease (Boxer cardiomyopathy)", "Heat stroke"],
  // Dogs (large breed — joints + GDV)
  "German Shepherd":   ["Hip Dysplasia", "Bloat (GDV)", "Degenerative Myelopathy"],
  "Golden Retriever":  ["Hip Dysplasia", "Cancer risk", "Heart disease"],
  "Labrador":          ["Hip Dysplasia", "Obesity", "Exercise-induced collapse"],
  "Rottweiler":        ["Hip Dysplasia", "Bone cancer", "Heart disease"],
  // Dogs (small breed)
  "Dachshund":         ["IVDD (Intervertebral Disc Disease)", "Obesity"],
  "Chihuahua":         ["Patellar Luxation", "Hydrocephalus", "Hypoglycemia"],
  "Poodle":            ["Patellar Luxation", "Addison's disease", "Epilepsy"],
  "Shiba Inu":         ["Hip Dysplasia", "Eye conditions", "Allergies"],
  "Beagle":            ["Obesity", "Ear infections", "Epilepsy"],
};

// ─── Disclaimer copy (UI uses this; values for vet name + phone come from clinic-info at runtime) ──
export const CARE_PLAN_DISCLAIMER = {
  short:
    "AI tham khảo, không thay khám bác sĩ thú y. Có dấu hiệu lạ — hỏi BS ngay.",
  full_template:
    "Care Plan được tạo bởi AI dựa trên hồ sơ bé + thời tiết + breed traits. " +
    "Đây là gợi ý THAM KHẢO, KHÔNG thay thế khám bác sĩ thú y thật.\n\n" +
    "Liên hệ ngay {VET_NAME} hoặc gọi cấp cứu nếu:\n" +
    "  • Bé có dấu hiệu lạ (nôn, tiêu chảy, lừ đừ, bỏ ăn >24h)\n" +
    "  • Khó thở, thở gấp, co giật\n" +
    "  • Trúng độc (ăn lung tung, hoá chất, thuốc người)\n" +
    "  • Bất kỳ tình huống khẩn cấp nào\n\n" +
    "Cấp cứu thú y: {HOTLINE}",
  emergency_help_lines: [
    "Nôn / tiêu chảy / lừ đừ / bỏ ăn > 24h",
    "Khó thở, thở gấp, co giật",
    "Trúng độc — ăn lung tung, hoá chất, thuốc người",
    "Bất kỳ tình huống khẩn cấp nào",
  ],
} as const;

// ─── Validator ─────────────────────────────────────────────────────────────
export interface SafetyResult {
  safe: boolean;
  violations: string[];
}

/**
 * Validate AI-generated care plan against the toxic blacklist + dangerous-activity list.
 * - `species` is "dog" | "cat" — controls which blacklist applies.
 * - Phrases like "TRÁNH hành tỏi" / "KHÔNG cho ăn chocolate" / "avoid grapes" are OK
 *   (they're warnings, not recommendations).
 * - Anything else mentioning a toxic food without a warning prefix is flagged.
 */
export function validateCarePlanSafety(carePlan: unknown, species: string): SafetyResult {
  const violations: string[] = [];
  const blacklist = species === "cat" ? TOXIC_FOODS_CAT : TOXIC_FOODS_DOG;
  const planText = JSON.stringify(carePlan || {}).toLowerCase();

  // Warning-context indicators — if these wrap the toxic word, allow it
  const SAFE_PREFIXES_VI = ["tránh", "không cho ăn", "không cho", "cấm ăn", "cấm", "không"];
  const SAFE_PREFIXES_EN = ["avoid", "no ", "do not", "don't", "never"];

  for (const toxicRaw of blacklist) {
    const toxic = toxicRaw.toLowerCase();
    // Word-boundary-ish search (substring is fine for VN since words don't share letters)
    if (!planText.includes(toxic)) continue;

    // Check up to 30 chars before the toxic mention for a safe prefix
    const idx = planText.indexOf(toxic);
    const windowBefore = planText.slice(Math.max(0, idx - 30), idx);
    const isWarning = [...SAFE_PREFIXES_VI, ...SAFE_PREFIXES_EN].some((p) => windowBefore.includes(p));

    if (!isWarning) {
      violations.push(`Toxic food "${toxicRaw}" mentioned without warning prefix (${species})`);
    }
  }

  for (const phrase of DANGEROUS_ACTIVITY_PHRASES) {
    if (planText.includes(phrase.toLowerCase())) {
      violations.push(`Dangerous activity phrase detected: "${phrase}"`);
    }
  }

  return { safe: violations.length === 0, violations };
}

/**
 * Render the full disclaimer with vet name + hotline substituted at runtime.
 * Web/SSR call `getClinicInfo()` then pass values here.
 */
export function renderDisclaimer(vetName: string, hotline: string): string {
  return CARE_PLAN_DISCLAIMER.full_template
    .replace("{VET_NAME}", vetName)
    .replace("{HOTLINE}", hotline);
}
