/**
 * Astro middleware — route guards dựa trên JWT cookie.
 *
 * EXPLICIT priority order (no surprises):
 *   1. Static assets + /api/* → next()                     (let Vite/Astro handle)
 *   2. Path is PUBLIC                → next()              (no auth check at all)
 *   3. Not logged in + private path  → /login?return_to=…  (preserve original path)
 *   4. Logged in + visiting /login   → /onboarding or /dashboard
 *   5. Logged in + onboarded + on /onboarding → /dashboard
 *   6. Logged in + NOT onboarded     → /onboarding         (EXCEPT paths in ALLOW_NOT_ONBOARDED)
 *   7. Default                       → next()
 *
 * The `is_onboarded` field comes from JWT session payload (shared/jwt.ts).
 */
import { defineMiddleware } from "astro:middleware";
import { verifySession } from "../../shared/jwt.ts";
import { SESSION_COOKIE } from "../../shared/auth.ts";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  pickLocaleFromAcceptLanguage,
  type Locale,
} from "../../shared/i18n.ts";

// ────────────────────────────────────────────────────────────
// PUBLIC paths — no auth required, no onboarded check.
// Includes everything visible to anonymous visitors (landing,
// marketing, public profiles, leaderboards, FAQs, etc.) and
// auth pages themselves.
// ────────────────────────────────────────────────────────────
const PUBLIC_EXACT = new Set<string>([
  "/",                                // landing
  "/login",
  "/logout",
  "/health",
  "/food-brands",
  "/404", "/500", "/offline",
  "/why-vowvet",
  "/faq",
  "/triage",                          // tree picker is public; /triage/[petId] is NOT (see below)
  "/community",
  "/leaderboard",
  "/heroes/leaderboard",
  "/map",                             // explore map of places
  "/insurance",                       // insurance waitlist landing (PUBLIC for SEO)
]);

const PUBLIC_PREFIXES = [
  "/p/",                              // QR Passport detail
  "/birthday/",                       // Birthday wall public page
  "/personality/",                    // Personality result share page
  "/personality-card/",               // v140 — Wow Card public landing (QR target)
  "/account/reset-password",          // forgot-password flow
  "/places/",                         // place detail (but /places/new + /places/checkin are protected, see below)
  "/memorial/",                       // memorial share page
  "/playdate/safety-tips",            // safety tips PUBLIC for SEO
  "/heroes/",                         // hero profile + leaderboard
  "/faq/",                            // FAQ articles (sub-paths)
  "/articles/",                       // Premium long-form feature articles (PUBLIC for SEO)

  // API endpoints that are intentionally public
  "/api/v1/auth/",
  "/api/v1/playdate/safety-tips",
  "/api/v1/triage-tree/",
  "/api/v1/faqs/",
  "/api/v1/marketing/",
  "/api/v1/leaderboard",
  "/api/v1/community/feed",
  "/api/v1/public/",
  "/api/v1/insurance/",               // PUBLIC waitlist API

  // Static assets that don't go through the asset detector
  "/sounds/",
  "/logo-mmp.png",
  "/og-image",
];

// ────────────────────────────────────────────────────────────
// PROTECTED OVERRIDES — paths that LOOK public (sub-paths of a
// PUBLIC_PREFIX) but actually require auth. Checked BEFORE
// PUBLIC_PREFIXES match. Exact equality only.
// ────────────────────────────────────────────────────────────
const PROTECTED_OVERRIDES = new Set<string>([
  "/places/new",
  "/places/checkin",
  "/heroes/profile/me",
  "/lost/nearby",                     // "pets near me" requires auth
]);

// ────────────────────────────────────────────────────────────
// ALLOW NOT-ONBOARDED — paths that a logged-in-but-NOT-onboarded
// user is allowed to visit (without being force-redirected to
// /onboarding). Includes settings/account, the onboarding page
// itself, and public-ish areas where they can read about VowVet.
// ────────────────────────────────────────────────────────────
const ALLOW_NOT_ONBOARDED_EXACT = new Set<string>([
  "/onboarding",
  "/pets/new",                        // v269: luồng tạo bé + cam kết (cert) — user chưa onboarded vào đây
  "/settings",
  "/logout",
]);

const ALLOW_NOT_ONBOARDED_PREFIXES = [
  "/account/",                        // setup-password, connections, reset-password
  "/api/v1/me",                       // user info endpoint
  "/api/v1/auth/",
  "/api/v1/onboarding/",
];

