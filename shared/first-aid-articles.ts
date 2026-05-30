/**
 * First Aid Library (M9.3).
 *
 * Hardcoded TS const — vet edit thẳng file + git commit.
 * 12 articles cấp cứu phổ biến nhất cho chó/mèo VN context.
 *
 * Source: ASPCA + AAHA + Mon Min Pet clinic guidelines.
 *
 * Quy tắc nội dung:
 *   - Conservative tone — luôn end với "gọi clinic/đưa đến vet ASAP"
 *   - do_now max 5 bước (memorable trong stress)
 *   - red_flags 3-5 dấu hiệu rõ ràng
 *   - Liên kết related_symptom_ids với shared/triage-symptoms.ts
 *
 * Disclaimer: chỉ hướng dẫn sơ cứu — KHÔNG thay chẩn đoán/điều trị.
 */

export type FirstAidSeverity = "CRITICAL" | "URGENT" | "IMPORTANT";

export type FirstAidCategory =
  | "poisoning"
  | "trauma"
  | "respiratory"
  | "environmental"
  | "neurological"
  | "allergic"
  | "metabolic";

export type FirstAidSpecies = "dog" | "cat" | "both";

export interface FirstAidArticle {
  slug: string;
  title_vi: string;
  category: FirstAidCategory;
  species: FirstAidSpecies[];
  severity: FirstAidSeverity;
  preview: string;
  symptoms_to_check: string[];
  do_now: string[];
  do_not: string[];
  transport: string;
  while_waiting: string[];
  red_flags: string[];
  related_symptom_ids: string[];
}

export const CATEGORY_LABEL_VI: Record<FirstAidCategory, string> = {
  poisoning: "☠️ Ngộ độc",
  trauma: "🚨 Chấn thương",
  respiratory: "🫁 Hô hấp",
  environmental: "🌡️ Môi trường",
  neurological: "🧠 Thần kinh",
  allergic: "💊 Dị ứng",
  metabolic: "💉 Chuyển hoá",
};

export const SEVERITY_LABEL_VI: Record<FirstAidSeverity, string> = {
  CRITICAL: "🔴 NGUY KỊCH",
  URGENT: "🟠 KHẨN CẤP",
  IMPORTANT: "🟡 QUAN TRỌNG",
};

