/**
 * Food label OCR vision service (camera scan — pha 1).
 *
 * Gọi Gemini REST trực tiếp (v1beta generateContent) + inlineData, parse JSON thuần.
 * REST thay SDK để đọc được HTTP status (phân loại retry) + finishReason (bắt MAX_TOKENS).
 * Retry 3 attempt (backoff 1s/2.5s) CHỈ cho 429/5xx/network/timeout — hết nuốt im 503.
 *
 * scanFoodLabel trả {ocr, failReason}:
 *   failReason "model_error" = lỗi phía AI (429/5xx/network/timeout/4xx/parse hỏng/MAX_TOKENS) — KHÔNG phải tại ảnh;
 *   failReason "empty"       = Gemini đọc JSON hợp lệ nhưng all-null (ảnh không đọc nổi thật);
 *   failReason null          = có dữ liệu. non_food all-null VẪN là kết quả hợp lệ (3-state 2b41f9c).
 *
 * CHỈ đọc nhãn → trả guaranteed-analysis thô. KHÔNG tính DER/dinh dưỡng (pha sau).
 * KHÔNG log GEMINI_API_KEY (key đi qua header, không nằm trong URL/error body).
 * Nhãn AI hướng người dùng = "AI của VowVet" (xử lý ở route).
 */

export interface FoodLabelOcr {
  brand_name: string | null;
  product_line: string | null;
  product_type: string | null; // "food" | "treat" | "supplement" | "non_food" | "unknown" | null
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

export type FoodLabelFailReason = "model_error" | "empty" | null;

export interface FoodLabelScanResult {
  ocr: FoodLabelOcr | null;
  failReason: FoodLabelFailReason;
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

/** product_type hợp lệ trong enum; ngoài enum / không phải string → null. */
function ptype(v: any): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return ["food", "treat", "supplement", "non_food", "unknown"].includes(t) ? t : null;
}

const PROMPT =
  `Bạn là chuyên gia đọc NHÃN sản phẩm cho THÚ CƯNG (chó/mèo): thức ăn hoàn chỉnh, bánh thưởng, HOẶC ` +
  `sản phẩm bổ sung (men vi sinh/probiotic/CFU, inulin, vitamin, dầu cá, hỗ trợ khớp…). Ảnh là nhãn bao bì.\n` +
  `Hãy trích thông tin IN TRÊN NHÃN — TUYỆT ĐỐI không suy đoán, không bịa số.\n\n` +
  `Quy tắc:\n` +
  `- LUÔN trả brand_name (tên thương hiệu) và raw_text (toàn bộ chữ đọc được, rút gọn) nếu đọc được nhãn — ` +
  `KỂ CẢ khi KHÔNG có bảng Guaranteed Analysis chuẩn. Thiếu số dinh dưỡng KHÔNG sao.\n` +
  `- product_type — phân loại sản phẩm:\n` +
  `    "food" = thức ăn hoàn chỉnh (hạt/pate làm bữa chính);\n` +
  `    "treat" = bánh thưởng/snack;\n` +
  `    "supplement" = bổ sung (probiotic/CFU, inulin, vitamin, dầu cá, glucosamine…), KHÔNG phải bữa chính;\n` +
  `    "non_food" = KHÔNG phải đồ ăn thú cưng (dầu tắm/xịt/vệ sinh, HOẶC sản phẩm cho NGƯỜI);\n` +
  `    "unknown" = đọc được chữ nhưng không đủ để phân loại.\n` +
  `- Số dinh dưỡng (protein/fat/fiber/moisture %, kcal/100g): CHỈ điền nếu nhãn GHI RÕ; không có → null. KHÔNG bịa.\n` +
  `- species: "dog"/"cat"/"both"/null. life_stage: "puppy"/"adult"/"senior"/"all"/null. product_line: dòng/biến thể nếu có.\n` +
  `- CHỈ trả TẤT CẢ null (brand_name=null, raw_text=null, product_type="unknown") khi: ảnh KHÔNG đọc nổi ` +
  `(mờ/loá/không phải nhãn) HOẶC rõ ràng không phải sản phẩm thú cưng và không đọc được gì. ` +
  `KHÔNG bịa product_type cho vật thể ngẫu nhiên — nếu là đồ người/đồ vệ sinh thì product_type="non_food".\n\n` +
  `Trả JSON THUẦN (không markdown, không code fence):\n` +
  `{"brand_name":<string|null>,"product_line":<string|null>,"product_type":<"food"|"treat"|"supplement"|"non_food"|"unknown">,` +
  `"species":<string|null>,"life_stage":<string|null>,` +
  `"protein_pct":<number|null>,"fat_pct":<number|null>,"fiber_pct":<number|null>,"moisture_pct":<number|null>,` +
  `"calories_per_100g":<number|null>,"raw_text":<string|null>}`;

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const ATTEMPT_TIMEOUT_MS = 20_000; // AbortController 20s/attempt
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 2_500]; // backoff giữa attempt 1→2 và 2→3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiCall =
  | { ok: true; finishReason: string | null; text: string }
  | { ok: false; retryable: boolean; detail: string };

