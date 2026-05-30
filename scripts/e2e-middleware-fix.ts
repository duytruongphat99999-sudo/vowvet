/**
 * E2E for middleware fix:
 *   Test 1: Logged-in NOT-onboarded → public pages return 200 (not /onboarding)
 *   Test 2: Logged-in NOT-onboarded → private pages → /onboarding (with return_to)
 *   Test 3: Anonymous → private page → /login?return_to=…
 *   Test 4: Onboarded user visits /onboarding → /dashboard
 *   Test 5: /places/new is protected even though /places/ prefix is public
 *   Test 6: /triage = public; /triage/:id = private (per-pet)
 *   Test 7: Logged-in onboarded visiting /login → /dashboard
 */
import { signSession } from "/app/shared/jwt.ts";

const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";

function makeCookie(isOnboarded: boolean): string {
  const tok = signSession(
    { sub: 10, phone: "+84900000010", email: "test@e2e", is_onboarded: isOnboarded } as any,
    3600,
  );
  return `vowvet_session=${tok}`;
}

const notOnboarded = makeCookie(false);
const onboarded = makeCookie(true);

let pass = 0, fail = 0;
const failures: string[] = [];

async function check(name: string, opts: {
  path: string;
  cookie?: string;
  expectStatus: number;
  expectLocation?: string | RegExp;
}): Promise<void> {
  const headers: any = opts.cookie ? { cookie: opts.cookie } : {};
  const r = await fetch(`${WEB}${opts.path}`, { headers, redirect: "manual" });
  const loc = r.headers.get("location") || "";
  let ok = r.status === opts.expectStatus;
  if (ok && opts.expectLocation) {
    if (opts.expectLocation instanceof RegExp) {
      ok = opts.expectLocation.test(loc);
    } else {
      ok = loc === opts.expectLocation || loc.startsWith(opts.expectLocation);
    }
  }
  if (ok) { console.log(`✅ ${name}`); pass++; }
  else {
    console.error(`❌ ${name}\n   ${r.status} ${loc}`);
    failures.push(name);
    fail++;
  }
}

// ════════════════════════════════════════════════════════════
// Test 1: Logged-in NOT-onboarded — public pages return 200
// ════════════════════════════════════════════════════════════
console.log("\n=== 1. Not-onboarded user can browse PUBLIC pages ===");
const publicForNotOnboarded = [
  "/why-vowvet", "/faq", "/community", "/leaderboard",
  "/playdate/safety-tips", "/heroes/leaderboard",
  "/food-brands",
];
for (const p of publicForNotOnboarded) {
  await check(`not-onboarded GET ${p}`, {
    path: p, cookie: notOnboarded, expectStatus: 200,
  });
}

// Account-setup paths must work for not-onboarded (per spec)
console.log("\n=== 1b. Not-onboarded ON ALLOW-LIST paths ===");
await check("not-onboarded GET /onboarding", {
  path: "/onboarding", cookie: notOnboarded, expectStatus: 200,
});
// /account/setup-password may 200 (form) or 302 (if user already has password — page-level redirect, not middleware).
const setupRes = await fetch(`${WEB}/account/setup-password`, { headers: { cookie: notOnboarded }, redirect: "manual" });
const setupLoc = setupRes.headers.get("location") || "";
const setupOk = setupRes.status === 200 || (setupRes.status === 302 && !setupLoc.startsWith("/onboarding"));
if (setupOk) { console.log("✅ not-onboarded GET /account/setup-password (200 or non-onboarding redirect)"); pass++; }
else { console.error(`❌ /account/setup-password → ${setupRes.status} ${setupLoc}`); fail++; failures.push("setup-password"); }

// ════════════════════════════════════════════════════════════
// Test 2: Logged-in NOT-onboarded → private pages → /onboarding with return_to
// ════════════════════════════════════════════════════════════
console.log("\n=== 2. Not-onboarded → private → /onboarding?return_to=… ===");
await check("not-onboarded GET /dashboard → /onboarding?return_to=/dashboard", {
  path: "/dashboard", cookie: notOnboarded,
  expectStatus: 302, expectLocation: /^\/onboarding\?return_to=%2Fdashboard/,
});
await check("not-onboarded GET /pets/12 → /onboarding?return_to=/pets/12", {
  path: "/pets/12", cookie: notOnboarded,
  expectStatus: 302, expectLocation: /^\/onboarding\?return_to=/,
});
await check("not-onboarded GET /chat → /onboarding?return_to=/chat", {
  path: "/chat", cookie: notOnboarded,
  expectStatus: 302, expectLocation: /^\/onboarding\?return_to=/,
});

// ════════════════════════════════════════════════════════════
// Test 3: Anonymous → private page → /login?return_to=…
// ════════════════════════════════════════════════════════════
console.log("\n=== 3. Anonymous → private → /login?return_to=… ===");
await check("anonymous GET /dashboard → /login?return_to=/dashboard", {
  path: "/dashboard",
  expectStatus: 302, expectLocation: /^\/login\?return_to=%2Fdashboard/,
});
await check("anonymous GET /pets/12 → /login?return_to=/pets/12", {
  path: "/pets/12",
  expectStatus: 302, expectLocation: /^\/login\?return_to=/,
});
await check("anonymous GET /pets/12/quests → /login?return_to=…", {
  path: "/pets/12/quests",
  expectStatus: 302, expectLocation: /^\/login\?return_to=/,
});

