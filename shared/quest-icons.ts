/**
 * Quest icon map — quest_code → SVG icon name + brand colors.
 *
 * Used by the dashboard QuestStrip widget + /pets/[id]/quests detail to replace
 * the legacy `def.emoji` (Baserow-stored emoji like 📸🍴🦸) with consistent
 * Lucide-style line icons rendered via the existing `FeatureIcon.astro` component.
 *
 * **Brand colour rules:**
 *   - `text-mmp-ink` — primary brand ink
 *   - `text-mmp-gold` — brand gold (token exists; `text-vv-gold` DOES NOT exist)
 *   - Semantic Tailwind colors (`text-emerald-600` / `text-amber-600` /
 *     `text-rose-600` / `text-blue-600`) for difficulty / category cues
 *   - `bg-*-50` / `bg-mmp-cream` / `bg-mmp-gold/10` for matching soft chip backgrounds
 *
 * Every `iconName` must exist in `web/src/components/FeatureIcon.astro` — when
 * adding a new quest trigger, add the icon to FeatureIcon first.
 */

export interface QuestIconMeta {
  iconName: string;   // FeatureIcon name (must exist in that component)
  iconColor: string;  // Tailwind text color class
  iconBg: string;     // Tailwind bg color class (soft chip background)
}

export const QUEST_ICON_MAP: Record<string, QuestIconMeta> = {
  // ─── Easy tier (5 quests) ────────────────────────────────────
  checkin: {
    iconName: "clipboard-check",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
  },
  upload_photo: {
    iconName: "camera",
    iconColor: "text-mmp-ink",
    iconBg: "bg-mmp-cream",
  },
  read_faq: {
    iconName: "book-open",
    iconColor: "text-mmp-ink",
    iconBg: "bg-mmp-cream",
  },
  view_pet_score: {
    iconName: "trophy",
    iconColor: "text-mmp-gold",
    iconBg: "bg-mmp-gold/10",
  },
  check_weather: {
    iconName: "cloud-sun",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
  },

  // ─── Medium tier (5 quests) ──────────────────────────────────
  log_meal: {
    iconName: "utensils",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
  },
  voice_diary: {
    iconName: "mic",
    iconColor: "text-rose-600",
    iconBg: "bg-rose-50",
  },
  check_water: {
    iconName: "droplet",
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
  },
  routine_complete: {
    iconName: "check-square",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
  },
  pet_score_increase: {
    iconName: "trending-up",
    iconColor: "text-mmp-gold",
    iconBg: "bg-mmp-gold/10",
  },

  // ─── Hard tier (5 quests) ────────────────────────────────────
  bcs_check: {
    iconName: "ruler",
    iconColor: "text-mmp-ink",
    iconBg: "bg-mmp-cream",
  },
  place_checkin: {
    iconName: "map-pin",
    iconColor: "text-rose-600",
    iconBg: "bg-rose-50",
  },
  playdate_swipe: {
    iconName: "heart",
    iconColor: "text-rose-500",
    iconBg: "bg-rose-50",
  },
  help_hero: {
    iconName: "shield",
    iconColor: "text-mmp-ink",
    iconBg: "bg-mmp-cream",
  },
  share_pet: {
    iconName: "share",
    iconColor: "text-mmp-ink",
    iconBg: "bg-mmp-cream",
  },
};

const DEFAULT_QUEST_ICON: QuestIconMeta = {
  iconName: "target",
  iconColor: "text-mmp-ink",
  iconBg: "bg-mmp-cream",
};

/** Resolve a quest_code to its icon meta. Falls back to a generic target icon. */
export function getQuestIcon(code: string | null | undefined): QuestIconMeta {
  if (!code) return DEFAULT_QUEST_ICON;
  return QUEST_ICON_MAP[code] || DEFAULT_QUEST_ICON;
}
