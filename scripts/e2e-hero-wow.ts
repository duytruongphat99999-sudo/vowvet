/**
 * Verify hero WOW redesign + pill clip fix.
 */
const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";

let pass = 0, fail = 0;
function ok(n: string, c: boolean, d?: string) {
  if (c) { console.log("✅ " + n); pass++; }
  else { console.error("❌ " + n + (d ? "\n   " + d : "")); fail++; }
}

const r = await fetch(`${WEB}/`);
const html = await r.text();
ok("homepage 200", r.status === 200);

console.log("\n=== 1. VowVet card pill clip fix ===");
// The pill should be OUTSIDE the overflow-hidden card. Check structure:
// outer wrapper without overflow-hidden → pill (absolute -top-3) + inner card (overflow-hidden)
// Confirm pill is no longer nested inside .attention-card.overflow-hidden
ok("VowVet card has new wrapper structure", html.includes('class="relative">\n            <!-- Animated "Bạn đang ở đây" pill'));
ok("attention-card no longer wraps the pill", !html.match(/attention-card[^"]*overflow-hidden[^"]*">[\s]*<!--[^>]*-->[\s]*<div class="attention-pill/));
ok("Pill has z-20 + shadow-lg (more prominent)", html.includes("z-20 shadow-lg"));

console.log("\n=== 2. Hero WOW layout ===");
ok("Hero uses asymmetric 2-col grid (lg:grid-cols-[1.15fr_1fr])", html.includes("lg:grid-cols-[1.15fr_1fr]"));
ok("Stacked headline (block text-4xl ... text-7xl)", html.includes('class="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white">Người bạn'));
ok("Gold sweep underline on 'cho thú cưng'", html.includes("gold-sweep"));
ok("Hero entrance fade animation (.hero-fade)", html.includes("hero-fade"));
ok("Multiple stagger delays (.hero-fade-d1 to d5)", html.includes("hero-fade-d1") && html.includes("hero-fade-d5"));
ok("Trust badges row (3 pills: AI tiếng Việt, Miễn phí, 30s setup)",
  html.includes("AI tiếng Việt") && html.includes("100% Miễn phí") && html.includes("30 giây setup"));
ok("Secondary CTA 'Xem 6 tính năng cốt lõi ↓'", html.includes("Xem 6 tính năng cốt lõi"));

console.log("\n=== 3. Floating product preview cards (5 cards) ===");
ok("Card 1: Pet Score 850 gauge", html.includes("Pet Score") && html.includes(">850<"));
ok("Card 2: Quest 'Check-in cảm xúc' completed", html.includes("Check-in cảm xúc") && html.includes("Hoàn thành"));
ok("Card 3: Vaccine WSAVA DHPP center (ink dark anchor)", html.includes("DHPP Booster") && html.includes("Nhắc trước 14 ngày"));
ok("Card 4: Climate alert 35°C HCM", html.includes("35°C") && html.includes("HCM Quận 1"));
ok("Card 5: QR Passport mini with mock QR grid", html.includes("Hộ chiếu pet") && html.includes("aspect-square"));
ok("Card animations (.float-y / .float-y-slow / .float-y-fast)",
  html.includes("float-y") && html.includes("float-y-slow") && html.includes("float-y-fast"));
ok("Background logo watermark behind cards (opacity-[0.07])", html.includes("opacity-[0.07]"));

console.log("\n=== 4. Scroll anchor ===");
ok("Section #features exists for ↓ smooth-scroll target", html.includes('id="features"'));
ok("Anchor uses scroll-mt-20", html.includes("scroll-mt-20"));

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
