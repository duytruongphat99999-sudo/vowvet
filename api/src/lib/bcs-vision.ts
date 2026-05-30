/**
 * BCS AI Vision service (M22).
 *
 * Uses Gemini 2.5 Flash with image inlineData for vision analysis.
 * Graceful mock fallback if Gemini quota fails.
 *
 * WSAVA BCS scale 1-9:
 *   1-3: underweight (ribs/spine/hip bones visible, no fat)
 *   4-5: IDEAL (waist visible from above, ribs palpable under thin fat)
 *   6-7: overweight (waist absent, ribs hard to palpate)
 *   8-9: obese (no waist, ribs not palpable, abdominal fat pad)
 */
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";

export type BcsCategory = "underweight" | "ideal" | "overweight" | "obese";

export interface BcsRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  side_photo_key: string | null;
  top_photo_key: string | null;
  side_photo_url: string | null;
  top_photo_url: string | null;
  bcs_score: number;
  bcs_category: string | { id: number; value: string };
  ai_analysis: string | null;
  ai_confidence: number;
  recommended_action: string | null;
  needs_vet_review: boolean;
  vet_reviewed_by: number | null;
  vet_reviewed_at: string | null;
  vet_override_score: number | null;
  vet_notes: string | null;
  assessed_at: string;
  is_mock: boolean;
}

export interface BcsApi {
  id: number;
  pet_id: number;
  side_photo_url: string;
  top_photo_url: string;
  bcs_score: number;
  bcs_category: BcsCategory;
  ai_analysis: string;
  ai_confidence: number;
  recommended_action: string;
  needs_vet_review: boolean;
  vet_reviewed: boolean;
  vet_override_score: number | null;
  vet_notes: string;
  assessed_at: string;
  is_mock: boolean;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toApi(row: BcsRow): BcsApi {
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    side_photo_url: row.side_photo_url || "",
    top_photo_url: row.top_photo_url || "",
    bcs_score: Number(row.bcs_score) || 5,
    bcs_category: (flatVal<BcsCategory>(row.bcs_category) || "ideal") as BcsCategory,
    ai_analysis: row.ai_analysis || "",
    ai_confidence: Number(row.ai_confidence) || 0,
    recommended_action: row.recommended_action || "",
    needs_vet_review: row.needs_vet_review === true,
    vet_reviewed: !!row.vet_reviewed_at,
    vet_override_score: row.vet_override_score != null ? Number(row.vet_override_score) : null,
    vet_notes: row.vet_notes || "",
    assessed_at: row.assessed_at || "",
    is_mock: row.is_mock === true,
  };
}

// ================================================================
// Gemini Vision call with mock fallback
// ================================================================

export interface AssessParams {
  petName: string;
  breed: string | null;
  ageYears: number | null;
  species: string | null;
  sidePhotoUrl: string;
  topPhotoUrl: string;
}

export interface AssessResult {
  bcs_score: number;
  bcs_category: BcsCategory;
  confidence: number;
  analysis: string;
  recommendation: string;
  is_mock: boolean;
}

