/**
 * Breed-specific health warnings DB (M4.1 v2).
 *
 * 15 giống phổ biến VN:
 *   Chó (12): Beagle, Pug, French Bulldog, English Bulldog, Husky, Golden Retriever,
 *             Labrador, Corgi, Poodle, Shiba Inu, Phú Quốc, Chihuahua, Dachshund
 *   Mèo (3): Persian, British Shorthair, Maine Coon
 *
 * Used bởi care-planner-v2 inject breed_warning vào prompt + output.
 * Source: WSAVA breed health surveillance + VCA + Mon Min Clinic.
 */

export interface BreedWarning {
  breed_slug: string;
  breed_name_vi: string;
  breed_name_en: string;
  species: "dog" | "cat";
  aliases: string[]; // fuzzy match variants
  is_brachycephalic: boolean;
  critical_warnings: string[];
  monitoring_focus: string[];
  exercise_advice: string;
  diet_notes: string;
}

export const BREED_WARNINGS: BreedWarning[] = [
  // ============================================================
  // DOGS (12)
  // ============================================================
  {
    breed_slug: "beagle",
    breed_name_vi: "Beagle",
    breed_name_en: "Beagle",
    species: "dog",
    aliases: ["beagle", "bigờ"],
    is_brachycephalic: false,
    critical_warnings: [
      "Háu ăn cực kỳ → nguy cơ béo phì #1 trong các giống chó",
      "Mũi nhạy → có thể bỏ trốn theo mùi khi không xích",
      "Tai dài rủ → viêm tai ngoài thường xuyên (vệ sinh 1 tuần/lần)",
      "IVDD (đĩa đệm) risk cao do thân dài",
    ],
    monitoring_focus: [
      "Cân nặng mỗi 2 tuần",
      "Vệ sinh tai check mùi/dịch",
      "Skin fold dưới cằm (yếm)",
    ],
    exercise_advice: "≥1h/ngày, ưu tiên scent work + nose game (puzzle mùi). Luôn dây xích khi outdoor.",
    diet_notes: "Strict portion control. Dùng slow feeder bowl giảm tốc ăn. Treats <10% calo/ngày.",
  },

  {
    breed_slug: "pug",
    breed_name_vi: "Pug",
    breed_name_en: "Pug",
    species: "dog",
    aliases: ["pug", "pa-gờ", "chó mặt xệ"],
    is_brachycephalic: true,
    critical_warnings: [
      "🚨 BRACHYCEPHALIC — sốc nhiệt risk cao gấp 3 lần. HCM nóng → KHÔNG ra nắng 11h-16h",
      "Thở khò khè bình thường — nhưng tăng đột ngột = cấp cứu (BOAS syndrome)",
      "KHÔNG bay máy bay cargo (vài hãng cấm Pug)",
      "Nếp gấp mặt → ẩm + vi khuẩn, lau sạch mỗi ngày",
      "Mắt lồi → dễ chấn thương + khô giác mạc",
    ],
    monitoring_focus: [
      "Nhịp thở khi nghỉ (bình thường 15-30/phút)",
      "Vệ sinh nếp mặt + mắt hằng ngày",
      "Cân nặng (béo → BOAS tệ thêm)",
    ],
    exercise_advice: "Ngắn ≤30 phút/lần, sáng sớm 5-7h hoặc tối khuya 19h+. KHÔNG chạy bộ marathon.",
    diet_notes: "Bowl thấp + rộng, đứng ăn thoải mái (tránh nuốt khí gây trướng bụng). Kibble nhỏ.",
  },

  {
    breed_slug: "french_bulldog",
    breed_name_vi: "French Bulldog",
    breed_name_en: "French Bulldog",
    species: "dog",
    aliases: ["french bulldog", "frenchie", "bulldog pháp", "chó bulldog pháp"],
    is_brachycephalic: true,
    critical_warnings: [
      "🚨 BRACHYCEPHALIC — tương tự Pug, sốc nhiệt risk cực cao",
      "IVDD (đĩa đệm) cao do cấu trúc cột sống — KHÔNG nhảy ghế cao",
      "Tai dơi to → nhạy cảm với gió + tiếng ồn",
      "Bể sinh (KHÔNG đẻ tự nhiên được → mổ C-section bắt buộc)",
      "Allergies da phổ biến",
    ],
    monitoring_focus: [
      "Nhịp thở + tiếng ngáy",
      "Da + ngứa",
      "Cột sống — đi đứng có khập khiễng?",
    ],
    exercise_advice: "20-30 phút × 2 lần/ngày. Tránh cầu thang + nhảy cao.",
    diet_notes: "Hypoallergenic kibble nếu có triệu chứng ngứa. Probiotic định kỳ.",
  },

  {
    breed_slug: "english_bulldog",
    breed_name_vi: "English Bulldog",
    breed_name_en: "English Bulldog",
    species: "dog",
    aliases: ["english bulldog", "bulldog anh", "chó bulldog"],
    is_brachycephalic: true,
    critical_warnings: [
      "🚨 BRACHYCEPHALIC nặng nhất — sốc nhiệt + ngạt thở ≥30% trong đời",
      "Hông + khớp gối dysplasia >40% trường hợp",
      "Yếm + nếp gấp mặt → bệnh da do ẩm",
      "Đẻ phải C-section 95%",
      "Trao đổi nhiệt kém — KHÔNG bao giờ ở ngoài >30°C",
    ],
    monitoring_focus: [
      "Nhịp thở khi nghỉ",
      "Khập khiễng + đứng dậy khó",
      "Vệ sinh nếp gấp",
    ],
    exercise_advice: "15-20 phút × 2/ngày, ở trong nhà có aircon nếu trời nóng.",
    diet_notes: "Joint supplement (glucosamine) từ 2 tuổi. Kibble nhỏ. Tránh thừa cân (gánh khớp).",
  },

  {
    breed_slug: "husky",
    breed_name_vi: "Husky Siberian",
    breed_name_en: "Siberian Husky",
    species: "dog",
    aliases: ["husky", "siberian husky", "husky siberian"],
    is_brachycephalic: false,
    critical_warnings: [
      "🚨 TROPICAL CLIMATE STRESS — khí hậu VN KHÔNG phù hợp giống này",
      "Cần aircon mùa nóng (T >28°C) — KHÔNG dùng quạt thường",
      "Lông double-coat → KHÔNG bao giờ CẠO (phá thermo, ung thư da do tia UV)",
      "Năng lượng cực cao → cần 2h vận động/ngày (rủi ro phá đồ nếu chán)",
      "Tendency bỏ trốn — chú ý fence chiều cao 1.8m+",
    ],
    monitoring_focus: [
      "Body temperature mùa nóng",
      "Lông rụng theo mùa (chải 3 lần/tuần)",
      "Hành vi destructive (signal năng lượng dư)",
    ],
    exercise_advice: "2h+/ngày, ưu tiên 5-7h sáng + 20-22h tối. Kéo xe / agility tốt.",
    diet_notes: "High-protein (30%+), high-fat. Omega-3 cho lông.",
  },

  {
    breed_slug: "golden_retriever",
    breed_name_vi: "Golden Retriever",
    breed_name_en: "Golden Retriever",
    species: "dog",
    aliases: ["golden retriever", "golden", "gôn-đần"],
    is_brachycephalic: false,
    critical_warnings: [
      "Hông + khuỷu dysplasia phổ biến — screening trước 2 tuổi",
      "Ung thư bạch huyết + osteosarcoma — nguyên nhân tử vong #1 (40-60%)",
      "Suy giáp + Addison disease — check máu 1 năm/lần từ 5 tuổi",
      "Tim DCM (cardiomyopathy) — đặc biệt grain-free diet liên quan",
      "Béo phì dễ — kiểm soát portion strict",
    ],
    monitoring_focus: [
      "BCS 5/9 strict",
      "Khập khiễng / lười nhảy",
      "Hạch sưng cổ/nách/bẹn (nghi ung thư)",
    ],
    exercise_advice: "1.5-2h/ngày. Bơi rất tốt. KHÔNG impact cao khi <14 tháng (xương đang dev).",
    diet_notes: "Grain-INCLUSIVE kibble (tránh grain-free DCM risk). Joint supplement từ 3 tuổi.",
  },

  {
    breed_slug: "labrador",
    breed_name_vi: "Labrador Retriever",
    breed_name_en: "Labrador Retriever",
    species: "dog",
    aliases: ["labrador", "lab", "labrador retriever"],
    is_brachycephalic: false,
    critical_warnings: [
      "Háu ăn → nguy cơ béo phì + tiểu đường (gene POMC mutation)",
      "Hông + khuỷu dysplasia (genetic)",
      "Bloat (GDV) — bụng xoắn dạ dày, cấp cứu 6h",
      "Mắt: PRA + cataract di truyền",
      "Lông rụng nhiều — chải hằng ngày mùa nóng",
    ],
    monitoring_focus: [
      "Cân nặng — Lab dễ tăng 20% so với chuẩn",
      "Khập khiễng sau khi đứng dậy",
      "Bụng trướng đột ngột → cấp cứu",
    ],
    exercise_advice: "1-1.5h/ngày. Bơi tuyệt. Đi dạo dây ngắn (Lab khoẻ, có thể kéo chủ ngã).",
    diet_notes: "Slow feeder bowl. Treats <10% calo. Joint supplement từ 3 tuổi.",
  },

  {
    breed_slug: "corgi",
    breed_name_vi: "Corgi",
    breed_name_en: "Welsh Corgi",
    species: "dog",
    aliases: ["corgi", "welsh corgi", "pembroke corgi"],
    is_brachycephalic: false,
    critical_warnings: [
      "IVDD (đĩa đệm) — thân dài chân ngắn, KHÔNG nhảy ghế/cầu thang nhiều",
      "Béo phì dễ → gánh thêm cột sống",
      "Hông dysplasia bẩm sinh",
      "DM (Degenerative Myelopathy) — liệt chân sau ở senior",
      "Mắt: PRA",
    ],
    monitoring_focus: [
      "BCS 4-5/9 (giữ slim cho cột sống)",
      "Đi đứng có wobble?",
      "Khập khiễng",
    ],
    exercise_advice: "45-60 phút/ngày, đi bộ + chơi nhẹ. KHÔNG cầu thang dài.",
    diet_notes: "Portion control strict — Corgi xin ăn rất giỏi, đừng chiều.",
  },

  {
    breed_slug: "poodle",
    breed_name_vi: "Poodle (Toy/Mini/Standard)",
    breed_name_en: "Poodle",
    species: "dog",
    aliases: ["poodle", "toy poodle", "mini poodle", "standard poodle", "tiểu poodle"],
    is_brachycephalic: false,
    critical_warnings: [
      "Hạ đường huyết nhanh (toy/mini) — đặc biệt puppy <4 tháng + stress",
      "Đầu gối luxation (patella) — toy/mini",
      "Lông không rụng — cần cạo lông 6-8 tuần/lần",
      "Tai dài có lông → cần nhổ + vệ sinh",
      "Mắt: cataract + PRA",
    ],
    monitoring_focus: [
      "Đường huyết puppy <4 tháng (kẹo nho/mật ong sẵn nếu run rẩy)",
      "Khập khiễng + đầu gối",
      "Tai mùi/dịch",
    ],
    exercise_advice: "Toy/Mini 30-45 phút, Standard 1h+/ngày. Trick training tốt (Poodle thông minh).",
    diet_notes: "4 bữa/ngày cho toy puppy <4 tháng (chống hạ đường). Chất lượng kibble cao.",
  },

  {
    breed_slug: "shiba_inu",
    breed_name_vi: "Shiba Inu",
    breed_name_en: "Shiba Inu",
    species: "dog",
    aliases: ["shiba", "shiba inu", "siba"],
    is_brachycephalic: false,
    critical_warnings: [
      "Bỏ trốn cao — fence + leash strict, microchip bắt buộc",
      "Allergy da → đặc biệt protein gà/bò (thử venison/cá)",
      "Đầu gối luxation",
      "Cushion sterile (vô trùng) — Shiba sợ bẩn, có thể không đi vệ sinh nếu cát bẩn",
      "Aloof nature — KHÔNG ép cuddle nếu bé rút lui",
    ],
    monitoring_focus: [
      "Ngứa da + gãi nhiều",
      "Đi vệ sinh đúng chỗ?",
      "Tâm trạng — Shiba isolate có thể là stress",
    ],
    exercise_advice: "1h/ngày, đi dạo + chạy không xích trong khu rào kín. Trick training.",
    diet_notes: "Hypoallergenic protein (cá, vịt, venison). Tránh chicken nếu ngứa.",
  },

  {
    breed_slug: "phu_quoc",
    breed_name_vi: "Phú Quốc",
    breed_name_en: "Phu Quoc Ridgeback",
    species: "dog",
    aliases: ["phú quốc", "phu quoc", "chó phú quốc", "ridgeback việt nam"],
    is_brachycephalic: false,
    critical_warnings: [
      "Năng lượng cực cao — KHÔNG phù hợp apartment, cần sân/đất rộng",
      "Cảnh giác mạnh + protective → cần socialization sớm",
      "Bỏ trốn + săn bản năng → fence 2m+, leash strict",
      "Da ridgeback (xoáy lông sống lưng) → check viêm da nếu lông xoáy bị tổn thương",
      "Heat tolerance tốt (giống bản địa) nhưng vẫn cần nước đủ",
    ],
    monitoring_focus: [
      "Hành vi với người lạ + pet khác",
      "Da xoáy lưng",
      "Năng lượng (nếu lờ đờ → bệnh)",
    ],
    exercise_advice: "1.5-2h/ngày, ưu tiên chạy tự do trong khu rào kín. Săn + retrieve thoả mãn.",
    diet_notes: "High-protein, raw-friendly (Phú Quốc thích nghi tốt). Local food OK.",
  },

  {
    breed_slug: "chihuahua",
    breed_name_vi: "Chihuahua",
    breed_name_en: "Chihuahua",
    species: "dog",
    aliases: ["chihuahua", "chi", "chí hu á"],
    is_brachycephalic: false,
    critical_warnings: [
      "Hạ đường huyết puppy <4 tháng — mật ong/syrup sẵn nếu run",
      "Đầu gối luxation + cột sống dễ chấn thương",
      "Tim mạch (mitral valve disease) — khám tim 1 năm/lần từ 5 tuổi",
      "Răng — bệnh nha chu nặng nhất giống nhỏ, đánh răng 3 lần/tuần",
      "Hypothermia mùa lạnh — áo ấm khi T<20°C",
    ],
    monitoring_focus: [
      "Đường huyết puppy",
      "Răng + lợi (mùi hôi, sưng)",
      "Khập khiễng",
      "Ho khan (tim)",
    ],
    exercise_advice: "20-30 phút/ngày là đủ. Trick training rất giỏi. KHÔNG nhảy cao.",
    diet_notes: "Kibble small breed, kibble cực nhỏ. 3-4 bữa/ngày puppy. Cân hằng tuần.",
  },

  {
    breed_slug: "dachshund",
    breed_name_vi: "Dachshund (Lạp xưởng)",
    breed_name_en: "Dachshund",
    species: "dog",
    aliases: ["dachshund", "lạp xưởng", "chó lạp xưởng", "doxie", "weiner dog"],
    is_brachycephalic: false,
    critical_warnings: [
      "🚨 IVDD (đĩa đệm) — risk #1 trong các giống chó (25% trường hợp đời)",
      "KHÔNG nhảy cao, KHÔNG cầu thang nhiều (hoặc đặt ramp)",
      "Béo phì → ép cột sống → IVDD tệ hơn",
      "Khập khiễng + liệt sau → cấp cứu thần kinh",
      "Mắt: PRA",
    ],
    monitoring_focus: [
      "BCS 4-5/9 strict (không bao giờ cho béo)",
      "Đi đứng có chuệch?",
      "Đau khi sờ lưng",
    ],
    exercise_advice: "30-45 phút/ngày đi bộ phẳng. KHÔNG nhảy. Bơi tốt.",
    diet_notes: "Portion control NGHIÊM NGẶT. Slow feeder. Tránh treats nhiều.",
  },

  // ============================================================
  // CATS (3)
  // ============================================================
  {
    breed_slug: "persian",
    breed_name_vi: "Persian (Mèo Ba Tư)",
    breed_name_en: "Persian",
    species: "cat",
    aliases: ["persian", "mèo ba tư", "ba tư", "mèo persian"],
    is_brachycephalic: true,
    critical_warnings: [
      "🚨 BRACHYCEPHALIC — mũi tẹt, respiratory + chảy nước mắt thường xuyên",
      "Vệ sinh mắt + nếp mặt HẰNG NGÀY (khô + sạch)",
      "Răng dễ bệnh nha chu → đánh răng",
      "PKD (Polycystic Kidney Disease) — DNA test trước nhân giống",
      "Lông dài → chải 1 lần/ngày tránh rối + nuốt lông gây tắc",
    ],
    monitoring_focus: [
      "Mắt: dịch + đỏ + chớp nhiều",
      "Lông + ổ rối",
      "Tiểu nhiều/khát (signal PKD)",
      "Răng",
    ],
    exercise_advice: "Trong nhà 100%. Đồ chơi laser + cần câu mèo 15-20 phút/ngày.",
    diet_notes: "Wet food ưu tiên (Persian thấp activity, dễ thiếu nước). Kibble large/long shape (phù hợp khẩu hình).",
  },

  {
    breed_slug: "british_shorthair",
    breed_name_vi: "Anh lông ngắn (British Shorthair)",
    breed_name_en: "British Shorthair",
    species: "cat",
    aliases: [
      "british shorthair",
      "british sh",
      "mèo anh lông ngắn",
      "anh lông ngắn",
      "anh ngắn",
      "british",
    ],
    is_brachycephalic: false,
    critical_warnings: [
      "HCM (Hypertrophic Cardiomyopathy) — siêu âm tim 1 năm/lần từ 3 tuổi",
      "Béo phì dễ — British SH thấp activity",
      "Răng + lợi — phổ biến viêm nha",
      "PKD (Polycystic Kidney) risk vừa",
      "Lông dày double-coat → chải 2-3 lần/tuần",
    ],
    monitoring_focus: [
      "Cân nặng + BCS",
      "Khó thở khi gắng sức",
      "Răng + lợi",
      "Tần suất tiểu",
    ],
    exercise_advice: "Trong nhà. Cần câu mèo + cat tree. 15 phút active/ngày.",
    diet_notes: "Portion control NGHIÊM. Wet food. Avoid free-feeding.",
  },

  {
    breed_slug: "maine_coon",
    breed_name_vi: "Maine Coon",
    breed_name_en: "Maine Coon",
    species: "cat",
    aliases: ["maine coon", "main coon", "mèo maine coon", "mèo mỹ lông dài"],
    is_brachycephalic: false,
    critical_warnings: [
      "Hip dysplasia — siêu âm hông trước 2 tuổi",
      "HCM (cardiomyopathy) — siêu âm tim 1 năm/lần",
      "Cân nặng lớn (5-9kg đực) → KHÔNG nhảy độ cao khi <12 tháng",
      "Lông dài chân + bụng → chải hằng ngày, vệ sinh dưới đuôi",
      "SMA (Spinal Muscular Atrophy) di truyền — DNA test",
    ],
    monitoring_focus: [
      "Đi đứng có khập khiễng (hip)",
      "Khó thở khi gắng sức (tim)",
      "Lông rối, ổ matting",
      "Cân nặng — không tăng quá nhanh khi puppy",
    ],
    exercise_advice: "Trong nhà có cat tree LỚN. Chơi 30 phút/ngày. Walk on leash OK.",
    diet_notes: "Large breed cat kibble (kích thước miếng to). Joint supplement từ 3 tuổi.",
  },
];

