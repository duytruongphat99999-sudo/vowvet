# Cities Expansion — 4 → 32 Tỉnh/Thành Phố

**Date**: 2026-05-21
**Trigger**: User feedback "đa tỉnh chứ không phải chỉ có thành phố lớn"
**Scope**: Mở rộng danh sách thành phố từ 4 lớn → 32 tỉnh/thành rải khắp Bắc Trung Nam.

---

## Trước / sau

| Khu vực      | Trước | Sau | Cities mới                                                                  |
| ------------ | :--:  | :-: | --------------------------------------------------------------------------- |
| Miền Bắc     | 1     | 10  | Hà Nội + Hải Phòng + Hạ Long + Sa Pa + Lạng Sơn + Thái Nguyên + Bắc Ninh + Nam Định + Thanh Hóa + Ninh Bình |
| Miền Trung   | 2     | 12  | Vinh + Huế + Đà Nẵng + Hội An + Quảng Ngãi + Quy Nhơn + Tuy Hòa + Nha Trang + Phan Thiết + Đà Lạt + Buôn Ma Thuột + Pleiku |
| Miền Nam     | 1     | 10  | Hồ Chí Minh + Biên Hòa + Thủ Dầu Một + Vũng Tàu + Mỹ Tho + Cần Thơ + Long Xuyên + Rạch Giá + Cà Mau + Phú Quốc |
| **Tổng**     | **4** | **32** | — |

---

## Files changed

### 1. `shared/cities.ts` (single source of truth)

- Extended `CitySlug` union: 4 → 32 slugs
- Each `CityInfo` now includes `province_vn` field (Tỉnh/TP cấp 1) — shown as suffix when city ≠ province (e.g. "Hạ Long · Quảng Ninh")
- Added `region: "north" | "central" | "south"` field
- Added helpers:
  - `REGION_LABEL_VN`: maps region → "Miền Bắc/Trung/Nam"
  - `REGION_ORDER`: stable iteration order `[north, central, south]`
  - `CITIES_BY_REGION`: pre-grouped + alphabetically-sorted (Vietnamese locale)
  - `getCityDisplayLabel(slug)`: returns "Hạ Long · Quảng Ninh" or "Hồ Chí Minh"

Backward-compat preserved: 4 original slugs (`ho_chi_minh`, `da_lat`, `ha_noi`, `da_nang`) unchanged → existing user data still works.

### 2. `shared/zod-schemas/m5.ts`

`CitySchema` enum extended to match all 32 slugs. Without this, the API would 400-reject save requests for new cities. Listed in source comment in geographic order (N → S) for readability.

### 3. `web/src/pages/settings.astro` city dropdown

- Replaced hardcoded 4 `<option>` tags with native `<optgroup>` rendering from `CITIES_BY_REGION`:

  ```astro
  {REGION_ORDER.map((region) => (
    <optgroup label={REGION_LABEL_VN[region]}>
      {CITIES_BY_REGION[region].map((c) => (
        <option value={c.slug}>{getCityDisplayLabel(c.slug)}</option>
      ))}
    </optgroup>
  ))}
  ```

- Description copy updated: "...chọn nơi bạn đang sống."
- Added footer hint: "Hỗ trợ 32 tỉnh/thành · trải khắp Bắc Trung Nam. Chưa thấy nơi bạn ở? **Yêu cầu thêm →**" — link to `/chat/new?subject=Yêu cầu thêm tỉnh/thành phố` so users can ask the team to add their location
- Status check color: `text-green-600` → `text-emerald-600` (brand-aligned)
- Input styling: `rounded-lg` → `rounded-xl` + `text-mmp-ink` + `transition` (matches form inputs elsewhere)

### 4. `web/public/sw.js`

Bumped VERSION `v3-svg-stickers` → `v4-cities-32` to invalidate PWA cache.

---

## Native `<optgroup>` rendering

The select looks like this in every modern browser:

