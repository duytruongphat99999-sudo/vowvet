/**
 * FAQ / Knowledge Base (M9.4).
 *
 * Hardcoded TS const. 15 bài WSAVA + AAHA pattern, VN context.
 * Tone: educational, KHÔNG thay chẩn đoán vet. Mỗi bài end với "khi nào cần khám vet".
 *
 * Source: WSAVA Vaccine/Nutrition Guidelines, AAHA Behavior Management, Mon Min clinic VN.
 */

export type FaqCategory =
  | "nutrition"
  | "vaccine"
  | "preventive"
  | "behavior"
  | "training"
  | "senior_care"
  | "post_surgery"
  | "grooming";

export type FaqSpecies = "dog" | "cat" | "both";

export interface FaqArticle {
  slug: string;
  title_vi: string;
  category: FaqCategory;
  species: FaqSpecies[];
  tags: string[];
  summary: string; // 1-2 câu cho preview
  content_md: string; // markdown, render qua simple parser frontend
  when_to_vet: string; // 1-2 câu — khi nào nên đi khám
  related_slugs: string[];
}

export const FAQ_CATEGORY_LABEL_VI: Record<FaqCategory, string> = {
  nutrition: "🍽️ Dinh dưỡng",
  vaccine: "💉 Vaccine",
  preventive: "🛡️ Phòng bệnh",
  behavior: "😟 Hành vi",
  training: "🎓 Huấn luyện",
  senior_care: "👴 Pet già",
  post_surgery: "🏥 Hậu phẫu",
  grooming: "🛁 Vệ sinh",
};

