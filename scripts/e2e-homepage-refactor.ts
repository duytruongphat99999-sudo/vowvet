/**
 * E2E for homepage premium refactor + brand consistency.
 */
const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}${detail ? "\n   " + detail : ""}`); failures.push(name); fail++; }
}

// Fetch homepage
const r = await fetch(`${WEB}/`);
const html = await r.text();
ok("homepage loads 200", r.status === 200);

// ════════════════════════════════════════════════════════════
// 1. No more emoji feature icons on homepage
// ════════════════════════════════════════════════════════════
console.log("\n=== 1. Sến emoji removed ===");
const bannedEmoji = ["🐕", "🐶🐱", "🤖", "🌡️", "💉", "🍽️", "📸"];
for (const e of bannedEmoji) {
  // Allow within JS/text content but feature-card icons specifically should be SVG
  // We check that NO feature-card-sized emoji (preceded by text-4xl/3xl class) remains.
}
ok("No '🐕' feature emoji", !html.includes("🐕"));
ok("No '🐶🐱' decoration in hero", !html.includes("🐶🐱"));
ok("No '🤖' feature emoji", !html.includes("🤖"));
ok("No '🌡️' feature emoji", !html.includes("🌡️"));
ok("No '🍽️' feature emoji", !html.includes("🍽️"));
ok("No '📸' feature emoji", !html.includes("📸"));

// ════════════════════════════════════════════════════════════
// 2. Premium copy + tagline
// ════════════════════════════════════════════════════════════
console.log("\n=== 2. Premium copy ===");
ok("'ALL-IN-ONE' present", html.includes("ALL-IN-ONE"));
ok("'Kiến tạo tiêu chuẩn' present", html.includes("Kiến tạo tiêu chuẩn"));
ok("'Đối tác lâm sàng' eyebrow present", html.includes("Đối tác lâm sàng"));
ok("'Bạn đang ở đây' badge present", html.includes("Bạn đang ở đây"));
ok("'3 platform · 1 sứ mệnh' present", html.includes("3 platform"));
ok("'Tất cả trong 1 app' REMOVED", !html.includes("Tất cả trong 1 app"));
ok("'Cảnh báo gửi' label REMOVED", !html.includes("Cảnh báo gửi"));
ok("'WSAVA' standards present", html.includes("WSAVA"));
ok("'AAFCO' standards present", html.includes("AAFCO"));
ok("Quote from BS Duy Trường Phát present", html.includes("Duy Trường Phát"));

// ════════════════════════════════════════════════════════════
// 3. SVG icons replacing emoji
// ════════════════════════════════════════════════════════════
console.log("\n=== 3. SVG feature icons inline ===");
ok("Inline SVG icons present (rect for passport)", html.includes('rect x="4" y="3" width="16" height="18"'));
ok("Inline SVG icons present (path for arrow)", html.includes('<path d="M5 12h14"'));

// ════════════════════════════════════════════════════════════
// 4. Logo bigger
// ════════════════════════════════════════════════════════════
console.log("\n=== 4. Logo sizes upgraded ===");
ok("Logo uses h-12 (default header)", html.includes("h-12 w-12"));
ok("Logo full variant uses h-14 (footer brand col)", html.includes("h-14 w-14"));
ok("subtitle 'by Mon Min Pet' visible (text-xs not text-[10px])",
  html.includes("by Mon Min Pet") && html.match(/text-xs[^"]*\b(uppercase|tracking)/));

// ════════════════════════════════════════════════════════════
// 5. Stats labels meaningful
// ════════════════════════════════════════════════════════════
console.log("\n=== 5. Stats labels meaningful ===");
ok("'Pet được chăm sóc' label", html.includes("Pet được chăm sóc"));
ok("'Mũi vaccine theo dõi' label", html.includes("Mũi vaccine theo dõi"));
ok("'Giám sát khí hậu HCM' label", html.includes("Giám sát khí hậu HCM"));
ok("'Chuẩn vet quốc tế' label (replaces 'Phòng khám tin dùng')", html.includes("Chuẩn vet quốc tế"));
ok("'Phòng khám tin dùng' REMOVED", !html.includes("Phòng khám tin dùng"));

// ════════════════════════════════════════════════════════════
// 6. Brand consistency — favicon + manifest + OG
// ════════════════════════════════════════════════════════════
console.log("\n=== 6. Brand assets ===");
const fav = await fetch(`${WEB}/favicon.svg`);
const favText = await fav.text();
ok("favicon.svg uses ink black (#0a0a0a)", favText.includes("#0a0a0a"));
ok("favicon.svg uses gold (#ecb921)", favText.includes("#ecb921"));
ok("favicon.svg NO old sky→orange gradient", !favText.includes("#0ea5e9") && !favText.includes("#f97316"));

const ogRes = await fetch(`${WEB}/og-image.svg`);
ok("/og-image.svg exists", ogRes.status === 200);
const ogText = await ogRes.text();
ok("og-image has VowVet title", ogText.includes("VowVet"));
ok("og-image has 'BY MON MIN PET'", ogText.includes("BY MON MIN PET"));
ok("og-image uses ink + gold", ogText.includes("#0a0a0a") && ogText.includes("#ecb921"));

const mfRes = await fetch(`${WEB}/manifest.webmanifest`);
const mf = await mfRes.json();
ok("manifest theme_color = #0a0a0a", mf.theme_color === "#0a0a0a");
ok("manifest name has 'Mon Min Pet'", mf.name.includes("Mon Min Pet"));
ok("manifest icons include logo-mmp.png", mf.icons.some((i: any) => i.src === "/logo-mmp.png"));

// HTML head checks
ok("html has theme-color #0a0a0a", html.includes('content="#0a0a0a"'));
ok("html has og:image", html.includes('property="og:image"'));
ok("html has apple-touch-icon logo-mmp.png", html.includes('rel="apple-touch-icon"') && html.includes("/logo-mmp.png"));
ok("html has og:site_name", html.includes('property="og:site_name"') && html.includes("VowVet by Mon Min Pet"));

// ════════════════════════════════════════════════════════════
// 7. Founder card + Standards badge
// ════════════════════════════════════════════════════════════
console.log("\n=== 7. Founder + Standards visual cards ===");
ok("Founder card 'BS Thú y · 5+ năm'", html.includes("BS Thú y") && html.includes("5+ năm"));
ok("Standards badge 'WSAVA + AAFCO'", html.includes("Standards") && html.includes("+ AAFCO"));

// ════════════════════════════════════════════════════════════
// 8. Logo lockup also appears in footer (4-column brand block)
// ════════════════════════════════════════════════════════════
console.log("\n=== 8. Footer structure ===");
ok("footer has 'CTY TNHH Duy Trường Phát'", html.includes("CTY TNHH Duy Trường Phát"));
ok("footer has 'Cấp cứu 24/7: 0779 029 133'", html.includes("0779 029 133"));
ok("footer has WSAVA · AAFCO badge", html.includes("WSAVA · AAFCO"));

// ════════════════════════════════════════════════════════════
console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
