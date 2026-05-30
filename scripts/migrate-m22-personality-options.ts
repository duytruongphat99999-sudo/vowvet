/**
 * M22 — Fix personality_type Baserow options vs code mismatch.
 *
 * Code (shared/personality-types.ts) định nghĩa 12 types:
 *   explorer, cuddler, foodie, guardian, comedian, athlete,
 *   diplomat, loner, talker, sleeper, trickster, sensitive
 *
 * Baserow pets.personality_type chỉ có 8 options (mismatch từ M13 setup cũ):
 *   explorer, cuddler, foodie, guardian, athlete, thinker, social, independent
 *
 * Fix: ADD missing options vào Baserow để PATCH không fail. KHÔNG remove options
 * cũ (thinker/social/independent) để không phá rows hiện hữu — nhưng code không sinh
 * những giá trị đó nữa nên chúng sẽ rơi vào limbo (acceptable).
 *
 * Idempotent — re-run an toàn.
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD");
  process.exit(1);
}

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: {
      Authorization: `JWT ${JWT}`,
      "Content-Type": "application/json",
      Host: "localhost:8888",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const PETS_TABLE = existingConfig.tables.pets.id;
const PERSONALITY_FIELD_ID = existingConfig.tables.pets.fields.personality_type;

// Get current field state
const current = await api<any>(`/database/fields/${PERSONALITY_FIELD_ID}/`);
console.log("Current options:", current.select_options.map((o: any) => o.value).join(", "));

const codeTypes = [
  "explorer", "cuddler", "foodie", "guardian",
  "comedian", "athlete", "diplomat", "loner",
  "talker", "sleeper", "trickster", "sensitive",
];

const existingValues = new Set(current.select_options.map((o: any) => o.value));
const missing = codeTypes.filter((t) => !existingValues.has(t));
console.log("Missing options to add:", missing.length > 0 ? missing.join(", ") : "(none)");

if (missing.length === 0) {
  console.log("✅ All 12 types already present, nothing to do.");
  process.exit(0);
}

// Baserow PATCH field — replaces ALL select_options. So merge: keep existing + add missing.
const colors = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "gray", "brown", "dark-red", "dark-blue", "dark-green"];
const newOptions = [
  ...current.select_options, // preserve existing IDs (rows pointing to them stay valid)
  ...missing.map((value, i) => ({ value, color: colors[i % colors.length] })),
];

console.log("\n🔄 Patching field to merge", newOptions.length, "options...");
const updated = await api<any>(`/database/fields/${PERSONALITY_FIELD_ID}/`, {
  method: "PATCH",
  body: JSON.stringify({ select_options: newOptions }),
});

console.log("\n📊 New options:");
for (const o of updated.select_options) {
  console.log(`  ${o.value} (id=${o.id}, color=${o.color})`);
}

// Refresh baserow-config.json (field IDs may stay same but be safe)
const fresh = await api<any>(`/database/fields/${PERSONALITY_FIELD_ID}/`);
console.log(`\n✅ M22 done. personality_type now has ${fresh.select_options.length} options.`);
console.log("Restart vowvet-api để code thấy schema mới:\n  docker compose up -d --force-recreate vowvet-api");
