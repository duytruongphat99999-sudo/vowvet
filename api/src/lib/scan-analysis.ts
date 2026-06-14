/**
 * Scan analysis builder (SAU-SCAN pha 4 — pass 2 "phân tích wow" cá nhân hoá).
 *
 * Gemini TEXT-ONLY (KHÔNG gửi ảnh): nhận OCR đã đọc sẵn + verdict pass 1 + profile bé
 * → bài phân tích giọng "bác sĩ thú y gia đình tinh tế" (score/kết luận/kịch bản/
 * soi thành phần/bí kíp/kinh tế/theo dõi).
 *
 * AN TOÀN LÀ TRÊN HẾT:
 *  - validateAnalysis TRONG CODE chặn LLM vượt rào: bệnh nền/dính dị ứng mà chấm score,
 *    chữ cấm "phù hợp/an toàn/…" khi bệnh nền (mirror rule scan-verdict 8cb7530), schema sai.
 *  - INVALID / call fail → trả null (fail-soft): route bỏ key `analysis`, widget rơi về
 *    verdict template — verdict pass 1 LÀ fallback, không bao giờ mất.
 *  - REST + retry pattern 8b7280b (food-label-vision không export helper → copy pattern).
 *  - KHÔNG gọi Baserow. KHÔNG tính DER. KHÔNG log GEMINI_API_KEY (key qua header).
 */
import type { FoodLabelOcr } from "./food-label-vision.ts";
import type { ScanVerdict, ScanPetProfile } from "./scan-verdict.ts";
import type { KbWarning } from "./kb-warnings.ts";
import { HEALTH_CONDITIONS } from "@shared/health-conditions.ts";

export interface ScanAnalysis {
  score: number | null; // 0-10 bước 0.5 — CHỈ pet khoẻ + không dính dị ứng; ngược lại null
  conclusion: { title: string; body: string };
  scenarios: { title: string; detail: string }[];
  insights: { term: string; plain: string }[];
  tips: string[];
  economy: { estimate: string; basis: string } | null;
  watch: { normal: string; abnormal: string };
}

export interface ScanAnalysisInput {
  ocr: FoodLabelOcr;
  verdict: ScanVerdict;
  profile: ScanPetProfile;
  /** verdict.flags.allergens — label VN các allergen ĐÃ match trên nhãn (route truyền vào, không query mới). */
  allergenHits: string[];
  /** KB cảnh báo nguy hiểm vet-approved đã match (kb-warnings.ts) — LLM diễn giải, KHÔNG tự thêm/bớt. */
  kbWarnings?: KbWarning[];
}

// ============================================================
// Helpers (pattern scan-verdict — copy vì file đó READ ONLY)
// ============================================================

/** lowercase + bỏ dấu tiếng Việt (khớp chữ cấm viết không dấu). */
function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** Nhãn tuổi thô từ dob — chỉ để xưng hô trong prompt, KHÔNG dùng tính toán. */
function ageLabel(dob: string | null): string | null {
  if (!dob) return null;
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return null;
  const months = Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 12) return `~${months} tháng`;
  return `~${Math.floor(months / 12)} tuổi`;
}

// ============================================================
// Gemini REST text-only + retry (pattern 8b7280b)
// ============================================================

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const ATTEMPT_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [1_000]; // backoff giữa attempt 1→2

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiCall =
  | { ok: true; finishReason: string | null; text: string }
  | { ok: false; retryable: boolean; detail: string };

async function callGeminiTextOnce(apiKey: string, prompt: string): Promise<GeminiCall> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 3072,
      temperature: 0.4,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 1024 }, // pass này CẦN reasoning (khác pass OCR budget 0)
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

// ============================================================
// Prompt
// ============================================================

