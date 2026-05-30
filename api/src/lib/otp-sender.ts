/**
 * OTP delivery layer — Zalo ZNS với toggle mock / real.
 *
 * Modes (qua env ZALO_MODE):
 *   - "mock" (default): console.log OTP, không gọi external API. Đủ cho dev/pilot.
 *   - "zns_real" hoặc "production": gọi Zalo ZNS API thật.
 *     Cần: ZALO_ZNS_ACCESS_TOKEN + ZALO_ZNS_TEMPLATE_ID (+ ZALO_OA_ID cho logging).
 *     Backward compat: vẫn accept ZALO_OA_ACCESS_TOKEN + ZALO_OA_TEMPLATE_ID.
 *     Graceful fallback: nếu Zalo fail → console.log OTP, KHÔNG block user.
 *
 * Quy tắc:
 *   - Hàm này KHÔNG throw (caller không cần try/catch).
 *   - Trả SendResult để route hoặc test biết kênh thực dùng (mock/zns/fallback).
 *   - Logs prefix phân biệt kênh:
 *       [ZALO OTP MOCK]       — mock mode (default)
 *       [ZALO OTP SENT]       — real mode + Zalo trả error=0
 *       [ZALO OTP FALLBACK]   — real mode + Zalo fail → fallback console.log
 *       [ZALO OTP ERROR]      — real mode + unexpected error (vẫn fallback)
 */

export type ZaloMode = "mock" | "zns_real";

export interface SendResult {
  /** Code đã được "gửi" thành công tới user (true ngay cả khi fallback console.log). */
  sent: boolean;
  /** Mode lúc gọi. */
  mode: ZaloMode;
  /** Kênh thực sự dùng: "console" (mock hoặc fallback) hoặc "zns" (Zalo). */
  via: "console" | "zns";
  /** True nếu mode=zns_real nhưng phải fallback console do Zalo lỗi. */
  fallback: boolean;
  /** Error message nếu fallback (chỉ cho logs/test). */
  error?: string;
}

const ZALO_API_URL = "https://business.openapi.zalo.me/message/template";

function currentMode(): ZaloMode {
  const raw = (process.env.ZALO_MODE || "mock").toLowerCase().trim();
  // Accept multiple aliases for backward compat:
  //   "mock" → mock
  //   "zns_real" | "production" | "real" → zns_real
  if (raw === "zns_real" || raw === "production" || raw === "real") return "zns_real";
  return "mock";
}

/** Read Zalo creds, prefer new ZALO_ZNS_* over legacy ZALO_OA_*. */
function readZnsConfig(): { accessToken?: string; templateId?: string; oaId?: string; appId?: string } {
  return {
    accessToken:
      process.env.ZALO_ZNS_ACCESS_TOKEN || process.env.ZALO_OA_ACCESS_TOKEN || "",
    templateId:
      process.env.ZALO_ZNS_TEMPLATE_ID || process.env.ZALO_OA_TEMPLATE_ID || "",
    oaId: process.env.ZALO_OA_ID || "",
    appId: process.env.ZALO_ZNS_APP_ID || "",
  };
}

interface ZaloResponse {
  error: number; // 0 = success, mọi giá trị khác = failure
  message?: string;
  data?: unknown;
}

/**
 * Chuyển phone từ +84xxxxxxxxx → 84xxxxxxxxx (Zalo yêu cầu không có dấu +).
 * Input đã được normalize bởi caller (luôn dạng +84xxx).
 */
function phoneForZalo(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : phone;
}

