/**
 * E2E test for M27 Pet Playdate.
 *
 * Strategy: forge JWTs for 2 users (USER_A=14 owns pet 11, USER_B=15 owns pet 13),
 * seed each pet with 2 completed vaccines if missing,
 * then exercise the full Tinder flow.
 *
 * Includes pure-function tests for calculateCompatibility.
 */
import { signSession } from "../shared/jwt.ts";
import { listRows, createRow } from "../shared/baserow.ts";

const API = "http://127.0.0.1:3010";
const USER_A = Number(Bun.env.E2E_USER_A || 14); // owns pet 11
const PET_A = Number(Bun.env.E2E_PET_A || 11);
const USER_B = Number(Bun.env.E2E_USER_B || 15); // owns pet 13
const PET_B = Number(Bun.env.E2E_PET_B || 13);

const tokenA = signSession({ sub: USER_A, phone: "+84900000014", email: "a@e2e.local", is_onboarded: true } as any, 3600);
const tokenB = signSession({ sub: USER_B, phone: "+84900000015", email: "b@e2e.local", is_onboarded: true } as any, 3600);
const hdrA = { cookie: `vowvet_session=${tokenA}`, "Content-Type": "application/json" };
const hdrB = { cookie: `vowvet_session=${tokenB}`, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 200)); fail++; }
}

// ============================================================
// Seed vaccines if missing
// ============================================================
async function ensureVaccines(petId: number) {
  const res = await listRows<any>("vaccines", { filter: { pet_id__link_row_has: String(petId) }, size: 50 });
  const completed = res.results.filter((v: any) => v.status?.value === "completed").length;
  if (completed >= 2) return;
  const need = 2 - completed;
  console.log(`  seeding ${need} vaccines for pet ${petId}`);
  for (let i = 0; i < need; i++) {
    await createRow("vaccines", {
      pet_id: [petId],
      vaccine_code: i === 0 ? "dhppl_5in1" : "rabies",
      brand: "E2E-Seed",
      administered_date: new Date(Date.now() - (90 - i * 30) * 86400000).toISOString().slice(0, 10),
      clinic_name: "E2E Test",
      status: "completed",
    });
  }
}
console.log("\n=== Seed prerequisites ===");
await ensureVaccines(PET_A);
await ensureVaccines(PET_B);

// ============================================================
// Test 1: Eligibility check (vaccine gate)
// ============================================================
console.log("\n=== M27 E2E ===");

const eligA = await (await fetch(`${API}/api/v1/playdate/can-create/${PET_A}`, { headers: hdrA })).json();
ok("T1 pet A eligibility = true (2 vaccines)", eligA.eligible === true, eligA);
ok("T1b vaccine_count >= 2", eligA.vaccine_count >= 2);

// Negative case: pet not owned by user
const negElig = await (await fetch(`${API}/api/v1/playdate/can-create/${PET_B}`, { headers: hdrA })).json();
ok("T1c cross-user eligibility blocked (403)", negElig?.error?.code === "FORBIDDEN", negElig);

// ============================================================
// Test 2: Create profile pet A
// ============================================================
const profARes = await fetch(`${API}/api/v1/playdate/profile/${PET_A}`, {
  method: "POST",
  headers: hdrA,
  body: JSON.stringify({
    bio: "Hi I'm Bug Test Pet — friendly dog, love fetch and walks",
    looking_for: "play_buddy",
    play_styles: ["fetch", "chase", "calm"],
    max_distance_km: 30,
    lat: 10.7769,
    lng: 106.7009,
    active: true,
  }),
});
const profAJson = await profARes.json();
ok("T2 create profile pet A → 201", profARes.status === 201, profAJson);
ok("T2b profile vaccinated=true", profAJson.profile?.vaccinated === true);

// ============================================================
// Test 3: Create profile pet B
// ============================================================
const profBRes = await fetch(`${API}/api/v1/playdate/profile/${PET_B}`, {
  method: "POST",
  headers: hdrB,
  body: JSON.stringify({
    bio: "I'm Mega Pet — playful dog",
    looking_for: "play_buddy",
    play_styles: ["fetch", "wrestle"],
    max_distance_km: 30,
    lat: 10.7800,
    lng: 106.7100,
    active: true,
  }),
});
const profBJson = await profBRes.json();
ok("T3 create profile pet B → 201", profBRes.status === 201, profBJson);

// ============================================================
// Test 4: Discovery — pet A should see pet B
// ============================================================
const discRes = await fetch(`${API}/api/v1/playdate/discover?petId=${PET_A}`, { headers: hdrA });
const discJson = await discRes.json();
ok("T4 discover → 200", discRes.status === 200, discJson);
const seesB = discJson.candidates?.some((c: any) => c.pet.id === PET_B);
ok("T4b pet A sees pet B in discovery", !!seesB, discJson.candidates?.map((c: any) => c.pet.id));
if (seesB) {
  const c = discJson.candidates.find((x: any) => x.pet.id === PET_B);
  ok("T4c compatibility score > 30", c.compatibility.total > 30, `score=${c.compatibility.total}`);
  ok("T4d species_match = 40 (same species dog)", c.compatibility.breakdown.species_match === 40);
  ok("T4e distance_km is calculated", typeof c.compatibility.distance_km === "number");
}

