/**
 * API client cho Astro SSR (middleware + page frontmatter).
 * Khi gọi từ container vowvet-web, dùng docker DNS http://vowvet-api:3000 để skip nginx.
 * Forward cookie từ original request để giữ session.
 */

const API_INTERNAL = process.env.API_INTERNAL_URL || "http://vowvet-api:3000";

export interface ApiPet {
  id: number;
  name: string;
  species: string;
  breed: string | null;
  dob: string | null;
  gender: string | null;
  weight_kg: number | null;
  photo_url: string | null;
  qr_code?: string | null;
  created_at?: string | null;
}

export interface MeResponse {
  user: {
    id: number;
    phone: string;
    name: string | null;
    onboarding_completed: boolean;
    is_admin?: boolean;
  };
  pets: ApiPet[];
}

/**
 * GET /api/v1/auth/me — server-side fetch dùng cookie forward.
 * Trả null nếu chưa login hoặc session hết hạn.
 * Set-Cookie từ response sẽ được copy về browser bởi caller.
 */
export async function fetchMe(cookieHeader: string): Promise<{ data: MeResponse | null; setCookie: string | null }> {
  if (!cookieHeader) return { data: null, setCookie: null };
  try {
    const res = await fetch(`${API_INTERNAL}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader },
    });
    const setCookie = res.headers.get("set-cookie");
    if (!res.ok) return { data: null, setCookie };
    const data = (await res.json()) as MeResponse;
    return { data, setCookie };
  } catch (err) {
    console.error("[api-client] fetchMe error:", err);
    return { data: null, setCookie: null };
  }
}

/** GET /api/v1/pets/:id — fetch one owned pet. Status: 404/403/200. */
export async function fetchPet(
  petId: number,
  cookieHeader: string
): Promise<{ pet: ApiPet | null; status: number }> {
  if (!cookieHeader) return { pet: null, status: 401 };
  try {
    const res = await fetch(`${API_INTERNAL}/api/v1/pets/${petId}`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) return { pet: null, status: res.status };
    const data = (await res.json()) as { pet: ApiPet };
    return { pet: data.pet, status: 200 };
  } catch (err) {
    console.error("[api-client] fetchPet error:", err);
    return { pet: null, status: 500 };
  }
}

export interface PublicPetResponse {
  name: string;
  species: string;
  breed: string | null;
  photo_url: string | null;
  owner_phone_masked: string;
}

/** GET /api/v1/public/pets/:qr_code — KHÔNG cookie. */
export async function fetchPublicPet(qrCode: string): Promise<PublicPetResponse | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/v1/public/pets/${encodeURIComponent(qrCode)}`);
    if (!res.ok) return null;
    return (await res.json()) as PublicPetResponse;
  } catch (err) {
    console.error("[api-client] fetchPublicPet error:", err);
    return null;
  }
}

/** Full pet row including profile fields. Server-side fetch trả về raw Baserow shape. */
export async function fetchPetFull(
  petId: number,
  cookieHeader: string
): Promise<{ pet: any | null; status: number }> {
  if (!cookieHeader) return { pet: null, status: 401 };
  try {
    // Baserow direct via internal API helper — gọi /pets/:id endpoint (đã trả profile fields)
    const res = await fetch(`${API_INTERNAL}/api/v1/pets/${petId}`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) return { pet: null, status: res.status };
    const data = (await res.json()) as { pet: any };
    return { pet: data.pet, status: 200 };
  } catch (err) {
    return { pet: null, status: 500 };
  }
}

/** GET /api/v1/pets/:id/profile/completion */
export async function fetchCompletion(petId: number, cookieHeader: string): Promise<any | null> {
  if (!cookieHeader) return null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/v1/pets/${petId}/profile/completion`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}
