/**
 * Symptom triage engine (M9.1).
 *
 * Flow:
 *   1. Validate symptom IDs vs shared/triage-symptoms.ts
 *   2. Pre-compute red_flag boolean + max_severity → đưa vào Gemini prompt làm hint
 *   3. Call Gemini 2.5 Flash với structured output (Zod-validated)
 *   4. Force urgency_level ≥ 4 nếu có red_flag (server-side override, bias an toàn)
 *   5. Save session vào Baserow
 *   6. Nếu urgency_level === 5 → trigger admin alert (push + log)
 */
import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";
import {
  getSymptom,
  validateSymptomIds,
  hasRedFlag,
  maxSeverity,
  type TriageSymptom,
} from "@shared/triage-symptoms.ts";
import {
  TriageAIResponseSchema,
  type TriageAIResponse,
  type UrgencyLevel,
} from "@shared/zod-schemas/triage.ts";
import type { BaserowPet } from "./users.ts";
import { sendPush } from "./web-push.ts";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const USAGE_LOG_PATH = process.env.GEMINI_USAGE_LOG || "/app/data/gemini-usage.log.jsonl";
const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Cost tracking — Flash pricing matching gemini.ts
const FLASH_INPUT_PER_M = 0.3;
const FLASH_OUTPUT_PER_M = 2.5;

function calculateCost(inputTokens: number, outputTokens: number): number {
  const cost = (inputTokens / 1_000_000) * FLASH_INPUT_PER_M + (outputTokens / 1_000_000) * FLASH_OUTPUT_PER_M;
  return Math.round(cost * 10_000) / 10_000;
}

