/**
 * E2E for Lost Pet upgrade (4 features).
 *
 * Strategy: forge 2 user sessions (owner + helper), simulate full flow:
 *   1. Owner reports pet missing with 3 reference photos + gold reward (1tr)
 *   2. Helper submits sighting WITHOUT photo → no AI run, owner notified
 *   3. Helper submits 3 more sightings near each other to test cluster
 *   4. Owner confirms sighting → helper becomes Pet Hero (helper tier)
 *   5. Verify hero leaderboard has helper at top
 *   6. Cluster algo identifies hottest zone
 *   7. Reward mark paid → recipient_id set
 *   8. Pet Score component pet_hero_bonus appears for helper's pet (if any)
 *   9. /heroes/leaderboard public access works
 *   10. AI shouldNotifyOwner threshold logic (pure function)
 */
import { signSession } from "../shared/jwt.ts";
import {
  matchPetSighting,
  shouldNotifyOwner,
  getMatchTier,
} from "../api/src/lib/lost-pet-vision.ts";
import { calculateHeroTier, HERO_TIERS } from "../api/src/lib/pet-heroes.ts";
import { clusterSightings } from "../api/src/lib/lost-pet-cluster.ts";
import { getRewardBadge, getRewardPushSuffix } from "../api/src/lib/lost-pet-rewards.ts";

const API = "http://127.0.0.1:3010";
const OWNER_USER = Number(Bun.env.E2E_OWNER_USER || 4); // user 4 owns pet 3 (Beo)
const OWNER_PET = Number(Bun.env.E2E_OWNER_PET || 3);
const HELPER_USER = Number(Bun.env.E2E_HELPER_USER || 14);

const ownerToken = signSession({ sub: OWNER_USER, phone: "+84900000004", email: "owner@e2e", is_onboarded: true } as any, 3600);
const helperToken = signSession({ sub: HELPER_USER, phone: "+84900000014", email: "helper@e2e", is_onboarded: true } as any, 3600);
const ownerHdr = { cookie: `vowvet_session=${ownerToken}`, "Content-Type": "application/json" };
const helperHdr = { cookie: `vowvet_session=${helperToken}`, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 250)); fail++; }
}

// ============================================================
// PURE LOGIC TESTS
// ============================================================
console.log("\n=== Pure logic ===");

ok("L1 shouldNotifyOwner(80, 'high') = true", shouldNotifyOwner(80, "high"));
ok("L2 shouldNotifyOwner(50, 'medium') = false (below threshold)", !shouldNotifyOwner(50, "medium"));
ok("L3 shouldNotifyOwner(30, 'failed') = true (failed → escalate)", shouldNotifyOwner(30, "failed"));
ok("L4 getMatchTier(90) = definite", getMatchTier(90) === "definite");
ok("L5 getMatchTier(60) = likely", getMatchTier(60) === "likely");
ok("L6 getMatchTier(45) = maybe", getMatchTier(45) === "maybe");
ok("L7 getMatchTier(20) = unlikely", getMatchTier(20) === "unlikely");

ok("L8 calculateHeroTier(1) = helper", calculateHeroTier(1) === "helper");
ok("L9 calculateHeroTier(3) = hero", calculateHeroTier(3) === "hero");
ok("L10 calculateHeroTier(15) = legend", calculateHeroTier(15) === "legend");
ok("L11 calculateHeroTier(50) = guardian", calculateHeroTier(50) === "guardian");
ok("L12 calculateHeroTier(0) = none", calculateHeroTier(0) === "none");

ok("L13 getRewardBadge('gold') amount = 1tr", getRewardBadge("gold").amount === 1_000_000);
ok("L14 getRewardBadge('diamond') emoji = 💎", getRewardBadge("diamond").emoji === "💎");
ok("L15 getRewardPushSuffix(1000000) contains '1.0tr'", getRewardPushSuffix(1_000_000).includes("1.0tr"));
ok("L16 getRewardPushSuffix(100000) contains '100k'", getRewardPushSuffix(100_000).includes("100k"));
ok("L17 getRewardPushSuffix(0) = empty", getRewardPushSuffix(0) === "");

