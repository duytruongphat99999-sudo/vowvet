/**
 * Zalo OAuth v4 login routes (Task B) — mirror Google OAuth (auth-google.ts), khác nhà cung cấp.
 *
 * Định danh bằng Zalo User ID (KHÔNG lấy SĐT). Profile Zalo v4 không trả email → user.email = null.
 *
 * Flow (Zalo OAuth v4 — PKCE BẮT BUỘC):
 *   GET /api/v1/auth/zalo
 *     → sinh state (chống CSRF) + code_verifier (PKCE), ký HMAC vào cookie HttpOnly 5 phút
 *     → redirect https://oauth.zaloapp.com/v4/permission?app_id&redirect_uri&code_challenge&state
 *   GET /api/v1/auth/zalo/callback
 *     → verify state khớp cookie → POST /v4/access_token (header secret_key + code_verifier)
 *     → GET graph.zalo.me/v2.0/me (lấy id/name/picture) → findOrCreate theo zalo_user_id → set session
 *
 * Bảo mật (repo public):
 *   - ZALO_APP_SECRET chỉ đọc từ env, KHÔNG hardcode, KHÔNG log, KHÔNG vào response.
 *   - state + code_verifier ký HMAC-SHA256 (JWT_SECRET) trong cookie HttpOnly → không tamper được.
 *   - access_token/secret KHÔNG bao giờ đưa vào URL/redirect/log.
 */
import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { setSessionCookie } from "../lib/session-cookie.ts";
import { signSession } from "@shared/jwt.ts";
import {
  findUserByZaloId,
  createUserViaZalo,
  touchLastLogin,
  getIsOnboarded,
} from "../lib/users.ts";

// ============================================================
// Config (chỉ đọc env — KHÔNG hardcode giá trị)
// ============================================================
const APP_ID = process.env.ZALO_APP_ID || "";
const APP_SECRET = process.env.ZALO_APP_SECRET || "";
const REDIRECT_URI =
  process.env.ZALO_REDIRECT_URI ||
  "https://vowvet.monminpet.com/api/v1/auth/zalo/callback";
const JWT_SECRET = process.env.JWT_SECRET || "";

const ZALO_STATE_COOKIE = "vowvet_zalo_state";
const ZALO_STATE_TTL_SEC = 5 * 60; // 5 min

const PERMISSION_URL = "https://oauth.zaloapp.com/v4/permission";
const TOKEN_URL = "https://oauth.zaloapp.com/v4/access_token";
const GRAPH_ME_URL = "https://graph.zalo.me/v2.0/me";

if (!APP_ID || !APP_SECRET) {
  console.warn(
    "[auth-zalo] ZALO_APP_ID/ZALO_APP_SECRET chưa cấu hình — endpoint sẽ trả 503."
  );
}

// ============================================================
// State cookie (HMAC-signed JSON) — giữ luôn PKCE code_verifier
// ============================================================
interface StatePayload {
  state: string; // 64 hex chars random (CSRF)
  verifier: string; // PKCE code_verifier
  exp: number; // unix seconds
}