function buildPrompt(input: ScanAnalysisInput): string {
  const { ocr, verdict, profile, allergenHits } = input;
  const kbWarnings = input.kbWarnings || [];
  const conditionLabels = profile.conditions.map(
    (c) => HEALTH_CONDITIONS.find((d) => d.code === c.code)?.label || c.code,
  );
  const data = {
    be: {
      ten: profile.name,
      loai: profile.speciesVi || (profile.speciesEn === "cat" ? "Mèo" : profile.speciesEn === "dog" ? "Chó" : null),
      tuoi: ageLabel(profile.dob),
      giai_doan: profile.lifeStage,
      can_nang_kg: profile.weightKg,
      van_dong: profile.activity,
      benh_nen: conditionLabels,
      di_ung_da_khai: profile.allergens,
    },
    san_pham: {
      product_type: ocr.product_type,
      loai_phan_loai: verdict.category.label,
      chac_chan_loai: verdict.category.confident,
      brand: ocr.brand_name,
      dong: ocr.product_line,
      so_tren_nhan: {
        protein_pct: ocr.protein_pct,
        fat_pct: ocr.fat_pct,
        fiber_pct: ocr.fiber_pct,
        moisture_pct: ocr.moisture_pct,
        calories_per_100g: ocr.calories_per_100g,
      },
      raw_text_nhan: ocr.raw_text,
    },
    canh_bao_di_ung_tren_nhan: allergenHits, // allergen bé khai TRÙNG với chữ đọc được trên nhãn
    // KB nguy hiểm do BÁC SĨ THÚ Y duyệt — ĐÃ XÁC NHẬN match trên nhãn này, là SỰ THẬT không bàn cãi
    canh_bao_nguy_hiem_vet_approved: kbWarnings.map((w) => ({
      chat: w.substance,
      muc_do: w.severity,
      co_che: w.summary,
      hanh_dong: w.action,
    })),
    nhan_dinh_co_san: { headline: verdict.headline, lines: verdict.lines }, // pass 1 đã soi đạm/béo/calo
  };

  return (
    `Bạn là bác sĩ thú y gia đình tinh tế của VowVet — ấm áp, gần gũi, chuyên môn chắc, KHÔNG sến, KHÔNG dùng emoji.\n` +
    `Người đọc là "con sen" (chủ nuôi); thú cưng gọi là "bé ${profile.name}".\n` +
    `Nhiệm vụ: từ DỮ LIỆU bên dưới (nhãn đã OCR sẵn + hồ sơ bé), viết bài phân tích cá nhân hoá, dễ hiểu, trung thực.\n\n` +
    `DỮ LIỆU (JSON):\n${JSON.stringify(data)}\n\n` +
    `LUẬT SẮT (vi phạm = bài bị loại bởi máy kiểm duyệt):\n` +
    `1. score: chấm 0-10 (bước 0.5) mức đáng dùng cho CHÍNH bé này — CHỈ khi benh_nen RỖNG VÀ canh_bao_di_ung_tren_nhan RỖNG. ` +
    `Nếu bé có bệnh nền HOẶC có cảnh báo dị ứng → score: null (BẮT BUỘC).\n` +
    `2. Bé có bệnh nền → TUYỆT ĐỐI KHÔNG viết "phù hợp", "an toàn", "tốt cho", "hợp với", "tốt với", "nên dùng", "rất hợp" về sản phẩm; ` +
    `chỉ nêu DỮ KIỆN trung tính + kết luận đẩy về "hỏi bác sĩ thú y trước khi dùng".\n` +
    `3. insights: giải nghĩa thuật ngữ in trên nhãn (CFU, prebiotic, probiotic, taurine, by-product, guaranteed analysis…) ra lời đời thường, MÔ TẢ TRUNG TÍNH — nói thành phần đó LÀ gì / LÀM gì, KHÔNG phán giá trị. ` +
    `CẤM giọng khuyến nghị: không "tốt cho", "nên", "quan trọng với", "đủ/thiếu", "đặc biệt cần thiết/quan trọng với…". ` +
    `Ẩn dụ ĐƯỢC PHÉP, nhưng CẤM bịa quy đổi số, CẤM nêu bất kỳ con số nào KHÔNG in trên nhãn.\n` +
    `4. tips: CHỈ kiến thức chăm sóc phổ quát đã thành chuẩn (vd men vi sinh: không trộn vào đồ ăn/nước >40°C, cho cách kháng sinh ≥2 tiếng, ` +
    `bảo quản nơi khô mát; thức ăn mới: chuyển dần 7-10 ngày). Tương tác thuốc cụ thể → KHÔNG bịa, ghi "hỏi bác sĩ thú y".\n` +
    `5. economy: CHỈ điền khi raw_text_nhan có ĐỦ khối lượng tịnh VÀ liều dùng mỗi lần; "basis" PHẢI nêu rõ 2 số gốc đó + chữ "ước tính". ` +
    `Thiếu một trong hai số → economy: null.\n` +
    `6. scenarios: nếu là supplement → 2-4 kịch bản đời thường "khi nào nên dùng/mở hũ này"; nếu là food/treat → so đạm/béo/calo với nhu cầu bé ` +
    `bằng cách DIỄN GIẢI LẠI nhan_dinh_co_san.lines, TUYỆT ĐỐI không tự tính số mới.\n` +
    `7. watch.normal = dấu hiệu bình thường những ngày đầu dùng; watch.abnormal = dấu hiệu bất thường, LUÔN kết bằng: ngưng dùng + đưa bé đi gặp bác sĩ thú y.\n` +
    `8. Tiếng Việt, mỗi mục ngắn gọn; conclusion.body tối đa 1000 ký tự; mọi giá trị string KHÔNG chứa markdown.\n` +
    `9. canh_bao_nguy_hiem_vet_approved (nếu CÓ phần tử): đây là cảnh báo do BÁC SĨ THÚ Y duyệt, ĐÃ match trên nhãn — ` +
    `BẮT BUỘC: score: null; conclusion mở đầu bằng cảnh báo này (diễn giải lại co_che + hanh_dong cho dễ hiểu, KHÔNG giảm nhẹ); ` +
    `TUYỆT ĐỐI KHÔNG khuyên dùng sản phẩm; KHÔNG tự thêm chất nguy hiểm ngoài danh sách, KHÔNG bỏ bớt cảnh báo nào.\n\n` +
    `Trả JSON THUẦN (không markdown, không code fence):\n` +
    `{"score":<number|null>,"conclusion":{"title":<string>,"body":<string>},` +
    `"scenarios":[{"title":<string>,"detail":<string>}],` +
    `"insights":[{"term":<string>,"plain":<string>}],` +
    `"tips":[<string>],` +
    `"economy":{"estimate":<string>,"basis":<string>} hoặc null,` +
    `"watch":{"normal":<string>,"abnormal":<string>}}`
  );
}

