/**
 * Article content for /articles/[slug] — premium long-form posts that
 * back each homepage feature card. Vietnamese, professional, emotional.
 */

export type ArticleSlug =
  | "ho-chieu-pet-24-7"
  | "ai-dong-hanh-y-khoa"
  | "canh-bao-khi-hau"
  | "vaccine-wsava"
  | "dinh-duong-aafco"
  | "album-nose-print";

export type FeatureIconName =
  | "passport" | "ai" | "climate" | "syringe" | "nutrition" | "camera";

export interface ArticleSection {
  /** Optional eyebrow label (small gold uppercase) */
  eyebrow?: string;
  /** Section heading */
  heading: string;
  /** Paragraphs OR an array of bullet items (each bullet has title + body) */
  paragraphs?: string[];
  bullets?: Array<{ title: string; body: string }>;
  /** Optional pullquote */
  pullquote?: { text: string; author: string };
}

export interface Article {
  slug: ArticleSlug;
  icon: FeatureIconName;
  eyebrow: string;
  title: string;
  /** One-liner subtitle shown under H1 in hero */
  tagline: string;
  /** Hero CTA — typically links to a related VowVet feature */
  ctaLabel: string;
  ctaHref: string;
  /** Estimated reading time, in minutes */
  readMinutes: number;
  /** Body sections (rendered in order) */
  sections: ArticleSection[];
  /** Footer "next reads" — slugs to suggest */
  related: ArticleSlug[];
}

