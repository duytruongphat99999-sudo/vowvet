/**
 * E2E for /insurance landing page + waitlist API.
 */
const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";
const API = Bun.env.E2E_API || "http://127.0.0.1:3000";

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(n: string, c: boolean, d?: string) {
  if (c) { console.log("✅ " + n); pass++; }
  else { console.error("❌ " + n + (d ? "\n   " + d : "")); failures.push(n); fail++; }
}

// ════════════════════════════════════════════════════════════
// 1. /insurance page renders PUBLIC (no auth)
// ════════════════════════════════════════════════════════════
console.log("\n=== 1. /insurance page PUBLIC ===");
const r = await fetch(`${WEB}/insurance`, { redirect: "manual" });
ok("/insurance returns 200 anonymous", r.status === 200, `got ${r.status}`);
const html = await r.text();
ok("page has 'Bảo hiểm thú cưng' in title", html.includes("Bảo hiểm thú cưng"));
ok("hero CTA 'Đăng ký nhận thông báo'", html.includes("Đăng ký nhận thông báo"));
ok("'Sắp ra mắt · Q3-Q4 2026' eyebrow", html.includes("Q3-Q4 2026"));

console.log("\n=== 2. Hero matches homepage premium pattern ===");
ok("Dark ink hero (bg-mmp-ink text-white)", html.includes("bg-mmp-ink text-white relative overflow-hidden"));
ok("Gold spotlights (2 radial gradients)", (html.match(/radial-gradient\(circle, rgba\(236,185,33/g) || []).length >= 2);
ok("Fraunces italic H1 'đầu tiên tích hợp AI'", html.includes("font-display italic") && html.includes("đầu tiên tích hợp AI"));
ok("gold-dot eyebrow element", html.includes("gold-dot"));

console.log("\n=== 3. NO sến emojis (replaced with SVG) ===");
ok("NO 💸 emoji in why section", !html.includes("💸"));
ok("NO 🚨 emoji in why section", !html.includes("🚨"));
ok("NO 🛡️ emoji in why section", !html.includes("🛡️"));
ok("NO 🥉🥈🥇 emojis in tier section", !html.includes("🥉") && !html.includes("🥈") && !html.includes("🥇"));
ok("NO 💎 emoji in diamond tier", !html.includes("💎"));
ok("NO 🔥 emoji in social proof", !html.includes("🔥"));

console.log("\n=== 4. SVG icons in place ===");
ok("Wallet SVG (wallet icon for cost section)", html.includes('M21 12V7H5a2 2 0 0 1 0-4'));
ok("Alert-triangle SVG (accident section)", html.includes('M10.29 3.86L1.82 18'));
ok("Scale SVG (legal section)", html.match(/M16 16l3-8 3 8/));
ok("Shield SVG (insurance theme)", html.includes('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'));

console.log("\n=== 5. Pet Score tier discount uses CORRECT brackets ===");
ok("'0 – 300' bronze bracket", html.includes("0 – 300"));
ok("'301 – 500' silver bracket", html.includes("301 – 500"));
ok("'501 – 700' gold bracket", html.includes("501 – 700"));
ok("'701 – 850' platinum bracket", html.includes("701 – 850"));
ok("'851 – 1000' diamond bracket", html.includes("851 – 1000"));
ok("Discount labels present (Standard/5%/15%/20%/25%)",
  html.includes("Giảm 5%") && html.includes("Giảm 15%") && html.includes("Giảm 20%") && html.includes("Giảm 25%"));

console.log("\n=== 6. 3 partners (Fubon, Igloo, Pet Health Centre) ===");
ok("Fubon Insurance card", html.includes("Fubon Insurance"));
ok("Igloo Insure card", html.includes("Igloo Insure"));
ok("Pet Health Centre card", html.includes("Pet Health Centre"));

console.log("\n=== 7. Market context numbers ===");
ok("'$43.9M' market size", html.includes("$43.9"));
ok("'+10%' CAGR", html.includes("+10"));
ok("IMARC Group source", html.includes("IMARC"));

console.log("\n=== 8. Waitlist form fields ===");
ok("form @submit.prevent waitlistForm", html.includes("waitlistForm()"));
ok("email input required", html.includes('type="email"') && html.includes("required"));
ok("phone input (optional)", html.includes('type="tel"'));
ok("pet_count number input", html.includes('x-model.number="form.pet_count"'));
ok("pet_species select with dog/cat/both options", html.includes('value="dog"') && html.includes('value="cat"') && html.includes('value="both"'));
ok("pet_age_range select (puppy/adult/senior/mixed)", html.includes('value="puppy"') && html.includes('value="senior"'));
ok("interest_level select (just_curious/comparing/ready_to_buy)", html.includes('value="ready_to_buy"'));
ok("submit button 'Đăng ký waitlist'", html.includes(">Đăng ký waitlist<"));

// ════════════════════════════════════════════════════════════
// 9. POST /waitlist creates row
// ════════════════════════════════════════════════════════════
console.log("\n=== 9. POST /api/v1/insurance/waitlist ===");
const testEmail = `e2e-${Date.now()}@test.local`;
const submitRes = await fetch(`${API}/api/v1/insurance/waitlist`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail,
    phone: "0779029133",
    pet_count: 2,
    pet_species: "dog",
    pet_age_range: "adult",
    interest_level: "ready_to_buy",
    notes: "E2E test",
  }),
});
const submitJ = await submitRes.json();
ok("POST waitlist 200", submitRes.status === 200);
ok("success: true", submitJ.success === true);
ok("duplicate: false (first submission)", submitJ.duplicate === false);
ok("message in VN", typeof submitJ.message === "string" && submitJ.message.includes("ghi nhận"));

