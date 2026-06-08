/**
 * Food brand matcher (camera scan — pha 1).
 *
 * Input brand_name + product_line (từ OCR nhãn) → listRows("food_brands") (CHỈ ĐỌC)
 * → fuzzy match (normalize lowercase + bỏ dấu, Dice token coefficient).
 * Trả brand khớp (kèm field dinh dưỡng đã LƯU SẴN) + top-3 candidates.
 *
 * KHÔNG ghi Baserow. KHÔNG tính DER/dinh dưỡng — chỉ trả field đã lưu của brand.
 */
import { listRows } from "@shared/baserow.ts";

interface BaserowFoodBrandRow {
  id: number;
  brand_name?: string | null;
  product_line?: string | null;
  species?: string | { value: string } | null;
  life_stage?: string | { value: string } | null;
  protein_pct?: number | string | null;
  fat_pct?: number | string | null;
  fiber_pct?: number | string | null;
  carb_pct_calculated?: number | string | null;
  calories_per_100g?: number | string | null;
  price_vnd_per_kg?: number | string | null;
  mon_min_recommended?: boolean;
  vn_availability?: boolean;
  image_url?: string | null;
  product_url?: string | null;
}

export interface MatchedBrand {
  brand_id: number;
  brand_name: string;
  product_line: string | null;
  species: string | null;
  life_stage: string | null;
  protein_pct: number | null;
  fat_pct: number | null;
  fiber_pct: number | null;
  carb_pct_calculated: number | null;
  calories_per_100g: number | null;
  price_vnd_per_kg: number | null;
  mon_min_recommended: boolean;
  vn_availability: boolean;
  image_url: string | null;
  product_url: string | null;
}

export interface BrandCandidate {
  brand_id: number;
  brand_name: string;
  product_line: string | null;
  confidence: number;
}

export interface MatchResult {
  matched: boolean;
  brand: MatchedBrand | null;
  confidence: number; // 0..1
  candidates: BrandCandidate[];
}

const MATCH_THRESHOLD = 0.5;

function flat<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** lowercase + bỏ dấu tiếng Việt + chỉ giữ a-z0-9 → token hoá. */
function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Dice coefficient trên TẬP token (0..1). */
function dice(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return (2 * inter) / (setA.size + setB.size);
}

function toMatched(r: BaserowFoodBrandRow): MatchedBrand {
  return {
    brand_id: r.id,
    brand_name: r.brand_name || "",
    product_line: r.product_line || null,
    species: flat<string>(r.species),
    life_stage: flat<string>(r.life_stage),
    protein_pct: num(r.protein_pct),
    fat_pct: num(r.fat_pct),
    fiber_pct: num(r.fiber_pct),
    carb_pct_calculated: num(r.carb_pct_calculated),
    calories_per_100g: num(r.calories_per_100g),
    price_vnd_per_kg: num(r.price_vnd_per_kg),
    mon_min_recommended: r.mon_min_recommended === true,
    vn_availability: r.vn_availability !== false,
    image_url: r.image_url || null,
    product_url: r.product_url || null,
  };
}

/**
 * Match OCR brand → food_brands. Không khớp (best < threshold) → matched=false + candidates gần nhất.
 */
export async function matchFoodBrand(
  brandName: string | null | undefined,
  productLine?: string | null
): Promise<MatchResult> {
  const qBrand = (brandName || "").trim();
  if (!qBrand) {
    return { matched: false, brand: null, confidence: 0, candidates: [] };
  }

  const res = await listRows<BaserowFoodBrandRow>("food_brands", { size: 200 });
  // Bỏ junk row brand_name rỗng (Baserow auto-tạo) — đồng bộ loader nutrition.ts
  const rows = res.results.filter((r) => r.brand_name && r.brand_name.trim().length > 0);

  const qBrandTok = tokens(qBrand);
  const qLineTok = tokens(productLine || "");

  const scored = rows
    .map((r) => {
      const brandScore = dice(qBrandTok, tokens(r.brand_name || ""));
      const lineScore = qLineTok.length ? dice(qLineTok, tokens(r.product_line || "")) : 0;
      // brand_name là chính (0.75); product_line phụ (0.25). OCR không có line → chỉ brand.
      const score = qLineTok.length ? 0.75 * brandScore + 0.25 * lineScore : brandScore;
      return { row: r, score };
    })
    .sort((a, b) => b.score - a.score);

  const candidates: BrandCandidate[] = scored.slice(0, 3).map((s) => ({
    brand_id: s.row.id,
    brand_name: s.row.brand_name || "",
    product_line: s.row.product_line || null,
    confidence: Math.round(s.score * 100) / 100,
  }));

  const best = scored[0];
  const matched = !!best && best.score >= MATCH_THRESHOLD;

  return {
    matched,
    brand: matched ? toMatched(best.row) : null,
    confidence: best ? Math.round(best.score * 100) / 100 : 0,
    candidates,
  };
}
