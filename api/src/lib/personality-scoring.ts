/**
 * Personality scoring engine (M13).
 *
 * Input: { q1: "a", q2: "b", ... } answers map
 * Output: { primary, secondary?, scores } — đầy đủ 12 type scores
 *
 * Deterministic: same answers → same result.
 */
import {
  PERSONALITY_QUESTIONS,
  getOption,
} from "@shared/personality-questions.ts";
import {
  PERSONALITY_TYPES,
  ALL_TYPE_IDS,
  type PersonalityTypeId,
} from "@shared/personality-types.ts";

export interface CalculatedScores {
  primary: PersonalityTypeId;
  secondary: PersonalityTypeId | null; // null nếu gap >30% (rõ primary)
  scores: Record<PersonalityTypeId, number>;
  total_answered: number;
  dimensions_triggered: Record<PersonalityTypeId, number>; // số dimension contribute → tiebreak
}

/**
 * Calculate result từ answers.
 * Throws nếu thiếu câu trả lời (< 20).
 */
export function calculateType(answers: Record<string, string>): CalculatedScores {
  // Init scores
  const scores: Record<PersonalityTypeId, number> = {} as any;
  const dimensions: Record<PersonalityTypeId, Set<string>> = {} as any;
  for (const id of ALL_TYPE_IDS) {
    scores[id] = 0;
    dimensions[id] = new Set();
  }

  let answered = 0;
  for (const q of PERSONALITY_QUESTIONS) {
    const answerOptId = answers[q.id];
    if (!answerOptId) continue;
    const opt = getOption(q.id, answerOptId);
    if (!opt) continue;
    answered++;
    for (const [typeId, pts] of Object.entries(opt.scores)) {
      const tid = typeId as PersonalityTypeId;
      if (typeof pts !== "number") continue;
      scores[tid] += pts;
      dimensions[tid].add(q.dimension);
    }
  }

  if (answered < PERSONALITY_QUESTIONS.length) {
    const err = new Error(
      `Cần trả lời đủ ${PERSONALITY_QUESTIONS.length} câu (đã có ${answered})`
    );
    (err as any).status = 400;
    (err as any).code = "INCOMPLETE_ANSWERS";
    throw err;
  }

  // Sort by score desc, tiebreak by dimensions count
  const sorted = ALL_TYPE_IDS.slice().sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return dimensions[b].size - dimensions[a].size;
  });

  const primary = sorted[0];
  const second = sorted[1];
  // Secondary chỉ nếu gap < 30% so với primary
  const gap = scores[primary] - scores[second];
  const gapPct = scores[primary] > 0 ? gap / scores[primary] : 1;
  const secondary: PersonalityTypeId | null = gapPct < 0.3 ? second : null;

  const dimensionsCounts: Record<PersonalityTypeId, number> = {} as any;
  for (const id of ALL_TYPE_IDS) dimensionsCounts[id] = dimensions[id].size;

  return {
    primary,
    secondary,
    scores,
    total_answered: answered,
    dimensions_triggered: dimensionsCounts,
  };
}

/** Render full result với metadata cho frontend. */
export function buildResultPayload(result: CalculatedScores, petName: string, publicSlug: string | null, appDomain: string) {
  const primaryMeta = PERSONALITY_TYPES[result.primary];
  const secondaryMeta = result.secondary ? PERSONALITY_TYPES[result.secondary] : null;

  // Share URL preference: public if available, else login wall
  const shareUrl = publicSlug ? `${appDomain}/p/${publicSlug}` : `${appDomain}/login`;
  const shareText = primaryMeta.share_text_template
    .replace("{pet_name}", petName)
    .replace("{url}", shareUrl);

  return {
    primary: result.primary,
    secondary: result.secondary,
    primary_meta: primaryMeta,
    secondary_meta: secondaryMeta,
    scores: result.scores,
    dimensions_triggered: result.dimensions_triggered,
    share: {
      url: shareUrl,
      text: shareText,
    },
  };
}
