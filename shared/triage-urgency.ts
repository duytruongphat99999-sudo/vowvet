// shared/triage-urgency.ts
// Cầu nối: triage bản mới (M31, ghi BẬC CHỮ) ↔ code cũ (đọc SỐ 1-5).
// Bảng triage_tree_sessions chỉ lưu final_tier dạng chữ; analytics + care-planner
// cũ cần urgency dạng số → file này quy đổi. SỬA MAP THÌ SỬA Ở ĐÂY, không rải nơi khác.

import type { TriageTier } from "./triage-tree.ts";
// TriageTier = "emergency" | "urgent" | "non_urgent" | "wellness" (định nghĩa ở triage-tree.ts:22)

// Bậc-chữ → số urgency 1-5, theo NGHĨA lâm sàng (KHÔNG chia đều máy móc).
// Số 3 bỏ trống CÓ CHỦ Ý: app chỉ ĐẾM theo mức, không tính trung bình urgency
// (đã grep analytics.ts — không có phép chia urgency) → khoảng cách lệch vô hại.
const TIER_TO_URGENCY: Record<TriageTier, number> = {
  emergency: 5, // nguy cấp — cao nhất, khớp ai_urgency_level=5 của bảng cũ
  urgent: 4,    // nên đi sớm
  non_urgent: 2,// không gấp
  wellness: 1,  // chăm sóc thường / phòng ngừa — thấp nhất
};

/**
 * Đổi bậc triage (chữ) → số urgency 1-5 cho code cũ dùng.
 * @param tier  giá trị từ triage_tree_sessions.final_tier
 * @returns     1-5; tier lạ/rỗng → 0 (loại khỏi thống kê, KHÔNG đoán bừa)
 */
export function tierToUrgency(tier: string | null | undefined): number {
  if (!tier) return 0;
  return TIER_TO_URGENCY[tier as TriageTier] ?? 0;
}

// "Ca đỏ" (red flag) = nguy cấp HOẶC nên-đi-sớm. Dùng cho red_flag_hits.
// Thay cho dò symptom-catalog: tree M31 đã tự phân loại rồi, tin vào bậc của nó.
// LƯU Ý (2 nguồn khác gốc): red_flag của bảng CŨ = cờ sym.red_flag ở symptom-catalog;
// red_flag của tree = tier-based (emergency/urgent). Cùng field red_flag_hits nhưng
// 2 định nghĩa khác nguồn — CHỦ Ý, không phải bug.
const RED_FLAG_TIERS: ReadonlySet<string> = new Set(["emergency", "urgent"]);

/**
 * Ca này có "đỏ" không — dựa thẳng vào bậc tree đã phân loại.
 * @param tier  final_tier
 */
export function tierIsRedFlag(tier: string | null | undefined): boolean {
  return tier ? RED_FLAG_TIERS.has(tier) : false;
}
