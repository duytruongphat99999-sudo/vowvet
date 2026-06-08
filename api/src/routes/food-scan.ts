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

    return c.json({ scan_url: scanUrl, ocr, match });
  } catch (err: any) {
    console.error("[food/scan] error:", err);
    return c.json({ error: { code: "SCAN_FAILED", message: "Quét nhãn thất bại, thử lại sau" } }, 500);
  }
});
