/**
 * UTM helper — gắn tracking params vào link out tới hệ sinh thái MonMin (supplement CTAs).
 *
 * Dùng ở SSR (frontmatter .astro): map `url` TRƯỚC khi JSON.stringify sang Alpine,
 * nên các getter inline (JS thuần, không import được TS) vẫn nhận url đã có UTM.
 *
 * An toàn:
 *  - Né bug ?-vs-&: tự dò query sẵn có để chọn separator.
 *  - Idempotent: url đã có utm_source → trả nguyên (không gắn trùng).
 *  - Giữ fragment (#...) phía sau UTM.
 *  - url rỗng/không phải string → trả "" (không vỡ trang).
 */
export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

const DEFAULT_SOURCE = "vowvet";
const DEFAULT_MEDIUM = "supplement";

export function withUtm(url: string | null | undefined, params: UtmParams = {}): string {
  if (!url || typeof url !== "string") return "";
  // Đã gắn UTM rồi → idempotent, trả nguyên.
  if (/[?&]utm_source=/.test(url)) return url;

  const fields: Record<string, string> = {
    utm_source: params.source ?? DEFAULT_SOURCE,
    utm_medium: params.medium ?? DEFAULT_MEDIUM,
  };
  if (params.campaign) fields.utm_campaign = params.campaign;
  if (params.content) fields.utm_content = params.content;

  // Tách fragment để UTM nằm trước #.
  const hashIdx = url.indexOf("#");
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : "";

  const qs = Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const sep = base.includes("?") ? "&" : "?";

  return `${base}${sep}${qs}${hash}`;
}
