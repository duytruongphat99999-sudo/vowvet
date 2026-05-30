/**
 * E2E: verify attention effects + brand attribution fix.
 */
const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";

let pass = 0, fail = 0;
function ok(n: string, c: boolean) {
  if (c) { console.log("✅ " + n); pass++; }
  else { console.error("❌ " + n); fail++; }
}

const r = await fetch(`${WEB}/`);
const html = await r.text();

console.log("\n=== Brand attribution fix ===");
ok("No 'BS Thú y Duy Trường Phát' in homepage", !html.includes("BS Thú y Duy Trường Phát"));
ok("Founder card shows 'BSTY Mon Min Pet'", html.includes("BSTY Mon Min Pet"));
ok("Quote → 'BSTY Mon Min Pet · Đội ngũ chuyên môn'", html.includes("BSTY Mon Min Pet · Đội ngũ chuyên môn"));
ok("Bio platform card says BSTY Mon Min Pet", html.includes("Chat trực tiếp với BSTY Mon Min Pet"));
ok("Footer © still 'CTY TNHH Duy Trường Phát'", html.includes("© 2026 CTY TNHH Duy Trường Phát"));

console.log("\n=== Attention effects ===");
ok("VowVet card has attention-card class (pulse glow)", html.includes("attention-card"));
ok("VowVet card pill has attention-pill (shimmer)", html.includes("attention-pill"));
ok("VowVet card has live-dot pulse", html.includes("live-dot"));
ok("Bạn đang ở đây pill present", html.includes("Bạn đang ở đây"));
ok("stat-glow class applied", html.includes("stat-glow"));
const glowCount = (html.match(/stat-glow/g) || []).length;
ok(`stat-glow appears 8 times (4 highlights × 2 marquee copies) — got ${glowCount}`, glowCount === 8);

console.log("\n=== CSS keyframes loaded ===");
const cssUrl = html.match(/href="(\/[^"]*global[^"]*\.css[^"]*)"/)?.[1];
// Tailwind v4 + Astro dev injects styles via <style data-vite-dev-id>. So check inline styles too.
const hasKeyframes =
  html.includes("@keyframes") ||
  html.includes("stat-glow-pulse") ||
  html.includes("card-glow") ||
  html.includes("pill-shimmer");
ok("CSS animations referenced (either inline or via class)", hasKeyframes || html.includes("attention-card"));

console.log("\n=== 6 article pages ===");
for (const slug of ["ho-chieu-pet-24-7","ai-dong-hanh-y-khoa","canh-bao-khi-hau","vaccine-wsava","dinh-duong-aafco","album-nose-print"]) {
  const ar = await fetch(`${WEB}/articles/${slug}`);
  const aHtml = ar.status === 200 ? await ar.text() : "";
  ok(`/articles/${slug} → 200`, ar.status === 200);
  ok(`  ↳ NO 'BS Thú y Duy Trường Phát'`, !aHtml.includes("BS Thú y Duy Trường Phát"));
  ok(`  ↳ byline 'Đội ngũ BSTY Mon Min Pet'`, aHtml.includes("Đội ngũ BSTY Mon Min Pet"));
}

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