// ────────────────────────────────────────────────────────────
// Static asset detector — files that bypass middleware entirely
// ────────────────────────────────────────────────────────────
function isStaticAsset(path: string): boolean {
  return (
    path.startsWith("/_astro/") ||
    path.startsWith("/_") ||
    path === "/favicon.svg" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/registerSW.js" ||
    /\.(css|js|svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/i.test(path)
  );
}

// Lost-pet slug detector: /lost/<6-16 lowercase alphanum>
// /lost/nearby is NOT a slug (handled by PROTECTED_OVERRIDES).
function isPublicLostSlug(path: string): boolean {
  const m = path.match(/^\/lost\/([a-z0-9]+)(?:\/sightings\/\d+)?$/);
  return !!m && m[1].length >= 6 && m[1].length <= 16 && m[1] !== "nearby";
}

// /triage = public (tree picker); /triage/<petId> = private (per-pet)
function isPublicTriageRoot(path: string): boolean {
  return path === "/triage";
}
function isPrivateTriagePerPet(path: string): boolean {
  return /^\/triage\/\d+/.test(path);
}

function isPublicPath(path: string): boolean {
  // Exact protected-override beats anything
  if (PROTECTED_OVERRIDES.has(path)) return false;
  // /triage exact = public, /triage/[id] = private
  if (isPublicTriageRoot(path)) return true;
  if (isPrivateTriagePerPet(path)) return false;
  // Exact set
  if (PUBLIC_EXACT.has(path)) return true;
  // Prefix set
  for (const prefix of PUBLIC_PREFIXES) {
    if (path === prefix.replace(/\/$/, "") || path.startsWith(prefix)) return true;
  }
  // Lost pet slug pages
  if (isPublicLostSlug(path)) return true;
  return false;
}

function allowsNotOnboarded(path: string): boolean {
  if (ALLOW_NOT_ONBOARDED_EXACT.has(path)) return true;
  for (const prefix of ALLOW_NOT_ONBOARDED_PREFIXES) {
    if (path === prefix.replace(/\/$/, "") || path.startsWith(prefix)) return true;
  }
  return false;
}

/** Safely build /login?return_to=<encoded-path>, dropping bad inputs. */
function loginWithReturnTo(path: string, search: string): string {
  // Validate: must be same-origin path (start with single /). Block protocol-relative + absolute URLs.
  if (!path.startsWith("/") || path.startsWith("//")) return "/login";
  if (path === "/login" || path === "/logout") return "/login";
  const full = path + (search || "");
  return `/login?return_to=${encodeURIComponent(full)}`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // ──────────────────────────────────────────────────────────
  // Step 1: static + /api/* — bypass entirely
  // ──────────────────────────────────────────────────────────
  if (path.startsWith("/api/")) {
    // /api/* still go to Vite proxy → vowvet-api. But we DO populate locals.user
    // for any Astro pages that read `Astro.locals.user` after — harmless to skip.
    return next();
  }
  if (isStaticAsset(path)) return next();

  // Parse session — used in multiple branches below.
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  context.locals.user = session;

  // ──────────────────────────────────────────────────────────
  // Locale detection (precedence: ?lang= → cookie → Accept-Language → default)
  // Sets context.locals.locale + persists in cookie when ?lang= override is used.
  // ──────────────────────────────────────────────────────────
  let locale: Locale = DEFAULT_LOCALE;
  const langParam = url.searchParams.get("lang");
  if (langParam && (SUPPORTED_LOCALES as string[]).includes(langParam)) {
    locale = langParam as Locale;
    context.cookies.set(LOCALE_COOKIE, locale, {
      httpOnly: false, sameSite: "lax", path: "/", maxAge: 365 * 24 * 3600,
    });
  } else {
    const cookieLoc = context.cookies.get(LOCALE_COOKIE)?.value;
    if (cookieLoc && (SUPPORTED_LOCALES as string[]).includes(cookieLoc)) {
      locale = cookieLoc as Locale;
    } else {
      const acceptLang = context.request.headers.get("accept-language");
      const detected = pickLocaleFromAcceptLanguage(acceptLang);
      if (detected) locale = detected;
    }
  }
  context.locals.locale = locale;

  const isLoggedIn = !!session;
  const isOnboarded = session?.is_onboarded === true;

  // ──────────────────────────────────────────────────────────
  // Step 2: PUBLIC path — never blocked
  // Exception: /login + landing "/" do their own gate for logged-in users.
  // ──────────────────────────────────────────────────────────
  if (isPublicPath(path)) {
    // /login — if already logged in, send them where they belong (UX nicety)
    if (path === "/login" && isLoggedIn) {
      // Honor return_to if present and safe
      const returnTo = url.searchParams.get("return_to");
      if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        // If they're onboarded, go to return_to; else /onboarding (with return_to preserved)
        if (isOnboarded) return context.redirect(returnTo);
        return context.redirect(`/onboarding?return_to=${encodeURIComponent(returnTo)}`);
      }
      return context.redirect(isOnboarded ? "/dashboard" : "/onboarding");
    }
    // Landing "/" — accessible to EVERYONE (anon + logged-in). Page itself adjusts
    // its CTA based on Astro.locals.user. Marketing pages should always be reachable
    // so people can share/return to the landing without being kicked into dashboard.
    return next();
  }

  // ──────────────────────────────────────────────────────────
  // Step 3: Not logged in + private path → /login?return_to=…
  // ──────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return context.redirect(loginWithReturnTo(path, url.search));
  }

  // ──────────────────────────────────────────────────────────
  // Step 4: Logged in + onboarded + on /onboarding → /dashboard
  // (logged-in user shouldn't loop in onboarding once done)
  // ──────────────────────────────────────────────────────────
  if (isOnboarded && path === "/onboarding") {
    const returnTo = url.searchParams.get("return_to");
    if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      return context.redirect(returnTo);
    }
    return context.redirect("/dashboard");
  }

  // ──────────────────────────────────────────────────────────
  // Step 5: Logged in + NOT onboarded → /onboarding
  // UNLESS the path explicitly allows not-onboarded visitors.
  // ──────────────────────────────────────────────────────────
  if (!isOnboarded) {
    if (allowsNotOnboarded(path)) return next();
    // Preserve where they were trying to go so onboarding completion can come back here.
    return context.redirect(`/onboarding?return_to=${encodeURIComponent(path + url.search)}`);
  }

  // ──────────────────────────────────────────────────────────
  // Step 6: Default — logged in + onboarded → pass through
  // ──────────────────────────────────────────────────────────
  return next();
});
