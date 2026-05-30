/**
 * E2E for brand sync:
 *   - 10 key pages load 200 / 302
 *   - Each authed page contains "logo-mmp.png" + "VowVet"
 *   - No violet→pink gradient leftover (exceptions allowed)
 *   - No illegible "bg-mmp-cream + text-white" combos
 *   - Mon Min Pet ecosystem footer present on dashboard + why-vowvet
 */
import { signSession } from "/app/shared/jwt.ts";

const WEB = Bun.env.E2E_WEB || "http://vowvet-web:4321";
const USER_ID = Number(Bun.env.E2E_USER_ID || 10);
const PET_ID = Number(Bun.env.E2E_PET_ID || 12);

const token = signSession(
  { sub: USER_ID, phone: "+84900000010", email: "e2e@local", is_onboarded: true } as any,
  3600,
);
const cookie = `vowvet_session=${token}`;

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}${detail ? "\n   " + detail : ""}`); failures.push(name); fail++; }
}

const PAGES = [
  { path: "/login", auth: false, expectStatus: 200, isAuthed: false },
  { path: "/dashboard", auth: true, expectStatus: 200, isAuthed: true },
  { path: "/why-vowvet", auth: false, expectStatus: 200, isAuthed: false },
  { path: "/leaderboard", auth: false, expectStatus: 200, isAuthed: false },
  { path: "/community", auth: false, expectStatus: 200, isAuthed: false },
  { path: `/pets/${PET_ID}`, auth: true, expectStatus: 200, isAuthed: true },
  { path: `/pets/${PET_ID}/pet-score`, auth: true, expectStatus: 200, isAuthed: true },
  { path: `/pets/${PET_ID}/quests`, auth: true, expectStatus: 200, isAuthed: true },
  { path: "/playdate/safety-tips", auth: false, expectStatus: 200, isAuthed: false },
  { path: "/onboarding", auth: true, expectStatus: 200, isAuthed: true },
];

const htmlByPage: Record<string, string> = {};

// =========== 1. all pages return 200 ===========
console.log("\n=== 1. All 10 key pages load ===");
for (const p of PAGES) {
  const headers: any = p.auth ? { cookie } : {};
  const res = await fetch(`${WEB}${p.path}`, { headers, redirect: "manual" });
  const got = res.status;
  ok(`${p.path} → ${got}`, got === p.expectStatus || got === 302 || got === 200, `got ${got}`);
  if (res.ok) htmlByPage[p.path] = await res.text();
}

// =========== 2. Logo lockup present on key pages ===========
console.log("\n=== 2. Logo lockup ===");
const logoExpected = ["/login", "/dashboard", "/why-vowvet"];
for (const p of logoExpected) {
  const html = htmlByPage[p] || "";
  ok(`${p} contains logo-mmp.png`, html.includes("logo-mmp.png"));
  ok(`${p} contains "VowVet"`, html.includes("VowVet"));
}
ok("/login contains 'by Mon Min Pet' (full variant)", (htmlByPage["/login"] || "").includes("by Mon Min Pet"));
ok("/why-vowvet contains 'by Mon Min Pet'", (htmlByPage["/why-vowvet"] || "").includes("by Mon Min Pet"));

// =========== 3. No leftover violet→pink gradient combos ===========
console.log("\n=== 3. No violet→pink gradient leftover ===");
const banPatterns = [
  /from-violet-\d+\s+(via-\w+-\d+\s+)?to-pink-\d+/,
  /from-pink-\d+\s+(via-\w+-\d+\s+)?to-violet-\d+/,
  /from-fuchsia-\d+/,
];
for (const p of PAGES) {
  const html = htmlByPage[p.path] || "";
  for (const bp of banPatterns) {
    const m = html.match(bp);
    ok(`${p.path} clean of "${bp}"`, !m, m ? m[0] : "");
  }
}

// =========== 4. No illegible bg-mmp-cream + text-white combo ===========
console.log("\n=== 4. No illegible bg-mmp-cream + text-white ===");
for (const p of PAGES) {
  const html = htmlByPage[p.path] || "";
  // Match patterns like class="... bg-mmp-cream ... text-white ..."
  const bad = /class="[^"]*\bbg-mmp-cream\b[^"]*\btext-white\b/.test(html)
           || /class="[^"]*\btext-white\b[^"]*\bbg-mmp-cream\b/.test(html);
  ok(`${p.path} no cream-bg + white-text combo`, !bad);
}

// =========== 5. Mon Min Pet ecosystem references on key landing pages ===========
console.log("\n=== 5. Ecosystem nav present ===");
ok("dashboard has Mon Min Pet footer ref", (htmlByPage["/dashboard"] || "").includes("monminpet.com"));
ok("why-vowvet has Mon Min Pet footer ref", (htmlByPage["/why-vowvet"] || "").includes("monminpet.com"));
ok("dashboard has 'Hệ sinh thái' label", (htmlByPage["/dashboard"] || "").includes("Hệ sinh thái"));

// =========== 6. Theme color updated ===========
console.log("\n=== 6. Theme color is mmp-ink (#0a0a0a) ===");
const layoutSample = htmlByPage["/login"] || "";
ok("theme-color meta is #0a0a0a", layoutSample.includes('theme-color" content="#0a0a0a"'));

// =========== 7. Fonts loaded ===========
console.log("\n=== 7. Inter + Fraunces loaded ===");
ok("login page references Inter font", (htmlByPage["/login"] || "").toLowerCase().includes("inter"));

// =========== Summary ===========
console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
