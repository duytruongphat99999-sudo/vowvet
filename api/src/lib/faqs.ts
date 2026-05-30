/**
 * Baserow CMS FAQ service (M31).
 *
 * Admin edits in Baserow → users see immediately (no deploy).
 * Different from M9.4 faq-articles (static, long-form WSAVA guides).
 */
import { listRows, createRow, getRow, updateRow } from "@shared/baserow.ts";

export type FaqCategory = "health" | "nutrition" | "training" | "emergency" | "app_usage" | "other";

export const FAQ_CATEGORIES: Array<{ key: FaqCategory; label_vi: string; emoji: string }> = [
  { key: "health", label_vi: "Sức khoẻ", emoji: "❤️" },
  { key: "nutrition", label_vi: "Dinh dưỡng", emoji: "🍴" },
  { key: "training", label_vi: "Huấn luyện", emoji: "🎓" },
  { key: "emergency", label_vi: "Khẩn cấp", emoji: "🚨" },
  { key: "app_usage", label_vi: "Dùng app", emoji: "📱" },
  { key: "other", label_vi: "Khác", emoji: "💬" },
];

export interface FaqRow {
  id: number;
  category: string | { id: number; value: string };
  question: string;
  answer: string;
  order_num: number;
  is_published: boolean;
  view_count: number;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

export interface FaqApi {
  id: number;
  category: FaqCategory;
  category_label: string;
  category_emoji: string;
  question: string;
  answer: string;
  order_num: number;
  view_count: number;
  helpful_count: number;
  created_at: string;
}

function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

export function toApi(row: FaqRow): FaqApi {
  const category = (flatVal<FaqCategory>(row.category) || "other") as FaqCategory;
  const meta = FAQ_CATEGORIES.find((c) => c.key === category) || FAQ_CATEGORIES[FAQ_CATEGORIES.length - 1];
  return {
    id: row.id,
    category,
    category_label: meta.label_vi,
    category_emoji: meta.emoji,
    question: row.question || "",
    answer: row.answer || "",
    order_num: Number(row.order_num) || 0,
    view_count: Number(row.view_count) || 0,
    helpful_count: Number(row.helpful_count) || 0,
    created_at: row.created_at || "",
  };
}

// ============================================================
// Public list + filter + search
// ============================================================
export interface ListFaqsFilters {
  category?: FaqCategory | null;
  search?: string;
}

export async function listFaqs(filters: ListFaqsFilters = {}): Promise<FaqApi[]> {
  const f: Record<string, string> = { is_published__boolean: "true" };
  if (filters.category) f.category__contains = filters.category;
  if (filters.search) f.question__contains = filters.search;
  const res = await listRows<FaqRow>("faqs", { filter: f, size: 200 });
  let items = res.results.filter((r) => r.question).map(toApi);
  // Sort: lowest order_num first, then most-helpful first
  items.sort((a, b) => {
    if (a.order_num !== b.order_num) return a.order_num - b.order_num;
    return b.helpful_count - a.helpful_count;
  });
  return items;
}

export async function getFaq(faqId: number): Promise<FaqApi | null> {
  try {
    const row = await getRow<FaqRow>("faqs", faqId);
    return toApi(row);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

export async function incrementView(faqId: number): Promise<void> {
  try {
    const row = await getRow<FaqRow>("faqs", faqId);
    await updateRow("faqs", faqId, { view_count: (Number(row.view_count) || 0) + 1 });
  } catch (err) {
    console.error(`[faqs] incrementView ${faqId}:`, err);
  }
}

export async function incrementHelpful(faqId: number): Promise<void> {
  try {
    const row = await getRow<FaqRow>("faqs", faqId);
    await updateRow("faqs", faqId, { helpful_count: (Number(row.helpful_count) || 0) + 1 });
  } catch (err) {
    console.error(`[faqs] incrementHelpful ${faqId}:`, err);
  }
}

export async function getCategoriesWithCounts(): Promise<Array<{ key: FaqCategory; label_vi: string; emoji: string; count: number }>> {
  const all = await listFaqs({});
  const counts = new Map<FaqCategory, number>();
  for (const f of all) counts.set(f.category, (counts.get(f.category) || 0) + 1);
  return FAQ_CATEGORIES.map((c) => ({ ...c, count: counts.get(c.key) || 0 }));
}

// ============================================================
// Seed helper (used by scripts/seed-faqs.ts) — admin-only path
// ============================================================
export interface SeedFaqInput {
  category: FaqCategory;
  question: string;
  answer: string;
  order_num?: number;
}

export async function createFaqRow(input: SeedFaqInput): Promise<FaqApi> {
  const now = new Date().toISOString();
  const row = await createRow<FaqRow>("faqs", {
    category: input.category,
    question: input.question.slice(0, 500),
    answer: input.answer.slice(0, 5000),
    order_num: input.order_num ?? 100,
    is_published: true,
    view_count: 0,
    helpful_count: 0,
    created_at: now,
    updated_at: now,
  });
  return toApi(row);
}
