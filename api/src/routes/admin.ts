/**
 * Admin routes (M8) — protect by phone whitelist từ env ADMIN_PHONES.
 *
 * KHÔNG dùng auth role system Phase 0. Whitelist trong env:
 *   ADMIN_PHONES=+84939233398,+84xxx
 *
 * Endpoints:
 *   GET  /admin/stats           — dashboard counters + AI cost today
 *   POST /admin/users/:id/disable — soft delete user (set deleted_at)
 *   GET  /admin/export/users    — CSV dump users (id, phone, email, created_at, deleted_at)
 *   GET  /admin/export/pets     — CSV dump pets
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { listRows, updateRow, getRow } from "@shared/baserow.ts";
import { applyFosterEnable, applyFosterDisable } from "../lib/public-pets.ts";
import { patchPet } from "../lib/pets.ts";
import { listAllPending } from "../lib/adoption-requests.ts";
import { FosterUpdateSchema } from "@shared/zod-schemas/public-pet.ts";
import { isAdminIdentity } from "@shared/admin.ts";
import { getPlace, listPendingPlaces, verifyPlace, rejectPlace } from "../lib/places.ts";
import { findUserById, softDeleteUser } from "../lib/users.ts";
import { adminAnalyticsOverview, aiCostSummary } from "../lib/analytics.ts";
import { getZaloStatus, sendOtp } from "../lib/otp-sender.ts";
import { normalizePhone } from "@shared/auth.ts";
import { listFosterOrders, updateOrderStatus, FosterOrderError } from "../lib/foster-orders.ts";
import { createPayout, getPayoutStatus } from "../lib/payos.ts";
import { reclaimPet, reclaimPetByPassport } from "../lib/foster-reclaim.ts";
import { getPendingRequests, approveRequest } from "../lib/reclaim-requests.ts";
import { getAllConversations, getAdminSupportUnread } from "../lib/conversations.ts";

const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);

/** Middleware: require admin (authenticated + phone HOẶC email trong whitelist). */
const requireAdmin: MiddlewareHandler = async (c, next) => {
  const session = c.get("user");
  if (!isAdminIdentity(session?.phone, session?.email)) {
    return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền admin" } }, 403);
  }
  await next();
};

export const adminRoute = new Hono();
adminRoute.use("*", requireAuth);
adminRoute.use("*", requireAdmin);

