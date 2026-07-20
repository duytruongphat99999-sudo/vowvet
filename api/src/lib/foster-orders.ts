/**
 * FOSTER L5a — đơn góp gói (foster_orders).
 * Ghi đơn khi người góp bấm "Tiếp tục" trên chứng thư (public, chưa login).
 * Guard: CHỈ bé foster_public=true mới nhận đơn (chống đơn ma). order_code DUY NHẤT.
 * KHÔNG ghi địa chỉ foster vào đơn (③).
 */
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";
import { findPetBySlug } from "./slug.ts";
import { createPaymentLink } from "./payos.ts";

// foster_orders chưa nằm trong union TableName (typing) — cast; runtime đọc theo config.
const ORDERS = "foster_orders" as TableName;

/** 4 trạng thái đơn (khớp single_select Baserow). */
export const FOSTER_ORDER_STATUSES = ["mới", "đã liên hệ", "đã giao", "huỷ"];

export class FosterOrderError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const CODE_ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 gây nhầm
function genCode(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPH[Math.floor(Math.random() * CODE_ALPH.length)];
  return "VV-D" + s;
}

async function codeExists(code: string): Promise<boolean> {
  const r = await listRows<any>(ORDERS, { filter: { order_code__equal: code }, size: 1 });
  return r.count > 0;
}

/** link_row user_id (format [{id,value}] hoặc [id]) → numeric owner id. */
function extractOwnerId(userIdField: any): number | null {
  if (Array.isArray(userIdField) && userIdField.length > 0) {
    const v = userIdField[0];
    if (v && typeof v === "object") return typeof v.id === "number" ? v.id : null;
    return typeof v === "number" ? v : null;
  }
  return null;
}

export async function createFosterOrder(input: {
  pet_slug: string;
  package_id: number;
  package_title: string;
  package_price: number;
  donor_name?: string | null;
}): Promise<{ order_code: string; checkout_url: string }> {
  const pet = (await findPetBySlug(input.pet_slug)) as any;
  if (!pet) throw new FosterOrderError("NOT_FOUND", "Không tìm thấy bé", 404);
  // GUARD: chỉ bé foster công khai mới nhận đơn.
  if (pet.foster_public !== true) throw new FosterOrderError("NOT_FOSTER", "Bé này hiện không nhận đơn góp", 403);

  // order_code duy nhất (retry nếu trùng).
  let code = genCode();
  for (let i = 0; i < 5 && (await codeExists(code)); i++) code = genCode();

  const row = await createRow<any>(ORDERS, {
    order_code: code,
    pet_id: [pet.id], // link_row = mảng row id
    pet_owner_id: extractOwnerId(pet.user_id),
    package_id: input.package_id,
    package_title: input.package_title,
    package_price: input.package_price,
    status: "mới",
    payment_status: "pending",
    donor_name: (input.donor_name || "").trim() || null,
    created_at: new Date().toISOString(),
  });

  // Tạo link thanh toán THU. mock → /public/dev/mock-pay/<id>; live → PayOS hosted page.
  const link = await createPaymentLink({
    orderId: row.id,
    amount: input.package_price,
    description: `Góp ${input.package_title}`,
  });
  // payos_order_code = khóa map webhook-thu → đơn. mock: = row.id.
  await updateRow(ORDERS, row.id, { payos_order_code: link.orderCode });

  return { order_code: code, checkout_url: link.checkoutUrl };
}

/** Chuẩn hoá single_select/text Baserow → giá trị phẳng. */
function flatVal(v: any): string {
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  return v == null ? "" : String(v);
}

/** Tìm đơn theo payos_order_code (khóa map webhook-thu). null nếu không có. */
export async function getOrderByPayosCode(orderCode: number): Promise<any | null> {
  const r = await listRows<any>(ORDERS, {
    filter: { payos_order_code__equal: String(orderCode) },
    size: 1,
  });
  return r.results[0] || null;
}

export type MarkPaidResult =
  | { ok: true; already: boolean; amount_paid: number; order_code: string }
  | { ok: false; code: "NOT_FOUND" | "AMOUNT_MISMATCH"; message: string };

