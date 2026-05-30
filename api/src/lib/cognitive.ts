/**
 * Cognitive CCDS service (M24).
 */
import { listRows, createRow, getRow } from "@shared/baserow.ts";
import {
  CCDS_QUESTIONS,
  calculateCcds,
  type CcdsCategory,
} from "@shared/cognitive-ccds.ts";

export interface CognitiveRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  assessed_at: string;
  total_score: number;
  category: string | { id: number; value: string };
  disorientation_score: number;
  interaction_score: number;
  sleep_wake_score: number;
  house_soiling_score: number;
  activity_score: number;
  anxiety_score: number;
  raw_answers: string | null;
  notes: string | null;
  needs_vet: boolean;
  created_at: string;
}

export interface CognitiveApi {
  id: number;
  pet_id: number;
  assessed_at: string;
  total_score: number;
  category: CcdsCategory;
  domain_scores: Record<string, number>;
  needs_vet: boolean;
  notes: string;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toApi(row: CognitiveRow): CognitiveApi {
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    assessed_at: row.assessed_at || "",
    total_score: Number(row.total_score) || 0,
    category: (flatVal<CcdsCategory>(row.category) || "normal") as CcdsCategory,
    domain_scores: {
      disorientation: Number(row.disorientation_score) || 0,
      interaction: Number(row.interaction_score) || 0,
      sleep_wake: Number(row.sleep_wake_score) || 0,
      house_soiling: Number(row.house_soiling_score) || 0,
      activity: Number(row.activity_score) || 0,
      anxiety: Number(row.anxiety_score) || 0,
    },
    needs_vet: row.needs_vet === true,
    notes: row.notes || "",
    created_at: row.created_at || "",
  };
}

export async function createAssessment(
  petId: number,
  answers: Record<string, number>,
  notes?: string
): Promise<CognitiveApi> {
  const result = calculateCcds(answers);
  const row = await createRow<CognitiveRow>("cognitive_assessments", {
    pet_id: [petId],
    assessed_at: new Date().toISOString(),
    total_score: result.total,
    category: result.category,
    disorientation_score: result.domain_scores.disorientation,
    interaction_score: result.domain_scores.interaction,
    sleep_wake_score: result.domain_scores.sleep_wake,
    house_soiling_score: result.domain_scores.house_soiling,
    activity_score: result.domain_scores.activity,
    anxiety_score: result.domain_scores.anxiety,
    raw_answers: JSON.stringify(answers),
    notes: notes || null,
    needs_vet: result.needs_vet,
    created_at: new Date().toISOString(),
  });
  return toApi(row);
}

export async function listAssessments(petId: number): Promise<CognitiveApi[]> {
  const res = await listRows<CognitiveRow>("cognitive_assessments", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 50,
    orderBy: "-assessed_at",
  });
  return res.results.filter((r) => r.total_score !== undefined && r.total_score !== null).map(toApi);
}

export async function getLatest(petId: number): Promise<CognitiveApi | null> {
  const all = await listAssessments(petId);
  return all[0] || null;
}
