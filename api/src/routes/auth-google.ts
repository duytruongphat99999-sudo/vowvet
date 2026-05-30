/**
 * Google OAuth routes (M8).
 *
 * Flow 1 — LOGIN (anonymous user):
 *   GET /api/v1/auth/google                 → redirect to Google consent
 *   GET /api/v1/auth/google/callback?...    → handle code, login or create user
 *
 * Flow 2 — LINK (existing phone OTP user):
 *   GET /api/v1/users/me/link-google        → require auth, redirect to consent (state.flow=link, state.uid=session.sub)
 *   Same callback URL handles both flows via state cookie
 *
 * Security:
 *   - State token: 32-byte random hex, stored signed (HMAC-SHA256) trong HttpOnly cookie 5 min
 *   - CSRF check: callback state query param phải match cookie state
 *   - Email collision policy: EXPLICIT linking ONLY. Login flow gặp email match nhưng oauth_id null → reject với code EMAIL_EXISTS
 */
import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireAuth } from "../middleware/auth.ts";
import { setSessionCookie } from "../lib/session-cookie.ts";
import { signSession } from "@shared/jwt.ts";
import {
  findUserById,
  findUserByEmail,
  findUserByGoogleOauthId,
  createUserViaGoogle,
  linkUserToGoogle,
  touchLastLogin,
  getIsOnboarded,
} from "../lib/users.ts";

// ============================================================
// Config
// ============================================================
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  "https://vowvet.monminpet.com/api/v1/auth/google/callback";
const JWT_SECRET = process.env.JWT_SECRET || "";

const OAUTH_STATE_COOKIE = "vowvet_oauth_state";
const OAUTH_STATE_TTL_SEC = 5 * 60; // 5 min

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn(
    "[auth-google] GOOGLE_OAUTH_CLIENT_ID/SECRET chưa cấu hình — endpoint sẽ trả 503."
  );
}

// ============================================================
// State cookie helpers (HMAC-signed JSON)
// ============================================================

interface StatePayload {
  state: string; // 64 hex chars random
  flow: "login" | "link";
  uid?: number; // chỉ khi flow=link
  exp: number; // unix seconds
}

function signState(payload: StatePayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf-8").toString("base64url");
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
    const json = Buffer.from(b64, "base64url").toString("utf-8");
    const payload = JSON.parse(json) as StatePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const params = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

interface GoogleUserInfo {
  sub: string; // unique Google ID
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<GoogleUserInfo>;
}

function setStateCookie(c: any, statePayload: StatePayload): void {
  setCookie(c, OAUTH_STATE_COOKIE, signState(statePayload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: OAUTH_STATE_TTL_SEC,
    path: "/",
  });
}

// ============================================================
// Routes
// ============================================================
export const authGoogleRoute = new Hono();

// ===== GET /auth/google — start login flow =====
authGoogleRoute.get("/", async (c) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return c.json(
      { error: { code: "OAUTH_NOT_CONFIGURED", message: "Google OAuth chưa được cấu hình" } },
      503
    );
  }
  const state = randomBytes(32).toString("hex");
  setStateCookie(c, {
    state,
    flow: "login",
    exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SEC,
  });
  return c.redirect(buildAuthorizeUrl(state));
});

// ===== GET /auth/google/callback — handle login + link callback =====
authGoogleRoute.get("/callback", async (c) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return c.json(
      { error: { code: "OAUTH_NOT_CONFIGURED", message: "Google OAuth chưa được cấu hình" } },
      503
    );
  }

  const queryState = c.req.query("state");
  const code = c.req.query("code");
  const errorParam = c.req.query("error");

  // Cleanup state cookie regardless of outcome
  const cookieRaw = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/" });

  if (errorParam) {
    return c.redirect(`/login?error=oauth_${encodeURIComponent(errorParam)}`);
  }
  if (!code || !queryState) {
    return c.redirect("/login?error=oauth_missing_params");
  }

  // Verify state cookie
  const statePayload = verifyState(cookieRaw);
  if (!statePayload || statePayload.state !== queryState) {
    return c.redirect("/login?error=oauth_state_mismatch");
  }

  // Exchange + fetch user
  let guser: GoogleUserInfo;
  try {
    const tokens = await exchangeCode(code);
    guser = await fetchUserInfo(tokens.access_token);
  } catch (err) {
    console.error("[auth-google] exchange/userinfo failed:", err);
    return c.redirect("/login?error=oauth_exchange_failed");
  }

  if (!guser.email || !guser.sub) {
    return c.redirect("/login?error=oauth_missing_user");
  }
  if (!guser.email_verified) {
    return c.redirect("/login?error=oauth_email_unverified");
  }

  // Branch by flow
  if (statePayload.flow === "link") {
    return await handleLinkCallback(c, guser, statePayload.uid || 0);
  }
  return await handleLoginCallback(c, guser);
});

