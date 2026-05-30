/**
 * M26 seed — 16 pet-friendly places in HCMC.
 * Idempotent (skips if name already exists).
 */
import existingConfig from "../baserow-config.json" with { type: "json" };

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const TOKEN = Bun.env.BASEROW_TOKEN;
if (!TOKEN) { console.error("❌ Missing BASEROW_TOKEN"); process.exit(1); }

const PLACES_TABLE = (existingConfig.tables as any).places.id;

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASEROW_URL}/api${path}?user_field_names=true`, {
    ...init,
    headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json", Host: "localhost:8888", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface SeedPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  pet_policy: string;
  amenities: string[];
  contact_phone?: string;
  verified?: boolean;
}

const SEEDS: SeedPlace[] = [
  // PARKS (10)
  { name: "Công viên Tao Đàn", address: "55 Trương Định, P. Bến Thành, Q.1, HCM", lat: 10.7727, lng: 106.6919, category: "park", pet_policy: "leash_only", amenities: ["shade", "outdoor_seating"] },
  { name: "Công viên Lê Văn Tám", address: "Hai Bà Trưng, Q.1, HCM", lat: 10.7842, lng: 106.6982, category: "park", pet_policy: "leash_only", amenities: ["shade", "water_bowl", "outdoor_seating"] },
  { name: "Công viên Gia Định", address: "Hoàng Minh Giám, Q. Gò Vấp, HCM", lat: 10.8077, lng: 106.6753, category: "park", pet_policy: "leash_only", amenities: ["off_leash_area", "shade"] },
  { name: "Công viên 23/9", address: "Phạm Ngũ Lão, Q.1, HCM", lat: 10.7686, lng: 106.6917, category: "park", pet_policy: "leash_only", amenities: ["outdoor_seating"] },
  { name: "Công viên Hoàng Văn Thụ", address: "Hoàng Văn Thụ, Q. Tân Bình, HCM", lat: 10.8048, lng: 106.6691, category: "park", pet_policy: "leash_only", amenities: ["shade", "off_leash_area"] },
  { name: "Công viên Lê Thị Riêng", address: "Trường Sơn, Q.10, HCM", lat: 10.7858, lng: 106.6650, category: "park", pet_policy: "leash_only", amenities: ["shade", "water_bowl"] },
  { name: "Công viên Phú Lâm", address: "Q. Bình Tân, HCM", lat: 10.7510, lng: 106.6308, category: "park", pet_policy: "leash_only", amenities: ["shade"] },
  { name: "Công viên Bến Thành", address: "Q.1, HCM", lat: 10.7720, lng: 106.6986, category: "park", pet_policy: "leash_only", amenities: ["outdoor_seating"] },
  { name: "Công viên Hồ Con Rùa", address: "Q.3, HCM", lat: 10.7806, lng: 106.6960, category: "park", pet_policy: "leash_only", amenities: ["outdoor_seating"] },
  { name: "Thảo Cầm Viên", address: "2 Nguyễn Bỉnh Khiêm, Q.1, HCM", lat: 10.7878, lng: 106.7050, category: "park", pet_policy: "leash_only", amenities: ["shade"] },

  // VET CLINICS (4)
  { name: "Mon Min Pet Clinic", address: "TP.HCM (địa chỉ chính thức sẽ cập nhật)", lat: 10.7900, lng: 106.6500, category: "vet", pet_policy: "allowed", amenities: ["indoor"], contact_phone: "+84779029133", verified: true },
  { name: "Saigon Pet Clinic", address: "33 Bùi Thị Xuân, Q.1, HCM", lat: 10.7700, lng: 106.7000, category: "vet", pet_policy: "allowed", amenities: ["indoor"], verified: true },
  { name: "Animal Doctors Vietnam", address: "21 Lý Tự Trọng, Q.1, HCM", lat: 10.7820, lng: 106.7050, category: "vet", pet_policy: "allowed", amenities: ["indoor"], verified: true },
  { name: "New Pet Hospital", address: "Nguyễn Văn Trỗi, Q. Phú Nhuận, HCM", lat: 10.7950, lng: 106.6700, category: "vet", pet_policy: "allowed", amenities: ["indoor"] },

  // PET SHOPS (2)
  { name: "Pet Mart Q.1", address: "Lê Lợi, Q.1, HCM", lat: 10.7780, lng: 106.7000, category: "pet_shop", pet_policy: "allowed", amenities: ["indoor"] },
  { name: "Tropi Pet Shop", address: "Phan Đình Phùng, Q. Phú Nhuận, HCM", lat: 10.7850, lng: 106.6850, category: "pet_shop", pet_policy: "allowed", amenities: ["indoor"] },

  // PET-FRIENDLY CAFES (5)
  { name: "Catcafe Saigon", address: "Q.1, HCM", lat: 10.7780, lng: 106.6920, category: "cafe", pet_policy: "allowed", amenities: ["indoor", "water_bowl"] },
  { name: "The Hidden Elephant Books & Coffee", address: "Q.3, HCM", lat: 10.7900, lng: 106.6800, category: "cafe", pet_policy: "leash_only", amenities: ["outdoor_seating", "indoor"] },
  { name: "Reng Reng Coffee", address: "Q.1, HCM", lat: 10.7740, lng: 106.6980, category: "cafe", pet_policy: "leash_only", amenities: ["outdoor_seating"] },
  { name: "Cộng Cà Phê Đakao", address: "Đakao, Q.1, HCM", lat: 10.7920, lng: 106.7000, category: "cafe", pet_policy: "leash_only", amenities: ["outdoor_seating"] },
  { name: "Maison Marou Saigon", address: "169 Calmette, Q.1, HCM", lat: 10.7710, lng: 106.6950, category: "cafe", pet_policy: "leash_only", amenities: ["outdoor_seating"] },

  // GROOMING (1)
  { name: "Pet Spa Saigon", address: "Q.3, HCM", lat: 10.7910, lng: 106.6890, category: "grooming", pet_policy: "allowed", amenities: ["indoor"] },
];

// Pre-fetch existing names to dedupe
const existing = await api<any>(`/database/rows/table/${PLACES_TABLE}/?size=200`);
const existingNames = new Set(
  existing.results.map((r: any) => (r.name || "").toLowerCase().trim()).filter(Boolean)
);

let added = 0, skipped = 0;
for (const s of SEEDS) {
  if (existingNames.has(s.name.toLowerCase().trim())) {
    skipped++;
    continue;
  }
  await api(`/database/rows/table/${PLACES_TABLE}/`, {
    method: "POST",
    body: JSON.stringify({
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      category: s.category,
      pet_policy: s.pet_policy,
      amenities: JSON.stringify(s.amenities),
      avg_rating: 0,
      total_checkins: 0,
      total_reviews: 0,
      contact_phone: s.contact_phone || null,
      photo_urls: JSON.stringify([]),
      verified: s.verified !== false,
      active: true,
      created_at: new Date().toISOString(),
    }),
  });
  added++;
  console.log(`  + ${s.name}`);
}

console.log(`\n✅ Seed done: +${added} added, ${skipped} already existed.`);
