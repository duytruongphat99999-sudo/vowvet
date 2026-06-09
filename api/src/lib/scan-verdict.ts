/**
 * Scan verdict builder (SAU-SCAN experience — pha 3).
 *
 * Pure module (KHÔNG gọi Baserow, KHÔNG tính DER). Nhận OCR + match + profile bé
 * → phân loại sản phẩm (4 nhánh) + verdict cá nhân hoá (tiếng người) + CTA theo loại.
 *
 * NGUYÊN TẮC:
 *  - KHÔNG đụng công thức carb/ash (route food-scan.ts giữ nguyên) — chỉ ĐỌC carb_pct.
 *  - TRUNG THỰC NHÃN (§5): OCR đọc nhãn là FUZZY → mọi phát biểu về thành phần phải HEDGE
 *    ("có thể chứa"), KHÔNG khẳng định "không chứa / an toàn".
 *  - CẤM kết luận y khoa "tốt/an toàn cho bé" khi có bệnh nền → surface dữ kiện + nhường bác sĩ.
 *  - Nhãn AI hướng người dùng = "AI của VowVet" (xử lý ở UI), module này KHÔNG ghi tên nhà cung cấp.
 */
import type { FoodLabelOcr } from "./food-label-vision.ts";
import type { MatchResult } from "./food-brand-matcher.ts";
import { HEALTH_CONDITIONS } from "@shared/health-conditions.ts";
import { ALLERGEN_LABEL_VI, type AllergenCode } from "@shared/allergen-normalizer.ts";

export type ScanCategory = "complete" | "supplement" | "treat" | "non_food" | "unknown";

export interface ScanPetProfile {
  name: string;
  speciesEn: "dog" | "cat" | null;
  speciesVi: string | null;
  dob: string | null;
  lifeStage: string | null;
  allergens: string[];
  conditions: { code: string; status: string; since: string | null }[];
}

/** kind = cách UI render: button (action JS) · link (điều hướng href) · text (chữ, không click). */
export interface ScanCta {
  action: "add_plan" | "view_profile" | "rescan" | "ask_vet";
  kind: "button" | "link" | "text";
  label: string;
  primary?: boolean;
  href?: string | null;
  brandId?: number | null;
}

export interface ScanVerdict {
  category: { type: ScanCategory; label: string; confident: boolean };
  headline: string;
  lines: string[];
  tone: "ok" | "caution" | "info";
  ask_vet: boolean;
  flags: { allergens: string[]; conditions: string[]; lifeStageNote: string | null };
  cta: ScanCta[];
}

const CATEGORY_LABEL: Record<ScanCategory, string> = {
  complete: "Thức ăn hoàn chỉnh",
  supplement: "Sản phẩm bổ sung",
  treat: "Bánh thưởng",
  non_food: "Không phải đồ ăn",
  unknown: "Chưa rõ loại",
};

/** lowercase + bỏ dấu tiếng Việt (để khớp keyword viết không dấu). */
function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

// Keyword viết KHÔNG DẤU (chạy trên norm()).
const RE_NON_FOOD = /(shampoo|sua tam|dau tam|goi dau|xit|spray|khu mui|deodor|topical|boi ngoai|ve sinh tai|nho mat|nho tai|khan uot|wipe|lotion|nuoc hoa)/;
const RE_TREAT = /(treat|snack|reward|jerky|banh thuong|do thuong|que nhai|thanh nhai|dental chew|dental stick|chew stick|kho ga|kho bo|xuong gam)/;
const RE_SUPP = /(supplement|bo sung|cfu|probiotic|prebiotic|inulin|men vi sinh|loi khuan|men tieu hoa|multivitamin|vitamin|omega|dau ca|glucosamine|chondroitin|joint|sui bot|siro|paste|gel dinh duong|bot dinh duong)/;
const RE_COMPLETE = /(aafco|complete and balanced|complete & balanced|complete balanced|nutritionally complete|hoan chinh|day du va can doi|thuc an day du)/;

