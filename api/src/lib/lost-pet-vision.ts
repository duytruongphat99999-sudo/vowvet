/**
 * Lost Pet AI Match service (Gemini 2.5 Flash vision).
 *
 * Compares a sighting photo against owner's reference photos. Returns 0-100 score
 * + confidence + matching features. Mirrors bcs-vision.ts mock-fallback pattern.
 *
 * Used by sighting submission endpoint — fires push to owner only if
 * shouldNotifyOwner() is true (≥60 score or confidence=failed).
 */
export type MatchConfidence = "high" | "medium" | "low" | "failed";
export type MatchTier = "definite" | "likely" | "maybe" | "unlikely";

export interface MatchInput {
  lostPet: {
    name: string;
    species: string;
    breed?: string | null;
    color?: string | null;
    distinctive_marks?: string | null;
    reference_photo_urls: string[];
  };
  sightingPhotoUrl: string;
}

export interface MatchResult {
  match_score: number;
  confidence: MatchConfidence;
  analysis: string;
  matching_features: string[];
  differences: string[];
  is_mock: boolean;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${url}: ${res.status}`);
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buf = await res.arrayBuffer();
  return { data: Buffer.from(buf).toString("base64"), mimeType };
}

function mockResult(): MatchResult {
  return {
    match_score: 50,
    confidence: "failed",
    analysis:
      "[AI Vision tạm chưa khả dụng] Hệ thống không thể so sánh tự động. " +
      "Chủ vui lòng xem ảnh và đặc điểm thủ công, hoặc chat Zalo VowVet (https://zalo.me/1136810892220003266) / gọi 0779 029 133 để được hỗ trợ.",
    matching_features: [],
    differences: [],
    is_mock: true,
  };
}

export async function matchPetSighting(params: MatchInput): Promise<MatchResult> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) {
    console.warn("[lost-pet-vision] GEMINI_API_KEY missing → mock");
    return mockResult();
  }
  if (!params.lostPet.reference_photo_urls?.length) {
    console.warn("[lost-pet-vision] no reference photos → mock");
    return mockResult();
  }
  if (!params.sightingPhotoUrl) {
    console.warn("[lost-pet-vision] no sighting photo → mock");
    return mockResult();
  }

  const speciesVn = params.lostPet.species === "cat" ? "mèo" : params.lostPet.species === "dog" ? "chó" : "thú cưng";
  const refCount = params.lostPet.reference_photo_urls.length;

  const prompt =
    `Bạn là chuyên gia nhận dạng thú cưng với 20 năm kinh nghiệm. So sánh ảnh sighting với pet đang mất.\n\n` +
    `Pet đang mất:\n` +
    `- Tên: ${params.lostPet.name}\n` +
    `- Loài: ${speciesVn}\n` +
    `- Giống: ${params.lostPet.breed || "không rõ"}\n` +
    `- Màu lông: ${params.lostPet.color || "không rõ"}\n` +
    `- Đặc điểm đặc biệt: ${params.lostPet.distinctive_marks || "không có ghi nhận"}\n\n` +
    `${refCount} ảnh đầu tiên là ảnh THAM KHẢO (pet đang mất). Ảnh CUỐI là ảnh SIGHTING cần so sánh.\n\n` +
    `Phân tích: loài, giống, màu lông, body shape, đặc điểm đặc biệt (đốm, sẹo, đeo vòng cổ...), tuổi đại khái.\n\n` +
    `Cho điểm match 0-100:\n` +
    `- 80-100 = chắc chắn cùng pet (confidence: high)\n` +
    `- 60-79 = có thể là cùng pet (confidence: medium)\n` +
    `- 40-59 = nghi ngờ, cần xem trực tiếp (confidence: low)\n` +
    `- 0-39 = không phải (confidence: low)\n\n` +
    `Trả JSON THUẦN (không markdown, không code fence):\n` +
    `{"match_score":<0-100>,"confidence":"high|medium|low","analysis":"<3-4 câu tiếng Việt giải thích quyết định>","matching_features":["đặc điểm trùng 1","đặc điểm trùng 2"],"differences":["khác biệt 1"]}`;

  try {
    const allUrls = [...params.lostPet.reference_photo_urls.slice(0, 5), params.sightingPhotoUrl];
    const images = await Promise.all(allUrls.map(fetchImageAsBase64));

    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const parts: any[] = [{ text: prompt }];
    for (const img of images) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }

    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: { maxOutputTokens: 600, temperature: 0.2 },
    });

    const raw = result.text || "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]+\}/);
      if (!m) throw new Error("AI Match: no JSON found");
      parsed = JSON.parse(m[0]);
    }

    const score = Math.max(0, Math.min(100, Number(parsed.match_score) || 0));
    const validConf: MatchConfidence[] = ["high", "medium", "low", "failed"];
    const confidence: MatchConfidence = validConf.includes(parsed.confidence) ? parsed.confidence : "low";

    return {
      match_score: score,
      confidence,
      analysis: String(parsed.analysis || "").slice(0, 1500),
      matching_features: Array.isArray(parsed.matching_features) ? parsed.matching_features.slice(0, 6).map(String) : [],
      differences: Array.isArray(parsed.differences) ? parsed.differences.slice(0, 6).map(String) : [],
      is_mock: false,
    };
  } catch (err) {
    console.error("[lost-pet-vision] AI fail, returning mock:", err);
    return mockResult();
  }
}

// ============================================================
// Tier helpers
// ============================================================

/**
 * Notify owner only when there's signal:
 *   - score ≥ 60 (likely + definite tiers), OR
 *   - confidence=failed (Gemini quota → let owner judge)
 */
export function shouldNotifyOwner(score: number, confidence: MatchConfidence): boolean {
  if (confidence === "failed") return true;
  return score >= 60;
}

export function getMatchTier(score: number): MatchTier {
  if (score >= 80) return "definite";
  if (score >= 60) return "likely";
  if (score >= 40) return "maybe";
  return "unlikely";
}

export const TIER_META: Record<MatchTier, { emoji: string; label_vi: string; color_class: string }> = {
  definite: { emoji: "💚", label_vi: "Chắc chắn", color_class: "bg-emerald-50 border-emerald-400 text-emerald-900" },
  likely:   { emoji: "🟢", label_vi: "Khả năng cao", color_class: "bg-green-50 border-green-400 text-green-900" },
  maybe:    { emoji: "🟡", label_vi: "Nghi ngờ", color_class: "bg-yellow-50 border-yellow-400 text-yellow-900" },
  unlikely: { emoji: "⚪", label_vi: "Không khả năng", color_class: "bg-slate-50 border-slate-300 text-slate-700" },
};
