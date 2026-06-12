/**
 * danger_kb migration — KB cảnh báo chất nguy hiểm (vet-approved) cho food-scan.
 *
 * Idempotent. Persists table id + field ids to baserow-config.json (qua /tmp/baserow-config.new.json).
 *
 * **What it stores**: mỗi row = 1 chất nguy hiểm × 1 loài (paracetamol tách 2 row cat/dog vì
 * severity khác nhau). App (api/src/lib/kb-warnings.ts) CHỈ load rows status=approved —
 * seed để DRAFT, bác sĩ thú y duyệt trong Baserow UI mới sống.
 *
 * Fields:
 *   - substance_name  text           — tên chuẩn hiển thị trên box cảnh báo
 *   - aliases         long_text      — VN+EN ngăn cách "|", matcher word-boundary diacritic-aware
 *   - species         single_select  — dog | cat | both
 *   - severity        single_select  — fatal | severe | caution
 *   - summary_vi      long_text      — 1-2 câu cơ chế
 *   - action_vi       long_text      — chủ cần làm gì NGAY (không kê liều, luôn kết "đưa bác sĩ thú y")
 *   - source          text           — URL nguồn tham khảo
 *   - status          single_select  — draft | approved (app chỉ đọc approved)
 *   - reviewed_by     text           — tên bác sĩ duyệt
 *   - reviewed_at     text           — ISO date
 *   - created_at      text           — ISO timestamp
 *
 * Seed: 9 rows draft (8 chất; alias đã curate theo nguyên tắc "cụm đặc hiệu — thà sót còn hơn
 * báo láo": bỏ terpene chung pinene/camphene/borneol/fenchone, bỏ acronym ASA, bỏ "hẹ" 2 ký tự,
 * bỏ "cocoa extract" dính mỹ phẩm; nội dung đối chiếu VCA/Pet Poison Helpline).
 *
 * Run:
 *   docker compose exec vowvet-api bun run scripts/migrate-danger-kb.ts
 *   docker cp vowvet-api:/tmp/baserow-config.new.json ./baserow-config.json
 *   docker restart vowvet-api
 */
import { writeFileSync, readFileSync } from "node:fs";

