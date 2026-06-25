/**
 * FOSTER L4b — config 4 gói "Góp gói nuôi" (HARDCODE tạm, 1 NGUỒN DUY NHẤT).
 * L4c sẽ thay nguồn này bằng fetch từ MonMin (giữ nguyên shape FosterPackage để FE không đổi).
 * Chưa nối thanh toán — modal "Tiếp tục" hiện placeholder.
 */
export interface FosterPackage {
  id: number;
  title: string;        // câu KẾT QUẢ (chữ to) — nói bằng kết quả, không bằng thành phần
  price: number;        // VND (number) — cho L4c/payment
  priceLabel: string;   // hiển thị
  contents: string;     // thành phần (chữ nhỏ)
  popular?: boolean;    // 1 gói nổi bật, chọn sẵn khi mở modal
}

export const FOSTER_PACKAGES: FosterPackage[] = [
  { id: 1, title: "Nuôi bé 1 tuần", price: 150000, priceLabel: "150.000đ", contents: "2kg hạt phục hồi + 7 gói pate" },
  { id: 2, title: "Giúp bé phục hồi 2 tuần", price: 320000, priceLabel: "320.000đ", contents: "Hạt phục hồi + sữa + men tiêu hoá", popular: true },
  { id: 3, title: "Lo trọn ca triệt sản", price: 450000, priceLabel: "450.000đ", contents: "Thức ăn mềm sau mổ + vòng chống liếm + gạc y tế" },
  { id: 4, title: "Đỡ đầu bé cả tháng", price: 590000, priceLabel: "590.000đ", contents: "Combo ăn + chăm sóc đầy đủ 30 ngày" },
];
