/**
 * Food label OCR vision service (camera scan — pha 1).
 *
 * Bám khuôn bcs-vision.ts: Gemini 2.5 Flash + inlineData, parse JSON thuần,
 * fallback `null` (KHÔNG bịa số) khi thiếu key / Gemini fail / nhãn không đọc được.
 *
 * CHỈ đọc nhãn → trả guaranteed-analysis thô. KHÔNG tính DER/dinh dưỡng (pha sau).
 * KHÔNG log GEMINI_API_KEY. Nhãn AI hướng người dùng = "AI của VowVet" (xử lý ở route).
 */

export interface FoodLabelOcr {
  brand_name: string | null;
  product_line: string | null;
  species: string | null; // "dog" | "cat" | "both" | null
  life_stage: string | null; // "puppy" | "adult" | "senior" | "all" | null
  protein_pct: number | null;
  fat_pct: number | null;
  fiber_pct: number | null;
  moisture_pct: number | null;
  calories_per_100g: number | null;
  raw_text: string | null;
}

export interface FoodLabelInput {
  imageBase64: string;
  mimeType: string;
}

/** % hợp lệ 0..100; ngoài range / không phải số → null (KHÔNG bịa). */
function pct(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

/** kcal/100g hợp lệ 0..1000; ngoài range → null. */
function kcal(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return Math.round(n * 10) / 10;
}

function str(v: any): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

const PROMPT =
  `Bạn là chuyên gia đọc NHÃN thức ăn thú cưng (chó/mèo). Ảnh được cung cấp là nhãn bao bì.\n` +
  `Hãy trích thông tin IN TRÊN NHÃN — TUYỆT ĐỐI không suy đoán, không bịa số.\n\n` +
  `Quy tắc:\n` +
  `- Field nào KHÔNG đọc rõ hoặc không có trên nhãn → trả null. Đừng đoán.\n` +
  `- Guaranteed Analysis / Thành phần đảm bảo → số %: protein, fat (chất béo), fiber (chất xơ), moisture (độ ẩm).\n` +
  `- calories_per_100g: chỉ điền nếu nhãn ghi rõ kcal/100g (hoặc quy đổi rõ ràng từ kcal/kg). Không rõ → null.\n` +
  `- species: "dog" nếu cho chó, "cat" nếu cho mèo, "both" nếu cả hai, null nếu không rõ.\n` +
  `- life_stage: "puppy"/"adult"/"senior"/"all" theo nhãn, null nếu không rõ.\n` +
  `- brand_name: tên thương hiệu chính. product_line: dòng/biến thể sản phẩm (nếu có).\n` +
  `- raw_text: toàn bộ chữ đọc được trên nhãn (rút gọn).\n\n` +
  `Trả JSON THUẦN (không markdown, không code fence):\n` +
  `{"brand_name":<string|null>,"product_line":<string|null>,"species":<string|null>,"life_stage":<string|null>,` +
  `"protein_pct":<number|null>,"fat_pct":<number|null>,"fiber_pct":<number|null>,"moisture_pct":<number|null>,` +
  `"calories_per_100g":<number|null>,"raw_text":<string|null>}`;

/**
 * OCR 1 ảnh nhãn → guaranteed-analysis thô. Trả null nếu không đọc được / Gemini fail.
 */
export async function scanFoodLabel(input: FoodLabelInput): Promise<FoodLabelOcr | null> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) {
    console.warn("[food-label-vision] GEMINI_API_KEY missing → null (no OCR)");
    return null;
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: input.mimeType, data: input.imageBase64 } },
          ],
        },
      ],
      config: { maxOutputTokens: 800, temperature: 0.1, responseMimeType: "application/json" },
    });

    const raw = result.text || "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]+\}/);
      if (!m) {
        console.error("[food-label-vision] no JSON in response");
        return null;
      }
      parsed = JSON.parse(m[0]);
    }

    const rawText = str(parsed.raw_text);
    return {
      brand_name: str(parsed.brand_name),
      product_line: str(parsed.product_line),
      species: str(parsed.species),
      life_stage: str(parsed.life_stage),
      protein_pct: pct(parsed.protein_pct),
      fat_pct: pct(parsed.fat_pct),
      fiber_pct: pct(parsed.fiber_pct),
      moisture_pct: pct(parsed.moisture_pct),
      calories_per_100g: kcal(parsed.calories_per_100g),
      raw_text: rawText ? rawText.slice(0, 2000) : null,
    };
  } catch (err) {
    console.error("[food-label-vision] OCR fail:", err);
    return null;
  }
}
