/**
 * Cities supported bởi VowVet Climate Sentinel.
 *
 * Expanded từ 4 → 30+ tỉnh/thành phố Việt Nam để user mọi miền dùng được.
 * Lat/lon coords từ OpenStreetMap. Climate type là proxy đơn giản cho UI hint —
 * weather lib thực tế dùng lat/lon để query OpenWeather/AQI live.
 *
 * Backwards-compat: 4 slug gốc (ho_chi_minh, da_lat, ha_noi, da_nang) giữ nguyên
 * để user data cũ không bị break.
 */

export type Region = "north" | "central" | "south";

export type CitySlug =
  // ─── Miền Bắc ────────────────────────────────────────
  | "ha_noi"
  | "hai_phong"
  | "ha_long"        // Quảng Ninh
  | "sapa"           // Lào Cai
  | "lang_son"
  | "thai_nguyen"
  | "bac_ninh"
  | "nam_dinh"
  | "thanh_hoa"
  | "ninh_binh"
  // ─── Miền Trung ──────────────────────────────────────
  | "vinh"           // Nghệ An
  | "hue"            // Thừa Thiên Huế
  | "da_nang"
  | "hoi_an"         // Quảng Nam
  | "quang_ngai"
  | "quy_nhon"       // Bình Định
  | "tuy_hoa"        // Phú Yên
  | "nha_trang"      // Khánh Hòa
  | "phan_thiet"     // Bình Thuận
  | "da_lat"         // Lâm Đồng
  | "buon_ma_thuot"  // Đắk Lắk
  | "pleiku"         // Gia Lai
  // ─── Miền Nam ────────────────────────────────────────
  | "ho_chi_minh"
  | "bien_hoa"       // Đồng Nai
  | "thu_dau_mot"    // Bình Dương
  | "vung_tau"       // Bà Rịa - Vũng Tàu
  | "my_tho"         // Tiền Giang
  | "can_tho"
  | "long_xuyen"     // An Giang
  | "rach_gia"       // Kiên Giang
  | "ca_mau"
  | "phu_quoc";      // Kiên Giang island

export interface CityInfo {
  slug: CitySlug;
  name_vn: string;
  /** Tỉnh/TP cấp 1 — hiển thị phụ khi tên thành phố trùng tên tỉnh */
  province_vn?: string;
  region: Region;
  lat: number;
  lon: number;
  timezone: string;
  /** Khí hậu typical cho UI hint: hot|cold|temperate */
  climate_type: "hot" | "cold" | "temperate";
}

