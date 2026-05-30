/**
 * Verify: clean avatar (no Pet Score mini card / no emoji bubble), mood SVG,
 * QuickAccess matches ecosystem card pattern.
 */
import { signSession } from "/app/shared/jwt.ts";

const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";
const token = signSession({ sub: 10, phone: "+84900000010", is_onboarded: true } as any, 3600);
const cookie = `vowvet_session=${token}`;

let pass = 0, fail = 0;
function ok(n: string, c: boolean) {
  if (c) { console.log("✅ " + n); pass++; }
  else { console.error("❌ " + n); fail++; }
}

const r = await fetch(`${WEB}/dashboard`, { headers: { cookie } });
const html = await r.text();
ok("dashboard 200", r.status === 200);

console.log("\n=== 1. Avatar CLEAN (no big overlay covering photo) ===");
ok("NO Pet Score floating mini card (Score label + trophy SVG overlay)",
  !html.match(/-top-3 -left-4[^"]*"[^>]*>[\s\S]*?<p[^>]*>Score</)); // no overlap with photo
ok("NO mood emoji bubble (w-12 h-12 text-2xl)", !html.match(/w-12 h-12 bg-white rounded-2xl[^"]*"[^>]*>\s*[^<\s]+\s*</));
ok("Small mood indicator (w-7 h-7 SVG icon, corner dot)", html.includes("w-7 h-7 rounded-full bg-white"));
ok("Avatar still has gold ring + offset on ink", html.includes("ring-offset-mmp-ink"));

console.log("\n=== 2. Mood uses SVG icon (no emoji) ===");
ok("Mood chip uses SVG (mood-happy/chill/excited/sad/sleeping/needy)",
  html.match(/mood-(happy|chill|excited|sad|sleeping|needy)/));
ok("NO emoji in mood chip (e.g., 😊 directly inside span class=font-semibold)",
  !html.match(/<span class="font-semibold capitalize">[\s]*[\u{1F300}-\u{1F6FF}]/u));

console.log("\n=== 3. QuickAccess matches ecosystem card pattern ===");
ok("Cards use w-12 h-12 icon container (NOT old 11x11/12)",
  html.match(/w-12 h-12 rounded-xl bg-mmp-ink\/5[^"]*group-hover:bg-mmp-gold\/15/));
ok("Cards have h3 bold title + sub-label", html.includes("Sức khoẻ ngày") && html.includes("Lịch tiêm WSAVA"));
ok("Cards use rounded-2xl + p-4/p-5 (ecosystem-like)", html.includes("rounded-2xl p-4 sm:p-5"));
ok("Hover border-mmp-ink (matches ecosystem cards)", html.match(/hover:border-mmp-ink hover:shadow-md/));
ok("Section has 'Xem hết' link with gold color", html.includes(">Xem hết<") || html.includes("Xem hết"));

console.log("\n=== 4. Pet Score zone still BIG centerpiece ===");
ok("Pet Score circular gauge (w-32/36)", html.includes("w-32 h-32 sm:w-36 sm:h-36"));
ok("Tier badge SVG (medal/trophy/crown/diamond)", html.match(/<svg[^>]*>[\s\S]*?<path d="M(7 2L5 7|8 21h8|2 6l4 6|6 3h12)/));

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