// ============================================================
// Validator (TRONG CODE — chốt chặn cuối, không tin LLM)
// ============================================================

// Cụm cấm khi BỆNH NỀN, viết KHÔNG DẤU (chạy trên norm()). KHÔNG bắt "tot" trần
// → "tốt nhất nên hỏi bác sĩ" không false-positive. Hướng sai vẫn an toàn: rớt về template.
const FORBIDDEN_WHEN_SICK = [
  "phu hop", "an toan", "nen dung", "rat hop", "hop voi", "tot cho", "tot voi",
  "san pham tot", "lua chon tot",
];

function isNonEmptyStr(v: any): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export type ValidateResult = { ok: true; value: ScanAnalysis } | { ok: false; reason: string };

/**
 * Validate + coerce output LLM. INVALID → route bỏ analysis, widget rơi về verdict template.
 * economy sai luật → soft-coerce về null (KHÔNG đánh rớt cả bài).
 * @param rawText — raw_text nhãn (ocr.raw_text): MỌI số trong economy.basis phải có mặt ở đây,
 *                  chống LLM tự suy số ("thường 1 muỗng/ngày" → "30 ngày" bịa).
 * @param kbDanger — true khi KB vet-approved match fatal/severe: quét chữ cấm như pet bệnh nền
 *                   (LLM bỏ rule 9 viết "nên dùng/an toàn" dưới box đỏ → INVALID, rơi về fallback).
 */
