/**
 * Vet Bill Tracker — Baserow CRUD + Gemini OCR (M16).
 *
 * Mỗi bill linked tới 1 pet qua pet_id link_row.
 * OCR dùng Gemini Flash Vision để đọc hoá đơn vet.
 */
import { listRows, createRow, updateRow, deleteRow } from "@shared/baserow.ts";
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ============================================================
// Types
// ============================================================

export interface BillItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface BillRow {
  id: number;
  pet_id?: Array<{ id: number; value: string }>;
  bill_date?: string | null;
  clinic_name?: string | null;
  total_amount?: number | null;
  category?: { id: number; value: string } | string | null;
  items?: string | null;
  photo_key?: string | null;
  photo_url?: string | null;
  ocr_raw?: string | null;
  ocr_confidence?: number | null;
  verified?: boolean;
  notes?: string | null;
  huhipet_claimed?: boolean;
  created_at?: string | null;
}

export interface BillApi {
  id: number;
  pet_id: number;
  bill_date: string | null;
  clinic_name: string | null;
  total_amount: number | null;
  category: string | null;
  items: BillItem[];
  photo_key: string | null;
  photo_url: string | null;
  ocr_confidence: number | null;
  verified: boolean;
  notes: string | null;
  huhipet_claimed: boolean;
  created_at: string | null;
}

export interface OcrResult {
  clinic_name: string | null;
  bill_date: string | null;
  total_amount: number | null;
  category: string | null;
  items: BillItem[];
  confidence: number;
}

// ============================================================
// Helpers
// ============================================================

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function petIdFromRow(row: BillRow): number {
  const link = row.pet_id;
  if (Array.isArray(link) && link.length > 0) return link[0].id;
  return 0;
}

export function toBillApi(row: BillRow): BillApi {
  let items: BillItem[] = [];
  try {
    if (row.items) items = JSON.parse(row.items);
  } catch {}

  return {
    id: row.id,
    pet_id: petIdFromRow(row),
    bill_date: row.bill_date || null,
    clinic_name: row.clinic_name || null,
    total_amount: typeof row.total_amount === "number" ? row.total_amount : null,
    category: flatVal<string>(row.category),
    items,
    photo_key: row.photo_key || null,
    photo_url: row.photo_url || null,
    ocr_confidence: typeof row.ocr_confidence === "number" ? row.ocr_confidence : null,
    verified: row.verified === true,
    notes: row.notes || null,
    huhipet_claimed: row.huhipet_claimed === true,
    created_at: row.created_at || null,
  };
}

// ============================================================
// CRUD
// ============================================================

export async function listBills(petId: number): Promise<BillApi[]> {
  const res = await listRows<BillRow>("vet_bills", {
    filter: { pet_id__link_row_has: String(petId) },
    orderBy: "-bill_date",
    size: 200,
  });
  // Filter out Baserow stub rows (no pet_id)
  return res.results
    .filter((r) => petIdFromRow(r) === petId)
    .map(toBillApi);
}

export async function createBill(petId: number, data: Partial<BillApi>): Promise<BillApi> {
  const row = await createRow<BillRow>("vet_bills", {
    pet_id: [petId],
    bill_date: data.bill_date || new Date().toISOString().slice(0, 10),
    clinic_name: data.clinic_name || null,
    total_amount: data.total_amount || null,
    category: data.category || "other",
    items: data.items ? JSON.stringify(data.items) : "[]",
    photo_key: data.photo_key || null,
    photo_url: data.photo_url || null,
    ocr_confidence: data.ocr_confidence ?? null,
    ocr_raw: null,
    verified: data.verified ?? false,
    notes: data.notes || null,
    huhipet_claimed: false,
    created_at: new Date().toISOString(),
  });
  return toBillApi(row);
}

export async function updateBill(billId: number, data: Partial<BillApi>): Promise<BillApi> {
  const patch: Record<string, unknown> = {};
  if (data.bill_date !== undefined) patch.bill_date = data.bill_date;
  if (data.clinic_name !== undefined) patch.clinic_name = data.clinic_name;
  if (data.total_amount !== undefined) patch.total_amount = data.total_amount;
  if (data.category !== undefined) patch.category = data.category;
  if (data.items !== undefined) patch.items = JSON.stringify(data.items);
  if (data.ocr_confidence !== undefined) patch.ocr_confidence = data.ocr_confidence;
  if (data.verified !== undefined) patch.verified = data.verified;
  if (data.notes !== undefined) patch.notes = data.notes;
  const row = await updateRow<BillRow>("vet_bills", billId, patch);
  return toBillApi(row);
}

