/**
 * Cleanup test data (M8).
 *
 * READ-ONLY by default — list duplicate pets + placeholder pets.
 * Use `--apply` flag để thực sự xóa (vẫn yêu cầu user gõ 'XOA' để confirm từng pet).
 *
 * Run (PowerShell):
 *   $env:BASEROW_USER_EMAIL = "..."
 *   $env:BASEROW_USER_PASSWORD = "..."
 *   bun run scripts/cleanup-test-data.ts          # dry-run, chỉ list
 *   bun run scripts/cleanup-test-data.ts --apply  # interactive delete
 */
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
const TOKEN = Bun.env.BASEROW_TOKEN;
const APPLY = process.argv.includes("--apply");

if (!EMAIL || !PASSWORD || !TOKEN) {
  console.error(
    "❌ Cần BASEROW_USER_EMAIL, BASEROW_USER_PASSWORD, BASEROW_TOKEN.\n" +
      "Email/password để authorize delete operations, Token để query rows."
  );
  process.exit(1);
}

console.log(`[cleanup] Mode: ${APPLY ? "🔥 APPLY (sẽ delete)" : "📖 DRY-RUN (chỉ list)"}`);
console.log(`[cleanup] Logging in to ${BASEROW_URL}...`);
const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error("❌ Login failed:", await loginRes.text());
  process.exit(1);
}
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };
console.log("[cleanup] Logged in.\n");

async function tokenApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Token API ${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const PETS_TABLE = existingConfig.tables.pets.id;

// ============================================================
// SCAN
// ============================================================
const petsRes = await tokenApi<{ count: number; results: any[] }>(
  `/database/rows/table/${PETS_TABLE}/?user_field_names=true&size=200`
);
console.log(`📊 Loaded ${petsRes.count} pet rows.\n`);

const placeholders: Array<{ id: number; name: string; reason: string }> = [];
const grouped = new Map<string, Array<{ id: number; name: string; userId: number; createdAt: string }>>();

for (const row of petsRes.results) {
  const r = row as any;
  if (!r.name) continue;

  const lower = r.name.toLowerCase().trim();
  if (
    lower.includes("test") ||
    lower.includes("m7test") ||
    lower.includes("placeholder") ||
    lower === "empty" ||
    lower === "stub"
  ) {
    placeholders.push({ id: row.id, name: r.name, reason: "Test/placeholder name" });
    continue;
  }

  const userLinks = Array.isArray(r.user_id) ? r.user_id : [];
  const userId = userLinks[0]?.id || 0;
  const key = `${userId}:${lower}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key)!.push({ id: row.id, name: r.name, userId, createdAt: r.created_at || "" });
}

const duplicateSets: Array<{ name: string; userId: number; pets: typeof placeholders }> = [];
for (const [, pets] of grouped.entries()) {
  if (pets.length > 1) {
    // Sort by createdAt ASC — keep first, mark rest as duplicate
    pets.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    duplicateSets.push({
      name: pets[0].name,
      userId: pets[0].userId,
      pets: pets as any,
    });
  }
}

// ============================================================
// REPORT
// ============================================================
console.log("=".repeat(60));
console.log("📋 PLACEHOLDER PETS");
console.log("=".repeat(60));
if (placeholders.length === 0) {
  console.log("  (none)\n");
} else {
  for (const p of placeholders) {
    console.log(`  • id=${p.id}  name="${p.name}"  reason=${p.reason}`);
  }
  console.log("");
}

console.log("=".repeat(60));
console.log("📋 DUPLICATE PETS (same name + same owner)");
console.log("=".repeat(60));
if (duplicateSets.length === 0) {
  console.log("  (none)\n");
} else {
  for (const d of duplicateSets) {
    console.log(`  • user ${d.userId} "${d.name}":`);
    for (let i = 0; i < d.pets.length; i++) {
      const isKeeper = i === 0;
      console.log(
        `      id=${d.pets[i].id}  created=${d.pets[i].createdAt?.slice(0, 16) || "?"}  ${isKeeper ? "← KEEP (oldest)" : "← duplicate"}`
      );
    }
  }
  console.log("");
}

const totalCandidates = placeholders.length + duplicateSets.reduce((sum, d) => sum + (d.pets.length - 1), 0);
console.log(`📌 Total candidates: ${totalCandidates} pet(s) to delete.\n`);

if (!APPLY) {
  console.log("ℹ️  Dry-run mode. Add --apply flag để delete với confirm:");
  console.log("    bun run scripts/cleanup-test-data.ts --apply\n");
  process.exit(0);
}

if (totalCandidates === 0) {
  console.log("✅ Không có gì cần dọn.\n");
  process.exit(0);
}

// ============================================================
// INTERACTIVE DELETE
// ============================================================
console.log("=".repeat(60));
console.log("🔥 INTERACTIVE DELETE — gõ 'XOA' để confirm từng pet, [enter] để skip");
console.log("=".repeat(60));

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  for await (const line of console) {
    return line.trim();
  }
  return "";
}

async function deletePet(petId: number): Promise<void> {
  await tokenApi(`/database/rows/table/${PETS_TABLE}/${petId}/`, { method: "DELETE" });
}

let deleted = 0;
let skipped = 0;

for (const p of placeholders) {
  const answer = await prompt(`Delete placeholder id=${p.id} "${p.name}"? Type XOA: `);
  if (answer === "XOA") {
    try {
      await deletePet(p.id);
      console.log(`  ✓ deleted id=${p.id}`);
      deleted++;
    } catch (err: any) {
      console.error(`  ✗ failed: ${err.message}`);
      skipped++;
    }
  } else {
    console.log(`  ⊙ skipped id=${p.id}`);
    skipped++;
  }
}

for (const d of duplicateSets) {
  // Skip first (keep), delete rest
  for (let i = 1; i < d.pets.length; i++) {
    const pet = d.pets[i];
    const answer = await prompt(`Delete duplicate id=${pet.id} "${pet.name}" (user ${d.userId})? Type XOA: `);
    if (answer === "XOA") {
      try {
        await deletePet(pet.id);
        console.log(`  ✓ deleted id=${pet.id}`);
        deleted++;
      } catch (err: any) {
        console.error(`  ✗ failed: ${err.message}`);
        skipped++;
      }
    } else {
      console.log(`  ⊙ skipped id=${pet.id}`);
      skipped++;
    }
  }
}

console.log(`\n📊 Summary: deleted=${deleted}, skipped=${skipped}`);
console.log("✅ Cleanup hoàn tất.");