export function validateAnalysis(
  raw: any,
  profile: ScanPetProfile,
  allergenHits: string[],
  rawText: string | null = null,
  kbDanger = false,
): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };

  // conclusion bắt buộc
  if (!raw.conclusion || !isNonEmptyStr(raw.conclusion.title) || !isNonEmptyStr(raw.conclusion.body)) {
    return { ok: false, reason: "conclusion_missing" };
  }
  if (raw.conclusion.body.length > 1200) return { ok: false, reason: "body_too_long" };

  // scenarios bắt buộc ≥1, đúng shape
  if (!Array.isArray(raw.scenarios) || raw.scenarios.length < 1) return { ok: false, reason: "scenarios_missing" };
  for (const s of raw.scenarios) {
    if (!s || !isNonEmptyStr(s.title) || !isNonEmptyStr(s.detail)) return { ok: false, reason: "scenario_shape" };
  }

  // insights / tips: bắt buộc là mảng đúng shape (rỗng chấp nhận — nhãn ít thuật ngữ)
  if (!Array.isArray(raw.insights)) return { ok: false, reason: "insights_missing" };
  for (const it of raw.insights) {
    if (!it || !isNonEmptyStr(it.term) || !isNonEmptyStr(it.plain)) return { ok: false, reason: "insight_shape" };
  }
  if (!Array.isArray(raw.tips)) return { ok: false, reason: "tips_missing" };
  for (const t of raw.tips) if (!isNonEmptyStr(t)) return { ok: false, reason: "tip_shape" };

  // watch bắt buộc
  if (!raw.watch || !isNonEmptyStr(raw.watch.normal) || !isNonEmptyStr(raw.watch.abnormal)) {
    return { ok: false, reason: "watch_missing" };
  }

  // score: null hoặc 0-10 bước 0.5
  let score: number | null = null;
  if (raw.score !== null && raw.score !== undefined) {
    const n = Number(raw.score);
    if (!Number.isFinite(n) || n < 0 || n > 10 || Math.round(n * 2) !== n * 2) {
      return { ok: false, reason: "score_shape" };
    }
    score = n;
  }

  const sick = profile.conditions.length > 0;
  const allergic = allergenHits.length > 0;
  // (a) bệnh nền / dính dị ứng mà vẫn chấm điểm → INVALID
  if ((sick || allergic) && score !== null) return { ok: false, reason: "score_not_null_for_risky_pet" };

  // (b) chữ cấm khi bệnh nền HOẶC KB danger fatal/severe — quét toàn bộ text LLM sinh
  // (mirror rule verdict 8cb7530; kbDanger: "nên dùng" dưới box đỏ = mâu thuẫn an toàn).
  if (sick || kbDanger) {
    const allText = norm(
      [
        raw.conclusion.title, raw.conclusion.body,
        ...raw.scenarios.flatMap((s: any) => [s.title, s.detail]),
        ...raw.insights.flatMap((it: any) => [it.term, it.plain]),
        ...raw.tips,
        raw.watch.normal, raw.watch.abnormal,
        raw.economy?.estimate, raw.economy?.basis,
      ].filter(Boolean).join(" "),
    );
    for (const phrase of FORBIDDEN_WHEN_SICK) {
      if (allText.includes(phrase)) return { ok: false, reason: `forbidden_word:${phrase}` };
    }
  }

  // economy: soft-coerce null nếu thiếu estimate/basis, basis không đủ 2 số gốc, thiếu chữ "ước tính",
  // HOẶC basis chứa số KHÔNG in trên nhãn (so theo giá trị numeric — "5.0" khớp "5", "," khớp ".").
  let economy: ScanAnalysis["economy"] = null;
  if (raw.economy && typeof raw.economy === "object") {
    const est = raw.economy.estimate, bas = raw.economy.basis;
    const basNums = isNonEmptyStr(bas) ? (bas.match(/\d+(?:[.,]\d+)?/g) || []) : [];
    const labelNums = new Set(
      ((rawText || "").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(",", "."))),
    );
    const allNumsOnLabel = basNums.length >= 2 && basNums.every((n) => labelNums.has(Number(n.replace(",", "."))));
    const hasUocTinh = norm(`${est || ""} ${bas || ""}`).includes("uoc tinh");
    if (isNonEmptyStr(est) && isNonEmptyStr(bas) && allNumsOnLabel && hasUocTinh) {
      economy = { estimate: est.trim(), basis: bas.trim() };
    }
  }

  return {
    ok: true,
    value: {
      score,
      conclusion: { title: raw.conclusion.title.trim(), body: raw.conclusion.body.trim() },
      scenarios: raw.scenarios.map((s: any) => ({ title: s.title.trim(), detail: s.detail.trim() })),
      insights: raw.insights.map((it: any) => ({ term: it.term.trim(), plain: it.plain.trim() })),
      tips: raw.tips.map((t: any) => t.trim()),
      economy,
      watch: { normal: raw.watch.normal.trim(), abnormal: raw.watch.abnormal.trim() },
    },
  };
}

