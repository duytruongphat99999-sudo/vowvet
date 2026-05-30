/**
 * Onboarding routes:
 *   POST /pet   — tạo pet đầu tiên của user, đánh dấu onboarding done.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/auth.ts";
import { createPet, markOnboarded } from "../lib/users.ts";
import { signSession } from "@shared/jwt.ts";
import {
  speciesViToEn,
  speciesEnToVi,
  genderViToEn,
  genderEnToVi,
} from "@shared/enum-mappers.ts";
import { setSessionCookie } from "../lib/session-cookie.ts";

export const onboardingRoute = new Hono();

// Schema cho pet onboarding (Step 1-3 của wizard).
// API contract dùng tiếng Việt; mapper chuyển sang EN khi lưu Baserow.
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

onboardingRoute.post("/pet", requireAuth, zValidator("json", petCreateSchema), async (c) => {
  const session = c.get("user");
  const data = c.req.valid("json");

  try {
    // VN → EN trước khi lưu Baserow (select options là tiếng Anh trong schema)
    const pet = await createPet(session.sub, {
      name: data.name,
      species: speciesViToEn(data.species),
      breed: data.breed || null,
      dob: data.dob || null,
      gender: genderViToEn(data.gender),
      weight_kg: data.weight_kg ?? null,
    });

    // M21+: persist onboarded=true vào users table (Phase 1 source of truth).
    // Failure is non-fatal — JWT refresh below vẫn unblock user.
    try {
      await markOnboarded(session.sub);
    } catch (err) {
      console.error("[onboarding] markOnboarded failed (non-fatal):", err);
    }

    // CRITICAL BUG FIX (M21+): JWT refresh phải include CẢ phone VÀ email.
    // verifySession require ít nhất một trong hai — nếu register bằng email
    // (no phone), JWT cũ có email; nếu refresh quên email → next request fail
    // signature check → user bị bounce /login sau onboarding. Đây là root cause
    // bug "email register → onboard → logout silent".
    const refreshed = signSession({
      sub: session.sub,
      phone: session.phone || undefined,
      email: session.email || undefined,
      is_onboarded: true,
    });
    setSessionCookie(c, refreshed);

    // EN → VN khi trả về cho client (giữ API contract tiếng Việt)
    const petSpecies = typeof pet.species === "object" ? pet.species?.value : pet.species;
    const petGender = typeof pet.gender === "object" ? pet.gender?.value : pet.gender;

    return c.json({
      pet: {
        id: pet.id,
        name: pet.name,
        species: speciesEnToVi(petSpecies as string),
        breed: pet.breed,
        dob: pet.dob,
        gender: genderEnToVi(petGender as string | null),
        weight_kg: pet.weight_kg,
      },
    });
  } catch (err: any) {
    console.error("[onboarding] createPet failed:", err);
    return c.json(
      { error: { code: "CREATE_PET_FAILED", message: "Không tạo được thú cưng. Thử lại nhé" } },
      500
    );
  }
});
