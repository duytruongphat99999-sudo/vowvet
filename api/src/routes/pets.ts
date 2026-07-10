/**
 * Pets routes — CRUD + photo upload + QR passport.
 * Tất cả endpoints require auth (cookie session).
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { listUserPets, createPet, findUserById, findUserByPhone, findUserByEmail, type BaserowPet } from "../lib/users.ts";
import { transferPet, TransferError } from "../lib/foster-transfer.ts";
import { createReclaimRequest } from "../lib/reclaim-requests.ts";
import { normalizePhone } from "@shared/auth.ts";
import {
  getOwnedPet,
  patchPet,
  hardDeletePet,
  PetAccessError,
  ownerIds,
} from "../lib/pets.ts";
import { generateUniqueQrCode } from "../lib/qr.ts";
import {
  speciesViToEn,
  speciesEnToVi,
  genderViToEn,
  genderEnToVi,
  isValidSymptomEn,
  ALL_SYMPTOMS_EN,
  stoolEnToVi,
} from "@shared/enum-mappers.ts";
import { parseHealthConditions } from "@shared/health-conditions.ts";
import { uploadObject, imageExtFromMime } from "@shared/r2.ts";
import {
  listPetPhotos,
  createPetPhoto,
  getPhotoById,
  deletePetPhoto,
  ownerIdsFromPhoto,
  type PhotoType,
  type BaserowPhoto,
} from "../lib/photos.ts";
import {
  listHealthRecords,
  createHealthRecord,
  deleteHealthRecord,
  getRecordAndVerifyPet,
  type HealthResource,
} from "../lib/health-records.ts";
import { computeCompletion, recalcAndSave } from "../lib/profile.ts";
import { getSensitivity, invalidateSensitivity } from "../lib/sensitivity-cache.ts";
import {
  SECTION_SCHEMAS,
  PhotoTypeSchema,
  VaccineCreateSchema,
  DewormerCreateSchema,
  AllergyCreateSchema,
  HealthEventCreateSchema,
  type SectionName as ProfileSectionName,
} from "@shared/zod-schemas/profile-sections.ts";
import {
  upsertCheckIn,
  findTodayCheckIn,
  listCheckInsHistory,
  todayIso,
  type BaserowCheckIn,
} from "../lib/check-ins.ts";
import {
  findTodayCarePlan,
  setFeedback,
  parsePlanJson,
  parseMetadata,
  setProcessing,
  clearProcessing,
  isProcessing,
  checkRefreshLimit,
  bumpRefreshCount,
  listRecentCarePlans,
  type BaserowCarePlan,
} from "../lib/care-plans.ts";
import { generateAndSaveCarePlan, type CheckInForPrompt, type PetForPrompt } from "../lib/care-plan-engine.ts";
import { generateCarePlanV2, getCachedOnly as getCachedCarePlanV2 } from "../lib/care-planner-v2.ts";
import { invalidate as invalidateCarePlanV2 } from "../lib/care-plan-cache.ts";
import { invalidatePetScore } from "../lib/pet-score.ts";
import {
  enablePublicProfile,
  disablePublicProfile,
  updatePublicProfile,
  getPublicStats,
} from "../lib/public-pets.ts";
import { PublicEnableSchema, PublicUpdateSchema, FosterUpdateSchema } from "@shared/zod-schemas/public-pet.ts";
// Baserow raw helpers — needed for care_plan_completions reads/writes + activity timeline aggregation.
// Previously omitted (regression from Phase 2.2 of Care Plan WOW), causing
// ReferenceError: listRows is not defined → 500 → frontend "Lỗi mạng" toast.
import { listRows, createRow, updateRow, getRow } from "@shared/baserow.ts";

export const petsRoute = new Hono();

petsRoute.use("*", requireAuth);

// Helper map Baserow row → API pet (v49: exported để /auth/me share — single source mapping)
export function toApiPet(p: BaserowPet) {
  const species = typeof p.species === "object" ? p.species?.value : p.species;
  const gender = typeof p.gender === "object" ? p.gender?.value : p.gender;
  // v49: defensive JSON parse cho long-text array columns
  const parseJsonArray = (raw: any): string[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== "string" || !raw) return [];
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  // Đợt 2a: single_select Baserow → value string
  const extractSel = (v: any): string | null =>
    v && typeof v === "object" && "value" in v ? v.value : typeof v === "string" ? v : null;
  return {
    id: p.id,
    name: p.name,
    species: speciesEnToVi(species as string),
    breed: p.breed ?? null,
    dob: p.dob ?? null,
    gender: genderEnToVi(gender as string | null),
    weight_kg: p.weight_kg ?? null,
    photo_url: p.photo_url ?? null,
    qr_code: (p as any).qr_code ?? null,
    created_at: (p as any).created_at ?? null,
    // v49: Profile-driven fields
    bcs_score: p.bcs_score ?? null,
    poop_score: p.poop_score ?? null,
    allergens: parseJsonArray(p.allergens),
    sensitivities: parseJsonArray(p.sensitivities),
    environmentals: parseJsonArray(p.environmentals),
    origin_certificate_url: p.origin_certificate_url ?? null,
    is_verified: Boolean(p.is_verified),
    // Đợt 2a: sinh lý (field có sẵn) + bệnh sử y khoa (field mới)
    neutered: Boolean((p as any).neutered),
    activity_level: extractSel((p as any).activity_level),
    life_stage: extractSel((p as any).life_stage),
    coat_condition: extractSel((p as any).coat_condition),
    dental_status: extractSel((p as any).dental_status),
    health_conditions: parseHealthConditions((p as any).health_conditions),
    current_medications: (p as any).current_medications ?? null,
    health_history: (p as any).health_history ?? null,
    // BƯỚC 2: cam kết hồ sơ trọn đời
    pledge_at: (p as any).pledge_at ?? null,
    pledged_by: (p as any).pledged_by ?? null,
  };
}

function petErrorResponse(c: any, err: unknown) {
  if (err instanceof PetAccessError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error("[pets] internal error:", err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Lỗi hệ thống" } }, 500);
}

// ===== GET /pets — list current user's pets =====
petsRoute.get("/", async (c) => {
  const session = c.get("user");
  const pets = await listUserPets(session.sub, 200);
  return c.json({ pets: pets.map(toApiPet) });
});

// ===== POST /pets — create new pet =====
const petCreateSchema = z.object({
  name: z.string().trim().min(1, "Tên thú cưng không được trống").max(100),
  species: z.enum(["Chó", "Mèo"], {
    errorMap: () => ({ message: "Loài phải là Chó hoặc Mèo" }),
  }),
  breed: z.string().trim().max(100).optional().nullable(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải dạng YYYY-MM-DD")
    .optional()
    .nullable(),
  gender: z.enum(["Đực", "Cái"]).optional().nullable(),
  weight_kg: z.number().positive().max(200).optional().nullable(),
});

petsRoute.post("/", zValidator("json", petCreateSchema), async (c) => {
  const session = c.get("user");
  const data = c.req.valid("json");
  try {
    const pet = await createPet(session.sub, {
      name: data.name,
      species: speciesViToEn(data.species),
      breed: data.breed || null,
      dob: data.dob || null,
      gender: genderViToEn(data.gender),
      weight_kg: data.weight_kg ?? null,
    });
    return c.json({ pet: toApiPet(pet) }, 201);
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== GET /pets/:id — get pet detail =====
petsRoute.get("/:id{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    return c.json({ pet: toApiPet(pet) });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== PATCH /pets/:id — partial update =====
// v49: Schema extension — profile-driven fields. Yêu cầu Baserow cột tương ứng tồn tại.
const petPatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  breed: z.string().trim().max(100).nullable().optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(["Đực", "Cái"]).nullable().optional(),
  weight_kg: z.number().positive().max(200).nullable().optional(),
  target_weight_kg: z.number().positive().max(200).nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  // v49: Profile-driven medical + lifestyle fields
  bcs_score: z.number().int().min(1).max(9).nullable().optional(),
  poop_score: z.number().int().min(0).max(5).nullable().optional(),
  allergens: z.array(z.string().max(50)).max(20).optional(),
  sensitivities: z.array(z.string().max(50)).max(20).optional(),
  environmentals: z.array(z.string().max(50)).max(20).optional(),
  origin_certificate_url: z.string().url().nullable().optional(),
  is_verified: z.boolean().optional(),
  // Đợt 2a: sinh lý (field Baserow có sẵn) + bệnh sử y khoa (field mới)
  neutered: z.boolean().optional(),
  activity_level: z.enum(["sedentary", "low", "moderate", "active", "very_active"]).nullable().optional(),
  life_stage: z.enum(["puppy", "junior", "adult", "senior", "geriatric"]).nullable().optional(),
  coat_condition: z.enum(["normal", "dry", "shedding", "oily"]).nullable().optional(),
  dental_status: z.enum(["good", "tartar", "missing_teeth", "under_treatment"]).nullable().optional(),
  health_conditions: z
    .array(
      z.object({
        code: z.string().max(50),
        status: z.enum(["active", "managed", "resolved"]).default("active"),
        since: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
      })
    )
    .max(30)
    .optional(),
  current_medications: z.string().max(2000).nullable().optional(),
  health_history: z.string().max(2000).nullable().optional(),
});

petsRoute.patch("/:id{[0-9]+}", zValidator("json", petPatchSchema), async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const data = c.req.valid("json");

  try {
    await getOwnedPet(petId, session.sub); // ownership check
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.breed !== undefined) update.breed = data.breed;
    if (data.dob !== undefined) update.dob = data.dob;
    if (data.gender !== undefined) update.gender = genderViToEn(data.gender);
    if (data.weight_kg !== undefined) update.weight_kg = data.weight_kg;
    if (data.target_weight_kg !== undefined) update.target_weight_kg = data.target_weight_kg;
    if (data.photo_url !== undefined) update.photo_url = data.photo_url;
    // v49: profile-driven fields — JSON.stringify arrays cho Baserow long-text columns
    if (data.bcs_score !== undefined) update.bcs_score = data.bcs_score;
    if (data.poop_score !== undefined) update.poop_score = data.poop_score;
    if (data.allergens !== undefined) update.allergens = JSON.stringify(data.allergens);
    if (data.sensitivities !== undefined) update.sensitivities = JSON.stringify(data.sensitivities);
    if (data.environmentals !== undefined) update.environmentals = JSON.stringify(data.environmentals);
    if (data.origin_certificate_url !== undefined) update.origin_certificate_url = data.origin_certificate_url;
    if (data.is_verified !== undefined) update.is_verified = data.is_verified;
    // Đợt 2a: sinh lý + bệnh sử y khoa
    if (data.neutered !== undefined) update.neutered = data.neutered;
    if (data.activity_level !== undefined) update.activity_level = data.activity_level;
    if (data.life_stage !== undefined) update.life_stage = data.life_stage;
    if (data.coat_condition !== undefined) update.coat_condition = data.coat_condition;
    if (data.dental_status !== undefined) update.dental_status = data.dental_status;
    if (data.health_conditions !== undefined) {
      update.health_conditions = JSON.stringify(
        data.health_conditions.map((h) => ({ code: h.code, status: h.status, since: h.since ?? null }))
      );
    }
    if (data.current_medications !== undefined) update.current_medications = data.current_medications;
    if (data.health_history !== undefined) update.health_history = data.health_history;

    const updated = await patchPet(petId, update);
    return c.json({ pet: toApiPet(updated) });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== POST /pets/:id/pledge (BƯỚC 2) — cam kết hồ sơ trọn đời =====
const pledgeSchema = z.object({ pledged_by: z.string().trim().max(120).optional() });
petsRoute.post("/:id{[0-9]+}/pledge", zValidator("json", pledgeSchema), async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const data = c.req.valid("json");
  try {
    await getOwnedPet(petId, session.sub); // ownership check
    let pledgedBy = (data.pledged_by || "").trim();
    if (!pledgedBy) {
      const u = await findUserById(session.sub);
      pledgedBy = (u && (u as any).name) || "";
    }
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // ngày VN
    const updated = await patchPet(petId, { pledge_at: today, pledged_by: pledgedBy || null });
    return c.json({ pet: toApiPet(updated) });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== DELETE /pets/:id — hard delete =====
petsRoute.delete("/:id{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub); // ownership check + 404
    await hardDeletePet(petId);
    return c.json({ success: true });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ============================================================
// M12: Public profile management (owner only)
// ============================================================
const APP_DOMAIN = process.env.APP_DOMAIN || "https://vowvet.monminpet.com";

// GET /pets/:id/public — owner share page state
petsRoute.get("/:id{[0-9]+}/public", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const stats = await getPublicStats(petId, session.sub);
    return c.json({
      ...stats,
      public_url: stats.public_slug ? `${APP_DOMAIN}/p/${stats.public_slug}` : null,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// POST /pets/:id/public/enable
petsRoute.post(
  "/:id{[0-9]+}/public/enable",
  zValidator("json", PublicEnableSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    try {
      const { slug } = await enablePublicProfile(petId, session.sub, data);
      return c.json({
        public_slug: slug,
        public_url: `${APP_DOMAIN}/p/${slug}`,
        is_public: true,
      });
    } catch (err) {
      return petErrorResponse(c, err);
    }
  }
);

// POST /pets/:id/public/disable
petsRoute.post("/:id{[0-9]+}/public/disable", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await disablePublicProfile(petId, session.sub);
    return c.json({ ok: true, is_public: false });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// PATCH /pets/:id/public — update bio + quote
petsRoute.patch(
  "/:id{[0-9]+}/public",
  zValidator("json", PublicUpdateSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    try {
      const updated = await updatePublicProfile(petId, session.sub, data);
      return c.json({
        public_bio: (updated as any).public_bio || null,
        public_quote: (updated as any).public_quote || null,
      });
    } catch (err) {
      return petErrorResponse(c, err);
    }
  }
);

// ============================================================
// FOSTER L3 — owner đọc/ghi foster_status + adoption_story.
// (Toggle foster_public dùng /public/enable + /public/disable đã có ở L1.)
// ============================================================
const fosterSel = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v ?? null);

// GET /pets/:id/foster — owner đọc state foster (init form khu foster ở pet detail)
petsRoute.get("/:id{[0-9]+}/foster", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = (await getOwnedPet(petId, session.sub)) as any;
    return c.json({
      foster_public: pet.foster_public === true,
      foster_status: fosterSel(pet.foster_status),
      adoption_story: pet.adoption_story ?? null,
      public_slug: pet.public_slug ?? null,
      public_url: pet.public_slug ? `${APP_DOMAIN}/p/${pet.public_slug}` : null,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// PATCH /pets/:id/foster — owner lưu foster_status + adoption_story (tái dùng patchPet)
petsRoute.patch(
  "/:id{[0-9]+}/foster",
  zValidator("json", FosterUpdateSchema),
  async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    try {
      await getOwnedPet(petId, session.sub); // ownership check
      const update: Record<string, unknown> = {};
      if (data.foster_status !== undefined) update.foster_status = data.foster_status || null;
      if (data.adoption_story !== undefined) update.adoption_story = data.adoption_story || null;
      const updated = (await patchPet(petId, update)) as any;
      return c.json({
        foster_status: fosterSel(updated.foster_status),
        adoption_story: updated.adoption_story ?? null,
      });
    } catch (err) {
      return petErrorResponse(c, err);
    }
  }
);

// ===== POST /pets/:id/reclaim-request — chủ CŨ gửi yêu cầu lấy lại bé đã trao (Hướng B) =====
// Không phải chủ hiện tại → dùng getRow (không getOwnedPet). Guard 72h + đúng người trao ở lib.
petsRoute.post("/:id{[0-9]+}/reclaim-request", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const flat = (v: any) => (v && typeof v === "object" && "value" in v ? String(v.value) : v == null ? "" : String(v));
  try {
    const pet: any = await getRow<any>("pets", petId).catch(() => null);
    if (!pet) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy bé" } }, 404);
    const user: any = await findUserById(session.sub);
    const result = await createReclaimRequest({
      petId,
      petName: flat(pet.name),
      passportCode: flat(pet.qr_code),
      requesterId: session.sub,
      requesterName: flat(user?.name),
    });
    if (!result.ok) return c.json({ error: { code: "CANNOT_REQUEST", message: result.reason } }, 409);
    return c.json(result);
  } catch (err) {
    console.error("[pets/reclaim-request] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi server" } }, 500);
  }
});

// ===== POST /pets/:id/transfer — chuyển giao bé A→B (foster handover, IRREVERSIBLE) =====
// Body: { recipient } — SĐT HOẶC email người nhận (giữ tương thích recipient_phone cũ).
// Người nhận PHẢI có tài khoản VowVet. Chỉ CHỦ hiện tại mới trao được bé mình.
// Logic trao ở service transferPet (route chỉ tìm người nhận + validate + gọi).
petsRoute.post("/:id{[0-9]+}/transfer", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  // Người nhận: field "recipient" (SĐT hoặc email); fallback "recipient_phone" (tương thích cũ).
  const raw = String(body?.recipient ?? body?.recipient_phone ?? "").trim();
  const isEmail = raw.includes("@");
  let phone = "";
  if (isEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return c.json({ error: { code: "BAD_RECIPIENT", message: "Nhập SĐT hoặc email hợp lệ" } }, 400);
    }
  } else {
    try { phone = normalizePhone(raw); }
    catch { return c.json({ error: { code: "BAD_RECIPIENT", message: "Nhập SĐT hoặc email hợp lệ" } }, 400); }
  }

  try {
    await getOwnedPet(petId, session.sub); // chỉ chủ mới trao bé mình (throws 403/404)
    const recipient = isEmail
      ? await findUserByEmail(raw.toLowerCase())
      : await findUserByPhone(phone);
    if (!recipient) {
      return c.json({ error: { code: "RECIPIENT_NOT_FOUND", message: "Người nhận chưa có tài khoản VowVet" } }, 404);
    }
    const result = await transferPet(petId, session.sub, recipient.id);
    return c.json(result);
  } catch (err) {
    if (err instanceof TransferError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 403 | 404 | 500);
    }
    return petErrorResponse(c, err);
  }
});

// ===== Foster carer flag (cấp USER) — cờ TỰ NGUYỆN "tôi nhận nuôi tạm" =====
// is_foster_carer tách HẲN thành tích trao bé (foster_acts_count/foster_badge_tier):
// bật/tắt cờ KHÔNG gọi recordFosterAct, KHÔNG cộng điểm — chỉ đánh dấu user
// sẵn sàng nhận nuôi tạm. Route tĩnh "/foster/..." không đụng "/:id{[0-9]+}".

// GET: đọc cờ của 1 user (profile dùng cho badge read-only người khác + state ban đầu của chính mình).
petsRoute.get("/foster/carer/:userId{[0-9]+}", async (c) => {
  const userId = Number(c.req.param("userId"));
  try {
    const u = await getRow("users", userId);
    return c.json({ is_foster_carer: (u as any)?.is_foster_carer === true });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// POST: chính chủ bật/tắt cờ của mình.
petsRoute.post("/foster/toggle", async (c) => {
  const session = c.get("user");
  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body JSON không hợp lệ" } }, 400);
  }
  if (typeof body?.enabled !== "boolean") {
    return c.json({ error: { code: "BAD_ENABLED", message: "Trường enabled phải là boolean" } }, 400);
  }
  try {
    await updateRow("users", session.sub, { is_foster_carer: body.enabled });
    return c.json({ ok: true, is_foster_carer: body.enabled });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== POST /pets/:id/photo — upload to R2 =====
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

petsRoute.post("/:id{[0-9]+}/photo", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err) {
    return petErrorResponse(c, err);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400);
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return c.json({ error: { code: "MISSING_PHOTO", message: "Thiếu file ảnh (field 'photo')" } }, 400);
  }
  if (photo.size > MAX_PHOTO_SIZE) {
    return c.json(
      { error: { code: "FILE_TOO_LARGE", message: "Ảnh quá 5MB. Vui lòng nén lại." } },
      413
    );
  }
  const ext = imageExtFromMime(photo.type);
  if (!ext) {
    return c.json(
      {
        error: {
          code: "BAD_MIME",
          message: "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP",
        },
      },
      415
    );
  }

  try {
    const buffer = new Uint8Array(await photo.arrayBuffer());
    const key = `pets/${session.sub}/${petId}/${Date.now()}.${ext}`;
    const publicUrl = await uploadObject(key, buffer, photo.type);
    const updated = await patchPet(petId, { photo_url: publicUrl });
    return c.json({ photo_url: publicUrl, pet: toApiPet(updated) });
  } catch (err) {
    console.error("[pets/photo] upload failed:", err);
    return c.json({ error: { code: "UPLOAD_FAILED", message: "Upload ảnh thất bại" } }, 500);
  }
});

// ===== POST /pets/:id/qr — generate QR passport =====
petsRoute.post("/:id{[0-9]+}/qr", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
    const code = await generateUniqueQrCode();
    const updated = await patchPet(petId, { qr_code: code });
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    return c.json({
      qr_code: code,
      public_url: `${appUrl}/p/${code}`,
      pet: toApiPet(updated),
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// =========================================================
// M4: CHECK-IN ENDPOINTS
// =========================================================

// Helper: Baserow check-in row → API shape (UI dùng)
function toApiCheckIn(row: BaserowCheckIn) {
  const stool = typeof row.stool_quality === "object" ? row.stool_quality?.value : row.stool_quality;
  let symptoms: string[] = [];
  if (Array.isArray(row.symptoms)) {
    symptoms = row.symptoms.map((s: any) => (typeof s === "object" ? s.value : s));
  }
  return {
    id: row.id,
    check_date: row.check_date,
    appetite: row.appetite,
    energy: row.energy,
    stool_quality: stool || null,
    water_ml: row.water_ml,
    photo_url: row.photo_url || null,
    notes: row.notes,
    symptoms,
    created_at: row.created_at || null,
  };
}

// Helper: pet → PetForPrompt (engine input). Extract M3.5 profile fields nếu có.
function toPetForPrompt(pet: BaserowPet): PetForPrompt {
  const speciesValue = typeof pet.species === "object" ? pet.species?.value : pet.species;
  const p = pet as any;
  const extractArrayValues = (v: any): string[] | null => {
    if (!Array.isArray(v)) return null;
    return v.map((x: any) => (typeof x === "object" ? x.value : x));
  };
  const extractNum = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  // M7: single_select fields trả về object {id, value} or string
  const extractSelect = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "object" && "value" in v) return v.value;
    return typeof v === "string" ? v : null;
  };
  return {
    id: pet.id,
    name: pet.name,
    species: (speciesValue as string) || "other",
    breed: pet.breed ?? null,
    dob: pet.dob ?? null,
    weight_kg: pet.weight_kg ?? null,
    // M3.5 profile fields
    personality_archetype: extractArrayValues(p.personality_archetype),
    energy_level: extractNum(p.energy_level),
    noise_sensitivity: extractNum(p.noise_sensitivity),
    trainability: extractNum(p.trainability),
    separation_anxiety: extractNum(p.separation_anxiety),
    fears: extractArrayValues(p.fears),
    diet_type: extractArrayValues(p.diet_type),
    diet_brand_primary: p.diet_brand_primary || null,
    special_notes_for_vet: p.special_notes_for_vet || null,
    // M7 nutrition fields
    daily_calorie_target: extractNum(p.daily_calorie_target),
    life_stage: extractSelect(p.life_stage),
    activity_level: extractSelect(p.activity_level),
    body_condition_score: extractNum(p.body_condition_score),
    target_weight_kg: extractNum(p.target_weight_kg),
  };
}

const checkInSchema = z.object({
  appetite: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  stool_quality: z.enum(["normal", "soft", "liquid", "hard", "none"]).nullable().optional(),
  water_ml: z.number().nonnegative().max(10000).nullable().optional(),
  symptoms: z.array(z.string()).max(10).optional().default([]),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * Background: gọi AI sinh care plan + lưu Baserow.
 * Caller setProcessing trước, function này tự clearProcessing khi xong.
 */