/** Convert remote image URL to base64 + mime for Gemini inlineData. */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${url}: ${res.status}`);
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buf = await res.arrayBuffer();
  return { data: Buffer.from(buf).toString("base64"), mimeType };
}

function mockResult(species: string | null): AssessResult {
  return {
    bcs_score: 5,
    bcs_category: "ideal",
    confidence: 0,
    analysis:
      "[Hệ thống AI Vision tạm chưa hoạt động] Không thể phân tích ảnh tự động. " +
      "Vui lòng tham khảo bác sĩ thú y để đánh giá BCS chính xác cho " +
      (species === "cat" ? "mèo" : "chó") +
      " của bạn.",
    recommendation:
      "Đặt lịch khám với vet để được đánh giá BCS chuyên nghiệp. Hoặc chat Zalo VowVet (https://zalo.me/1136810892220003266) / gọi 0779 029 133 để bác sĩ xem ảnh trực tiếp.",
    is_mock: true,
  };
}

export async function assessBCS(params: AssessParams): Promise<AssessResult> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) {
    console.warn("[bcs-vision] GEMINI_API_KEY missing → mock");
    return mockResult(params.species);
  }

  const speciesVn = params.species === "cat" ? "mèo" : params.species === "dog" ? "chó" : "thú cưng";
  const ageStr = params.ageYears != null ? `${params.ageYears} tuổi` : "tuổi chưa rõ";
  const breedStr = params.breed ? `, giống ${params.breed}` : "";

  const prompt =
    `Bạn là chuyên gia thú y với 20 năm kinh nghiệm đánh giá Body Condition Score (BCS) theo thang WSAVA 1-9 cho thú cưng.\n\n` +
    `Thông tin bé:\n- Tên: ${params.petName}\n- Loài: ${speciesVn}${breedStr}\n- Tuổi: ${ageStr}\n\n` +
    `Bạn được cung cấp 2 ảnh: ảnh đầu là side view (nhìn nghiêng), ảnh sau là top view (nhìn từ trên).\n\n` +
    `Hãy phân tích theo BCS WSAVA:\n` +
    `- 1-3: underweight - xương sườn/cột sống/xương hông nhìn rõ, ít/không có mỡ\n` +
    `- 4-5: IDEAL - eo nhìn rõ từ trên, sờ nhẹ thấy xương sườn dưới lớp mỡ mỏng\n` +
    `- 6-7: overweight - eo mờ/không rõ, sờ xương sườn khó, lớp mỡ bụng rõ\n` +
    `- 8-9: obese - không có eo, không sờ thấy xương sườn, mỡ bụng to\n\n` +
    `Trả JSON THUẦN (không markdown, không code fence):\n` +
    `{"bcs_score":<1-9>,"bcs_category":"underweight|ideal|overweight|obese","confidence":<0-100>,"analysis":"<3-5 câu phân tích tiếng Việt>","recommendation":"<2-3 câu khuyến nghị tiếng Việt>"}`;

  try {
    const [side, top] = await Promise.all([
      fetchImageAsBase64(params.sidePhotoUrl),
      fetchImageAsBase64(params.topPhotoUrl),
    ]);

    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const result = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: side.mimeType, data: side.data } },
            { inlineData: { mimeType: top.mimeType, data: top.data } },
          ],
        },
      ],
      config: { maxOutputTokens: 600, temperature: 0.3 },
    });

    const raw = result.text || "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]+\}/);
      if (!m) throw new Error("BCS: no JSON found in response");
      parsed = JSON.parse(m[0]);
    }

    const score = Math.max(1, Math.min(9, Number(parsed.bcs_score) || 5));
    const validCats: BcsCategory[] = ["underweight", "ideal", "overweight", "obese"];
    const category: BcsCategory = validCats.includes(parsed.bcs_category) ? parsed.bcs_category : "ideal";

    return {
      bcs_score: score,
      bcs_category: category,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 50)),
      analysis: String(parsed.analysis || "").slice(0, 1500),
      recommendation: String(parsed.recommendation || "").slice(0, 600),
      is_mock: false,
    };
  } catch (err) {
    console.error("[bcs-vision] AI fail, returning mock:", err);
    return mockResult(params.species);
  }
}

/** Auto-flag vet review when AI uncertain or score extreme. */
export function needsVetReview(score: number, confidence: number, isMock: boolean): boolean {
  if (isMock) return true;
  if (confidence < 70) return true;
  if (score <= 2 || score >= 7) return true;
  return false;
}

// ================================================================
// CRUD
// ================================================================

export interface CreateAssessmentInput {
  petId: number;
  sidePhotoKey: string;
  sidePhotoUrl: string;
  topPhotoKey: string;
  topPhotoUrl: string;
  result: AssessResult;
}

export async function createAssessment(input: CreateAssessmentInput): Promise<BcsApi> {
  const needsReview = needsVetReview(input.result.bcs_score, input.result.confidence, input.result.is_mock);
  const row = await createRow<BcsRow>("bcs_assessments", {
    pet_id: [input.petId],
    side_photo_key: input.sidePhotoKey,
    side_photo_url: input.sidePhotoUrl,
    top_photo_key: input.topPhotoKey,
    top_photo_url: input.topPhotoUrl,
    bcs_score: input.result.bcs_score,
    bcs_category: input.result.bcs_category,
    ai_analysis: input.result.analysis,
    ai_confidence: input.result.confidence,
    recommended_action: input.result.recommendation,
    needs_vet_review: needsReview,
    assessed_at: new Date().toISOString(),
    is_mock: input.result.is_mock,
  });
  return toApi(row);
}

export async function listAssessments(petId: number): Promise<BcsApi[]> {
  const res = await listRows<BcsRow>("bcs_assessments", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 100,
    orderBy: "-assessed_at",
  });
  return res.results.filter((r) => r.bcs_score).map(toApi);
}

export async function getAssessment(assessId: number): Promise<BcsApi | null> {
  try {
    const row = await getRow<BcsRow>("bcs_assessments", assessId);
    return toApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function getLatest(petId: number): Promise<BcsApi | null> {
  return (await listAssessments(petId))[0] || null;
}

export async function deleteAssessment(assessId: number): Promise<void> {
  const { deleteRow } = await import("@shared/baserow.ts");
  await deleteRow("bcs_assessments", assessId);
}
