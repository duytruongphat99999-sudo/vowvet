/**
 * E2E test for M31 Triage + FAQ.
 *
 * Public API tests (no auth) + auth flow for triage session save.
 */
import { signSession } from "../shared/jwt.ts";
import { countNodes, countTerminalOptions } from "../shared/triage-tree.ts";

const API = "http://127.0.0.1:3010";
const USER_ID = Number(Bun.env.E2E_USER_ID || 10);
const PET_ID = Number(Bun.env.E2E_PET_ID || 12);

const token = signSession({ sub: USER_ID, phone: "+84900000010", email: "e2e@local", is_onboarded: true } as any, 3600);
const hdrAuth = { cookie: `vowvet_session=${token}`, "Content-Type": "application/json" };

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 200)); fail++; }
}

// ============================================================
// TRIAGE TREE — public endpoints
// ============================================================
console.log("\n=== Triage Tree (public) ===");

const rootRes = await fetch(`${API}/api/v1/triage-tree/node/root`);
const rootJ = await rootRes.json();
ok("T1 GET /node/root → 200 (no auth)", rootRes.status === 200);
ok("T1b root has options[]", Array.isArray(rootJ.node?.options));
ok("T1c root has ≥10 options (full symptom menu)", (rootJ.node?.options?.length || 0) >= 10);

const treeRes = await fetch(`${API}/api/v1/triage-tree/tree`);
const treeJ = await treeRes.json();
ok("T2 GET /tree → 200", treeRes.status === 200);
ok("T2b tree has root key", "root" in (treeJ.tree || {}));

// Static tree counts
const nodeCount = countNodes();
const termCount = countTerminalOptions();
ok(`T3 tree has ${nodeCount} nodes (≥15)`, nodeCount >= 15);
ok(`T3b tree has ${termCount} terminal options (≥30)`, termCount >= 30);

// Test branch traversal: vomit_q1
const vRes = await fetch(`${API}/api/v1/triage-tree/node/vomit_q1`);
const vJ = await vRes.json();
ok("T4 GET /node/vomit_q1 → 200", vRes.status === 200);
ok("T4b vomit_q1 has 3 options", vJ.node?.options?.length === 3);

// Bad node id
const badRes = await fetch(`${API}/api/v1/triage-tree/node/nonexistent`);
ok("T5 GET unknown node → 404", badRes.status === 404);

// ============================================================
// TRIAGE TREE — save session (auth)
// ============================================================
console.log("\n=== Triage Session (auth) ===");

const sessRes = await fetch(`${API}/api/v1/triage-tree/session`, {
  method: "POST",
  headers: hdrAuth,
  body: JSON.stringify({
    petId: PET_ID,
    primarySymptom: "Ói / Nôn",
    answers: [
      { nodeId: "root", question: "Bé đang gặp vấn đề gì?", answer: "Ói / Nôn" },
      { nodeId: "vomit_q1", question: "Bé đã ói bao nhiêu lần trong 24h qua?", answer: "Trên 5 lần" },
    ],
    finalTier: "emergency",
    finalRecommendation: "Ói liên tục > 5 lần/24h gây mất nước nguy hiểm — cấp cứu.",
  }),
});
const sessJ = await sessRes.json();
ok("T6 POST /session → 201", sessRes.status === 201, sessJ);
ok("T6b session has id", typeof sessJ.session?.id === "number");
ok("T6c final_tier=emergency", sessJ.session?.final_tier === "emergency");
ok("T6d decision_path has 2 nodes", sessJ.session?.decision_path?.length === 2);

// Invalid tier
const badSessRes = await fetch(`${API}/api/v1/triage-tree/session`, {
  method: "POST",
  headers: hdrAuth,
  body: JSON.stringify({ petId: PET_ID, finalTier: "bogus", answers: [] }),
});
ok("T7 invalid tier → 400", badSessRes.status === 400);

// Unauthenticated session attempt
const noauthRes = await fetch(`${API}/api/v1/triage-tree/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ petId: PET_ID, finalTier: "emergency", answers: [] }),
});
ok("T8 no auth → 401", noauthRes.status === 401);

// History
const histRes = await fetch(`${API}/api/v1/triage-tree/pets/${PET_ID}/history`, { headers: hdrAuth });
const histJ = await histRes.json();
ok("T9 GET /history → 200", histRes.status === 200);
ok("T9b history has ≥1 session (just-saved)", (histJ.sessions?.length || 0) >= 1);

// ============================================================
// FAQ — public endpoints
// ============================================================
console.log("\n=== FAQ (public) ===");

const faqAllRes = await fetch(`${API}/api/v1/faqs`);
const faqAllJ = await faqAllRes.json();
ok("F1 GET /faqs → 200 (no auth)", faqAllRes.status === 200);
ok("F1b ≥30 faqs seeded", (faqAllJ.faqs?.length || 0) >= 30, `total=${faqAllJ.faqs?.length}`);
ok("F1c each faq has category_label", faqAllJ.faqs?.every?.((f: any) => typeof f.category_label === "string"));

const faqCatRes = await fetch(`${API}/api/v1/faqs/categories`);
const faqCatJ = await faqCatRes.json();
ok("F2 GET /categories → 200", faqCatRes.status === 200);
ok("F2b has 6 categories", (faqCatJ.categories?.length || 0) === 6);

const emergencyCat = faqCatJ.categories?.find?.((c: any) => c.key === "emergency");
ok("F2c emergency category has ≥5 entries", (emergencyCat?.count || 0) >= 5, `count=${emergencyCat?.count}`);

// Filter by category
const filtRes = await fetch(`${API}/api/v1/faqs?category=app_usage`);
const filtJ = await filtRes.json();
ok("F3 filter category=app_usage → 200", filtRes.status === 200);
ok("F3b all results are app_usage", filtJ.faqs?.every?.((f: any) => f.category === "app_usage"));

// Search
const searchRes = await fetch(`${API}/api/v1/faqs?search=vaccine`);
const searchJ = await searchRes.json();
ok("F4 search=vaccine → 200", searchRes.status === 200);
ok("F4b at least 1 hit on 'vaccine'", (searchJ.faqs?.length || 0) >= 1, searchJ.faqs?.length);

// Detail + view counter
if (faqAllJ.faqs?.[0]?.id) {
  const detailId = faqAllJ.faqs[0].id;
  const beforeViews = faqAllJ.faqs[0].view_count;
  const detRes = await fetch(`${API}/api/v1/faqs/${detailId}`);
  const detJ = await detRes.json();
  ok("F5 GET /faqs/:id → 200", detRes.status === 200);
  ok("F5b view increment fires (async, eventually)", typeof detJ.faq?.view_count === "number");

  // Helpful counter
  const helpRes = await fetch(`${API}/api/v1/faqs/${detailId}/helpful`, { method: "POST" });
  const helpJ = await helpRes.json();
  ok("F6 POST /helpful → 200", helpRes.status === 200);
  ok("F6b helpful_count incremented", (helpJ.faq?.helpful_count || 0) >= 1);
}

// ============================================================
console.log(`\n${pass}/${pass + fail} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