async function backgroundGenerateCarePlan(
  petBaserow: BaserowPet,
  checkInData: CheckInForPrompt,
  userId: number
): Promise<void> {
  const petPrompt = toPetForPrompt(petBaserow);
  try {
    await generateAndSaveCarePlan(petPrompt, checkInData, userId);
  } catch (err) {
    console.error(`[care-plan] generate failed for pet ${petBaserow.id}:`, err);
  } finally {
    clearProcessing(petBaserow.id);
  }
}

// ===== POST /pets/:id/check-in — create/update + trigger AI background =====
petsRoute.post("/:id{[0-9]+}/check-in", zValidator("json", checkInSchema), async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const data = c.req.valid("json");

  let pet: BaserowPet;
  try {
    pet = await getOwnedPet(petId, session.sub);
  } catch (err) {
    return petErrorResponse(c, err);
  }

  // Filter symptoms về list valid (skip invalid)
  const validSymptoms = (data.symptoms || []).filter(isValidSymptomEn);

  try {
    const { row, wasUpdate } = await upsertCheckIn(petId, {
      appetite: data.appetite,
      energy: data.energy,
      stool_quality: data.stool_quality || null,
      water_ml: data.water_ml ?? null,
      symptoms: validSymptoms,
      notes: data.notes ?? null,
    });

    // Trigger AI background — return ngay với status processing
    const checkInForPrompt: CheckInForPrompt = {
      appetite: data.appetite,
      energy: data.energy,
      stool_quality: data.stool_quality || null,
      water_ml: data.water_ml ?? null,
      symptoms: validSymptoms,
      notes: data.notes ?? null,
      photo_url: row.photo_url || null,
    };
    setProcessing(petId);
    // M4.1: invalidate v2 cache khi check-in mới — context (appetite/energy/symptoms) thay đổi
    invalidateCarePlanV2(petId);
    // M14.2: check-in streak signal thay đổi → invalidate score
    invalidatePetScore(petId);
    queueMicrotask(() => backgroundGenerateCarePlan(pet, checkInForPrompt, session.sub));

    // Hook: achievement check (streak_7/30/100/365 + midnight_warrior)
    let newAchievements: any[] = [];
    let completedQuests: any[] = [];
    try {
      const { checkAndUnlockAchievements } = await import("../lib/achievements.ts");
      newAchievements = await checkAndUnlockAchievements({
        userId: session.sub, petId, trigger: "checkin_done",
      });
    } catch (err) {
      console.error("[check-in] achievement check failed:", err);
    }
    try {
      const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
      completedQuests = await trackQuestTrigger(session.sub, petId, "checkin");
    } catch (err) {
      console.error("[check-in] quest track failed:", err);
    }

    return c.json(
      {
        check_in_id: row.id,
        status: "processing",
        was_update: wasUpdate,
        new_achievements: newAchievements,
        completed_quests: completedQuests,
      },
      202
    );
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== GET /pets/:id/check-in/today =====
petsRoute.get("/:id{[0-9]+}/check-in/today", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const row = await findTodayCheckIn(petId);
    if (!row) return c.json({ check_in: null });
    return c.json({ check_in: toApiCheckIn(row) });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== GET /pets/:id/check-ins/history?days=30 =====
petsRoute.get("/:id{[0-9]+}/check-ins/history", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const days = Math.min(90, Math.max(1, Number(c.req.query("days") || 30)));
  try {
    await getOwnedPet(petId, session.sub);
    const rows = await listCheckInsHistory(petId, days);
    const plans = await listRecentCarePlans(petId, days);
    const planByDate = new Map<string, BaserowCarePlan>();
    for (const p of plans) {
      if (p.plan_date) planByDate.set(p.plan_date, p);
    }
    const history = rows.map((row) => {
      const p = planByDate.get(row.check_date);
      const parsed = p ? parsePlanJson(p) : null;
      return {
        ...toApiCheckIn(row),
        plan: parsed
          ? {
              urgency_level: parsed.urgency_level,
              summary: parsed.summary,
              alerts: parsed.alerts,
            }
          : null,
      };
    });
    return c.json({ history });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== POST /pets/:id/check-in/photo — upload to R2, attach to today's check-in =====
const MAX_PHOTO_SIZE_CHECKIN = 5 * 1024 * 1024;

petsRoute.post("/:id{[0-9]+}/check-in/photo", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err) {
    return petErrorResponse(c, err);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400);
  }
  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return c.json({ error: { code: "MISSING_PHOTO", message: "Thiếu file ảnh" } }, 400);
  }
  if (photo.size > MAX_PHOTO_SIZE_CHECKIN) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Ảnh quá 5MB" } }, 413);
  }
  const ext = imageExtFromMime(photo.type);
  if (!ext) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ JPEG/PNG/WebP" } }, 415);
  }

  try {
    const date = todayIso();
    const key = `checkins/${session.sub}/${petId}/${date}/${Date.now()}.${ext}`;
    const buffer = new Uint8Array(await photo.arrayBuffer());
    const url = await uploadObject(key, buffer, photo.type);

    // Attach to today's check-in (upsert sẽ create empty nếu chưa có)
    const existing = await findTodayCheckIn(petId);
    if (existing) {
      await upsertCheckIn(petId, { photo_url: url });
    } else {
      // Chưa có check-in → tạo skeleton với photo
      await upsertCheckIn(petId, { photo_url: url, appetite: null as any, energy: null as any });
    }
    return c.json({ photo_url: url });
  } catch (err) {
    console.error("[check-in/photo] upload failed:", err);
    return c.json({ error: { code: "UPLOAD_FAILED", message: "Upload thất bại" } }, 500);
  }
});