// Anonymous on public pages → 200 (no redirect)
console.log("\n=== 3b. Anonymous → public page → 200 ===");
for (const p of ["/why-vowvet", "/faq", "/leaderboard", "/community", "/", "/login"]) {
  await check(`anonymous GET ${p}`, { path: p, expectStatus: 200 });
}

// "/" is accessible to logged-in users too (so they can see landing/marketing).
// Page adapts its CTAs via Astro.locals.user (login → "Vào Dashboard" link).
console.log("\n=== 3c. Logged-in users can visit / (NEW behavior) ===");
await check("not-onboarded GET / → 200 (no redirect — see landing)", {
  path: "/", cookie: notOnboarded, expectStatus: 200,
});
await check("onboarded GET / → 200 (no redirect — see landing)", {
  path: "/", cookie: onboarded, expectStatus: 200,
});

// ════════════════════════════════════════════════════════════
// Test 4: Onboarded visiting /onboarding → /dashboard
// ════════════════════════════════════════════════════════════
console.log("\n=== 4. Onboarded visiting /onboarding → /dashboard ===");
await check("onboarded GET /onboarding → /dashboard", {
  path: "/onboarding", cookie: onboarded,
  expectStatus: 302, expectLocation: "/dashboard",
});

// ════════════════════════════════════════════════════════════
// Test 5: PROTECTED_OVERRIDES — /places/new is protected even though /places/ is public
// ════════════════════════════════════════════════════════════
console.log("\n=== 5. PROTECTED_OVERRIDES — sub-paths in public prefix ===");
// /places/123 = passes middleware. Page itself may 302 to /map if place not found
// (e.g. fake test id). What matters: middleware does NOT redirect to /login or /onboarding.
const placesRes = await fetch(`${WEB}/places/123`, { redirect: "manual" });
const placesLoc = placesRes.headers.get("location") || "";
const placesOk = placesRes.status === 200 || (placesRes.status === 302
  && !placesLoc.startsWith("/login") && !placesLoc.startsWith("/onboarding"));
if (placesOk) { console.log("✅ anonymous GET /places/123 (middleware passes — page may redirect)"); pass++; }
else { console.error(`❌ /places/123 blocked by middleware → ${placesRes.status} ${placesLoc}`); fail++; failures.push("/places/123"); }
await check("anonymous GET /places/new → /login (protected override)", {
  path: "/places/new",
  expectStatus: 302, expectLocation: /^\/login\?return_to=/,
});
await check("anonymous GET /places/checkin → /login (protected override)", {
  path: "/places/checkin",
  expectStatus: 302, expectLocation: /^\/login\?return_to=/,
});
await check("anonymous GET /lost/nearby → /login (protected override)", {
  path: "/lost/nearby",
  expectStatus: 302, expectLocation: /^\/login\?return_to=/,
});

// ════════════════════════════════════════════════════════════
// Test 6: /triage edge case — root public, /[petId] private
// ════════════════════════════════════════════════════════════
console.log("\n=== 6. /triage edge case ===");
await check("anonymous GET /triage → 200 (public tree picker)", {
  path: "/triage",
  expectStatus: 200,
});
await check("anonymous GET /triage/12 → /login (per-pet)", {
  path: "/triage/12",
  expectStatus: 302, expectLocation: /^\/login\?return_to=/,
});

// ════════════════════════════════════════════════════════════
// Test 7: Onboarded visiting /login → /dashboard
// ════════════════════════════════════════════════════════════
console.log("\n=== 7. Onboarded user on /login → /dashboard ===");
await check("onboarded GET /login → /dashboard", {
  path: "/login", cookie: onboarded,
  expectStatus: 302, expectLocation: "/dashboard",
});

// Not-onboarded on /login → /onboarding (so they can't loop)
await check("not-onboarded GET /login → /onboarding", {
  path: "/login", cookie: notOnboarded,
  expectStatus: 302, expectLocation: "/onboarding",
});

// ════════════════════════════════════════════════════════════
// Test 8: Honor return_to query param when redirecting from /login
// ════════════════════════════════════════════════════════════
console.log("\n=== 8. return_to flow ===");
await check("onboarded GET /login?return_to=/leaderboard → /leaderboard", {
  path: "/login?return_to=%2Fleaderboard", cookie: onboarded,
  expectStatus: 302, expectLocation: "/leaderboard",
});
await check("not-onboarded GET /login?return_to=/leaderboard → /onboarding?return_to=…", {
  path: "/login?return_to=%2Fleaderboard", cookie: notOnboarded,
  expectStatus: 302, expectLocation: /^\/onboarding\?return_to=%2Fleaderboard/,
});

// Open redirect blocker
await check("malicious /login?return_to=//evil.com → /dashboard (ignored)", {
  path: "/login?return_to=%2F%2Fevil.com", cookie: onboarded,
  expectStatus: 302, expectLocation: "/dashboard",
});

// ════════════════════════════════════════════════════════════
console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
