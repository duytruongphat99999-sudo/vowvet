/**
 * Nutrition routes (M7).
 *
 * Mount points (registered in api/src/index.ts):
 *   /api/v1/pets/:id/nutrition/...   — auth + ownership
 *   /api/v1/pets/:id/weight-log[s]   — auth + ownership
 *   /api/v1/food-brands              — auth (no ownership check)
 *   /api/v1/forbidden-foods          — public (educational data)
 *
 * Endpoints:
 *   GET  /pets/:id/nutrition/calorie-target
 *   GET  /pets/:id/nutrition/plan?meals=3&brand_id=X
 *   GET  /pets/:id/nutrition/insights
 *   POST /pets/:id/weight-log
 *   GET  /pets/:id/weight-logs?limit=50
 *   GET  /food-brands?species=dog&life_stage=adult&pet_id=X
 *   POST /food-brands/:bid/check-compatibility/:pid
 *   GET  /forbidden-foods?species=dog
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import { WeightLogCreateSchema } from "@shared/zod-schemas/m7.ts";
import {
  getCalorieTarget,
  generatePlanForPet,
  getWeightInsights,
  logWeight,
  listWeightLogs,
  deleteWeightLog,
  loadFoodBrands,
  checkBrandCompatibility,
  getCompatibleBrandRecommendations,
  type FoodBrand,
} from "../lib/nutrition.ts";
import { listForbidden, FORBIDDEN_FOODS_VN } from "@shared/forbidden-foods-vn.ts";

// ============================================================
// /api/v1/pets/:id/nutrition/* + /weight-log[s] — auth + ownership
// ============================================================
export const petNutritionRoute = new Hono();
petNutritionRoute.use("*", requireAuth);

// GET /pets/:id/nutrition/calorie-target
petNutritionRoute.get("/:id{[0-9]+}/nutrition/calorie-target", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const citySlug = c.req.query("city") || "ho_chi_minh";
  try {
    const pet = await getOwnedPet(petId, session.sub);
    const result = await getCalorieTarget(petId, pet, citySlug);
    if (!result) {
      return c.json(
        { error: { code: "NO_WEIGHT", message: "Pet chưa có cân nặng — không thể tính DER. Vui lòng log cân nặng." } },
        400
      );
    }
    return c.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[nutrition/calorie-target] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tính calorie" } }, 500);
  }
});

// GET /pets/:id/nutrition/plan?meals=3&brand_id=X
petNutritionRoute.get("/:id{[0-9]+}/nutrition/plan", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const citySlug = c.req.query("city") || "ho_chi_minh";
  const mealsParam = Number(c.req.query("meals") || "3");
  const mealsPerDay = Math.max(1, Math.min(6, Number.isNaN(mealsParam) ? 3 : mealsParam));
  const brandIdRaw = c.req.query("brand_id");
  const brandId = brandIdRaw ? Number(brandIdRaw) : null;

  try {
    const pet = await getOwnedPet(petId, session.sub);
    const result = await generatePlanForPet(petId, pet, { citySlug, mealsPerDay, brandId });
    if (!result) {
      return c.json(
        { error: { code: "NO_WEIGHT", message: "Pet chưa có cân nặng — không thể sinh meal plan." } },
        400
      );
    }
    return c.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[nutrition/plan] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi sinh meal plan" } }, 500);
  }
});

// GET /pets/:id/nutrition/insights
petNutritionRoute.get("/:id{[0-9]+}/nutrition/insights", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    const insights = await getWeightInsights(petId, pet);
    return c.json(insights);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[nutrition/insights] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load insights" } }, 500);
  }
});

// POST /pets/:id/weight-log
petNutritionRoute.post(
  "/:id{[0-9]+}/weight-log",
  zValidator("json", WeightLogCreateSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    try {
      await getOwnedPet(petId, session.sub);
      const entry = await logWeight(petId, {
        weight_kg: data.weight_kg,
        body_condition_score: data.body_condition_score,
        notes: data.notes,
      });

      // Quest hook: weight-log is the user's nutrition-tracking touchpoint
      let completedQuests: any[] = [];
      try {
        const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
        completedQuests = await trackQuestTrigger(session.sub, petId, "log_meal");
      } catch (err) {
        console.error("[weight-log] quest track failed:", err);
      }

      return c.json({ success: true, log: entry, completed_quests: completedQuests });
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status);
      }
      console.error("[weight-log] error:", err);
      return c.json({ error: { code: "INTERNAL", message: "Lỗi log cân nặng" } }, 500);
    }
  }
);

// GET /pets/:id/weight-logs?limit=50
petNutritionRoute.get("/:id{[0-9]+}/weight-logs", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const limitParam = Number(c.req.query("limit") || "50");
  const limit = Math.max(1, Math.min(200, Number.isNaN(limitParam) ? 50 : limitParam));
  try {
    await getOwnedPet(petId, session.sub);
    const logs = await listWeightLogs(petId, limit);
    return c.json({ pet_id: petId, logs });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[weight-logs] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load history" } }, 500);
  }
});

// DELETE /pets/:id/weight-log/:logId — xoá 1 bản ghi cân sai (owner only). L15.
petNutritionRoute.delete("/:id{[0-9]+}/weight-log/:logId{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const logId = Number(c.req.param("logId"));
  try {
    await getOwnedPet(petId, session.sub);
    const ok = await deleteWeightLog(petId, logId);
    if (!ok) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy bản ghi cân" } }, 404);
    }
    return c.json({ success: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[weight-log/delete] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xoá log cân" } }, 500);
  }
});

// ============================================================
// /api/v1/food-brands — auth
// ============================================================
export const foodBrandsRoute = new Hono();
foodBrandsRoute.use("*", requireAuth);

// GET /food-brands?species=dog&life_stage=adult&pet_id=X
foodBrandsRoute.get("/", async (c) => {
  const session = c.get("user");
  const speciesFilter = c.req.query("species") || null;
  const lifeStageFilter = c.req.query("life_stage") || null;
  const petIdRaw = c.req.query("pet_id");
  const petId = petIdRaw ? Number(petIdRaw) : null;

  try {
    // Nếu có pet_id → trả recommendations + verify ownership
    if (petId) {
      const pet = await getOwnedPet(petId, session.sub);
      const recs = await getCompatibleBrandRecommendations(petId, pet, 20);
      return c.json({ brands: recs, pet_id: petId, mode: "recommendations" });
    }

    // Không có pet_id → trả full list filtered by query
    let brands = await loadFoodBrands();
    if (speciesFilter) {
      brands = brands.filter((b) => b.species === speciesFilter || b.species === "both");
    }
    if (lifeStageFilter) {
      brands = brands.filter((b) => b.life_stage === lifeStageFilter || b.life_stage === "all");
    }
    return c.json({ brands, mode: "browse" });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[food-brands] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load brands" } }, 500);
  }
});

// POST /food-brands/:bid/check-compatibility/:pid
foodBrandsRoute.post("/:bid{[0-9]+}/check-compatibility/:pid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const brandId = Number(c.req.param("bid"));
  const petId = Number(c.req.param("pid"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    const result = await checkBrandCompatibility(petId, pet, brandId);
    if (!result) {
      return c.json({ error: { code: "BRAND_NOT_FOUND", message: "Brand không tồn tại" } }, 404);
    }
    return c.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[brand-compat] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi check compatibility" } }, 500);
  }
});

// ============================================================
// /api/v1/forbidden-foods — public (educational, no auth)
// ============================================================
export const forbiddenFoodsRoute = new Hono();

// GET /forbidden-foods?species=dog
forbiddenFoodsRoute.get("/", (c) => {
  const species = c.req.query("species");
  let list;
  if (species === "dog" || species === "cat") {
    list = listForbidden(species);
  } else {
    list = FORBIDDEN_FOODS_VN;
  }
  return c.json({ foods: list, total: list.length });
});
