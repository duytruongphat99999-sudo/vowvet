/**
 * Vietnamese Festival Detector (M4.1 v2).
 *
 * 4 critical festivals: Tết, Trung thu, Halloween, Christmas.
 * Hardcoded date ranges (Tết + Trung thu là lunar — đã pre-compute 5 năm).
 *
 * Used by care-planner-v2 prompt builder để inject festival warnings.
 */

export type FestivalId = "tet" | "trung_thu" | "halloween" | "christmas";
export type FestivalPhase = "pre" | "during" | "post";

export interface Festival {
  id: FestivalId;
  name_vi: string;
  emoji: string;
  date_ranges_by_year: Record<number, { during_start: string; during_end: string }>;
  pre_window_days: number; // số ngày trước during_start được coi là 'pre'
  post_window_days: number; // số ngày sau during_end được coi là 'post'
  pet_warnings: string[];
  foods_to_avoid: string[];
}

export const FESTIVALS: Record<FestivalId, Festival> = {
  tet: {
    id: "tet",
    name_vi: "Tết Âm lịch",
    emoji: "🧧",
    date_ranges_by_year: {
      2026: { during_start: "2026-02-16", during_end: "2026-02-23" }, // Bính Ngọ
      2027: { during_start: "2027-02-06", during_end: "2027-02-13" }, // Đinh Mùi
      2028: { during_start: "2028-01-26", during_end: "2028-02-02" }, // Mậu Thân
      2029: { during_start: "2029-02-13", during_end: "2029-02-20" }, // Kỷ Dậu
      2030: { during_start: "2030-02-03", during_end: "2030-02-10" }, // Canh Tuất
    },
    pre_window_days: 7,
    post_window_days: 3,
    pet_warnings: [
      "Bánh chưng/bánh tét dầu mỡ + mứt nhiều đường → tiêu chảy + viêm tuỵ",
      "Pháo + tiếng ồn lớn → panic, bé có thể bỏ chạy đi lạc (đeo collar có QR/microchip)",
      "Khách lạ vào nhà liên tục → stress, monitor kỹ pet thuộc type Sensitive/Loner",
      "Lì xì giấy đỏ + dây trang trí → nguy cơ nuốt phải tắc ruột",
      "Hoa đào/mai cắt cành → một số loài độc nếu pet cắn nhai",
    ],
    foods_to_avoid: [
      "Bánh chưng, bánh tét",
      "Mứt (mứt dừa, mứt gừng, mứt sen tẩm đường)",
      "Hạt dưa nhuộm phẩm đỏ",
      "Thịt khô mặn (bò khô, thịt heo khô)",
      "Hạt bí, hạt hướng dương vỏ cứng",
    ],
  },

  trung_thu: {
    id: "trung_thu",
    name_vi: "Trung Thu",
    emoji: "🥮",
    date_ranges_by_year: {
      2026: { during_start: "2026-09-24", during_end: "2026-09-27" },
      2027: { during_start: "2027-09-14", during_end: "2027-09-17" },
      2028: { during_start: "2028-10-02", during_end: "2028-10-05" },
      2029: { during_start: "2029-09-21", during_end: "2029-09-24" },
      2030: { during_start: "2030-09-11", during_end: "2030-09-14" },
    },
    pre_window_days: 5,
    post_window_days: 2,
    pet_warnings: [
      "BÁNH TRUNG THU CHỨA NHÂN HẠT SEN + ĐẬU XANH NƯỚNG DẦU — chó ăn vào tắc ruột nguy hiểm",
      "Đèn lồng nến → cháy lông, bỏng da nếu pet đến gần",
      "Đèn lồng pin → nuốt pin gây ngộ độc kim loại nặng (cấp cứu 24h)",
      "Múa lân + trống lớn → tiếng ồn gây panic",
      "Trẻ con cho pet ăn bánh giấu chủ → kiểm soát kỹ",
    ],
    foods_to_avoid: [
      "Bánh trung thu nhân thập cẩm",
      "Bánh nhân hạt sen, đậu xanh tẩm dầu",
      "Bánh nhân lá dứa nhuộm phẩm",
      "Trà sen (caffeine cao)",
    ],
  },

  halloween: {
    id: "halloween",
    name_vi: "Halloween",
    emoji: "🎃",
    date_ranges_by_year: (() => {
      const ranges: Record<number, { during_start: string; during_end: string }> = {};
      for (let y = 2026; y <= 2035; y++) {
        ranges[y] = { during_start: `${y}-10-28`, during_end: `${y}-11-01` };
      }
      return ranges;
    })(),
    pre_window_days: 3,
    post_window_days: 2,
    pet_warnings: [
      "🚨 SOCOLA TẤT CẢ LOẠI — chứa theobromine ĐỘC với chó, có thể tử vong",
      "🚨 KẸO XYLITOL (sugar-free) — gây hạ đường huyết nhanh + suy gan trong 30 phút",
      "Costume cosplay cho bé → vải có thể gây ngứa/dị ứng, ribbon/zip → nuốt nguy hiểm",
      "Khách trick-or-treat liên tục bấm chuông → stress mạnh, có thể đại tiểu tiện trong nhà",
      "Bí ngô nguyên/trang trí → nấm mốc + vi khuẩn nếu để lâu, KHÔNG cho ăn",
    ],
    foods_to_avoid: [
      "Socola (đặc biệt dark chocolate, baking chocolate)",
      "Kẹo xylitol/sugar-free",
      "Kẹo dẻo (gummy bears, taffy)",
      "Kẹo cứng → vỡ răng",
      "Bí ngô trang trí lên men",
    ],
  },

  christmas: {
    id: "christmas",
    name_vi: "Giáng Sinh",
    emoji: "🎄",
    date_ranges_by_year: (() => {
      const ranges: Record<number, { during_start: string; during_end: string }> = {};
      for (let y = 2026; y <= 2035; y++) {
        ranges[y] = { during_start: `${y}-12-22`, during_end: `${y}-12-26` };
      }
      return ranges;
    })(),
    pre_window_days: 5,
    post_window_days: 3,
    pet_warnings: [
      "Cây thông giả → lá nhựa độc nếu cắn nhai (dầu hoá học)",
      "Đèn LED dây + ổ điện → nguy cơ giật điện nếu cắn dây",
      "Đèn LED nuốt → ngộ độc kim loại + tắc đường tiêu hoá",
      "Quà socola dưới gốc cây → giấu cao + kín tủ, đặc biệt giai đoạn trẻ con đến chơi",
      "Ham mỡ heo + xương gà party còn lại → viêm tuỵ cấp + xương vỡ đâm ruột",
      "Cây thật (poinsettia, mistletoe) → toxic nếu cắn",
    ],
    foods_to_avoid: [
      "Socola (gift, baking)",
      "Xương gà nấu chín",
      "Ham mỡ heo, thịt nguội mặn",
      "Bánh kem có rượu rum/brandy",
      "Nho khô trong bánh fruitcake",
    ],
  },
};

