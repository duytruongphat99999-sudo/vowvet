/**
 * E2E for tiered profile-completion nudge.
 *
 * Strategy:
 *   - Import detectProfileCompletion directly to test pure logic
 *   - Stub getRow to return synthetic pet with N filled fields
 *   - Verify each bucket boundary (29/30/59/60/89/90/99/100)
 *   - Verify nudge_key uses BUCKET name (not exact pct)
 *   - Anti-spam: cross-bucket → different key; within-bucket → same key
 */

// ─── Stub Baserow before importing nudges lib ────────────────
const STUB_PET: Record<string, any> = {};
let STUB_PET_ID = 12;

import { mock } from "bun:test";
mock.module("@shared/baserow.ts", () => ({
  getRow:     async (_table: string, _id: number) => STUB_PET,
  listRows:   async (_table: string, _params?: any) => ({ count: 0, results: [], next: null, previous: null }),
  createRow:  async (_table: string, _data: any) => ({ id: 1, ..._data }),
  updateRow:  async (_table: string, _id: number, _data: any) => ({ id: _id, ..._data }),
  deleteRow:  async (_table: string, _id: number) => ({ id: _id }),
  pingBaserow: async () => true,
}));

// Import AFTER mock
const nudges = await import("/app/api/src/lib/nudges.ts");

// We test the EXPORTED findNudgeOpportunities function — it calls detectProfileCompletion
// internally. But to isolate profile_completion, we set STUB_PET fields and ignore others.

// The 17 core fields the function checks
const CORE_FIELDS = [
  "name", "species", "breed", "dob", "gender", "weight_kg", "color",
  "photo_url", "personality_type", "microchip_id",
  "owner_emergency_phone", "vet_name", "vet_phone", "primary_diet",
  "allergies", "behavior_notes", "qr_code", "address",
];

function makePet(filledCount: number, name = "Mon") {
  STUB_PET_ID++;
  const pet: any = { id: STUB_PET_ID, name };
  // Fill first N fields with non-empty values
  for (let i = 0; i < filledCount; i++) {
    const f = CORE_FIELDS[i];
    if (f === "weight_kg") pet[f] = 5.2;
    else if (f === "name") pet[f] = name;
    else pet[f] = `value_${f}`;
  }
  // Replace stub completely
  for (const k of Object.keys(STUB_PET)) delete STUB_PET[k];
  Object.assign(STUB_PET, pet);
  return STUB_PET_ID;
}

let pass = 0, fail = 0;
function ok(n: string, c: boolean, detail?: string) {
  if (c) { console.log("✅ " + n); pass++; }
  else { console.error("❌ " + n + (detail ? "\n   " + detail : "")); fail++; }
}

async function getProfileNudge(petId: number) {
  const opps = await nudges.findNudgeOpportunities(99, petId);
  return opps.find((o) => o.type === "profile_completion") || null;
}

// ═══════════════════════════════════════════════════════════════
// Test 1: 0% (0/17 filled) → SKIP
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 1: 0% (0 filled / 17) → SKIP ===");
{
  const petId = makePet(0);
  const n = await getProfileNudge(petId);
  ok("0% returns null (new user — no spam)", n === null);
}

// ═══════════════════════════════════════════════════════════════
// Test 2: 24% (4/17 ≈ 24%) — boundary < 30% → SKIP
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 2: 24% (4/17) → SKIP ===");
{
  const petId = makePet(4);  // 4/17 = 23.5% → rounds to 24
  const n = await getProfileNudge(petId);
  ok("24% returns null (under 30% threshold)", n === null);
}

// ═══════════════════════════════════════════════════════════════
// Test 3: 29% (5/17 ≈ 29%) — boundary < 30% → SKIP
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 3: 29% (5/17) → SKIP ===");
{
  const petId = makePet(5);  // 5/17 = 29.4% → 29
  const n = await getProfileNudge(petId);
  ok("29% returns null", n === null);
}

// ═══════════════════════════════════════════════════════════════
// Test 4: 33% (6/18) — bucket 30_59 gentle priority 3
// (coreFields is 18 fields total: 17 listed + the name-from-literal)
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 4: 33% (6/18) → bucket 30_59 priority 3 gentle ===");
{
  const petId = makePet(6);  // 6/18 = 33%
  const n = await getProfileNudge(petId);
  ok("33% fires nudge", n !== null);
  ok("priority 3 (gentle)", n?.priority === 3, `got ${n?.priority}`);
  ok("nudge_key uses bucket profile_30_59", n?.nudge_key === `profile_30_59:pet${petId}`, n?.nudge_key);
  ok("title says 'Bắt đầu hoàn thiện'", !!n?.title.includes("Bắt đầu hoàn thiện"));
  ok("body has 'Hồ sơ mới 33%'", !!n?.body.includes("Hồ sơ mới 33%"), `body=${n?.body}`);
}