/** 1 attempt REST. Lỗi network/timeout + 429/5xx = retryable; 4xx khác = không. */
async function callGeminiOnce(apiKey: string, input: FoodLabelInput): Promise<GeminiCall> {
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.1,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 }, // tắt thinking — không ăn lẹm token budget
    },
  };

  let res: Response;
  try {
    res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
  } catch (err: any) {
    return { ok: false, retryable: true, detail: `fetch_error: ${String(err?.message || err).slice(0, 500)}` };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return {
      ok: false,
      retryable: res.status === 429 || res.status >= 500,
      detail: `http_${res.status}: ${errBody.slice(0, 500)}`,
    };
  }

  const j: any = await res.json().catch(() => null);
  const cand = j?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
  return { ok: true, finishReason: cand?.finishReason ?? null, text };
}

/**
 * OCR 1 ảnh nhãn → guaranteed-analysis thô.
 * Trả {ocr, failReason} — KHÔNG còn null trần: route phân biệt được "AI bận" vs "ảnh mờ".
 */
export async function scanFoodLabel(input: FoodLabelInput): Promise<FoodLabelScanResult> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) {
    console.error("[food-label-vision] GEMINI_API_KEY missing → model_error (no OCR)");
    return { ocr: null, failReason: "model_error" };
  }

  let call: Extract<GeminiCall, { ok: true }> | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(RETRY_DELAYS_MS[attempt - 2]);
    const r = await callGeminiOnce(GEMINI_API_KEY, input);
    if (r.ok) {
      call = r;
      break;
    }
    console.error(`[food-label-vision] Gemini attempt ${attempt}/${MAX_ATTEMPTS} fail (retryable=${r.retryable}):`, r.detail);
    if (!r.retryable) break;
  }
  if (!call) return { ocr: null, failReason: "model_error" };

  if (call.finishReason === "MAX_TOKENS") {
    console.error("[food-label-vision] finishReason=MAX_TOKENS — output bị cắt → model_error");
    return { ocr: null, failReason: "model_error" };
  }

  const cleaned = call.text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]+\}/);
    if (!m) {
      console.error(`[food-label-vision] no JSON in response (finishReason=${call.finishReason}):`, cleaned.slice(0, 500));
      return { ocr: null, failReason: "model_error" };
    }
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      console.error("[food-label-vision] JSON parse fail:", cleaned.slice(0, 500));
      return { ocr: null, failReason: "model_error" };
    }
  }

  const rawText = str(parsed.raw_text);
  const ocr: FoodLabelOcr = {
    brand_name: str(parsed.brand_name),
    product_line: str(parsed.product_line),
    product_type: ptype(parsed.product_type),
    species: str(parsed.species),
    life_stage: str(parsed.life_stage),
    protein_pct: pct(parsed.protein_pct),
    fat_pct: pct(parsed.fat_pct),
    fiber_pct: pct(parsed.fiber_pct),
    moisture_pct: pct(parsed.moisture_pct),
    calories_per_100g: kcal(parsed.calories_per_100g),
    raw_text: rawText ? rawText.slice(0, 2000) : null,
  };

  // empty = all-null contract trong PROMPT (ảnh không đọc nổi thật).
  // EXCLUDE non_food: product_type="non_food" dù 0 field vẫn là KẾT QUẢ HỢP LỆ
  // → chảy về route/widget render state "không phải đồ thú cưng" (3-state 2b41f9c).
  const hasAnyField =
    ocr.brand_name !== null || ocr.product_line !== null || ocr.species !== null ||
    ocr.life_stage !== null || ocr.protein_pct !== null || ocr.fat_pct !== null ||
    ocr.fiber_pct !== null || ocr.moisture_pct !== null || ocr.calories_per_100g !== null ||
    ocr.raw_text !== null;
  if (!hasAnyField && ocr.product_type !== "non_food") {
    console.error(`[food-label-vision] OCR empty (all-null, product_type=${ocr.product_type}) → unreadable`);
    return { ocr: null, failReason: "empty" };
  }

  return { ocr, failReason: null };
}