// ============================================================
// Functions
// ============================================================

function parseDate(iso: string): Date {
  return new Date(iso + "T00:00:00+07:00"); // VN timezone
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Find nearest active festival within window.
 * Phase semantics:
 *   - pre: từ pre_window_days trước during_start → during_start (chưa tới)
 *   - during: trong khoảng during_start → during_end
 *   - post: sau during_end → +post_window_days
 *   - null: ngoài tất cả windows
 */
export function getActiveFestival(
  date: Date
): { festival: Festival; days_until: number; phase: FestivalPhase } | null {
  const year = date.getFullYear();
  const candidates: Array<{
    festival: Festival;
    days_until: number;
    phase: FestivalPhase;
  }> = [];

  for (const fid of Object.keys(FESTIVALS) as FestivalId[]) {
    const f = FESTIVALS[fid];
    // Check current year + next year (cho festivals cuối năm)
    for (const y of [year, year + 1]) {
      const range = f.date_ranges_by_year[y];
      if (!range) continue;
      const start = parseDate(range.during_start);
      const end = parseDate(range.during_end);
      const preStart = new Date(start.getTime() - f.pre_window_days * 24 * 60 * 60 * 1000);
      const postEnd = new Date(end.getTime() + f.post_window_days * 24 * 60 * 60 * 1000);

      if (date < preStart || date > postEnd) continue;

      let phase: FestivalPhase;
      let days_until: number;
      if (date < start) {
        phase = "pre";
        days_until = daysBetween(date, start);
      } else if (date >= start && date <= end) {
        phase = "during";
        days_until = 0;
      } else {
        phase = "post";
        days_until = -daysBetween(end, date); // negative = past
      }
      candidates.push({ festival: f, days_until, phase });
    }
  }

  if (candidates.length === 0) return null;

  // Priority: during > pre (closest) > post (just passed)
  candidates.sort((a, b) => {
    const order: Record<FestivalPhase, number> = { during: 0, pre: 1, post: 2 };
    if (order[a.phase] !== order[b.phase]) return order[a.phase] - order[b.phase];
    return Math.abs(a.days_until) - Math.abs(b.days_until);
  });

  return candidates[0];
}

/**
 * All festivals in window (cho admin overview / multi-festival edge cases).
 */
export function getAllFestivalsInWindow(date: Date, windowDays = 14): Festival[] {
  const year = date.getFullYear();
  const startWindow = new Date(date.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const endWindow = new Date(date.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const found: Festival[] = [];
  for (const fid of Object.keys(FESTIVALS) as FestivalId[]) {
    const f = FESTIVALS[fid];
    for (const y of [year - 1, year, year + 1]) {
      const range = f.date_ranges_by_year[y];
      if (!range) continue;
      const start = parseDate(range.during_start);
      const end = parseDate(range.during_end);
      // Check overlap với window
      if (end >= startWindow && start <= endWindow) {
        if (!found.find((x) => x.id === f.id)) found.push(f);
      }
    }
  }
  return found;
}

/**
 * Tóm tắt warning cho festival hiện hành dạng compact (cho prompt builder).
 */
export function summarizeFestivalForPrompt(
  fp: { festival: Festival; days_until: number; phase: FestivalPhase } | null
): string | null {
  if (!fp) return null;
  const phaseLabel =
    fp.phase === "during" ? "ĐANG DIỄN RA"
      : fp.phase === "pre" ? `CÒN ${fp.days_until} NGÀY`
      : `VỪA QUA ${Math.abs(fp.days_until)} NGÀY`;
  const warnings = fp.festival.pet_warnings.slice(0, 3).map((w) => `• ${w}`).join("\n");
  const foods = fp.festival.foods_to_avoid.slice(0, 5).join(", ");
  return `${fp.festival.emoji} ${fp.festival.name_vi} (${phaseLabel})\nCẢNH BÁO:\n${warnings}\nTHỰC PHẨM CẤM: ${foods}`;
}
