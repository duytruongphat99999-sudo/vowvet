/**
 * Community feed routes (Session C).
 *
 * Mount: app.route("/api/v1/community", communityRoute)
 *
 *   GET /community/feed?limit=30  — PUBLIC, recent activity stream
 */
import { Hono } from "hono";
import { getRecentCommunityEvents } from "../lib/community-feed.ts";

export const communityRoute = new Hono();

communityRoute.get("/feed", async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 30)));
  try {
    const events = await getRecentCommunityEvents(limit);
    return c.json({ events, total: events.length });
  } catch (err) {
    console.error("[community/feed] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load feed" } }, 500);
  }
});
