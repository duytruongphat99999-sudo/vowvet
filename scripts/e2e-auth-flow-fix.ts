/**
 * 8-scenario E2E for auth flow per spec.
 * Verifies: anonymous → public pages OK, anonymous → private redirects /login,
 * /onboarding never reachable without session.
 */
import { signSession } from "/app/shared/jwt.ts";

const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log("✅ " + name); pass++; }
  else { console.error("❌ " + name + (detail ? "\n   " + detail : "")); failures.push(name); fail++; }
}

async function check(label: string, opts: {
  path: string;
  cookie?: string;
  expectStatus: number;
  expectLocation?: string | RegExp;
}) {
  const headers: any = opts.cookie ? { cookie: opts.cookie } : {};
  const r = await fetch(`${WEB}${opts.path}`, { headers, redirect: "manual" });
  const loc = r.headers.get("location") || "";
  let cond = r.status === opts.expectStatus;
  if (cond && opts.expectLocation) {
    cond = opts.expectLocation instanceof RegExp
      ? opts.expectLocation.test(loc)
      : (loc === opts.expectLocation || loc.startsWith(opts.expectLocation));
  }
  if (cond) { console.log(`✅ ${label}`); pass++; }
  else { console.error(`❌ ${label}\n   got ${r.status} ${loc}`); failures.push(label); fail++; }
}

// ════════════════════════════════════════════════════════════
// Test 1: Anonymous → / → 200 landing (no redirect)
// ════════════════════════════════════════════════════════════
console.log("\n=== Test 1: Anonymous → / ===");
const home = await fetch(`${WEB}/`, { redirect: "manual" });
ok("GET / anonymous → 200 (landing rendered)", home.status === 200);
const homeHtml = await home.text();
ok("Landing contains 'Mon Min Pet' brand", homeHtml.includes("Mon Min Pet"));
ok("Landing contains 'Bắt đầu miễn phí' or fallback CTA",
  homeHtml.includes("Bắt đầu miễn phí") || homeHtml.includes("Bắt đầu"));

// ════════════════════════════════════════════════════════════
// Test 2: Anonymous → /onboarding → /login?return_to=/onboarding
// ════════════════════════════════════════════════════════════
console.log("\n=== Test 2: Anonymous → /onboarding ===");
await check("GET /onboarding anonymous → 302 /login?return_to=%2Fonboarding", {
  path: "/onboarding",
  expectStatus: 302,
  expectLocation: /^\/login\?return_to=%2Fonboarding/,
});

// ════════════════════════════════════════════════════════════
// Test 3: Anonymous → /dashboard → /login?return_to=/dashboard
// ════════════════════════════════════════════════════════════
console.log("\n=== Test 3: Anonymous → /dashboard ===");
await check("GET /dashboard anonymous → 302 /login?return_to=%2Fdashboard", {
  path: "/dashboard",
  expectStatus: 302,
  expectLocation: /^\/login\?return_to=%2Fdashboard/,
});

// ════════════════════════════════════════════════════════════
// Tests 4-6: Anonymous → public pages → 200
// ════════════════════════════════════════════════════════════
console.log("\n=== Test 4-6: Anonymous → public pages ===");
await check("GET /why-vowvet anonymous → 200", { path: "/why-vowvet", expectStatus: 200 });
await check("GET /community anonymous → 200",  { path: "/community", expectStatus: 200 });
await check("GET /leaderboard anonymous → 200",{ path: "/leaderboard", expectStatus: 200 });
await check("GET /faq anonymous → 200",        { path: "/faq", expectStatus: 200 });
await check("GET /insurance anonymous → 200",  { path: "/insurance", expectStatus: 200 });
await check("GET /login anonymous → 200",      { path: "/login", expectStatus: 200 });

// ════════════════════════════════════════════════════════════
// Test 7: Login → not-onboarded user → forced to /onboarding regardless of return_to
// (page-level behavior validated separately — here we test middleware redirects)
// ════════════════════════════════════════════════════════════
console.log("\n=== Test 7: Not-onboarded session → /onboarding accessible ===");
const notOnbToken = signSession(
  { sub: 999, phone: "+8499", email: "noonb@e2e", is_onboarded: false } as any,
  3600,
);
const notOnbCookie = `vowvet_session=${notOnbToken}`;

await check("not-onboarded GET /onboarding → 200 (renders form)", {
  path: "/onboarding", cookie: notOnbCookie, expectStatus: 200,
});
await check("not-onboarded GET /dashboard → 302 /onboarding?return_to=/dashboard", {
  path: "/dashboard", cookie: notOnbCookie,
  expectStatus: 302, expectLocation: /^\/onboarding\?return_to=%2Fdashboard/,
});
// Login as not-onboarded → still goes to /onboarding (login middleware bouncer)
await check("not-onboarded GET /login → /onboarding", {
  path: "/login", cookie: notOnbCookie,
  expectStatus: 302, expectLocation: "/onboarding",
});

// ════════════════════════════════════════════════════════════
// Test 8: Onboarded user → /onboarding redirects to /dashboard (no loop)
// ════════════════════════════════════════════════════════════
console.log("\n=== Test 8: Onboarded session → /onboarding bounces to /dashboard ===");
const onbToken = signSession(
  { sub: 10, phone: "+84900000010", is_onboarded: true } as any,
  3600,
);
const onbCookie = `vowvet_session=${onbToken}`;

await check("onboarded GET /onboarding → 302 /dashboard", {
  path: "/onboarding", cookie: onbCookie,
  expectStatus: 302, expectLocation: "/dashboard",
});
await check("onboarded GET /dashboard → 200", {
  path: "/dashboard", cookie: onbCookie, expectStatus: 200,
});
await check("onboarded GET /login → /dashboard", {
  path: "/login", cookie: onbCookie,
  expectStatus: 302, expectLocation: "/dashboard",
});

// ════════════════════════════════════════════════════════════
// Test 9 (bonus): Open-redirect blocked
// ════════════════════════════════════════════════════════════
console.log("\n=== Test 9: Open-redirect safety ===");
await check("login?return_to=//evil.com (onboarded) → /dashboard (NOT evil.com)", {
  path: "/login?return_to=%2F%2Fevil.com", cookie: onbCookie,
  expectStatus: 302, expectLocation: "/dashboard",
});

// (Defensive guard in onboarding.astro is verified indirectly by Test 2/7/8
// — anonymous gets 302 to /login, onboarded gets 302 to /dashboard. Belt-and-
// suspenders on the page itself was added but middleware already catches it.)

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