/**
 * Đánh dấu đơn ĐÃ THU tiền — HÀM DUY NHẤT mutate payment. webhook-thu THẬT + mock-pay đều gọi
 * hàm này (mock/live chạy y hệt code mutation).
 *  - IDEMPOTENT: đơn đã paid → no-op, already=true (PayOS retry webhook → route trả 200, KHÔNG cộng đôi).
 *  - AMOUNT GUARD: ev.amount PHẢI == package_price. Lệch → KHÔNG set paid, cờ đối soát vào pay_ref + log.
 *  - amount_paid = GÁN (không cộng) → kể cả 2 webhook đồng thời vẫn ra đúng 1 giá trị.
 */
export async function markOrderPaid(ev: {
  orderCode: number;
  amount: number;
  ref: string;
}): Promise<MarkPaidResult> {
  const order = await getOrderByPayosCode(ev.orderCode);
  if (!order) {
    return { ok: false, code: "NOT_FOUND", message: `Không tìm thấy đơn payos_order_code=${ev.orderCode}` };
  }

  // Đã paid → idempotent no-op (KHÔNG ghi lại, KHÔNG cộng amount lần 2).
  if (flatVal(order.payment_status) === "paid") {
    return { ok: true, already: true, amount_paid: Number(order.amount_paid) || 0, order_code: order.order_code };
  }

  const expected = Number(order.package_price) || 0;
  if (Number(ev.amount) !== expected) {
    // Số tiền lệch → KHÔNG set paid; cờ đối soát; log. (Chống ghi tiền thiếu/sai thành "đã trả đủ".)
    console.error(
      `[markOrderPaid] AMOUNT MISMATCH order=${order.order_code} payos=${ev.orderCode} got=${ev.amount} expected=${expected}`
    );
    await updateRow(ORDERS, order.id, { pay_ref: `MISMATCH got=${ev.amount} expected=${expected} ${ev.ref}` });
    return { ok: false, code: "AMOUNT_MISMATCH", message: `Số tiền lệch: nhận ${ev.amount} ≠ ${expected}` };
  }

  // Happy path — GÁN amount_paid (không cộng dồn).
  await updateRow(ORDERS, order.id, {
    payment_status: "paid",
    amount_paid: Number(ev.amount),
    paid_at: new Date().toISOString(),
    pay_ref: ev.ref,
  });
  return { ok: true, already: false, amount_paid: Number(ev.amount), order_code: order.order_code };
}

/**
 * L5b — list đơn cho ADMIN (CHỈ gọi từ route bọc requireAdmin).
 * Bỏ row trống (order_code=null). Lookup SĐT + tên chủ bé server-side (dữ liệu NHẠY —
 * chỉ trả trong API admin-gated, KHÔNG ở endpoint public nào).
 */
export async function listFosterOrders(): Promise<any[]> {
  const r = await listRows<any>(ORDERS, { size: 200 });
  const rows = r.results.filter((o: any) => o.order_code); // bỏ 2 row trống mặc định
  const out: any[] = [];
  for (const o of rows) {
    const petName = Array.isArray(o.pet_id) && o.pet_id[0] ? (o.pet_id[0].value || null) : null;
    let ownerPhone: string | null = null;
    let ownerName: string | null = null;
    const ownerId = typeof o.pet_owner_id === "number" ? o.pet_owner_id : (o.pet_owner_id ? Number(o.pet_owner_id) : null);
    if (ownerId) {
      try {
        const u = (await getRow<any>("users", ownerId));
        ownerPhone = u.phone || null;
        ownerName = u.name || null;
      } catch (e) { /* user xoá/lỗi → để null */ }
    }
    out.push({
      order_code: o.order_code,
      pet_name: petName,
      package_title: o.package_title || null,
      package_price: o.package_price != null ? Number(o.package_price) : null,
      status: (o.status && typeof o.status === "object") ? o.status.value : (o.status || null),
      created_at: o.created_at || null,
      donor_name: o.donor_name || null,
      owner_phone: ownerPhone,
      owner_name: ownerName,
    });
  }
  out.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))); // mới nhất trước
  return out;
}

