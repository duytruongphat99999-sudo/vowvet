/**
 * E2E smoke test for UX fix:
 *   - Mood endpoint returns `reason` + `suggested_actions` array
 *   - Quests endpoint returns `cta_link` per quest + `completed_count`
 *   - Dashboard HTML contains Alpine x-data popover + clickable quest chips
 */
import { signSession } from "/app/shared/jwt.ts";

const API = Bun.env.E2E_API || "http://127.0.0.1:3000";
const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";
const USER_ID = Number(Bun.env.E2E_USER_ID || 10);
const PET_ID = Number(Bun.env.E2E_PET_ID || 12);

const token = signSession(
  { sub: USER_ID, phone: "+84900000010", email: "e2e@local", is_onboarded: true } as any,
  3600,
);
const cookie = `vowvet_session=${token}`;
const hdr = { cookie, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else {
    const detail = typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 400);
    console.error(`❌ ${name}${detail ? "\n   " + detail : ""}`);
    fail++;
  }
}

// ============================================================
// Mood endpoint
// ============================================================
console.log("\n=== Mood endpoint ===");
const mRes = await fetch(`${API}/api/v1/mood/pets/${PET_ID}`, { headers: hdr });
const mJ = await mRes.json();
ok("mood: 200 OK", mRes.status === 200, mJ);
ok("mood.state present", typeof mJ.mood?.state === "string", mJ);
ok("mood.emoji present", typeof mJ.mood?.emoji === "string");
ok("mood.label_vi present", typeof mJ.mood?.label_vi === "string");
ok("mood.message present", typeof mJ.mood?.message === "string");
ok("mood.color_class present", typeof mJ.mood?.color_class === "string");
ok("mood.reason present (NEW)", typeof mJ.mood?.reason === "string" && mJ.mood.reason.length > 5, mJ.mood);
ok("mood.suggested_actions is array (NEW)", Array.isArray(mJ.mood?.suggested_actions));
ok("mood.suggested_actions ≥1 item (NEW)", (mJ.mood?.suggested_actions?.length ?? 0) >= 1, mJ.mood?.suggested_actions);
if (mJ.mood?.suggested_actions?.length) {
  const a = mJ.mood.suggested_actions[0];
  ok("action[0].label is string", typeof a.label === "string");
  ok("action[0].link is string starting with /", typeof a.link === "string" && a.link.startsWith("/"));
  ok("action[0].reward is string", typeof a.reward === "string" && a.reward.length > 0);
}

console.log(`   ↳ Current mood: ${mJ.mood?.state} ${mJ.mood?.emoji} (${mJ.mood?.suggested_actions?.length || 0} actions)`);
console.log(`   ↳ reason: ${mJ.mood?.reason}`);

// ============================================================
// Quests endpoint
// ============================================================
console.log("\n=== Quests endpoint ===");
const qRes = await fetch(`${API}/api/v1/quests/pets/${PET_ID}/today`, { headers: hdr });
const qJ = await qRes.json();
ok("quests: 200 OK", qRes.status === 200, qJ);
ok("quests array", Array.isArray(qJ.quests));
ok("quests.length === 3", qJ.quests?.length === 3, `got ${qJ.quests?.length}`);
ok("date field", typeof qJ.date === "string");
ok("completed_count field (NEW)", typeof qJ.completed_count === "number", qJ);

for (let i = 0; i < (qJ.quests || []).length; i++) {
  const q = qJ.quests[i];
  ok(`quest[${i}].cta_link present (NEW)`, typeof q.cta_link === "string" && q.cta_link.startsWith("/"), q);
  ok(`quest[${i}].cta_link substitutes {petId}`, !q.cta_link?.includes("{petId}"), q.cta_link);
  console.log(`   ↳ #${i + 1} ${q.definition?.emoji} ${q.definition?.name} → ${q.cta_link}`);
}

// ============================================================
// Dashboard HTML smoke
// ============================================================
console.log("\n=== Dashboard HTML ===");
const dRes = await fetch(`${WEB}/dashboard`, { headers: { cookie } });
const html = await dRes.text();
ok("dashboard 200", dRes.status === 200, `status=${dRes.status}`);
ok("dashboard has x-data with mood (NEW Alpine)", html.includes("x-data") && html.includes("Bé hôm nay"));
ok("dashboard has @click toggling popover", html.includes("@click=\"open = !open\""));
ok("dashboard has @click.outside dismiss", html.includes("@click.outside"));
ok("dashboard has x-text=\"mood.reason\"", html.includes('x-text="mood.reason"'));
ok("dashboard has x-for over suggested_actions", html.includes('x-for="action in mood.suggested_actions"'));
ok("dashboard has Quest cta_link per chip (NEW)", html.includes("Click từng quest để hoàn thành"));
ok("dashboard has rotate chevron indicator", html.includes("rotate-180"));

// ============================================================
console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