export const ARTICLES: Record<ArticleSlug, Article> = {
  "ho-chieu-pet-24-7": {
    slug: "ho-chieu-pet-24-7",
    icon: "passport",
    eyebrow: "Tính năng #01 · Bảo vệ trọn đời",
    title: "Hộ chiếu pet 24/7",
    tagline: "Một mã QR. Mọi tình huống. Bé không bao giờ lạc khỏi gia đình.",
    ctaLabel: "Tạo hộ chiếu cho bé",
    ctaHref: "/dashboard",
    readMinutes: 4,
    sections: [
      {
        eyebrow: "Vấn đề",
        heading: "Mỗi năm tại Việt Nam, hàng ngàn pet biến mất — không cần biết app, ai nhặt được cũng cứu được bé",
        paragraphs: [
          "Tới 70% trường hợp pet thất lạc xảy ra trong tích tắc: cánh cổng quên đóng, một tiếng động lớn, hay đơn giản là bé tò mò đi theo người lạ. Khi bạn nhận ra, bé đã ở một nơi không ai biết — không vòng cổ, không số điện thoại, và quan trọng nhất: không có cách nào nhanh chóng để người tốt liên hệ với bạn.",
          "Các giải pháp truyền thống — vòng cổ kim loại khắc tên, microchip — đều yêu cầu một thứ: người nhặt được pet phải có thiết bị chuyên dụng hoặc liên hệ phòng khám. Trong thực tế, người tốt nhất đó thường chỉ có một chiếc điện thoại trong tay.",
        ],
      },
      {
        eyebrow: "Giải pháp",
        heading: "QR Passport gắn vòng cổ — chỉ cần một cú scan",
        paragraphs: [
          "Mỗi pet trên VowVet được cấp một mã QR duy nhất. Mã này in trên thẻ kim loại, gắn vòng cổ. Khi ai đó nhặt được bé, họ chỉ cần dùng camera điện thoại — bất kỳ điện thoại nào, không cần cài app VowVet — quét mã QR.",
          "Trang public mở ra ngay lập tức trên trình duyệt: ảnh bé, tên, giống, năm sinh, ghi chú sức khỏe đặc biệt (dị ứng, thuốc đang dùng), và quan trọng nhất: số điện thoại chủ nhân đã được **làm mờ một phần** theo chuẩn bảo mật. Người tốt có thể bấm gọi trực tiếp — số chỉ hiển thị đầy đủ khi họ thực sự cần gọi.",
        ],
        bullets: [
          { title: "Không cần app", body: "Người nhặt được bé chỉ cần camera điện thoại — không cài VowVet, không tạo tài khoản. Mở camera, quét, gọi." },
          { title: "Bảo mật thông tin chủ", body: "Số điện thoại bị mask (***-***-***83) cho đến khi click \"Gọi cứu bé\". Chống scrape, chống spam." },
          { title: "Health data riêng tư", body: "Chỉ thông tin bé nhặt cần xem được public. Lịch sử khám, vaccine, body condition score vẫn riêng của chủ." },
        ],
      },
      {
        eyebrow: "Bản đồ cộng đồng",
        heading: "Nếu bé đi lạc — kích hoạt mạng lưới Pet Hero gần bạn",
        paragraphs: [
          "Trong vòng 5 phút, bạn có thể đăng pet đang mất lên VowVet. Hệ thống tự động broadcast tới tất cả pet owner trong bán kính 5km có push notification bật. Một mạng lưới hàng trăm \"thám tử nghiệp dư\" trở thành tai mắt giúp bạn.",
          "Người nhìn thấy bé có thể báo cáo (sighting) kèm ảnh + vị trí. AI Vision của VowVet so khớp ảnh sighting với ảnh reference bạn upload — chỉ đẩy push cho bạn khi confidence ≥ threshold, tránh nhiễu thông tin.",
        ],
        pullquote: {
          text: "Một pet lạc không còn là câu chuyện cô đơn của một gia đình. Đó là sứ mệnh của cả cộng đồng.",
          author: "BSTY Mon Min Pet · Đội ngũ chuyên môn",
        },
      },
      {
        eyebrow: "Cách bắt đầu",
        heading: "3 bước để bé có hộ chiếu",
        bullets: [
          { title: "1. Tạo profile bé", body: "Upload ảnh bé từ nhiều góc (face, profile, full body, distinguishing marks). Hệ thống lưu mã QR sinh tự động." },
          { title: "2. In thẻ kim loại", body: "VowVet hỗ trợ in tag QR chuyên nghiệp giao tận nhà, hoặc tự in tại bất kỳ shop in nào — file PNG/SVG có sẵn trong dashboard." },
          { title: "3. Gắn vòng cổ", body: "Thẻ chống nước, chống xước. Khuyến nghị thay khi bé thay vòng cổ mới (mỗi 6 tháng cho chó con đang lớn)." },
        ],
      },
    ],
    related: ["ai-dong-hanh-y-khoa", "album-nose-print", "canh-bao-khi-hau"],
  },

  "ai-dong-hanh-y-khoa": {
    slug: "ai-dong-hanh-y-khoa",
    icon: "ai",
    eyebrow: "Tính năng #02 · Đồng hành 365 ngày",
    title: "AI đồng hành y khoa",
    tagline: "Bác sĩ thú y tiếng Việt trong túi áo bạn — 30 giây mỗi sáng.",
    ctaLabel: "Check-in cho bé ngay",
    ctaHref: "/dashboard",
    readMinutes: 5,
    sections: [
      {
        eyebrow: "Tại sao",
        heading: "Chủ nuôi giỏi nhất không phải là người biết nhiều — là người theo dõi đều nhất",
        paragraphs: [
          "Pet không nói được. Khi bé có dấu hiệu lạ, chủ nuôi thường mất 3-7 ngày để nhận ra: \"À, bé hôm nay không ăn nhiều như mọi khi\", \"Hình như bé lười đi dạo hơn\". Đến khi quyết định mang bé tới phòng khám, vấn đề đã tiến triển — chi phí điều trị tăng gấp 3-5 lần.",
          "Giải pháp không phải là làm cho chủ nuôi học y khoa thú y. Giải pháp là biến quan sát hằng ngày thành dữ liệu, và để **AI làm việc khó**: phát hiện xu hướng bất thường, gợi ý mức độ khẩn cấp, đề xuất hành động cụ thể.",
        ],
      },
      {
        eyebrow: "Cách hoạt động",
        heading: "Check-in 30 giây · Care plan cả ngày",
        paragraphs: [
          "Mỗi sáng, VowVet hỏi bạn 4 câu cực ngắn về bé: ăn uống thế nào, năng lượng ra sao, phân có bình thường không, có triệu chứng gì lạ không. Bạn tap 30 giây là xong.",
        ],
        bullets: [
          { title: "Phân tích Gemini AI", body: "Câu trả lời được chuyển cho Google Gemini với context: giống bé, tuổi, BCS, vaccine status, lịch sử check-in 7 ngày gần nhất. AI hiểu pattern riêng của bé." },
          { title: "Care Plan tiếng Việt", body: "Trả về 3-5 hành động cụ thể: \"Bé Mon ăn ít 2 ngày — thử trộn 50% pate ướt với khẩu phần khô. Nếu sau 24h vẫn ăn ít → ưu tiên check răng miệng.\"" },
          { title: "Triage urgency 1-5", body: "Mức 1-2: tự theo dõi. Mức 3-4: lịch khám trong 24-48h. Mức 5: cấp cứu ngay — hệ thống đề xuất phòng khám gần nhất + hotline 0779 029 133." },
        ],
      },
      {
        eyebrow: "An toàn",
        heading: "AI không thay thế bác sĩ — AI giúp bạn biết KHI NÀO cần bác sĩ",
        paragraphs: [
          "VowVet không kê thuốc, không chẩn đoán bệnh cụ thể. Vai trò của AI là **screening** — như y tá đầu giường: thu thập thông tin, đánh giá độ khẩn, kết nối bạn với chuyên gia khi cần.",
          "Mọi đề xuất AI đều có disclaimer rõ ràng. Mọi triệu chứng nghiêm trọng (chảy máu, co giật, khó thở, đột quỵ) đều bypass AI và bật cảnh báo cấp cứu ngay — không chờ phân tích.",
        ],
        pullquote: {
          text: "AI tốt nhất là AI biết khi nào nên im lặng và chuyển bạn cho bác sĩ.",
          author: "BSTY Mon Min Pet",
        },
      },
      {
        eyebrow: "Học theo thời gian",
        heading: "Càng dùng lâu, AI càng hiểu bé hơn",
        paragraphs: [
          "Sau 30 ngày check-in, VowVet có \"baseline\" hành vi của bé: lượng ăn trung bình, mức năng lượng theo mùa, pattern phân, dao động cân nặng. Khi có lệch chuẩn 15% so với baseline, AI proactive nhắc bạn trước khi vấn đề thành bệnh.",
          "Đây là khác biệt giữa \"app hỏi mỗi sáng\" và \"AI thực sự đồng hành\": ngữ cảnh cá nhân hoá theo từng bé, không phải template chung cho mọi loài.",
        ],
      },
    ],
    related: ["vaccine-wsava", "dinh-duong-aafco", "canh-bao-khi-hau"],
  },

  "canh-bao-khi-hau": {
    slug: "canh-bao-khi-hau",
    icon: "climate",
    eyebrow: "Tính năng #03 · Bảo vệ chủ động",
    title: "Cảnh báo khí hậu thời gian thực",
    tagline: "Nhiệt độ, độ ẩm, AQI tại nơi bạn sống — push trước khi nguy hiểm.",
    ctaLabel: "Bật cảnh báo khí hậu",
    ctaHref: "/alerts",
    readMinutes: 4,
    sections: [
      {
        eyebrow: "Bối cảnh",
        heading: "TP. HCM 35°C buổi chiều — đối với chó mặt ngắn là vùng tử thần",
        paragraphs: [
          "Việt Nam có khí hậu đặc thù với pet: nắng gắt mùa khô, độ ẩm cao mùa mưa, AQI biến động mạnh đặc biệt ở HCM và Hà Nội. Giống brachycephalic (mặt ngắn — Pug, Bulldog Pháp, Persian) có thể đột quỵ nhiệt chỉ sau 15 phút phơi nắng ở 33°C.",
          "Vấn đề là: khi bạn đang ở văn phòng, bạn không biết bé ở nhà đang gặp gì. Khi bạn rảnh check thời tiết, có thể đã quá muộn.",
        ],
      },
      {
        eyebrow: "Giải pháp",
        heading: "Sentinel hoạt động 24/7 — push notification khi cần",
        bullets: [
          { title: "Nguồn dữ liệu thật", body: "VowVet đọc nhiệt độ + độ ẩm + AQI từ Open-Meteo (WMO standard) + IQAir (PM2.5). Cập nhật mỗi 30 phút cho từng quận." },
          { title: "Cá nhân hoá theo bé", body: "Cảnh báo dựa trên species + breed + age + BCS. Pug 4 tuổi BCS 7 = ngưỡng cảnh báo 31°C. Husky cùng nhà = ngưỡng cảnh báo 28°C." },
          { title: "Push thực sự kịp thời", body: "Web Push API qua service worker — đến tay bạn trong vòng 60 giây, không cần mở app, không cần internet pet ổn định." },
        ],
      },
      {
        eyebrow: "5 loại cảnh báo",
        heading: "Mỗi cảnh báo kèm hành động cụ thể",
        bullets: [
          { title: "🔥 Sốc nhiệt sắp xảy ra", body: "Nhiệt độ vượt ngưỡng giống bé. Hành động: đóng cửa sổ, bật điều hoà 26-28°C, không dắt đi dạo cho đến 18h." },
          { title: "💧 Khô hanh nguy cơ mất nước", body: "Độ ẩm < 40% + nhiệt độ > 30°C. Hành động: refill nước 4 lần/ngày, thêm 1 bữa pate ướt." },
          { title: "🌫️ AQI nguy hiểm phổi", body: "PM2.5 > 100 µg/m³. Hành động: giữ trong nhà, tránh đi dạo, lọc không khí phòng bé ngủ." },
          { title: "🌧️ Mưa axit / sấm sét", body: "Cảnh báo mưa lớn + áp suất giảm — pet sợ sấm cần chuẩn bị môi trường yên tĩnh." },
          { title: "❄️ Sương lạnh ban đêm Đà Lạt", body: "Cho vùng cao: < 18°C cảnh báo bé giống Việt (ngắn lông) — đặt chăn, di chuyển khỏi sàn lạnh." },
        ],
      },
      {
        eyebrow: "Sẵn sàng cho festival",
        heading: "Tết, Noel, Vu Lan — không chỉ thời tiết",
        paragraphs: [
          "Festival Detector của VowVet quét lịch âm + Dương. 3 ngày trước Tết, hệ thống cảnh báo: pháo hoa, giao thông đông đúc tăng nguy cơ pet thất lạc + sang chấn tiếng động. Đề xuất chuẩn bị: kiểm tra QR Passport còn rõ, chuẩn bị crate an toàn, chuẩn bị thuốc an thần nhẹ nếu BS chỉ định.",
        ],
      },
    ],
    related: ["vaccine-wsava", "ho-chieu-pet-24-7", "ai-dong-hanh-y-khoa"],
  },

  "vaccine-wsava": {
    slug: "vaccine-wsava",
    icon: "syringe",
    eyebrow: "Tính năng #04 · Phòng bệnh chuẩn quốc tế",
    title: "Lịch tiêm chuẩn WSAVA",
    tagline: "9 mũi vaccine theo Hội Thú y Thế giới — nhắc trước 14/7/1 ngày.",
    ctaLabel: "Xem lịch tiêm của bé",
    ctaHref: "/vaccines",
    readMinutes: 6,
    sections: [
      {
        eyebrow: "Tiêu chuẩn",
        heading: "WSAVA là gì — và tại sao quan trọng?",
        paragraphs: [
          "**WSAVA** (World Small Animal Veterinary Association) là Hội Thú y Thế giới, ban hành **VGG Guidelines** — bộ hướng dẫn vaccine chính thức được công nhận tại 80+ quốc gia. Đây là gold standard mà mọi phòng khám thú y có chuyên môn đều tham chiếu.",
          "Tại Việt Nam, nhiều chủ nuôi chỉ tiêm theo \"lời khuyên của bạn bè\" hoặc \"phòng khám gần nhà\" — kết quả: lịch tiêm bị tự ý thay đổi, mũi cần thiết bị bỏ qua, mũi không cần thiết tiêm dư gây tốn kém + phản ứng phụ không cần.",
        ],
      },
      {
        eyebrow: "Chuẩn VowVet áp dụng",
        heading: "9 mũi cốt lõi cho chó + 5 mũi cho mèo",
        bullets: [
          { title: "Chó (Dog Core Vaccines)", body: "DHPP (Distemper, Hepatitis, Parvo, Parainfluenza) - mũi đầu 6-8 tuần, booster 10-12 tuần, 14-16 tuần. Rabies (Dại) bắt buộc theo Luật Việt Nam - mũi đầu 12 tuần. Bordetella, Lyme, Leptospirosis theo lifestyle." },
          { title: "Mèo (Cat Core Vaccines)", body: "FVRCP (Rhinotracheitis, Calicivirus, Panleukopenia) - mũi đầu 6-8 tuần, booster. FeLV cho mèo đi ngoài trời. Rabies theo Luật." },
          { title: "Booster annual / triennial", body: "WSAVA khuyến nghị tái chủng theo chu kỳ 1-3 năm tuỳ vaccine. VowVet auto-track lịch cho từng mũi riêng." },
        ],
      },
      {
        eyebrow: "Cách VowVet nhắc",
        heading: "3 tầng nhắc — không bao giờ trễ",
        bullets: [
          { title: "14 ngày trước hạn", body: "Push + email: \"Bé Mon sắp đến hạn tiêm DHPP booster vào ngày 25/06. Đặt lịch phòng khám của bạn ngay hôm nay.\"" },
          { title: "7 ngày trước hạn", body: "Push: \"Còn 7 ngày — đã đặt lịch chưa?\" Có button \"Mở danh sách phòng khám đối tác\" hiển thị khoảng cách + đánh giá." },
          { title: "1 ngày trước hạn", body: "Push: \"Mai là ngày tiêm. Chuẩn bị: nhịn ăn 2h trước? Kiểm tra crate? Mang sổ vaccine giấy?\"" },
        ],
      },
      {
        eyebrow: "Lưu trữ sổ vaccine",
        heading: "Sổ giấy bị mất? VowVet đã có bản digital",
        paragraphs: [
          "Mỗi mũi tiêm được lưu kèm: ngày tiêm, loại vaccine, lô (batch number), phòng khám thực hiện, ảnh chụp sổ giấy. Khi bé sang phòng khám mới hoặc cần xuất cảnh, bạn export PDF trong 30 giây.",
          "Quan trọng nhất: khi bé lạc và được đưa tới phòng khám lạ, BS có thể scan QR Passport → thấy ngay vaccine status → quyết định điều trị an toàn (đặc biệt: rabies status quyết định phòng dại post-exposure cho nhân viên y tế).",
        ],
        pullquote: {
          text: "Vaccine là hợp đồng giữa bạn và bé — một mũi đúng lúc tiết kiệm 100 lần chi phí khi bé bệnh.",
          author: "BSTY Mon Min Pet",
        },
      },
    ],
    related: ["dinh-duong-aafco", "ai-dong-hanh-y-khoa", "ho-chieu-pet-24-7"],
  },

  "dinh-duong-aafco": {
    slug: "dinh-duong-aafco",
    icon: "nutrition",
    eyebrow: "Tính năng #05 · Dinh dưỡng khoa học",
    title: "Dinh dưỡng cá nhân hoá",
    tagline: "AAFCO standard. Calo target theo bé. Brand curated bởi BS Thú y.",
    ctaLabel: "Xem catalog dinh dưỡng",
    ctaHref: "/food-brands",
    readMinutes: 5,
    sections: [
      {
        eyebrow: "Khoảng cách",
        heading: "Người Việt yêu pet — nhưng chưa quen chuẩn dinh dưỡng",
        paragraphs: [
          "Khảo sát của Mon Min Pet 2025 trên 500 chủ nuôi HCM: 72% không biết AAFCO là gì, 58% cho pet ăn cơm trộn thịt như người, 31% chỉ cho ăn thịt hoặc chỉ cho ăn hạt khô loại rẻ nhất Co.opmart. Hậu quả: bệnh tiêu hoá, béo phì, suy giảm chức năng thận trung niên.",
          "Vấn đề không phải chủ nuôi không yêu — vấn đề là **không có hướng dẫn rõ ràng và phù hợp với điều kiện Việt Nam**.",
        ],
      },
      {
        eyebrow: "AAFCO là gì",
        heading: "Hiệp hội Kiểm soát Thức ăn Hoa Kỳ — tiêu chuẩn vàng",
        paragraphs: [
          "**AAFCO** (Association of American Feed Control Officials) thiết lập \"Nutrient Profiles\" — yêu cầu dinh dưỡng tối thiểu cho từng giai đoạn pet: growth (puppy/kitten), maintenance (adult), all life stages, reproduction.",
          "Một brand thức ăn thật sự an toàn sẽ ghi rõ trên bao bì: **\"Formulated to meet the nutritional levels established by the AAFCO Dog/Cat Food Nutrient Profiles for [life stage]\"**. Bao bì không có dòng này = không có bằng chứng dinh dưỡng đủ.",
        ],
      },
      {
        eyebrow: "Cách VowVet phân tích cho bé",
        heading: "Calo target = f(species, weight, BCS, age, life stage, activity)",
        bullets: [
          { title: "Bước 1: Tính RER", body: "Resting Energy Requirement = 70 × (cân nặng kg ^ 0.75). Đây là calo bé cần khi chỉ nằm yên không vận động." },
          { title: "Bước 2: Áp factor", body: "Adult thường: ×1.6. Puppy 0-4 tháng: ×3. Sterilized: ×1.4. Béo phì cần giảm cân: ×1.0. Vận động nhiều: ×2-2.5." },
          { title: "Bước 3: Phân bổ macros", body: "Protein, fat, carb tỉ lệ theo loài + life stage. AAFCO Adult Dog min: 18% protein, 5% fat. Adult Cat: 26% protein, 9% fat (cat là obligate carnivore)." },
          { title: "Bước 4: Lọc dị ứng", body: "Bé từng có check-in 'tiêu chảy sau khi ăn X' → VowVet tag X vào allergen list cá nhân. Catalog brand tự động lọc bỏ brand chứa X." },
        ],
      },
      {
        eyebrow: "Brand curated",
        heading: "100+ thương hiệu — Mon Min Pet recommended được đánh dấu",
        paragraphs: [
          "Catalog VowVet có hơn 100 brand thức ăn đang bán tại Việt Nam (Royal Canin, Hill's, Orijen, Acana, Wellness, Taste of the Wild, Pedigree, Whiskas, các brand local như VinaPet, Tu Cana...). Mỗi brand được tag rõ: species, life stage, protein source, có AAFCO statement không, mon-min-recommended hay không.",
          "Brand có dấu **🌟 Mon Min Pet recommended** = Đội ngũ BSTY Mon Min Pet đã review và đảm bảo chất lượng cho điều kiện Việt Nam (giá hợp lý, dễ mua, không có thành phần gây dị ứng phổ biến cho pet Việt).",
        ],
        pullquote: {
          text: "Hạt khô không có công thức AAFCO — không khác gì cho bé ăn ngẫu nhiên. Đó là cảm tính, không phải dinh dưỡng.",
          author: "BSTY Mon Min Pet",
        },
      },
      {
        eyebrow: "Forbidden foods",
        heading: "DB cập nhật cho thị trường Việt",
        paragraphs: [
          "VowVet tích hợp DB forbidden foods riêng cho pet Việt Nam: chocolate, hành tỏi, nho (chó), cá sống (mèo), xương gà nấu chín, măng cụt, bơ. Khi bạn log meal có chứa item này, hệ thống cảnh báo tức thì + đề xuất triage urgency.",
        ],
      },
    ],
    related: ["vaccine-wsava", "ai-dong-hanh-y-khoa", "canh-bao-khi-hau"],
  },

  "album-nose-print": {
    slug: "album-nose-print",
    icon: "camera",
    eyebrow: "Tính năng #06 · Kỷ niệm + Nhận diện",
    title: "Album kỷ niệm + Nose Print",
    tagline: "Lưu trọn đời bé. Dấu mũi như vân tay — công nghệ nghiên cứu sớm.",
    ctaLabel: "Bắt đầu album bé",
    ctaHref: "/dashboard",
    readMinutes: 4,
    sections: [
      {
        eyebrow: "Lý do",
        heading: "Pet không sống mãi — nhưng kỷ niệm thì có",
        paragraphs: [
          "Trung bình một chú chó sống 10-15 năm, mèo 12-18 năm. Đó là khoảng thời gian đủ để bé trở thành phần không thể tách của gia đình — và là khoảng thời gian đủ dài để chúng ta lưu lại từng khoảnh khắc.",
          "Album ảnh trong điện thoại bị xoá khi đổi máy. Facebook memory thì giới hạn. VowVet xây Photo Gallery cá nhân hoá cho từng pet, lưu trên cloud R2, organize theo ngày tự động + tag theo loại ảnh (face, full body, play, sick, milestone).",
        ],
      },
      {
        eyebrow: "Photo types",
        heading: "Mỗi loại ảnh phục vụ một mục đích",
        bullets: [
          { title: "Face / Profile", body: "Ảnh chân dung cận cảnh — dùng cho avatar + matching khi bé lạc. Khuyến nghị: chụp mới mỗi 3 tháng (chó con lớn nhanh, mặt thay đổi)." },
          { title: "Full body", body: "Toàn thân nhiều góc — đánh giá BCS (Body Condition Score) qua thời gian. Cũng dùng cho sighting matching nếu lạc." },
          { title: "Distinguishing marks", body: "Đặc điểm độc nhất: vết sẹo, dấu lông trắng đỉnh đầu, vết bớt. Critical cho identification." },
          { title: "Nose print 🆕", body: "Cận cảnh dấu mũi — chi tiết bên dưới." },
          { title: "Milestone moments", body: "Ngày sinh nhật, ngày chuyển nhà, ngày học được trò mới. Tag để 5 năm sau xem lại không quên." },
        ],
      },
      {
        eyebrow: "Khoa học",
        heading: "Nose Print là vân tay của pet",
        paragraphs: [
          "Mỗi pet có nose print (dấu mũi) **độc nhất**, không pet nào trên thế giới giống nhau — tương tự vân tay người. Pattern bao gồm: ridges (rãnh), pores (lỗ), shape contour. Pattern này hình thành cố định khi bé 3 tháng tuổi và không thay đổi suốt đời.",
          "Tại Hoa Kỳ và Nhật Bản, nose print đã được dùng làm bằng chứng ID pet trong tranh chấp pháp lý và lost-and-found chính thức. Tại Việt Nam, công nghệ này vẫn ở **giai đoạn nghiên cứu sớm** — VowVet đang xây dataset.",
        ],
      },
      {
        eyebrow: "Cách bạn đóng góp",
        heading: "Upload nose print = giúp cộng đồng + bảo vệ bé",
        bullets: [
          { title: "Cách chụp đúng", body: "Khoảng cách 10cm. Mũi sạch, không ướt nước. Đèn flash gián tiếp hoặc nắng tự nhiên. Camera điện thoại đủ — không cần thiết bị chuyên dụng." },
          { title: "VowVet làm gì với ảnh", body: "Lưu encrypted trên R2. Trích feature vector (không lưu ảnh raw cho ML). Khi có pet thất lạc + sighting có nose print, AI Match so khớp pattern → confidence score." },
          { title: "Privacy", body: "Nose print KHÔNG public trong QR Passport — chỉ owner và authorized vet xem được. Chống misuse." },
        ],
        pullquote: {
          text: "Một ngày, công nghệ này có thể là điều duy nhất chứng minh bé là của bạn. Hôm nay, đó là kỷ niệm đẹp.",
          author: "BSTY Mon Min Pet",
        },
      },
      {
        eyebrow: "Yearbook tự động",
        heading: "Cuối năm, VowVet làm tặng bạn một cuốn lưu bút",
        paragraphs: [
          "Mỗi 31/12, hệ thống generate Yearbook tự động: 12 ảnh đẹp nhất (chọn bằng AI dựa vào sharpness + composition + face detection), milestone log, biểu đồ tăng trưởng cân nặng, vaccine completed, các adventure đi cùng. Export PDF in được.",
          "Một số chủ nuôi đã in thành album giấy treo phòng khách. Một số tặng cho bố mẹ làm quà Tết. Một vài người đã giữ Yearbook sau khi bé qua đời — như một cách nói lời tạm biệt trọn vẹn.",
        ],
      },
    ],
    related: ["ho-chieu-pet-24-7", "ai-dong-hanh-y-khoa", "vaccine-wsava"],
  },
};

export function getArticle(slug: string): Article | null {
  return (ARTICLES as Record<string, Article>)[slug] || null;
}

export function listArticles(): Article[] {
  return Object.values(ARTICLES);
}
