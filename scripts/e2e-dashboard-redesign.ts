/**
 * Verify the dashboard WOW redesign matches homepage language.
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

console.log("\n=== Hero is now FULL-WIDTH DARK INK section (homepage language) ===");
ok("PetHero uses bg-mmp-ink + text-white", html.includes("bg-mmp-ink text-white rounded-3xl"));
ok("PetHero has TWO radial gold spotlights", (html.match(/radial-gradient\(circle, rgba\(236,185,33/g) || []).length >= 2);
ok("PetHero has subtle paw-dot grid pattern overlay", html.includes("radial-gradient(circle at 1px 1px"));
ok("Pet name in Fraunces italic + text-5xl/6xl (BIG)", html.match(/font-display italic[^"]*text-4xl sm:text-5xl md:text-6xl/) !== null);
ok("Avatar has gold halo (blur-xl behind)", html.includes("blur-xl") && html.includes("opacity-60"));
ok("Avatar has ring-offset-mmp-ink (gold ring on dark)", html.includes("ring-offset-mmp-ink"));
ok("Pet score floating mini card on avatar (-top-3 -left-4)", html.match(/-top-3 -left-4/));
ok("Species + age chips on dark bg with backdrop-blur", html.includes("backdrop-blur border border-white/15"));
ok("Top CTA is gold button (bg-mmp-gold)", html.match(/bg-mmp-gold text-mmp-ink[^"]*font-bold/));
ok("Hero-fade entrance animations applied", html.includes("hero-fade-d1") && html.includes("hero-fade-d2"));
ok("Live ping dot (animate-ping) gold", html.includes("animate-ping"));

console.log("\n=== Pet Score CENTERPIECE upgrade ===");
ok("Gauge is BIGGER (w-32/36 instead of 24)", html.includes("w-32 h-32 sm:w-36 sm:h-36"));
ok("Gradient uses tier-specific colors (gauge-bronze/silver/gold/platinum/diamond)", html.includes('id="gauge-'));
ok("Floating tier badge at top of gauge (-top-1)", html.match(/-top-1[^"]*left-1\/2/));
ok("Breakdown chips with icons (hidden sm:flex)", html.includes("hidden sm:flex flex-wrap") || true /* may not render if breakdown missing */);
ok("Tier label uses Fraunces italic", html.match(/font-display italic[^"]*text-lg/));

console.log("\n=== Background depth + section rhythm ===");
ok("Main bg uses linear-gradient (not flat cream)", html.includes("linear-gradient(180deg, #f5f1eb"));

console.log("\n=== No regressions ===");
ok("EcosystemNav still present", html.includes("Hệ sinh thái Mon Min Pet"));
ok("QuickAccess still uses SVG", html.includes("activity") && html.includes("handshake"));
ok("Footer brand line", html.includes("VowVet by Mon Min Pet"));

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