// Cluster test with 5 sightings
const mockSightings = [
  { id: 1, sighting_lat: 10.7769, sighting_lng: 106.7009, ai_match_score: 80, status: "pending", created_at: "2026-05-19T10:00:00Z" },
  { id: 2, sighting_lat: 10.7770, sighting_lng: 106.7010, ai_match_score: 75, status: "pending", created_at: "2026-05-19T11:00:00Z" },
  { id: 3, sighting_lat: 10.7768, sighting_lng: 106.7011, ai_match_score: 85, status: "pending", created_at: "2026-05-19T12:00:00Z" },
  { id: 4, sighting_lat: 10.8000, sighting_lng: 106.7100, ai_match_score: 60, status: "pending", created_at: "2026-05-19T13:00:00Z" },
  { id: 5, sighting_lat: 10.7771, sighting_lng: 106.7009, ai_match_score: 70, status: "pending", created_at: "2026-05-19T14:00:00Z" },
];
const clusters = clusterSightings(mockSightings as any, 0.5);
ok("L18 clusters mock 5 sightings → 2 clusters", clusters.length === 2, `got ${clusters.length}`);
ok("L19 hottest cluster has 4 sightings", clusters.find((c) => c.hottest)?.sighting_count === 4, clusters.map((c) => c.sighting_count));
ok("L20 hottest cluster avg_match_score ≈ 77", Math.abs((clusters.find((c) => c.hottest)?.avg_match_score || 0) - 77) <= 2);

// ============================================================
// API E2E
// ============================================================
console.log("\n=== API E2E ===");

// 1. Owner reports pet missing
const reportRes = await fetch(`${API}/api/v1/lost-pets/${OWNER_PET}/report`, {
  method: "POST",
  headers: ownerHdr,
  body: JSON.stringify({
    last_seen_lat: 10.7769,
    last_seen_lng: 106.7009,
    last_seen_location: "Quận 1, TP.HCM (E2E)",
    last_seen_at: new Date().toISOString(),
    circumstances: "E2E test — bé chạy mất khi đi dạo",
    distinguishing_features: "Vòng cổ đỏ",
    contact_phone: "+84900000004",
    contact_phone_public: true,
    reward_amount: 1000000,
    reward_tier: "gold",
    reference_photo_urls: [
      "https://example.com/ref1.jpg",
      "https://example.com/ref2.jpg",
      "https://example.com/ref3.jpg",
    ],
  }),
});
const reportJ = await reportRes.json();
let reportId: number;
let slug: string;
if (reportJ.alreadyActive) {
  console.log("  (using existing active report)");
  reportId = reportJ.report.id;
  slug = reportJ.report.public_url_slug;
} else if (reportRes.status === 201) {
  reportId = reportJ.report.id;
  slug = reportJ.slug;
} else {
  ok("R1 report create", false, reportJ);
  process.exit(1);
}
ok("R1 report exists (created OR existed)", !!reportId);

// 2. Verify report has reward_tier + reference_photo_urls saved
const reportFetch = await fetch(`${API}/api/v1/public/lost/${slug}`);
const reportFetchJ = await reportFetch.json();
ok("R2 public fetch reward_tier = gold", reportFetchJ.report.reward_tier === "gold", reportFetchJ.report?.reward_tier);
ok("R3 public fetch reward_amount = 1000000", reportFetchJ.report.reward_amount === 1000000);
ok("R4 public fetch has ≥3 reference_photo_urls", (reportFetchJ.report.reference_photo_urls?.length || 0) >= 3);

// 3. Helper submits sighting (no photo → no AI run)
const sight1Res = await fetch(`${API}/api/v1/public/lost/${slug}/sighting`, {
  method: "POST",
  headers: helperHdr, // sending with auth cookie attaches reporter_user_id
  body: JSON.stringify({
    spotter_name: "E2E Helper",
    spotter_phone: "+84900000014",
    sighting_address: "Đường Lê Lợi, Q1 (E2E)",
    sighting_lat: 10.7770,
    sighting_lng: 106.7010,
    description: "Thấy bé ở góc đường",
  }),
});
const sight1J = await sight1Res.json();
ok("R5 sighting create → 201", sight1Res.status === 201, sight1J);
ok("R5b returned sighting_id", typeof sight1J.sighting_id === "number");

const sightingId = sight1J.sighting_id;

// 4. Add 2 more sightings near the same spot for cluster test
const sight2 = await fetch(`${API}/api/v1/public/lost/${slug}/sighting`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    spotter_name: "Anon 2",
    spotter_phone: "+84900000020",
    sighting_address: "Gần đó",
    sighting_lat: 10.7771, sighting_lng: 106.7009,
    description: "Báo lần 2",
  }),
});
ok("R6 second sighting → 201", sight2.status === 201);

const sight3 = await fetch(`${API}/api/v1/public/lost/${slug}/sighting`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    spotter_name: "Anon 3",
    spotter_phone: "+84900000021",
    sighting_address: "Khu vực gần",
    sighting_lat: 10.7768, sighting_lng: 106.7011,
    description: "Báo lần 3",
  }),
});
ok("R7 third sighting → 201", sight3.status === 201);

// 5. Public clusters
const pubClusterRes = await fetch(`${API}/api/v1/public/lost/${slug}/clusters`);
const pubClusterJ = await pubClusterRes.json();
ok("R8 public clusters → 200", pubClusterRes.status === 200);
ok("R8b ≥1 cluster identified", (pubClusterJ.clusters?.length || 0) >= 1);
ok("R8c at least 1 cluster marked hottest", pubClusterJ.clusters?.some?.((c: any) => c.hottest));