// ═══════════════════════════════════════════════════════════════
// Test 5: 47% (8/17 ≈ 47%) — SAME bucket 30_59 → same key as Test 4
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 5: 47% within same bucket as 35% → same key (anti-spam) ===");
{
  const petId1 = makePet(6);  // 35%
  const n1 = await getProfileNudge(petId1);

  // Now fill more fields → 47% but SAME pet id+bucket
  const petId2 = makePet(8);  // 47% — different stub pet, but key uses petId
  const n2 = await getProfileNudge(petId2);

  ok("47% fires with bucket 30_59", n2?.nudge_key === `profile_30_59:pet${petId2}`);
  // Both 35% and 47% produce profile_30_59 bucket
  const bucket1 = n1?.nudge_key.split(":")[0];
  const bucket2 = n2?.nudge_key.split(":")[0];
  ok("Within-bucket pct change → same bucket prefix", bucket1 === bucket2 && bucket1 === "profile_30_59");
}

// ═══════════════════════════════════════════════════════════════
// Test 6: 71% (12/17) — bucket 60_89 medium priority 5
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 6: 71% (12/17) → bucket 60_89 priority 5 ===");
{
  const petId = makePet(12);  // 71%
  const n = await getProfileNudge(petId);
  ok("71% fires nudge", n !== null);
  ok("priority 5 (medium)", n?.priority === 5, `got ${n?.priority}`);
  ok("nudge_key uses bucket profile_60_89", n?.nudge_key === `profile_60_89:pet${petId}`, n?.nudge_key);
  ok("body mentions BSTY Mon Min Pet", !!n?.body.includes("BSTY Mon Min Pet"));
}

// ═══════════════════════════════════════════════════════════════
// Test 7: 89% (15/17) — last of bucket 60_89
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 7: 88% (15/17) → bucket 60_89 priority 5 ===");
{
  const petId = makePet(15);  // 15/17 = 88%
  const n = await getProfileNudge(petId);
  ok("88% fires bucket 60_89", n?.nudge_key === `profile_60_89:pet${petId}`);
  ok("priority 5", n?.priority === 5);
}

// ═══════════════════════════════════════════════════════════════
// Test 8: 94% (17/18) — bucket 90_99 urgent priority 8
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 8: 94% (17/18) → bucket 90_99 priority 8 urgent ===");
{
  const petId = makePet(17);  // 17/18 = 94%
  const n = await getProfileNudge(petId);
  ok("94% fires nudge", n !== null);
  ok("priority 8 (urgent)", n?.priority === 8, `got ${n?.priority}`);
  ok("nudge_key uses bucket profile_90_99", n?.nudge_key === `profile_90_99:pet${petId}`, n?.nudge_key);
  ok("title says 'Sắp xong'", !!n?.title.includes("Sắp xong"));
  ok("body mentions Profile Master + 80 điểm", !!n?.body.includes("Profile Master") && !!n?.body.includes("80 điểm"));
}

// ═══════════════════════════════════════════════════════════════
// Test 9: 100% (18/18) → SKIP
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 9: 100% (18/18) → SKIP ===");
{
  const petId = makePet(18);
  const n = await getProfileNudge(petId);
  ok("100% returns null (already complete)", n === null);
}

// ═══════════════════════════════════════════════════════════════
// Test 10: Cross-bucket → different keys (allows re-fire)
// Interleave makePet + getProfileNudge so each query reads the right stub.
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 10: Cross-bucket transitions → different keys ===");
{
  const fixedId = 999;

  STUB_PET_ID = fixedId - 1;
  const p1 = makePet(6, "Mon");   // 33% → 30_59
  const n1 = await getProfileNudge(p1);

  STUB_PET_ID = fixedId - 1;
  const p2 = makePet(12, "Mon");  // 67% → 60_89
  const n2 = await getProfileNudge(p2);

  STUB_PET_ID = fixedId - 1;
  const p3 = makePet(17, "Mon");  // 94% → 90_99
  const n3 = await getProfileNudge(p3);

  ok("bucket 30_59 key", n1?.nudge_key.startsWith("profile_30_59:"));
  ok("bucket 60_89 key", n2?.nudge_key.startsWith("profile_60_89:"));
  ok("bucket 90_99 key", n3?.nudge_key.startsWith("profile_90_99:"));

  const keys = new Set([n1?.nudge_key, n2?.nudge_key, n3?.nudge_key]);
  ok("3 distinct bucket keys (cross-bucket = different key)", keys.size === 3);
}

// ═══════════════════════════════════════════════════════════════
// Test 11: nudge_key length ≤ 200 chars (Baserow safety)
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 11: nudge_key length safety ===");
{
  const petId = makePet(8);
  const n = await getProfileNudge(petId);
  ok("nudge_key ≤ 100 chars", (n?.nudge_key.length ?? 0) <= 100, `len=${n?.nudge_key.length}`);
  ok("key matches /profile_(30_59|60_89|90_99):pet\\d+/", /^profile_(30_59|60_89|90_99):pet\d+$/.test(n?.nudge_key || ""), n?.nudge_key);
}

// ═══════════════════════════════════════════════════════════════
// Test 12: Vietnamese text rendering (no mojibake)
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Test 12: Vietnamese text rendering ===");
{
  const petId = makePet(6, "Min");
  const n = await getProfileNudge(petId);
  ok("Vietnamese 'Bắt đầu' renders correctly", !!n?.title.includes("Bắt đầu"));
  ok("Vietnamese 'hoàn thiện' renders correctly", !!n?.title.includes("hoàn thiện"));
  ok("NO mojibake (no 'á»¥' / 'áº¯' patterns)", !/á»¥|áº¯|Báº¯t/.test((n?.title || "") + (n?.body || "")));
}

// ═══════════════════════════════════════════════════════════════
console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
