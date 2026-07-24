/**
 * User repository — find/create user trong Baserow + count pets.
 *
 * Note Phase 0: "onboarding_completed" được suy ra từ count(pets where user_id=X) > 0.
 * Khi schema users có field thật, đổi getIsOnboarded sang đọc field đó.
 *
 * M8: Google OAuth helpers + soft delete + auth_method tracking.
 */
import { listRows, getRow, createRow, updateRow } from "@shared/baserow.ts";

export type AuthMethod = "phone_otp" | "google_oauth" | "both" | "zalo_oauth";

export interface BaserowUser {
  id: number;
  phone: string | null; // M8: nullable cho Google OAuth user
  name: string | null;
  plan_tier: string | { id: number; value: string } | null;
  last_login_at?: string | null;
  created_at?: string;
  // M8 fields
  email?: string | null;
  google_oauth_id?: string | null;
  zalo_user_id?: string | null; // Task B: định danh Zalo OAuth (KHÔNG lấy SĐT)
  avatar_url?: string | null;
  auth_method?: AuthMethod | { id: number; value: AuthMethod } | null;
  deleted_at?: string | null;
  // M21: explicit onboarding flag (was inferred from pets.length > 0 in Phase 0)
  onboarded?: boolean;
  // A5 (Pre-Launch): Care Plan consent ack — NULL until user clicks "Tôi đồng ý"
  care_plan_consented_at?: string | null;
  care_plan_consent_version?: string | null;
}

/** Flat helper cho single_select fields. */
function flatVal<T>(v: any): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

/** Lấy auth_method từ row (handle cả single_select + raw string). */
export function getAuthMethod(user: BaserowUser): AuthMethod | null {
  return flatVal<AuthMethod>(user.auth_method);
}

/** Check soft-deleted user. */
export function isDeleted(user: BaserowUser): boolean {
  return !!user.deleted_at;
}

export interface BaserowPet {
  id: number;
  name: string;
  species: string | { id: number; value: string };
  breed?: string | null;
  breed_secondary?: string | null;
  dob?: string | null;
  gender?: string | { id: number; value: string } | null;
  weight_kg?: number | null;
  photo_url?: string | null;
  // v49: Profile-driven extensions — manual Baserow column add required
  poop_score?: number | null;
  bcs_score?: number | null;
  allergens?: string | null;            // JSON string of string[] in Baserow Long text column
  sensitivities?: string | null;        // JSON string
  environmentals?: string | null;       // JSON string
  origin_certificate_url?: string | null;
  is_verified?: boolean | null;
  user_id?: Array<{ id: number; value: string }>;
  created_at?: string;
}

/** Tìm user theo phone (đã chuẩn hoá +84). */
export async function findUserByPhone(phone: string): Promise<BaserowUser | null> {
  const res = await listRows<BaserowUser>("users", {
    filter: { "phone__equal": phone },
    size: 1,
  });
  return res.results[0] || null;
}

/** M8: tìm user theo id (user.sub trong JWT). */
export async function findUserById(userId: number): Promise<BaserowUser | null> {
  try {
    return await getRow<BaserowUser>("users", userId);
  } catch (err: any) {
    if (String(err?.message || "").includes("404")) return null;
    throw err;
  }
}

/** M8: tìm user theo email (Google OAuth lookup hoặc duplicate check). */
export async function findUserByEmail(email: string): Promise<BaserowUser | null> {
  if (!email) return null;
  const res = await listRows<BaserowUser>("users", {
    filter: { email__equal: email },
    size: 1,
  });
  return res.results[0] || null;
}

/** M8: tìm user theo google_oauth_id (returning OAuth user). */
export async function findUserByGoogleOauthId(sub: string): Promise<BaserowUser | null> {
  if (!sub) return null;
  const res = await listRows<BaserowUser>("users", {
    filter: { google_oauth_id__equal: sub },
    size: 1,
  });
  return res.results[0] || null;
}

/** Tạo user mới với plan_tier=free, last_login_at=now, onboarded=false (phone OTP flow). */
export async function createUser(phone: string): Promise<BaserowUser> {
  const user = await createRow<BaserowUser>("users", {
    phone,
    plan_tier: "free",
    last_login_at: new Date().toISOString(),
    auth_method: "phone_otp",
    onboarded: false, // M21: explicit
  });
  return user;
}

/** M8: tạo user mới qua Google OAuth (phone=null, email + google_oauth_id required). */
export async function createUserViaGoogle(data: {
  email: string;
  google_oauth_id: string;
  name?: string | null;
  avatar_url?: string | null;
}): Promise<BaserowUser> {
  const user = await createRow<BaserowUser>("users", {
    phone: null,
    email: data.email,
    google_oauth_id: data.google_oauth_id,
    name: data.name || null,
    avatar_url: data.avatar_url || null,
    plan_tier: "free",
    last_login_at: new Date().toISOString(),
    auth_method: "google_oauth",
    onboarded: false, // M21: explicit
  });
  return user;
}

/** Task B: tìm user theo zalo_user_id (returning Zalo OAuth user). */
export async function findUserByZaloId(zaloId: string): Promise<BaserowUser | null> {
  if (!zaloId) return null;
  const res = await listRows<BaserowUser>("users", {
    filter: { zalo_user_id__equal: zaloId },
    size: 1,
  });
  return res.results[0] || null;
}