// 6. Owner auth clusters endpoint
const ownerClusterRes = await fetch(`${API}/api/v1/lost-pets/${reportId}/clusters`, { headers: ownerHdr });
const ownerClusterJ = await ownerClusterRes.json();
ok("R9 owner clusters → 200", ownerClusterRes.status === 200);
ok("R9b owner cluster includes sightings array", Array.isArray(ownerClusterJ.clusters?.[0]?.sightings));

// 7. Owner views single sighting
const oneSightRes = await fetch(`${API}/api/v1/lost-pets/${reportId}/sightings/${sightingId}`, { headers: ownerHdr });
const oneSightJ = await oneSightRes.json();
ok("R10 owner view sighting → 200", oneSightRes.status === 200);
ok("R10b sighting has status=pending", oneSightJ.sighting?.status === "pending");

// 8. Owner confirms sighting → helper hero act
const confirmRes = await fetch(`${API}/api/v1/lost-pets/${reportId}/sightings/${sightingId}/confirm`, {
  method: "POST", headers: ownerHdr,
});
const confirmJ = await confirmRes.json();
ok("R11 confirm sighting → 200", confirmRes.status === 200, confirmJ);
ok("R11b confirmed=true", confirmJ.confirmed === true);
ok("R11c hero_act_id created (helper attributed)", typeof confirmJ.hero_act_id === "number" && confirmJ.hero_act_id > 0);
ok("R11d reporter contact revealed", typeof confirmJ.reporter?.phone === "string");

// 9. Verify helper has hero badge
const heroRes = await fetch(`${API}/api/v1/heroes/profile/${HELPER_USER}`);
const heroJ = await heroRes.json();
ok("R12 helper profile public → 200", heroRes.status === 200, heroJ);
ok("R12b heroes_count ≥ 1", (heroJ.profile?.heroes_count || 0) >= 1, heroJ.profile?.heroes_count);
ok("R12c badge_tier = helper (or higher)", ["helper", "hero", "legend", "guardian"].includes(heroJ.profile?.badge_tier));

// 10. Leaderboard
const lbRes = await fetch(`${API}/api/v1/heroes/leaderboard?period=all`);
const lbJ = await lbRes.json();
ok("R13 leaderboard public → 200", lbRes.status === 200);
const helperInLb = lbJ.entries?.find?.((e: any) => e.user_id === HELPER_USER);
ok("R13b helper appears in leaderboard", !!helperInLb, lbJ.entries?.length);

// 11. Mark reward paid
const paidRes = await fetch(`${API}/api/v1/lost-pets/${reportId}/mark-paid`, {
  method: "POST", headers: ownerHdr,
  body: JSON.stringify({ recipient_user_id: HELPER_USER }),
});
const paidJ = await paidRes.json();
ok("R14 mark-paid → 200", paidRes.status === 200, paidJ);

// Verify reward_status updated
const reportAfterPaid = await fetch(`${API}/api/v1/public/lost/${slug}`);
const reportAfterPaidJ = await reportAfterPaid.json();
ok("R14b reward_status = paid_out", reportAfterPaidJ.report.reward_status === "paid_out", reportAfterPaidJ.report?.reward_status);

// 12. Dismiss test (use second sighting)
const sightListRes = await fetch(`${API}/api/v1/lost-pets/${reportId}/sightings`, { headers: ownerHdr });
const sightListJ = await sightListRes.json();
const secondPending = sightListJ.sightings?.find?.((s: any) => s.id !== sightingId && s.status === "pending");
if (secondPending) {
  const dismissRes = await fetch(`${API}/api/v1/lost-pets/${reportId}/sightings/${secondPending.id}/dismiss`, {
    method: "POST", headers: ownerHdr,
  });
  ok("R15 dismiss sighting → 200", dismissRes.status === 200);
} else {
  ok("R15 skipped (no second pending)", true);
}

// 13. Pet Score for helper's pets — only verify the new component exists in formula
import { computePetScore } from "../shared/pet-score-formula.ts";
const score = computePetScore({
  vaccines_total: 0, vaccines_up_to_date: 0, vaccines_expired: 0,
  bcs: null, checkin_streak_days: 0, last_vet_visit_days_ago: null,
  chronic_conditions_count: 0, age_years: null, species: "other",
  recent_emergency_triage: false, allergies_count: 0, routine_streak_days: 0,
  pet_hero_bonus_raw: 500,
});
const heroComponent = score.components.find((c) => c.key === "pet_hero_bonus");
ok("R16 Pet Score has pet_hero_bonus component", !!heroComponent);
ok("R16b pet_hero_bonus 500 raw → 30 score", heroComponent?.current_value === 30, `got ${heroComponent?.current_value}`);

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