// ============================================================
// Functions
// ============================================================

/** Normalize breed string cho fuzzy match. */
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

/**
 * Fuzzy match breed name → BreedWarning record.
 * Match priority: exact slug > alias substring > breed_name fuzzy.
 */
export function getBreedWarning(
  breed: string | null | undefined,
  species: "dog" | "cat"
): BreedWarning | null {
  if (!breed) return null;
  const norm = normalize(breed);
  if (!norm) return null;

  const speciesPool = BREED_WARNINGS.filter((b) => b.species === species);

  // Pass 1: exact slug
  for (const bw of speciesPool) {
    if (norm === bw.breed_slug.replace(/_/g, " ")) return bw;
  }

  // Pass 2: alias substring
  for (const bw of speciesPool) {
    for (const a of bw.aliases) {
      const na = normalize(a);
      if (norm.includes(na) || na.includes(norm)) return bw;
    }
  }

  // Pass 3: breed name fuzzy
  for (const bw of speciesPool) {
    const nbn = normalize(bw.breed_name_vi);
    const nbe = normalize(bw.breed_name_en);
    if (norm.includes(nbn) || nbn.includes(norm)) return bw;
    if (norm.includes(nbe) || nbe.includes(norm)) return bw;
  }

  return null;
}

/** Compact summary cho prompt builder. */
export function summarizeBreedForPrompt(bw: BreedWarning | null): string | null {
  if (!bw) return null;
  const critical = bw.critical_warnings.slice(0, 3).map((w) => `• ${w}`).join("\n");
  return `${bw.breed_name_vi} (${bw.species === "dog" ? "chó" : "mèo"})${bw.is_brachycephalic ? " — BRACHYCEPHALIC" : ""}\nCRITICAL:\n${critical}\nEXERCISE: ${bw.exercise_advice}\nDIET: ${bw.diet_notes}`;
}