export const FAQ_ARTICLES: FaqArticle[] = [
  // ============================================================
  // NUTRITION (3)
  // ============================================================
  {
    slug: "nutrition-basics-dog",
    title_vi: "Cho chó ăn gì? Tần suất + lượng cơ bản",
    category: "nutrition",
    species: ["dog"],
    tags: ["thức ăn", "khẩu phần", "puppy", "adult"],
    summary: "Hướng dẫn lượng calo + số bữa/ngày dựa trên tuổi + cân nặng. Cho chó trưởng thành 2 bữa, puppy 3-4 bữa.",
    content_md: `### Lượng calo cần thiết

Công thức cơ bản (RER × hệ số):
- Trưởng thành ít vận động: cân × 30 + 70 = kcal/ngày
- Adult vận động vừa: × 1.6 hệ số
- Puppy <6 tháng: × 2-3 (đang phát triển)
- Senior >7 tuổi: × 0.9 (chuyển hóa chậm)

### Số bữa
- Puppy <4 tháng: 3-4 bữa/ngày
- 4-12 tháng: 3 bữa
- Adult: 2 bữa (sáng + tối)
- Senior: 2-3 bữa nhỏ (dễ tiêu)

### Lưu ý
- Đo lượng bằng cốc tiêu chuẩn, KHÔNG đoán bằng mắt
- Nước sạch luôn sẵn (50ml/kg/ngày)
- Treats max 10% calo/ngày
- Đổi thức ăn từ từ trong 7-10 ngày (tránh tiêu chảy)

VowVet có Nutrition Profiler tự tính DER + gợi ý brand — vào /pets/[id] tab Dinh dưỡng.`,
    when_to_vet: "Khi pet bỏ ăn >24h, sụt cân >5% trong 1 tháng không lý do, hoặc thay đổi khẩu vị đột ngột.",
    related_slugs: ["nutrition-basics-cat", "senior-pet-care"],
  },
  {
    slug: "nutrition-basics-cat",
    title_vi: "Cho mèo ăn gì? Mèo cần protein cao",
    category: "nutrition",
    species: ["cat"],
    tags: ["thức ăn", "protein", "taurine", "wet food"],
    summary: "Mèo là carnivore bắt buộc — cần ≥30% protein, taurine, không ăn chay được. Tránh bỏ đói gây gan nhiễm mỡ.",
    content_md: `### Mèo khác chó như thế nào?

Mèo là **carnivore bắt buộc** (obligate carnivore):
- KHÔNG ăn chay được (thiếu taurine → suy tim)
- Cần protein động vật ≥30% (vs chó 18-25%)
- Hệ tiêu hoá ngắn — nhiều bữa nhỏ tốt hơn ít bữa lớn

### Khuyến nghị

- **Wet food** (pate) ưu tiên — mèo uống ít, wet giúp đủ nước
- Dry food bổ sung, chọn protein > 30%
- 2-4 bữa nhỏ/ngày (mèo ăn 10-15 lần nếu tự do)
- Lượng calo: cân × 50 (indoor) hoặc × 60 (outdoor)

### Cảnh báo gan nhiễm mỡ

Mèo bỏ ăn >24h → mỡ gan rối loạn → **hepatic lipidosis** (có thể chết). KHÁC chó.

### Tránh

- Sữa bò (lactose intolerant)
- Cá ngừ đóng hộp người (mercury + sodium)
- Hành/tỏi (độc với mèo hơn chó)

VowVet Nutrition Profiler tính DER + brand cat-specific.`,
    when_to_vet: "Mèo bỏ ăn >24h là cấp cứu (đặc biệt mèo béo). Sụt cân nhanh, uống nước nhiều bất thường → khám ngay.",
    related_slugs: ["nutrition-basics-dog", "senior-pet-care"],
  },
  {
    slug: "treats-and-human-food",
    title_vi: "Treat + thức ăn người — cái nào OK, cái nào cấm?",
    category: "nutrition",
    species: ["both"],
    tags: ["treats", "thực phẩm cấm", "an toàn"],
    summary: "10% khẩu phần là treats. Chocolate, hành, nho, xylitol, macadamia — CẤM TUYỆT ĐỐI.",
    content_md: `### Quy tắc 10%

Treats tối đa **10% tổng calo/ngày**. Vượt → mất cân bằng dinh dưỡng + tăng cân.

### CẤM TUYỆT ĐỐI (xem chi tiết /emergency)

| Thực phẩm | Lý do |
|---|---|
| Chocolate | Theobromine → độc tim |
| Hành, tỏi | Phá hồng cầu (mèo nhạy hơn) |
| Nho, nho khô | Suy thận cấp |
| Xylitol (kẹo gum) | Hạ đường huyết + suy gan |
| Macadamia | Yếu cơ (chó) |
| Bơ (avocado) | Persin → nôn mửa |
| Cà phê, trà | Tương tự chocolate |
| Rượu bia | Suy gan, hô hấp |

### OK với liều lượng nhỏ

- Bí đỏ luộc (chất xơ tốt)
- Cà rốt (vitamin A)
- Táo (bỏ hạt + cuống)
- Thịt gà luộc không gia vị
- Cá hồi nấu chín

### Tránh

- Đồ chiên rán (dầu mỡ)
- Mặn quá (xúc xích, jambon)
- Đường (bánh kẹo người)
- Xương gà nấu chín (mảnh sắc đâm ruột)`,
    when_to_vet: "Nghi ăn phải chất cấm → gọi clinic ngay, mang theo bao bì. Càng sớm càng tốt (1-2h vàng).",
    related_slugs: ["nutrition-basics-dog", "nutrition-basics-cat"],
  },

  // ============================================================
  // VACCINE (2)
  // ============================================================
  {
    slug: "vaccine-schedule-puppy",
    title_vi: "Lịch tiêm puppy 6-16 tuần (WSAVA)",
    category: "vaccine",
    species: ["dog"],
    tags: ["puppy", "DHPP", "rabies", "WSAVA"],
    summary: "DHPP 3 mũi (6-8w, 10-12w, 14-16w) + rabies từ 12w. Booster sau 1 năm rồi 3 năm/lần.",
    content_md: `### Core vaccines (bắt buộc — WSAVA)

**DHPP** (Distemper, Hepatitis, Parvovirus, Parainfluenza):
- Mũi 1: 6-8 tuần
- Mũi 2: 10-12 tuần
- Mũi 3: 14-16 tuần
- Booster 1 năm sau, rồi 3 năm/lần

**Rabies** (Dại):
- Mũi đầu: 12-16 tuần
- Booster 1 năm sau, rồi 1-3 năm/lần (theo luật VN)

### Non-core (tùy lifestyle)

- **Leptospirosis**: chó đi rừng/nước bẩn
- **Bordetella** (Kennel cough): chó đi pet hotel
- **Lyme**: vùng có ve

### Trước tiêm

- Pet phải khoẻ — sốt, nôn = hoãn
- Tẩy giun trước 3-7 ngày
- KHÔNG vận động mạnh 24h sau tiêm

VowVet tự sinh lịch + nhắc trước 14/7/1 ngày. Vào /vaccines để xem.`,
    when_to_vet: "Phản ứng sau tiêm (sưng tại chỗ <24h, lười nhẹ) bình thường. Sốc phản vệ (sưng mặt, khó thở) → /emergency NGAY.",
    related_slugs: ["vaccine-schedule-kitten", "deworming-schedule"],
  },
  {
    slug: "vaccine-schedule-kitten",
    title_vi: "Lịch tiêm kitten 8-16 tuần",
    category: "vaccine",
    species: ["cat"],
    tags: ["kitten", "FVRCP", "rabies", "FeLV"],
    summary: "FVRCP 3 mũi từ 8 tuần + rabies từ 12w. FeLV cho mèo outdoor.",
    content_md: `### Core vaccines

**FVRCP** (Rhinotracheitis, Calicivirus, Panleukopenia):
- Mũi 1: 8 tuần
- Mũi 2: 12 tuần
- Mũi 3: 16 tuần
- Booster 1 năm sau, rồi 3 năm/lần

**Rabies**:
- Mũi đầu: 12-16 tuần
- Annual booster (luật VN)

### Non-core

- **FeLV** (Feline Leukemia): mèo outdoor hoặc nhà nhiều mèo
- **FIV** (Feline AIDS): tương tự FeLV
- Thường skip nếu mèo indoor strict

### Mèo đặc biệt

- Hạn chế ra ngoài 7-10 ngày sau tiêm
- KHÔNG tắm 3 ngày sau tiêm
- Quan sát điểm tiêm 2 tuần — u xơ tại chỗ (fibrosarcoma) hiếm nhưng có

VowVet sinh lịch tự động dựa trên dob. Notification trước 14/7/1 ngày.`,
    when_to_vet: "Sau tiêm sốt cao, lờ đờ >48h, hoặc khối u cứng tại chỗ tiêm >2cm → khám.",
    related_slugs: ["vaccine-schedule-puppy", "deworming-schedule"],
  },

  // ============================================================
  // PREVENTIVE (3)
  // ============================================================
  {
    slug: "deworming-schedule",
    title_vi: "Lịch tẩy giun cho chó mèo",
    category: "preventive",
    species: ["both"],
    tags: ["giun", "tẩy giun", "ký sinh"],
    summary: "Puppy/kitten mỗi 2 tuần đến 12w, sau đó hàng tháng đến 6 tháng. Adult mỗi 3 tháng.",
    content_md: `### Vì sao tẩy giun?

Giun nội ký sinh (tròn, móc, sán) phổ biến — gây tiêu chảy, gầy, thiếu máu. **Một số lây sang người** (toxocara → toxocariasis ở trẻ em).

### Lịch khuyến nghị

**Puppy/Kitten:**
- 2-12 tuần: mỗi 2 tuần
- 3-6 tháng: mỗi tháng
- >6 tháng: mỗi 3 tháng

**Adult (>6 tháng):**
- Indoor only: mỗi 3-6 tháng
- Outdoor / săn / ăn raw: mỗi 1-3 tháng

### Thuốc phổ biến (theo cân)

- **Drontal Plus** (chó): 1 viên/10kg
- **Milbemax** (cả 2): theo cân chính xác
- **Frontline Combo** (ngoài + 1 số giun): topical

KHÔNG tự đoán liều — quá liều gây độc thần kinh.

### Cùng với tẩy giun

- Phòng bọ chét + ve (xem bài riêng)
- Phân tươi đem mẫu khám 6 tháng/lần nếu nhiều pet`,
    when_to_vet: "Phân có giun thấy bằng mắt thường, gầy nhanh, nôn ra giun → khám + làm phân tươi.",
    related_slugs: ["flea-tick-prevention", "vaccine-schedule-puppy"],
  },
  {
    slug: "flea-tick-prevention",
    title_vi: "Phòng ngừa bọ chét + ve",
    category: "preventive",
    species: ["both"],
    tags: ["bọ chét", "ve", "Frontline", "Nexgard"],
    summary: "VN khí hậu nóng ẩm — bọ chét + ve quanh năm. Topical hoặc oral monthly, kiểm tra body weekly.",
    content_md: `### Vì sao quan trọng?

- Bọ chét: ngứa, viêm da, **lây sang người**
- Ve: truyền babesia, ehrlichia, Lyme → thiếu máu nặng
- VN khí hậu nhiệt đới → bọ ve quanh năm

### Sản phẩm phổ biến

**Topical (nhỏ gáy 1 tháng):**
- Frontline Plus / Combo
- Advantix (CHỈ chó, độc mèo!)

**Oral (viên ngậm):**
- Nexgard (chó): hiệu quả 30 ngày
- Bravecto: 3 tháng

**Vòng cổ:**
- Seresto: 8 tháng, đắt nhưng tiện

### Kiểm tra hằng tuần

- Bóc lông kiểm tra cổ, tai, nách, bẹn
- Bọ chét: đốm đen nhỏ chạy (phân bọ chét)
- Ve: cục cứng bám da, kích thước hạt đậu nếu no máu

### Khi gắp ve

- Dùng nhíp gắp sát da, KÉO THẲNG ra (không xoắn)
- KHÔNG đốt thuốc lá / xăng (ve tiết nọc thêm)
- Khử trùng vết cắn

⚠️ **CẢNH BÁO**: Advantix + permethrin **chết mèo**. Đọc nhãn kỹ.`,
    when_to_vet: "Sốt + lờ đờ + thiếu máu nhợt sau bị ve cắn → ngay (nghi tick-borne disease).",
    related_slugs: ["deworming-schedule", "grooming-bathing"],
  },
  {
    slug: "spay-neuter-when",
    title_vi: "Khi nào nên triệt sản?",
    category: "preventive",
    species: ["both"],
    tags: ["triệt sản", "spay", "neuter"],
    summary: "Tiêu chuẩn 6-9 tháng. Lợi: giảm ung thư, hành vi tốt hơn, kiểm soát population. Cân nhắc giống lớn delay 12-18m.",
    content_md: `### Lợi ích triệt sản

**Cái (spay)**:
- Loại bỏ nguy cơ pyometra (viêm tử cung — cấp cứu)
- Giảm 99% ung thư vú nếu spay trước kỳ kinh đầu
- KHÔNG kinh nguyệt, không động dục → giảm stress

**Đực (neuter)**:
- Loại bỏ ung thư tinh hoàn
- Giảm tuyến tiền liệt to (chó già)
- Hành vi tốt hơn (giảm đánh nhau, đi rông, đánh dấu)

### Thời điểm khuyến nghị

**Mèo**: 4-6 tháng (trước kỳ kinh đầu)

**Chó nhỏ < 15kg**: 6-9 tháng

**Chó vừa-lớn (>15kg)**: 12-18 tháng (delay giúp xương phát triển đầy đủ — giảm nguy cơ thoái hoá khớp)

**Chó giống lớn (Golden, Lab, GSD)**: 18-24 tháng

### Quy trình

- Khám tiền phẫu (CBC, ECG nếu >5 tuổi)
- Nhịn ăn 8-12h trước
- Mổ + về trong ngày (mèo) hoặc qua đêm (chó)
- E-collar 10-14 ngày để pet không liếm vết thương

### Sau mổ

- Hạn chế vận động 10 ngày
- Tăng cân 10-20% (giảm calo + tăng vận động sau hồi phục)
- Kiểm tra vết khâu hàng ngày`,
    when_to_vet: "Sưng đỏ, chảy mủ vết khâu, sốt sau mổ, bỏ ăn >24h → ngay.",
    related_slugs: ["post-surgery-care", "behavior-aggression"],
  },

  // ============================================================
  // GROOMING (2)
  // ============================================================
  {
    slug: "dental-care",
    title_vi: "Vệ sinh răng miệng pet",
    category: "grooming",
    species: ["both"],
    tags: ["răng", "đánh răng", "cao răng"],
    summary: "Đánh răng 2-3 lần/tuần. 80% chó mèo >3 tuổi có bệnh nha chu. Cao răng vet 1-2 năm/lần.",
    content_md: `### Tại sao quan trọng

- 80% chó mèo >3 tuổi có periodontal disease
- Vi khuẩn răng → máu → tim/gan/thận
- Pet ít kêu đau răng (instinct ẩn đau) — chủ thường phát hiện trễ

### Đánh răng tại nhà

**Tần suất**: 2-3 lần/tuần (lý tưởng hàng ngày)

**Dụng cụ**:
- Bàn chải mềm pet (KHÔNG bàn chải người)
- Kem đánh răng pet (KHÔNG kem người — fluoride độc)

**Quy trình**:
1. Tập cho pet quen ngón tay sờ miệng (vài tuần)
2. Thoa kem lên ngón → cho pet liếm
3. Tăng dần — chạm răng → bàn chải mềm
4. Chải ngoài + lợi, 30 giây mỗi bên

### Dấu hiệu nha chu

- Hơi thở hôi
- Cao răng vàng/nâu
- Lợi đỏ, chảy máu
- Pet bỏ ăn cứng / nhai 1 bên

### Cạo cao răng chuyên nghiệp

- Vet gây mê + scaling + polish
- 1-2 năm/lần (tuỳ pet)
- Pet già: ECG + máu trước gây mê

### Phụ trợ

- Dental treats (Greenies, Dentastix)
- Đồ chơi gặm (KHÔNG xương cứng — gãy răng)
- Bột rắc vào nước (chlorhexidine)`,
    when_to_vet: "Răng lung lay, chảy máu khi ăn, sưng má → khám cạo cao răng + có thể nhổ.",
    related_slugs: ["grooming-bathing", "senior-pet-care"],
  },
  {
    slug: "grooming-bathing",
    title_vi: "Tắm gội pet đúng cách",
    category: "grooming",
    species: ["both"],
    tags: ["tắm", "shampoo", "frequency"],
    summary: "Chó: 2-4 tuần/lần. Mèo: chỉ tắm khi bẩn (mèo tự liếm sạch). Shampoo pet riêng, không bao giờ shampoo người.",
    content_md: `### Tần suất tắm

**Chó:**
- Lông ngắn ít hoạt động: 4-6 tuần/lần
- Lông dài / outdoor: 2-4 tuần
- Tắm nhiều quá → khô da, viêm da

**Mèo:**
- KHÔNG cần tắm thường xuyên (tự liếm sạch)
- Chỉ tắm khi bẩn rõ (dầu mỡ, hoá chất) hoặc theo chỉ định vet
- 2-3 tháng/lần MAX

### Shampoo

**DÙNG**: Pet shampoo pH phù hợp (pH 6.5-7.5 cho pet, khác người pH 5.5)

**KHÔNG dùng**:
- Shampoo người (pH lệch → khô + viêm)
- Sữa tắm trẻ em
- Xà phòng giặt

### Quy trình tắm chó

1. Chải lông trước (gỡ rối)
2. Nước ấm 35-38°C (test khuỷu tay)
3. Làm ướt từ cổ xuống, tránh mắt + tai
4. Xoa shampoo 5 phút
5. Xả thật kỹ (shampoo còn → viêm da)
6. Lau khăn + sấy lạnh / phơi nắng nhẹ
7. Vệ sinh tai bằng dung dịch chuyên dụng

### Mèo cần tắm

- Đeo găng tay dày
- Nước cạn 5cm (mèo sợ ngập)
- Nhanh < 10 phút
- 2 người: 1 giữ, 1 tắm

### Sau tắm

- Sấy lông đến khô hoàn toàn (mèo dễ cảm lạnh)
- Quan sát ngứa / đỏ da 24h`,
    when_to_vet: "Ngứa dữ dội sau tắm + lan rộng → có thể dị ứng shampoo. Đỏ da + rỉ nước → khám.",
    related_slugs: ["dental-care", "flea-tick-prevention"],
  },

  // ============================================================
  // BEHAVIOR (2)
  // ============================================================
  {
    slug: "behavior-aggression",
    title_vi: "Pet đột nhiên hung dữ — nguyên nhân?",
    category: "behavior",
    species: ["both"],
    tags: ["hung dữ", "đột nhiên", "đau"],
    summary: "Aggression đột ngột thường là dấu hiệu ĐAU, không phải tính cách. Khám vet trước khi training.",
    content_md: `### Quy tắc số 1

Pet **đột nhiên** hung dữ (trước đó hiền) = nghĩ đến **đau** hoặc **bệnh** trước, không phải hành vi.

### Nguyên nhân y học phổ biến

- Đau khớp (chó già)
- Đau răng / áp xe miệng
- Đau tai (otitis)
- Nhiễm trùng đường tiểu (mèo)
- Khối u
- Hormone (mèo đực chưa triệt sản)
- Cường giáp (mèo già)

### Nguyên nhân tâm lý

- Sợ hãi (nguồn lực bị đe doạ — đồ ăn, chỗ ngủ)
- Bảo vệ chủ
- Lo âu (chuyển nhà, có bé mới)
- Đau buồn mất bạn (pet/chủ)

### Cần làm

1. **Khám vet trước** — loại trừ đau/bệnh
2. KHÔNG đánh hoặc la mắng (làm tệ thêm)
3. Tách pet ra khỏi tình huống kích thích
4. Ghi nhận **tác nhân** (trigger): ai, lúc nào, bối cảnh
5. Nếu y học OK → behaviorist tư vấn

### Triệt sản

Đực chưa triệt sản hung dữ với đực khác → triệt sản giảm 50-70% trường hợp.

### Tránh

- KHÔNG dùng vòng cổ shock / vòng gai (làm aggression tệ hơn)
- KHÔNG ép pet đối mặt trigger
- KHÔNG bỏ rơi → xin tư vấn`,
    when_to_vet: "Aggression mới + có triệu chứng (đau, sốt, lờ đờ) → khám ngay. Cắn người → cách ly + vet + behaviorist.",
    related_slugs: ["behavior-separation", "senior-pet-care"],
  },
  {
    slug: "behavior-separation",
    title_vi: "Lo âu khi xa chủ (separation anxiety)",
    category: "behavior",
    species: ["both"],
    tags: ["lo âu", "anxiety", "khi vắng"],
    summary: "Pet phá đồ, kêu liên tục, đại tiểu tiện sai chỗ khi chủ vắng. Cần training dần + có thể cần thuốc nhẹ.",
    content_md: `### Dấu hiệu

- Phá đồ NGAY khi chủ vừa đi (không lúc khác)
- Kêu / sủa kéo dài
- Đại tiểu tiện trong nhà (pet đã trained)
- Tự cào liếm gây thương
- Cố thoát ra (cắn cửa, cào)

### KHÔNG phải SA

- Nếu pet phá đồ khắp giờ (kể cả chủ ở nhà) — đó là chán/thiếu vận động, không phải SA
- Puppy <6 tháng — vẫn đang học, kiên nhẫn

### Training dần (desensitization)

1. **Cue trung tính**: lấy chìa khoá, mặc áo khoác... nhưng KHÔNG đi → pet học "lấy chìa ≠ đi"
2. **Vắng ngắn**: ra ngoài 1 phút → quay lại bình thường (không hôn hít chia tay)
3. **Tăng dần**: 5 phút → 15 → 30 → 1h → 4h trong nhiều tuần
4. **KHÔNG kịch tính** khi rời + về

### Trợ giúp

- Đồ chơi nhồi đồ ăn (Kong filled peanut butter — không có xylitol)
- Để áo cũ có mùi chủ
- Nhạc nhẹ / TV bật (white noise)
- Camera để theo dõi

### Y học

- Pheromone (Adaptil cho chó, Feliway cho mèo)
- Thuốc chống lo âu (vet kê — fluoxetine, trazodone) — case nặng

### Phòng ngừa

- Khi nuôi pet mới: tập alone time NGAY từ ngày đầu
- Không bao giờ phá pet ngủ
- Routine ổn định (giờ ăn, đi dạo)`,
    when_to_vet: "Tự cào liếm gây thương / không ăn khi chủ vắng → behaviorist + thuốc.",
    related_slugs: ["behavior-aggression", "puppy-training-basics"],
  },

  // ============================================================
  // TRAINING (2)
  // ============================================================
  {
    slug: "puppy-training-basics",
    title_vi: "Huấn luyện puppy cơ bản (8-16 tuần vàng)",
    category: "training",
    species: ["dog"],
    tags: ["puppy", "socialization", "potty"],
    summary: "Cửa sổ socialization 8-16 tuần — gặp 100+ người + pet + tình huống mới. Positive reinforcement only.",
    content_md: `### Cửa sổ vàng: 8-16 tuần

Não puppy học nhanh nhất + ít sợ — **expose** càng nhiều càng tốt:
- 100 người khác nhau (giới tính, tuổi, dáng vẻ)
- 20+ chó đã tiêm phòng đầy đủ
- Tiếng ồn (xe máy, máy hút, sấm)
- Đồ vật lạ (ô, xe đạp, gương)

### Tránh

- Đợi tiêm hết mới socialize → trễ cửa sổ
- Compromise: bế puppy ra ngoài (chưa đi bộ) trước khi đủ vaccine

### Lệnh cơ bản (theo thứ tự)

1. **Tên + tập trung** (look at me)
2. **Sit** (ngồi) — dùng đồ ăn dụ
3. **Stay** (đứng yên) — vài giây tăng dần
4. **Come** (gọi lại) — luôn reward, KHÔNG mắng khi đến chậm
5. **Leave it** (bỏ ra) — cứu mạng khi pet định ăn vật cấm

### Potty training

- Đưa ra ngoài / lên pad: sau ăn, sau ngủ, sau chơi, mỗi 1-2h
- Khi pet đi đúng chỗ → reward NGAY (3 giây vàng)
- KHÔNG phạt khi đi sai → puppy sợ + giấu chỗ khác

### Quy tắc reward

- 1 reward = 1 hành vi đúng (timing < 1 giây)
- Treats nhỏ + giòn (nhanh nhai để continue)
- Khen ngợi nhiệt tình
- KHÔNG dùng đòn đánh / vòng shock (làm sợ + phá quan hệ)

### Lớp puppy

Tham gia puppy class (sau mũi vaccine 2) — chuyên gia + socialize cùng puppy khác.`,
    when_to_vet: "Puppy quá nhát, không phản ứng khi gọi tên, không quan tâm thức ăn → check thần kinh / thính giác.",
    related_slugs: ["cat-litter-training", "behavior-aggression"],
  },
  {
    slug: "cat-litter-training",
    title_vi: "Huấn luyện mèo dùng khay cát",
    category: "training",
    species: ["cat"],
    tags: ["khay cát", "litter box", "tiểu bậy"],
    summary: "Mèo bản năng dùng cát — nếu tiểu bậy là bất thường (stress, bệnh đường tiểu, khay sai).",
    content_md: `### Quy tắc khay

- **Số khay** = số mèo + 1 (3 mèo → 4 khay)
- **Vị trí**: yên tĩnh, riêng tư, KHÔNG cạnh bát ăn
- **Kích thước**: dài = 1.5× chiều dài mèo
- **Sàn**: open top tốt hơn covered (mèo ngửi được — nhiều mèo ghét covered)
- **Vệ sinh**: hốt phân mỗi ngày, thay cát toàn bộ + rửa khay 1 tuần/lần

### Loại cát

- Clumping (vón cục): tiện hốt, mùi tốt
- Crystal silica: hút ẩm tốt
- Pellet (gỗ ép): eco nhưng mèo ít thích
- TRÁNH: cát có mùi mạnh (mèo ghét), khử mùi hoá chất

### Mèo tiểu/đại tiện sai chỗ

**Khám vet TRƯỚC** — loại trừ:
- Nhiễm trùng đường tiểu (FLUTD — đặc biệt mèo đực, có thể tắc niệu đạo cấp cứu)
- Sỏi bàng quang
- Tiểu đường
- Cường giáp

**Sau khi y học OK:**
- Đổi cát khác (mèo có thể không thích)
- Thêm khay
- Dọn sạch chỗ cũ (enzyme cleaner, không amoniac — kích thích tiểu lại)
- Giảm stress (đổi nhà, có pet mới)

### Kitten

- Đặt kitten vào khay sau ăn → bản năng cào → đào → tiểu
- KHÔNG ép — mèo tự học trong 1-2 tuần
- Khen ngợi nhẹ khi dùng đúng

### Senior mèo (>10 tuổi)

- Khay thành thấp (đau khớp)
- Nhiều khay hơn (đường gần hơn)`,
    when_to_vet: "Mèo đực rặn tiểu mà không ra → TẮC NIỆU ĐẠO, cấp cứu trong 24h. Tiểu ra máu → khám.",
    related_slugs: ["behavior-aggression", "senior-pet-care"],
  },

  // ============================================================
  // SENIOR + POST-SURGERY (2)
  // ============================================================
  {
    slug: "senior-pet-care",
    title_vi: "Chăm sóc pet già (>7 tuổi)",
    category: "senior_care",
    species: ["both"],
    tags: ["senior", "geriatric", "khám định kỳ"],
    summary: "Chó >7 tuổi, mèo >10 tuổi. Khám 6 tháng/lần thay vì hàng năm. Điều chỉnh nutrition + vận động.",
    content_md: `### Khi nào là "senior"?

- Chó nhỏ (<10kg): 8-10 năm
- Chó vừa: 7-9 năm
- Chó lớn (>30kg): 6-7 năm
- Mèo: 10-12 năm

### Khám định kỳ tăng

Từ 1 năm/lần → **6 tháng/lần**:
- Khám tổng quát + máu (CBC, chemistry)
- Nước tiểu
- HA (đặc biệt mèo — tăng HA gây mù)
- Tuyến giáp (mèo già — cường giáp phổ biến)
- ECG nếu nghi tim

### Bệnh phổ biến senior

- Thoái hoá khớp (đau lưng/khớp)
- Suy thận mãn (đặc biệt mèo)
- Cường giáp (mèo)
- Cushing (chó già)
- Tim mạch (giống nhỏ + Cavalier)
- Ung thư (vú, lymphoma)
- Sa sút trí tuệ (CCD — cognitive dysfunction)

### Điều chỉnh hằng ngày

**Nutrition:**
- Giảm 10-20% calo (chuyển hoá chậm)
- Tăng omega-3 (khớp + tim)
- Giảm muối (tim, thận)
- Wet food nhiều hơn (đủ nước)

**Vận động:**
- Đi bộ ngắn nhiều lần thay 1 lần dài
- Tránh nhảy cao (chó nhỏ — Pomeranian, Chihuahua)
- Đệm mềm thay ổ cứng

**Môi trường:**
- Khay cát thành thấp (mèo)
- Cầu thang sang giường (chó)
- Đèn đêm (mắt mờ)

### Cognitive decline

- Đi lang thang đêm, kêu vô cớ
- Quên routine (giờ ăn)
- Đại tiểu sai chỗ
- Khám vet — có thể là sa sút trí tuệ (có thuốc support)`,
    when_to_vet: "Sụt cân + uống nước nhiều + đi tiểu nhiều = suy thận / tiểu đường / cường giáp. Khám ngay.",
    related_slugs: ["nutrition-basics-dog", "nutrition-basics-cat", "post-surgery-care"],
  },
  {
    slug: "post-surgery-care",
    title_vi: "Chăm pet sau mổ (triệt sản, gãy xương, u)",
    category: "post_surgery",
    species: ["both"],
    tags: ["hậu phẫu", "E-collar", "vết thương"],
    summary: "E-collar 10-14 ngày + hạn chế vận động + theo dõi vết thương + đúng thuốc. Cắt chỉ 7-10 ngày.",
    content_md: `### 24h đầu sau mổ

- Pet còn mệt do gây mê — để yên tĩnh
- Có thể nôn nhẹ (bình thường)
- Cho ăn ít, 4-6h sau mổ (nếu vet OK)
- Nước sạch luôn sẵn
- KHÔNG cho ăn nếu pet quá lơ mơ → nguy cơ sặc

### E-collar (nón loa)

- Đeo **24/7 cho 10-14 ngày** — kể cả ngủ + ăn
- Pet liếm vết khâu → nhiễm trùng / hở vết
- Tháo E-collar 5 phút trong giám sát chỉ nếu pet không liếm

### Theo dõi vết khâu

**Bình thường:**
- Sưng nhẹ 1-2 ngày
- Bầm tím vài ngày
- Tiết dịch trong/nhạt

**Bất thường (báo vet):**
- Sưng to + nóng + đỏ
- Chảy mủ vàng/xanh
- Vết khâu hở > 1mm
- Mùi hôi
- Pet rất đau khi sờ

### Vận động

- 10-14 ngày đầu: hạn chế tối đa
- KHÔNG nhảy, chạy, leo cầu thang
- Chó: chỉ đi dạo ngắn dây xích
- Mèo: nhốt phòng nhỏ

### Thuốc

- Đúng giờ, đúng liều
- Hết 1 đợt kháng sinh — KHÔNG dừng sớm dù pet có vẻ khoẻ (kháng kháng sinh)
- Giảm đau: KHÔNG dùng paracetamol / ibuprofen người (CHẾT mèo, độc chó)

### Cắt chỉ

- 7-10 ngày sau mổ (vet hẹn)
- Một số chỉ tự tiêu — vet sẽ note
- Tái khám đúng lịch

### Dấu hiệu khẩn cấp

- Sốt cao (>39.5°C)
- Bỏ ăn >48h sau mổ
- Nôn ra máu / tiêu chảy nặng
- Khó thở
- Vết thương hở rộng`,
    when_to_vet: "Bất kỳ dấu hiệu khẩn cấp ở trên → gọi clinic ngay. Vết khâu chảy mủ hoặc sốt → đi khám trong 24h.",
    related_slugs: ["spay-neuter-when", "senior-pet-care"],
  },
];

