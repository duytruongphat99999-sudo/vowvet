/**
 * Decision-tree Triage service (M31).
 *
 * Lightweight alternative to M9.1 AI triage:
 *   - No Gemini call
 *   - Tree traversal in shared/triage-tree.ts
 *   - Persists session to triage_tree_sessions for owner history
 */
import { listRows, createRow } from "@shared/baserow.ts";
import { TRIAGE_TREE, getNode, isValidTier, type TriageTier, type TriageNode } from "@shared/triage-tree.ts";

export interface TriageAnswer {
  nodeId: string;
  question: string;
  answer: string;
}

export interface TriageTreeRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  user_id: number;
  primary_symptom: string;
  answers: string | null;
  final_tier: string | { id: number; value: string };
  final_recommendation: string;
  decision_path: string | null;
  vet_buddy_notified: boolean;
  created_at: string;
}

export interface TriageTreeApi {
  id: number;
  pet_id: number;
  user_id: number;
  primary_symptom: string;
  answers: TriageAnswer[];
  final_tier: TriageTier;
  final_recommendation: string;
  decision_path: string[];
  vet_buddy_notified: boolean;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toApi(row: TriageTreeRow): TriageTreeApi {
  let answers: TriageAnswer[] = [];
  let path: string[] = [];
  try { answers = JSON.parse(row.answers || "[]"); } catch {}
  try { path = JSON.parse(row.decision_path || "[]"); } catch {}
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    user_id: Number(row.user_id) || 0,
    primary_symptom: row.primary_symptom || "",
    answers,
    final_tier: (flatVal<TriageTier>(row.final_tier) || "non_urgent") as TriageTier,
    final_recommendation: row.final_recommendation || "",
    decision_path: path,
    vet_buddy_notified: row.vet_buddy_notified === true,
    created_at: row.created_at || "",
  };
}

// ============================================================
// Tree access
// ============================================================
export function getTreeNode(id: string): TriageNode | null {
  return getNode(id);
}

export function getRootNode(): TriageNode {
  return TRIAGE_TREE.root;
}

export function getFullTree(): Record<string, TriageNode> {
  return TRIAGE_TREE;
}

// ============================================================
// Session persistence
// ============================================================
export interface SaveSessionInput {
  petId: number;
  userId: number;
  primarySymptom: string;
  answers: TriageAnswer[];
  finalTier: TriageTier;
  finalRecommendation: string;
}

export async function saveTriageSession(input: SaveSessionInput): Promise<TriageTreeApi> {
  if (!isValidTier(input.finalTier)) {
    throw new Error(`Invalid tier: ${input.finalTier}`);
  }
  const path = input.answers.map((a) => a.nodeId);
  const row = await createRow<TriageTreeRow>("triage_tree_sessions", {
    pet_id: [input.petId],
    user_id: input.userId,
    primary_symptom: input.primarySymptom.slice(0, 200),
    answers: JSON.stringify(input.answers).slice(0, 10000),
    final_tier: input.finalTier,
    final_recommendation: input.finalRecommendation.slice(0, 2000),
    decision_path: JSON.stringify(path),
    vet_buddy_notified: false,
    created_at: new Date().toISOString(),
  });
  return toApi(row);
}

export async function listTriageHistory(petId: number, limit = 20): Promise<TriageTreeApi[]> {
  const res = await listRows<TriageTreeRow>("triage_tree_sessions", {
    filter: { pet_id__link_row_has: String(petId) },
    size: Math.min(limit, 200),
    orderBy: "-created_at",
  });
  return res.results.filter((r) => r.primary_symptom).map(toApi);
}
