/**
 * E2E for homepage v2 + 6 articles.
 */
const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}${detail ? "\n   " + detail : ""}`); failures.push(name); fail++; }
}

// ════════════════════════════════════════════════════════════
// Homepage tweaks
// ════════════════════════════════════════════════════════════
console.log("\n=== Homepage v2 tweaks ===");
const r = await fetch(`${WEB}/`);
const html = await r.text();
ok("homepage loads 200", r.status === 200);

// 1. H1 single line + no duplicate CTA
ok("H1 'Người bạn đồng hành sức khoẻ' uses whitespace-nowrap", html.includes("whitespace-nowrap"));
ok("H1 'cho thú cưng' is a separate line (broken out)", html.includes("cho thú cưng"));
ok("'Vì sao chọn VowVet?' duplicate CTA REMOVED from hero", !html.match(/border border-white\/20[^"]*"\s*>\s*Vì sao chọn VowVet\?/));

// 2. Stats marquee
ok("Marquee track present (class='marquee-track')", html.includes("marquee-track"));
ok("Marquee wrapper has pause-on-hover", html.includes("marquee-wrapper"));
ok("Stat 'Chủ nuôi tin dùng HCM' present", html.includes("Chủ nuôi tin dùng HCM"));
ok("Stat 'Năm kinh nghiệm vet' present", html.includes("Năm kinh nghiệm vet"));
ok("Stat 'Miễn phí gói cơ bản' present", html.includes("Miễn phí gói cơ bản"));
ok("Stat 'Check-in mỗi sáng' present", html.includes("Check-in mỗi sáng"));
ok("'AAFCO' standard present", html.includes("AAFCO") && html.includes("Chuẩn dinh dưỡng Hoa Kỳ"));

// 3. Big logo card on light backdrop in Đối tác section
ok("Logo card uses LIGHT bg (from-white via-mmp-cream)", html.includes("from-white via-mmp-cream"));
ok("Logo card has gold glow", html.includes("rgba(236,185,33,0.35)"));
ok("Logo in card sized 56/64 (w-56 w-64)", html.includes("w-56 h-56") || html.includes("w-64 h-64"));

// 4. Footer label
ok("'Vận hành bởi' replaces 'Công ty'", html.includes("Vận hành bởi") && !html.includes(">Công ty<"));

// 5. Feature cards link to /articles/<slug>
ok("Feature card links use /articles/ho-chieu-pet-24-7", html.includes('href="/articles/ho-chieu-pet-24-7"'));
ok("Feature card links use /articles/ai-dong-hanh-y-khoa", html.includes('href="/articles/ai-dong-hanh-y-khoa"'));
ok("Feature card links use /articles/canh-bao-khi-hau", html.includes('href="/articles/canh-bao-khi-hau"'));
ok("Feature card links use /articles/vaccine-wsava", html.includes('href="/articles/vaccine-wsava"'));
ok("Feature card links use /articles/dinh-duong-aafco", html.includes('href="/articles/dinh-duong-aafco"'));
ok("Feature card links use /articles/album-nose-print", html.includes('href="/articles/album-nose-print"'));

// ════════════════════════════════════════════════════════════
// 6 articles must render
// ════════════════════════════════════════════════════════════
console.log("\n=== 6 articles render ===");
const ARTICLE_SLUGS = [
  ["ho-chieu-pet-24-7", "Hộ chiếu pet 24/7"],
  ["ai-dong-hanh-y-khoa", "AI đồng hành y khoa"],
  ["canh-bao-khi-hau", "Cảnh báo khí hậu thời gian thực"],
  ["vaccine-wsava", "Lịch tiêm chuẩn WSAVA"],
  ["dinh-duong-aafco", "Dinh dưỡng cá nhân hoá"],
  ["album-nose-print", "Album kỷ niệm + Nose Print"],
];
for (const [slug, title] of ARTICLE_SLUGS) {
  const ar = await fetch(`${WEB}/articles/${slug}`, { redirect: "manual" });
  const aHtml = ar.status === 200 ? await ar.text() : "";
  ok(`/articles/${slug} → 200`, ar.status === 200, `status=${ar.status}`);
  if (ar.status === 200) {
    ok(`  ↳ contains title "${title}"`, aHtml.includes(title));
    ok(`  ↳ has Fraunces italic h1`, aHtml.includes("font-display italic"));
    ok(`  ↳ has reading time + author`, aHtml.includes("phút đọc") && aHtml.includes("Duy Trường Phát"));
    ok(`  ↳ has related articles section`, aHtml.includes("Các tính năng liên quan"));
    ok(`  ↳ has mid-article CTA`, aHtml.includes("Setup 30 giây"));
    ok(`  ↳ inverted Logo has white backdrop (rounded-full bg-white)`, aHtml.includes("rounded-full bg-white"));
  }
}

// ════════════════════════════════════════════════════════════
// Logo backdrop check on homepage footer (dark bg)
// ════════════════════════════════════════════════════════════
console.log("\n=== Logo light backdrop on dark bg ===");
ok("Homepage footer Logo has rounded-full bg-white backdrop", html.includes("rounded-full bg-white"));

// ════════════════════════════════════════════════════════════
console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
