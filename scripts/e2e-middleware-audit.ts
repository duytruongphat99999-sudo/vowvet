/**
 * Audit current middleware: which paths redirect a logged-in-NOT-onboarded user?
 */
import { signSession } from "/app/shared/jwt.ts";

const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";

// Forge token with is_onboarded=FALSE
const notOnboardedToken = signSession(
  { sub: 10, phone: "+84900000010", email: "noonboard@test", is_onboarded: false } as any,
  3600,
);
const notOnboardedCookie = `vowvet_session=${notOnboardedToken}`;

// Anonymous cookie (no session)
const anonCookie = "";

const PATHS = [
  // Spec says these should be accessible to NOT-onboarded:
  "/why-vowvet", "/faq", "/community", "/leaderboard",
  "/playdate/safety-tips", "/heroes/leaderboard",
  "/login", "/account/setup-password",
  // Sanity: private pages should redirect to /onboarding for not-onboarded
  "/dashboard", "/pets/12", "/settings",
  // Should redirect to /login for anonymous
];

console.log("=== Logged-in NOT onboarded ===");
for (const p of PATHS) {
  const r = await fetch(`${WEB}${p}`, { headers: { cookie: notOnboardedCookie }, redirect: "manual" });
  const loc = r.headers.get("location") || "";
  console.log(`${r.status.toString().padEnd(3)} ${p.padEnd(32)} ${loc ? "→ " + loc : ""}`);
}

console.log("\n=== Anonymous (no cookie) ===");
for (const p of PATHS) {
  const r = await fetch(`${WEB}${p}`, { redirect: "manual" });
  const loc = r.headers.get("location") || "";
  console.log(`${r.status.toString().padEnd(3)} ${p.padEnd(32)} ${loc ? "→ " + loc : ""}`);
}
