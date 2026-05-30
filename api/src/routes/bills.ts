/**
 * Vet Bill Tracker routes (M16).
 *
 * Mount: app.route("/api/v1/pets", petBillsRoute)
 *
 * Endpoints:
 *   POST /pets/:id/bills/upload     — upload ảnh → OCR → trả pre-filled data
 *   GET  /pets/:id/bills            — list bills của pet
 *   POST /pets/:id/bills            — tạo bill (sau khi user confirm)
 *   PUT  /pets/:id/bills/:bid       — update (verify, correct OCR errors)
 *   DELETE /pets/:id/bills/:bid     — xóa bill
 *   GET  /pets/:id/bills/summary    — spending summary
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  listBills,
  createBill,
  updateBill,
  deleteBill,
  getSpendingSummary,
  ocrBillImage,
  toBillApi,
  type BillApi,
} from "../lib/bills.ts";
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import { getRow } from "@shared/baserow.ts";

const MAX_BILL_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB (hoá đơn có thể chụp phân giải cao)

export const petBillsRoute = new Hono();
petBillsRoute.use("*", requireAuth);

// ============================================================
// GET /pets/:id/bills
// ============================================================
petBillsRoute.get("/:id{[0-9]+}/bills", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const bills = await listBills(petId);
    return c.json({ bills, total: bills.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[bills/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load bills" } }, 500);
  }
});

// ============================================================
// GET /pets/:id/bills/summary
// ============================================================
petBillsRoute.get("/:id{[0-9]+}/bills/summary", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const summary = await getSpendingSummary(petId);
    return c.json(summary);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[bills/summary] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load summary" } }, 500);
  }
});

// ============================================================
// POST /pets/:id/bills/upload — upload ảnh + OCR, không lưu bill
// ============================================================
petBillsRoute.post("/:id{[0-9]+}/bills/upload", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400);
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return c.json({ error: { code: "MISSING_PHOTO", message: "Thiếu file ảnh (field 'photo')" } }, 400);
  }
  if (file.size > MAX_BILL_PHOTO_SIZE) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Ảnh quá 10MB" } }, 413);
  }
  const ext = imageExtFromMime(file.type);
  if (!ext) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ chấp nhận JPEG, PNG, WebP" } }, 415);
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());

    // Upload to R2 first
    const key = `bills/${session.sub}/${petId}/${Date.now()}.${ext}`;
    const photoUrl = await uploadObject(key, buffer, file.type);

    // Run OCR in parallel-ish (non-blocking for UX — but here we await for pre-fill)
    const ocr = await ocrBillImage(buffer, file.type);

    return c.json({
      photo_key: key,
      photo_url: photoUrl,
      ocr: ocr,
    });
  } catch (err) {
    console.error("[bills/upload] error:", err);
    return c.json({ error: { code: "UPLOAD_FAILED", message: "Upload hoặc OCR thất bại" } }, 500);
  }
});

// ============================================================
// POST /pets/:id/bills — tạo bill record
// ============================================================
petBillsRoute.post("/:id{[0-9]+}/bills", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  const { bill_date, clinic_name, total_amount, category, items, photo_key, photo_url, ocr_confidence, notes, verified } = body;

  if (!bill_date) {
    return c.json({ error: { code: "MISSING_DATE", message: "Thiếu ngày khám (bill_date)" } }, 400);
  }
  // Validate bill_date not in future
  if (bill_date > new Date().toISOString().slice(0, 10)) {
    return c.json({ error: { code: "FUTURE_DATE", message: "Ngày khám không được trong tương lai" } }, 400);
  }
  if (typeof total_amount === "number" && total_amount < 0) {
    return c.json({ error: { code: "INVALID_AMOUNT", message: "Số tiền không hợp lệ" } }, 400);
  }

  try {
    const bill = await createBill(petId, {
      bill_date,
      clinic_name: clinic_name || null,
      total_amount: total_amount ?? null,
      category: category || "other",
      items: Array.isArray(items) ? items : [],
      photo_key: photo_key || null,
      photo_url: photo_url || null,
      ocr_confidence: typeof ocr_confidence === "number" ? ocr_confidence : null,
      notes: notes || null,
      verified: verified === true,
    });
    return c.json({ bill }, 201);
  } catch (err) {
    console.error("[bills/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo bill" } }, 500);
  }
});

// ============================================================
// PUT /pets/:id/bills/:bid — update
// ============================================================
petBillsRoute.put("/:id{[0-9]+}/bills/:bid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const billId = Number(c.req.param("bid"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  // Verify bill belongs to this pet
  let existingRow: any;
  try {
    existingRow = await getRow("vet_bills", billId);
  } catch {
    return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy bill" } }, 404);
  }
  const existingBill = toBillApi(existingRow);
  if (existingBill.pet_id !== petId) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }

  try {
    const updated = await updateBill(billId, body);
    return c.json({ bill: updated });
  } catch (err) {
    console.error("[bills/update] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi update bill" } }, 500);
  }
});

// ============================================================
// DELETE /pets/:id/bills/:bid
// ============================================================
petBillsRoute.delete("/:id{[0-9]+}/bills/:bid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const billId = Number(c.req.param("bid"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xác thực" } }, 500);
  }

  let existingRow: any;
  try {
    existingRow = await getRow("vet_bills", billId);
  } catch {
    return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy bill" } }, 404);
  }
  const existingBill = toBillApi(existingRow);
  if (existingBill.pet_id !== petId) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
  }

  try {
    await deleteBill(billId);
    return c.json({ success: true });
  } catch (err) {
    console.error("[bills/delete] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xóa bill" } }, 500);
  }
});
