/**
 * FOSTER L5a — đơn góp gói (foster_orders).
 * Ghi đơn khi người góp bấm "Tiếp tục" trên chứng thư (public, chưa login).
 * Guard: CHỈ bé foster_public=true mới nhận đơn (chống đơn ma). order_code DUY NHẤT.
 * KHÔNG ghi địa chỉ foster vào đơn (③).
 */
import { listRows, createRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";
import { findPetBySlug } from "./slug.ts";

// foster_orders chưa nằm trong union TableName (typing) — cast; runtime đọc theo config.
const ORDERS = "foster_orders" as TableName;

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
}): Promise<{ order_code: string }> {
  const pet = (await findPetBySlug(input.pet_slug)) as any;
  if (!pet) throw new FosterOrderError("NOT_FOUND", "Không tìm thấy bé", 404);
  // GUARD: chỉ bé foster công khai mới nhận đơn.
  if (pet.foster_public !== true) throw new FosterOrderError("NOT_FOSTER", "Bé này hiện không nhận đơn góp", 403);

  // order_code duy nhất (retry nếu trùng).
  let code = genCode();
  for (let i = 0; i < 5 && (await codeExists(code)); i++) code = genCode();

  await createRow(ORDERS, {
    order_code: code,
    pet_id: [pet.id], // link_row = mảng row id
    pet_owner_id: extractOwnerId(pet.user_id),
    package_id: input.package_id,
    package_title: input.package_title,
    package_price: input.package_price,
    status: "mới",
    donor_name: (input.donor_name || "").trim() || null,
    created_at: new Date().toISOString(),
  });

  return { order_code: code };
}
