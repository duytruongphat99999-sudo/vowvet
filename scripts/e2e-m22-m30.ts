/**
 * E2E test for M22 BCS + M30 Memorial.
 *
 * Strategy: forge JWT directly (HS256 with JWT_SECRET) for user 1, then exercise endpoints.
 * - M22: list history (empty), assess (skip — needs files, just test schema), list, latest.
 * - M30: create memorial → fetch by slug (public) → light candle → leave message → register interest → my list.
 */
import { signSession } from "../shared/jwt.ts";

const JWT_SECRET = Bun.env.JWT_SECRET || "";
if (!JWT_SECRET) { console.error("missing JWT_SECRET"); process.exit(1); }
const API = "http://127.0.0.1:3010";
const USER_ID = Number(Bun.env.E2E_USER_ID || 1);
const PET_ID = Number(Bun.env.E2E_PET_ID || 12);

const token = signSession({
  sub: USER_ID,
  phone: "+84900000001",
  email: "e2e@test.local",
  is_onboarded: true,
} as any, 3600);
const cookieHeader = `vowvet_session=${token}`;
const authHeaders = { cookie: cookieHeader, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, extra || ""); fail++; }
}

// ============================================================
// M22 BCS Tests
// ============================================================
console.log("\n=== M22 BCS ===");

const histRes = await fetch(`${API}/api/v1/pets/${PET_ID}/bcs/history`, { headers: authHeaders });
const histJson = await histRes.json();
ok("M22.1 GET /pets/:id/bcs/history → 200", histRes.status === 200, histJson);
ok("M22.2 history has 'assessments' array", Array.isArray(histJson.assessments), histJson);

const latestRes = await fetch(`${API}/api/v1/pets/${PET_ID}/bcs/latest`, { headers: authHeaders });
const latestJson = await latestRes.json();
ok("M22.3 GET /pets/:id/bcs/latest → 200", latestRes.status === 200, latestJson);
ok("M22.4 latest returns object", "assessment" in latestJson, latestJson);

// Verify needsVetReview logic (pure function — import directly)
const { needsVetReview } = await import("../api/src/lib/bcs-vision.ts");
ok("M22.5 needsVetReview(score=5, conf=80, isMock=false) = false", needsVetReview(5, 80, false) === false);
ok("M22.6 needsVetReview(score=8, conf=80, isMock=false) = true (extreme)", needsVetReview(8, 80, false) === true);
ok("M22.7 needsVetReview(score=5, conf=50, isMock=false) = true (low conf)", needsVetReview(5, 50, false) === true);
ok("M22.8 needsVetReview(score=5, conf=90, isMock=true)  = true (mock)", needsVetReview(5, 90, true) === true);

// ============================================================
// M30 Memorial Tests
// ============================================================
console.log("\n=== M30 Memorial ===");

// Try create memorial (might already exist from earlier test)
const createRes = await fetch(`${API}/api/v1/pets/${PET_ID}/memorial`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    passed_away_date: "2026-05-01",
    tribute_message: "Bé thân yêu, cảm ơn vì những năm tháng ấm áp đã ở bên. Mãi nhớ bé. 🐾",
    memorial_status: "active",
  }),
});
const createJson = await createRes.json();
let slug: string;
if (createRes.status === 201) {
  ok("M30.1 POST /pets/:id/memorial → 201 create new", true);
  slug = createJson.memorial?.public_slug;
} else if (createRes.status === 409) {
  ok("M30.1 POST /pets/:id/memorial → 409 already exists (re-using existing)", true);
  slug = createJson.memorial?.public_slug;
} else {
  ok("M30.1 POST /pets/:id/memorial fail", false, createJson);
  process.exit(1);
}
ok("M30.2 memorial has public_slug", typeof slug === "string" && slug.length > 5, slug);