// ===== FOSTER L5b — đơn góp (admin-only; SĐT chủ bé chỉ ở đây) =====
adminRoute.get("/foster-orders", async (c) => {
  try {
    const orders = await listFosterOrders();
    return c.json({ orders });
  } catch (err) {
    console.error("[admin/foster-orders] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

adminRoute.patch("/foster-orders/:code/status", async (c) => {
  const code = c.req.param("code");
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400); }
  try {
    await updateOrderStatus(code, String(body?.status || ""));
    return c.json({ ok: true, order_code: code, status: body.status });
  } catch (err) {
    if (err instanceof FosterOrderError) return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 404 | 500);
    console.error("[admin/foster-orders status] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ============================================================
// FOSTER W3 — CHI tiền cho người nuôi (PayOS payout). MONEY-CRITICAL.
// Guard admin: đã bọc requireAuth + requireAdmin qua adminRoute.use("*") (reuse, KHÔNG tự chế).
// ============================================================

// Mutex serialize theo order_code — chống double-click chi 2 lần.
// vowvet-api = 1 container/process → in-memory Map đủ. Release ở finally.
const payoutLocks = new Map<string, Promise<void>>();
async function withPayoutLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (payoutLocks.has(key)) { await payoutLocks.get(key); }
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  payoutLocks.set(key, gate);
  try { return await fn(); }
  finally { payoutLocks.delete(key); release(); }
}
const flatSel = (v: any): string =>
  v && typeof v === "object" && "value" in v ? String(v.value) : v == null ? "" : String(v);

// GET /admin/foster-payouts — đơn ĐÃ THU (paid) + prefill STK (snapshot beneficiary_* hoặc users.bank_*).
adminRoute.get("/foster-payouts", async (c) => {
  try {
    const [ordersRes, usersRes] = await Promise.all([
      listRows<any>("foster_orders" as any, { size: 200 }),
      listRows<any>("users", { size: 200 }),
    ]);
    const bankByUser = new Map<number, { bin: string; no: string; name: string }>();
    for (const u of usersRes.results) {
      bankByUser.set(u.id, { bin: u.bank_bin || "", no: u.bank_account_no || "", name: u.bank_account_name || "" });
    }
    const payouts = ordersRes.results
      .filter((o: any) => o.order_code && flatSel(o.payment_status) === "paid")
      .map((o: any) => {
        const ownerId = Number(o.pet_owner_id) || null;
        const bank = ownerId ? bankByUser.get(ownerId) : null;
        return {
          order_code: o.order_code,
          pet_name: Array.isArray(o.pet_id) && o.pet_id[0] ? o.pet_id[0].value || null : null,
          amount_paid: Number(o.amount_paid) || 0,
          payout_status: flatSel(o.payout_status) || "none",
          payout_ref: o.payout_ref || null,
          approved_by: o.approved_by || null,
          approved_at: o.approved_at || null,
          payout_amount: o.payout_amount != null ? Number(o.payout_amount) : Number(o.amount_paid) || 0,
          bin: o.beneficiary_bank_bin || bank?.bin || "",
          account_no: o.beneficiary_account_no || bank?.no || "",
          account_name: o.beneficiary_account_name || bank?.name || "",
        };
      })
      .sort((a: any, b: any) => String(b.approved_at || "").localeCompare(String(a.approved_at || "")));
    return c.json({ payouts });
  } catch (err) {
    console.error("[admin/foster-payouts] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// PATCH /admin/foster-orders/:code/payout — DUYỆT & CHI. Sequencing claim-trước-send.
adminRoute.patch("/foster-orders/:code/payout", async (c) => {
  const session = c.get("user");
  const code = c.req.param("code");
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400); }
  const bin = String(body?.bin || "").trim();
  const accountNo = String(body?.accountNo ?? body?.account_no ?? "").trim();
  const accountName = String(body?.accountName ?? body?.account_name ?? "").trim();
  const payoutAmount = Number(body?.payout_amount);

  // Guard 1: beneficiary đủ (fail sớm — KHÔNG gọi createPayout với TK rỗng).
  if (!bin || !accountNo || !accountName) {
    return c.json({ error: { code: "MISSING_BENEFICIARY", message: "Thiếu STK người nhận (BIN + số TK + tên)" } }, 400);
  }

  try {
    return await withPayoutLock(code, async () => {
      // 1. Đọc LẠI đơn từ Baserow (không tin payload/cache).
      const r = await listRows<any>("foster_orders" as any, { filter: { order_code__equal: code }, size: 1 });
      const order = r.results[0];
      if (!order) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy đơn" } }, 404);

      // 2. Guard trạng thái: paid + payout_status ∈ {none, failed}.
      if (flatSel(order.payment_status) !== "paid") {
        return c.json({ error: { code: "NOT_PAID", message: "Đơn chưa thu tiền (payment_status != paid)" } }, 409);
      }
      const ps = flatSel(order.payout_status) || "none";
      if (ps !== "none" && ps !== "failed") {
        return c.json({ error: { code: "PAYOUT_LOCKED", message: `Đơn đang/đã chi (payout_status='${ps}') — không chi lại` } }, 409);
      }

      // 3. Guard payout_amount: 0 < amount ≤ amount_paid.
      const amountPaid = Number(order.amount_paid) || 0;
      if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
        return c.json({ error: { code: "BAD_AMOUNT", message: "payout_amount phải > 0" } }, 400);
      }
      if (payoutAmount > amountPaid) {
        return c.json({ error: { code: "AMOUNT_EXCEEDS", message: `payout_amount ${payoutAmount} > amount_paid ${amountPaid}` } }, 400);
      }

      // 4. CLAIM-TRƯỚC-SEND: snapshot beneficiary + approved + payout_status=pending → GHI Baserow TRƯỚC createPayout.
      //    (Bấm lần 2 nếu qua được mutex sẽ thấy pending → guard bước 2 chặn 409.)
      await updateRow("foster_orders" as any, order.id, {
        beneficiary_bank_bin: bin,
        beneficiary_account_no: accountNo,
        beneficiary_account_name: accountName,
        payout_amount: payoutAmount,
        approved_by: String(session.sub),
        approved_at: new Date().toISOString(),
        payout_status: "pending",
      });

      // 5. createPayout — MONEY HAZARD nếu THROW/timeout: GIỮ pending, KHÔNG set failed, KHÔNG ref giả, KHÔNG retry.
      //    (Lệnh có thể đã đi bên PayOS mà mất response → retry = chi 2 lần.)
      let payout: { payoutId: string; status: string };
      try {
        payout = await createPayout({ bin, accountNo, accountName, amount: payoutAmount, ref: `foster-${code}` });
      } catch (err) {
        console.error(`[payout] createPayout THROW order=${code} id=${order.id} — GIỮ pending, đối soát tay:`, err);
        return c.json({ error: { code: "PAYOUT_UNCONFIRMED", message: "Lệnh chi CHƯA xác nhận — đơn giữ 'pending'. Đối soát trên portal PayOS, KHÔNG bấm chi lại." } }, 502);
      }

      // 6. PayOS từ chối DỨT KHOÁT (status=failed, tiền KHÔNG đi) → set failed (mở lại duyệt).
      if (payout.status === "failed") {
        await updateRow("foster_orders" as any, order.id, { payout_status: "failed", payout_at: new Date().toISOString() });
        return c.json({ error: { code: "PAYOUT_FAILED", message: "PayOS từ chối lệnh chi — đơn về 'failed', có thể duyệt lại." } }, 502);
      }

      // 7. OK → payout_status=sent (W4 đối soát sent→success/failed). Ghi ref + at.
      await updateRow("foster_orders" as any, order.id, {
        payout_status: "sent",
        payout_ref: payout.payoutId,
        payout_at: new Date().toISOString(),
      });
      return c.json({ ok: true, order_code: code, payout_status: "sent", payout_ref: payout.payoutId, payout_amount: payoutAmount }, 200);
    });
  } catch (err) {
    console.error("[admin/foster-orders payout] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ============================================================
// FOSTER W4 — ĐỐI SOÁT chi (poll reconcile + webhook-chi). Đưa sent/pending → success/failed.
// ============================================================

/**
 * Settle 1 đơn payout theo kết quả `resolved` (success|failed|sent). DÙNG CHUNG reconcile (poll)
 * + webhook-chi (push, import từ public.ts). CÙNG mutex W3 (payoutLocks) — không tạo mutex thứ 2.
 *  - idempotent: đơn đã success/failed → no-op 200 (PayOS retry webhook → vẫn 200).
 *  - chỉ flip đơn ∈ {sent, pending}; none/khác → 409.
 *  - resolved=sent/pending (PayOS chưa xong) → GIỮ NGUYÊN, không đoán.
 */
export async function settleFosterPayout(
  orderCode: string,
  resolved: string
): Promise<{ code: 200 | 404 | 409; body: any }> {
  return withPayoutLock(orderCode, async () => {
    const r = await listRows<any>("foster_orders" as any, { filter: { order_code__equal: orderCode }, size: 1 });
    const order = r.results[0];
    if (!order) return { code: 404 as const, body: { error: { code: "NOT_FOUND", message: "Không tìm thấy đơn" } } };
    const ps = flatSel(order.payout_status) || "none";
    if (ps === "success" || ps === "failed") {
      return { code: 200 as const, body: { ok: true, already: true, order_code: orderCode, payout_status: ps } };
    }
    if (ps !== "sent" && ps !== "pending") {
      return { code: 409 as const, body: { error: { code: "NOT_SETTLABLE", message: `payout_status='${ps}' — chưa chi, không có gì đối soát` } } };
    }
    if (resolved === "success") {
      await updateRow("foster_orders" as any, order.id, { payout_status: "success", payout_at: new Date().toISOString() });
      return { code: 200 as const, body: { ok: true, order_code: orderCode, payout_status: "success" } };
    }
    if (resolved === "failed") {
      // failed → reopen (guard {none,failed} ở route chi cho duyệt lại). GIỮ payout_ref để đối soát.
      await updateRow("foster_orders" as any, order.id, { payout_status: "failed", payout_at: new Date().toISOString() });
      return { code: 200 as const, body: { ok: true, order_code: orderCode, payout_status: "failed", reopened: true } };
    }
    // resolved = sent/pending → PayOS chưa hoàn tất → giữ nguyên.
    return { code: 200 as const, body: { ok: true, order_code: orderCode, payout_status: ps, pending: true, message: "Lệnh chi chưa hoàn tất bên PayOS" } };
  });
}

// PATCH /admin/foster-orders/:code/reconcile — đối soát chủ động (poll PayOS theo ref).
adminRoute.patch("/foster-orders/:code/reconcile", async (c) => {
  const code = c.req.param("code");
  try {
    // Pre-read fail-fast (tránh query PayOS thừa cho đơn none/terminal). settle re-validate dưới mutex.
    const pre = (await listRows<any>("foster_orders" as any, { filter: { order_code__equal: code }, size: 1 })).results[0];
    if (!pre) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy đơn" } }, 404);
    const preStatus = flatSel(pre.payout_status) || "none";
    if (preStatus === "success" || preStatus === "failed") {
      return c.json({ ok: true, already: true, order_code: code, payout_status: preStatus }, 200);
    }
    if (preStatus !== "sent" && preStatus !== "pending") {
      return c.json({ error: { code: "NOT_RECONCILABLE", message: `payout_status='${preStatus}' — chưa chi, không có gì đối soát` } }, 409);
    }
    // Query PayOS theo ref suy từ order_code (KHÔNG đọc payout_ref — pending không có).
    const resolved = await getPayoutStatus(`foster-${code}`);
    const out = await settleFosterPayout(code, resolved);
    return c.json(out.body, out.code);
  } catch (err) {
    console.error("[admin/foster-orders reconcile] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== FOSTER P3b — admin lấy lại bé trao nhầm (reclaim, hoàn tác 1 bước) =====
// :petId nhận MÃ PASSPORT (qr_code, có chữ) — dễ dùng thật. Vẫn chấp nhận ID số
// (chuỗi toàn digit) cho gọi nội bộ/backward-compat.
adminRoute.post("/pets/:petId/reclaim", async (c) => {
  const raw = (c.req.param("petId") || "").trim();
  if (!raw) {
    return c.json({ error: { code: "BAD_PET_ID", message: "Thiếu mã passport bé" } }, 400);
  }
  try {
    const result = /^\d+$/.test(raw)
      ? await reclaimPet(Number(raw))
      : await reclaimPetByPassport(raw);
    // Guard RECON fail (không có handover / trạng thái lệch / sai mã) → 409, không phải lỗi server.
    if (!result.ok) return c.json({ error: { code: "CANNOT_RECLAIM", message: result.reason } }, 409);
    return c.json(result);
  } catch (err) {
    console.error("[admin/reclaim] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== FOSTER Hướng B — queue yêu cầu lấy lại bé (admin duyệt) =====
adminRoute.get("/reclaim-requests", async (c) => {
  try {
    const requests = await getPendingRequests();
    return c.json({ requests });
  } catch (err) {
    console.error("[admin/reclaim-requests] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

adminRoute.post("/reclaim-requests/:requestId/approve", async (c) => {
  const requestId = Number(c.req.param("requestId"));
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return c.json({ error: { code: "BAD_ID", message: "requestId không hợp lệ" } }, 400);
  }
  try {
    const result = await approveRequest(requestId);
    if (!result.ok) return c.json({ error: { code: "CANNOT_APPROVE", message: result.reason } }, 409);
    return c.json(result);
  } catch (err) {
    console.error("[admin/reclaim-approve] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== ADMIN DASHBOARD — list users (kèm petCount) =====
adminRoute.get("/users", async (c) => {
  try {
    const [usersRes, petsRes] = await Promise.all([
      listRows<any>("users", { size: 200 }),
      listRows<any>("pets", { size: 200 }),
    ]);
    const petCount = new Map<number, number>();
    for (const p of petsRes.results) {
      if (!p.name) continue; // bỏ 2 row trống
      const f = p.user_id;
      const uid = Array.isArray(f) && f[0] ? (typeof f[0] === "object" ? f[0].id : f[0]) : null;
      if (uid != null) petCount.set(Number(uid), (petCount.get(Number(uid)) || 0) + 1);
    }
    const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);
    const users = usersRes.results
      .filter((u: any) => (u.phone || u.email || u.name) && !u.deleted_at) // bỏ row trống + đã soft-delete (đồng bộ pets list)
      .map((u: any) => ({
        id: u.id,
        name: u.name || null,
        phone: u.phone || null,
        email: u.email || null,
        tier: flat(u.foster_badge_tier) || null,
        petCount: petCount.get(u.id) || 0,
        created_at: u.created_at || null,
        deleted_at: u.deleted_at || null,
      }));
    return c.json({ users });
  } catch (err) {
    console.error("[admin/users] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== ADMIN DASHBOARD — list pets (kèm tên chủ, bỏ đã xoá) =====
adminRoute.get("/pets", async (c) => {
  try {
    const [petsRes, usersRes] = await Promise.all([
      listRows<any>("pets", { size: 200 }),
      listRows<any>("users", { size: 200 }),
    ]);
    const userName = new Map<number, string>();
    for (const u of usersRes.results) userName.set(u.id, u.name || u.phone || u.email || `user ${u.id}`);
    const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);
    const ownerId = (f: any) => (Array.isArray(f) && f[0] ? (typeof f[0] === "object" ? f[0].id : f[0]) : null);
    const pets = petsRes.results
      .filter((p: any) => p.name && !p.deleted_at) // bỏ stub + đã soft-delete
      .map((p: any) => {
        const oid = ownerId(p.user_id);
        return {
          id: p.id,
          name: p.name,
          species: flat(p.species) || "other",
          qr_code: p.qr_code || "",
          ownerName: oid != null ? userName.get(Number(oid)) || `user ${oid}` : "—",
          created_at: p.created_at || null,
        };
      });
    return c.json({ pets });
  } catch (err) {
    console.error("[admin/pets] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== ADMIN DASHBOARD — soft-delete pet (set deleted_at, field 6599) =====
adminRoute.post("/pets/:petId/delete", async (c) => {
  const petId = Number(c.req.param("petId"));
  if (!Number.isInteger(petId) || petId <= 0) {
    return c.json({ ok: false, reason: "ID không hợp lệ" }, 400);
  }
  try {
    await updateRow("pets", petId, { deleted_at: new Date().toISOString() });
    return c.json({ ok: true });
  } catch (err) {
    console.error("[admin/pet-delete] error:", err);
    return c.json({ ok: false, reason: "Lỗi server" }, 500);
  }
});

// ===== FOSTER W-F — admin toàn quyền bật/tắt foster + đổi status (BẤT KỲ pet nào) =====
// requireAdmin đã gate ở .use("*") → user thường gọi = 403. Core bỏ owner-check → thao tác pet không thuộc mình.
const AdminFosterSchema = z.object({
  foster_public: z.boolean().optional(),
  foster_status: FosterUpdateSchema.shape.foster_status, // reuse enum 4 giá trị
});
adminRoute.patch("/pets/:id{[0-9]+}/foster", zValidator("json", AdminFosterSchema), async (c) => {
  const petId = Number(c.req.param("id"));
  const data = c.req.valid("json");
  const hasPublic = data.foster_public !== undefined;
  const hasStatus = data.foster_status !== undefined;
  if (!hasPublic && !hasStatus) {
    return c.json({ error: { code: "EMPTY", message: "Cần foster_public hoặc foster_status" } }, 400);
  }
  try {
    if (hasPublic) {
      if (data.foster_public === true) await applyFosterEnable(petId, { foster_public: true });
      else await applyFosterDisable(petId);
    }
    if (hasStatus) {
      await patchPet(petId, { foster_status: data.foster_status || null }); // độc lập, không đụng public
    }
    const pet = (await getRow<any>("pets", petId)) as any;
    const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);
    return c.json({
      pet: {
        id: pet.id,
        foster_public: pet.foster_public === true,
        foster_status: flat(pet.foster_status) ?? null,
        is_public: pet.is_public === true,
        public_slug: pet.public_slug || null,
      },
    });
  } catch (err) {
    console.error("[admin/pet-foster] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== FOSTER W-G — admin xem queue "xin nhận nuôi" (duyệt dùng chung PATCH /pets/:id/adoption-requests/:reqId) =====
adminRoute.get("/adoption-requests", async (c) => {
  try {
    const pending = await listAllPending();
    if (pending.length === 0) return c.json({ requests: [] });
    const [petsRes, usersRes] = await Promise.all([
      listRows<any>("pets", { size: 200 }),
      listRows<any>("users", { size: 200 }),
    ]);
    const petName = new Map<number, string>();
    for (const p of petsRes.results) petName.set(p.id, p.name || `bé ${p.id}`);
    const userName = new Map<number, string>();
    for (const u of usersRes.results) userName.set(u.id, u.name || u.phone || u.email || `user ${u.id}`);
    const requests = pending.map((r) => ({
      id: r.id,
      pet_id: r.pet_id,
      pet_name: petName.get(r.pet_id) || `bé ${r.pet_id}`,
      requester_user_id: r.requester_user_id,
      requester_name: userName.get(r.requester_user_id) || `user ${r.requester_user_id}`,
      message: r.message,
      created_at: r.created_at,
    }));
    return c.json({ requests });
  } catch (err) {
    console.error("[admin/adoption-requests] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== ADMIN DASHBOARD — user detail (info + pets + lịch sử trao) =====
adminRoute.get("/users/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    const [usersRes, petsRes, hRes] = await Promise.all([
      listRows<any>("users", { size: 200 }),
      listRows<any>("pets", { size: 200 }),
      listRows<any>("foster_handovers" as any, { size: 200 }),
    ]);
    const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);
    const oid = (f: any) => (Array.isArray(f) && f[0] ? (typeof f[0] === "object" ? f[0].id : f[0]) : null);
    const u = usersRes.results.find((x: any) => x.id === id);
    if (!u) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy user" } }, 404);
    const userName = new Map<number, string>();
    for (const x of usersRes.results) userName.set(x.id, x.name || x.phone || x.email || `user ${x.id}`);
    const pets = petsRes.results
      .filter((p: any) => p.name && !p.deleted_at && oid(p.user_id) === id)
      .map((p: any) => ({ id: p.id, name: p.name, species: flat(p.species) || "other", qr_code: p.qr_code || "", created_at: p.created_at || null }));
    const handovers = hRes.results
      .filter((h: any) => h.from_user_id != null && (Number(h.from_user_id) === id || Number(h.to_user_id) === id))
      .map((h: any) => ({
        pet_name: flat(h.pet_name) || "",
        from: userName.get(Number(h.from_user_id)) || "user " + h.from_user_id,
        to: userName.get(Number(h.to_user_id)) || "user " + h.to_user_id,
        direction: Number(h.from_user_id) === id ? "out" : "in",
        created_at: h.created_at || null,
      }))
      .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return c.json({
      user: { id: u.id, name: u.name || null, phone: u.phone || null, email: u.email || null, tier: flat(u.foster_badge_tier) || null, created_at: u.created_at || null, petCount: pets.length },
      pets,
      handovers,
    });
  } catch (err) {
    console.error("[admin/user-detail] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== ADMIN DASHBOARD — pet detail (info + chủ + lịch sử trao) =====
adminRoute.get("/pets/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    const [petsRes, usersRes, hRes] = await Promise.all([
      listRows<any>("pets", { size: 200 }),
      listRows<any>("users", { size: 200 }),
      listRows<any>("foster_handovers" as any, { size: 200 }),
    ]);
    const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);
    const oid = (f: any) => (Array.isArray(f) && f[0] ? (typeof f[0] === "object" ? f[0].id : f[0]) : null);
    const hasPet = (f: any, pid: number) => Array.isArray(f) && f.some((v: any) => (v && typeof v === "object" ? v.id : v) === pid);
    const p = petsRes.results.find((x: any) => x.id === id);
    if (!p) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy bé" } }, 404);
    const userName = new Map<number, string>();
    for (const x of usersRes.results) userName.set(x.id, x.name || x.phone || x.email || `user ${x.id}`);
    const owner = oid(p.user_id);
    const handovers = hRes.results
      .filter((h: any) => h.from_user_id != null && hasPet(h.pet_id, id))
      .map((h: any) => ({
        from: userName.get(Number(h.from_user_id)) || "user " + h.from_user_id,
        to: userName.get(Number(h.to_user_id)) || "user " + h.to_user_id,
        created_at: h.created_at || null,
      }))
      .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return c.json({
      pet: {
        id: p.id, name: p.name, species: flat(p.species) || "other", qr_code: p.qr_code || "",
        ownerName: owner != null ? userName.get(Number(owner)) || "user " + owner : "—",
        created_at: p.created_at || null, deleted: !!p.deleted_at,
        // W-F: trạng thái foster để admin xem trước khi sửa
        foster_public: p.foster_public === true,
        foster_status: flat(p.foster_status) ?? null,
        is_public: p.is_public === true,
        public_slug: p.public_slug || null,
      },
      handovers,
    });
  } catch (err) {
    console.error("[admin/pet-detail] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== ADMIN — badge: tổng unread trong admin_support =====
adminRoute.get("/conversations/unread-count", async (c) => {
  const s = c.get("user");
  try {
    return c.json({ count: await getAdminSupportUnread(s.sub) });
  } catch (err) {
    console.error("[admin/conv-unread] error:", err);
    return c.json({ count: 0 });
  }
});

// ===== ADMIN — tất cả conversations (chat support/foster) =====
adminRoute.get("/conversations", async (c) => {
  try {
    return c.json({ conversations: await getAllConversations() });
  } catch (err) {
    console.error("[admin/conversations] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ============================================================
// GET /admin/stats
// ============================================================
adminRoute.get("/stats", async (c) => {
  try {
    const [usersRes, petsRes, alertsRes, vaccinesRes, plansRes, checkInsRes, handoversRes, reclaimRes] = await Promise.all([
      listRows<any>("users", { size: 200 }),
      listRows<any>("pets", { size: 200 }),
      listRows<any>("climate_alerts", { size: 200 }),
      listRows<any>("vaccines", { size: 200 }),
      listRows<any>("care_plans", { size: 50 }),
      listRows<any>("daily_check_ins", { size: 50 }),
      listRows<any>("foster_handovers" as any, { size: 200 }),
      listRows<any>("reclaim_requests" as any, { size: 200 }),
    ]);

    // Recent signups (7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentSignups = usersRes.results.filter((u: any) => {
      const ts = u.created_at ? new Date(u.created_at).getTime() : 0;
      return ts >= sevenDaysAgo;
    });

    // Active (not soft-deleted) users
    const activeUsers = usersRes.results.filter((u: any) => !u.deleted_at && u.phone);

    // Pets by species
    const speciesCounts: Record<string, number> = { dog: 0, cat: 0, other: 0 };
    for (const p of petsRes.results) {
      if (!p.name) continue; // skip stub rows
      const sp = typeof p.species === "object" ? p.species?.value : p.species;
      if (sp === "dog") speciesCounts.dog++;
      else if (sp === "cat") speciesCounts.cat++;
      else speciesCounts.other++;
    }

    // Active alerts (chưa dismiss)
    const activeAlerts = alertsRes.results.filter((a: any) => !a.dismissed_at && a.severity);

    // Care plans today
    const today = new Date().toISOString().slice(0, 10);
    const plansToday = plansRes.results.filter((p: any) => p.plan_date === today);

    // Vaccine reminders sent today (via notification_log)
    let vaccineRemindersToday = 0;
    try {
      const notifRes = await listRows<any>("notification_log", { size: 200 });
      vaccineRemindersToday = notifRes.results.filter((n: any) => {
        const sentAt = n.sent_at || n.created_at;
        if (!sentAt) return false;
        const t = typeof n.notification_type === "object" ? n.notification_type?.value : n.notification_type;
        return sentAt.startsWith(today) && t === "vaccine_reminder";
      }).length;
    } catch (_) {}

    // FOSTER admin overview — transfers + reclaims + activity feed + weekly buckets
    const handovers = handoversRes.results.filter((h: any) => h.from_user_id != null); // bỏ 2 row trống
    const transfersThisWeek = handovers.filter((h: any) => {
      const t = h.created_at ? new Date(h.created_at).getTime() : 0;
      return t >= sevenDaysAgo;
    }).length;
    const pendingReclaims = reclaimRes.results.filter((r: any) => String(r.status) === "pending").length;

    const userNameById = new Map<number, string>();
    for (const u of usersRes.results) userNameById.set(u.id, u.name || u.phone || `user ${u.id}`);
    const nm = (id: any) => userNameById.get(Number(id)) || `user ${id}`;
    const flatVal = (v: any) => (v && typeof v === "object" && "value" in v ? String(v.value) : v == null ? "" : String(v));

    const recentActivity = [
      ...handovers.map((h: any) => ({ type: "transfer", petName: flatVal(h.pet_name), userName: nm(h.from_user_id), createdAt: h.created_at })),
      ...reclaimRes.results
        .filter((r: any) => String(r.status) === "resolved")
        .map((r: any) => ({ type: "reclaim", petName: flatVal(r.pet_name), userName: flatVal(r.requester_name), createdAt: r.created_at })),
    ]
      .filter((a) => a.createdAt)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 10);

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const transfersByWeek = Array(8).fill(0); // index 7 = tuần này, 0 = 7 tuần trước
    for (const h of handovers) {
      const t = h.created_at ? new Date(h.created_at).getTime() : 0;
      if (!t) continue;
      const weeksAgo = Math.floor((nowMs - t) / WEEK_MS);
      if (weeksAgo >= 0 && weeksAgo < 8) transfersByWeek[7 - weeksAgo]++;
    }

    // L8: số chi phí AI thật đọc từ gemini-usage.log.jsonl (fail-soft → null nếu log lỗi).
    const aiCost = await aiCostSummary().catch(() => null);
    return c.json({
      transfers: { total: handovers.length, thisWeek: transfersThisWeek },
      pendingReclaims,
      recentActivity,
      transfersByWeek,
      users: {
        total: usersRes.count,
        active: activeUsers.length,
        recent_signups_7d: recentSignups.length,
        signups_list: recentSignups.slice(0, 10).map((u: any) => ({
          id: u.id,
          phone: u.phone,
          email: u.email || null,
          name: u.name || null,
          created_at: u.created_at,
        })),
      },
      pets: {
        total: petsRes.results.filter((p: any) => p.name).length,
        by_species: speciesCounts,
      },
      alerts: {
        total: alertsRes.count,
        active: activeAlerts.length,
        critical: activeAlerts.filter((a: any) => {
          const s = typeof a.severity === "object" ? a.severity?.value : a.severity;
          return s === "critical";
        }).length,
      },
      vaccines: {
        total: vaccinesRes.count,
        reminders_sent_today: vaccineRemindersToday,
      },
      care_plans: {
        total_today: plansToday.length,
        total_check_ins_recent: checkInsRes.count,
      },
      ai_cost: {
        today_usd: aiCost?.today_usd ?? 0,
        week_usd: aiCost?.week_usd ?? 0,
        month_usd: aiCost?.month_usd ?? 0,
        note: "Đọc thật từ gemini-usage.log.jsonl (aiCostSummary).",
      },
      admin: {
        whitelist_count: ADMIN_PHONES.length,
        whitelist_active: !!ADMIN_PHONES.length,
      },
    });
  } catch (err: any) {
    console.error("[admin/stats] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load stats" } }, 500);
  }
});

// ============================================================
// GET /admin/zalo-status — Zalo ZNS integration status + today usage + cost
// ============================================================

/** Zalo ZNS pricing (VNĐ per OTP message, approximate). */
const ZALO_OTP_COST_VND = 300;

adminRoute.get("/zalo-status", async (c) => {
  const status = getZaloStatus();
  const today = new Date().toISOString().slice(0, 10);

  // Count OTPs sent today from notification_log (type field stores message kind).
  // We don't have a dedicated "otp" type — OTP delivery is logged separately by sendOtp's
  // console hook. Best approximation: count messages from today where type doesn't match
  // the known push types. For accuracy, future iteration can add an "otp_zalo" type to
  // notification_log when ZNS sends.
  //
  // Phase 0: just count rows in notification_log per day as a rough usage proxy + show
  // a clearer hint for the admin.
  let otpsToday = 0;
  let totalNotificationsToday = 0;
  try {
    const res = await listRows<any>("notification_log", {
      filter: { sent_at__date_equal: today },
      size: 500,
    });
    totalNotificationsToday = res.count || 0;
    // For now we count `type=otp_zalo` rows if any; fallback to 0
    otpsToday = res.results.filter((n: any) => {
      const t = typeof n.type === "object" ? n.type?.value : n.type;
      return t === "otp_zalo";
    }).length;
  } catch (err) {
    console.error("[admin/zalo-status] notification_log read error:", err);
  }

  const estimatedCostVnd = otpsToday * ZALO_OTP_COST_VND;

  return c.json({
    status: {
      mode: status.mode,
      mode_label:
        status.mode === "zns_real"
          ? status.ready_for_real
            ? "Real ZNS active"
            : "Real ZNS mode set BUT credentials incomplete (auto-fallback to console)"
          : "Mock mode (free, console log)",
      oa_id: status.oa_id,
      has_access_token: status.has_access_token,
      has_template_id: status.has_template_id,
      has_app_id: status.has_app_id,
      ready_for_real: status.ready_for_real,
    },
    usage_today: {
      date: today,
      otps_sent_zalo: otpsToday,
      total_notifications: totalNotificationsToday,
      estimated_cost_vnd: estimatedCostVnd,
      estimated_cost_formatted: new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(estimatedCostVnd),
    },
    pricing: {
      per_otp_vnd: ZALO_OTP_COST_VND,
      note: "Approximate Zalo ZNS OTP template price (subject to Zalo's actual rate)",
    },
  });
});

// ============================================================
// POST /admin/zalo-test — gửi OTP test tới SĐT bất kỳ (admin only)
// ============================================================
adminRoute.post("/zalo-test", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const rawPhone = String(body.phone || "");
  if (!rawPhone) return c.json({ error: { code: "PHONE_REQUIRED", message: "Cần SĐT để test" } }, 400);

  let phone: string;
  try { phone = normalizePhone(rawPhone); }
  catch {
    return c.json({ error: { code: "INVALID_PHONE", message: "SĐT không hợp lệ" } }, 400);
  }

  // Generate test OTP (random 6-digit, not stored in real OTP store)
  const testCode = String(Math.floor(100000 + Math.random() * 900000));

  const result = await sendOtp(phone, testCode);

  return c.json({
    test: true,
    phone,
    code_sent: testCode, // visible vì là endpoint admin
    result,
    hint:
      result.mode === "mock"
        ? "Mock mode — code logged tới docker logs vowvet-api"
        : result.via === "zns"
        ? `Đã gửi qua Zalo ZNS thật. Phí ~${ZALO_OTP_COST_VND}đ.`
        : `Real mode nhưng fallback console (lỗi: ${result.error}). Code logged tới docker logs.`,
  });
});

// ============================================================
// GET /admin/analytics (M10) — overview
// ============================================================
adminRoute.get("/analytics", async (c) => {
  try {
    const overview = await adminAnalyticsOverview();
    return c.json(overview);
  } catch (err: any) {
    console.error("[admin/analytics] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load analytics" } }, 500);
  }
});

// ============================================================
// POST /admin/users/:id/disable
// ============================================================
adminRoute.post("/users/:id{[0-9]+}/disable", async (c) => {
  const session = c.get("user");
  const targetId = Number(c.req.param("id"));

  // Can't disable yourself
  if (targetId === session.sub) {
    return c.json({ error: { code: "SELF_DISABLE", message: "Không thể disable chính mình" } }, 400);
  }

  const target = await findUserById(targetId);
  if (!target) {
    return c.json({ error: { code: "NOT_FOUND", message: "User không tồn tại" } }, 404);
  }
  if (target.deleted_at) {
    return c.json({ success: true, already_disabled: true });
  }
  await softDeleteUser(targetId);
  console.log(`[admin] user ${targetId} disabled by admin ${session.phone}`);
  return c.json({ success: true });
});

// ============================================================
// GET /admin/export/users.csv
// ============================================================
adminRoute.get("/export/users", async (c) => {
  try {
    const res = await listRows<any>("users", { size: 200 });
    const rows = res.results.filter((u: any) => u.phone || u.email);
    const headers = ["id", "phone", "email", "name", "auth_method", "created_at", "last_login_at", "deleted_at"];
    const csv = [
      headers.join(","),
      ...rows.map((u: any) => {
        const am = typeof u.auth_method === "object" ? u.auth_method?.value : u.auth_method;
        return headers
          .map((h) => {
            let v = h === "auth_method" ? am : u[h];
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
          })
          .join(",");
      }),
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vowvet-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[admin/export/users] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi export" } }, 500);
  }
});

// ============================================================
// GET /admin/export/pets.csv
// ============================================================
adminRoute.get("/export/pets", async (c) => {
  try {
    const res = await listRows<any>("pets", { size: 200 });
    const rows = res.results.filter((p: any) => p.name);
    const headers = ["id", "name", "species", "breed", "dob", "gender", "weight_kg", "user_id", "qr_code", "created_at"];
    const csv = [
      headers.join(","),
      ...rows.map((p: any) => {
        return headers
          .map((h) => {
            let v: any = p[h];
            if (h === "species") v = typeof p.species === "object" ? p.species?.value : p.species;
            if (h === "gender") v = typeof p.gender === "object" ? p.gender?.value : p.gender;
            if (h === "user_id") {
              const links = Array.isArray(p.user_id) ? p.user_id : [];
              v = links.map((l: any) => l.id).join("|");
            }
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
          })
          .join(",");
      }),
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vowvet-pets-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[admin/export/pets] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi export" } }, 500);
  }
});

// ============================================================
// POST /admin/cron/test-care-plan-reminders — Phase 4D manual trigger
// Reuses runCarePlanRemindersJob() from lib/care-plan-reminders.ts
// (cron daily 7:15 AM Asia/Ho_Chi_Minh). Verifies the job logic without
// waiting for the next scheduled run. Returns the full CarePlanReminderReport.
// ============================================================
adminRoute.post("/cron/test-care-plan-reminders", async (c) => {
  try {
    const { runCarePlanRemindersJob } = await import("../lib/care-plan-reminders.ts");
    const report = await runCarePlanRemindersJob();
    return c.json({
      success: true,
      triggered_at: new Date().toISOString(),
      schedule: "15 7 * * * (daily 7:15 AM Asia/Ho_Chi_Minh)",
      report,
    });
  } catch (err: any) {
    console.error("[admin/cron/test-care-plan-reminders] error:", err);
    return c.json(
      { error: { code: "CRON_FAIL", message: err?.message || "Lỗi chạy cron test" } },
      500
    );
  }
});

// ============================================================
// POST /admin/cron/test-vaccine-reminders — manually trigger vaccine reminder cron
// Reuses runVaccineRemindersJob() from lib/vaccine-reminders.ts (M6, daily 8 AM VN).
// Allows verifying the job logic without waiting for the next scheduled run.
// Returns the full VaccineReminderReport so admin can see users_processed,
// vaccines_checked, pushes_sent, status_updated_overdue, errors, duration_ms.
// ============================================================
adminRoute.post("/cron/test-vaccine-reminders", async (c) => {
  try {
    const { runVaccineRemindersJob } = await import("../lib/vaccine-reminders.ts");
    const report = await runVaccineRemindersJob();
    return c.json({
      success: true,
      triggered_at: new Date().toISOString(),
      schedule: "0 8 * * * (daily 8 AM Asia/Ho_Chi_Minh)",
      report,
    });
  } catch (err: any) {
    console.error("[admin/cron/test-vaccine-reminders] error:", err);
    return c.json(
      { error: { code: "CRON_FAIL", message: err?.message || "Lỗi chạy cron test" } },
      500
    );
  }
});

// ============================================================
// Place moderation (duyệt place user thêm — Phase 1)
//   GET  /admin/places/pending     — list verified=false AND active=true
//   POST /admin/places/:id/verify  — set verified=true + verified_by/at
//   POST /admin/places/:id/reject  — set active=false (ẩn, GIỮ row)
// (đã sau requireAuth + requireAdmin qua adminRoute.use("*"))
// ============================================================
adminRoute.get("/places/pending", async (c) => {
  try {
    const places = await listPendingPlaces();
    return c.json({ places, total: places.length });
  } catch (err: any) {
    console.error("[admin/places/pending] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load place chờ duyệt" } }, 500);
  }
});

adminRoute.post("/places/:id{[0-9]+}/verify", async (c) => {
  const session = c.get("user");
  const placeId = Number(c.req.param("id"));
  const existing = await getPlace(placeId);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Place không tồn tại" } }, 404);
  }
  try {
    const place = await verifyPlace(placeId, session.sub);
    console.log(`[admin] place ${placeId} verified by admin ${session.phone}`);
    return c.json({ place });
  } catch (err: any) {
    console.error(`[admin/places/${placeId}/verify] error:`, err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi duyệt place" } }, 500);
  }
});

adminRoute.post("/places/:id{[0-9]+}/reject", async (c) => {
  const session = c.get("user");
  const placeId = Number(c.req.param("id"));
  const existing = await getPlace(placeId);
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "Place không tồn tại" } }, 404);
  }
  try {
    await rejectPlace(placeId);
    console.log(`[admin] place ${placeId} rejected (active=false) by admin ${session.phone}`);
    return c.json({ success: true });
  } catch (err: any) {
    console.error(`[admin/places/${placeId}/reject] error:`, err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi từ chối place" } }, 500);
  }
});