/** Sản phẩm bổ sung hỗ trợ gì (suy từ keyword nhãn) — null nếu không rõ. */
function suppFocus(text: string): string | null {
  if (/men vi sinh|probiotic|cfu|inulin|prebiotic|loi khuan|men tieu hoa|tieu hoa/.test(text)) return "tiêu hoá / hệ vi sinh đường ruột";
  if (/omega|dau ca|da long|skin|coat/.test(text)) return "da & lông";
  if (/glucosamine|chondroitin|joint|khop|xuong khop/.test(text)) return "xương khớp";
  if (/multivitamin|vitamin/.test(text)) return "vitamin / khoáng tổng hợp";
  return null;
}

// Allergen keyword (diacritic-insensitive, chạy trên norm()) → code.
// LÝ DO tự làm: shared normalizeAllergen() LỖI với input tiếng Việt CÓ DẤU ("Gà"/"cá"/"thịt gà" → null)
// do trailing `\b` đứng sau ký tự non-ASCII. File đó là vùng CẤM ĐỤNG nên không sửa — workaround tại đây.
const ALLERGEN_KEYWORDS: Array<[RegExp, AllergenCode]> = [
  [/\b(ga|thit ga|chicken|poultry|ga tay|turkey)\b/, "chicken"],
  [/\b(bo|thit bo|beef)\b/, "beef"],
  [/\b(ca ngu|ca hoi|ca thu|ca bien|ca nuc|ca|fish|tuna|salmon)\b/, "fish"],
  [/\b(sua bo|sua tuoi|sua|pho mai|milk|dairy|cheese|lactose)\b/, "dairy"],
  [/\b(trung|egg)\b/, "egg"],
  [/\b(dau nanh|dau hu|tofu|soy|soya)\b/, "soy"],
  [/\b(ngu coc|lua mi|yen mach|wheat|grain|oat|corn|ngo|gluten)\b/, "grain"],
  [/\b(tom|cua|ghe|ngheu|shellfish|shrimp|crab)\b/, "shellfish"],
  [/\b(dau phong|lac|peanut)\b/, "peanut"],
];

/** Tập allergen code suy từ 1 chuỗi (bỏ dấu) — dùng cho cả allergen bé khai lẫn raw_text nhãn. */
function allergenCodesFrom(s: string | null | undefined): AllergenCode[] {
  const t = " " + norm(s).replace(/[^a-z0-9]+/g, " ").trim() + " ";
  const out = new Set<AllergenCode>();
  for (const [re, code] of ALLERGEN_KEYWORDS) if (re.test(t)) out.add(code);
  return [...out];
}

/** Nhãn VN tuổi thô từ dob ("YYYY-MM-DD") — chỉ để chào, KHÔNG dùng tính toán. */
function ageLabel(dob: string | null): string | null {
  if (!dob) return null;
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return null;
  const months = Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 12) return `~${months} tháng`;
  const years = Math.floor(months / 12);
  return `~${years} tuổi`;
}

/** [A] Phân loại sản phẩm từ field OCR. confident=false → "chưa chắc loại". */
export function classifyProduct(
  ocr: FoodLabelOcr,
  text: string
): { type: ScanCategory; confident: boolean } {
  const hasPF = ocr.protein_pct != null && ocr.fat_pct != null;

  // ƯU TIÊN product_type Gemini phân loại (prompt supplement/treat/food-aware).
  switch (ocr.product_type) {
    case "non_food":   return { type: "non_food", confident: true };
    case "supplement": return { type: "supplement", confident: true };
    case "treat":      return { type: "treat", confident: true };
    case "food":       return { type: "complete", confident: hasPF || RE_COMPLETE.test(text) };
    // "unknown"/null → rơi xuống keyword fallback bên dưới.
  }

  // Fallback keyword khi OCR không cho product_type.
  if (RE_NON_FOOD.test(text)) return { type: "non_food", confident: true };
  if (hasPF && RE_TREAT.test(text)) return { type: "treat", confident: true };
  if (!hasPF && RE_SUPP.test(text)) return { type: "supplement", confident: true };
  // Không có protein/fat nhưng đọc được brand/kcal → gần như chắc KHÔNG phải thức ăn chính.
  if (!hasPF && (ocr.brand_name || ocr.calories_per_100g != null)) return { type: "supplement", confident: false };
  if (!hasPF) return { type: "unknown", confident: false };
  if (RE_COMPLETE.test(text)) return { type: "complete", confident: true };
  // Có P+F nhưng không tín hiệu rõ → mặc định hoàn chỉnh nhưng NÓI RÕ chưa chắc (an toàn: không tự ép khẩu phần).
  return { type: "complete", confident: false };
}

