/**
 * Nhận diện admin dùng chung cho api (Hono routes) + web (Astro middleware).
 *
 * Admin = phone ∈ ADMIN_PHONES  HOẶC  email ∈ ADMIN_EMAILS  (khớp CHÍNH XÁC).
 * Cả 2 whitelist đọc từ env (KHÔNG hardcode). Giữ nguyên đường SĐT hiện có,
 * THÊM đường email song song (cho admin đăng nhập bằng Google).
 *
 * ⚠️ DEPLOY: file này được bundle vào web dist lúc `astro build` → sửa file này
 * PHẢI rebuild `vowvet-web` (không chỉ restart api). Bài học PR#11 (jwt.ts bundle vào dist).
 */

/** "a, b ,c" → ["a","b","c"] (bỏ khoảng trắng + phần tử rỗng). */
function parseList(raw: string | undefined): string[] {
  return (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * True nếu identity (phone HOẶC email) khớp whitelist admin từ env.
 * Đọc env MỖI lần gọi (rẻ, luôn tươi, không phụ thuộc thứ tự load module).
 * Khớp exact/case-sensitive — email Google trả về dạng lowercase.
 */
export function isAdminIdentity(
  phone?: string | null,
  email?: string | null
): boolean {
  const phones = parseList(process.env.ADMIN_PHONES);
  const emails = parseList(process.env.ADMIN_EMAILS);
  const okPhone = !!phone && phones.includes(phone);
  const okEmail = !!email && emails.includes(email);
  return okPhone || okEmail;
}
