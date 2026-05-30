/**
 * First Aid routes (M9.3).
 *
 * Mount tại /api/v1/first-aid. Require auth (tránh scraping).
 *
 * Endpoints:
 *   GET /articles?category=&species=&severity=  — list previews
 *   GET /articles/:slug                          — full article
 *   GET /clinic-info                             — clinic contact env-driven
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import {
  FIRST_AID_ARTICLES,
  getArticle,
  listArticles,
  toPreview,
  CATEGORY_LABEL_VI,
  SEVERITY_LABEL_VI,
  type FirstAidCategory,
  type FirstAidSeverity,
} from "@shared/first-aid-articles.ts";
import { getClinicInfo } from "@shared/clinic-info.ts";

export const firstAidRoutes = new Hono();
firstAidRoutes.use("*", requireAuth);

// ============================================================
// GET /articles
// ============================================================
firstAidRoutes.get("/articles", (c) => {
  const category = c.req.query("category") as FirstAidCategory | undefined;
  const species = c.req.query("species") as "dog" | "cat" | undefined;
  const severity = c.req.query("severity") as FirstAidSeverity | undefined;

  const filtered = listArticles({
    category: ["poisoning", "trauma", "respiratory", "environmental", "neurological", "allergic", "metabolic"].includes(category as any) ? category : undefined,
    species: species === "dog" || species === "cat" ? species : undefined,
    severity: ["CRITICAL", "URGENT", "IMPORTANT"].includes(severity as any) ? severity : undefined,
  });

  // Sort: CRITICAL > URGENT > IMPORTANT, then by category
  const severityRank = { CRITICAL: 0, URGENT: 1, IMPORTANT: 2 };
  const sorted = [...filtered].sort((a, b) => {
    const sa = severityRank[a.severity] - severityRank[b.severity];
    if (sa !== 0) return sa;
    return a.category.localeCompare(b.category);
  });

  return c.json({
    articles: sorted.map(toPreview),
    total: sorted.length,
    categories: Object.entries(CATEGORY_LABEL_VI).map(([key, label]) => ({ key, label })),
    severity_labels: SEVERITY_LABEL_VI,
  });
});

// ============================================================
// GET /articles/:slug
// ============================================================
firstAidRoutes.get("/articles/:slug", (c) => {
  const slug = c.req.param("slug");
  const article = getArticle(slug);
  if (!article) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Bài hướng dẫn không tồn tại" } },
      404
    );
  }
  return c.json({
    article: {
      ...article,
      category_label_vi: CATEGORY_LABEL_VI[article.category],
      severity_label_vi: SEVERITY_LABEL_VI[article.severity],
    },
  });
});

// ============================================================
// GET /clinic-info
// ============================================================
firstAidRoutes.get("/clinic-info", (c) => {
  const clinic = getClinicInfo();
  return c.json({ clinic });
});
