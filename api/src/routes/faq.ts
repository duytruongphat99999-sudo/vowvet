/**
 * FAQ / Knowledge Base routes (M9.4).
 *
 * Mount tại /api/v1/faq. Require auth.
 *
 * Endpoints:
 *   GET /articles?q=&category=&species=  — search + filter (returns previews)
 *   GET /articles/:slug                   — full article
 *   GET /categories                       — category labels
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import {
  FAQ_ARTICLES,
  getFaq,
  searchFaq,
  toFaqPreview,
  FAQ_CATEGORY_LABEL_VI,
  type FaqCategory,
} from "@shared/faq-articles.ts";

export const faqRoutes = new Hono();
faqRoutes.use("*", requireAuth);

const VALID_CATEGORIES: FaqCategory[] = [
  "nutrition",
  "vaccine",
  "preventive",
  "behavior",
  "training",
  "senior_care",
  "post_surgery",
  "grooming",
];

faqRoutes.get("/articles", (c) => {
  const q = c.req.query("q") || "";
  const categoryRaw = c.req.query("category") as FaqCategory | undefined;
  const speciesRaw = c.req.query("species");
  const category = VALID_CATEGORIES.includes(categoryRaw as FaqCategory) ? categoryRaw : undefined;
  const species = speciesRaw === "dog" || speciesRaw === "cat" ? speciesRaw : undefined;

  const results = searchFaq(q, { category, species });
  return c.json({
    articles: results,
    total: results.length,
    query: q || null,
    filters_applied: { category: category || null, species: species || null },
  });
});

faqRoutes.get("/articles/:slug", (c) => {
  const slug = c.req.param("slug");
  const a = getFaq(slug);
  if (!a) {
    return c.json({ error: { code: "NOT_FOUND", message: "Bài không tồn tại" } }, 404);
  }
  return c.json({
    article: {
      ...a,
      category_label_vi: FAQ_CATEGORY_LABEL_VI[a.category],
    },
  });
});

faqRoutes.get("/categories", (c) => {
  const counts: Record<string, number> = {};
  for (const a of FAQ_ARTICLES) {
    counts[a.category] = (counts[a.category] || 0) + 1;
  }
  return c.json({
    categories: VALID_CATEGORIES.map((key) => ({
      key,
      label: FAQ_CATEGORY_LABEL_VI[key],
      count: counts[key] || 0,
    })),
    total_articles: FAQ_ARTICLES.length,
  });
});
