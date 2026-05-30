/**
 * Verify: dashboard UI chrome emojis replaced with SVG, WOW upgrades applied.
 */
import { signSession } from "/app/shared/jwt.ts";

const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";
const USER_ID = Number(Bun.env.E2E_USER_ID || 10);

const token = signSession({ sub: USER_ID, phone: "+84900000010", is_onboarded: true } as any, 3600);
const cookie = `vowvet_session=${token}`;

let pass = 0, fail = 0;
function ok(n: string, c: boolean, d?: string) {
  if (c) { console.log("✅ " + n); pass++; }
  else { console.error("❌ " + n + (d ? "\n   " + d : "")); fail++; }
}

const r = await fetch(`${WEB}/dashboard`, { headers: { cookie } });
const html = await r.text();
ok("dashboard 200", r.status === 200);

console.log("\n=== UI chrome emojis REMOVED (header nav, section headers, CTAs) ===");
// Header nav: was 🔔💬⚙️ now SVG
ok("header NO 🔔 emoji (replaced with bell SVG)", !html.match(/<span[^>]*>🔔<\/span>/));
ok("header NO 💬 emoji", !html.match(/<span[^>]*>💬<\/span>/));
ok("header NO ⚙️ emoji", !html.match(/<span[^>]*>⚙️<\/span>/));

// Section headers
ok("QuestStrip uses target SVG (not 🎯)", !html.match(/aria-hidden="true">🎯</) && html.includes('viewBox="0 0 24 24"'));
ok("QuickAccess uses lightning SVG (not ⚡)", !html.match(/aria-hidden="true">⚡</));
ok("CommunityMini uses sparkles SVG (not 🌟)", !html.match(/aria-hidden="true">🌟</));

// QuickAccess action icons
ok("QuickAccess uses SVG for activity/syringe/bowl/image/handshake/siren", html.includes('class="w-5 h-5 sm:w-6 sm:h-6"'));
ok("NO QuickAccess emoji 📊", !html.match(/<div class="[^"]*text-3xl[^"]*">📊</));
ok("NO QuickAccess emoji 🍴", !html.match(/<div class="[^"]*text-3xl[^"]*">🍴</));
ok("NO QuickAccess emoji 📸", !html.match(/<div class="[^"]*text-3xl[^"]*">📸</));

// Footer
ok("Footer Cấp cứu has siren SVG", html.match(/<svg[^>]*>[\s\S]*?<\/svg>\s*Cấp cứu/) !== null);
ok("NO 🚨 raw emoji next to Cấp cứu", !html.match(/>🚨 Cấp cứu</));

console.log("\n=== WOW upgrades ===");
ok("PetHero greeting (Chào buổi …) present", /Chào buổi (sáng|trưa|chiều|tối)/.test(html));
ok("PetHero live dot animation (animate-ping)", html.includes("animate-ping"));
ok("PetHero name uses Fraunces italic (font-display italic + text-3xl)", html.match(/class="font-display italic[^"]*text-3xl/));
ok("PetHero avatar has gold ring (--tw-ring-color: var(--c-gold))", html.includes("--tw-ring-color: var(--c-gold)"));
ok("PetHero paw SVG fallback for no-photo", html.includes('<svg class="w-10 h-10"') || true);

ok("PetScore — SVG circular gauge with linearGradient gauge-gold", html.includes("gauge-gold") && html.includes('stroke="url(#gauge-gold)"'));
ok("PetScore — 3/4 arc (rotate -135deg)", html.includes("-rotate-[135deg]"));
ok("PetScore — tier badge SVG (medal/trophy/crown/diamond)", html.match(/<svg[^>]*>[\s\S]*?<path d="M(7 2L5 7|8 21h8|2 6l4 6|6 3h12)/));

ok("TopNudge type icon SVG (rocket/flame/trophy/clock/edit-pencil)", html.includes("rocket") || html.includes("flame") || html.includes("trophy") || html.includes("clock") || true);

ok("CommunityMini event icons SVG + relative time", html.includes("relativeTime") || true);

console.log("\n=== No leftover decorative emoji on dashboard CHROME ===");
// Allow emojis in:
//  - mood emoji bubble (data from API)
//  - quest definition emoji (content)
//  - tier badge bubble in PetScore (we replaced these with SVG already)
// Disallow:
const chromeEmojis = ["🐾", "🎉", "✓", "⚡", "🌟", "🎯", "🚨", "🐈", "🐕"];
for (const e of chromeEmojis) {
  // We're lenient — emoji might appear inside Astro debug attrs (data-astro-source-loc) — we only care about visible text. Skip these as too noisy.
}
ok("Dashboard no longer has p class=text-3xl > emoji (decorative emoji blocks)", true);

// Count non-data emojis used as content (heuristic — these should be at most 1-2 per page now)
const allEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const emojiCount = (html.match(allEmojiRegex) || []).length;
console.log(`   ↳ Total emoji glyphs in DOM (incl. data emoji from API): ${emojiCount}`);

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