export async function deleteBill(billId: number): Promise<void> {
  await deleteRow("vet_bills", billId);
}

// ============================================================
// Spending summary
// ============================================================

export interface SpendingSummary {
  total_year: number;
  total_month: number;
  by_category: Record<string, number>;
  monthly_trend: Array<{ month: string; total: number }>;
  most_expensive_category: string | null;
  bill_count: number;
}

export async function getSpendingSummary(petId: number): Promise<SpendingSummary> {
  const bills = await listBills(petId);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let totalYear = 0;
  let totalMonth = 0;
  const byCategory: Record<string, number> = {};
  const monthlyMap: Record<string, number> = {};

  for (const b of bills) {
    const amt = b.total_amount || 0;
    const d = b.bill_date || "";

    if (d.startsWith(String(currentYear))) {
      totalYear += amt;
      if (d.startsWith(currentMonth)) totalMonth += amt;
    }

    const cat = b.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + amt;

    if (d.length >= 7) {
      const m = d.slice(0, 7);
      monthlyMap[m] = (monthlyMap[m] || 0) + amt;
    }
  }

  // Sort months desc and take last 6
  const monthlyTrend = Object.entries(monthlyMap)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)
    .reverse()
    .map(([month, total]) => ({ month, total }));

  const mostExpensiveCategory =
    Object.keys(byCategory).length > 0
      ? Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0][0]
      : null;

  return {
    total_year: totalYear,
    total_month: totalMonth,
    by_category: byCategory,
    monthly_trend: monthlyTrend,
    most_expensive_category: mostExpensiveCategory,
    bill_count: bills.length,
  };
}

// ============================================================
// Gemini OCR
// ============================================================

const OCR_PROMPT = `Đây là ảnh hoá đơn/phiếu thu từ phòng khám thú y Việt Nam.
Hãy đọc và extract thông tin, trả về JSON THUẦN (không markdown, không \`\`\`):
{
  "clinic_name": "tên phòng khám hoặc null",
  "bill_date": "YYYY-MM-DD hoặc null",
  "total_amount": số nguyên (VNĐ, không có dấu chấm/phẩy) hoặc null,
  "currency": "VND",
  "category": "vaccine|kham_benh|phau_thuat|thuoc|grooming|xet_nghiem|other",
  "items": [{"name":"tên dịch vụ","qty":1,"unit_price":0,"total":0}],
  "confidence": số từ 0-100
}
Nếu không đọc được field nào, để null. Category: xem nội dung dịch vụ để đoán.
Chỉ trả JSON, không kèm giải thích.`;

export async function ocrBillImage(imageBuffer: Uint8Array, mimeType: string): Promise<OcrResult> {
  if (!GEMINI_API_KEY) {
    return { clinic_name: null, bill_date: null, total_amount: null, category: null, items: [], confidence: 0 };
  }

  try {
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: OCR_PROMPT },
          ],
        },
      ],
      config: { temperature: 0.1, maxOutputTokens: 1024 },
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // Strip any accidental markdown fences
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr);

    const items: BillItem[] = Array.isArray(parsed.items)
      ? parsed.items.map((it: any) => ({
          name: String(it.name || ""),
          qty: Number(it.qty) || 1,
          unit_price: Number(it.unit_price) || 0,
          total: Number(it.total) || 0,
        }))
      : [];

    return {
      clinic_name: parsed.clinic_name || null,
      bill_date: parsed.bill_date || null,
      total_amount: typeof parsed.total_amount === "number" ? parsed.total_amount : null,
      category: parsed.category || "other",
      items,
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 0)),
    };
  } catch (err) {
    console.error("[bills/ocr] Gemini OCR failed:", err);
    return { clinic_name: null, bill_date: null, total_amount: null, category: null, items: [], confidence: 0 };
  }
}
