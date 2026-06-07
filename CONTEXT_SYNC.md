# CONTEXT SYNC — 2026-06-07 15:17

> Định dạng handoff gọn. **Lịch sử log dài (685 dòng) đã archive ở `CONTEXT_SYNC_FULL_20260606.md`** (từ commit `a9bb6ae`).
> STATE: HEAD `105fa1d` · SW `vowvet-v293-pet-supplements` · repo **LOCAL-ONLY (không remote), 130 commit, CHƯA push**.

## 🎯 ĐANG LÀM GÌ
App-shell hóa VowVet + thương mại hóa trang Dinh dưỡng. Vừa hoàn tất feature **Supplement MonMin (3-phase)**: live-fetch sản phẩm monminpet → match bệnh của pet → hiển thị trên food-brands + pet page. Local-only.

## ✅ ĐÃ XONG PHIÊN NÀY (Supplement MonMin 3-phase — DONE + verified)
- **Backend** (`2227352`): `api/src/lib/monmin-supplements.ts` (MỚI) — live fetch `sitemap-index.xml` → 35 product, parse **ld+json Product** (name/desc/image/price/sku/category), cache **6h**, concurrency cap 6, follow-redirect (301→http trailing-slash), defensive (lỗi+cache cũ→stale; không cache→[]; KHÔNG throw). Match bệnh = keyword `CONDITION_NUTRITION` (tái dùng vocab, KHÔNG taxonomy mới). Route `GET /api/v1/public/monmin-supplements` (`public.ts`, no-auth, thừa kế rate-limit). **KHÔNG bảng Baserow.**
- **Matcher siết** (cùng commit backend): word-boundary (KHÔNG substring rác) · **diacritic-set** (`"thận"` so trên text CÓ DẤU → "an thần"≠thận) · **weak-set** (`tiêu hóa/sensitive/digestive` → nếu match weak-only thì KHÔNG gắn code). Kết quả: kidney 5→4 (rớt calming-bot), gi_ibd 10→0 (chỉ weak), skin giữ nhờ keyword đặc hiệu.
- **Phase 2 food-brands** (`0ab224d`, v292): section "Bổ sung từ MonMin" (Alpine x-for) — match `tier1ActiveCodes` (catalog), 0 match→featured, 4 + "Xem thêm", badge "Hợp với <label>" + ring gold, nút "Xem sản phẩm" target=_blank.
- **Phase 3 pet page** (`105fa1d`, v293): section PREMIUM trong **tab nutrition (lazy x-if)** — panel ivory + viền gold mảnh, **HERO card** (match #1: ảnh to, micro "Hỗ trợ <focus>" từ CONDITION_NUTRITION), grid rest. Match theo `medForm.conditions` **CỦA PET đang xem**. Palette emerald/sky tab giữ nguyên (debt), gold = spotlight tách biệt.

## 🚧 ĐANG DỞ
- KHÔNG có. 3-phase commit + verify đủ (featured + matched + lazy-load + nút/ảnh/xem-thêm). Working tree sạch (chỉ `.claude/launch.json` untracked).

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **Brand shoppable — 2 việc TÁCH BẠCH:**
   - **2 dòng MonMin food** (`row 3` Mon Min Dry Dog · `row 4` Mon Min Wet Cat) trong `food_brands` = **data GIẢ**. MonMin **bán SUPPLEMENT, KHÔNG bán hạt** → KHÔNG có "hạt MonMin thật" để swap → nên **CLEAR/bỏ 2 dòng này khỏi `food_brands`** (feature supplement đã cover MonMin). KHÔNG đi tìm link thật cho 2 dòng này.
   - **12 brand NGOẠI** (Royal Canin / Pedigree / …) = cái cần **điền ảnh + link THẬT** (Shopee/Lazada listing) — **tự host ảnh, ĐỪNG hotlink** — qua CSV + `--apply --write`.
2. **Webview in-app MonMin** (v2): NẾU verify `X-Frame-Options`/CSP `monminpet.com` cho nhúng iframe → mở in-app; ngoài chặn → giữ `target=_blank`.
3. **Mạch 2 — Quét nhãn CAMERA**: getUserMedia + OCR (Gemini vision); route `/scan` / `#smart-scanner`.
4. **Mạch 4 — Nhật ký sản phẩm pet** (sữa tắm/xịt/ăn → cảnh báo kích ứng + truy nguồn) **[đụng schema Baserow → recon + duyệt field TRƯỚC]**.
5. **PDF hồ sơ pet** trích **DATA** (KHÔNG screenshot DOM) — template print `pets/[id]`.
6. **Trang "Định vị pet" (GPS)**: coming-soon → build page thật, đổi `<button>`→`<a>`.
7. **AppHeader chung**: gộp header rời nhiều trang (chờ Bồ chốt scope).
8. **ADOPT EPIC** (roadmap riêng, **recon từ đầu**): transfer ownership + adoption cert PDF + lost&found QR; marketplace/shelter sau.
9. **Dọn nốt**: bcsAvatar/breedSticker + env emoji → FeatureIcon · nudge messages (`api`) · 4 pet migrate `"moderate"` · nước 50 vs 55 · **matcher refine** (gi_ibd hiện rỗng — nới keyword IBD đặc hiệu; thêm code vào diacritic-set nếu phát hiện đồng-tự mới).
10. **Backup**: upload `vowvet-<ts>.bundle` lên cloud (agent không có quyền) · cân nhắc remote private.

## 📌 QUYẾT ĐỊNH KỸ THUẬT ĐÃ CHỐT
- **Supplement = LIVE FETCH monminpet** (sitemap + ld+json per-page), **KHÔNG bảng Baserow**. Cache 6h server-side (`supplementsCache` trong `monmin-supplements.ts`, tách khỏi `nutrition.ts`).
- **Match bệnh: reuse `CONDITION_NUTRITION` keywords** (KHÔNG vocab mới). `matchedConditions[]` precompute ở backend; lọc client theo cờ bệnh pet. food-brands → `tier1ActiveCodes` (catalog); pet page → `medForm.conditions` (con đang xem). 0 match → featured (KHÔNG ẩn).
- **Chỉ siết CÁCH match trong lib** (word-boundary + diacritic-set + weak-set) — KHÔNG đổi vocab gốc `health-conditions.ts`.
- **DER engine `shared/nutrition-engine.ts` = CHÂN LÝ** · loader `api/src/lib/nutrition.ts` ≠ engine. **Supplement KHÔNG tính DER/khẩu phần** (chỉ hiển thị + link + label bệnh).
- **Nút shoppable/supplement = ink fill** (`bg-mmp-ink`/chữ trắng, đạt §9 contrast), **gold = accent** (ring/badge/viền). `target=_blank rel=noopener noreferrer`, dùng `url`/`product_url` theo record.

## ⚠️ LƯU Ý / CẠM BẪY
- **2 dòng MonMin food** (`row 3` Dry Dog · `row 4` Wet Cat) trong `food_brands` = **GIẢ** — MonMin bán supplement KHÔNG bán hạt. ĐỪNG đi tìm hạt MonMin thật để gắn (xem VIỆC TIẾP THEO #1 → nên clear 2 dòng).
- **PowerShell** mở cửa sổ mới luôn về `C:\Users\Admin` → phải `cd C:\docker\vowvet` **TRƯỚC** khi `git`. Path có ngoặc vuông (`pets/[id].astro`) phải **QUOTE** trong PowerShell.
- **Sửa api/lib → `docker restart vowvet-api`** (busts cache + nạp code). `.astro` → `docker restart vowvet-web`. `.env` → `--force-recreate`. `sw.js` phải **bump vXXX**.
- **Tab nutrition pet page = LAZY** (`x-if="activeTab==='nutrition'"`) → verify section supplement phải **SAU khi mở tab**, không lúc load.
- **Sync brand shoppable chạy HOST**: `BASEROW_URL=http://localhost:8888 bun run scripts/brand-shoppable-sync.ts [--apply [--write]]` (host không có host.docker.internal; Bun tự nạp .env).
- **Preview**: screenshot subsystem timeout trên page nặng → verify bằng **computed-style/DOM eval**. Inject Alpine state qua `preview_eval` = ephemeral. Preview CÓ internet (ảnh monminpet load thật). "Xem thêm" supplement dùng x-show/getter (KHÔNG x-transition) → không kẹt rAF.
- **monminpet**: 35 product · ld+json Product per-page (`sitemap-index`→`sitemap-0`) · ảnh `/images/products/<slug>.png` (đã xác nhận). Product page **301→http trailing-slash** → phải follow-redirect.
- Account test: pet **min id 12** (user 10) Mèo, no health_conditions → supplement = **featured**; `lyvu2004DTP@gmail.com` user 18 (Google) — `/dev/reset-onboarding` reset vô hạn.
- **Bundle `*.bundle` đã gitignore** — backup rời, USER tự upload cloud.
- **CẤM ĐỤNG** (trừ khi TASK ghi rõ): số/gram/kcal/DER · `shared/nutrition-engine.ts` · vocab `health-conditions.ts` (chỉ siết cách match) · schema/field Baserow · palette emerald/sky tab nutrition (debt).

## 📂 FILE QUAN TRỌNG ĐÃ ĐỤNG
- `api/src/lib/monmin-supplements.ts` — live fetch + parse ld+json + cache 6h + match bệnh (MỚI, matcher siết).
- `api/src/routes/public.ts` — +route `/monmin-supplements` (no-auth).
- `web/src/pages/food-brands.astro` — section "Bổ sung từ MonMin" (Phase 2, Alpine x-for).
- `web/src/pages/pets/[id].astro` — section PREMIUM tab nutrition (Phase 3, hero match).
- `shared/health-conditions.ts` — vocab bệnh + `CONDITION_NUTRITION` keywords (CẤM sửa vocab).
- `scripts/brand-shoppable-sync.ts` — CSV↔Baserow brand image/url (row 3+4 = TEST/GIẢ, nên clear).
- `web/public/sw.js` — `VERSION = vowvet-v293-pet-supplements`.
- `CONTEXT_SYNC_FULL_20260606.md` — archive log dài (685 dòng).
