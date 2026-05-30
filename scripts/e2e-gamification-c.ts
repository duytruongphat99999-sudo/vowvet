/**
 * E2E for Gamification Session C (community feed, trend chart, social proof, JS libs).
 *
 * Strategy:
 *   - Sign session JWT (user 10 / pet 12)
 *   - Hit new endpoints + verify shape
 *   - Verify JS libs files exist at expected paths
 *   - Verify settings page has feedback toggles markup
 *   - Force-create a community event + verify it surfaces in feed
 */
import { signSession } from "../shared/jwt.ts";
import { existsSync } from "node:fs";
import { listRows } from "../shared/baserow.ts";
import { createCommunityEvent, getRecentCommunityEvents } from "../api/src/lib/community-feed.ts";
import { getPetScoreTrend, getPercentileVsCommunity } from "../api/src/lib/pet-score-trend.ts";
import { peekTier, detectTierChange } from "../api/src/lib/tier-up-detector.ts";

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
console.log("\n=== Migration + libs ===");

const ce = await listRows<any>("community_events", { size: 1 });
ok("M1 community_events table exists", Array.isArray(ce.results));

ok("M2 celebrations.js exists", existsSync("C:/docker/vowvet/web/src/lib/celebrations.js"));
ok("M3 sounds.js exists", existsSync("C:/docker/vowvet/web/src/lib/sounds.js"));
ok("M4 haptic.js exists", existsSync("C:/docker/vowvet/web/src/lib/haptic.js"));
ok("M5 sounds README exists (drop-in instructions)", existsSync("C:/docker/vowvet/web/public/sounds/README.md"));

// ============================================================
// API endpoints
// ============================================================
console.log("\n=== API endpoints ===");

// T1: PUBLIC community feed
const feedRes = await fetch(`${API}/api/v1/community/feed?limit=20`);
const feedJ = await feedRes.json();
ok("T1 GET /community/feed PUBLIC → 200", feedRes.status === 200);
ok("T1b events array", Array.isArray(feedJ.events));
ok("T1c total is number", typeof feedJ.total === "number");

// T2: Trend (auth)
const tRes = await fetch(`${API}/api/v1/pets/${PET_ID}/pet-score/trend?days=30`, { headers: hdr });
const tJ = await tRes.json();
ok("T2 GET /pets/:id/pet-score/trend → 200", tRes.status === 200);
ok("T2b points array len = 30", Array.isArray(tJ.points) && tJ.points.length === 30);
ok("T2c each point has date + score + estimated flag", tJ.points?.every?.((p: any) => typeof p.date === "string" && typeof p.score === "number" && typeof p.estimated === "boolean"));
ok("T2d current_score present", typeof tJ.current_score === "number");

// T3: Percentile
const pRes = await fetch(`${API}/api/v1/pets/${PET_ID}/pet-score/percentile`, { headers: hdr });
const pJ = await pRes.json();
ok("T3 GET /pet-score/percentile → 200", pRes.status === 200);
ok("T3b percentile 0-100", typeof pJ.percentile === "number" && pJ.percentile >= 0 && pJ.percentile <= 100);
ok("T3c community_avg present", typeof pJ.community_avg === "number");

// T4: Social proof PUBLIC (no auth)
const spRes = await fetch(`${API}/api/v1/achievements/streak_7/social-proof`);
const spJ = await spRes.json();
ok("T4 GET /achievements/:code/social-proof PUBLIC → 200", spRes.status === 200);
ok("T4b total_unlocks is number", typeof spJ.total_unlocks === "number");
ok("T4c recent_count_7d is number", typeof spJ.recent_count_7d === "number");

// ============================================================
// Pure logic
// ============================================================
console.log("\n=== Pure logic ===");

// L1: Create + read community event
const before = await listRows<any>("community_events", { size: 100 });
const beforeCount = before.results.length;
const created = await createCommunityEvent({
  eventType: "achievement_unlock",
  userId: USER_ID,
  petId: PET_ID,
  eventData: { achievement_code: "test_e2e", name: "E2E Test", emoji: "🧪", tier: "bronze" },
});
ok("L1 createCommunityEvent returns event", !!created && typeof created.id === "number");
ok("L1b event has denormalized pet_name", created?.pet_name && created.pet_name.length > 0);

// L2: Feed shows newly created event
const feed = await getRecentCommunityEvents(50);
ok("L2 feed contains newly created event", feed.some((e) => e.id === created?.id));

// L3: Tier-up detector (no actual tier change expected, just signature check)
const tierState = await peekTier(PET_ID);
ok("L3 peekTier returns tier + score", typeof tierState.tier === "string" && typeof tierState.score === "number");
const tierChange = await detectTierChange(PET_ID, USER_ID, tierState);
ok("L3b detectTierChange returns tier_changed boolean", typeof tierChange.tier_changed === "boolean");
ok("L3c includes before + after tiers", typeof tierChange.before === "string" && typeof tierChange.after === "string");
ok("L3d same-state → tier_changed = false", tierChange.tier_changed === false);

// L4: Pet Score trend lib
const trend = await getPetScoreTrend(PET_ID, 7);
ok("L4 getPetScoreTrend returns 7 points for days=7", trend.points.length === 7);
ok("L4b points sorted ascending by date", trend.points[0].date < trend.points[6].date);

// L5: Percentile lib
const pct = await getPercentileVsCommunity(PET_ID);
ok("L5 getPercentileVsCommunity returns valid percentile", pct.percentile >= 0 && pct.percentile <= 100);

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
      ok(`${name} contains "${marker.slice(0, 30)}"`, html.includes(marker));
    }
  }
}

await page(`${WEB}/community`, "P1 /community PUBLIC", ["communityPage(", "Live Activity", "📣"], false);
await page(`${WEB}/pets/${PET_ID}/achievements`, "P2 /pets/:id/achievements (with social proof load)", ["loadSocialProof", "socialProof"]);
await page(`${WEB}/pets/${PET_ID}/pet-score`, "P3 /pets/:id/pet-score (trend section)", ["loadTrend", "trend-chart", "Xu hướng 30 ngày"]);
await page(`${WEB}/settings`, "P4 /settings (feedback toggles)", ["feedbackToggles", "Âm thanh", "Rung haptic"]);

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
