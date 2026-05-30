/**
 * Gemini client wrapper:
 * - generateCarePlan(prompt, model) → trả {plan, metadata} với cost tracking
 * - Append JSONL log mỗi call vào /app/data/gemini-usage.log.jsonl
 * - Daily budget alert > $5 → console.warn
 *
 * Pricing (approximation as of 2025, may shift):
 *   gemini-2.5-flash: $0.30 / 1M input, $2.50 / 1M output
 *   gemini-2.5-pro:   $1.25 / 1M input, $10.00 / 1M output
 */
import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { CarePlanContent, type CarePlanContentType } from "@shared/care-plan-types.ts";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const USAGE_LOG_PATH = process.env.GEMINI_USAGE_LOG || "/app/data/gemini-usage.log.jsonl";
const DAILY_BUDGET_USD = Number(process.env.GEMINI_DAILY_BUDGET_USD || "5");

if (!GEMINI_API_KEY) {
  console.warn("[gemini] GEMINI_API_KEY chưa cấu hình — sẽ fail khi gọi API");
}

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro";

interface PricePerMTok {
  input: number;
  output: number;
}
const PRICING: Record<GeminiModel, PricePerMTok> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
};

function calculateCost(model: GeminiModel, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  const cost = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return Math.round(cost * 10_000) / 10_000; // 4 chữ số sau dấu phẩy
}

interface UsageLogEntry {
  ts: string; // ISO timestamp
  model: GeminiModel;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  pet_id?: number;
  user_id?: number;
}

async function appendUsageLog(entry: UsageLogEntry): Promise<void> {
  try {
    await mkdir(dirname(USAGE_LOG_PATH), { recursive: true });
    await appendFile(USAGE_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.error("[gemini] không ghi được usage log:", err);
  }
}

/** Sum cost_usd hôm nay từ JSONL. Trả 0 nếu log trống/không tồn tại. */
export async function getTodayCostUsd(): Promise<number> {
  try {
    const content = await readFile(USAGE_LOG_PATH, "utf-8");
    const today = new Date().toISOString().slice(0, 10);
    let total = 0;
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as UsageLogEntry;
        if (e.ts.startsWith(today)) total += e.cost_usd || 0;
      } catch {
        // skip malformed line
      }
    }
    return Math.round(total * 10_000) / 10_000;
  } catch {
    return 0;
  }
}

/** Kiểm tra + log budget alert (chỉ console.warn, không block per spec). */
async function checkBudgetAlert(currentCost: number, justAddedCost: number): Promise<void> {
  if (currentCost > DAILY_BUDGET_USD) {
    console.warn(
      `[gemini] ⚠️ BUDGET ALERT: hôm nay đã chi $${currentCost.toFixed(4)} (vừa thêm $${justAddedCost.toFixed(
        4
      )}). Vượt threshold $${DAILY_BUDGET_USD}.`
    );
  }
}

export interface GeminiCallResult {
  plan: CarePlanContentType;
  metadata: {
    model: GeminiModel;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
}

/**
 * Gọi Gemini sinh care plan. Schema-enforced output (JSON mode).
 * Tự log usage + budget alert.
 *
 * Throws nếu output không validate Zod (caller catch + retry hoặc trả error).
 *
 * Resilience: nếu Pro fail 429 (quota / free-tier limit) → tự fallback Flash.
 * metadata.model sẽ phản ánh model ACTUAL đã chạy (không phải intent ban đầu).
 */
export async function generateCarePlan(
  systemPrompt: string,
  userPrompt: string,
  model: GeminiModel,
  context: { pet_id?: number; user_id?: number } = {}
): Promise<GeminiCallResult> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY chưa cấu hình");

  try {
    return await invokeGemini(systemPrompt, userPrompt, model, context);
  } catch (err: any) {
    const status = err?.status || err?.error?.code;
    const isQuota = status === 429 || /quota|rate.limit|RESOURCE_EXHAUSTED/i.test(err?.message || "");
    if (model === "gemini-2.5-pro" && isQuota) {
      console.warn(
        `[gemini] Pro quota exceeded → fallback sang Flash. Để tránh, nâng cấp Gemini API plan: https://ai.google.dev/pricing`
      );
      return await invokeGemini(systemPrompt, userPrompt, "gemini-2.5-flash", context);
    }
    throw err;
  }
}

async function invokeGemini(
  systemPrompt: string,
  userPrompt: string,
  model: GeminiModel,
  context: { pet_id?: number; user_id?: number }
): Promise<GeminiCallResult> {
  const response: GenerateContentResponse = await genai.models.generateContent({
    model,
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      // Schema enforce: Gemini sẽ trả strict JSON match shape này
      responseSchema: {
        type: "object",
        properties: {
          urgency_level: {
            type: "string",
            enum: ["normal", "monitor", "consult", "urgent", "emergency"],
          },
          summary: { type: "string" },
          concerns: { type: "array", items: { type: "string" } },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                icon: { type: "string" },
                title: { type: "string" },
                advice: { type: "string" },
              },
              required: ["icon", "title", "advice"],
            },
          },
          alerts: { type: "array", items: { type: "string" } },
        },
        required: ["urgency_level", "summary", "concerns", "recommendations", "alerts"],
      },
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini trả về empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini trả JSON malformed: ${text.slice(0, 200)}`);
  }

  let plan: CarePlanContentType;
  try {
    plan = CarePlanContent.parse(parsed);
  } catch (err) {
    const z = err as z.ZodError;
    throw new Error(`Gemini output không pass Zod: ${JSON.stringify(z.issues)}`);
  }

  const usage = response.usageMetadata;
  const input_tokens = usage?.promptTokenCount ?? 0;
  const output_tokens = usage?.candidatesTokenCount ?? 0;
  const cost_usd = calculateCost(model, input_tokens, output_tokens);

  // Log + budget check
  await appendUsageLog({
    ts: new Date().toISOString(),
    model,
    input_tokens,
    output_tokens,
    cost_usd,
    ...context,
  });
  const todayCost = await getTodayCostUsd();
  await checkBudgetAlert(todayCost, cost_usd);

  return {
    plan,
    metadata: { model, input_tokens, output_tokens, cost_usd },
  };
}