export const FIRST_AID_ARTICLES: FirstAidArticle[] = [
  // ============================================================
  // 1. POISONING — Chocolate / Onion / Grapes
  // ============================================================
  {
    slug: "poisoning-chocolate-onion",
    title_vi: "Ngộ độc thực phẩm (chocolate, hành, nho)",
    category: "poisoning",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Bé vô tình ăn chocolate, hành, tỏi, nho — hành động trong 1-2h đầu cực kỳ quan trọng.",
    symptoms_to_check: [
      "Nôn mửa nhiều lần",
      "Tiêu chảy",
      "Run rẩy, co giật",
      "Lờ đờ, khó thở",
      "Nướu nhợt nhạt hoặc đỏ bất thường",
      "Tim đập nhanh / nhịp tim không đều",
    ],
    do_now: [
      "Ghi lại loại thực phẩm + lượng đã ăn + thời gian ăn (chụp ảnh bao bì)",
      "Gọi clinic ngay lập tức — báo loại độc tố để chuẩn bị antidote",
      "Quan sát triệu chứng và ghi lại thời gian xuất hiện",
      "Giữ pet ở nơi yên tĩnh, ấm vừa phải",
      "Mang bao bì/mẫu thức ăn theo khi đến vet",
    ],
    do_not: [
      "KHÔNG tự ép pet nôn (chỉ vet có thuốc gây nôn an toàn)",
      "KHÔNG cho uống sữa/dầu/muối để 'rửa ruột' (làm nặng thêm)",
      "KHÔNG đợi xem 'có hết không' — chocolate độc theo cân lượng + thời gian",
      "KHÔNG cho ăn thêm bất cứ gì",
    ],
    transport: "Đặt pet vào lồng/giỏ có lót khăn. Giữ pet thẳng đứng nếu nôn. Đến clinic gần nhất, không nhất thiết Mon Min nếu xa hơn 30 phút.",
    while_waiting: [
      "Đảm bảo đường thở thoáng",
      "Nếu pet nôn — nghiêng đầu sang một bên tránh sặc",
      "Theo dõi nhịp thở + nướu (thay đổi báo vet ngay)",
      "KHÔNG cho nước nếu bé lờ đờ",
    ],
    red_flags: [
      "Co giật toàn thân",
      "Mất ý thức",
      "Nướu xanh tím",
      "Khó thở dữ dội",
      "Tim đập <60 hoặc >180 bpm",
    ],
    related_symptom_ids: ["ate_chocolate", "ate_grapes", "ate_onion_garlic", "vomit_repeated", "seizure"],
  },

  // ============================================================
  // 2. POISONING — Rodenticide / Pesticide
  // ============================================================
  {
    slug: "poisoning-rodenticide",
    title_vi: "Ngộ độc thuốc diệt chuột / thuốc trừ sâu",
    category: "poisoning",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Cực kỳ nguy hiểm. Có nhiều loại độc, mỗi loại cần antidote khác — mang theo bao bì.",
    symptoms_to_check: [
      "Chảy máu bất thường (nướu, phân, nước tiểu)",
      "Vết bầm tím dưới da",
      "Khó thở, ho có máu",
      "Yếu chân, mất thăng bằng",
      "Co giật, run rẩy",
      "Lờ đờ đột ngột",
    ],
    do_now: [
      "MANG THEO bao bì sản phẩm hoặc chụp ảnh nhãn — quan trọng để xác định antidote",
      "Gọi clinic IMMEDIATELY báo loại thuốc",
      "Ghi nhận thời gian ăn (nếu biết)",
      "Giữ pet yên tĩnh, hạn chế vận động (giảm circulation độc tố)",
      "Đến vet trong vòng 1h — nhiều loại có antidote nếu xử lý sớm",
    ],
    do_not: [
      "KHÔNG vứt bao bì hoặc dọn sạch hiện trường (cần evidence)",
      "KHÔNG tự cho uống thuốc giải độc 'tự nhiên' (sữa, than hoạt tính DIY)",
      "KHÔNG ép nôn — một số chất ăn mòn nôn ra càng hại",
      "KHÔNG cho ăn/uống gì cho đến khi vet hướng dẫn",
    ],
    transport: "Đặt pet trong lồng, giữ ấm. Lái xe ổn định — không phanh gấp. Người đi cùng giữ pet thẳng + theo dõi thở.",
    while_waiting: [
      "Theo dõi liên tục nhịp thở (đếm trong 15 giây × 4)",
      "Quan sát nướu — nhợt → mất máu nội tạng",
      "Ghi nhận bất kỳ máu/dịch nào pet thải ra",
      "Giữ ấm bằng chăn (sốc giảm thân nhiệt)",
    ],
    red_flags: [
      "Chảy máu từ miệng/mũi/hậu môn",
      "Nướu trắng bệt",
      "Mất ý thức",
      "Co giật liên tục",
      "Ngừng thở",
    ],
    related_symptom_ids: ["ate_rodenticide", "ate_medication", "bleeding_uncontrolled", "lethargy_severe", "seizure"],
  },

  // ============================================================
  // 3. CHOKING — Hóc dị vật
  // ============================================================
  {
    slug: "choking",
    title_vi: "Hóc dị vật (xương, đồ chơi, dây)",
    category: "respiratory",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Tắc nghẽn đường thở. Cần xử lý trong 2-3 phút trước khi thiếu oxy não.",
    symptoms_to_check: [
      "Cào miệng/cổ liên tục",
      "Ho khan, ho không ra gì",
      "Há mồm thở, không ra tiếng",
      "Nướu đỏ rồi chuyển tím",
      "Hoảng loạn, chạy điên cuồng",
      "Ngất xỉu nếu kéo dài >2 phút",
    ],
    do_now: [
      "Mở miệng nhẹ nhàng — nếu THẤY RÕ dị vật + dễ kẹp → dùng kẹp gắp ra (không thò tay sâu)",
      "Nếu không thấy: nâng pet nhỏ ngược đầu xuống vài giây + vỗ nhẹ giữa 2 vai",
      "Chó lớn: làm Heimlich — đứng sau pet, vòng tay ôm bụng dưới sườn, ép vào trong+lên 3-5 lần",
      "Mèo: ép nhẹ bụng dưới sườn về phía cột sống 3 lần",
      "Gọi clinic ngay sau khi xử lý — kể cả nếu dị vật đã ra, có thể tổn thương cổ họng",
    ],
    do_not: [
      "KHÔNG thò tay sâu vào mồm — răng cắn phản xạ rất nguy hiểm",
      "KHÔNG đập lưng mạnh không-Heimlich (không hiệu quả + đau ngực)",
      "KHÔNG ép pet uống nước/dầu (làm sặc thêm)",
      "KHÔNG đợi 'tự khạc ra' nếu pet bắt đầu xanh tím",
    ],
    transport: "Nếu đã thông được — đến vet ngay để kiểm tra tổn thương niêm mạc. Nếu vẫn tắc — gọi 1900 vet emergency + tiếp tục Heimlich trên đường.",
    while_waiting: [
      "Quan sát nướu (hồng → ổn, tím → vẫn thiếu oxy)",
      "Đếm nhịp thở mỗi phút",
      "Nếu pet ngất → kiểm tra mạch + bắt đầu CPR (xem bài CPR)",
      "Giữ pet ngồi/đứng, không nằm ngửa",
    ],
    red_flags: [
      "Nướu xanh tím kéo dài >30 giây",
      "Mất ý thức",
      "Ngừng cử động",
      "Tiếng thở rít to (stridor)",
    ],
    related_symptom_ids: ["choking", "swallowed_object", "dyspnea", "blue_gums"],
  },

  // ============================================================
  // 4. HEATSTROKE — Sốc nhiệt
  // ============================================================
  {
    slug: "heatstroke",
    title_vi: "Sốc nhiệt (heatstroke)",
    category: "environmental",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Nhiệt độ cơ thể >40°C — đặc biệt HCM mùa nóng + giống mặt ngắn (Pug/Bulldog/Persian).",
    symptoms_to_check: [
      "Thở dốc dữ dội, lưỡi đỏ tươi/tím",
      "Chảy dãi nhiều như nước",
      "Nướu đỏ thẫm rồi nhợt",
      "Mất thăng bằng, ngã",
      "Nôn, tiêu chảy có máu",
      "Co giật, hôn mê",
    ],
    do_now: [
      "Đưa vào nơi mát có gió/quạt NGAY (KHÔNG điều hoà lạnh đột ngột)",
      "Làm ướt body bằng nước thường (KHÔNG nước đá) — tập trung bụng, nách, bẹn",
      "Cho uống nước mát từng ngụm NHỎ — KHÔNG ép uống nhiều",
      "Quạt mạnh trên body ướt → bốc hơi giúp hạ nhiệt",
      "Gọi clinic — kể cả khi đã có vẻ ổn, organ damage có thể delayed 24-48h",
    ],
    do_not: [
      "KHÔNG dùng nước đá / ice cube — co mạch + delay heat release + shock",
      "KHÔNG bọc kín bằng khăn ướt — giữ nhiệt ngược",
      "KHÔNG ép uống nước nhiều cùng lúc (gây nôn + sặc)",
      "KHÔNG tự cho thuốc hạ sốt người (paracetamol → CHẾT chó/mèo)",
    ],
    transport: "Lên xe có điều hoà 22-24°C (không quá lạnh). Tiếp tục lau body bằng khăn ướt. Mở cửa kính cho gió. Đến vet trong 30 phút.",
    while_waiting: [
      "Đo nhiệt độ hậu môn nếu có nhiệt kế (mục tiêu hạ về 39°C rồi dừng làm mát)",
      "Theo dõi nhịp thở — vẫn dốc sau 15 phút mát = cần khẩn cấp",
      "Quan sát nướu — chuyển hồng lại là dấu hiệu tốt",
      "Ghi nhận thời điểm pet bắt đầu có triệu chứng",
    ],
    red_flags: [
      "Nhiệt độ >41.5°C",
      "Co giật",
      "Mất ý thức",
      "Tiêu chảy có máu",
      "Không hạ nhiệt sau 20 phút làm mát",
    ],
    related_symptom_ids: ["heatstroke_signs", "dyspnea", "blue_gums", "seizure", "unconscious"],
  },

  // ============================================================
  // 5. SEIZURE — Co giật
  // ============================================================
  {
    slug: "seizure",
    title_vi: "Co giật (động kinh)",
    category: "neurological",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Cơn co giật >5 phút HOẶC >3 cơn/24h là cấp cứu (status epilepticus).",
    symptoms_to_check: [
      "Cứng đờ toàn thân hoặc giật từng cụm cơ",
      "Mất ý thức, không phản ứng",
      "Chảy dãi, đại tiểu tiện không kiểm soát",
      "Mắt trợn, đồng tử dãn",
      "Sau cơn — lờ đờ, mất phương hướng 15-30 phút",
    ],
    do_now: [
      "TÍNH THỜI GIAN cơn giật (dùng đồng hồ) — quan trọng cho vet",
      "Dọn dẹp xung quanh: bỏ đồ vật cứng, mở cửa để không va đập",
      "Tắt đèn sáng, giảm tiếng ồn (kích thích kéo dài cơn)",
      "Quan sát từ xa — KHÔNG ôm/giữ pet",
      "Quay video cơn giật nếu có thể (cho vet chẩn đoán nguyên nhân)",
    ],
    do_not: [
      "KHÔNG ĐÚT TAY/ĐỒ VẬT VÀO MỒM — myth nguy hiểm, pet không nuốt lưỡi được",
      "KHÔNG ôm chặt — có thể làm pet thương tật + bạn bị cắn",
      "KHÔNG cho ăn/uống ngay sau cơn — pet còn lờ đờ dễ sặc",
      "KHÔNG di chuyển pet trong khi cơn đang xảy ra",
    ],
    transport: "Đợi cơn giật dứt + pet tỉnh táo lại (15-30 phút). Đặt vào lồng có lót khăn, để pet nằm nghiêng. Đến vet trong 1-2h sau cơn để chẩn đoán nguyên nhân.",
    while_waiting: [
      "Đếm số cơn giật + thời lượng mỗi cơn",
      "Quan sát có recovery hay không — pet bình thường lại trong 30 phút?",
      "Giữ pet ấm + yên tĩnh sau cơn",
      "KHÔNG cho thuốc nào (kể cả thuốc động kinh cũ nếu pet đang dùng)",
    ],
    red_flags: [
      "Cơn giật >5 phút liên tục",
      "Pet không tỉnh lại giữa 2 cơn",
      "≥3 cơn trong 24h",
      "Co giật + sốt cao",
      "Co giật ở pet <6 tháng hoặc >7 tuổi (rare nguyên nhân nghiêm trọng)",
    ],
    related_symptom_ids: ["seizure", "tremor", "unconscious", "disorientation"],
  },

  // ============================================================
  // 6. SEVERE BLEEDING — Chảy máu nặng
  // ============================================================
  {
    slug: "severe-bleeding",
    title_vi: "Chảy máu nặng (đứt động mạch / vết thương sâu)",
    category: "trauma",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Máu phun thành tia / chảy không cầm sau 5 phút ép — có thể đứt động mạch.",
    symptoms_to_check: [
      "Máu chảy thành tia / phun (động mạch) hoặc rỉ liên tục (tĩnh mạch)",
      "Vết thương sâu thấy mô bên trong",
      "Pet nhợt nhạt, yếu",
      "Tim đập nhanh, thở dốc",
      "Nướu trắng bệt",
    ],
    do_now: [
      "Đeo găng tay (nếu có) hoặc dùng khăn sạch",
      "ÉP TRỰC TIẾP lên vết thương bằng gạc sạch, GIỮ NGUYÊN — không nhấc ra kiểm tra",
      "Nếu gạc thấm máu — chồng thêm gạc lên, không thay",
      "Nâng cao chi bị thương (nếu là chân) nếu pet chấp nhận + không nghi gãy xương",
      "Gọi clinic + đến trong 30 phút",
    ],
    do_not: [
      "KHÔNG tháo gạc liên tục để kiểm tra (cản đông máu)",
      "KHÔNG dùng dây thắt chặt (tourniquet) trừ khi vet hướng dẫn — có thể hoại tử",
      "KHÔNG rắc bột nghệ/than hoạt tính/tro lên (nhiễm trùng + cản chữa)",
      "KHÔNG cho uống nước/thuốc giảm đau",
    ],
    transport: "Giữ ép vết thương cả trên đường. Đặt pet nằm nghiêng, đầu hơi thấp (chống choáng). Chăn ấm để giữ nhiệt.",
    while_waiting: [
      "Theo dõi nướu — vẫn hồng = chưa shock; trắng = mất máu nhiều",
      "Đếm nhịp thở (bình thường 10-30/phút)",
      "Giữ ấm bằng chăn",
      "Nếu pet mất ý thức → kiểm tra mạch + sẵn sàng CPR",
    ],
    red_flags: [
      "Máu phun thành tia",
      "Vết thương >5cm hoặc lộ xương",
      "Pet ngất / mất phản xạ",
      "Nướu trắng bệt + tim đập >180 bpm",
    ],
    related_symptom_ids: ["bleeding_uncontrolled", "open_wound", "lethargy_severe"],
  },

  // ============================================================
  // 7. BONE FRACTURE — Gãy xương / chấn thương va đập
  // ============================================================
  {
    slug: "bone-fracture",
    title_vi: "Gãy xương / va đập mạnh (xe đâm, ngã cao)",
    category: "trauma",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Dù pet trông không sao — chấn thương nội tạng có thể delayed. Luôn vet check.",
    symptoms_to_check: [
      "Đi khập khiễng nặng / không dùng được chân",
      "Chi bị bẻ cong bất thường",
      "Sưng nhanh vùng chấn thương",
      "Kêu đau khi sờ vào",
      "Khó thở (nghi tràn khí màng phổi)",
      "Lờ đờ, nướu nhợt (xuất huyết nội)",
    ],
    do_now: [
      "GIỮ PET YÊN — không cho đi lại, kể cả nếu pet cố gắng đứng",
      "Nếu nghi gãy spine/cổ — KHÔNG di chuyển, đặt pet lên tấm ván/khăn cứng",
      "Nẹp gãy chi đơn giản: dùng báo cuộn / thanh gỗ + băng cố định KHÔNG quá chặt",
      "Phủ chăn để giữ ấm + chống shock",
      "Gọi clinic — vận chuyển bằng xe ô tô, KHÔNG xe máy",
    ],
    do_not: [
      "KHÔNG ép xương về thẳng (gây tổn thương dây thần kinh + mạch máu)",
      "KHÔNG kéo chân pet đứng lên",
      "KHÔNG di chuyển spine nếu nghi gãy cột sống (paralysis)",
      "KHÔNG cho thuốc giảm đau người (paracetamol/ibuprofen → CHẾT)",
    ],
    transport: "Đặt pet lên tấm ván cứng (đối với gãy spine) hoặc khăn dầy. 2 người khiêng giữ cơ thể thẳng. Xe ô tô, lái chậm tránh xóc.",
    while_waiting: [
      "Quan sát thở — khó thở = nghi chấn thương ngực",
      "Kiểm tra nướu — nhợt → mất máu nội tạng",
      "Giữ pet ấm với chăn",
      "Nói chuyện nhẹ nhàng để pet bình tĩnh",
    ],
    red_flags: [
      "Khó thở dữ dội",
      "Bụng cứng + đau (xuất huyết nội)",
      "Mất ý thức",
      "Liệt 2 chân sau (gãy spine)",
      "Đồng tử 2 mắt không đều (chấn thương não)",
    ],
    related_symptom_ids: ["hit_by_vehicle", "fall_height", "cant_stand", "limping_severe", "paralysis"],
  },

  // ============================================================
  // 8. EYE INJURY — Chấn thương mắt
  // ============================================================
  {
    slug: "eye-injury",
    title_vi: "Chấn thương mắt (vết rách, dị vật, lồi nhãn cầu)",
    category: "trauma",
    species: ["dog", "cat"],
    severity: "URGENT",
    preview: "Mắt là cơ quan delicate — xử lý sai có thể mất thị lực vĩnh viễn trong vài giờ.",
    symptoms_to_check: [
      "Pet dụi mắt liên tục",
      "Mắt đỏ, sưng, chảy nước",
      "Đồng tử kích thước khác nhau giữa 2 mắt",
      "Mắt không mở được hoàn toàn",
      "Có vật lạ nhìn thấy trong mắt",
      "Nhãn cầu lồi ra ngoài (proptosis — cấp cứu)",
    ],
    do_now: [
      "Ngăn pet dụi/cào mắt — dùng vòng E-collar (cone) hoặc tay che",
      "Nếu có dị vật nhìn thấy + nông + dễ lấy (lông mi, hạt cát) → nhỏ vài giọt nước muối sinh lý 0.9% để rửa nhẹ",
      "Nếu dị vật đâm sâu / không thấy rõ → KHÔNG đụng, phủ gạc ẩm sạch",
      "Nếu nhãn cầu lồi ra: đắp gạc ẩm bằng nước muối sinh lý, KHÔNG ấn vào",
      "Đến vet trong 1-2h — chậm = nguy cơ mất thị lực",
    ],
    do_not: [
      "KHÔNG dụi/rửa mắt bằng nước máy mạnh (gây tổn thương giác mạc)",
      "KHÔNG nhỏ thuốc nhỏ mắt người (chứa chất bảo quản hại pet)",
      "KHÔNG cố ép nhãn cầu lồi vào lại",
      "KHÔNG dùng bông gòn (sợi mắc vào vết thương)",
    ],
    transport: "Đặt pet trong giỏ tối / phủ khăn nhẹ để giảm kích thích ánh sáng. Đến vet trong 2h.",
    while_waiting: [
      "Giữ pet bình tĩnh — căng thẳng tăng áp suất nội nhãn",
      "Đắp khăn ẩm mát quanh mắt (không lên mắt)",
      "Ghi nhận thời điểm chấn thương xảy ra",
      "KHÔNG cho ăn (vet có thể cần gây mê)",
    ],
    red_flags: [
      "Nhãn cầu lồi ra ngoài hốc mắt",
      "Mắt chảy máu",
      "Đồng tử 2 bên rất khác nhau (chấn thương não)",
      "Pet kêu đau dữ dội",
      "Mất thị lực rõ ràng (đâm vào tường, hụt nhảy)",
    ],
    related_symptom_ids: ["eye_pawing", "eye_red", "eye_discharge"],
  },

  // ============================================================
  // 9. SNAKE BITE / INSECT — Bị rắn/côn trùng cắn
  // ============================================================
  {
    slug: "snake-bite",
    title_vi: "Bị rắn / côn trùng độc cắn",
    category: "allergic",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "VN có rắn lục, rắn hổ, ong vò vẽ. Phản ứng độc + sốc phản vệ có thể trong 30 phút.",
    symptoms_to_check: [
      "Sưng nhanh quanh vết cắn (đặc biệt mặt, chân)",
      "2 dấu răng nanh (rắn) hoặc kim ong",
      "Đau dữ dội khi sờ",
      "Chảy dãi, nôn, mất thăng bằng",
      "Khó thở, nướu nhợt",
      "Mất ý thức nếu sốc phản vệ",
    ],
    do_now: [
      "GIỮ PET TUYỆT ĐỐI YÊN — vận động tăng tốc độ độc lan",
      "Khiêng pet (KHÔNG cho đi bộ)",
      "Nếu là ong/kim — gắp kim ra bằng nhíp (KHÔNG bóp túi nọc)",
      "Chụp ảnh rắn nếu thấy (an toàn) — giúp vet chọn antivenin",
      "Gọi clinic + đến trong 30 phút",
    ],
    do_not: [
      "KHÔNG hút nọc bằng miệng (myth — không hiệu quả + nguy hiểm bạn)",
      "KHÔNG dùng tourniquet/garô (gây hoại tử)",
      "KHÔNG rạch vết thương",
      "KHÔNG chườm đá / nước đá (làm co mạch + tăng damage mô)",
      "KHÔNG cho pet uống thuốc người (kể cả antihistamine)",
    ],
    transport: "Đặt pet trong giỏ, giữ vết cắn THẤP hơn tim. Khiêng nhẹ, không lắc. Xe ô tô đến vet ngay.",
    while_waiting: [
      "Đánh dấu mép vùng sưng bằng bút — theo dõi tốc độ lan",
      "Đo nhịp thở mỗi 5 phút",
      "Quan sát nướu",
      "Giữ pet ấm vừa phải (không lạnh không nóng)",
    ],
    red_flags: [
      "Sưng lan nhanh quá vùng tiêm",
      "Khó thở / thở rít",
      "Mất ý thức",
      "Nướu trắng bệt",
      "Mặt sưng to nhanh che mắt (anaphylaxis)",
    ],
    related_symptom_ids: ["bite_wound", "hives_swelling", "dyspnea", "lethargy_severe"],
  },

  // ============================================================
  // 10. CPR — Hồi sức tim phổi
  // ============================================================
  {
    slug: "cpr",
    title_vi: "CPR cho chó/mèo (ngừng thở/tim)",
    category: "respiratory",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Khi pet ngừng thở/tim — CPR mua thêm thời gian đến vet. Bắt đầu trong 4 phút.",
    symptoms_to_check: [
      "Không thở (không thấy lồng ngực phập phồng trong 10 giây)",
      "Không có mạch (sờ động mạch đùi bên trong bẹn)",
      "Nướu xanh tím hoặc trắng bệt",
      "Đồng tử dãn rộng + không phản xạ",
      "Mất ý thức hoàn toàn",
    ],
    do_now: [
      "Đặt pet nằm nghiêng PHẢI trên mặt phẳng cứng (không phải đệm mềm)",
      "Mở miệng — kiểm tra dị vật, kéo lưỡi ra ngoài",
      "Đóng mồm + thổi vào MŨI 2 hơi (mèo/chó nhỏ thổi nhẹ, chó lớn thổi mạnh hơn)",
      "Ép ngực: tay trên xương sườn sau khuỷu trước, ép sâu 1/3 chiều rộng ngực, tốc độ 100-120/phút",
      "Chu kỳ: 30 ép + 2 thổi → lặp lại + đến vet ngay",
    ],
    do_not: [
      "KHÔNG ngừng CPR <10 phút trừ khi pet hồi phục rõ ràng hoặc vet tiếp nhận",
      "KHÔNG ép ngực quá mạnh ở mèo/puppy (gãy sườn)",
      "KHÔNG thổi mạnh vào phổi mèo (rách phế nang)",
      "KHÔNG đặt pet nằm ngửa khi CPR (kém hiệu quả)",
    ],
    transport: "Cần 2 người: 1 lái xe, 1 tiếp tục CPR trên đường. Gọi clinic báo trước để chuẩn bị emergency.",
    while_waiting: [
      "Đếm số cycle CPR đã làm (mỗi cycle = 30 ép + 2 thổi)",
      "Sau mỗi 2 phút (~5 cycles) — dừng 10 giây kiểm tra thở/mạch",
      "Nếu pet hồi phục — đặt nằm nghiêng, giữ ấm, vẫn đến vet",
      "Nếu sau 20 phút không phản hồi — vet sẽ hướng dẫn tiếp",
    ],
    red_flags: [
      "Không thở >2 phút",
      "Đồng tử dãn không phản xạ ánh sáng",
      "Mạch không có sau 1 phút CPR",
      "Da chuyển lạnh + cứng (đã muộn)",
    ],
    related_symptom_ids: ["unconscious", "dyspnea", "blue_gums"],
  },

  // ============================================================
  // 11. ANAPHYLAXIS — Sốc phản vệ
  // ============================================================
  {
    slug: "anaphylaxis",
    title_vi: "Sốc phản vệ (ong đốt, vaccine, thuốc, thức ăn)",
    category: "allergic",
    species: ["dog", "cat"],
    severity: "CRITICAL",
    preview: "Phản ứng dị ứng nặng — chết người trong 15-30 phút nếu không xử lý.",
    symptoms_to_check: [
      "Sưng mặt/mõm/lưỡi nhanh chóng",
      "Mề đay khắp người (nổi cục)",
      "Khó thở, thở rít",
      "Nôn, tiêu chảy đột ngột",
      "Mất thăng bằng, lờ đờ",
      "Nướu nhợt + da lạnh (shock)",
    ],
    do_now: [
      "Loại bỏ tác nhân nếu thấy rõ (kim ong, dừng cho ăn món lạ)",
      "Gọi clinic NGAY — đây là cấp cứu thực sự",
      "Đặt pet nằm nghiêng, đầu hơi cao hơn body",
      "Giữ đường thở thoáng — kéo lưỡi ra nếu cần",
      "Đến vet trong 15 phút nếu có thể",
    ],
    do_not: [
      "KHÔNG tự cho thuốc kháng histamine (liều người ≠ pet)",
      "KHÔNG đợi 'xem có hết không' — sốc tiến triển nhanh",
      "KHÔNG cho ăn/uống nếu pet khó thở",
      "KHÔNG kích thích pet (giữ yên tĩnh)",
    ],
    transport: "Cần 2 người: 1 lái, 1 quan sát thở liên tục. Gọi clinic báo trước. Pet nằm nghiêng trên đường.",
    while_waiting: [
      "Đếm nhịp thở mỗi phút",
      "Quan sát sưng có tiếp tục lan không",
      "Nếu thở khò khè dữ dội → chuẩn bị CPR",
      "Ghi nhận thời gian + tác nhân nghi ngờ",
    ],
    red_flags: [
      "Khó thở rõ ràng (thở rít, há mồm)",
      "Lưỡi sưng to / xanh tím",
      "Mất ý thức",
      "Nướu trắng + tim đập >200 bpm",
    ],
    related_symptom_ids: ["hives_swelling", "dyspnea", "lethargy_severe", "blue_gums"],
  },

  // ============================================================
  // 12. HYPOGLYCEMIA — Hạ đường huyết
  // ============================================================
  {
    slug: "hypoglycemia",
    title_vi: "Hạ đường huyết (đặc biệt puppy nhỏ, mèo gầy)",
    category: "metabolic",
    species: ["dog", "cat"],
    severity: "URGENT",
    preview: "Phổ biến ở puppy <3 tháng, giống nhỏ (Chihuahua, Yorkie), pet tiểu đường lỡ tiêm insulin.",
    symptoms_to_check: [
      "Run rẩy, yếu chân",
      "Mất phối hợp, đi loạng choạng",
      "Lờ đờ, không phản ứng",
      "Da lạnh, run lạnh",
      "Co giật (nặng)",
      "Mất ý thức",
    ],
    do_now: [
      "Lấy mật ong / siro đường / corn syrup — bôi MỘT LƯỢNG NHỎ (1/4 thìa cà phê) lên nướu pet",
      "KHÔNG đổ vào mồm nếu pet không tỉnh táo / không nuốt được",
      "Giữ ấm bằng chăn — hạ đường huyết kèm hạ thân nhiệt",
      "Theo dõi tỉnh táo trong 10 phút — pet sẽ khá hơn nếu đúng nguyên nhân",
      "Vẫn đến vet — cần tìm nguyên nhân + truyền glucose IV",
    ],
    do_not: [
      "KHÔNG cho ăn cứng (bánh, hạt) khi pet còn lờ đờ — nguy cơ sặc",
      "KHÔNG ép uống nước nếu không nuốt được",
      "KHÔNG cho chocolate / kẹo có xylitol (CHẾT)",
      "KHÔNG đợi 'xem khoẻ lại không' nếu pet là puppy",
    ],
    transport: "Đặt pet vào giỏ có lót khăn ấm. Bôi mật ong/syrup vào nướu lần nữa nếu cần. Đến vet trong 1-2h.",
    while_waiting: [
      "Quan sát mức độ tỉnh táo mỗi 5 phút",
      "Nếu cải thiện — cho ăn miếng nhỏ thức ăn ấm sau 15 phút",
      "Nếu xấu đi (co giật, mất ý thức) → KHÔNG nhồi đường vào mồm, đến vet ngay",
      "Ghi nhận thời gian ăn cuối + có dùng insulin không",
    ],
    red_flags: [
      "Co giật",
      "Mất ý thức",
      "Không cải thiện sau 15 phút bôi mật ong",
      "Puppy <8 tuần lờ đờ + lạnh",
      "Pet tiểu đường vừa tiêm insulin",
    ],
    related_symptom_ids: ["tremor", "lethargy_severe", "seizure", "unconscious"],
  },
];