/**
 * [B] Verdict cá nhân hoá. Trả null nếu thiếu OCR (route tự xử state fail).
 */
export function buildScanVerdict(args: {
  petId: number;
  ocr: FoodLabelOcr | null;
  match: MatchResult;
  carb_pct: number | null;
  profile: ScanPetProfile;
}): ScanVerdict | null {
  const { petId, ocr, match, carb_pct, profile } = args;
  if (!ocr) return null;

  const text = norm([ocr.raw_text, ocr.brand_name, ocr.product_line].filter(Boolean).join(" "));
  const cls = classifyProduct(ocr, text);
  const name = profile.name || "bé";
  const matched = !!(match && match.matched && match.brand);

  // ----- Headline: tên + (loài · tuổi) -----
  const idParts = [profile.speciesVi, ageLabel(profile.dob)].filter(Boolean).join(" · ");
  const headline = idParts ? `${name} (${idParts}) — ${CATEGORY_LABEL[cls.type]}` : `${name} — ${CATEGORY_LABEL[cls.type]}`;

  const lines: string[] = [];

  // ----- Mô tả theo loại -----
  if (cls.type === "complete") {
    if (cls.confident) lines.push("Đây là thức ăn hoàn chỉnh — có thể dùng làm bữa chính.");
    else lines.push("Có vẻ là thức ăn hoàn chỉnh, nhưng nhãn chưa ghi rõ “complete & balanced”/AAFCO — kiểm tra lại bao bì trước khi cho ăn làm bữa chính.");
    if (carb_pct != null) lines.push(`Tinh bột ước tính từ nhãn ~${carb_pct}% (tham khảo, khoáng có thể là ước tính).`);
  } else if (cls.type === "supplement") {
    lines.push("Đây là sản phẩm BỔ SUNG, không phải thức ăn chính — không dùng để tính khẩu phần.");
    const focus = suppFocus(text);
    if (focus) lines.push(`Nhãn hướng tới hỗ trợ: ${focus}.`);
    lines.push("Bé có cần hay không tuỳ tình trạng sức khoẻ — nên hỏi bác sĩ thú y trước khi dùng.");
  } else if (cls.type === "treat") {
    lines.push("Đây là bánh thưởng — tính vào quỹ calo trong ngày, không thay bữa chính.");
  } else if (cls.type === "non_food") {
    lines.push("Sản phẩm này không phải đồ ăn (bôi ngoài/vệ sinh) — không tính dinh dưỡng.");
  } else {
    lines.push("Chưa đọc đủ thông tin để phân loại — chụp lại rõ bảng Guaranteed Analysis (đạm/béo/xơ/ẩm).");
  }
  if (!cls.confident && cls.type !== "unknown") {
    lines.push("Lưu ý: AI của VowVet chưa chắc chắn loại sản phẩm này.");
  }

  // ----- 3 check rẻ (chỉ áp cho sản phẩm cho-ăn-được) -----
  const flags: ScanVerdict["flags"] = { allergens: [], conditions: [], lifeStageNote: null };
  let askVet = cls.type === "supplement";
  let allergyUnverified = false; // bé CÓ dị ứng nhưng text quét không đọc được thành phần để đối chiếu

  if (cls.type === "complete" || cls.type === "treat" || cls.type === "supplement") {
    // (a) Dị ứng — HEDGE vì OCR fuzzy; KHÔNG khẳng định "không có/an toàn". Bé có dị ứng → KHÔNG BAO GIỜ im.
    if (profile.allergens.length) {
      const petCodes = allergenCodesFrom(profile.allergens.join(" "));
      const petAllergyLabels = petCodes.length
        ? petCodes.map((c) => ALLERGEN_LABEL_VI[c] || c)
        : profile.allergens.slice(); // fallback: hiển thị nguyên văn bé khai (không normalize được)
      const inLabel = allergenCodesFrom(ocr.raw_text);
      const hit = petCodes.filter((c) => inLabel.includes(c));
      if (hit.length) {
        const labels = hit.map((c) => ALLERGEN_LABEL_VI[c] || c);
        flags.allergens = labels;
        lines.push(`AI đọc thấy nhãn CÓ THỂ chứa ${labels.join(", ")} — trùng dị ứng đã ghi của ${name}. Kiểm tra kỹ thành phần thật trên bao bì trước khi cho ăn.`);
        askVet = true;
      } else {
        // Không match được trong text quét → thật thà: chưa chắc đọc đủ, tự xem bao bì (KHÔNG suy ra an toàn).
        allergyUnverified = true;
        lines.push(`${name} có dị ứng ${petAllergyLabels.join(", ")}. Ảnh quét chưa chắc đọc đủ bảng thành phần — xem kỹ thành phần trên bao trước khi dùng.`);
      }
    }

    // (b) Bệnh nền đã ghi → KHÔNG bật đèn xanh, đẩy bác sĩ lên.
    if (profile.conditions.length) {
      const labels = profile.conditions.map((c) => HEALTH_CONDITIONS.find((d) => d.code === c.code)?.label || c.code);
      flags.conditions = labels;
      lines.push(`${name} có bệnh nền đã ghi: ${labels.join(", ")}. VowVet không kết luận sản phẩm này có hợp hay không — hãy hỏi bác sĩ thú y trước khi cho dùng.`);
      askVet = true;
    }

    // (c) Loài / life-stage có hợp không.
    if (ocr.species && (ocr.species === "dog" || ocr.species === "cat") && profile.speciesEn && ocr.species !== profile.speciesEn) {
      const labelDog = ocr.species === "dog" ? "chó" : "mèo";
      flags.lifeStageNote = `Nhãn ghi dành cho ${labelDog} nhưng ${name} là ${profile.speciesVi || (profile.speciesEn === "cat" ? "mèo" : "chó")} — cân nhắc, có thể không phù hợp.`;
      lines.push(flags.lifeStageNote);
    } else if (ocr.life_stage && ocr.life_stage !== "all" && profile.lifeStage && norm(ocr.life_stage) !== norm(profile.lifeStage)) {
      flags.lifeStageNote = `Nhãn ghi cho giai đoạn “${ocr.life_stage}” — khác giai đoạn đang ghi của ${name}. Cân nhắc cho phù hợp tuổi.`;
      lines.push(flags.lifeStageNote);
    }
  }

  const flagged = flags.allergens.length > 0 || flags.conditions.length > 0;
  // allergyUnverified → KHÔNG green-light "ok" (bé dị ứng + chưa đọc được thành phần = không suy ra an toàn).
  const tone: ScanVerdict["tone"] =
    flagged ? "caution" : cls.type === "complete" && cls.confident && !allergyUnverified ? "ok" : "info";

  // ----- [D] CTA theo loại + verdict -----
  const cta: ScanCta[] = [];
  // Có cờ bệnh nền/dị ứng → "Hỏi bác sĩ thú y" nổi lên đầu (dạng chữ — không có flow vet thật).
  if (askVet) {
    cta.push({ action: "ask_vet", kind: "text", label: "Nên hỏi bác sĩ thú y trước khi cho dùng sản phẩm này.", primary: true });
  }
  // Hoàn chỉnh + không cờ + có brand khớp → thêm vào kế hoạch bữa ăn.
  if (cls.type === "complete" && !flagged && matched) {
    cta.push({
      action: "add_plan",
      kind: "button",
      label: `Thêm vào kế hoạch bữa ăn của ${name}`,
      primary: true,
      brandId: match.brand!.brand_id,
    });
  }
  // Luôn có: xem trong hồ sơ (scan đã tự lưu vào lịch sử) + quét lại.
  cta.push({ action: "view_profile", kind: "link", label: `Xem trong hồ sơ ${name}`, href: `/pets/${petId}/activity` });
  cta.push({ action: "rescan", kind: "button", label: "Quét lại" });

  return {
    category: { type: cls.type, label: CATEGORY_LABEL[cls.type], confident: cls.confident },
    headline,
    lines,
    tone,
    ask_vet: askVet,
    flags,
    cta,
  };
}
