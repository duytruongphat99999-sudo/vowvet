/**
 * M31 — Decision-tree Triage + Baserow CMS FAQs.
 * 2 tables: triage_tree_sessions, faqs.
 * Idempotent: skip table/field if exists.
 *
 * Separate from M9.1 triage_sessions (AI-driven) — this is a lightweight
 * decision-tree fallback that doesn't burn Gemini budget.
 */
import { writeFileSync } from "node:fs";
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const EMAIL = Bun.env.BASEROW_USER_EMAIL;
const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD"); process.exit(1); }

const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Host: "localhost:8888" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const { access_token: JWT } = (await loginRes.json()) as { access_token: string };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}`, {
    ...init,
    headers: { Authorization: `JWT ${JWT}`, "Content-Type": "application/json", Host: "localhost:8888", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface FieldDef { id: number; name: string; type: string; }
interface TableDef { id: number; name: string; }

const PETS_TABLE = existingConfig.tables.pets.id;
const DATABASE_ID = existingConfig.database_id;
const opt = (value: string, color = "blue") => ({ value, color });

// ============================================================
// triage_tree_sessions
// ============================================================
const TRIAGE_TREE_FIELDS = [
  { name: "pet_id", type: "link_row", link_row_table_id: PETS_TABLE },
  { name: "user_id", type: "number", number_decimal_places: 0 },
  { name: "primary_symptom", type: "text" },
  { name: "answers", type: "long_text" }, // JSON array
  {
    name: "final_tier",
    type: "single_select",
    select_options: [
      opt("emergency", "red"),
      opt("urgent", "orange"),
      opt("non_urgent", "yellow"),
      opt("wellness", "green"),
    ],
  },
  { name: "final_recommendation", type: "long_text" },
  { name: "decision_path", type: "long_text" }, // JSON path through tree
  { name: "vet_buddy_notified", type: "boolean" },
  { name: "created_at", type: "text" },
];

// ============================================================
// faqs (Baserow CMS — admin editable)
// ============================================================
const FAQS_FIELDS = [
  {
    name: "category",
    type: "single_select",
    select_options: [
      opt("health", "red"),
      opt("nutrition", "green"),
      opt("training", "blue"),
      opt("emergency", "orange"),
      opt("app_usage", "purple"),
      opt("other", "gray"),
    ],
  },
  { name: "question", type: "text" },
  { name: "answer", type: "long_text" },
  { name: "order_num", type: "number", number_decimal_places: 0 },
  { name: "is_published", type: "boolean" },
  { name: "view_count", type: "number", number_decimal_places: 0 },
  { name: "helpful_count", type: "number", number_decimal_places: 0 },
  { name: "created_at", type: "text" },
  { name: "updated_at", type: "text" },
];

async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
  const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
  let t = tables.find((x) => x.name === name);
  if (!t) {
    console.log(`🔄 Creating ${name}...`);
    t = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
      method: "POST", body: JSON.stringify({ name }),
    });
  }
  const existing = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  const have = new Set(existing.map((f) => f.name));
  let added = 0;
  for (const f of fields) {
    if (have.has(f.name)) continue;
    try {
      await api<FieldDef>(`/database/fields/table/${t.id}/`, { method: "POST", body: JSON.stringify(f) });
      added++;
    } catch (err) {
      console.warn(`  ⚠ field ${f.name} skipped:`, String(err).slice(0, 120));
    }
  }
  console.log(`  ${name}: +${added} fields (id=${t.id})`);
  return t;
}

const triageTreeTable = await ensureTable("triage_tree_sessions", TRIAGE_TREE_FIELDS);
const faqsTable = await ensureTable("faqs", FAQS_FIELDS);

const config: any = JSON.parse(JSON.stringify(existingConfig));
for (const [name, t] of [["triage_tree_sessions", triageTreeTable], ["faqs", faqsTable]] as const) {
  const fresh = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  if (!config.tables[name]) config.tables[name] = { id: t.id, fields: {} };
  config.tables[name].id = t.id;
  for (const f of fresh) {
    if (f.name && !["Notes", "Active"].includes(f.name)) {
      config.tables[name].fields[f.name] = f.id;
    }
  }
}
writeFileSync("./baserow-config.json", JSON.stringify(config, null, 2));
console.log("\n✅ M31 done.");
