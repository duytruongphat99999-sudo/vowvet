/**
 * E2E for the /places auth fix.
 *
 * Reproduces the bug scenario:
 *   - User logged in → /map OK
 *   - User clicks "+" → /places/new
 *   - Before fix: 302 → /login (silent logout perception)
 *   - After fix: 200 with form rendered
 *
 * Also covers /places/checkin which had the same bug.
 */
import { signSession } from "../shared/jwt.ts";

const WEB = "http://127.0.0.1:4322";
const API = "http://127.0.0.1:3010";
const USER_ID = Number(Bun.env.E2E_USER_ID || 10);
const PET_ID = Number(Bun.env.E2E_PET_ID || 12);

const token = signSession({ sub: USER_ID, phone: "+84900000010", email: "owner@e2e.local", is_onboarded: true } as any, 3600);
const cookie = `vowvet_session=${token}`;
const hdr = { cookie, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 200)); fail++; }
}

async function expectStatus(name: string, url: string, expected: number, withAuth = true): Promise<Response> {
  const res = await fetch(url, { headers: withAuth ? { cookie } : {}, redirect: "manual" });
  ok(`${name} → ${expected}`, res.status === expected, `got ${res.status} → ${res.headers.get("location") || ""}`);
  return res;
}

// ============================================================
// Test 1: /map renders (sanity)
// ============================================================
console.log("\n=== Test 1: /map authenticated ===");
await expectStatus("T1 /map", `${WEB}/map`, 200);

// ============================================================
// Test 2: /places/new opens (BUG FIX VERIFICATION)
// ============================================================
console.log("\n=== Test 2: /places/new (was 302→/login, expect 200) ===");
const r2 = await expectStatus("T2 /places/new auth", `${WEB}/places/new`, 200);
const html2 = await r2.text();
ok("T2b /places/new HTML contains form", html2.includes("Thêm địa điểm") && html2.includes("newPlace()"), "missing form markers");

// ============================================================
// Test 3: Session preserved after visiting /places/new
// ============================================================
console.log("\n=== Test 3: Session intact ===");
const meRes = await fetch(`${API}/api/v1/auth/me`, { headers: hdr });
const me = await meRes.json();
ok("T3 GET /auth/me → 200 after /places/new", meRes.status === 200);
ok("T3b user.sub matches", me.user?.id === USER_ID || me.sub === USER_ID, JSON.stringify(me).slice(0, 100));

// ============================================================
// Test 4: /places/checkin opens (same fix)
// ============================================================
console.log("\n=== Test 4: /places/checkin (was 302→/login, expect 200) ===");
await expectStatus("T4 /places/checkin?placeId=13", `${WEB}/places/checkin?placeId=13`, 200);

// ============================================================
// Test 5: Session STILL preserved after /places/checkin
// ============================================================
console.log("\n=== Test 5: Session still intact ===");
const me2 = await fetch(`${API}/api/v1/auth/me`, { headers: hdr });
ok("T5 GET /auth/me → 200 after /places/checkin", me2.status === 200);

// ============================================================
// Test 6: Public /places/13 (detail) STILL public — fix didn't break public flow
// ============================================================
console.log("\n=== Test 6: Public /places/13 (no auth, must still work) ===");
await expectStatus("T6 /places/13 no auth", `${WEB}/places/13`, 200, false);

// ============================================================
// Test 7: Unauth /places/new still redirects (defense in depth)
// ============================================================
console.log("\n=== Test 7: /places/new no cookie → /login redirect ===");
const r7 = await fetch(`${WEB}/places/new`, { redirect: "manual" });
ok("T7 /places/new no auth → 302", r7.status === 302);
ok("T7b redirect target is /login", (r7.headers.get("location") || "").includes("/login"), r7.headers.get("location"));

// ============================================================
// Test 8: POST /places via API works (verify the FULL submit flow)
// ============================================================
console.log("\n=== Test 8: POST /places API end-to-end ===");
const placeBody = {
  name: `E2E Places Fix Test ${Date.now()}`,
  address: "Test address, Q1, TP.HCM",
  lat: 10.7720,
  lng: 106.7000,
  category: "cafe",
  pet_policy: "allowed",
  amenities: ["indoor", "water_bowl"],
};
const placeRes = await fetch(`${API}/api/v1/places`, {
  method: "POST", headers: hdr, body: JSON.stringify(placeBody),
});
const placeJ = await placeRes.json();
ok("T8 POST /places → 201", placeRes.status === 201, placeJ);
ok("T8b created place returned with id", typeof placeJ.id === "number");
ok("T8c new place verified=false (admin-review default)", placeJ.verified === false);
const newPlaceId = placeJ.id;

// ============================================================
// Test 9: POST /places/:id/checkin
// ============================================================
console.log("\n=== Test 9: POST /places/:id/checkin ===");
const ckRes = await fetch(`${API}/api/v1/places/${newPlaceId}/checkin`, {
  method: "POST", headers: hdr,
  body: JSON.stringify({ pet_id: PET_ID, rating: 5, review: "E2E test check-in" }),
});
const ckJ = await ckRes.json();
ok("T9 POST /checkin → 201", ckRes.status === 201, ckJ);
ok("T9b checkin id returned", typeof ckJ.id === "number");

// ============================================================
// Test 10: Final session sanity
// ============================================================
console.log("\n=== Test 10: Final session sanity ===");
const me3 = await fetch(`${API}/api/v1/auth/me`, { headers: hdr });
ok("T10 session still active after all flows", me3.status === 200);

console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