async function handleLoginCallback(c: any, guser: GoogleUserInfo) {
  // Case A: returning Google user
  const existing = await findUserByGoogleOauthId(guser.sub);
  if (existing) {
    if ((existing as any).deleted_at) {
      return c.redirect("/login?error=account_deleted");
    }
    await touchLastLogin(existing.id);
    const is_onboarded = await getIsOnboarded(existing.id);
    const token = signSession({
      sub: existing.id,
      phone: existing.phone || undefined,
      email: (existing as any).email || guser.email,
      is_onboarded,
    });
    setSessionCookie(c, token);
    return c.redirect(is_onboarded ? "/dashboard" : "/onboarding");
  }

  // Case B: email already exists but no google_oauth_id → REJECT (explicit linking only)
  const byEmail = await findUserByEmail(guser.email);
  if (byEmail) {
    return c.redirect("/login?error=email_exists");
  }

  // Case C: brand new user → create
  try {
    const newUser = await createUserViaGoogle({
      email: guser.email,
      google_oauth_id: guser.sub,
      name: guser.name || guser.given_name || null,
      avatar_url: guser.picture || null,
    });
    const token = signSession({
      sub: newUser.id,
      phone: undefined,
      email: guser.email,
      is_onboarded: false,
    });
    setSessionCookie(c, token);
    return c.redirect("/onboarding");
  } catch (err) {
    console.error("[auth-google] createUserViaGoogle failed:", err);
    return c.redirect("/login?error=oauth_create_failed");
  }
}

async function handleLinkCallback(c: any, guser: GoogleUserInfo, uid: number) {
  if (!uid) {
    return c.redirect("/settings?error=link_no_session");
  }
  const user = await findUserById(uid);
  if (!user || (user as any).deleted_at) {
    return c.redirect("/login?error=session_invalid");
  }

  // Prevent linking same google_oauth_id to multiple accounts
  const dupOauth = await findUserByGoogleOauthId(guser.sub);
  if (dupOauth && dupOauth.id !== user.id) {
    return c.redirect("/settings?error=google_linked_other");
  }

  // Prevent linking if email already used by another account
  const dupEmail = await findUserByEmail(guser.email);
  if (dupEmail && dupEmail.id !== user.id) {
    return c.redirect("/settings?error=email_taken");
  }

  try {
    await linkUserToGoogle(user.id, {
      email: guser.email,
      google_oauth_id: guser.sub,
      avatar_url: guser.picture || null,
    });
    // Refresh session với email mới
    const is_onboarded = await getIsOnboarded(user.id);
    const token = signSession({
      sub: user.id,
      phone: user.phone || undefined,
      email: guser.email,
      is_onboarded,
    });
    setSessionCookie(c, token);
    return c.redirect("/settings?linked=google");
  } catch (err) {
    console.error("[auth-google] linkUserToGoogle failed:", err);
    return c.redirect("/settings?error=link_failed");
  }
}

// ============================================================
// LINK flow initiation — requires auth (mount tại /users/me/link-google)
// ============================================================
export const googleLinkRoute = new Hono();
googleLinkRoute.use("*", requireAuth);

googleLinkRoute.get("/me/link-google", async (c) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return c.json(
      { error: { code: "OAUTH_NOT_CONFIGURED", message: "Google OAuth chưa được cấu hình" } },
      503
    );
  }
  const session = c.get("user");
  const state = randomBytes(32).toString("hex");
  setStateCookie(c, {
    state,
    flow: "link",
    uid: session.sub,
    exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SEC,
  });
  return c.redirect(buildAuthorizeUrl(state));
});