async function appendUsageLog(entry: {
  ts: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  pet_id?: number;
  user_id?: number;
  feature: "triage";
}): Promise<void> {
  try {
    await mkdir(dirname(USAGE_LOG_PATH), { recursive: true });
    await appendFile(USAGE_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.error("[triage] không ghi được usage log:", err);
  }
}

// ============================================================
// Gemini AI call
// ============================================================

const SYSTEM_PROMPT = `Bạn là AI triage thú y cho VowVet (Vietnam pet healthcare).
Dựa trên danh sách triệu chứng + thời gian + thông tin pet, phân loại 5 mức urgency:

1 = Bình thường, theo dõi tại nhà — vẫn ăn uống vận động bình thường, triệu chứng nhẹ.
2 = Theo dõi 24h, ghi nhận thay đổi — có dấu hiệu nhẹ nhưng có thể tự hết.
3 = Nên gọi bác sĩ tư vấn — cần ý kiến chuyên môn, chưa cấp cứu.
4 = Cần khám trong 24h — triệu chứng đáng lo, không thể đợi.
5 = Cấp cứu ngay (trong 1-2h) — đe dọa tính mạng, cần đi clinic 24/7.

QUY TẮC:
- Bias conservative: thà false positive còn hơn miss. Khi ambiguous → level cao hơn.
- Có triệu chứng red_flag (đánh dấu trong prompt) → BẮT BUỘC level ≥ 4.
- Pet già (>10y), puppy (<6mo), giống brachycephalic (Pug/Bulldog/Persian) → +1 level từ baseline.
- Mèo đặc biệt nhạy cảm — bỏ ăn 24h+ ở mèo nguy hiểm hơn chó.
- Triệu chứng nhiều và kéo dài → level cao hơn từng triệu chứng riêng.

KHÔNG được chẩn đoán bệnh cụ thể. Chỉ phân loại urgency + đưa hướng dẫn action.

Output JSON đúng schema:
{
  "urgency_level": int 1-5,
  "reasoning_vi": "Giải thích ngắn gọn 2-4 câu vì sao level này. Tiếng Việt.",
  "recommended_action_vi": "Hướng dẫn cụ thể chủ nên làm gì. Tiếng Việt, max 3 câu."
}

Reasoning + action TIẾNG VIỆT thuần, không xen lẫn English.`;

interface TriageContext {
  pet: BaserowPet;
  symptoms: TriageSymptom[];
  durationHours: number;
  userNotes?: string | null;
}

function buildUserPrompt(ctx: TriageContext): string {
  const speciesValue = typeof ctx.pet.species === "object" ? ctx.pet.species?.value : ctx.pet.species;
  const speciesVi = speciesValue === "dog" ? "chó" : speciesValue === "cat" ? "mèo" : "thú cưng";
  const breed = ctx.pet.breed || "không rõ";
  const weight = ctx.pet.weight_kg ? `${ctx.pet.weight_kg} kg` : "chưa nhập";

  // Tính tuổi cơ bản từ dob
  let ageStr = "chưa nhập";
  if (ctx.pet.dob) {
    const dob = new Date(ctx.pet.dob);
    if (!isNaN(dob.getTime())) {
      const months = Math.floor((Date.now() - dob.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
      if (months < 12) ageStr = `${months} tháng tuổi`;
      else ageStr = `${Math.floor(months / 12)} tuổi ${months % 12 ? `${months % 12} tháng` : ""}`.trim();
    }
  }

  const symptomsList = ctx.symptoms
    .map(
      (s) =>
        `- ${s.name_vi}${s.description_vi ? ` (${s.description_vi})` : ""}` +
        ` [severity_weight=${s.severity_weight}${s.red_flag ? ", RED_FLAG=true" : ""}]`
    )
    .join("\n");

  const redFlagNote = hasRedFlag(ctx.symptoms)
    ? "\n⚠️ CHÚ Ý: Có triệu chứng đánh dấu RED_FLAG. BẮT BUỘC urgency_level ≥ 4.\n"
    : "";

  const durationVi =
    ctx.durationHours < 1
      ? "vừa xuất hiện (<1h)"
      : ctx.durationHours < 24
      ? `${ctx.durationHours} giờ`
      : `${Math.round(ctx.durationHours / 24)} ngày`;

  return `THÔNG TIN PET:
- Loài: ${speciesVi}
- Giống: ${breed}
- Tuổi: ${ageStr}
- Cân nặng: ${weight}

TRIỆU CHỨNG CHỦ QUAN SÁT (${ctx.symptoms.length} mục):
${symptomsList}
${redFlagNote}
THỜI GIAN TRIỆU CHỨNG XUẤT HIỆN: ${durationVi}
${ctx.userNotes ? `\nGHI CHÚ THÊM TỪ CHỦ:\n"${ctx.userNotes}"` : ""}

Hãy phân loại urgency_level (1-5) + reasoning + recommended_action theo schema.`;
}

interface TriageAIResult {
  ai: TriageAIResponse;
  metadata: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
}

async function callGeminiTriage(ctx: TriageContext): Promise<TriageAIResult> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY chưa cấu hình");

  const userPrompt = buildUserPrompt(ctx);
  const response: GenerateContentResponse = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          urgency_level: { type: "integer", minimum: 1, maximum: 5 },
          reasoning_vi: { type: "string" },
          recommended_action_vi: { type: "string" },
        },
        required: ["urgency_level", "reasoning_vi", "recommended_action_vi"],
      },
      temperature: 0.3, // thấp hơn care-plan (0.4) — triage cần consistent
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini trả về empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini trả JSON malformed: ${text.slice(0, 200)}`);
  }

  const ai = TriageAIResponseSchema.parse(parsed);

  const usage = response.usageMetadata;
  const input_tokens = usage?.promptTokenCount ?? 0;
  const output_tokens = usage?.candidatesTokenCount ?? 0;
  const cost_usd = calculateCost(input_tokens, output_tokens);

  return {
    ai,
    metadata: { model: "gemini-2.5-flash", input_tokens, output_tokens, cost_usd },
  };
}

// ============================================================
// Server-side safety override
// ============================================================

/**
 * Force urgency ≥ 4 nếu có red_flag.
 * AI prompt đã instructed nhưng safety net ở server-side để chắc chắn.
 */
function applyRedFlagOverride(
  symptoms: TriageSymptom[],
  aiLevel: UrgencyLevel
): { final: UrgencyLevel; overridden: boolean } {
  if (hasRedFlag(symptoms) && aiLevel < 4) {
    return { final: 4, overridden: true };
  }
  return { final: aiLevel, overridden: false };
}

// ============================================================
// Admin notification cho level 5
// ============================================================

async function notifyAdminEmergency(
  sessionId: number,
  pet: BaserowPet,
  ai: TriageAIResponse,
  symptoms: TriageSymptom[]
): Promise<void> {
  const symptomNames = symptoms.map((s) => s.name_vi).join(", ");
  console.log(
    `[TRIAGE EMERGENCY] session=${sessionId} pet=${pet.id} "${pet.name}" ` +
      `urgency=5 symptoms="${symptomNames}" admins=${ADMIN_PHONES.join(",")}`
  );

  // Push notification to admins (nếu họ subscribed)
  for (const adminPhone of ADMIN_PHONES) {
    try {
      const res = await listRows<any>("users", { filter: { phone__equal: adminPhone }, size: 1 });
      const adminUser = res.results[0];
      if (!adminUser?.push_subscription) {
        console.log(`[TRIAGE EMERGENCY] admin ${adminPhone} chưa subscribe push, skip`);
        continue;
      }
      await sendPush(
        adminUser.id,
        adminUser.push_subscription,
        {
          title: `🚨 CẤP CỨU: pet ${pet.name}`,
          body: `${symptomNames.slice(0, 100)}${symptomNames.length > 100 ? "..." : ""}`,
          data: { url: `/admin?triage_session=${sessionId}`, urgency: 5, session_id: sessionId },
        },
        { type: "alert_push", bypassRateLimit: true }
      );
      console.log(`[TRIAGE EMERGENCY] sent push to admin ${adminPhone}`);
    } catch (err) {
      console.error(`[TRIAGE EMERGENCY] failed to notify ${adminPhone}:`, err);
    }
  }
}

// ============================================================
// Public API — main entry point
// ============================================================

export interface TriageSessionRow {
  id: number;
  pet_id: number;
  symptoms_json: string[];
  duration_hours: number;
  ai_urgency_level: UrgencyLevel;
  ai_reasoning_text: string;
  ai_recommended_action: string;
  user_action_taken: string | null;
  vet_review_status: string;
  user_notes: string | null;
  user_phone: string;
  ai_cost_usd: number;
  created_at: string;
  red_flag_override: boolean;
}

export interface RunTriageInput {
  petId: number;
  pet: BaserowPet;
  symptomIds: string[];
  durationHours: number;
  userNotes?: string | null;
  userPhone: string;
  userId: number;
}

export async function runTriage(input: RunTriageInput): Promise<TriageSessionRow> {
  // 1. Validate symptoms
  const { valid: symptoms, invalid } = validateSymptomIds(input.symptomIds);
  if (invalid.length > 0) {
    const err = new Error(`Triệu chứng không hợp lệ: ${invalid.join(", ")}`);
    (err as any).status = 400;
    (err as any).code = "INVALID_SYMPTOMS";
    throw err;
  }
  if (symptoms.length === 0) {
    const err = new Error("Cần ít nhất 1 triệu chứng hợp lệ");
    (err as any).status = 400;
    (err as any).code = "NO_SYMPTOMS";
    throw err;
  }

  // 2. Call Gemini
  const { ai, metadata } = await callGeminiTriage({
    pet: input.pet,
    symptoms,
    durationHours: input.durationHours,
    userNotes: input.userNotes,
  });

  // 3. Server-side red_flag override
  const { final: finalUrgency, overridden } = applyRedFlagOverride(symptoms, ai.urgency_level);

  // 4. Log AI cost (separate feature=triage để admin lọc được)
  await appendUsageLog({
    ts: new Date().toISOString(),
    model: metadata.model,
    input_tokens: metadata.input_tokens,
    output_tokens: metadata.output_tokens,
    cost_usd: metadata.cost_usd,
    pet_id: input.petId,
    user_id: input.userId,
    feature: "triage",
  });

  // 5. Save to Baserow
  const row = await createRow<any>("triage_sessions", {
    pet_id: [input.petId],
    symptoms_json: JSON.stringify(input.symptomIds),
    duration_hours: input.durationHours,
    ai_urgency_level: finalUrgency,
    ai_reasoning_text: ai.reasoning_vi,
    ai_recommended_action: ai.recommended_action_vi,
    vet_review_status: "pending",
    user_notes: input.userNotes || null,
    user_phone: input.userPhone,
    ai_cost_usd: metadata.cost_usd,
  });

  // 6. Emergency notify (level 5)
  if (finalUrgency === 5) {
    // Fire-and-forget (don't block response)
    notifyAdminEmergency(row.id, input.pet, { ...ai, urgency_level: finalUrgency }, symptoms).catch((err) =>
      console.error("[triage] notifyAdmin failed:", err)
    );
  }

  return {
    id: row.id,
    pet_id: input.petId,
    symptoms_json: input.symptomIds,
    duration_hours: input.durationHours,
    ai_urgency_level: finalUrgency,
    ai_reasoning_text: ai.reasoning_vi,
    ai_recommended_action: ai.recommended_action_vi,
    user_action_taken: null,
    vet_review_status: "pending",
    user_notes: input.userNotes || null,
    user_phone: input.userPhone,
    ai_cost_usd: metadata.cost_usd,
    created_at: row.created_at || new Date().toISOString(),
    red_flag_override: overridden,
  };
}

// ============================================================
// History / lookup
// ============================================================

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function flatSession(r: any): TriageSessionRow {
  let symptoms: string[] = [];
  try {
    if (r.symptoms_json) {
      const parsed = JSON.parse(r.symptoms_json);
      if (Array.isArray(parsed)) symptoms = parsed.filter((x) => typeof x === "string");
    }
  } catch {}
  return {
    id: r.id,
    pet_id: Array.isArray(r.pet_id) ? r.pet_id[0]?.id || 0 : 0,
    symptoms_json: symptoms,
    duration_hours: Number(r.duration_hours) || 0,
    ai_urgency_level: Number(r.ai_urgency_level) as UrgencyLevel,
    ai_reasoning_text: r.ai_reasoning_text || "",
    ai_recommended_action: r.ai_recommended_action || "",
    user_action_taken: flatVal<string>(r.user_action_taken),
    vet_review_status: flatVal<string>(r.vet_review_status) || "pending",
    user_notes: r.user_notes || null,
    user_phone: r.user_phone || "",
    ai_cost_usd: Number(r.ai_cost_usd) || 0,
    // M9.1: migration không có created_at field. Baserow auto-set internal "Created on"
    // nhưng không expose qua user_field_names=true. Fallback id-based proxy.
    created_at: r.created_at || r["Created on"] || "",
    red_flag_override: false,
  };
}

export async function listTriageHistory(petId: number, limit = 50): Promise<TriageSessionRow[]> {
  // M9.1 migration không add created_at field — sort client-side by id desc
  // (id auto-increment nên id cao = mới hơn). TODO M9.2: add proper created_on field.
  const res = await listRows<any>("triage_sessions", {
    filter: { pet_id__link_row_has: String(petId) },
    size: limit,
  });
  const sessions = res.results.filter((r: any) => r.ai_urgency_level).map(flatSession);
  sessions.sort((a, b) => b.id - a.id);
  return sessions.slice(0, limit);
}

export async function getTriageSession(sessionId: number): Promise<TriageSessionRow | null> {
  try {
    const row = await getRow<any>("triage_sessions", sessionId);
    if (!row.ai_urgency_level) return null;
    return flatSession(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function updateUserAction(sessionId: number, action: string): Promise<void> {
  await updateRow("triage_sessions", sessionId, { user_action_taken: action });
}