// ============================================================
// Test 5: Swipe pet A → pet B (like)
// ============================================================
const swipe1 = await fetch(`${API}/api/v1/playdate/swipe`, {
  method: "POST",
  headers: hdrA,
  body: JSON.stringify({ from_pet_id: PET_A, to_pet_id: PET_B, direction: "like" }),
});
const swipe1J = await swipe1.json();
ok("T5 swipe A→B like → 201", swipe1.status === 201, swipe1J);
ok("T5b matched=false (B hasn't liked yet)", swipe1J.matched === false);

// ============================================================
// Test 6: Swipe pet B → pet A (like) — should auto-create match
// ============================================================
const swipe2 = await fetch(`${API}/api/v1/playdate/swipe`, {
  method: "POST",
  headers: hdrB,
  body: JSON.stringify({ from_pet_id: PET_B, to_pet_id: PET_A, direction: "like" }),
});
const swipe2J = await swipe2.json();
ok("T6 swipe B→A like → 201", swipe2.status === 201, swipe2J);
ok("T6b matched=true (mutual like)", swipe2J.matched === true);
ok("T6c match_id returned", typeof swipe2J.match_id === "number");

const matchId = swipe2J.match_id;

// ============================================================
// Test 7: Send message from A
// ============================================================
const sendMsg = await fetch(`${API}/api/v1/playdate/matches/${matchId}/messages`, {
  method: "POST",
  headers: hdrA,
  body: JSON.stringify({ body: "Chào bạn, bé mình tên Bug Test Pet 🐶" }),
});
const sendMsgJ = await sendMsg.json();
ok("T7 send message → 201", sendMsg.status === 201, sendMsgJ);
ok("T7b message body returned", sendMsgJ.message?.body?.includes("Bug Test Pet"));

// ============================================================
// Test 8: Get messages from B's view
// ============================================================
const getMsgs = await fetch(`${API}/api/v1/playdate/matches/${matchId}/messages`, { headers: hdrB });
const getMsgsJ = await getMsgs.json();
ok("T8 get messages → 200", getMsgs.status === 200);
ok("T8b at least 1 message visible to B", (getMsgsJ.messages?.length || 0) >= 1);
ok("T8c sender_user_id is A", getMsgsJ.messages?.[0]?.sender_user_id === USER_A);

// ============================================================
// Test 9: Report pet B from user A
// ============================================================
const reportRes = await fetch(`${API}/api/v1/playdate/report`, {
  method: "POST",
  headers: hdrA,
  body: JSON.stringify({ reported_pet_id: PET_B, reason: "inappropriate", notes: "E2E test report" }),
});
const reportJ = await reportRes.json();
ok("T9 report → 201", reportRes.status === 201, reportJ);
ok("T9b not yet auto-hidden (only 1 report)", reportJ.auto_hidden === false);

// ============================================================
// Test 10: Block match
// ============================================================
const blockRes = await fetch(`${API}/api/v1/playdate/matches/${matchId}/block`, {
  method: "POST",
  headers: hdrA,
  body: JSON.stringify({ reason: "E2E test block" }),
});
const blockJ = await blockRes.json();
ok("T10 block match → 200", blockRes.status === 200, blockJ);
ok("T10b match status=blocked", blockJ.match?.status === "blocked");

// ============================================================
// Bonus: compatibility pure-function tests
// ============================================================
console.log("\n=== Compatibility pure logic ===");
const { calculateCompatibility } = await import("../api/src/lib/playdate.ts");
const sameInfo = {
  id: 1, species: "dog", personality: "athlete", age_years: 3, weight_kg: 10, lat: 10.77, lng: 106.7,
};
const otherDog = {
  id: 2, species: "dog", personality: "explorer", age_years: 4, weight_kg: 11, lat: 10.78, lng: 106.71,
};
const compatDogs = calculateCompatibility(sameInfo, otherDog);
ok("B1 same species → species_match=40", compatDogs.breakdown.species_match === 40);
ok("B2 compatible personalities (athlete↔explorer) → personality_match≥15", compatDogs.breakdown.personality_match >= 15);
ok("B3 close age (1y diff) → age_proximity=15", compatDogs.breakdown.age_proximity === 15);
ok("B4 similar weight → size_proximity=10", compatDogs.breakdown.size_proximity === 10);
ok("B5 close distance (<5km) → distance_proximity=10", compatDogs.breakdown.distance_proximity === 10);
ok("B6 total = 40+25+15+10+10 = 100", compatDogs.total === 100);

const catVsDog = calculateCompatibility(sameInfo, { ...otherDog, species: "cat" });
ok("B7 cross-species species_match=0", catVsDog.breakdown.species_match === 0);

const oldDog = calculateCompatibility(sameInfo, { ...otherDog, age_years: 15 });
ok("B8 large age diff → age_proximity=0", oldDog.breakdown.age_proximity === 0);

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
