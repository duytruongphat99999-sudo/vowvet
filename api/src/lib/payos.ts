/**
 * PAYOS ADAPTER (epic foster-payment §6) — MỌI call PayOS đi qua đây.
 *
 * PAYOS_MODE=mock → kết quả giả ĐỒNG BỘ, build/verify toàn bộ luồng KHÔNG cần key.
 * PAYOS_MODE=live → gọi API PayOS thật (TODO §9 — điền khi có key MSB+PayOS).
 *
 * NGUYÊN TẮC:
 *  - Adapter KHÔNG import DB/@shared — thuần I/O PayOS, test lẻ được (host bun).
 *  - Hàm network-bound = async (createPaymentLink/createPayout/getPayoutStatus) để
 *    khi gắn live KHÔNG phải sửa signature ở caller ("gắn vào là chạy").
 *  - Nhánh live CHƯA cấu hình = THROW rõ ràng (không trả rỗng/success giả) → không
 *    bao giờ âm thầm "chi thành công" khi thực ra chưa nối cổng.
 *
 * Default mode = mock (env thiếu → mock) → không bao giờ vô tình đi live.
 */

export type PayosMode = "mock" | "live";
export const PAYOS_MODE: PayosMode =
  (Bun.env.PAYOS_MODE || "mock").toLowerCase() === "live" ? "live" : "mock";

export interface PayLink {
  checkoutUrl: string;
  orderCode: number;
  qr?: string;
}
export interface ThuEvent {
  orderCode: number;
  amount: number;
  ref: string;
}
export type PayoutStatus = "sent" | "success" | "failed";
export interface PayoutResult {
  payoutId: string;
  status: PayoutStatus;
}

export interface CreateLinkInput {
  orderId: number;
  amount: number;
  description?: string;
}

/** Tạo link thanh toán THU cho 1 đơn. mock: orderCode = orderId, trỏ về mock endpoint. */
export async function createPaymentLink(input: CreateLinkInput): Promise<PayLink> {
  const orderCode = input.orderId;
  if (PAYOS_MODE === "mock") {
    return { checkoutUrl: `/public/dev/mock-pay/${orderCode}`, orderCode };
  }
  // TODO(live): POST {PAYOS_URL}/v2/payment-requests với PAYOS_CLIENT_ID/API_KEY,
  //   ký checksum PAYOS_CHECKSUM_KEY → trả checkoutUrl + qr (Napas 247 VietQR).
  throw new Error(
    `PAYOS live createPaymentLink chưa cấu hình (order=${input.orderId}, amount=${input.amount}) — §9`
  );
}

/** Xác minh webhook THU. Trả sự kiện chuẩn hoá hoặc null (chữ ký sai / payload lỗi). */
export function verifyThuWebhook(payload: any, sig?: string): ThuEvent | null {
  if (PAYOS_MODE === "mock") {
    // mock: bỏ qua chữ ký, đọc thẳng payload.
    const orderCode = Number(payload?.orderCode);
    if (!orderCode || Number.isNaN(orderCode)) return null;
    const amount = Number(payload?.amount);
    return {
      orderCode,
      amount: Number.isNaN(amount) ? 0 : amount,
      ref: String(payload?.ref || `mock-thu-${orderCode}`),
    };
  }
  // TODO(live): verify HMAC checksum PAYOS_CHECKSUM_KEY trên payload; sai chữ ký → null.
  throw new Error(
    `PAYOS live verifyThuWebhook chưa cấu hình (sig=${sig ? "present" : "absent"}) — §9`
  );
}

export interface ChiEvent {
  ref: string;
  status: PayoutStatus;
}

/** Xác minh webhook CHI (PayOS đẩy kết quả lệnh chi). Trả sự kiện hoặc null (chữ ký sai). */
export function verifyChiWebhook(payload: any, sig?: string): ChiEvent | null {
  if (PAYOS_MODE === "mock") {
    // mock: bỏ qua chữ ký, đọc thẳng payload.
    const ref = String(payload?.ref || "").trim();
    const status = String(payload?.status || "");
    if (!ref || (status !== "sent" && status !== "success" && status !== "failed")) return null;
    return { ref, status: status as PayoutStatus };
  }
  // TODO(live): verify HMAC checksum PAYOS_CHECKSUM_KEY; sai chữ ký → null.
  throw new Error(`PAYOS live verifyChiWebhook chưa cấu hình (sig=${sig ? "present" : "absent"}) — §9`);
}

export interface CreatePayoutInput {
  bin: string;
  accountNo: string;
  accountName: string;
  amount: number;
  ref: string;
}

/**
 * Tạo lệnh CHI tới STK người thụ hưởng. ref = "foster-<orderId>" (cố định theo đơn) →
 * nếu PayOS Kênh Chi idempotent theo ref (xác nhận §9), retry cùng ref KHÔNG tạo lệnh mới.
 * mock: trả success đồng bộ để verify sequencing W3 chạy y hệt live.
 */
export async function createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
  if (PAYOS_MODE === "mock") {
    return { payoutId: `mock-${input.ref}`, status: "success" };
  }
  // TODO(live): POST Kênh Chi (PAYOS_PAYOUT_CLIENT_ID/API_KEY) tạo lệnh chi đơn tới
  //   {bin, accountNo, accountName, amount}, referenceId = ref (idempotency key).
  throw new Error(
    `PAYOS live createPayout chưa cấu hình (ref=${input.ref}, amount=${input.amount}) — §9`
  );
}

// ── MOCK-ONLY control (test W4): map ref → kết quả getPayoutStatus. Set qua endpoint mock.
//    KHÔNG backdoor ở live — setter no-op ngoài mock; getPayoutStatus live gọi API thật.
const __mockPayoutStatus = new Map<string, PayoutStatus>();
export function __setMockPayoutStatus(ref: string, status: PayoutStatus): void {
  if (PAYOS_MODE !== "mock") return;
  __mockPayoutStatus.set(ref, status);
}

/**
 * Tra trạng thái lệnh chi theo REF merchant ("foster-<order_code>") — KHÔNG theo payoutId.
 * Lý do: đơn 'pending' (mất response lúc createPayout) CHƯA có payoutId, chỉ có order_code →
 * ref suy từ order_code là cách DUY NHẤT địa chỉ hoá đơn pending để đối soát.
 * mock: trả theo map điều khiển (mặc định success). live: query PayOS theo ref (§9 — nếu Kênh Chi
 * KHÔNG cho query theo merchant ref → đối soát tay trên portal, KHÔNG giả vờ auto).
 */
export async function getPayoutStatus(ref: string): Promise<PayoutStatus> {
  if (PAYOS_MODE === "mock") {
    return __mockPayoutStatus.get(ref) ?? "success";
  }
  // TODO(live): GET trạng thái lệnh chi theo merchant referenceId = ref.
  throw new Error(`PAYOS live getPayoutStatus chưa cấu hình (ref=${ref}) — §9`);
}
