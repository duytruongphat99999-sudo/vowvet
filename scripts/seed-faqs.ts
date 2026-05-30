/**
 * Seed initial FAQ content (M31).
 *
 * Idempotent: skips if a row with the same question already exists.
 * Run after migrate-m31-triage-tree-faqs.ts.
 *
 * 30 Q&As covering: health (5), nutrition (5), training (4), emergency (5),
 * app_usage (8), other (3).
 */
import { listRows } from "../shared/baserow.ts";
import { createFaqRow, type FaqCategory } from "../api/src/lib/faqs.ts";

interface Seed { category: FaqCategory; q: string; a: string; order: number; }

const SEED_FAQS: Seed[] = [
  // ===== HEALTH (10..50) =====
  { category: "health", order: 10, q: "Bé bao nhiêu tuổi cần kiểm tra sức khoẻ định kỳ?",
    a: "Bé dưới 7 tuổi: 1 lần/năm. Bé senior (≥7 tuổi đối với chó, ≥10 tuổi đối với mèo): mỗi 6 tháng. Lịch tiêm phòng đầy đủ trong tab Vaccines. Liên hệ VowVet (0779 029 133) để được tư vấn lịch khám." },
  { category: "health", order: 20, q: "BCS là gì?",
    a: "BCS (Body Condition Score) là thang điểm 1-9 đánh giá thể trạng bé. Bé lý tưởng = 4-5 điểm. 1-3 = thiếu cân, 6-7 = thừa cân, 8-9 = béo phì. VowVet có tính năng chấm BCS bằng AI từ ảnh trong tab /pets/[id]/bcs." },
  { category: "health", order: 30, q: "Khi nào cần đi vet gấp?",
    a: "Triệu chứng cấp cứu: chảy máu rõ, khó thở, co giật, nuốt vật lạ, ói liên tục > 5 lần/24h, không đứng dậy được, mất ý thức. Dùng Triage trong app để phân loại nhanh. Trường hợp khẩn: gọi 0779 029 133." },
  { category: "health", order: 40, q: "Vaccine quan trọng nhất cho chó / mèo là gì?",
    a: "Chó: DHPPL (5in1) + Rabies. Mèo: FVRCP (3in1) + Rabies. Bé puppy/kitten cần series 3 mũi (6-8 tuần, 10-12 tuần, 14-16 tuần). Sau đó booster mỗi năm. Tab Vaccines trong app sẽ tự nhắc lịch." },
  { category: "health", order: 50, q: "Pet Score là gì?",
    a: "Pet Score là điểm 0-1000 tổng hợp sức khoẻ bé dựa trên 13 yếu tố: vaccine, BCS, check-in streak, routine, đau/vận động/nhận thức, lượng nước, dị ứng. Vào /pets/[id]/pet-score để xem chi tiết + khuyến nghị để tăng điểm." },

  // ===== NUTRITION (10..50) =====
  { category: "nutrition", order: 10, q: "Bé chó/mèo trưởng thành ăn mấy bữa/ngày?",
    a: "Chó trưởng thành: 2 bữa/ngày (sáng + chiều). Mèo: 2-3 bữa hoặc free-feed (mèo ăn nhiều bữa nhỏ trong ngày). Puppy/kitten dưới 6 tháng: 3-4 bữa/ngày. Sau khi ăn, không nên cho bé vận động mạnh 30-60 phút." },
  { category: "nutrition", order: 20, q: "Bé ăn được thức ăn của người không?",
    a: "KHÔNG nên cho ăn đồ người làm thức ăn chính. ĐẶC BIỆT CẤM: chocolate, nho/nho khô, hành/tỏi, xylitol (đường ăn kiêng), xương gà nấu chín, cà phê, rượu, bơ (avocado), nấm. Tab Nutrition trong app có khẩu phần chuẩn." },
  { category: "nutrition", order: 30, q: "Pet bị dị ứng thức ăn nhận biết thế nào?",
    a: "Dấu hiệu: gãi nhiều (đặc biệt mặt/chân/tai), tiêu chảy mãn, viêm tai mãn tính, rụng lông cục bộ. Cần thử loại trừ (elimination diet) từng nhóm thực phẩm trong 6-8 tuần. Chat Zalo VowVet để được tư vấn cụ thể." },
  { category: "nutrition", order: 40, q: "Bé tăng / giảm cân nên làm sao?",
    a: "Tăng cân: tăng 10% khẩu phần mỗi tuần, theo dõi BCS. Giảm cân: giảm 10% khẩu phần + tăng vận động dần. KHÔNG nhịn đói đột ngột (mèo có nguy cơ gan nhiễm mỡ). Cân bé mỗi 2 tuần. Tab Nutrition có máy tính khẩu phần theo BCS mục tiêu." },
  { category: "nutrition", order: 50, q: "Bé uống bao nhiêu nước mỗi ngày?",
    a: "Chuẩn: 50-100ml/kg cân nặng/ngày. Trời nóng > 25°C tăng thêm 10% mỗi 5°C tăng. Tab /pets/[id]/water tự tính + cảnh báo nếu bé uống quá ít (mất nước) hoặc quá nhiều (polydipsia — dấu hiệu bệnh thận, tiểu đường)." },

  // ===== TRAINING (10..40) =====
  { category: "training", order: 10, q: "Khi nào nên bắt đầu training?",
    a: "Puppy: từ 8 tuần tuổi. Kitten: 7-9 tuần. Càng sớm càng dễ. Bắt đầu với: phản hồi tên, sit, đi vệ sinh đúng chỗ, ngồi yên khi ăn. Mỗi buổi 5-10 phút, lặp lại 2-3 lần/ngày." },
  { category: "training", order: 20, q: "Bé sủa nhiều phải làm sao?",
    a: "Tìm nguyên nhân trước: thiếu vận động, lo âu xa cách, đói, cảnh báo, hoặc bị kích thích bởi tiếng/người lạ. KHÔNG la mắng (phản tác dụng). Reward khi yên lặng + huấn luyện command 'Quiet'. Case nặng → consult behaviorist hoặc chat Zalo VowVet." },
  { category: "training", order: 30, q: "Làm sao huấn luyện đi vệ sinh đúng chỗ?",
    a: "Puppy: dắt ra chỗ vệ sinh sau khi ăn, sau khi ngủ dậy, sau khi chơi (mỗi 1-2 giờ). Reward ngay khi bé đi đúng chỗ. Tai nạn: dọn sạch (enzymatic cleaner) — KHÔNG dí mặt vào. Mèo: đặt khay cát ở nơi yên tĩnh, dọn cát mỗi ngày." },
  { category: "training", order: 40, q: "Bé cắn người / pet khác phải làm sao?",
    a: "Identify trigger (sợ, đau, defending territory, prey drive). Cách ly tạm thời. KHÔNG đánh — sẽ làm bé sợ + tăng aggression. Tham vấn vet behavior. Trường hợp cắn người gây thương tích → cách ly + vet ngay. Theo dõi pet 10 ngày để loại trừ dại." },

  // ===== EMERGENCY (10..50) =====
  { category: "emergency", order: 10, q: "Bé bị mất phải làm gì?",
    a: "1) Vào /pets/[id]/lost/report trong app → broadcast 5km cho cộng đồng VowVet. 2) Đến vet gần nhất check xem có ai đem đến không. 3) Đăng Facebook các nhóm Pet Lost & Found ở khu vực. 4) In poster có ảnh + SĐT. Bé có QR collar → khả năng cao hơn nhiều." },
  { category: "emergency", order: 20, q: "Nuốt vật lạ phải làm gì?",
    a: "KHÔNG gây ói nếu không có chỉ định vet (một số vật như xương, kim loại sắc, hoá chất gây hại khi ói ra). Đến vet ngay với mẫu vật (nếu còn) hoặc ảnh. Gọi 0779 029 133 để được hướng dẫn cụ thể trong khi đến vet." },
  { category: "emergency", order: 30, q: "Cấp cứu khi bị sốc nhiệt (heat stroke)?",
    a: "Đưa bé đến nơi mát NGAY. Làm ướt khăn bằng nước (KHÔNG đá lạnh) đắp bụng/chân/cổ. Quạt mát. Cho uống nước từ từ. Đến vet trong 30 phút. Giống nguy hiểm cao: Pug, Bulldog, Persian, Boxer. Phòng tránh: KHÔNG bỏ pet trong xe, vận động sáng sớm/tối." },
  { category: "emergency", order: 40, q: "Bé bị ngộ độc nghi do ăn nhầm thứ gì đó — phải làm gì?",
    a: "1) KHÔNG gây ói trước khi gọi vet. 2) Đem theo mẫu chất độc (chai, bao bì, lá cây...) hoặc ảnh. 3) Đến vet ngay — ngộ độc thường có cửa sổ 1-2h để decontaminate hiệu quả. 4) Trên đường đi gọi 0779 029 133 để vet chuẩn bị antidote." },
  { category: "emergency", order: 50, q: "Bé chảy máu nhiều phải làm gì?",
    a: "1) Băng ép vết thương bằng gạc/khăn sạch — đè chặt 5-10 phút. 2) KHÔNG thoa thuốc hoặc bột mì lên vết thương. 3) Giữ bé yên tĩnh, đưa đến vet ngay. 4) Nếu chảy máu từ tai/mũi/miệng + không có chấn thương → có thể là xuất huyết nội — cấp cứu trong 1h." },

  // ===== APP USAGE (10..80) =====
  { category: "app_usage", order: 10, q: "Làm sao chia sẻ Pet Passport?",
    a: "Vào /pets/[id] → 'Tạo QR Passport' → có link share /p/{code}. Bất kỳ ai có link (hoặc scan QR collar) đều xem được thông tin cơ bản của bé: tên, giống, vaccine, SĐT chủ (đã mask). Hữu ích khi bé bị mất." },
  { category: "app_usage", order: 20, q: "Tại sao không nhận được push notification?",
    a: "1) Kiểm tra browser cho phép notification cho vowvet.monminpet.com. 2) Cài PWA trên home screen (Add to Home Screen / Install app). 3) Settings → Notifications → bật từng category. iOS Safari yêu cầu PWA mới có push." },
  { category: "app_usage", order: 30, q: "Tôi muốn xoá tài khoản?",
    a: "Vào /account/connections → 'Xoá tài khoản'. Pet data + memorial sẽ archive 30 ngày trước khi xoá vĩnh viễn (cho phép khôi phục trong 30 ngày). Chat Zalo VowVet nếu cần hỗ trợ hoặc muốn xoá ngay." },
  { category: "app_usage", order: 40, q: "Memorial Hall hoạt động thế nào?",
    a: "Khi bé ra đi, vào /pets/[id]/memorial/create để tạo trang tưởng nhớ vĩnh viễn (miễn phí). Bạn bè có thể thắp nến + để lời nhắn qua link công khai. Mỗi năm vào ngày giỗ, VowVet sẽ nhắc gentle. KHÔNG có liên quan dịch vụ hỏa táng." },
  { category: "app_usage", order: 50, q: "Playdate là gì?",
    a: "Tính năng match Tinder-style cho pet — tìm bạn chơi phù hợp dựa trên loài, tính cách, tuổi, kích thước, khoảng cách. Cần ≥2 vaccine completed để bật profile. Vào /playdate để bắt đầu. Đọc /playdate/safety-tips trước khi gặp lần đầu." },
  { category: "app_usage", order: 60, q: "Làm sao theo dõi vaccine?",
    a: "Vào /vaccines để xem lịch toàn bộ vaccine của các bé. App tự nhắc 14 ngày, 7 ngày, 1 ngày trước hạn + ngày quá hạn qua push notification. Lịch theo chuẩn WSAVA cho chó + mèo. Có template tùy chỉnh cho bé puppy/kitten/adult/senior." },
  { category: "app_usage", order: 70, q: "Voice Diary để làm gì?",
    a: "Ghi âm 30 giây mỗi ngày về bé. AI sẽ phân tích mood + tổng kết thành 'yearbook' cuối năm. Riêng tư — chỉ chủ thấy được. Hữu ích để bắt sớm thay đổi hành vi + nhớ kỷ niệm. Vào /pets/[id]/diary." },
  { category: "app_usage", order: 80, q: "Khám phá địa điểm pet-friendly ở đâu?",
    a: "Vào /map để xem 22+ địa điểm pet-friendly ở HCMC: công viên, cafe, phòng khám, pet shop, grooming, khách sạn. Filter theo loại + bán kính. Có thể submit địa điểm mới + check-in để lưu kỷ niệm với bé." },

  // ===== OTHER (10..30) =====
  { category: "other", order: 10, q: "VowVet là gì? Có phải dịch vụ thú y trực tuyến không?",
    a: "VowVet là app chăm sóc pet do Mon Min Pet phát triển (CTY TNHH Duy Trường Phát). KHÔNG thay thế bác sĩ thú y — chỉ hỗ trợ theo dõi sức khoẻ + nhắc lịch + cộng đồng. Khi cần khám bệnh thật, đến vet hoặc gọi 0779 029 133." },
  { category: "other", order: 20, q: "Dữ liệu của tôi có an toàn không?",
    a: "Toàn bộ data lưu trên server VowVet (Việt Nam). Ảnh trên Cloudflare R2. Mật khẩu hash bằng argon2id. KHÔNG bán hay chia sẻ data với bên thứ 3. Bạn có quyền xoá tài khoản bất cứ lúc nào — data sẽ xoá vĩnh viễn sau 30 ngày archive." },
  { category: "other", order: 30, q: "Tôi muốn báo cáo bug hoặc đề xuất tính năng?",
    a: "Chat Zalo VowVet (https://zalo.me/1136810892220003266) hoặc gọi 0779 029 133. Mỗi report sẽ được phản hồi trong 1-2 ngày làm việc. Cảm ơn bạn giúp VowVet tốt hơn!" },
];

console.log(`\nSeeding ${SEED_FAQS.length} FAQs...\n`);

// Existing questions to skip duplicates
const existing = await listRows<{ id: number; question: string }>("faqs", { size: 200 });
const existingQs = new Set(existing.results.map((r) => (r.question || "").trim().toLowerCase()));

let created = 0, skipped = 0;
for (const s of SEED_FAQS) {
  if (existingQs.has(s.q.trim().toLowerCase())) {
    skipped++;
    continue;
  }
  try {
    await createFaqRow({ category: s.category, question: s.q, answer: s.a, order_num: s.order });
    created++;
    process.stdout.write(".");
  } catch (err) {
    console.error(`\n❌ Failed to seed: ${s.q.slice(0, 40)}...`, err);
  }
}

console.log(`\n\n✅ Done. Created ${created}, skipped ${skipped} (already existed).`);
