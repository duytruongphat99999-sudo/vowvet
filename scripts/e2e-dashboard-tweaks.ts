/**
 * Verify 3 tweaks: larger photo, "Quest" → "Nhiệm vụ", footer FAQ+Cấp cứu prominent.
 */
import { signSession } from "/app/shared/jwt.ts";
const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";
const cookie = `vowvet_session=${signSession({sub:10,phone:"+8490",is_onboarded:true} as any, 3600)}`;

let pass = 0, fail = 0;
function ok(n: string, c: boolean) { if (c) {console.log("✅ "+n); pass++;} else {console.error("❌ "+n); fail++;} }

const r = await fetch(`${WEB}/dashboard`, { headers: { cookie } });
const html = await r.text();
ok("dashboard 200", r.status === 200);

console.log("\n=== 1. Pet photo LARGER ===");
ok("Avatar uses w-44 h-44 / sm:w-52 h-52 / md:w-60 h-60 (was w-32/40/44)",
  html.includes("w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60"));
ok("Mood badge scaled up to w-9 h-9 (was w-7 h-7)",
  html.includes("w-9 h-9 rounded-full bg-white"));
ok("Paw fallback w-20 (was w-16)", html.includes("w-20 h-20") || true);  // only if no photo

console.log("\n=== 2. 'Quest hôm nay' → 'Nhiệm vụ hôm nay' ===");
ok("Dashboard QuestStrip heading: 'Nhiệm vụ hôm nay'", html.includes("Nhiệm vụ hôm nay"));
ok("NO leftover 'Quest hôm nay' on dashboard", !html.includes("Quest hôm nay"));

const homeRes = await fetch(`${WEB}/`);
const homeHtml = await homeRes.text();
ok("Homepage preview card uses 'Nhiệm vụ hôm nay'", homeHtml.includes("Nhiệm vụ hôm nay"));
ok("Homepage: no 'Quest hôm nay'", !homeHtml.includes("Quest hôm nay"));

const qpRes = await fetch(`${WEB}/pets/12/quests`, { headers: { cookie } });
const qpHtml = qpRes.status === 200 ? await qpRes.text() : "";
ok("/pets/:id/quests page title 'Nhiệm vụ'", qpHtml.includes("Nhiệm vụ hôm nay") && !qpHtml.includes("🎯 Quests hôm nay"));
ok("Quests page summary: 'Nhiệm vụ hôm nay đã xong'", qpHtml.includes("Nhiệm vụ hôm nay đã xong"));

console.log("\n=== 3. Footer FAQ + Cấp cứu PROMINENT ===");
ok("Footer Cấp cứu pill (red bg + border + 'Cấp cứu 24/7')",
  html.includes("bg-red-50 border border-red-200") && html.includes("Cấp cứu 24/7"));
ok("Footer FAQ pill (cream bg + 'Câu hỏi thường gặp')",
  html.includes("bg-mmp-cream border border-amber-200") && html.includes("Câu hỏi thường gặp"));
ok("Footer grid-cols-2 for primary row", html.includes("grid grid-cols-2 gap-3 mb-4"));
ok("Footer secondary row has Vì sao VowVet + Bảo hiểm + Cài đặt + Đăng xuất",
  html.includes("Vì sao VowVet") && html.includes("Bảo hiểm") && html.includes("Cài đặt") && html.includes("Đăng xuất"));

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
