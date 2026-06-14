/**
 * Food label camera scan routes (pha 1 — backend, CHƯA UI).
 *
 * Mount: app.route("/api/v1/pets", foodScanRoute)
 *
 * Endpoint:
 *   POST /pets/:id/food/scan — multipart 1 ảnh nhãn (field "photo") → upload R2
 *                              → OCR (Gemini vision) → match food_brands.
 *
 * KHÔNG ghi Baserow. KHÔNG tính DER/dinh dưỡng — chỉ trả OCR thô + brand khớp (field đã lưu).
 * Nhãn AI hướng người dùng = "AI của VowVet" (KHÔNG lộ nhà cung cấp).
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { toApiPet } from "./pets.ts";
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import { scanFoodLabel } from "../lib/food-label-vision.ts";
import { matchFoodBrand } from "../lib/food-brand-matcher.ts";
import { checkRateLimit } from "../lib/rate-limit.ts";
import { buildScanVerdict, type ScanPetProfile } from "../lib/scan-verdict.ts";
import { buildScanAnalysis, type ScanAnalysis } from "../lib/scan-analysis.ts";
import { getKbWarnings, type KbWarning } from "../lib/kb-warnings.ts";
import { createRow } from "@shared/baserow.ts";
import { Jimp } from "jimp";

const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB (như bills)

export const foodScanRoute = new Hono();
foodScanRoute.use("*", requireAuth);

// ============================================================
// POST /pets/:id/food/scan — chụp nhãn → OCR → match food_brands
// ============================================================
foodScanRoute.post("/:id{[0-9]+}/food/scan", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  // Ownership (giữ pet để dựng profile verdict — KHÔNG fetch thêm)
  let pet: Awaited<ReturnType<typeof getOwnedPet>>;
  try {
    pet = await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  // Rate-limit per-user: 20 scan / giờ (chặn cost-abuse Gemini — vision-lib bỏ qua budget $5)
  const rl = checkRateLimit("food-scan", String(session.sub), 20, 3600);
  if (!rl.ok) {
    return c.json({ error: { code: "RATE_LIMITED", message: "Quét quá nhiều, thử lại sau", retry_after_sec: rl.retry_after_sec } }, 429);
  }

  // Multipart
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400);
  }
  const file = formData.get("photo") ?? formData.get("label_photo") ?? formData.get("image");
  if (!(file instanceof File)) {
    return c.json({ error: { code: "MISSING_PHOTO", message: "Thiếu ảnh nhãn (field 'photo')" } }, 400);
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Ảnh tối đa 10MB" } }, 413);
  }
  const ext = imageExtFromMime(file.type);
  if (!ext) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ chấp nhận JPEG/PNG/WebP" } }, 415);
  }

  try {
    // Upload R2: scans/{petId}/{timestamp}.{ext}
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Nén BẢN HIỂN THỊ cho R2: resize ≤1600px cạnh dài + JPEG q80 (ảnh phone vài MB → vài chục KB,
    // bớt tải/decode ở trang kết quả). OCR Gemini bên dưới VẪN dùng buf GỐC (nét) — KHÔNG đụng.
    // fail-soft: jimp lỗi → upload nguyên gốc, KHÔNG chặn scan.
    let uploadBytes: Uint8Array = bytes;
    let uploadMime = file.type;
    let uploadExt = ext;
    try {
      const img = await Jimp.read(Buffer.from(buf));
      const w = img.bitmap.width, h = img.bitmap.height;
      const longEdge = Math.max(w, h);
      if (longEdge > 1600) {
        const scale = 1600 / longEdge;
        img.resize({ w: Math.round(w * scale), h: Math.round(h * scale) });
      }
      const jpeg = await img.getBuffer("image/jpeg", { quality: 80 });
      uploadBytes = new Uint8Array(jpeg);
      uploadMime = "image/jpeg";
      uploadExt = "jpg";
    } catch (err) {
      console.warn("[food/scan] resize fail-soft, upload original:", String((err as any)?.message || err).slice(0, 120));
    }
    const key = `scans/${petId}/${Date.now()}.${uploadExt}`;
    const scanUrl = await uploadObject(key, uploadBytes, uploadMime);

    // OCR nhãn (Gemini vision) — base64 từ buf GỐC (KHÔNG nén, để đọc chữ nét); {ocr, failReason} phân biệt AI bận vs ảnh mờ
    const imageBase64 = Buffer.from(buf).toString("base64");
    const { ocr, failReason } = await scanFoodLabel({ imageBase64, mimeType: file.type });

    if (!ocr) {
      const aiBusy = failReason === "model_error";
      return c.json({
        scan_url: scanUrl,
        ocr: null,
        match: { matched: false, brand: null, confidence: 0, candidates: [] },
        fail_reason: aiBusy ? "ai_busy" : "unreadable",
        message: aiBusy
          ? "AI của VowVet đang quá tải, không phải do ảnh — thử lại sau ít phút nha."
          : "AI của VowVet chưa đọc được nhãn — chụp lại rõ phần thành phần/bao bì, đủ sáng, không loá.",
      });
    }

    // Match food_brands (CHỈ ĐỌC)
    const match = await matchFoodBrand(ocr.brand_name, ocr.product_line);

    // Carb TỪ NHÃN (độc lập DER engine). ash 7% = HẰNG ước (OCR chưa lấy ash) → ash_estimated=true.
    const P = ocr?.protein_pct, F = ocr?.fat_pct, FB = ocr?.fiber_pct, M = ocr?.moisture_pct;
    let ash_pct: number | null = null, ash_estimated = false, carb_pct: number | null = null;
    if (P != null && F != null) {
      if ((ocr as any)?.ash_pct != null) { ash_pct = (ocr as any).ash_pct; }
      else { ash_pct = 7; ash_estimated = true; }
      carb_pct = Math.max(0, Math.round((100 - P - F - (FB || 0) - (M || 0) - ash_pct) * 10) / 10);
    }

    // Persist scan_logs — fire-and-forget (lỗi ghi KHÔNG làm fail scan; pattern community-feed).
    // KHÔNG await: ghi Baserow ~1.3s không được chặn response scan (đã đốt ~20s Gemini).
    createRow("scan_logs", {
      user_id: Number(session.sub),
      pet_id: [Number(petId)],
      scan_url: scanUrl,
      brand_name: ocr?.brand_name ?? null,
      product_line: ocr?.product_line ?? null,
      species: ocr?.species ?? null,
      life_stage: ocr?.life_stage ?? null,
      protein_pct: P ?? null,
      fat_pct: F ?? null,
      fiber_pct: FB ?? null,
      moisture_pct: M ?? null,
      ash_pct,
      carb_pct,
      calories_per_100g: ocr?.calories_per_100g ?? null,
      match_confidence: match?.confidence ?? null,
      matched_brand_id: match?.brand?.brand_id ?? null,
      ash_estimated,
      created_at: new Date().toISOString(),
    }).catch((err) => {
      console.warn("[food/scan] persist scan_logs fail-soft:", String((err as any)?.message || err).slice(0, 120));
    });

    // Verdict cá nhân hoá theo profile bé (KHÔNG sửa số/công thức — chỉ ĐỌC).
    const ap = toApiPet(pet);
    const speciesVi = (ap.species as string) || null;
    const profile: ScanPetProfile = {
      name: ap.name || "bé",
      speciesEn: speciesVi === "Mèo" ? "cat" : speciesVi === "Chó" ? "dog" : null,
      speciesVi,
      dob: ap.dob || null,
      lifeStage: ap.life_stage || null,
      weightKg: ap.weight_kg != null ? Number(ap.weight_kg) : null,
      activity: ap.activity_level || null,
      allergens: [...(ap.allergens || []), ...(ap.sensitivities || [])],
      conditions: (ap.health_conditions || []).filter((cnd: any) => cnd && cnd.status !== "resolved"),
    };
    const verdict = buildScanVerdict({ petId, ocr, match, carb_pct, profile });

    // KB cảnh báo nguy hiểm (vet-approved, danger_kb) — ĐỘC LẬP verdict/analysis, fail-soft [].
    // Tính CẢ khi non_food (case quét hộp thuốc người: Rowatinex/paracetamol — cảnh báo càng phải hiện).
    let kbWarnings: KbWarning[] = [];
    try {
      kbWarnings = await getKbWarnings({
        rawText: ocr.raw_text ?? null,
        rawIngredients: ocr.raw_ingredients ?? null,
        brand: ocr.brand_name ?? null,
        productLine: ocr.product_line ?? null,
        petSpecies: profile.speciesEn,
      });
    } catch (err) {
      console.error("[food/scan] kb-warnings fail-soft:", String((err as any)?.message || err).slice(0, 120));
    }

    // Pass 2 "phân tích wow" (LLM text-only) — fail-soft: null → response KHÔNG có key analysis,
    // widget tự rơi về verdict template. Skip non_food/unknown (không có gì để phân tích).
    let analysis: ScanAnalysis | null = null;
    const vType = verdict?.category?.type;
    if (verdict && (vType === "complete" || vType === "supplement" || vType === "treat")) {
      analysis = await buildScanAnalysis({ ocr, verdict, profile, allergenHits: verdict.flags.allergens, kbWarnings });
    }

    // profile slim cho FE chấm "độ khớp hồ sơ" rule-based (ScanResultCard + vet-flags) — CHỈ ĐỌC, KHÔNG tính số.
    const profileOut = {
      name: profile.name,
      speciesEn: profile.speciesEn,
      speciesVi: profile.speciesVi,
      lifeStage: profile.lifeStage,
      dob: profile.dob,
      weightKg: profile.weightKg,
    };

    return c.json({ scan_url: scanUrl, ocr, match, carb_pct, ash_estimated, verdict, kb_warnings: kbWarnings, profile: profileOut, ...(analysis ? { analysis } : {}) });
  } catch (err: any) {
    console.error("[food/scan] error:", err);
    return c.json({ error: { code: "SCAN_FAILED", message: "Quét nhãn thất bại, thử lại sau" } }, 500);
  }
});
