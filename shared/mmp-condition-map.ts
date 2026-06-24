/**
 * Map slug bệnh-lý từ deep-link MonMin Pet (?condition=<slug>) → code health-condition VowVet.
 * MMP gửi slug VN (hyphen); VowVet dùng code EN snake_case (shared/health-conditions.ts).
 * Slug KHÔNG có trong map → bỏ qua (không prefill). Thêm slug mới = +1 dòng.
 * Lưu ý: "than-tiet-nieu" gộp thận+tiết niệu ở MMP → map về kidney_ckd (chủ đạo).
 */
export const MMP_CONDITION_MAP: Record<string, string> = {
  "than-tiet-nieu": "kidney_ckd",
};
