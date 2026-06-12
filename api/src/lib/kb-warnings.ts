/**
 * KB cảnh báo chất nguy hiểm (vet-approved) — match vào text OCR của food-scan.
 *
 * - Nguồn: bảng Baserow `danger_kb`, CHỈ load rows status=approved (seed để draft,
 *   bác sĩ duyệt trong Baserow UI mới sống — app không bao giờ hiện draft).
 * - Cache in-memory 10 phút (KB đổi chậm; bust tự nhiên theo TTL).
 * - Matcher diacritic-aware: lookaround Unicode `(?<![\p{L}\p{N}_])…(?![\p{L}\p{N}_])` /iu
 *   — TÁI DÙNG pattern b5ebba0 (allergen-normalizer.ts). COPY thay vì import vì file đó
 *   CẤM SỬA và matcher ở đây nhận alias ĐỘNG từ DB (normalizer là bảng tĩnh hardcode).
 * - Fail-soft tuyệt đối: Baserow lỗi / bảng chưa migrate → trả [] (KHÔNG chặn scan),
 *   còn stale cache thì dùng stale.
 * - ĐỘC LẬP verdict/analysis: route attach kb_warnings riêng — LLM chết vẫn phải cảnh báo.
 */
import { listRows } from "@shared/baserow.ts";

export interface KbWarning {
  substance: string;
  severity: "fatal" | "severe" | "caution";
  species: "dog" | "cat" | "both";
  matched_alias: string;
  summary: string;
  action: string;
}

export interface KbEntry {
  substance_name: string;
  aliases: string[];
  species: "dog" | "cat" | "both";
  severity: "fatal" | "severe" | "caution";
  summary_vi: string;
  action_vi: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { entries: KbEntry[]; at: number } | null = null;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** single_select Baserow trả {id,value,color} — bóc value; text thì trả thẳng. */
function selectValue(v: any): string {
  return String((v && typeof v === "object" ? v.value : v) ?? "").trim();
}

async function loadApprovedKb(): Promise<KbEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries;
  try {
    const res = await listRows<any>("danger_kb", { size: 200 });
    // Bẫy pagination CLAUDE.md §8: chỉ đọc trang 1 — KB vượt 200 rows thì approved ngoài trang 1
    // RỚT IM LẶNG. Log to để lộ sớm (fix phân trang khi thật sự chạm ngưỡng).
    if (res.next || (res.count ?? 0) > 200) {
      console.warn(`[kb-warnings] danger_kb có ${res.count} rows > 1 trang — entries ngoài trang 1 KHÔNG được match. Cần phân trang!`);
    }
    const entries: KbEntry[] = [];
    for (const r of res.results || []) {
      if (selectValue(r.status) !== "approved") continue;
      const aliases = String(r.aliases || "")
        .split("|")
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (!aliases.length || !r.substance_name) continue;
      const species = selectValue(r.species) as KbEntry["species"];
      const severity = selectValue(r.severity) as KbEntry["severity"];
      entries.push({
        substance_name: String(r.substance_name).trim(),
        aliases,
        species: species === "dog" || species === "cat" ? species : "both",
        severity: severity === "fatal" || severity === "severe" ? severity : "caution",
        summary_vi: String(r.summary_vi || "").trim(),
        action_vi: String(r.action_vi || "").trim(),
      });
    }
    cache = { entries, at: Date.now() };
    return entries;
  } catch (err: any) {
    console.error("[kb-warnings] load fail-soft:", String(err?.message || err).slice(0, 200));
    return cache?.entries ?? []; // stale còn hơn không; chưa từng load → rỗng
  }
}

/** Cụm phủ định ngay trước alias (cùng dòng, cửa sổ ≤25 ký tự): "Không chứa hành, tỏi" /
 *  "no garlic powder" / "free of garlic" là CLAIM AN TOÀN trên nhãn — match vào đó = báo láo.
 *  KHÔNG dùng "free" trần: "sugar-free gum with xylitol" — free phủ định chữ TRƯỚC nó (sugar),
 *  xylitol phía sau vẫn là thành phần thật (harness case F đã cắn). */
const NEGATION_BEFORE = /(?:không|khong|no|free\s+(?:of|from))\b[^\n]{0,20}$/iu;

/** true nếu MỌI lần alias xuất hiện trong text đều đứng sau cụm phủ định (cùng dòng). */
function allOccurrencesNegated(re: RegExp, text: string): boolean {
  const g = new RegExp(re.source, "giu");
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = g.exec(text)) !== null) {
    any = true;
    const prefix = text.slice(Math.max(0, m.index - 25), m.index);
    if (!NEGATION_BEFORE.test(prefix)) return false; // có ít nhất 1 occurrence "thật"
    if (m.index === g.lastIndex) g.lastIndex++; // safety chống zero-length loop
  }
  return any; // mọi occurrence đều bị phủ định
}

/**
 * Pure matcher — export riêng để harness test KHÔNG cần Baserow.
 * Alias nhiều từ: khoảng trắng khớp \s+ (OCR hay xuống dòng giữa cụm).
 * 1 row chỉ sinh tối đa 1 warning (alias đầu tiên trúng).
 * Negation guard: occurrence đứng ngay sau "không/khong/no/free" (cùng dòng) KHÔNG tính —
 * nhãn quảng cáo "Không chứa hành, tỏi" không được bật cảnh báo.
 */
export function matchKb(entries: KbEntry[], text: string, petSpecies: "dog" | "cat" | null): KbWarning[] {
  if (!text || !text.trim() || !entries.length) return [];
  const out: KbWarning[] = [];
  for (const e of entries) {
    // Lọc loài: pet rõ loài → entry loài đó + both; loài không rõ → CHỈ both (không báo láo chéo loài).
    if (petSpecies ? e.species !== "both" && e.species !== petSpecies : e.species !== "both") continue;
    for (const alias of e.aliases) {
      const body = alias.split(/\s+/).map(escapeRegex).join("\\s+");
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "iu");
      if (re.test(text) && !allOccurrencesNegated(re, text)) {
        out.push({
          substance: e.substance_name,
          severity: e.severity,
          species: e.species,
          matched_alias: alias,
          summary: e.summary_vi,
          action: e.action_vi,
        });
        break;
      }
    }
  }
  const rank: Record<KbWarning["severity"], number> = { fatal: 0, severe: 1, caution: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}

/** Entry point cho route: load approved (cache) + match vào brand/product/raw_text. */
export async function getKbWarnings(input: {
  rawText: string | null;
  brand: string | null;
  productLine: string | null;
  petSpecies: "dog" | "cat" | null;
}): Promise<KbWarning[]> {
  const entries = await loadApprovedKb();
  if (!entries.length) return [];
  const text = [input.brand, input.productLine, input.rawText].filter(Boolean).join(" \n ");
  return matchKb(entries, text, input.petSpecies);
}

/** Test-only (harness): reset cache giữa các case. */
export function _resetKbCache(): void {
  cache = null;
}