// ============================================================
// Helpers
// ============================================================

export function getFaq(slug: string): FaqArticle | null {
  return FAQ_ARTICLES.find((a) => a.slug === slug) || null;
}

export interface FaqPreview {
  slug: string;
  title_vi: string;
  category: FaqCategory;
  category_label_vi: string;
  species: FaqSpecies[];
  tags: string[];
  summary: string;
}

export function toFaqPreview(a: FaqArticle): FaqPreview {
  return {
    slug: a.slug,
    title_vi: a.title_vi,
    category: a.category,
    category_label_vi: FAQ_CATEGORY_LABEL_VI[a.category],
    species: a.species,
    tags: a.tags,
    summary: a.summary,
  };
}

/** Simple text scoring search (title weight 3 + tags weight 2 + summary 1 + content 0.5). */
export function searchFaq(q: string, filter?: { category?: FaqCategory; species?: "dog" | "cat" }): FaqPreview[] {
  const query = q.trim().toLowerCase();
  let candidates = FAQ_ARTICLES;
  if (filter?.category) candidates = candidates.filter((a) => a.category === filter.category);
  if (filter?.species)
    candidates = candidates.filter(
      (a) => a.species.includes(filter.species!) || a.species.includes("both")
    );

  if (!query) return candidates.map(toFaqPreview);

  const scored = candidates.map((a) => {
    let score = 0;
    const lTitle = a.title_vi.toLowerCase();
    const lSummary = a.summary.toLowerCase();
    const lContent = a.content_md.toLowerCase();
    const tags = a.tags.map((t) => t.toLowerCase());
    if (lTitle.includes(query)) score += 3;
    if (tags.some((t) => t.includes(query))) score += 2;
    if (lSummary.includes(query)) score += 1;
    if (lContent.includes(query)) score += 0.5;
    return { a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((s) => toFaqPreview(s.a));
}
