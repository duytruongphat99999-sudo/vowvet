/**
 * Baserow REST client cho Phase 0 runtime.
 * Dùng database token (BASEROW_TOKEN), KHÔNG dùng JWT.
 * JWT chỉ dùng cho setup script (scripts/setup-baserow.ts).
 *
 * Mặc định dùng user_field_names=true để input/output dùng tên trường (dễ đọc).
 */
import { type TableName, tableId } from "./baserow-config.ts";

const BASEROW_URL = (process.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const BASEROW_TOKEN = process.env.BASEROW_TOKEN;

// Baserow's internal Caddy match Host header với BASEROW_PUBLIC_URL.
// Khi gọi từ container (qua host.docker.internal:8888), ta phải force
// Host header thành giá trị BASEROW_PUBLIC_URL của instance này.
// BASEROW_HOST_HEADER override được nếu instance Baserow dùng URL khác.
const BASEROW_HOST_HEADER = process.env.BASEROW_HOST_HEADER || "localhost:8888";

// Per-request timeout. Override via env BASEROW_TIMEOUT_MS for bulk ops (e.g. 30_000 in cron).
const BASEROW_TIMEOUT_MS = Number(process.env.BASEROW_TIMEOUT_MS) || 10_000;

if (!BASEROW_TOKEN) {
  console.warn("[baserow] BASEROW_TOKEN không có trong env — mọi request sẽ fail.");
}

export interface BaserowListParams {
  page?: number;
  size?: number;
  search?: string;
  orderBy?: string;
  filter?: Record<string, string | number | boolean>;
}

export interface BaserowListResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${BASEROW_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(BASEROW_TIMEOUT_MS),
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`,
        "Content-Type": "application/json",
        Host: BASEROW_HOST_HEADER,
        ...(init.headers || {}),
      },
    });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`Baserow ${init.method || "GET"} ${path} → TIMEOUT after ${BASEROW_TIMEOUT_MS}ms`);
    }
    throw new Error(`Baserow ${init.method || "GET"} ${path} → NETWORK: ${err?.message || err}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Baserow ${init.method || "GET"} ${path} → ${res.status}: ${body}`);
  }
  // DELETE thường trả 204 no-content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listRows<T = Record<string, unknown>>(
  table: TableName,
  params: BaserowListParams = {}
): Promise<BaserowListResponse<T>> {
  const id = tableId(table);
  const qs = new URLSearchParams({ user_field_names: "true" });
  if (params.page) qs.set("page", String(params.page));
  if (params.size) qs.set("size", String(params.size));
  if (params.search) qs.set("search", params.search);
  if (params.orderBy) qs.set("order_by", params.orderBy);
  if (params.filter) {
    for (const [k, v] of Object.entries(params.filter)) {
      qs.set(`filter__${k}`, String(v));
    }
  }
  return request<BaserowListResponse<T>>(`/api/database/rows/table/${id}/?${qs}`);
}

export async function getRow<T = Record<string, unknown>>(
  table: TableName,
  rowId: number
): Promise<T> {
  const id = tableId(table);
  return request<T>(`/api/database/rows/table/${id}/${rowId}/?user_field_names=true`);
}

export async function createRow<T = Record<string, unknown>>(
  table: TableName,
  data: Record<string, unknown>
): Promise<T> {
  const id = tableId(table);
  return request<T>(`/api/database/rows/table/${id}/?user_field_names=true`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRow<T = Record<string, unknown>>(
  table: TableName,
  rowId: number,
  data: Record<string, unknown>
): Promise<T> {
  const id = tableId(table);
  return request<T>(`/api/database/rows/table/${id}/${rowId}/?user_field_names=true`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteRow(table: TableName, rowId: number): Promise<void> {
  const id = tableId(table);
  await request<void>(`/api/database/rows/table/${id}/${rowId}/`, { method: "DELETE" });
}

/** Probe đơn giản: thử list 1 row từ users table. Trả true nếu Baserow đáp. */
export async function pingBaserow(): Promise<boolean> {
  try {
    await listRows("users", { size: 1 });
    return true;
  } catch (err) {
    console.error("[baserow] ping failed:", err);
    return false;
  }
}