// =========================================================
// M4: CARE PLAN ENDPOINTS
// =========================================================

// Helper: care plan row → API shape
function toApiCarePlan(row: BaserowCarePlan, processing = false) {
  const plan = parsePlanJson(row);
  const meta = parseMetadata(row);
  // user_feedback là single_select → extract .value nếu object
  const feedback = typeof row.user_feedback === "object" ? (row.user_feedback as any)?.value : row.user_feedback;
  return {
    id: row.id,
    plan_date: row.plan_date,
    plan, // CarePlanContentType | null
    metadata: meta
      ? {
          model: meta.model,
          weather: meta.weather,
          escalation_reason: meta.escalation_reason || null,
          generated_at: meta.generated_at,
        }
      : null,
    user_feedback: feedback || null,
    processing,
  };
}

// ===== GET /pets/:id/care-plan/today =====
petsRoute.get("/:id{[0-9]+}/care-plan/today", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);

    const checkIn = await findTodayCheckIn(petId);
    if (!checkIn) {
      return c.json({ status: "no_checkin", care_plan: null });
    }

    const row = await findTodayCarePlan(petId);
    const processing = isProcessing(petId);
    if (!row) {
      return c.json({
        status: processing ? "processing" : "no_plan",
        care_plan: null,
        refresh: checkRefreshLimit(petId),
      });
    }
    return c.json({
      status: processing ? "processing" : "fresh",
      care_plan: toApiCarePlan(row, processing),
      refresh: checkRefreshLimit(petId),
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== POST /pets/:id/care-plan/refresh — force regenerate (3/day) =====
petsRoute.post("/:id{[0-9]+}/care-plan/refresh", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    const pet = await getOwnedPet(petId, session.sub);

    const checkIn = await findTodayCheckIn(petId);
    if (!checkIn) {
      return c.json(
        { error: { code: "NO_CHECKIN", message: "Vui lòng check-in cho bé trước khi refresh" } },
        400
      );
    }

    const limit = checkRefreshLimit(petId);
    if (!limit.ok) {
      return c.json(
        {
          error: {
            code: "REFRESH_LIMIT",
            message: `Đã refresh tối đa ${limit.used} lần hôm nay. Thử lại ngày mai.`,
          },
        },
        429
      );
    }

    bumpRefreshCount(petId);

    // Trigger AI background
    const checkInForPrompt: CheckInForPrompt = {
      appetite: checkIn.appetite || 3,
      energy: checkIn.energy || 3,
      stool_quality:
        (typeof checkIn.stool_quality === "object" ? checkIn.stool_quality?.value : checkIn.stool_quality) || null,
      water_ml: checkIn.water_ml ?? null,
      symptoms: Array.isArray(checkIn.symptoms)
        ? checkIn.symptoms.map((s: any) => (typeof s === "object" ? s.value : s))
        : [],
      notes: checkIn.notes || null,
      photo_url: checkIn.photo_url || null,
    };
    setProcessing(petId);
    queueMicrotask(() => backgroundGenerateCarePlan(pet, checkInForPrompt, session.sub));

    return c.json({ status: "processing", refresh: checkRefreshLimit(petId) }, 202);
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ============================================================
// M4.1: Care Plan v2 endpoints (7-section format + festival + breed + cache)
// ============================================================

// GET /pets/:id/care-plan/v2 — cache-or-generate
petsRoute.get("/:id{[0-9]+}/care-plan/v2", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const citySlug = c.req.query("city") || "ho_chi_minh";
  try {
    const plan = await generateCarePlanV2(petId, session.sub, { city_slug: citySlug });
    return c.json({ plan });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[care-plan-v2/GET] error:", err);
    return c.json(
      { error: { code: "CARE_PLAN_V2_FAIL", message: err?.message || "Lỗi sinh care plan v2" } },
      500
    );
  }
});

// POST /pets/:id/care-plan/v2/refresh — force regen (invalidate cache)
petsRoute.post("/:id{[0-9]+}/care-plan/v2/refresh", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const citySlug = c.req.query("city") || "ho_chi_minh";
  try {
    invalidateCarePlanV2(petId);
    const plan = await generateCarePlanV2(petId, session.sub, {
      force_refresh: true,
      city_slug: citySlug,
    });
    return c.json({ plan, refreshed: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[care-plan-v2/refresh] error:", err);
    return c.json(
      { error: { code: "CARE_PLAN_V2_FAIL", message: err?.message || "Lỗi refresh" } },
      500
    );
  }
});

// GET /pets/:id/care-plan/v2/preview — cached only, không trigger gen (dashboard snippet)
petsRoute.get("/:id{[0-9]+}/care-plan/v2/preview", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const cached = getCachedCarePlanV2(petId);
    if (!cached) return c.json({ has_cache: false, plan: null });
    return c.json({ has_cache: true, plan: cached });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== POST /pets/:id/care-plan/feedback =====
// Baserow schema dùng "not_helpful" (underscore). Frontend cũng dùng "not_helpful".
const feedbackSchema = z.object({
  feedback: z.enum(["helpful", "not_helpful"]).nullable(),
});
petsRoute.post("/:id{[0-9]+}/care-plan/feedback", zValidator("json", feedbackSchema), async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const { feedback } = c.req.valid("json");
  try {
    await getOwnedPet(petId, session.sub);
    const row = await findTodayCarePlan(petId);
    if (!row) {
      return c.json({ error: { code: "NO_PLAN", message: "Chưa có care plan hôm nay" } }, 404);
    }
    await setFeedback(row.id, feedback);
    return c.json({ success: true, feedback });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// =========================================================
// CARE PLAN COMPLETIONS (Phase 2 of Care Plan WOW)
// Each meal/exercise/water item user marks "Đã làm" → row in care_plan_completions.
//   - Pet Score +5 per item
//   - Trifecta bonus +30 when all today's items completed
//   - Auto-fires Daily Quest trigger (log_meal / routine_complete / check_water / view_pet_score)
// =========================================================

const todayVNDate = (): string => {
  // VN timezone = UTC+7. Match care-planner-v2's todayVN() pattern (date-only).
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

// Map item_key prefix → item_type + quest trigger to auto-fire
function classifyCarePlanItem(itemKey: string): { type: string; questTrigger: string | null } {
  if (itemKey.startsWith("feeding_"))    return { type: "feeding",    questTrigger: "log_meal" };
  if (itemKey.startsWith("exercise_"))   return { type: "exercise",   questTrigger: "routine_complete" };
  if (itemKey.startsWith("water_"))      return { type: "water",      questTrigger: "check_water" };
  if (itemKey.startsWith("training_"))   return { type: "training",   questTrigger: "routine_complete" };
  if (itemKey.startsWith("monitor_"))    return { type: "monitoring", questTrigger: "view_pet_score" };
  return { type: "other", questTrigger: null };
}

// POST /pets/:id/care-plan/items/:itemKey/complete
petsRoute.post("/:id{[0-9]+}/care-plan/items/:itemKey/complete", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const itemKey = c.req.param("itemKey");
  const today = todayVNDate();

  try {
    await getOwnedPet(petId, session.sub);

    // Idempotent: if user already completed this item today, return existing row
    const existingRes = await listRows<any>("care_plan_completions", {
      filter: {
        user_id__equal: String(session.sub),
        pet_id__link_row_has: String(petId),
        care_plan_date__equal: today,
        item_key__equal: itemKey,
      },
      size: 1,
    });
    if (existingRes.results.length > 0) {
      return c.json({
        already_completed: true,
        completion: existingRes.results[0],
        pet_score_bonus: 0,
        quest_completed: null,
        all_complete_bonus: false,
        all_complete_bonus_amount: 0,
      });
    }

    // Create completion row
    const { type, questTrigger } = classifyCarePlanItem(itemKey);
    const nowIso = new Date().toISOString();
    const completion = await createRow<any>("care_plan_completions", {
      user_id: session.sub,
      pet_id: [petId],
      care_plan_date: today,
      item_key: itemKey,
      item_type: type,
      completed_at: nowIso,
      created_at: nowIso,
    });

    // Pet Score +5 per item — bump users.pet_score_bonus accumulator
    const PER_ITEM_BONUS = 5;
    try {
      const { findUserById } = await import("../lib/users.ts");
      const user: any = await findUserById(session.sub);
      if (user) {
        const newBonus = (Number(user.pet_score_bonus) || 0) + PER_ITEM_BONUS;
        await updateRow("users", session.sub, { pet_score_bonus: newBonus });
        invalidatePetScore(petId);
      }
    } catch (err) {
      console.error("[care-plan/complete] bonus failed:", err);
    }

    // Auto-fire Daily Quest trigger (if mapped)
    let questCompleted: any = null;
    if (questTrigger) {
      try {
        const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
        const completed = await trackQuestTrigger(session.sub, petId, questTrigger as any);
        questCompleted = Array.isArray(completed) ? completed[0] || null : null;
      } catch (err) {
        console.error("[care-plan/complete] quest trigger failed:", err);
      }
    }

    // Trifecta detection: re-count completions for today; if all expected items
    // covered for the day, grant +30 bonus + push notification (once per day).
    // "All" = at least 1 feeding + 1 exercise + 1 monitoring item (loose definition;
    // real care-plan generates multiple feeding slots so this triggers on ~4-6 completions).
    const TRIFECTA_BONUS = 30;
    let allCompleteBonus = false;
    let allCompleteBonusAmount = 0;
    try {
      const todayCompletionsRes = await listRows<any>("care_plan_completions", {
        filter: {
          user_id__equal: String(session.sub),
          pet_id__link_row_has: String(petId),
          care_plan_date__equal: today,
        },
        size: 50,
      });
      const types = new Set(
        todayCompletionsRes.results.map((r) =>
          typeof r.item_type === "object" ? r.item_type?.value : r.item_type
        )
      );
      // Trifecta = covered feeding + exercise + monitoring at least once
      const TRIFECTA_TYPES = ["feeding", "exercise", "monitoring"] as const;
      const hasAll = TRIFECTA_TYPES.every((t) => types.has(t));

      // Check if Trifecta already granted today (sentinel = "_trifecta_granted")
      const trifectaSentinel = todayCompletionsRes.results.find(
        (r) => r.item_key === "_trifecta_granted"
      );

      if (hasAll && !trifectaSentinel) {
        // Grant Trifecta bonus
        try {
          const { findUserById } = await import("../lib/users.ts");
          const user: any = await findUserById(session.sub);
          if (user) {
            const newBonus = (Number(user.pet_score_bonus) || 0) + TRIFECTA_BONUS;
            await updateRow("users", session.sub, { pet_score_bonus: newBonus });
            invalidatePetScore(petId);
          }
          // Write sentinel row so we don't grant again today
          await createRow("care_plan_completions", {
            user_id: session.sub,
            pet_id: [petId],
            care_plan_date: today,
            item_key: "_trifecta_granted",
            item_type: "other",
            completed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            notes: `Care Plan Trifecta +${TRIFECTA_BONUS}đ`,
          });
          allCompleteBonus = true;
          allCompleteBonusAmount = TRIFECTA_BONUS;
        } catch (err) {
          console.error("[care-plan/complete] trifecta grant failed:", err);
        }
      }
    } catch (err) {
      console.error("[care-plan/complete] trifecta check failed:", err);
    }

    return c.json({
      success: true,
      completion,
      pet_score_bonus: PER_ITEM_BONUS,
      quest_completed: questCompleted,
      all_complete_bonus: allCompleteBonus,
      all_complete_bonus_amount: allCompleteBonusAmount,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// GET /pets/:id/care-plan/completions/today — list completed item_keys for today
petsRoute.get("/:id{[0-9]+}/care-plan/completions/today", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const today = todayVNDate();
  try {
    await getOwnedPet(petId, session.sub);
    const res = await listRows<any>("care_plan_completions", {
      filter: {
        user_id__equal: String(session.sub),
        pet_id__link_row_has: String(petId),
        care_plan_date__equal: today,
      },
      size: 50,
    });
    // Exclude the sentinel row from the visible list
    const completedKeys = res.results
      .filter((r) => r.item_key && r.item_key !== "_trifecta_granted")
      .map((r) => r.item_key as string);
    const trifectaGranted = res.results.some((r) => r.item_key === "_trifecta_granted");
    return c.json({
      date: today,
      completed_keys: completedKeys,
      count: completedKeys.length,
      trifecta_granted: trifectaGranted,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// GET /pets/:id/care-plan/completions/summary?days=N — for dashboard widget
// Returns just today's count + total expected (best-effort).
petsRoute.get("/:id{[0-9]+}/care-plan/completions/summary", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const today = todayVNDate();
  try {
    await getOwnedPet(petId, session.sub);
    const res = await listRows<any>("care_plan_completions", {
      filter: {
        user_id__equal: String(session.sub),
        pet_id__link_row_has: String(petId),
        care_plan_date__equal: today,
      },
      size: 50,
    });
    const completedKeys = res.results
      .filter((r) => r.item_key && r.item_key !== "_trifecta_granted")
      .map((r) => r.item_key as string);
    const trifectaGranted = res.results.some((r) => r.item_key === "_trifecta_granted");
    return c.json({
      date: today,
      completed_count: completedKeys.length,
      trifecta_granted: trifectaGranted,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// =========================================================
// CARE PLAN — EXERCISE TRACKING (Smart Tracking pass #1)
// User logs an exercise session with richer data than a checkbox:
//   - actual_duration_min (vs planned)
//   - engagement (lazy / normal / eager)
//   - symptoms[] (none / tired_fast / breathing_hard / limping / reluctant / cough)
//   - notes (free text)
// Writes pet_exercise_logs AND care_plan_completions so the progress bar +
// Trifecta detection in /care-plan keep working. Pet Score: +5 quick, +10
// when detail (notes OR non-default symptoms). Returns warning when symptoms
// include limping/breathing_hard/cough so the UI can nudge user to vet.
// =========================================================

const exerciseLogSchema = z.object({
  item_key: z.string().min(1).max(64),
  planned_time: z.string().max(8).optional().default(""),
  planned_duration_min: z.number().int().min(0).max(600).optional().default(0),
  actual_duration_min: z.number().int().min(0).max(600),
  engagement: z.enum(["lazy", "normal", "eager"]).optional().default("normal"),
  symptoms: z.array(z.enum(["none", "tired_fast", "breathing_hard", "limping", "reluctant", "cough"]))
    .optional()
    .default(["none"]),
  notes: z.string().max(2000).optional().default(""),
});

const SYMPTOMS_WARN = new Set(["breathing_hard", "limping", "cough"]);

petsRoute.post("/:id{[0-9]+}/care-plan/exercise-log", zValidator("json", exerciseLogSchema), async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const today = todayVNDate();
  const nowIso = new Date().toISOString();

  try {
    await getOwnedPet(petId, session.sub);

    // Compute bonus + warning before any DB write.
    const hasMeaningfulSymptom = input.symptoms.some((s) => s !== "none");
    const isDetailed = Boolean(input.notes.trim()) || hasMeaningfulSymptom;
    const bonus = isDetailed ? 10 : 5;
    const warnSymptoms = input.symptoms.filter((s) => SYMPTOMS_WARN.has(s));
    const warning = warnSymptoms.length > 0
      ? `Triệu chứng đáng chú ý (${warnSymptoms.join(", ")}) — cân nhắc hỏi BSTY.`
      : null;

    // 1. Write the rich exercise log row.
    const log = await createRow<any>("pet_exercise_logs", {
      pet_id: [petId],
      user_id: session.sub,
      log_date: today,
      planned_time: input.planned_time,
      planned_duration_min: input.planned_duration_min,
      actual_duration_min: input.actual_duration_min,
      engagement: input.engagement,
      symptoms: input.symptoms,
      notes: input.notes,
      item_key: input.item_key,
      created_at: nowIso,
    });

    // 2. Mirror to care_plan_completions (idempotent — skip if already there).
    let alreadyMarked = false;
    try {
      const existing = await listRows<any>("care_plan_completions", {
        filter: {
          user_id__equal: String(session.sub),
          pet_id__link_row_has: String(petId),
          care_plan_date__equal: today,
          item_key__equal: input.item_key,
        },
        size: 1,
      });
      alreadyMarked = existing.results.length > 0;
      if (!alreadyMarked) {
        await createRow("care_plan_completions", {
          user_id: session.sub,
          pet_id: [petId],
          care_plan_date: today,
          item_key: input.item_key,
          item_type: "exercise",
          completed_at: nowIso,
          notes: input.notes || `${input.actual_duration_min}p · ${input.engagement}`,
          created_at: nowIso,
        });
      }
    } catch (err) {
      console.warn("[exercise-log] completion mirror failed (non-fatal):", err);
    }

    // 3. Pet Score bonus. Only credit the first time today (don't double-pay
    //    when user logs the same exercise slot twice).
    let petScoreBonus = 0;
    if (!alreadyMarked) {
      try {
        const { findUserById } = await import("../lib/users.ts");
        const user: any = await findUserById(session.sub);
        if (user) {
          const newBonus = (Number(user.pet_score_bonus) || 0) + bonus;
          await updateRow("users", session.sub, { pet_score_bonus: newBonus });
          invalidatePetScore(petId);
          petScoreBonus = bonus;
        }
      } catch (err) {
        console.error("[exercise-log] pet score bonus failed:", err);
      }
    }

    // 4. Quest trigger — same one the plain checkbox endpoint fires.
    let questCompleted: any = null;
    if (!alreadyMarked) {
      try {
        const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
        const completed = await trackQuestTrigger(session.sub, petId, "routine_complete" as any);
        questCompleted = Array.isArray(completed) ? completed[0] || null : null;
      } catch (err) {
        console.error("[exercise-log] quest trigger failed:", err);
      }
    }

    return c.json({
      success: true,
      log,
      already_marked: alreadyMarked,
      pet_score_bonus: petScoreBonus,
      quest_completed: questCompleted,
      warning,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// =========================================================
// CARE PLAN — WATER TRACKING (Smart Tracking pass #2)
// Clone of exercise-log shape, different data + warning rule:
//   - amount_ml (vs target_ml from AI care plan recommendation)
//   - frequency (little / normal / much / unknown)
//   - notes (free text)
// Writes pet_water_logs + mirrors to care_plan_completions (item_type=water).
// Pet Score: +5 quick, +10 detailed (notes OR frequency != "normal").
// Warning: amount_ml < 0.6 * target_ml ("uống ít — tăng cường nước").
// Trifecta currently only requires feeding+exercise+monitoring, so water
// doesn't gate the +30đ — but logging still earns the per-item bonus.
// =========================================================

const waterLogSchema = z.object({
  item_key: z.string().min(1).max(64).optional().default("water_main"),
  amount_ml: z.number().int().min(0).max(5000),
  target_ml: z.number().int().min(0).max(5000).optional().default(0),
  frequency: z.enum(["little", "normal", "much", "unknown"]).optional().default("normal"),
  notes: z.string().max(2000).optional().default(""),
});

petsRoute.post("/:id{[0-9]+}/care-plan/water-log", zValidator("json", waterLogSchema), async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const today = todayVNDate();
  const nowIso = new Date().toISOString();

  try {
    await getOwnedPet(petId, session.sub);

    // Pre-compute bonus + warning before any DB write.
    const isDetailed = Boolean(input.notes.trim()) || input.frequency !== "normal";
    const bonus = isDetailed ? 10 : 5;
    const ratio = input.target_ml > 0 ? input.amount_ml / input.target_ml : 1;
    const warning = (input.target_ml > 0 && ratio < 0.6)
      ? `Mới uống ${input.amount_ml}ml / mục tiêu ${input.target_ml}ml (${Math.round(ratio * 100)}%) — khuyến khích bé uống thêm.`
      : input.frequency === "little"
        ? `Bé uống ít — kiểm tra nước có sạch và mát chưa, hoặc thử thêm đá viên/bowl mới.`
        : null;

    // 1. Write the rich water log row.
    const log = await createRow<any>("pet_water_logs", {
      pet_id: [petId],
      user_id: session.sub,
      log_date: today,
      amount_ml: input.amount_ml,
      target_ml: input.target_ml,
      frequency: input.frequency,
      notes: input.notes,
      item_key: input.item_key,
      created_at: nowIso,
    });

    // 2. Mirror to care_plan_completions (idempotent — skip if already there).
    //    item_type "water" maps to quest trigger "check_water" via classifyCarePlanItem.
    let alreadyMarked = false;
    try {
      const existing = await listRows<any>("care_plan_completions", {
        filter: {
          user_id__equal: String(session.sub),
          pet_id__link_row_has: String(petId),
          care_plan_date__equal: today,
          item_key__equal: input.item_key,
        },
        size: 1,
      });
      alreadyMarked = existing.results.length > 0;
      if (!alreadyMarked) {
        await createRow("care_plan_completions", {
          user_id: session.sub,
          pet_id: [petId],
          care_plan_date: today,
          item_key: input.item_key,
          item_type: "water",
          completed_at: nowIso,
          notes: input.notes || `${input.amount_ml}ml · ${input.frequency}`,
          created_at: nowIso,
        });
      }
    } catch (err) {
      console.warn("[water-log] completion mirror failed (non-fatal):", err);
    }

    // 3. Pet Score bonus — first-time-today only (idempotent on retry).
    let petScoreBonus = 0;
    if (!alreadyMarked) {
      try {
        const { findUserById } = await import("../lib/users.ts");
        const user: any = await findUserById(session.sub);
        if (user) {
          const newBonus = (Number(user.pet_score_bonus) || 0) + bonus;
          await updateRow("users", session.sub, { pet_score_bonus: newBonus });
          invalidatePetScore(petId);
          petScoreBonus = bonus;
        }
      } catch (err) {
        console.error("[water-log] pet score bonus failed:", err);
      }
    }

    // 4. Quest trigger — check_water (per classifyCarePlanItem mapping).
    let questCompleted: any = null;
    if (!alreadyMarked) {
      try {
        const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
        const completed = await trackQuestTrigger(session.sub, petId, "check_water" as any);
        questCompleted = Array.isArray(completed) ? completed[0] || null : null;
      } catch (err) {
        console.error("[water-log] quest trigger failed:", err);
      }
    }

    return c.json({
      success: true,
      log,
      already_marked: alreadyMarked,
      pet_score_bonus: petScoreBonus,
      quest_completed: questCompleted,
      target_percent: input.target_ml > 0 ? Math.round(ratio * 100) : null,
      warning,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// =========================================================
// M3.5: PROFILE SECTIONS
// =========================================================

// Identity section có 1 số field overlap với core (name, species, breed, gender, dob, weight_kg) —
// cần map VN → EN cho species/gender trước khi save Baserow.
function transformIdentityForBaserow(data: any): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  if (data.species !== undefined && data.species !== null) {
    out.species = speciesViToEn(data.species);
  }
  if (data.gender !== undefined) {
    out.gender = data.gender === null ? null : genderViToEn(data.gender);
  }
  return out;
}

// ===== POST /pets/:id/profile/section/:section_name =====
petsRoute.post("/:id{[0-9]+}/profile/section/:section_name", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const sectionName = c.req.param("section_name") as ProfileSectionName;

  const schema = SECTION_SCHEMAS[sectionName];
  if (!schema) {
    return c.json(
      {
        error: {
          code: "BAD_SECTION",
          message: `Section "${sectionName}" không hợp lệ. Hợp lệ: ${Object.keys(SECTION_SCHEMAS).join(", ")}`,
        },
      },
      400
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body không phải JSON hợp lệ" } }, 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION", issues: parsed.error.issues } }, 400);
  }

  try {
    await getOwnedPet(petId, session.sub);
    // Identity section: convert VN enums → EN trước khi save
    const dataToSave =
      sectionName === "identity" ? transformIdentityForBaserow(parsed.data) : parsed.data;
    await patchPet(petId, dataToSave as Record<string, unknown>);

    // Recalc completion sau khi save
    const completion = await recalcAndSave(petId);

    // M5: invalidate sensitivity cache nếu section ảnh hưởng đến score
    // (identity = breed/dob/weight; personality = fears/separation_anxiety)
    if (sectionName === "identity" || sectionName === "personality") {
      invalidateSensitivity(petId);
    }

    return c.json({
      success: true,
      section: sectionName,
      completion_pct: completion.pct,
      sections: completion.sections,
      badge: completion.badge,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== GET /pets/:id/profile — full pet row including all M3.5 fields =====
petsRoute.get("/:id{[0-9]+}/profile", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    // Trả raw row — frontend wizard cần all 50+ fields. Helper extract object values nếu single_select.
    const flat: Record<string, any> = {};
    for (const [k, v] of Object.entries(pet)) {
      if (v !== null && typeof v === "object" && "value" in (v as any) && !Array.isArray(v)) {
        flat[k] = (v as any).value;
      } else if (Array.isArray(v) && v.length && typeof v[0] === "object" && "value" in v[0]) {
        flat[k] = v.map((x: any) => x.value);
      } else {
        flat[k] = v;
      }
    }
    // Species/gender: convert EN → VN cho UI
    if (flat.species) flat.species = speciesEnToVi(flat.species);
    if (flat.gender) flat.gender = genderEnToVi(flat.gender);
    return c.json({ pet: flat });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== GET /pets/:id/climate-sensitivity (M5) =====
petsRoute.get("/:id{[0-9]+}/climate-sensitivity", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    const pet = await getOwnedPet(petId, session.sub);
    const p = pet as any;
    const speciesValue = typeof pet.species === "object" ? pet.species?.value : pet.species;
    const fearsValue = Array.isArray(p.fears)
      ? p.fears.map((f: any) => (typeof f === "object" ? f.value : f))
      : null;
    const result = getSensitivity(petId, {
      species: speciesValue as string,
      breed: pet.breed,
      dob: pet.dob,
      weight_kg: pet.weight_kg,
      fears: fearsValue,
      separation_anxiety: p.separation_anxiety,
    });
    return c.json(result);
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== GET /pets/:id/profile/completion =====
petsRoute.get("/:id{[0-9]+}/profile/completion", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const result = await computeCompletion(petId);
    return c.json({
      pct: result.pct,
      sections: result.sections,
      missing_required: result.missing_required,
      next_section_suggested: result.next_section_suggested,
      badge: result.badge,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// =========================================================
// M3.5: PHOTOS (pet_photos)
// =========================================================

function toApiPhoto(p: BaserowPhoto) {
  const type = typeof p.photo_type === "object" ? p.photo_type?.value : p.photo_type;
  return {
    id: p.id,
    photo_url: p.photo_url,
    photo_type: type,
    caption: p.caption || null,
    is_primary: p.is_primary === true,
    uploaded_at: p.uploaded_at || null,
  };
}

const MAX_PHOTO_SIZE_PROFILE = 5 * 1024 * 1024;

// ===== GET /pets/:id/photos =====
petsRoute.get("/:id{[0-9]+}/photos", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const photos = await listPetPhotos(petId);
    return c.json({ photos: photos.map(toApiPhoto) });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// ===== POST /pets/:id/photos =====
petsRoute.post("/:id{[0-9]+}/photos", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  try {
    await getOwnedPet(petId, session.sub);
  } catch (err) {
    return petErrorResponse(c, err);
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: { code: "BAD_FORM", message: "Form không hợp lệ" } }, 400);
  }
  const photo = formData.get("photo");
  const typeRaw = formData.get("type");
  const captionRaw = formData.get("caption");

  if (!(photo instanceof File)) {
    return c.json({ error: { code: "MISSING_PHOTO", message: "Thiếu file ảnh" } }, 400);
  }
  const typeParsed = PhotoTypeSchema.safeParse(typeRaw);
  if (!typeParsed.success) {
    return c.json(
      {
        error: {
          code: "BAD_TYPE",
          message: "Photo type không hợp lệ (face/profile/full_body/marks/eye_close_up/nose_print/general)",
        },
      },
      400
    );
  }
  const type: PhotoType = typeParsed.data;

  if (photo.size > MAX_PHOTO_SIZE_PROFILE) {
    return c.json({ error: { code: "FILE_TOO_LARGE", message: "Ảnh quá 5MB" } }, 413);
  }
  const ext = imageExtFromMime(photo.type);
  if (!ext) {
    return c.json({ error: { code: "BAD_MIME", message: "Chỉ JPEG/PNG/WebP" } }, 415);
  }

  try {
    const key = `pets/${session.sub}/${petId}/photos/${type}-${Date.now()}.${ext}`;
    const buffer = new Uint8Array(await photo.arrayBuffer());
    const url = await uploadObject(key, buffer, photo.type);
    const caption = typeof captionRaw === "string" ? captionRaw.slice(0, 200) : null;

    const created = await createPetPhoto(petId, type, url, caption);
    const completion = await recalcAndSave(petId);

    // Quest hook: real photo upload
    let completedQuests: any[] = [];
    try {
      const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
      completedQuests = await trackQuestTrigger(session.sub, petId, "upload_photo");
    } catch (err) {
      console.error("[pets/photos] quest track failed:", err);
    }

    return c.json({
      photo: toApiPhoto(created),
      completion_pct: completion.pct,
      completed_quests: completedQuests,
    });
  } catch (err: any) {
    if (err?.code === "GENERAL_LIMIT") {
      return c.json({ error: { code: "GENERAL_LIMIT", message: err.message } }, 400);
    }
    console.error("[pets/photos] upload failed:", err);
    return c.json({ error: { code: "UPLOAD_FAILED", message: "Upload thất bại" } }, 500);
  }
});

// ===== DELETE /pets/:id/photos/:photo_id =====
petsRoute.delete("/:id{[0-9]+}/photos/:photo_id{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const photoId = Number(c.req.param("photo_id"));

  try {
    await getOwnedPet(petId, session.sub);
    const photo = await getPhotoById(photoId);
    if (!photo) {
      return c.json({ error: { code: "PHOTO_NOT_FOUND", message: "Không tìm thấy ảnh" } }, 404);
    }
    if (!ownerIdsFromPhoto(photo).includes(petId)) {
      return c.json({ error: { code: "FORBIDDEN", message: "Ảnh không thuộc pet này" } }, 403);
    }
    await deletePetPhoto(photo);
    const completion = await recalcAndSave(petId);
    return c.json({ success: true, completion_pct: completion.pct });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});

// =========================================================
// M3.5: HEALTH SUB-RESOURCES (vaccines, dewormers, allergies, health_events)
// =========================================================

function healthSchemaFor(resource: HealthResource) {
  switch (resource) {
    case "vaccines":
      return VaccineCreateSchema;
    case "dewormers":
      return DewormerCreateSchema;
    case "allergies":
      return AllergyCreateSchema;
    case "events":
      return HealthEventCreateSchema;
  }
}

function buildHealthSubRoute(resource: HealthResource, urlSegment: string) {
  // GET list
  petsRoute.get(`/:id{[0-9]+}/${urlSegment}`, async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    try {
      await getOwnedPet(petId, session.sub);
      const records = await listHealthRecords(resource, petId);
      return c.json({ [urlSegment]: records });
    } catch (err) {
      return petErrorResponse(c, err);
    }
  });

  // POST create
  petsRoute.post(`/:id{[0-9]+}/${urlSegment}`, async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const schema = healthSchemaFor(resource);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: "BAD_JSON", message: "Body không hợp lệ" } }, 400);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: "VALIDATION", issues: parsed.error.issues } }, 400);
    }

    try {
      await getOwnedPet(petId, session.sub);
      const created = await createHealthRecord(resource, petId, parsed.data);
      const completion = await recalcAndSave(petId);
      return c.json({ record: created, completion_pct: completion.pct }, 201);
    } catch (err) {
      return petErrorResponse(c, err);
    }
  });

  // DELETE
  petsRoute.delete(`/:id{[0-9]+}/${urlSegment}/:rid{[0-9]+}`, async (c) => {
    const session = c.get("user");
    const petId = Number(c.req.param("id"));
    const recordId = Number(c.req.param("rid"));
    try {
      await getOwnedPet(petId, session.sub);
      await getRecordAndVerifyPet(resource, recordId, petId);
      await deleteHealthRecord(resource, recordId);
      const completion = await recalcAndSave(petId);
      return c.json({ success: true, completion_pct: completion.pct });
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status);
      }
      return petErrorResponse(c, err);
    }
  });
}

buildHealthSubRoute("vaccines", "vaccines");
buildHealthSubRoute("dewormers", "dewormers");
buildHealthSubRoute("allergies", "allergies");
buildHealthSubRoute("events", "health-events");

// =========================================================
// ACTIVITY TIMELINE — unified feed of pet's recent actions + Pet Score gains
// =========================================================
// Pulls from every table that records user-initiated activity on a pet:
//   pet_photos · daily_check_ins · pet_diary · bcs_assessments
//   user_daily_quests (completed) · user_achievements · care_plan_completions
// Each row is normalized to { type, title, description?, points, created_at }.
// Missing tables / fields fail-soft (try/catch per query) so the page never
// 500s if a future schema change drops a column.

const POINTS_BY_ACTIVITY: Record<string, number> = {
  photo_upload:        15,
  check_in:            10,
  voice_diary:         25,
  bcs_check:           50,
  quest_complete:       0,  // overridden per quest_bonus
  achievement_unlock:   0,  // overridden per def points
  care_plan_item:       5,
  trifecta_bonus:      30,
  food_scan:           15,
};

petsRoute.get("/:id{[0-9]+}/activity", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const daysRaw = Number(c.req.query("days") || "7");
  const days = Math.max(1, Math.min(60, Number.isFinite(daysRaw) ? daysRaw : 7));

  try {
    await getOwnedPet(petId, session.sub);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceISO = sinceDate.toISOString().slice(0, 10);

    // Helper: safely list a table — never throw, never break the response.
    async function safeList(table: string, filter: any, opts: any = {}): Promise<any[]> {
      try {
        const r = await listRows<any>(table as import("@shared/baserow-config.ts").TableName, { filter, size: opts.size || 100, orderBy: opts.orderBy });
        return r.results || [];
      } catch (err) {
        console.warn(`[pets/activity] ${table} fail-soft:`, String((err as any)?.message || err).slice(0, 100));
        return [];
      }
    }

    // Read flat-value helper for Baserow's link_row + single_select shapes
    const fv = (v: any): any => (typeof v === "object" && v && "value" in v ? (v as any).value : v);

    const petIdStr = String(petId);
    const userIdStr = String(session.sub);

    const [photos, checkins, diaries, bcs, quests, achievements, careItems, scans] = await Promise.all([
      safeList("pet_photos",
        { pet_id__link_row_has: petIdStr, uploaded_at__date_after_or_equal: sinceISO },
        { size: 100, orderBy: "-uploaded_at" }),
      safeList("daily_check_ins",
        { pet_id__link_row_has: petIdStr, check_date__date_after_or_equal: sinceISO },
        { size: 100, orderBy: "-check_date" }),
      safeList("pet_diary",
        { pet_id__link_row_has: petIdStr, created_at__date_after_or_equal: sinceISO },
        { size: 100, orderBy: "-created_at" }),
      safeList("bcs_assessments",
        { pet_id__link_row_has: petIdStr, assessed_at__date_after_or_equal: sinceISO },
        { size: 30, orderBy: "-assessed_at" }),
      safeList("user_daily_quests",
        { user_id__equal: userIdStr, pet_id__link_row_has: petIdStr, completed__boolean: "true", completed_at__date_after_or_equal: sinceISO },
        { size: 200, orderBy: "-completed_at" }),
      safeList("user_achievements",
        { user_id__equal: userIdStr, pet_id__link_row_has: petIdStr, unlocked_at__date_after_or_equal: sinceISO },
        { size: 50, orderBy: "-unlocked_at" }),
      safeList("care_plan_completions",
        { user_id__equal: userIdStr, pet_id__link_row_has: petIdStr, created_at__date_after_or_equal: sinceISO },
        { size: 200, orderBy: "-created_at" }),
      safeList("scan_logs",
        { pet_id__link_row_has: petIdStr },
        { size: 100, orderBy: "-created_at" }),
    ]);

    // Pull quest_definitions to enrich quest name + bonus (small static table)
    const questDefs = await safeList("quest_definitions", {}, { size: 50 });
    const questDefsByCode = new Map(questDefs.map((d) => [String(fv(d.code) || ""), d]));

    // Achievement defs for name + points
    const achievementDefs = await safeList("achievement_defs", {}, { size: 200 });
    const achievementDefsByCode = new Map(achievementDefs.map((d) => [String(fv(d.code) || ""), d]));

    type Activity = {
      type: string;
      title: string;
      description?: string | null;
      points: number;
      created_at: string;
    };
    const activities: Activity[] = [];

    for (const p of photos) {
      const photoType = String(fv(p.photo_type) || "general");
      const isGeneral = photoType === "general";
      activities.push({
        type: "photo_upload",
        title: isGeneral ? "Upload ảnh khoảnh khắc" : `Upload ảnh ID (${photoType})`,
        description: p.caption || null,
        points: isGeneral ? POINTS_BY_ACTIVITY.photo_upload : 0,
        created_at: String(p.uploaded_at || ""),
      });
    }

    for (const ck of checkins) {
      const appetite = fv(ck.appetite);
      const energy = fv(ck.energy);
      const meta = [appetite && `ăn: ${appetite}`, energy && `năng lượng: ${energy}`].filter(Boolean).join(" · ");
      activities.push({
        type: "check_in",
        title: "Check-in sức khoẻ hôm nay",
        description: meta || null,
        points: POINTS_BY_ACTIVITY.check_in,
        // check_date is a date-only string like "2026-05-21"; treat as midnight VN
        created_at: ck.check_date ? `${ck.check_date}T08:00:00.000Z` : "",
      });
    }

    for (const d of diaries) {
      activities.push({
        type: "voice_diary",
        title: d.pet_diary_title || "Nhật ký voice",
        description: d.mood_detected ? `Mood: ${fv(d.mood_detected)}` : null,
        points: POINTS_BY_ACTIVITY.voice_diary,
        created_at: String(d.created_at || ""),
      });
    }

    for (const b of bcs) {
      const cat = fv(b.bcs_category);
      activities.push({
        type: "bcs_check",
        title: `BCS đánh giá: ${b.bcs_score ?? "?"}/9`,
        description: cat ? `Phân loại: ${cat}` : null,
        points: POINTS_BY_ACTIVITY.bcs_check,
        created_at: String(b.assessed_at || ""),
      });
    }

    for (const s of scans) {
      // scan_logs.created_at là TEXT (Baserow date-filter 400 trên text) → cutoff ngày ở JS (ISO so sánh lexicographic)
      if (String(s.created_at || "").slice(0, 10) < sinceISO) continue;
      activities.push({
        type: "food_scan",
        title: `Quét nhãn: ${s.brand_name || "sản phẩm"}`,
        description: s.matched_brand_id ? "Khớp thư viện" : (s.carb_pct != null ? `Tinh bột ~${s.carb_pct}%` : "Đã quét"),
        points: POINTS_BY_ACTIVITY.food_scan,
        created_at: String(s.created_at || ""),
      });
    }

    for (const q of quests) {
      const code = String(fv(q.quest_code) || "");
      const def = questDefsByCode.get(code) as any;
      const name = (def && def.name) || code || "Quest";
      const bonus = Number((def && def.pet_score_bonus) || 0);
      activities.push({
        type: "quest_complete",
        title: `Quest: ${name}`,
        description: null,
        points: bonus,
        created_at: String(q.completed_at || ""),
      });
    }

    for (const a of achievements) {
      const code = String(fv(a.achievement_code) || "");
      const def = achievementDefsByCode.get(code) as any;
      const name = (def && def.name) || code || "Achievement";
      const bonus = Number((def && def.pet_score_bonus) || 0);
      activities.push({
        type: "achievement_unlock",
        title: `Huy hiệu: ${name}`,
        description: def?.description || null,
        points: bonus,
        created_at: String(a.unlocked_at || ""),
      });
    }

    for (const cp of careItems) {
      const itemKey = String(cp.item_key || "");
      // Trifecta sentinel has its own activity type
      if (itemKey === "_trifecta_granted") {
        activities.push({
          type: "trifecta_bonus",
          title: "Care Plan Trifecta",
          description: cp.notes || "+30đ bonus khi hoàn tất 3 nhóm hoạt động",
          points: POINTS_BY_ACTIVITY.trifecta_bonus,
          created_at: String(cp.created_at || cp.completed_at || ""),
        });
      } else {
        const itemType = String(fv(cp.item_type) || "other");
        const TYPE_LABEL: Record<string, string> = {
          feeding: "Cho ăn", exercise: "Vận động", water: "Uống nước",
          training: "Training", monitoring: "Theo dõi", other: "Hoạt động",
        };
        activities.push({
          type: "care_plan_item",
          title: `Care Plan: ${TYPE_LABEL[itemType] || itemType}`,
          description: itemKey,
          points: POINTS_BY_ACTIVITY.care_plan_item,
          created_at: String(cp.created_at || cp.completed_at || ""),
        });
      }
    }

    // Filter out rows with no timestamp (shouldn't happen but defensive)
    const valid = activities.filter((a) => a.created_at);
    valid.sort((a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0));

    const total_points = valid.reduce((sum, a) => sum + (a.points || 0), 0);

    return c.json({
      activities: valid.slice(0, 200),  // cap response
      total_points,
      total_count: valid.length,
      days,
    });
  } catch (err) {
    return petErrorResponse(c, err);
  }
});