/** L5b — đổi status đơn (admin). Validate status ∈ 4 option. */
export async function updateOrderStatus(orderCode: string, status: string): Promise<void> {
  if (!FOSTER_ORDER_STATUSES.includes(status)) throw new FosterOrderError("BAD_STATUS", "Trạng thái không hợp lệ", 400);
  const r = await listRows<any>(ORDERS, { filter: { order_code__equal: orderCode }, size: 1 });
  const row = r.results[0];
  if (!row) throw new FosterOrderError("NOT_FOUND", "Không tìm thấy đơn", 404);
  await updateRow(ORDERS, row.id, { status });
}

// ──────────────────────────────────────────────────────────────
// L5c — đếm lượt góp công khai. Loại order_code=null + status huỷ.
// ──────────────────────────────────────────────────────────────

/** Chuẩn hoá status (single_select Baserow trả {value} hoặc string). */
function orderStatusValue(s: any): string {
  return s && typeof s === "object" ? (s.value || "") : (s || "");
}

// "huỷ" = phần tử cuối FOSTER_ORDER_STATUSES → tránh gõ sai glyph tiếng Việt.
const CANCELLED_STATUS = FOSTER_ORDER_STATUSES[FOSTER_ORDER_STATUSES.length - 1];

/** Đơn hợp lệ = có order_code (loại 2 row trống) AND chưa huỷ. */
function isValidOrder(o: any): boolean {
  return !!o.order_code && orderStatusValue(o.status) !== CANCELLED_STATUS;
}

/** pet_id link_row ([{id,value}] hoặc [id]) → pet row id. */
function orderPetId(petIdField: any): number | null {
  if (Array.isArray(petIdField) && petIdField.length > 0) {
    const v = petIdField[0];
    if (v && typeof v === "object") return typeof v.id === "number" ? v.id : null;
    return typeof v === "number" ? v : null;
  }
  return null;
}

/** Đếm lượt góp hợp lệ của 1 bé (chứng thư /p/[slug]). 1 query. */
export async function countFosterOrders(petId: number): Promise<number> {
  const r = await listRows<any>(ORDERS, {
    filter: { pet_id__link_row_has: String(petId) },
    size: 200,
  });
  return r.results.filter(isValidOrder).length;
}

/** Đếm gộp nhiều bé trong 1 query (board /foster — KHÔNG N+1) → { petId: count }. */
export async function countFosterOrdersByPetIds(
  petIds: number[]
): Promise<Record<number, number>> {
  const counts: Record<number, number> = {};
  for (const id of petIds) counts[id] = 0;
  if (petIds.length === 0) return counts;
  const r = await listRows<any>(ORDERS, { size: 200 });
  for (const o of r.results) {
    if (!isValidOrder(o)) continue;
    const pid = orderPetId(o.pet_id);
    if (pid != null && counts[pid] !== undefined) counts[pid]++;
  }
  return counts;
}

/**
 * L6b — bảng vinh danh người nuôi: gộp đơn HỢP LỆ theo pet_owner_id → { name, total_orders }.
 * Sort total_orders giảm dần, đã loại total=0 (chỉ owner có đơn mới xuất hiện).
 * BẢO MẬT: CHỈ trả name + số lượt — KHÔNG id/phone/email/địa chỉ ra response public.
 */
export async function getFosterLeaderboard(): Promise<{ name: string; total_orders: number }[]> {
  const r = await listRows<any>(ORDERS, { size: 200 });
  const counts: Record<number, number> = {};
  for (const o of r.results) {
    if (!isValidOrder(o)) continue; // loại huỷ + order_code=null
    const ownerId = typeof o.pet_owner_id === "number" ? o.pet_owner_id : (o.pet_owner_id ? Number(o.pet_owner_id) : null);
    if (ownerId == null || Number.isNaN(ownerId)) continue;
    counts[ownerId] = (counts[ownerId] || 0) + 1;
  }
  const out: { name: string; total_orders: number }[] = [];
  for (const idStr of Object.keys(counts)) {
    // dedupe owner → getRow 1 lần/người. CHỈ lấy name; KHÔNG nhét id/phone/email vào output.
    let name = "Người nuôi ẩn danh";
    try { const u = await getRow<any>("users", Number(idStr)); if (u && u.name) name = String(u.name); } catch { /* user xoá/lỗi → giữ ẩn danh */ }
    out.push({ name, total_orders: counts[Number(idStr)] });
  }
  out.sort((a, b) => b.total_orders - a.total_orders);
  return out;
}