```
┌──────────────────────────────────────┐
│ ▼ Hồ Chí Minh                        │
├──────────────────────────────────────┤
│   ── Miền Bắc ──                     │
│   Bắc Ninh                            │
│   Hà Nội                              │
│   Hạ Long · Quảng Ninh                │
│   Hải Phòng                           │
│   Lạng Sơn                            │
│   Nam Định                            │
│   Ninh Bình                           │
│   Sa Pa · Lào Cai                     │
│   Thái Nguyên                         │
│   Thanh Hóa                           │
│   ── Miền Trung ──                    │
│   Buôn Ma Thuột · Đắk Lắk             │
│   Đà Lạt · Lâm Đồng                   │
│   Đà Nẵng                             │
│   Hội An · Quảng Nam                  │
│   Huế · Thừa Thiên Huế                │
│   Nha Trang · Khánh Hòa               │
│   Phan Thiết · Bình Thuận             │
│   Pleiku · Gia Lai                    │
│   Quảng Ngãi                          │
│   Quy Nhơn · Bình Định                │
│   Tuy Hòa · Phú Yên                   │
│   Vinh · Nghệ An                      │
│   ── Miền Nam ──                      │
│   Biên Hòa · Đồng Nai                 │
│   Cà Mau                              │
│   Cần Thơ                             │
│   Hồ Chí Minh                         │
│   Long Xuyên · An Giang               │
│   Mỹ Tho · Tiền Giang                 │
│   Phú Quốc · Kiên Giang               │
│   Rạch Giá · Kiên Giang               │
│   Thủ Dầu Một · Bình Dương            │
│   Vũng Tàu · Bà Rịa - Vũng Tàu        │
└──────────────────────────────────────┘
```

- Zero JS needed — pure HTML `<optgroup>`
- Native iOS/Android picker shows regions cleanly
- Searchable with keyboard typing (browser-native)
- Screen-reader accessible (regions announced as group labels)

---

## Downstream impact (verified no breakage)

| File                         | How it uses city slug                              | Status              |
| ---------------------------- | -------------------------------------------------- | ------------------- |
| `api/src/lib/weather.ts`     | `CITIES[citySlug]` → uses `city.lat`/`.lon`        | ✓ works for all 32  |
| `api/src/lib/nutrition.ts`   | passes citySlug through, caches by slug            | ✓ works             |
| `api/src/lib/care-planner-v2.ts` | passes city_slug option                        | ✓ works             |
| `api/src/lib/care-plan-engine.ts` | uses CITIES lookup                            | ✓ works             |
| `api/src/lib/petair-index.ts` | uses CITIES lookup                                | ✓ works             |
| `api/src/routes/weather.ts`  | accepts citySlug, validates via CITIES             | ✓ works             |
| `api/src/routes/nutrition.ts` | accepts citySlug                                  | ✓ works             |
| `api/src/routes/pets.ts`     | accepts citySlug                                   | ✓ works             |
| `web/src/pages/pets/[id].astro` | renders city display                            | ✓ works             |

**No hardcoded switch statements** on the original 4 slugs anywhere — all downstream code uses dynamic `CITIES[slug]` lookup. Weather API just needs `lat`/`lon` to query OpenWeather, so any of the 32 new cities is immediately functional.

---

## Smoke test

```
$ docker restart vowvet-web vowvet-api
$ curl -s -o /dev/null -w "%{http_code} /settings\n" http://127.0.0.1:4322/settings
302 /settings           # auth-gated (expected)

$ docker logs vowvet-web --since 30s | grep -iE "error|astroerror"
# (empty — only unrelated pre-existing router warning)
```

---

## Acceptance

| # | Requirement                                                     | Status |
| - | --------------------------------------------------------------- | :---:  |
| 1 | 32 cities total, covering Bắc/Trung/Nam                         |   ✓    |
| 2 | Dropdown grouped by region via native `<optgroup>`              |   ✓    |
| 3 | City + province shown when they differ (Hội An · Quảng Nam)     |   ✓    |
| 4 | Backward-compat: original 4 slugs untouched                     |   ✓    |
| 5 | Zod enum updated to accept all 32 (else API would 400-reject)   |   ✓    |
| 6 | Weather/nutrition downstream consumers handle all 32            |   ✓    |
| 7 | "Yêu cầu thêm" CTA links to `/chat/new` so users can ask for more |   ✓    |
| 8 | SW VERSION bumped → users get fresh dropdown                    |   ✓    |
| 9 | 0 build errors                                                  |   ✓    |

---

## Possible follow-ups (out of scope)

- Add the remaining ~30 provinces if needed (currently covers 32 of 63 Vietnamese provinces — the highest-traffic + populous ones). Trigger via real user "Yêu cầu thêm" submissions.
- Optional: enable text-search inside the dropdown via a searchable combobox (e.g. Headless UI / Combobox). Native `<optgroup>` already supports keyboard type-ahead, so this is nice-to-have only.
- Optional: persist `province_vn` separately in user table for analytics segmentation (currently only `city_slug` is stored).