/** Task B: tạo user mới qua Zalo OAuth (phone=null, email=null, định danh bằng zalo_user_id). */
export async function createUserViaZalo(data: {
  zalo_user_id: string;
  name?: string | null;
  avatar_url?: string | null;
}): Promise<BaserowUser> {
  const user = await createRow<BaserowUser>("users", {
    phone: null,
    email: null,
    zalo_user_id: data.zalo_user_id,
    name: data.name || null,
    avatar_url: data.avatar_url || null,
    plan_tier: "free",
    last_login_at: new Date().toISOString(),
    // KHÔNG set auth_method: single_select Baserow chưa có option "zalo_oauth" (§8 → insert 400).
    // Định danh Zalo THUẦN qua zalo_user_id; auth_method trống an toàn — admin check dựa
    // ADMIN_PHONES (phone), KHÔNG dùng auth_method; không có logic chặn user theo field này.
    onboarded: false, // M21: explicit
  });
  return user;
}

/** M8: link existing user (phone_otp) với Google OAuth → auth_method='both'. */
export async function linkUserToGoogle(
  userId: number,
  data: {
    email: string;
    google_oauth_id: string;
    avatar_url?: string | null;
  }
): Promise<BaserowUser> {
  return updateRow<BaserowUser>("users", userId, {
    email: data.email,
    google_oauth_id: data.google_oauth_id,
    avatar_url: data.avatar_url || null,
    auth_method: "both",
  });
}

/** M8: unlink Google OAuth khỏi user. Caller phải check còn phone trước. */
export async function unlinkGoogleFromUser(userId: number): Promise<BaserowUser> {
  return updateRow<BaserowUser>("users", userId, {
    google_oauth_id: null,
    auth_method: "phone_otp",
  });
}

/** M8: soft delete user. Pets/data preserved (GDPR retention 30d). */
export async function softDeleteUser(userId: number): Promise<void> {
  await updateRow("users", userId, {
    deleted_at: new Date().toISOString(),
  });
}

/** M8: cập nhật profile (name, avatar). Email update riêng để tránh OAuth conflict. */
export async function updateUserProfile(
  userId: number,
  data: { name?: string | null; avatar_url?: string | null }
): Promise<BaserowUser> {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
  return updateRow<BaserowUser>("users", userId, patch);
}

/** Cập nhật last_login_at = now. */
export async function touchLastLogin(userId: number): Promise<void> {
  try {
    await updateRow("users", userId, { last_login_at: new Date().toISOString() });
  } catch (err) {
    // Không fatal: login vẫn thành công kể cả khi update last_login fail
    console.error("[users] touchLastLogin failed:", err);
  }
}

/** M8: Reject deleted users → ném error code "USER_DELETED" cho caller bắt và 401. */
export function assertNotDeleted(user: BaserowUser): void {
  if (isDeleted(user)) {
    const err = new Error("Tài khoản đã bị xóa");
    (err as any).code = "USER_DELETED";
    throw err;
  }
}

/**
 * Tìm user hoặc tạo mới.
 * Trả { user, is_new } để caller biết redirect /onboarding hay /dashboard.
 */
export async function findOrCreateUser(phone: string): Promise<{ user: BaserowUser; is_new: boolean }> {
  const existing = await findUserByPhone(phone);
  if (existing) {
    await touchLastLogin(existing.id);
    return { user: existing, is_new: false };
  }
  const user = await createUser(phone);
  return { user, is_new: true };
}

/** Đếm số pet của user (qua link_row filter). */
export async function countUserPets(userId: number): Promise<number> {
  const res = await listRows<BaserowPet>("pets", {
    filter: { "user_id__link_row_has": String(userId), deleted_at__empty: "" },
    size: 1,
  });
  return res.count;
}

/**
 * "Đã onboarding" (M21).
 * Đọc field `users.onboarded` (boolean) làm nguồn chính xác.
 * Fallback: nếu field rỗng (legacy user chưa migrate), dùng pets.length > 0.
 */
export async function getIsOnboarded(userId: number): Promise<boolean> {
  try {
    const user = await findUserById(userId);
    if (user && typeof (user as any).onboarded === "boolean") {
      return (user as any).onboarded === true;
    }
  } catch (_) {}
  // Fallback for any legacy row that doesn't have the field set
  const count = await countUserPets(userId);
  return count > 0;
}

/** M21: explicit mark onboarded=true (called from POST /users/me/complete-onboarding). */
export async function markOnboarded(userId: number): Promise<BaserowUser> {
  return updateRow<BaserowUser>("users", userId, { onboarded: true });
}

/**
 * Foster onboarding: đánh dấu onboarded=true + bật cờ nhận nuôi tạm, KHÔNG tạo pet.
 * Cho phép user chọn "nhận foster, chưa có bé" đi thẳng dashboard mà không bị ép thêm bé.
 * Dùng cờ boolean is_foster_carer có sẵn — KHÔNG đụng schema.
 */
export async function markOnboardedAsFoster(userId: number): Promise<BaserowUser> {
  // public_profile_enabled=true: foster cần profile public để nhận bé qua link
  // /heroes/profile/<id> (v346) — không bật thì người trao mở link ra 404 (gate pet-heroes.ts).
  return updateRow<BaserowUser>("users", userId, {
    onboarded: true,
    is_foster_carer: true,
    public_profile_enabled: true,
  });
}

/** List pets của user (cho dashboard). */
export async function listUserPets(userId: number, limit = 50): Promise<BaserowPet[]> {
  const res = await listRows<BaserowPet>("pets", {
    filter: { "user_id__link_row_has": String(userId), deleted_at__empty: "" },
    size: limit,
    orderBy: "-created_at",
  });
  return res.results;
}

/** Tạo pet mới link tới user. */
export async function createPet(
  userId: number,
  data: Omit<BaserowPet, "id" | "user_id" | "created_at">
): Promise<BaserowPet> {
  // Baserow link_row nhận array of row IDs khi user_field_names=true
  const pet = await createRow<BaserowPet>("pets", {
    ...data,
    user_id: [userId],
    onboarding_completed: true,
  });
  return pet;
}
