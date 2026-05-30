/**
 * Generic CRUD cho 4 health sub-resources: vaccines, dewormers, allergies_diet, health_events.
 * Tất cả linked tới pets qua pet_id (link_row).
 *
 * Phase 0: list + create + delete (không PATCH — user xoá rồi tạo lại đủ).
 * Ownership check phải làm ở caller (getOwnedPet trước khi gọi các function này).
 */
import { listRows, createRow, deleteRow, getRow } from "@shared/baserow.ts";
import type { TableName } from "@shared/baserow-config.ts";

export const HEALTH_TABLES = {
  vaccines: "vaccines",
  dewormers: "dewormers",
  allergies: "allergies_diet",
  events: "health_events",
} as const;

export type HealthResource = keyof typeof HEALTH_TABLES;

/** Liệt kê records cho 1 pet, desc theo date field tương ứng. */
export async function listHealthRecords<T = any>(
  resource: HealthResource,
  petId: number,
  limit = 100
): Promise<T[]> {
  const table = HEALTH_TABLES[resource] as TableName;
  // Date field varies per table:
  const dateField =
    resource === "vaccines" || resource === "dewormers"
      ? "administered_date"
      : resource === "events"
      ? "event_date"
      : null; // allergies không có date field

  const res = await listRows<T>(table, {
    filter: { pet_id__link_row_has: String(petId) },
    orderBy: dateField ? `-${dateField}` : undefined,
    size: limit,
  });
  return res.results;
}

/** Đếm records của 1 resource cho 1 pet (dùng cho completion calc). */
export async function countHealthRecords(resource: HealthResource, petId: number): Promise<number> {
  const table = HEALTH_TABLES[resource] as TableName;
  const res = await listRows(table, {
    filter: { pet_id__link_row_has: String(petId) },
    size: 1,
  });
  return res.count;
}

/** Đếm tổng records cho health section completion (>=1 = qualified). */
export async function countAllHealth(petId: number): Promise<{
  vaccines: number;
  dewormers: number;
  allergies: number;
  events: number;
}> {
  const [vaccines, dewormers, allergies, events] = await Promise.all([
    countHealthRecords("vaccines", petId),
    countHealthRecords("dewormers", petId),
    countHealthRecords("allergies", petId),
    countHealthRecords("events", petId),
  ]);
  return { vaccines, dewormers, allergies, events };
}

/** Create record với pet_id link tự động. */
export async function createHealthRecord<T = any>(
  resource: HealthResource,
  petId: number,
  data: Record<string, unknown>
): Promise<T> {
  const table = HEALTH_TABLES[resource] as TableName;
  return createRow<T>(table, { ...data, pet_id: [petId] });
}

/** Delete record. Caller phải verify ownership trước (qua getRecordAndVerifyOwner). */
export async function deleteHealthRecord(resource: HealthResource, recordId: number): Promise<void> {
  const table = HEALTH_TABLES[resource] as TableName;
  await deleteRow(table, recordId);
}

/**
 * Get record và verify rằng pet_id link match. Throw nếu không tồn tại hoặc không thuộc pet.
 * Caller dùng để DELETE: verify ownership chain pet → record.
 */
export async function getRecordAndVerifyPet(
  resource: HealthResource,
  recordId: number,
  petId: number
): Promise<any> {
  const table = HEALTH_TABLES[resource] as TableName;
  let row: any;
  try {
    row = await getRow(table, recordId);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("404")) {
      const e = new Error("Record không tồn tại");
      (e as any).status = 404;
      (e as any).code = "RECORD_NOT_FOUND";
      throw e;
    }
    throw err;
  }
  const linkedPetIds: number[] = (row.pet_id || []).map((p: any) => p.id);
  if (!linkedPetIds.includes(petId)) {
    const e = new Error("Record không thuộc pet này");
    (e as any).status = 403;
    (e as any).code = "FORBIDDEN";
    throw e;
  }
  return row;
}
