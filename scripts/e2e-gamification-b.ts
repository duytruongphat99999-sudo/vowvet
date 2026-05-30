/**
 * E2E for Gamification Session B (nudges, leaderboard, quests, mood).
 *
 * Strategy:
 *   - Sign session JWT for user 10/pet 12
 *   - Hit each endpoint, verify shape
 *   - Test pure logic: pet mood states, quest assignment, leaderboard opt-in/out
 */
import { signSession } from "../shared/jwt.ts";
import { listRows } from "../shared/baserow.ts";
import { calculatePetMood } from "../api/src/lib/pet-mood.ts";
import { assignDailyQuests, listTodayQuests, completeQuest, trackQuestTrigger, listActiveQuestDefs } from "../api/src/lib/daily-quests.ts";
import { findNudgeOpportunities } from "../api/src/lib/nudges.ts";
import { getLeaderboard, optInLeaderboard, optOutLeaderboard } from "../api/src/lib/pet-leaderboard.ts";

const API = "http://127.0.0.1:3010";
const WEB = "http://127.0.0.1:4322";
const USER_ID = Number(Bun.env.E2E_USER_ID || 10);
const PET_ID = Number(Bun.env.E2E_PET_ID || 12);

const token = signSession({ sub: USER_ID, phone: "+84900000010", email: "e2e@local", is_onboarded: true } as any, 3600);
const cookie = `vowvet_session=${token}`;
const hdr = { cookie, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 250)); fail++; }
}

// ============================================================
// Migration sanity
// ============================================================
console.log("\n=== Migration + seeds ===");
const qDefs = await listActiveQuestDefs();
ok("M1 ≥15 quest defs seeded", qDefs.length >= 15, `got ${qDefs.length}`);
ok("M1b each difficulty has at least one", ["easy", "medium", "hard"].every((d) => qDefs.some((q) => q.difficulty === d)));

const lbTable = await listRows<any>("leaderboard_snapshots", { size: 1 });
ok("M2 leaderboard_snapshots table exists", Array.isArray(lbTable.results));

const udqTable = await listRows<any>("user_daily_quests", { size: 1 });
ok("M3 user_daily_quests table exists", Array.isArray(udqTable.results));

const nudgesTable = await listRows<any>("user_nudges_sent", { size: 1 });
ok("M4 user_nudges_sent table exists", Array.isArray(nudgesTable.results));

// ============================================================
// API endpoints
// ============================================================
console.log("\n=== API endpoints ===");

// T1: Quests today
const qRes = await fetch(`${API}/api/v1/quests/pets/${PET_ID}/today`, { headers: hdr });
const qJ = await qRes.json();
ok("T1 GET /quests/pets/:id/today → 200", qRes.status === 200, qJ);
ok("T1b quests array len 3", Array.isArray(qJ.quests) && qJ.quests.length === 3, qJ.quests?.length);
ok("T1c each quest has definition", qJ.quests?.every?.((q: any) => q.definition != null));

// T2: Mood
const mRes = await fetch(`${API}/api/v1/mood/pets/${PET_ID}`, { headers: hdr });
const mJ = await mRes.json();
ok("T2 GET /mood/pets/:id → 200", mRes.status === 200);
ok("T2b mood has state", typeof mJ.mood?.state === "string");
ok("T2c mood state is valid enum", ["happy", "excited", "chill", "needy", "sad", "sleeping"].includes(mJ.mood?.state));
ok("T2d mood has emoji + message", !!mJ.mood?.emoji && !!mJ.mood?.message);

// T3: Nudges
const nRes = await fetch(`${API}/api/v1/nudges/pets/${PET_ID}`, { headers: hdr });
const nJ = await nRes.json();
ok("T3 GET /nudges/pets/:id → 200", nRes.status === 200);
ok("T3b returns opportunities array", Array.isArray(nJ.opportunities));

// T4: Leaderboard PUBLIC (no auth)
const lRes = await fetch(`${API}/api/v1/leaderboard`);
const lJ = await lRes.json();
ok("T4 GET /leaderboard PUBLIC → 200", lRes.status === 200);
ok("T4b entries array", Array.isArray(lJ.entries));
ok("T4c has period field", typeof lJ.period === "string");

// T5: my-status (auth)
const sRes = await fetch(`${API}/api/v1/leaderboard/my-status`, { headers: hdr });
const sJ = await sRes.json();
ok("T5 GET /leaderboard/my-status → 200", sRes.status === 200);
ok("T5b opted_in is boolean", typeof sJ.opted_in === "boolean");