/** Seed rows — EXPORT để harness test matcher pure trên đúng alias seed (không cần Baserow). */
export const SEED_ROWS = [
  {
    substance_name: "Rowatinex (tinh dầu terpenes)",
    aliases: "rowatinex|rowachol",
    species: "cat",
    severity: "fatal",
    summary_vi:
      "Rowatinex là thuốc sỏi thận của người, chứa hỗn hợp tinh dầu terpenes. Mèo thiếu men gan glucuronyl transferase nên không chuyển hóa được terpenes — chất độc tích lại gây tổn thương gan, thận và có thể tử vong.",
    action_vi:
      "KHÔNG cho mèo uống/liếm và cất thuốc xa tầm với ngay. Nếu mèo đã nuốt hoặc liếm phải, mang theo vỉ/hộp thuốc và đưa mèo đến bác sĩ thú y hoặc cơ sở cấp cứu ngay lập tức.",
    source: "https://vcahospitals.com/know-your-pet/essential-oil-and-liquid-potpourri-poisoning-in-cats",
  },
  {
    substance_name: "Paracetamol (Acetaminophen)",
    aliases: "paracetamol|acetaminophen|panadol|efferalgan|hapacol|tylenol|tatanol|partamol",
    species: "cat",
    severity: "fatal",
    summary_vi:
      "Mèo thiếu enzyme gan để khử độc paracetamol: thuốc biến hemoglobin thành methemoglobin khiến máu không tải được oxy, phá vỡ hồng cầu và gây suy gan. Chỉ 1 viên hạ sốt của người cũng đủ giết một con mèo.",
    action_vi:
      "Ngừng cho tiếp xúc thuốc ngay, cất xa tầm với. KHÔNG tự gây nôn, KHÔNG cho uống thêm bất kỳ thứ gì. Ghi lại tên thuốc, hàm lượng, số viên đã ăn và mang theo vỏ thuốc. Đưa mèo đến bác sĩ thú y hoặc phòng cấp cứu thú y NGAY — cấp cứu tính bằng giờ.",
    source: "https://vcahospitals.com/know-your-pet/acetaminophen-toxicity-in-cats",
  },
  {
    substance_name: "Paracetamol (Acetaminophen)",
    aliases: "paracetamol|acetaminophen|panadol|efferalgan|hapacol|tylenol|tatanol|partamol",
    species: "dog",
    severity: "severe",
    summary_vi:
      "Ở chó, paracetamol liều cao gây hoại tử tế bào gan và có thể làm máu mất khả năng tải oxy (methemoglobin). Chó chịu được liều cao hơn mèo nhưng vẫn ngộ độc nặng nếu ăn nhầm nhiều.",
    action_vi:
      "Cất thuốc xa tầm với của chó ngay. KHÔNG tự gây nôn hay cho uống thuốc gì khác. Ghi lại tên thuốc, hàm lượng, số viên đã ăn và mang theo vỏ thuốc. Đưa chó đến bác sĩ thú y hoặc phòng cấp cứu thú y NGAY.",
    source: "https://www.petpoisonhelpline.com/poison/acetaminophen/",
  },
  {
    substance_name: "Ibuprofen",
    aliases: "ibuprofen|advil|motrin|brufen|mofen|nurofen",
    species: "both",
    severity: "severe",
    summary_vi:
      "Ibuprofen là thuốc giảm đau NSAID của người, chó mèo chuyển hoá rất kém. Thuốc ức chế men COX làm loét và thủng dạ dày, giảm máu tới thận gây suy thận; mèo nhạy gấp đôi chó, một viên nhỏ cũng nguy hiểm.",
    action_vi:
      "Ngừng ngay, không cho thú cưng uống thêm và cất hết vỉ thuốc của người xa tầm với. KHÔNG tự gây nôn hay cho uống thuốc nào khác. Ghi lại tên thuốc, hàm lượng và số viên đã ăn rồi đưa thú cưng đến bác sĩ thú y hoặc phòng cấp cứu NGAY.",
    source: "https://www.petpoisonhelpline.com/poison/ibuprofen/",
  },
  {
    substance_name: "Aspirin (acetylsalicylic acid)",
    aliases: "aspirin|aspirine|acetylsalicylic acid|acetylsalicylate|acid acetylsalicylic|axit acetylsalicylic",
    species: "cat",
    severity: "severe",
    summary_vi:
      "Mèo thiếu enzyme chuyển hóa salicylate nên thải aspirin cực chậm (gấp ~10 lần người), thuốc tích lũy gây độc: loét và xuất huyết dạ dày, tổn thương gan và thận.",
    action_vi:
      "Ngừng ngay, không cho mèo dùng thêm aspirin và cất hết thuốc xa tầm với. Không tự gây nôn hay cho uống bất cứ thứ gì. Ghi lại lượng và thời điểm mèo nuốt phải rồi đưa đến bác sĩ thú y hoặc cơ sở cấp cứu thú y ngay lập tức.",
    source: "https://www.petpoisonhelpline.com/pet-tips/cats-and-aspirin/",
  },
  {
    substance_name: "Permethrin / Pyrethroid (thuốc ve rận của CHÓ)",
    aliases:
      "permethrin|pyrethrin|pyrethroid|pyrethrum|deltamethrin|cypermethrin|phenothrin|d-phenothrin|tetramethrin|prallethrin|etofenprox|k9 advantix|advantix",
    species: "cat",
    severity: "fatal",
    summary_vi:
      "Gan mèo thiếu men chuyển hóa (glucuronidation) nhóm pyrethroid như permethrin — chất tích lại tấn công hệ thần kinh gây run cơ, co giật, tử vong. An toàn cho chó nhưng cực độc với mèo dù chỉ liếm hoặc cọ phải lượng nhỏ.",
    action_vi:
      "Tuyệt đối KHÔNG dùng thuốc/xịt diệt ve rận của CHÓ cho MÈO. Nếu mèo lỡ bị bôi, liếm hoặc tiếp xúc: rửa sạch chỗ dính bằng nước ấm và xà phòng, không để mèo liếm thêm, giữ ấm và đưa đến bác sĩ thú y / cấp cứu NGAY.",
    source: "https://vcahospitals.com/know-your-pet/pyrethrinpyrethroid-poisoning-in-cats",
  },
  {
    substance_name: "Xylitol (chất tạo ngọt)",
    aliases: "xylitol|xylit|birch sugar|e967|đường bạch dương|duong bach duong",
    species: "dog",
    severity: "fatal",
    summary_vi:
      "Chó ăn phải xylitol → tuyến tụy tiết insulin ồ ạt, đường huyết tụt cấp trong 10-60 phút (run rẩy, loạng choạng, co giật). Liều cao còn gây hoại tử gan cấp.",
    action_vi:
      "Lấy ngay sản phẩm khỏi tầm với chó, ghi lại tên sản phẩm + lượng đã ăn. KHÔNG tự gây nôn hay cho ăn uống gì. Đưa chó đến bác sĩ thú y hoặc cơ sở cấp cứu NGAY, kể cả khi chưa thấy triệu chứng.",
    source: "https://www.petpoisonhelpline.com/poison/xylitol/",
  },
  {
    substance_name: "Chocolate / Theobromine / Cacao",
    aliases:
      "chocolate|sô cô la|socola|sôcôla|cacao|ca cao|theobromine|cocoa powder|cocoa mass|cocoa solids|bột cacao|bột ca cao|so co la|bot cacao|bot ca cao",
    species: "both",
    severity: "severe",
    summary_vi:
      "Chocolate và cacao chứa theobromine cùng caffeine — chó mèo chuyển hoá rất chậm nên tích tụ, kích thích tim và hệ thần kinh: tim đập nhanh, nôn, run rẩy, co giật. Chocolate càng đen/đắng càng độc.",
    action_vi:
      "Ngừng cho ăn ngay và cất hết chocolate/cacao khỏi tầm với. Ghi lại loại (đen/sữa/bột), lượng đã ăn và thời điểm. Không tự gây nôn khi chưa có chỉ định. Đưa thú cưng đến bác sĩ thú y hoặc cơ sở cấp cứu ngay.",
    source: "https://www.petpoisonhelpline.com/poison/chocolate/",
  },
  {
    substance_name: "Hành / Tỏi / họ Allium",
    aliases:
      "hành tây|hành lá|hành tím|hành khô|hành phi|bột hành|chiết xuất hành|tỏi|bột tỏi|chiết xuất tỏi|onion powder|garlic powder|onion extract|garlic extract|dried onion|dried garlic|dehydrated onion|dehydrated garlic|garlic oil|chives|leek|scallion|spring onion|shallot|allium|hanh tay|hanh la|hanh tim|hanh kho|hanh phi|bot hanh|chiet xuat hanh|bot toi|chiet xuat toi",
    species: "both",
    severity: "severe",
    summary_vi:
      "Hành, tỏi và cây họ Allium chứa hợp chất oxy hóa làm vỡ màng hồng cầu của chó mèo → thiếu máu tan huyết (mèo nhạy hơn). Độc cả khi tươi, nấu chín, sấy khô hay dạng bột/chiết xuất.",
    action_vi:
      "Ngừng cho ăn ngay và cất sản phẩm xa tầm với. Theo dõi dấu hiệu mệt lả, nôn, bỏ ăn, nước tiểu sậm màu, nướu nhợt (có thể xuất hiện sau vài ngày). Đưa thú cưng đến bác sĩ thú y / cấp cứu ngay.",
    source: "https://vcahospitals.com/know-your-pet/onion-garlic-chive-and-leek-toxicity-in-dogs",
  },
];

