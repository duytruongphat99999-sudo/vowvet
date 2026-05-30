/**
 * Rewards routes.
 *
 * Mount: app.route("/api/v1/rewards", rewardsRoute)
 *
 * Endpoints (all auth required):
 *   GET    /rewards/pets/:petId/unlockable   — split into unlockable[] + locked[] (with progress)
 *   GET    /rewards/pets/:petId/claimed      — user's claim history for this pet
 *   POST   /rewards/pets/:petId/:code/claim  — generate voucher, persist user_rewards
 *   GET    /rewards/claims/:claimId          — voucher detail
 *   POST   /rewards/admin/:claimId/redeem    — admin marks voucher used in-clinic (role=admin)
 *
 * Feature access endpoint also mounted here for convenience:
 *   GET    /rewards/feature-access/:featureKey/pets/:petId
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  evaluateUnlockableRewards,
  claimReward,
  listClaimedRewards,
  getClaimById,
  getRewardDefByCode,
  markClaimRedeemed,
} from "../lib/rewards.ts";
import { checkFeatureAccess } from "../lib/feature-gates.ts";

export const rewardsRoute = new Hono();
rewardsRoute.use("*", requireAuth);

rewardsRoute.get("/pets/:petId{[0-9]+}/unlockable", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const data = await evaluateUnlockableRewards(session.sub, petId);
    return c.json(data);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[rewards/unlockable] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

rewardsRoute.get("/pets/:petId{[0-9]+}/claimed", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const claims = await listClaimedRewards(session.sub, petId);
    // Hydrate with reward def for display
    const codes = [...new Set(claims.map((c) => c.reward_code))];
    const defsMap = new Map<string, any>();
    for (const code of codes) {
      const d = await getRewardDefByCode(code);
      if (d) defsMap.set(code, d);
    }
    return c.json({
      claims: claims.map((c) => ({ ...c, definition: defsMap.get(c.reward_code) || null })),
    });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

rewardsRoute.post("/pets/:petId{[0-9]+}/:code/claim", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("petId"));
  const code = c.req.param("code");
  try {
    await getOwnedPet(petId, session.sub);
    const claim = await claimReward(session.sub, petId, code);
    return c.json({ success: true, claim }, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    if (err?.code === "NOT_UNLOCKABLE") {
      return c.json({ error: { code: "NOT_UNLOCKABLE", message: err.message } }, 400);
    }
    console.error("[rewards/claim] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi claim" } }, 500);
  }
});

rewardsRoute.get("/claims/:claimId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const claimId = Number(c.req.param("claimId"));
  try {
    const claim = await getClaimById(claimId);
    if (!claim) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404);
    if (claim.user_id !== session.sub) {
      return c.json({ error: { code: "FORBIDDEN", message: "Không có quyền" } }, 403);
    }
    const def = await getRewardDefByCode(claim.reward_code);
    return c.json({ claim, definition: def });
  } catch (err) {
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});

rewardsRoute.post("/admin/:claimId{[0-9]+}/redeem", async (c) => {
  const session = c.get("user");
  // Role check — sessions don't always carry role; treat is_vet or admin phones as authorized
  const adminPhones = (process.env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = (session as any).role === "admin" || adminPhones.includes((session as any).phone || "");
  if (!isAdmin) {
    return c.json({ error: { code: "FORBIDDEN", message: "Chỉ admin được phép" } }, 403);
  }

  const claimId = Number(c.req.param("claimId"));
  let body: any = {};
  try { body = await c.req.json(); } catch {}

  try {
    const updated = await markClaimRedeemed(claimId, session.sub, body.notes || "");
    return c.json({ success: true, claim: updated });
  } catch (err: any) {
    return c.json({ error: { code: "INTERNAL", message: err.message || "Lỗi" } }, 500);
  }
});

rewardsRoute.get("/feature-access/:featureKey/pets/:petId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const featureKey = c.req.param("featureKey");
  const petId = Number(c.req.param("petId"));
  try {
    await getOwnedPet(petId, session.sub);
    const access = await checkFeatureAccess(session.sub, petId, featureKey);
    return c.json(access);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi" } }, 500);
  }
});