export const CITIES: Record<CitySlug, CityInfo> = {
  // ─── Miền Bắc ────────────────────────────────────────
  ha_noi:       { slug: "ha_noi",       name_vn: "Hà Nội",        region: "north",   lat: 21.028, lon: 105.854, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  hai_phong:    { slug: "hai_phong",    name_vn: "Hải Phòng",     region: "north",   lat: 20.844, lon: 106.688, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  ha_long:      { slug: "ha_long",      name_vn: "Hạ Long",       province_vn: "Quảng Ninh", region: "north", lat: 20.953, lon: 107.080, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  sapa:         { slug: "sapa",         name_vn: "Sa Pa",         province_vn: "Lào Cai",    region: "north", lat: 22.336, lon: 103.844, timezone: "Asia/Ho_Chi_Minh", climate_type: "cold" },
  lang_son:     { slug: "lang_son",     name_vn: "Lạng Sơn",      region: "north",   lat: 21.851, lon: 106.762, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  thai_nguyen:  { slug: "thai_nguyen",  name_vn: "Thái Nguyên",   region: "north",   lat: 21.594, lon: 105.848, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  bac_ninh:     { slug: "bac_ninh",     name_vn: "Bắc Ninh",      region: "north",   lat: 21.186, lon: 106.076, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  nam_dinh:     { slug: "nam_dinh",     name_vn: "Nam Định",      region: "north",   lat: 20.420, lon: 106.168, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  thanh_hoa:    { slug: "thanh_hoa",    name_vn: "Thanh Hóa",     region: "north",   lat: 19.808, lon: 105.776, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  ninh_binh:    { slug: "ninh_binh",    name_vn: "Ninh Bình",     region: "north",   lat: 20.255, lon: 105.975, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },

  // ─── Miền Trung ──────────────────────────────────────
  vinh:          { slug: "vinh",          name_vn: "Vinh",          province_vn: "Nghệ An",         region: "central", lat: 18.679, lon: 105.681, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  hue:           { slug: "hue",           name_vn: "Huế",           province_vn: "Thừa Thiên Huế",  region: "central", lat: 16.464, lon: 107.595, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  da_nang:       { slug: "da_nang",       name_vn: "Đà Nẵng",       region: "central", lat: 16.054, lon: 108.202, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  hoi_an:        { slug: "hoi_an",        name_vn: "Hội An",        province_vn: "Quảng Nam",       region: "central", lat: 15.880, lon: 108.338, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  quang_ngai:    { slug: "quang_ngai",    name_vn: "Quảng Ngãi",    region: "central", lat: 15.120, lon: 108.792, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  quy_nhon:      { slug: "quy_nhon",      name_vn: "Quy Nhơn",      province_vn: "Bình Định",       region: "central", lat: 13.782, lon: 109.220, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  tuy_hoa:       { slug: "tuy_hoa",       name_vn: "Tuy Hòa",       province_vn: "Phú Yên",         region: "central", lat: 13.082, lon: 109.295, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  nha_trang:     { slug: "nha_trang",     name_vn: "Nha Trang",     province_vn: "Khánh Hòa",       region: "central", lat: 12.250, lon: 109.190, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  phan_thiet:    { slug: "phan_thiet",    name_vn: "Phan Thiết",    province_vn: "Bình Thuận",      region: "central", lat: 10.928, lon: 108.103, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  da_lat:        { slug: "da_lat",        name_vn: "Đà Lạt",        province_vn: "Lâm Đồng",        region: "central", lat: 11.940, lon: 108.458, timezone: "Asia/Ho_Chi_Minh", climate_type: "cold" },
  buon_ma_thuot: { slug: "buon_ma_thuot", name_vn: "Buôn Ma Thuột", province_vn: "Đắk Lắk",         region: "central", lat: 12.667, lon: 108.038, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },
  pleiku:        { slug: "pleiku",        name_vn: "Pleiku",        province_vn: "Gia Lai",         region: "central", lat: 13.984, lon: 108.001, timezone: "Asia/Ho_Chi_Minh", climate_type: "temperate" },

  // ─── Miền Nam ────────────────────────────────────────
  ho_chi_minh:   { slug: "ho_chi_minh",   name_vn: "Hồ Chí Minh",   region: "south", lat: 10.762, lon: 106.660, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  bien_hoa:      { slug: "bien_hoa",      name_vn: "Biên Hòa",      province_vn: "Đồng Nai",        region: "south", lat: 10.945, lon: 106.824, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  thu_dau_mot:   { slug: "thu_dau_mot",   name_vn: "Thủ Dầu Một",   province_vn: "Bình Dương",      region: "south", lat: 10.980, lon: 106.652, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  vung_tau:      { slug: "vung_tau",      name_vn: "Vũng Tàu",      province_vn: "Bà Rịa - Vũng Tàu", region: "south", lat: 10.346, lon: 107.084, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  my_tho:        { slug: "my_tho",        name_vn: "Mỹ Tho",        province_vn: "Tiền Giang",      region: "south", lat: 10.360, lon: 106.355, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  can_tho:       { slug: "can_tho",       name_vn: "Cần Thơ",       region: "south", lat: 10.045, lon: 105.747, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  long_xuyen:    { slug: "long_xuyen",    name_vn: "Long Xuyên",    province_vn: "An Giang",        region: "south", lat: 10.386, lon: 105.435, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  rach_gia:      { slug: "rach_gia",      name_vn: "Rạch Giá",      province_vn: "Kiên Giang",      region: "south", lat: 10.012, lon: 105.080, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  ca_mau:        { slug: "ca_mau",        name_vn: "Cà Mau",        region: "south", lat: 9.176,  lon: 105.150, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
  phu_quoc:      { slug: "phu_quoc",      name_vn: "Phú Quốc",      province_vn: "Kiên Giang",      region: "south", lat: 10.222, lon: 103.961, timezone: "Asia/Ho_Chi_Minh", climate_type: "hot" },
};

export const CITY_SLUGS: CitySlug[] = Object.keys(CITIES) as CitySlug[];

export const REGION_LABEL_VN: Record<Region, string> = {
  north:   "Miền Bắc",
  central: "Miền Trung",
  south:   "Miền Nam",
};

/** Order regions north → central → south for consistent UI display. */
export const REGION_ORDER: Region[] = ["north", "central", "south"];

/** Pre-grouped lookup for dropdown rendering. Cities within a region are sorted by name. */
export const CITIES_BY_REGION: Record<Region, CityInfo[]> = REGION_ORDER.reduce(
  (acc, region) => {
    acc[region] = Object.values(CITIES)
      .filter((c) => c.region === region)
      .sort((a, b) => a.name_vn.localeCompare(b.name_vn, "vi"));
    return acc;
  },
  { north: [], central: [], south: [] } as Record<Region, CityInfo[]>
);

export function isValidCitySlug(s: string): s is CitySlug {
  return CITY_SLUGS.includes(s as CitySlug);
}

export function getCity(slug: string): CityInfo | null {
  return isValidCitySlug(slug) ? CITIES[slug] : null;
}

/** Display label combining city + province when they differ. */
export function getCityDisplayLabel(slug: string): string {
  const c = getCity(slug);
  if (!c) return slug;
  return c.province_vn && c.province_vn !== c.name_vn
    ? `${c.name_vn} · ${c.province_vn}`
    : c.name_vn;
}

export const DEFAULT_CITY: CitySlug = "ho_chi_minh";