async function sendViaZalo(
  phone: string,
  code: string,
  config: { accessToken: string; templateId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = {
    phone: phoneForZalo(phone),
    template_id: config.templateId,
    template_data: { otp: code },
    tracking_id: `vowvet-otp-${Date.now()}`,
  };

  let res: Response;
  try {
    res = await fetch(ZALO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: config.accessToken,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    return { ok: false, error: `network: ${err?.message || err}` };
  }

  if (!res.ok) {
    return { ok: false, error: `http ${res.status}: ${await res.text().catch(() => "<no body>")}` };
  }

  let json: ZaloResponse;
  try {
    json = (await res.json()) as ZaloResponse;
  } catch (err: any) {
    return { ok: false, error: `parse: ${err?.message || err}` };
  }

  if (json.error !== 0) {
    return { ok: false, error: `zalo error=${json.error} message=${json.message || "?"}` };
  }
  return { ok: true };
}

/**
 * Gửi OTP tới phone. KHÔNG throw — luôn trả SendResult.
 *
 * Phase 0 contract: caller treat mọi case là success cho user (graceful fallback).
 * Admin xem logs để biết kênh thực dùng + error nếu có.
 */
export async function sendOtp(phone: string, code: string): Promise<SendResult> {
  const mode = currentMode();

  // ===== MOCK mode (default) =====
  if (mode === "mock") {
    console.log(`[ZALO OTP MOCK] phone=${phone} code=${code}`);
    return { sent: true, mode: "mock", via: "console", fallback: false };
  }

  // ===== REAL ZNS mode =====
  const cfg = readZnsConfig();

  if (!cfg.accessToken || !cfg.templateId) {
    // Real mode được set nhưng creds chưa đủ → graceful fallback.
    console.warn(
      `[ZALO OTP FALLBACK] ZALO_MODE=zns_real nhưng thiếu ZALO_ZNS_ACCESS_TOKEN hoặc ZALO_ZNS_TEMPLATE_ID. ` +
        `Fallback console.log: phone=${phone} code=${code}`
    );
    return {
      sent: true,
      mode: "zns_real",
      via: "console",
      fallback: true,
      error: "missing_credentials",
    };
  }

  // Try Zalo ZNS
  try {
    const result = await sendViaZalo(phone, code, {
      accessToken: cfg.accessToken,
      templateId: cfg.templateId,
    });
    if (result.ok) {
      console.log(`[ZALO OTP SENT] phone=${phone} via=zns oa_id=${cfg.oaId || "?"}`);
      return { sent: true, mode: "zns_real", via: "zns", fallback: false };
    }
    // Zalo trả lỗi → fallback console.log
    console.warn(
      `[ZALO OTP FALLBACK] Zalo ZNS fail (${result.error}). Fallback console.log: ` +
        `phone=${phone} code=${code}`
    );
    return {
      sent: true,
      mode: "zns_real",
      via: "console",
      fallback: true,
      error: result.error,
    };
  } catch (err: any) {
    // Defensive: bất kỳ lỗi nào không expect → fallback + log
    console.error(
      `[ZALO OTP ERROR] Unexpected error gọi Zalo: ${err?.message || err}. ` +
        `Fallback console.log: phone=${phone} code=${code}`
    );
    return {
      sent: true,
      mode: "zns_real",
      via: "console",
      fallback: true,
      error: `unexpected: ${err?.message || err}`,
    };
  }
}

/** Test helper — đọc mode hiện tại (cho admin/health check). */
export function getOtpMode(): ZaloMode {
  return currentMode();
}

/** Admin snapshot: mode + credential presence (KHÔNG expose value của token). */
export interface ZaloStatus {
  mode: ZaloMode;
  oa_id: string | null;
  has_access_token: boolean;
  has_template_id: boolean;
  has_app_id: boolean;
  ready_for_real: boolean; // true nếu mode=zns_real + đủ creds (sẽ thực sự gửi qua ZNS)
}

export function getZaloStatus(): ZaloStatus {
  const mode = currentMode();
  const cfg = readZnsConfig();
  const has_access_token = !!cfg.accessToken;
  const has_template_id = !!cfg.templateId;
  return {
    mode,
    oa_id: cfg.oaId || null,
    has_access_token,
    has_template_id,
    has_app_id: !!cfg.appId,
    ready_for_real: mode === "zns_real" && has_access_token && has_template_id,
  };
}
