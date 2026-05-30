/**
 * Pain (Glasgow CMPS-SF) + Mobility service (M23).
 */
import { listRows, createRow } from "@shared/baserow.ts";
import {
  calculatePain,
  calculateMobility,
  type PainLevel,
  type MobilityLevel,
} from "@shared/pain-glasgow.ts";

// ================================================================
// Pain
// ================================================================
export interface PainRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  assessed_at: string;
  total_score: number;
  pain_level: string | { id: number; value: string };
  raw_answers: string | null;
  notes: string | null;
  needs_vet: boolean;
  created_at: string;
}

export interface PainApi {
  id: number;
  pet_id: number;
  assessed_at: string;
  total_score: number;
  pain_level: PainLevel;
  needs_vet: boolean;
  notes: string;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toPainApi(row: PainRow): PainApi {
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    assessed_at: row.assessed_at || "",
    total_score: Number(row.total_score) || 0,
    pain_level: (flatVal<PainLevel>(row.pain_level) || "none") as PainLevel,
    needs_vet: row.needs_vet === true,
    notes: row.notes || "",
    created_at: row.created_at || "",
  };
}

export async function createPain(petId: number, answers: Record<string, number>, notes?: string): Promise<PainApi> {
  const result = calculatePain(answers);
  const row = await createRow<PainRow>("pain_assessments", {
    pet_id: [petId],
    assessed_at: new Date().toISOString(),
    total_score: result.total,
    pain_level: result.level,
    raw_answers: JSON.stringify(answers),
    notes: notes || null,
    needs_vet: result.needs_vet,
    created_at: new Date().toISOString(),
  });
  return toPainApi(row);
}

export async function listPain(petId: number): Promise<PainApi[]> {
  const res = await listRows<PainRow>("pain_assessments", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 50,
    orderBy: "-assessed_at",
  });
  return res.results.filter((r) => r.total_score !== undefined && r.total_score !== null).map(toPainApi);
}

export async function getLatestPain(petId: number): Promise<PainApi | null> {
  return (await listPain(petId))[0] || null;
}

// ================================================================
// Mobility
// ================================================================
export interface MobilityRow {
  id: number;
  pet_id: Array<{ id: number; value: string }>;
  assessed_at: string;
  raw_score: number;
  pct_score: number;
  mobility_level: string | { id: number; value: string };
  raw_answers: string | null;
  video_key: string | null;
  video_url: string | null;
  notes: string | null;
  needs_vet: boolean;
  created_at: string;
}

export interface MobilityApi {
  id: number;
  pet_id: number;
  assessed_at: string;
  raw_score: number;
  pct_score: number;
  level: MobilityLevel;
  video_url: string | null;
  needs_vet: boolean;
  notes: string;
  created_at: string;
}

export function toMobilityApi(row: MobilityRow): MobilityApi {
  return {
    id: row.id,
    pet_id: (row.pet_id || [])[0]?.id ?? 0,
    assessed_at: row.assessed_at || "",
    raw_score: Number(row.raw_score) || 0,
    pct_score: Number(row.pct_score) || 0,
    level: (flatVal<MobilityLevel>(row.mobility_level) || "excellent") as MobilityLevel,
    video_url: row.video_url || null,
    needs_vet: row.needs_vet === true,
    notes: row.notes || "",
    created_at: row.created_at || "",
  };
}

export async function createMobility(petId: number, answers: Record<string, number>, notes?: string): Promise<MobilityApi> {
  const result = calculateMobility(answers);
  const row = await createRow<MobilityRow>("mobility_assessments", {
    pet_id: [petId],
    assessed_at: new Date().toISOString(),
    raw_score: result.raw_score,
    pct_score: result.pct_score,
    mobility_level: result.level,
    raw_answers: JSON.stringify(answers),
    notes: notes || null,
    needs_vet: result.needs_vet,
    created_at: new Date().toISOString(),
  });
  return toMobilityApi(row);
}

export async function listMobility(petId: number): Promise<MobilityApi[]> {
  const res = await listRows<MobilityRow>("mobility_assessments", {
    filter: { pet_id__link_row_has: String(petId) },
    size: 50,
    orderBy: "-assessed_at",
  });
  return res.results.filter((r) => r.pct_score !== undefined && r.pct_score !== null).map(toMobilityApi);
}

export async function getLatestMobility(petId: number): Promise<MobilityApi | null> {
  return (await listMobility(petId))[0] || null;
}