// Chạy migration CHỈ khi gọi trực tiếp (harness import SEED_ROWS sẽ KHÔNG kích hoạt).
if (import.meta.main) {
  const configPath = Bun.env.BASEROW_CONFIG_IN || "/app/baserow-config.json";
  const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));

  const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
  const EMAIL = Bun.env.BASEROW_USER_EMAIL;
  const PASSWORD = Bun.env.BASEROW_USER_PASSWORD;
  if (!EMAIL || !PASSWORD) {
    console.error("❌ Missing BASEROW_USER_EMAIL/PASSWORD env.");
    process.exit(1);
  }

  const loginRes = await fetch(`${BASEROW_URL}/api/user/token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Host: "localhost:8888" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error(`❌ Baserow login failed: ${loginRes.status}`);
    process.exit(1);
  }
  const { access_token: JWT } = (await loginRes.json()) as { access_token: string };

  async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASEROW_URL}/api${path}`, {
      ...init,
      headers: {
        Authorization: `JWT ${JWT}`,
        "Content-Type": "application/json",
        Host: "localhost:8888",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  interface FieldDef { id: number; name: string; type: string; }
  interface TableDef { id: number; name: string; }

  const DATABASE_ID = (existingConfig as any).database_id;
  if (!DATABASE_ID) {
    console.error("❌ database_id missing from baserow-config.json");
    process.exit(1);
  }

  const opt = (value: string, color = "blue") => ({ value, color });

  async function ensureTable(name: string, fields: any[]): Promise<TableDef> {
    const tables = await api<TableDef[]>(`/database/tables/database/${DATABASE_ID}/`);
    let t = tables.find((x) => x.name === name);
    if (!t) {
      console.log(`🔄 Creating ${name}...`);
      t = await api<TableDef>(`/database/tables/database/${DATABASE_ID}/`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    } else {
      console.log(`  ↳ ${name} table already exists (id=${t.id})`);
    }
    const existing = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
    const have = new Set(existing.map((f) => f.name));
    let added = 0;
    for (const f of fields) {
      if (have.has(f.name)) continue;
      try {
        await api<FieldDef>(`/database/fields/table/${t.id}/`, { method: "POST", body: JSON.stringify(f) });
        added++;
      } catch (err) {
        console.warn(`  ⚠ ${name}.${f.name} skipped:`, String(err).slice(0, 120));
      }
    }
    console.log(`  ${name}: +${added} fields (id=${t.id})`);
    return t;
  }

  // ─── danger_kb ─────────────────────────────────────────────────────
  const DANGER_KB_FIELDS = [
    { name: "substance_name", type: "text" },
    { name: "aliases", type: "long_text" },
    {
      name: "species",
      type: "single_select",
      select_options: [opt("dog", "blue"), opt("cat", "green"), opt("both", "gray")],
    },
    {
      name: "severity",
      type: "single_select",
      select_options: [opt("fatal", "red"), opt("severe", "orange"), opt("caution", "yellow")],
    },
    { name: "summary_vi", type: "long_text" },
    { name: "action_vi", type: "long_text" },
    { name: "source", type: "text" },
    {
      name: "status",
      type: "single_select",
      select_options: [opt("draft", "gray"), opt("approved", "green")],
    },
    { name: "reviewed_by", type: "text" },
    { name: "reviewed_at", type: "text" },
    { name: "created_at", type: "text" },
  ];

  const t = await ensureTable("danger_kb", DANGER_KB_FIELDS);

  // ─── Seed (upsert: chưa có → tạo draft; đã có mà aliases khác → PATCH aliases,
  //      GIỮ NGUYÊN status/reviewed_by — không đụng phần bác sĩ đã duyệt) ────
  const existingRows = await api<{ results: any[] }>(
    `/database/rows/table/${t.id}/?user_field_names=true&size=200`,
  );
  const rowByKey = new Map<string, any>(
    (existingRows.results || []).map((r: any) => [
      `${r.substance_name}::${(r.species && typeof r.species === "object" ? r.species.value : r.species) || ""}`,
      r,
    ]),
  );
  let seeded = 0, patched = 0;
  for (const row of SEED_ROWS) {
    const existing = rowByKey.get(`${row.substance_name}::${row.species}`);
    if (!existing) {
      await api(`/database/rows/table/${t.id}/?user_field_names=true`, {
        method: "POST",
        body: JSON.stringify({ ...row, status: "draft", reviewed_by: "", reviewed_at: "", created_at: new Date().toISOString() }),
      });
      seeded++;
    } else if (String(existing.aliases || "").trim() !== row.aliases) {
      await api(`/database/rows/table/${t.id}/${existing.id}/?user_field_names=true`, {
        method: "PATCH",
        body: JSON.stringify({ aliases: row.aliases }),
      });
      patched++;
    }
  }
  console.log(`  danger_kb: +${seeded} seed rows (draft), ~${patched} aliases patched / ${SEED_ROWS.length} total`);

  // ─── Persist config ────────────────────────────────────────────────
  const config: any = JSON.parse(JSON.stringify(existingConfig));
  const fresh = await api<FieldDef[]>(`/database/fields/table/${t.id}/`);
  if (!config.tables.danger_kb) config.tables.danger_kb = { id: t.id, fields: {} };
  config.tables.danger_kb.id = t.id;
  for (const f of fresh) {
    if (f.name) config.tables.danger_kb.fields[f.name] = f.id;
  }

  const outPath = Bun.env.BASEROW_CONFIG_OUT || "/tmp/baserow-config.new.json";
  writeFileSync(outPath, JSON.stringify(config, null, 2));
  console.log(`\n✅ danger_kb migration done. New config → ${outPath}`);
  console.log(`   Run on host:`);
  console.log(`     docker cp vowvet-api:${outPath} ./baserow-config.json`);
  console.log(`     docker restart vowvet-api`);
}