// T6: quests history
const hRes = await fetch(`${API}/api/v1/quests/pets/${PET_ID}/history?limit=5`, { headers: hdr });
const hJ = await hRes.json();
ok("T6 GET /quests/pets/:id/history → 200", hRes.status === 200);
ok("T6b history array", Array.isArray(hJ.history));

// ============================================================
// Pure logic
// ============================================================
console.log("\n=== Pure logic ===");

// L1: Mood calculation
const mood = await calculatePetMood(PET_ID, USER_ID);
ok("L1 calculatePetMood returns valid state", ["happy", "excited", "chill", "needy", "sad", "sleeping"].includes(mood.state));
ok("L1b mood has color_class", typeof mood.color_class === "string" && mood.color_class.length > 0);

// L2: Sleeping window
const midnightMood = await calculatePetMood(PET_ID, USER_ID, new Date(2026, 4, 19, 23, 30));
ok("L2 23:30 → sleeping", midnightMood.state === "sleeping");
const sixAmMood = await calculatePetMood(PET_ID, USER_ID, new Date(2026, 4, 19, 6, 30));
ok("L2b 06:30 → NOT sleeping", sixAmMood.state !== "sleeping");

// L3: Quest assignment idempotency
const t1 = await listTodayQuests(USER_ID, PET_ID);
const t2 = await listTodayQuests(USER_ID, PET_ID);
ok("L3 same day → same quest count", t1.length === t2.length, `t1=${t1.length} t2=${t2.length}`);
const codes1 = t1.map((q) => q.quest_code).sort();
const codes2 = t2.map((q) => q.quest_code).sort();
ok("L3b same quest codes", JSON.stringify(codes1) === JSON.stringify(codes2));

// L4: Quest difficulty mix
const easyCount = t1.filter((q) => q.definition?.difficulty === "easy").length;
const medCount = t1.filter((q) => q.definition?.difficulty === "medium").length;
const hardCount = t1.filter((q) => q.definition?.difficulty === "hard").length;
ok("L4 quest mix 1 easy + 1 medium + 1 hard", easyCount === 1 && medCount === 1 && hardCount === 1, `e=${easyCount} m=${medCount} h=${hardCount}`);

// L5: Find nudge opportunities
const opps = await findNudgeOpportunities(USER_ID, PET_ID);
ok("L5 findNudgeOpportunities callable", Array.isArray(opps));
console.log(`  (${opps.length} opportunities found — depends on pet state)`);

// L6: Leaderboard returns array
const lbAll = await getLeaderboard({ period: "all_time", limit: 50 });
ok("L6 getLeaderboard returns array", Array.isArray(lbAll));

// L7: Opt-in / opt-out (toggle state)
await optInLeaderboard(USER_ID, PET_ID, "E2E Tester");
const lbWithUser = await getLeaderboard({ period: "all_time", limit: 100 });
const inLb = lbWithUser.some((e) => e.user_id === USER_ID);
ok("L7 opt-in → appears in leaderboard", inLb, `user not in ${lbWithUser.length} entries`);

await optOutLeaderboard(USER_ID);
const lbWithout = await getLeaderboard({ period: "all_time", limit: 100 });
const stillIn = lbWithout.some((e) => e.user_id === USER_ID);
ok("L7b opt-out → removed from leaderboard", !stillIn);

// ============================================================
// Frontend rendering
// ============================================================
console.log("\n=== Frontend pages ===");
const cookieOnly = { cookie };

async function page(url: string, name: string, expectMarkers: string[], withAuth = true): Promise<void> {
  const res = await fetch(url, { headers: withAuth ? cookieOnly : {}, redirect: "manual" });
  ok(`${name} → 200`, res.status === 200, `got ${res.status}`);
  if (res.status === 200) {
    const html = await res.text();
    for (const marker of expectMarkers) {
      ok(`${name} contains "${marker}"`, html.includes(marker));
    }
  }
}

await page(`${WEB}/leaderboard`, "P1 /leaderboard PUBLIC", ["leaderboardPage(", "🏆", "Pet Score Top"], false);
await page(`${WEB}/pets/${PET_ID}/quests`, "P2 /pets/:id/quests", ["questsPage(", "Quest hôm nay"]);

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