// ============================================================
// Builder
// ============================================================

/**
 * Pass 2 phân tích wow. Trả null khi LLM fail / output INVALID — route bỏ key analysis,
 * verdict pass 1 vẫn nguyên (fallback). KHÔNG BAO GIỜ throw.
 */
export async function buildScanAnalysis(input: ScanAnalysisInput): Promise<ScanAnalysis | null> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  if (!GEMINI_API_KEY) {
    console.error("[scan-analysis] GEMINI_API_KEY missing → skip pass 2");
    return null;
  }

  try {
    const prompt = buildPrompt(input);

    let call: Extract<GeminiCall, { ok: true }> | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await sleep(RETRY_DELAYS_MS[attempt - 2]);
      const r = await callGeminiTextOnce(GEMINI_API_KEY, prompt);
      if (r.ok) {
        call = r;
        break;
      }
      console.error(`[scan-analysis] Gemini attempt ${attempt}/${MAX_ATTEMPTS} fail (retryable=${r.retryable}):`, r.detail);
      if (!r.retryable) break;
    }
    if (!call) return null;

    if (call.finishReason === "MAX_TOKENS") {
      console.error("[scan-analysis] finishReason=MAX_TOKENS — output bị cắt → skip");
      return null;
    }

    const cleaned = call.text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]+\}/);
      if (!m) {
        console.error(`[scan-analysis] no JSON in response (finishReason=${call.finishReason}):`, cleaned.slice(0, 500));
        return null;
      }
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        console.error("[scan-analysis] JSON parse fail:", cleaned.slice(0, 500));
        return null;
      }
    }

    const kbDanger = (input.kbWarnings || []).some((w) => w.severity === "fatal" || w.severity === "severe");
    const v = validateAnalysis(parsed, input.profile, input.allergenHits, input.ocr.raw_text, kbDanger);
    if (!v.ok) {
      console.error(`[scan-analysis] validator INVALID (${v.reason}) → fallback verdict template`);
      return null;
    }
    // CÓ BẤT KỲ KB warning nào (kể cả caution) → score ÉP null TRONG CODE — khớp prompt rule 9,
    // coerce chứ KHÔNG reject (LLM lỡ chấm vẫn an toàn; điểm số cạnh box cảnh báo = phản UX).
    if ((input.kbWarnings || []).length > 0) {
      v.value.score = null;
    }
    return v.value;
  } catch (err) {
    console.error("[scan-analysis] unexpected fail:", String((err as any)?.message || err).slice(0, 300));
    return null;
  }
}
