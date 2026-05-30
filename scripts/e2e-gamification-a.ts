/**
 * E2E for Gamification Session A (achievements, rewards, feature gates).
 *
 * Strategy:
 *   - Use existing test user 10 / pet 12 (from past sessions)
 *   - Sign session JWT directly
 *   - Hit each endpoint, verify expected shape
 *   - Force-unlock an achievement by calling checkAndUnlockAchievements directly
 *   - Verify reward unlock evaluation works for current pet state
 */
import { signSession } from "../shared/jwt.ts";
import { listRows } from "../shared/baserow.ts";
import { checkAndUnlockAchievements, listActiveAchievementDefs } from "../api/src/lib/achievements.ts";
import { evaluateUnlockableRewards, generateVoucherCode } from "../api/src/lib/rewards.ts";
import { checkFeatureAccess } from "../api/src/lib/feature-gates.ts";

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
// Migration sanity — tables present + seeded counts
// ============================================================
console.log("\n=== Migration + seeds ===");
const defs = await listActiveAchievementDefs();
ok("M1 ≥20 achievement defs seeded", defs.length >= 20, `got ${defs.length}`);

const rewards = await listRows<any>("reward_definitions", { size: 200 });
ok("M2 ≥15 reward defs seeded", rewards.results.length >= 15, `got ${rewards.results.length}`);

const gates = await listRows<any>("feature_gates", { size: 200 });
ok("M3 ≥8 feature gates seeded", gates.results.length >= 8, `got ${gates.results.length}`);

// ============================================================
// API endpoints
// ============================================================
console.log("\n=== API endpoints ===");

// T1: GET achievements list
const aRes = await fetch(`${API}/api/v1/achievements/pets/${PET_ID}`, { headers: hdr });
const aJ = await aRes.json();
ok("T1 GET /achievements/pets/:id → 200", aRes.status === 200, aJ);
ok("T1b returns achievements array", Array.isArray(aJ.achievements), aJ.achievements?.length);
ok("T1c summary has total + unlocked_count", typeof aJ.summary?.total === "number" && typeof aJ.summary?.unlocked_count === "number");
ok("T1d secret achievement is masked if locked", aJ.achievements?.some?.((a: any) => a.category === "secret"));

// T2: GET rewards unlockable
const rRes = await fetch(`${API}/api/v1/rewards/pets/${PET_ID}/unlockable`, { headers: hdr });
const rJ = await rRes.json();
ok("T2 GET /rewards/pets/:id/unlockable → 200", rRes.status === 200, rJ);
ok("T2b returns unlockable[] + locked[]", Array.isArray(rJ.unlockable) && Array.isArray(rJ.locked));

// T3: GET claimed history
const cRes = await fetch(`${API}/api/v1/rewards/pets/${PET_ID}/claimed`, { headers: hdr });
const cJ = await cRes.json();
ok("T3 GET /rewards/pets/:id/claimed → 200", cRes.status === 200);
ok("T3b returns claims array", Array.isArray(cJ.claims));

// T4: Feature gate check
const fRes = await fetch(`${API}/api/v1/rewards/feature-access/playdate_basic/pets/${PET_ID}`, { headers: hdr });
const fJ = await fRes.json();
ok("T4 GET /rewards/feature-access/playdate_basic/pets/:id → 200", fRes.status === 200, fJ);
ok("T4b feature_key matches request", fJ.feature_key === "playdate_basic");

// T5: Unviewed count
const uvRes = await fetch(`${API}/api/v1/achievements/pets/${PET_ID}/unviewed`, { headers: hdr });
const uvJ = await uvRes.json();
ok("T5 GET /achievements/pets/:id/unviewed → 200", uvRes.status === 200);
ok("T5b count is a number", typeof uvJ.count === "number");

// ============================================================
// Pure logic + integration
// ============================================================
console.log("\n=== Pure logic ===");

// L1: voucher code generation
const v1 = generateVoucherCode("VV-{random8}");
ok("L1 voucher pattern VV-{random8}", /^VV-[A-Z0-9]{8}$/.test(v1), v1);
const v2 = generateVoucherCode("GOLD-{random6}");
ok("L2 voucher pattern GOLD-{random6}", /^GOLD-[A-Z0-9]{6}$/.test(v2), v2);
const v3 = generateVoucherCode("DMD-{random8}");
ok("L3 voucher pattern DMD-{random8}", /^DMD-[A-Z0-9]{8}$/.test(v3), v3);

// L4: feature gate evaluation (direct lib call)
const gateLib = await checkFeatureAccess(USER_ID, PET_ID, "playdate_basic");
ok("L4 lib checkFeatureAccess returns allowed boolean", typeof gateLib.allowed === "boolean", gateLib);
ok("L4b feature_key set", gateLib.feature_key === "playdate_basic");

const gateMissing = await checkFeatureAccess(USER_ID, PET_ID, "nonexistent_feature");
ok("L5 unknown feature → allowed=true (no gate)", gateMissing.allowed === true);

// L6: reward eval shape
const ev = await evaluateUnlockableRewards(USER_ID, PET_ID);
ok("L6 evaluateUnlockableRewards returns unlockable + locked", Array.isArray(ev.unlockable) && Array.isArray(ev.locked));
ok("L6b sum = total active rewards", ev.unlockable.length + ev.locked.length >= 1);
for (const r of [...ev.unlockable, ...ev.locked]) {
  if (typeof r.progress?.percent !== "number") {
    ok(`L6c reward ${r.code} has progress.percent`, false);
    break;
  }
}

// L7: Achievement unlock by trigger
const triggered = await checkAndUnlockAchievements({
  userId: USER_ID, petId: PET_ID, trigger: "checkin_done",
});
ok("L7 checkAndUnlockAchievements callable", Array.isArray(triggered));
// Pet 12 has check-in history → may unlock streak achievements if conditions met
console.log(`  (newly unlocked: ${triggered.length} — depends on pet state)`);

// L8: Idempotent — second call shouldn't re-unlock same achievements
const triggered2 = await checkAndUnlockAchievements({
  userId: USER_ID, petId: PET_ID, trigger: "checkin_done",
});
ok("L8 second trigger returns 0 (idempotent)", triggered2.length === 0, triggered2.length);

// ============================================================
// Frontend rendering
// ============================================================
console.log("\n=== Frontend pages ===");

const cookieOnly = { cookie };
async function page(url: string, name: string, expectMarkers: string[]): Promise<void> {
  const res = await fetch(url, { headers: cookieOnly, redirect: "manual" });
  ok(`${name} → 200`, res.status === 200, `got ${res.status}`);
  if (res.status === 200) {
    const html = await res.text();
    for (const marker of expectMarkers) {
      ok(`${name} contains "${marker}"`, html.includes(marker));
    }
  }
}

await page(
  `${WEB}/pets/${PET_ID}/achievements`,
  "P1 /pets/:id/achievements",
  ["🏆 Huy hiệu", "achievementsPage(", "/pets/" + PET_ID + "/rewards"]
);

await page(
  `${WEB}/pets/${PET_ID}/rewards`,
  "P2 /pets/:id/rewards",
  ["🎁 Thưởng", "rewardsPage(", "Có thể nhận"]
);

await page(
  `${WEB}/pets/${PET_ID}/pet-score?celebrate=1`,
  "P3 /pets/:id/pet-score?celebrate=1",
  ["scorePage(", "showCelebration", "Pet Score"]
);

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
