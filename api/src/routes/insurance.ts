/**
 * Insurance waitlist routes — PUBLIC (no auth needed).
 *
 *   POST /api/v1/insurance/waitlist           — submit interest
 *   GET  /api/v1/insurance/waitlist/count     — social proof counter
 *
 * Rate-limited to prevent spam (60 req/min/IP). Email dedupe prevents double-signup.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { listRows, createRow } from "@shared/baserow.ts";
import { ipRateLimit } from "../lib/rate-limit.ts";

export const insuranceRoute = new Hono();

// Apply IP rate limit (60 req/min/IP — protects against spam waitlist signups)
insuranceRoute.use("*", ipRateLimit("insurance", 60, 60));

// ────────────────────────────────────────────────────────────
// POST /waitlist — submit interest
// ────────────────────────────────────────────────────────────
const WaitlistSchema = z.object({
  email: z.string().email().max(120),
  phone: z.string().max(20).optional(),
  pet_count: z.number().int().min(1).max(20),
  pet_species: z.enum(["dog", "cat", "both"]),
  pet_age_range: z.enum(["puppy", "adult", "senior", "mixed"]),
  interest_level: z.enum(["just_curious", "comparing", "ready_to_buy"]),
  notes: z.string().max(500).optional(),
  referred_from: z.string().max(120).optional(),
});

insuranceRoute.post("/waitlist", zValidator("json", WaitlistSchema), async (c) => {
  const data = c.req.valid("json");
  try {
    // Dedupe by email
    const existing = await listRows<any>("insurance_waitlist", {
      filter: { email__equal: data.email },
      size: 1,
    });
    if (existing.results.length > 0) {
      return c.json({
        success: true,
        duplicate: true,
        message: "Bạn đã đăng ký waitlist rồi. VowVet sẽ thông báo khi bảo hiểm sẵn sàng.",
      });
    }

    // Create new row
    await createRow<any>("insurance_waitlist", {
      email: data.email,
      phone: data.phone || null,
      pet_count: data.pet_count,
      pet_species: data.pet_species,
      pet_age_range: data.pet_age_range,
      interest_level: data.interest_level,
      notes: data.notes || null,
      referred_from: data.referred_from || null,
      contacted: false,
      contacted_at: null,
      created_at: new Date().toISOString(),
    });

    return c.json({
      success: true,
      duplicate: false,
      message: "Đã ghi nhận! VowVet sẽ liên hệ khi bảo hiểm pet sẵn sàng (dự kiến Q3-Q4/2026).",
    });
  } catch (err: any) {
    console.error("[insurance/waitlist] error:", err);
    return c.json(
      { success: false, error: { code: "INTERNAL", message: "Lỗi server, thử lại sau." } },
      500,
    );
  }
});

// ────────────────────────────────────────────────────────────
// GET /waitlist/count — public counter (social proof)
// ────────────────────────────────────────────────────────────
let cachedCount: { value: number; expires_at: number } | null = null;
const COUNT_TTL_MS = 5 * 60 * 1000;

insuranceRoute.get("/waitlist/count", async (c) => {
  if (cachedCount && cachedCount.expires_at > Date.now()) {
    return c.json({ count: cachedCount.value, cached: true });
  }
  try {
    const res = await listRows<any>("insurance_waitlist", { size: 1 });
    const count = res.count || 0;
    cachedCount = { value: count, expires_at: Date.now() + COUNT_TTL_MS };
    return c.json({ count, cached: false });
  } catch (err: any) {
    console.error("[insurance/count] error:", err);
    return c.json({ count: 0, error: true });
  }
});