// Dedupe test
const dupeRes = await fetch(`${API}/api/v1/insurance/waitlist`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail,
    pet_count: 1,
    pet_species: "cat",
    pet_age_range: "puppy",
    interest_level: "just_curious",
  }),
});
const dupeJ = await dupeRes.json();
ok("Dedupe: duplicate=true on same email", dupeJ.duplicate === true);

// Invalid email
const badRes = await fetch(`${API}/api/v1/insurance/waitlist`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "not-an-email", pet_count: 1, pet_species: "dog", pet_age_range: "adult", interest_level: "comparing" }),
});
ok("Invalid email → 400", badRes.status === 400);

// ════════════════════════════════════════════════════════════
// 10. GET /waitlist/count
// ════════════════════════════════════════════════════════════
console.log("\n=== 10. GET /api/v1/insurance/waitlist/count ===");
const countRes = await fetch(`${API}/api/v1/insurance/waitlist/count`);
const countJ = await countRes.json();
ok("count endpoint 200", countRes.status === 200);
ok("count is number ≥ 1", typeof countJ.count === "number" && countJ.count >= 1);

// ════════════════════════════════════════════════════════════
// 11. Homepage shows 7th card "Bảo hiểm" with badge
// ════════════════════════════════════════════════════════════
console.log("\n=== 11. Homepage 7th feature card ===");
const home = await fetch(`${WEB}/`);
const homeHtml = await home.text();
ok("Homepage has 'Bảo hiểm thú cưng' card", homeHtml.includes("Bảo hiểm thú cưng"));
ok("Card has 'Sắp ra mắt' badge", homeHtml.includes("Sắp ra mắt"));
ok("Card links to /insurance", homeHtml.includes('href="/insurance"'));

// ════════════════════════════════════════════════════════════
// 12. Anonymous + not-onboarded can access
// ════════════════════════════════════════════════════════════
console.log("\n=== 12. Public access (middleware check) ===");
const anon = await fetch(`${WEB}/insurance`, { redirect: "manual" });
ok("Anonymous /insurance → 200 (no redirect to login)", anon.status === 200);

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