function signState(payload: StatePayload): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = createHmac("sha256", JWT_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyState(raw: string | undefined): StatePayload | null {
  if (!raw || !JWT_SECRET) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expectedSig = createHmac("sha256", JWT_SECRET).update(b64).digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (expectedSig.length !== providedSig.length) return null;
  if (!timingSafeEqual(expectedSig, providedSig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as StatePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** PKCE: code_challenge = base64url(SHA256(code_verifier)). */
function makeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function buildPermissionUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    app_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    state,
  });
  return `${PERMISSION_URL}?${params}`;
}

function setStateCookie(c: any, payload: StatePayload): void {
  setCookie(c, ZALO_STATE_COOKIE, signState(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: ZALO_STATE_TTL_SEC,
    path: "/",
  });
}

// ============================================================
// Zalo API calls
// ============================================================
/** Đổi authorization code → access_token (PKCE + secret_key header). KHÔNG log token/secret. */
async function exchangeCode(code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    app_id: APP_ID,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: APP_SECRET,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    // KHÔNG in body (có thể chứa token) — chỉ status.
    throw new Error(`Zalo access_token HTTP ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string; error?: number };
  if (!json.access_token) {
    throw new Error(`Zalo access_token error=${json.error ?? "?"}`);
  }
  return json.access_token;
}

interface ZaloProfile {
  id: string;
  name: string | null;
  avatar: string | null;
}

/** Lấy Zalo user id + name + avatar. id chính là Zalo User ID để định danh. */
async function fetchProfile(accessToken: string): Promise<ZaloProfile> {
  const res = await fetch(`${GRAPH_ME_URL}?fields=id,name,picture`, {
    headers: { access_token: accessToken },
  });
  if (!res.ok) {
    throw new Error(`Zalo profile HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    id?: string;
    name?: string;
    picture?: { data?: { url?: string } };
    error?: number;
  };
  if (!json.id) {
    throw new Error(`Zalo profile error=${json.error ?? "?"}`);
  }
  return {
    id: String(json.id),
    name: json.name || null,
    avatar: json.picture?.data?.url || null,
  };
}

// ============================================================
// Routes
// ============================================================
export const authZaloRoute = new Hono();

// ===== GET /auth/zalo — start login flow =====
authZaloRoute.get("/", async (c) => {
  if (!APP_ID || !APP_SECRET) {
    return c.json(
      { error: { code: "ZALO_NOT_CONFIGURED", message: "Đăng nhập Zalo chưa được cấu hình" } },
      503
    );
  }
  const state = randomBytes(32).toString("hex");
  // PKCE code_verifier: 43 ký tự URL-safe (base64url của 32 byte).
  const verifier = randomBytes(32).toString("base64url");
  setStateCookie(c, {
    state,
    verifier,
    exp: Math.floor(Date.now() / 1000) + ZALO_STATE_TTL_SEC,
  });
  return c.redirect(buildPermissionUrl(state, makeCodeChallenge(verifier)));
});

// ===== GET /auth/zalo/callback — handle login =====
authZaloRoute.get("/callback", async (c) => {
  if (!APP_ID || !APP_SECRET) {
    return c.json(
      { error: { code: "ZALO_NOT_CONFIGURED", message: "Đăng nhập Zalo chưa được cấu hình" } },
      503
    );
  }

  const queryState = c.req.query("state");
  const code = c.req.query("code");
  const errorParam = c.req.query("error");

  // Xoá state cookie bất kể kết quả.
  const cookieRaw = getCookie(c, ZALO_STATE_COOKIE);
  deleteCookie(c, ZALO_STATE_COOKIE, { path: "/" });

  if (errorParam) {
    // User từ chối cấp quyền — không lộ chi tiết kỹ thuật.
    return c.redirect("/login?error=zalo_denied");
  }
  if (!code || !queryState) {
    return c.redirect("/login?error=zalo_missing_params");
  }

  const statePayload = verifyState(cookieRaw);
  if (!statePayload || statePayload.state !== queryState) {
    return c.redirect("/login?error=zalo_state_mismatch");
  }

  let profile: ZaloProfile;
  try {
    const accessToken = await exchangeCode(code, statePayload.verifier);
    profile = await fetchProfile(accessToken);
  } catch (err) {
    // Log message thôi (đã bảo đảm không chứa token/secret), KHÔNG lộ ra user.
    console.error("[auth-zalo] exchange/profile failed:", err instanceof Error ? err.message : err);
    return c.redirect("/login?error=zalo_exchange_failed");
  }

  if (!profile.id) {
    return c.redirect("/login?error=zalo_missing_user");
  }

  // Case A: returning Zalo user
  const existing = await findUserByZaloId(profile.id);
  if (existing) {
    if ((existing as any).deleted_at) {
      return c.redirect("/login?error=account_deleted");
    }
    await touchLastLogin(existing.id);
    const is_onboarded = await getIsOnboarded(existing.id);
    const token = signSession({
      sub: existing.id,
      phone: existing.phone || undefined,
      email: (existing as any).email || undefined,
      is_onboarded,
    });
    setSessionCookie(c, token);
    return c.redirect(is_onboarded ? "/dashboard" : "/onboarding");
  }

  // Case B: brand new Zalo user → create (email=null, định danh thuần zalo_user_id)
  try {
    const newUser = await createUserViaZalo({
      zalo_user_id: profile.id,
      name: profile.name,
      avatar_url: profile.avatar,
    });
    const token = signSession({
      sub: newUser.id,
      phone: undefined,
      email: undefined,
      is_onboarded: false,
    });
    setSessionCookie(c, token);
    return c.redirect("/onboarding");
  } catch (err) {
    console.error("[auth-zalo] createUserViaZalo failed:", err instanceof Error ? err.message : err);
    return c.redirect("/login?error=zalo_create_failed");
  }
});
