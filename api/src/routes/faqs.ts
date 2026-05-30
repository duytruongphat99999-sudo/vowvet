/**
 * FAQs (Baserow CMS) routes (M31).
 *
 * Mount: app.route("/api/v1/faqs", faqsRoute) — plural, distinct from M9.4 /api/v1/faq.
 *
 * Endpoints (all PUBLIC — no auth):
 *   GET    /faqs                                — list (filters: category, search)
 *   GET    /faqs/categories                     — categories with counts
 *   GET    /faqs/:faqId                         — detail + auto-increment view_count
 *   POST   /faqs/:faqId/helpful                 — increment helpful_count (idempotent-ish)
 */
import { Hono } from "hono";
import {
  listFaqs,
  getFaq,
  incrementView,
  incrementHelpful,
  getCategoriesWithCounts,
  FAQ_CATEGORIES,
  type FaqCategory,
} from "../lib/faqs.ts";

export const faqsRoute = new Hono();

const VALID_CATEGORIES = new Set<FaqCategory>(FAQ_CATEGORIES.map((c) => c.key));

faqsRoute.get("/", async (c) => {
  const cat = c.req.query("category") as FaqCategory | undefined;
  const search = c.req.query("search") || c.req.query("q") || undefined;
  try {
    const items = await listFaqs({
      category: cat && VALID_CATEGORIES.has(cat) ? cat : null,
      search,
    });
    return c.json({ faqs: items, total: items.length });
  } catch (err: any) {
    console.error("[faqs/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load FAQ" } }, 500);
  }
});

faqsRoute.get("/categories", async (c) => {
  try {
    const cats = await getCategoriesWithCounts();
    return c.json({ categories: cats });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

faqsRoute.get("/:faqId{[0-9]+}", async (c) => {
  const faqId = Number(c.req.param("faqId"));
  try {
    const faq = await getFaq(faqId);
    if (!faq) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    // Fire-and-forget view increment
    incrementView(faqId).catch(() => {});
    return c.json({ faq });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

faqsRoute.post("/:faqId{[0-9]+}/helpful", async (c) => {
  const faqId = Number(c.req.param("faqId"));
  try {
    const faq = await getFaq(faqId);
    if (!faq) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    await incrementHelpful(faqId);
    const updated = await getFaq(faqId);
    return c.json({ faq: updated });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