// Public fetch by slug
const pubRes = await fetch(`${API}/api/v1/public/memorial/${slug}`);
const pubJson = await pubRes.json();
ok("M30.3 GET /public/memorial/:slug → 200", pubRes.status === 200, pubJson);
ok("M30.4 public memorial has tribute_message", typeof pubJson.memorial?.tribute_message === "string");
ok("M30.5 public memorial has tier=free default", pubJson.memorial?.tier === "free");

// Light candle (no auth needed)
const candleRes = await fetch(`${API}/api/v1/public/memorial/${slug}/candle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ visitor_name: "E2E Tester" }),
});
const candleJson = await candleRes.json();
ok("M30.6 POST candle → 201 anonymous", candleRes.status === 201, candleJson);
ok("M30.7 candle visit has candle_lit=true", candleJson.visit?.candle_lit === true);

// Leave message
const msgRes = await fetch(`${API}/api/v1/public/memorial/${slug}/message`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    visitor_name: "Người bạn",
    message: "Bé sẽ luôn trong tim chúng mình. 🌹",
    candle_lit: true,
  }),
});
const msgJson = await msgRes.json();
ok("M30.8 POST message → 201", msgRes.status === 201, msgJson);
ok("M30.9 message has both candle + text", msgJson.visit?.candle_lit === true && msgJson.visit?.message);

// List visits (public)
const visitsRes = await fetch(`${API}/api/v1/public/memorial/${slug}/visits`);
const visitsJson = await visitsRes.json();
ok("M30.10 GET visits public → 200", visitsRes.status === 200);
ok("M30.11 visits has 2+ entries", (visitsJson.visits?.length || 0) >= 2, visitsJson);

// Register premium interest (auth required) — NO PAYMENT
const memorialId = pubJson.memorial.id;
const interestRes = await fetch(`${API}/api/v1/memorials/${memorialId}/interest`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    tier: "tribute",
    contact_phone: "0901234567",
    contact_preferred_time: "sau 6PM",
    notes: "Muốn hỏi thêm về QR plaque",
  }),
});
const interestJson = await interestRes.json();
ok("M30.12 POST interest → 201", interestRes.status === 201, interestJson);
ok("M30.13 interest message mentions no payment",
   typeof interestJson.message === "string" && interestJson.message.includes("không có phí trả trước".toLowerCase().slice(0, 5) || "phí trả trước") === false
   && /Không có phí/.test(interestJson.message),
   interestJson.message);

// My memorials list
const myRes = await fetch(`${API}/api/v1/memorials/my`, { headers: authHeaders });
const myJson = await myRes.json();
ok("M30.14 GET /memorials/my → 200", myRes.status === 200);
ok("M30.15 my memorials includes our slug",
   Array.isArray(myJson.memorials) && myJson.memorials.some((m: any) => m.public_slug === slug),
   myJson);

// Anniversary check function (pure)
const { findAnniversariesDue } = await import("../api/src/lib/memorials.ts");
const dueToday = await findAnniversariesDue(new Date("2027-05-01")); // 1 yr after
ok("M30.16 findAnniversariesDue for 2027-05-01 returns ≥1 memorial",
   Array.isArray(dueToday) && dueToday.length >= 1, dueToday.length);
ok("M30.17 anniversary memorial matches our slug",
   dueToday.some((m) => m.public_slug === slug), dueToday.map((m) => m.public_slug));

// Negative: private memorial 404 publicly
await fetch(`${API}/api/v1/memorials/${memorialId}`, {
  method: "PATCH",
  headers: authHeaders,
  body: JSON.stringify({ memorial_status: "private" }),
});
const privRes = await fetch(`${API}/api/v1/public/memorial/${slug}`);
ok("M30.18 private memorial → 404 publicly", privRes.status === 404);

// Restore active for future runs
await fetch(`${API}/api/v1/memorials/${memorialId}`, {
  method: "PATCH",
  headers: authHeaders,
  body: JSON.stringify({ memorial_status: "active" }),
});

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
