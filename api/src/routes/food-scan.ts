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
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import { scanFoodLabel } from "../lib/food-label-vision.ts";
import { matchFoodBrand } from "../lib/food-brand-matcher.ts";
import { checkRateLimit } from "../lib/rate-limit.ts";
import { createRow } from "@shared/baserow.ts";

const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB (như bills)

export const foodScanRoute = new Hono();
foodScanRoute.use("*", requireAuth);

// ============================================================
// POST /pets/:id/food/scan — chụp nhãn → OCR → match food_brands
// ============================================================
foodScanRoute.post("/:id{[0-9]+}/food/scan", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  // Ownership
  try {
    await getOwnedPet(petId, session.sub);
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
    const key = `scans/${petId}/${Date.now()}.${ext}`;
    const scanUrl = await uploadObject(key, bytes, file.type);

    // OCR nhãn (Gemini vision) — base64 trực tiếp từ bytes; null nếu không đọc được
    const imageBase64 = Buffer.from(buf).toString("base64");
    const ocr = await scanFoodLabel({ imageBase64, mimeType: file.type });

    if (!ocr) {
      return c.json({
        scan_url: scanUrl,
        ocr: null,
        match: { matched: false, brand: null, confidence: 0, candidates: [] },
        message: "AI của VowVet chưa đọc được nhãn. Thử lại với ảnh rõ nét, đủ sáng, thấy bảng thành phần.",
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
    try {
      await createRow("scan_logs", {
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
      });
    } catch (err) {
      console.warn("[food/scan] persist scan_logs fail-soft:", String((err as any)?.message || err).slice(0, 120));
    }

    return c.json({ scan_url: scanUrl, ocr, match, carb_pct, ash_estimated });
  } catch (err: any) {
    console.error("[food/scan] error:", err);
    return c.json({ error: { code: "SCAN_FAILED", message: "Quét nhãn thất bại, thử lại sau" } }, 500);
  }
});