// ============================================================
// Helper functions
// ============================================================

/** Get article by slug. */
export function getArticle(slug: string): FirstAidArticle | null {
  return FIRST_AID_ARTICLES.find((a) => a.slug === slug) || null;
}

/** List articles filtered. */
export function listArticles(filter?: {
  category?: FirstAidCategory;
  species?: "dog" | "cat";
  severity?: FirstAidSeverity;
}): FirstAidArticle[] {
  return FIRST_AID_ARTICLES.filter((a) => {
    if (filter?.category && a.category !== filter.category) return false;
    if (filter?.species && !a.species.includes(filter.species) && !a.species.includes("both")) return false;
    if (filter?.severity && a.severity !== filter.severity) return false;
    return true;
  });
}

/** Preview shape (KHÔNG có full content) cho list endpoint. */
export interface FirstAidPreview {
  slug: string;
  title_vi: string;
  category: FirstAidCategory;
  category_label_vi: string;
  species: FirstAidSpecies[];
  severity: FirstAidSeverity;
  severity_label_vi: string;
  preview: string;
}

export function toPreview(a: FirstAidArticle): FirstAidPreview {
  return {
    slug: a.slug,
    title_vi: a.title_vi,
    category: a.category,
    category_label_vi: CATEGORY_LABEL_VI[a.category],
    species: a.species,
    severity: a.severity,
    severity_label_vi: SEVERITY_LABEL_VI[a.severity],
    preview: a.preview,
  };
}
