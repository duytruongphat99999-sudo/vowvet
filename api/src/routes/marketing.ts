/**
 * Marketing routes (PUBLIC, no auth).
 *
 * Mount: app.route("/api/v1/marketing", marketingRoute)
 *
 * Endpoints:
 *   GET /api/v1/marketing/why-vowvet  — structured content for landing page
 *
 * Static content (no Baserow query). Keeps SEO-friendly + cheap.
 */
import { Hono } from "hono";
import { VOWVET_CONTACT, getZaloLink, getHotlineDisplay, getHotlineE164 } from "@shared/contact-info.ts";

export const marketingRoute = new Hono();

marketingRoute.get("/why-vowvet", (c) => {
  return c.json({
    risks: [
      {
        icon: "🤝",
        scenario_title: '"Anh ơi, chó bạn có vaccine không?"',
        problem: "Tin lời người lạ qua FB group khi cho pet gặp nhau. Lỡ chó dại / parvovirus / giảm bạch cầu mèo → bé mình lây bệnh, 100% rủi ro không kiểm soát.",
        solution: "VowVet Playdate verify ≥2 vaccine completed thực tế trong app trước khi cho match. Không thể fake.",
        feature_link: "/playdate",
        feature_name: "Pet Playdate",
      },
      {
        icon: "🐾",
        scenario_title: "Bé chạy mất lúc 8h sáng",
        problem: "In tờ rơi, đăng FB group → mất 24-48h lan tin → pet đã đi xa khỏi khu vực, tỷ lệ tìm thấy < 30%.",
        solution: "Lost Pet Network broadcast 5km tự động trong 10 giây + AI Vision compare ảnh sighting → match accuracy cao + thưởng người tìm thấy.",
        feature_link: "/lost/nearby",
        feature_name: "Lost Pet Network",
      },
      {
        icon: "💉",
        scenario_title: '"Vaccine bé tới hạn khi nào nhỉ?"',
        problem: "Ghi note trên giấy / Google Calendar → quên ngày → bé thiếu miễn dịch → tăng nguy cơ bệnh.",
        solution: "Vaccine Calendar 9 loại WSAVA chuẩn + Push notification reminder 14/7/1 ngày + cảnh báo quá hạn.",
        feature_link: "/vaccines",
        feature_name: "Vaccine Tracker",
      },
      {
        icon: "🍴",
        scenario_title: '"Bé ăn bao nhiêu là đủ?"',
        problem: "Đoán theo cảm tính, dựa vào lời khuyên random Internet → bé béo phì (40% pet HCM) hoặc gầy yếu.",
        solution: "Nutrition Profiler tính khẩu phần theo cân/age/breed + BCS AI Vision đánh giá thể trạng từ ảnh chuẩn WSAVA 1-9.",
        feature_link: "/dashboard",
        feature_name: "Smart Nutrition + BCS AI",
      },
      {
        icon: "☕",
        scenario_title: '"Cafe này có cho dẫn pet không nhỉ?"',
        problem: "Đến cafe bị đuổi vì không pet-friendly. Hoặc tìm trên Google không chính xác — chính sách thay đổi.",
        solution: "Pet Map 22+ địa điểm verified pet-friendly tại HCM (cafe, park, vet, grooming, pet shop).",
        feature_link: "/map",
        feature_name: "Pet Map",
      },
      {
        icon: "🚨",
        scenario_title: '"Bé ói liên tục, có cần đi vet ngay không?"',
        problem: "Hoảng loạn, gọi vet thân hỏi giữa đêm, có khi đánh giá quá nhẹ → bỏ qua nguy hiểm, hoặc quá lo → tốn tiền không cần thiết.",
        solution: "Triage Decision Tree y học vet-validated → trả lời 2-4 câu → phân tier Emergency/Urgent/Non-urgent + recommendation cụ thể.",
        feature_link: "/triage",
        feature_name: "Triage AI",
      },
      {
        icon: "🎂",
        scenario_title: '"Sinh nhật bé năm nay tổ chức sao?"',
        problem: "Quên ngày sinh, không có ảnh kỷ niệm tử tế, lủi thủi một mình.",
        solution: "Birthday auto-celebration + AI slideshow + Public wishes wall để bạn bè/hàng xóm chúc mừng.",
        feature_link: "/dashboard",
        feature_name: "Birthday Auto",
      },
      {
        icon: "🕯️",
        scenario_title: '"Bé đi rồi, mình muốn lưu giữ kỷ niệm"',
        problem: "Ảnh album cũ lẫn lộn, không ai biết bé tồn tại, anniversary quên năm này qua năm khác.",
        solution: "Memorial Hall public + Visitor candle wall + Anniversary auto reminder hàng năm.",
        feature_link: "/dashboard",
        feature_name: "Memorial Hall",
      },
    ],

    ecosystem: {
      title: "Hệ sinh thái cộng hưởng — không phải mỗi feature đứng riêng",
      examples: [
        "🏥 Pet đi vet → Vet quét QR collar → Thấy full history (vaccines, BCS, allergies) → Chữa nhanh hơn 5x",
        "🤝 Match Playdate → App suggest cafe pet-friendly đã verified → 0 rủi ro bị đuổi",
        "🚨 Pet mất → Broadcast 5km → User trong vùng nhận push → Tìm được trong vòng giờ thay vì ngày",
        "🩺 BCS AI thấy bé béo → Suggest điều chỉnh khẩu phần qua Nutrition + share kết quả với bác sĩ",
        "🎉 Sinh nhật bé → Auto generate slideshow → Share Zalo → Bạn bè + cộng đồng chúc mừng",
        "⭐ Tích cực dùng app → Pet Score tăng → Match Playdate chất lượng cao hơn → Cộng đồng tin tưởng",
      ],
    },

    trust_signals: [
      {
        icon: "👨‍⚕️",
        title: "Đội ngũ vet thật",
        desc: "Mon Min Pet Clinic 10+ năm kinh nghiệm thú y. Không phải tech bro làm app pet.",
      },
      {
        icon: "📚",
        title: "Vet-validated content",
        desc: "BCS WSAVA, Triage decision tree, Glasgow Pain Scale, CCDS Cognitive senior — đều theo chuẩn y học thú y quốc tế.",
      },
      {
        icon: "🚫",
        title: "Không quảng cáo, không bán data",
        desc: "Free Phase 0. Monetize sau bằng premium features tự nguyện. Pet data của bạn — không bán cho bên thứ ba.",
      },
      {
        icon: "📍",
        title: "Cộng đồng địa phương HCM",
        desc: "Focus một thành phố trước, build network sâu thay vì spread quá rộng làm loãng giá trị.",
      },
      {
        icon: "🔓",
        title: "Open ecosystem",
        desc: "Vet partner integration. QR Passport ai cũng scan được. Không khoá data vào platform.",
      },
    ],

    compare_table: {
      headers: ["Tình huống", "Tự làm / FB group", "VowVet"],
      rows: [
        ["Tìm bạn chơi cho pet", "Tin lời người lạ vaccine", "Verify ≥2 vaccine + AI compatibility match"],
        ["Báo pet mất", "In tờ rơi, post FB", "Broadcast 5km + AI compare ảnh sighting"],
        ["Đặt lịch vaccine", "Note Google Calendar tay", "Push reminder 14/7/1d/overdue tự động"],
        ["Đánh giá thể trạng", 'Đoán "hơi mập"', "AI WSAVA 1-9 chuẩn vet"],
        ["Tìm chỗ đi chơi", "Hỏi FB group", "22+ địa điểm verified + reviews"],
        ["Khẩn cấp pet ốm", "Hoảng loạn gọi đại", "Triage decision tree → phân loại"],
        ["Lưu kỷ niệm bé", "Album lẫn lộn", "Memorial Hall + visitor wall + anniversary"],
        ["Pet thất lạc info", "Số chủ trong collar phai", "QR Passport public không phai"],
      ],
    },

    testimonials: [
      { name: "Chị Linh, Q.7", pet: "Lulu — Poodle", quote: "[Sau pilot 1 tháng → user thật quote]", is_placeholder: true },
      { name: "Anh Tuấn, Q.3", pet: "Mochi — mèo Anh", quote: "[Sau pilot 1 tháng → user thật quote]", is_placeholder: true },
      { name: "Cô Mai, Q.1", pet: "Bốp — Husky", quote: "[Sau pilot 1 tháng → user thật quote]", is_placeholder: true },
    ],

    cta: {
      title: "Sẵn sàng chăm sóc bé chuyên nghiệp hơn?",
      primary_label: "Bắt đầu miễn phí — 30 giây setup",
      primary_link: "/login",
      contact_label: "Hoặc liên hệ Mon Min trực tiếp",
      hotline: getHotlineDisplay(),
      hotline_e164: getHotlineE164(),
      zalo_oa: getZaloLink(),
    },

    brand: {
      legal_name: VOWVET_CONTACT.brand.legalName,
      product_name: VOWVET_CONTACT.brand.productName,
      parent_brand: VOWVET_CONTACT.brand.parentBrand,
    },
  });
});
