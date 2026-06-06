# CONTEXT_SYNC — VowVet / Mon Min Pet

> 🆕 **cập nhật 2026-06-06 (MỚI NHẤT):** **Audit DER + Lớp 2 (vòng phản hồi cân)** — engine A về **AAHA/WSAVA** (sedentary default, bỏ phạt senior/geri, +`ageingNote`; RER giữ) · **1 NGUỒN DER** (food-brands pet-locked + pet page qua endpoint) · pet page **Mức nền/Hôm nay** + gram cân-đong nền · data-fix **min activity→sedentary** · **Lớp 2**: bịt rò ghi-cân (PATCH hồ sơ cũng ghi `weight_logs`+bust cache), nhắc cân (lần đầu/>30d/trend, reuse `recommendations`), **đề xuất khẩu phần** (hạ vận động / giảm ~10% / set target) **+ apply guard** (người bấm+xác nhận mới PATCH, báo theo ground-truth), mở whitelist PATCH `target_weight_kg`. **SW = `vowvet-v281-target-patch-honest-apply`** · HEAD `175d37f` · **+8 commit local CHƯA push**. Xem **SESSION 2026-06-06** ngay dưới.
> 🆕 **cập nhật 2026-06-03:** Onboarding guard · Certificate "Hồ sơ Trọn đời" (pastel/hoa lá/2 chữ ký/5 mục/con dấu) · Wizard tạo bé · **Tối ưu loading** (cache per-user + parallelize → dashboard 6.2s→1.5s, /pets/[id] 6.5s→1.6s) · **Skeleton** chuyển trang · Fix **quest trùng** (race) · **Nhãn AI trung tính** (giấu Gemini). **SW = `vowvet-v276-cache-parallel-skeleton`** · HEAD `e4c8bd1` · ~79 commit local CHƯA push. Xem **SESSION 2026-06-03** ngay dưới.
> Snapshot kỹ thuật — cập nhật **2026-06-01**: 🛡️ **Admin duyệt place** (Phase 1 backend `a79b84b` + Phase 3 UI `8b5875f` → `/admin/places`) · 📅 diary year-range động [2026–2029] · 🎨 brand-sync **/playdate/setup** + **/share** (iconify emoji→FeatureIcon + sky/amber→ink/cream + thêm icon `download`) · 🔧 severityDot pain/mobility = cognitive (superset) · 🗺️ nhóm C playdate **ĐÃ QUYẾT giữ emoji** · 💾 git bundle backup · 🕯️🎂🚨 **brand-sync 3 trang cảm xúc** (memorial nến-động · birthday · lost — GIỮ palette+emoji thematic) · 🎂 **cụm BIRTHDAY hoàn tất** (chính + wall tông-ấm + party-nav-fix→`/birthday` + **bánh kem nến-động** v255 + confetti reduced-motion guard) · ⭐ **Achievements WOW** (`273f558`, v257 — entrance shimmer/ring/count-up/stagger + unlock glow/burst, reduced-motion safe) · 🔍 **recon /food-brands** (công thức RER/DER + data layer — chuẩn bị audit dinh dưỡng, CHƯA code). **SW hiện tại = `vowvet-v257-achievements-wow`** · **70 commit local, CHƯA push** (không remote). 〈Chi tiết: xem snapshot **2026-06-01** ngay dưới.〉 *Buổi trước — 2026-05-31 (buổi 3):* 🎨 Arc icon 8 màn (Check-in/Climate · BCS · Nutrition · mobility · pain · cognitive · water · bills) · 🐛 fix bug ẩn `as number[]` trong `<script is:inline>` bills · 💰 bills brand-color (xanh→gold/ink) · 🗺️ **Map-Lai + brand-sync /map DONE ALL** (OSM suggest/promote + hết emoji/hex lạc, icon màu-loại) · 📔 **diary DONE ALL** (mood→face icon + UI emoji→icon + màu yearbook gold/cream; `10e15bc` + fix mic/màu `22dcc70`). *Buổi 2 (2026-05-30): WOW v197-205 · TopBar v206-207 · Dashboard v208-210.* **SW hiện tại = `vowvet-v242-diary-yearbook-gold`** · ~51 commit local, chưa push.
> Nền tảng: Pet Score Phase 1→8 + **WOW arc v197-205** (pet-score) + **TopBar v206-207** (nav dùng chung + khai tử quick-nav floating) + **Dashboard WOW v208** (score ring fill + hero polish).
> Đọc TRƯỚC khi đụng pet-score.astro / dashboard. Xem **🌌 WOW ARC v197-205** · **🧭 TOPBAR + DASHBOARD WOW v206-210** · **🔒 SECURITY** · **🛠️ BÀI HỌC HẠ TẦNG** · **🚨 TOMORROW QUEUE**.

---

## 🆕 SESSION MỚI NHẤT (2026-06-06) — Audit DER + Lớp 2 (vòng phản hồi cân)

> Arc: setup → recon nutrition (3 nguồn DER lệch) → engine A AAHA/WSAVA → hợp nhất nguồn → pet page base/today split + data-fix min → **Lớp 2**: bịt rò ghi-cân + nhắc cân + đề xuất khẩu phần + apply guard + mở whitelist `target_weight_kg`. *(APPEND — KHÔNG ghi đè.)*

### 📊 STATE
- HEAD `175d37f` · **SW `vowvet-v281-target-patch-honest-apply`** · **+8 commit local CHƯA push** (a8e61b7→175d37f).
- `.claude/launch.json` untracked (preview config, không commit). `CONTEXT_SYNC.md` commit ở mốc save này.

### ✅ ĐÃ XONG (8 commit)
1. `a8e61b7` setup: tạo `vowvet/CLAUDE.md` + lệnh `/context-save` (`.claude/commands/context-save.md`) + allowlist `.claude/settings.local.json` (**gitignored**, local-only).
2. `94390e7` docs: sửa path nutrition SAI trong CLAUDE.md (KHÔNG có `web/src/lib/nutrition.ts`; thật = `shared/nutrition-engine.ts` + `api/src/lib|routes/nutrition.ts` + DER client `food-brands.astro`) + ghi **ENGINE là chân lý DER**.
3. `43e4b7e` **Cluster-1** fix engine A (`shared/nutrition-engine.ts`) chuẩn **AAHA/WSAVA**: default activity `moderate`→**`sedentary`** (1.6→1.2 khi null), bỏ phạt **senior 0.9→1.0 / geriatric 0.85→1.0**, thêm field **`ageingNote`** (senior/geri). **RER & generateMealPlan KHÔNG đổi**.
4. `b59fc60` **Cluster-2 p1** food-brands: pet **đã chọn (locked)** dùng **engineDer** qua endpoint `calorie-target`; **manual mode** giữ `derClient` (BCS-only) + nhãn *"ước tính nhanh"*. Getter `displayDer` hợp nhất. (v277)
5. `b1ab7b0` **Bước 3 đóng** pet page `[id].astro`: tách **Mức nền `der_raw` / Hôm nay `der_final`** + gram/treat **cân-đong theo nền** (×`der_raw/der_final` ở UI, KHÔNG lặp công thức/đụng engine) + dòng chênh thời tiết (chữ) + gợi ý nước (icon droplet) + nhãn *"Điểm khởi đầu…"*. **Data-fix: min (pet 12) `activity_level` moderate→sedentary** (PATCH API). (v278)
6. `aafc93b` docs(context): save Bước 3 + Lớp 2 recon (CONTEXT_SYNC) → bundle off-machine `vowvet-20260606-1547.bundle`.
7. `d29d161` **Lớp 2 p1**: bịt rò ghi-cân — `saveEdit` đổi cân qua hồ sơ giờ cũng POST `weight-log` (ghi `weight_logs` + sync + bust cache, dùng `logWeight`) + **banner nhắc cân** (lần đầu / >30 ngày, client từ `insights.recent_logs`). (v279)
8. `175d37f` **Lớp 2 đóng**: nhắc theo trend (reuse `recommendations[].message`) + **đề xuất khẩu phần** (concern → hạ vận động *qualitative* / giảm ~10% / **set target** input default=cân hiện tại) + **nút Áp dụng + hộp xác nhận** (GUARD: chỉ PATCH sau bấm; báo thành công **CHỈ** khi ground-truth persist) + mở whitelist PATCH `target_weight_kg` (`api/src/routes/pets.ts` +2 dòng — field Baserow ĐÃ có, KHÔNG schema-change). (v281)

### 🔢 SỐ THẬT min (sau fix, verify DOM)
- der_raw **260** (Mức nền) / der_final **234** (Hôm nay = ×0.9 weather HCMC) · activity=sedentary · BCS=null.
- ⚠️ task kỳ vọng 259 → thực **260** = rounding (engine nhân **RER chưa làm tròn** 216.28×1.2=259.5→260). Không phải lỗi.

### 🧬 KIẾN TRÚC DER (chân lý — đọc trước khi đụng số)
- **ENGINE `shared/nutrition-engine.ts` = CANONICAL.** `RER=70×kg^0.75` → `der_raw` (×activity×lifeStage×repro, **CHƯA weather/bcs**) → ×weather_adjust → ×bcs_adjust = `der_final`. **6 hệ số + der_raw + der_final đều là field breakdown** → tách lớp bằng field có sẵn.
- "Nền" = `der_raw`. ⚠️ Puppy/junior: `base_multiplier` = override tăng trưởng (3.0/2.0), lifeStage/repro ép =1.0 → "nền bỏ vận động" vô nghĩa cho puppy.
- gram/treat (generateMealPlan) bám **der_final** → dao động theo thời tiết. **Nước = `weight×50`** (engine), ngoài DER.

### ⚠️ GOTCHA phiên này
- **MSYS path conv**: `docker exec ... /app` bị git-bash đổi thành path Windows → dùng `MSYS_NO_PATHCONV=1` (và `MSYS2_ARG_CONV_EXCL='*'`).
- **Mint session để verify trang login**: `signSession({sub,phone,is_onboarded})` (`shared/jwt.ts`, env `JWT_SECRET`) → cookie **`vowvet_session`** (`shared/auth.ts`); inject preview `document.cookie` trên origin rồi navigate (SSR forward cookie). Pet/user test: min id 12, user 10.
- **Secret-scan**: grep từ "cookie/token/secret" KHỚP văn bản doc (false-positive) → quét theo **giá trị** (`sk-`/`AIza`/`eyJ`/`key=val`).
- **`daily_calorie_target`**: chỉ `migrate-m7` ghi (skip-if-set), **KHÔNG runtime refresh** → đông cứng/stale; AI care-plan (`care-plan-engine.ts:240`) đọc nó (≈der_raw stale).
- **food-brands** `isProfileLocked = selectedPetId!==null`; manual mode (slider BCS/weight) what-if = `derClient` BCS-only.
- **Phân biệt user-set vs migrate-set "moderate": KHÔNG được** (không field nguồn, migrate không để dấu vết). Chỉ suy gián tiếp: `daily_calorie_target=null` ⇒ không migrate (vd min). 5 pet "moderate" / 7 null trong 12 pet.

### 🎯 VIỆC ĐANG DỞ (Bồ giao tiếp)
1. ⭐ **4 pet migrate "moderate"** (Beo id3 · Mon id5 · Mon id6 · Pugy id7) — chưa data-fix. Cụm DATA. Cảnh báo: không tách được user-chọn vs migrate-nhét → fix blunt (coi như chưa khai / re-prompt).
2. ⭐ **gram_nền nên GIỮ BCS, chỉ bỏ weather**: hiện `×der_raw/der_final` bỏ **cả weather+bcs** → pet BCS≠5 (béo/gầy) gram về maintenance, **mất target giảm/tăng cân**. Cần der "no-weather-CÓ-bcs" = `der_final / weather_adjust` (tính ở UI từ field có sẵn) thay vì der_raw. min BCS=null nên hiện chưa lộ.
3. **care-plan-engine dùng engine LIVE** thay field `daily_calorie_target` đông cứng (đụng `api/`, cụm riêng).
4. **Bundle manual food-brands**: `derClient` BCS-only → import/gọi engine thật (reactive client, không cần lưu).
5. **Nước 50 vs 55**: engine `weight×50` (pet page) vs `care-plan.astro:519` `weight×55 min50` vs field `daily_water_ml` lưu → thống nhất 1 nguồn.
6. **Nhắc CHỦ ĐỘNG** (cron/push) khi lâu chưa cân / trend xấu — Lớp 2 hiện chỉ nhắc khi mở trang (in-app). Job mới kiểu M5/M6.

> ✅ **Lớp 2 (vòng phản hồi cân) ĐÃ ĐÓNG**: log cân (table) · nhập cân ghi history+sync+bust (cả đường hồ sơ) · nhắc cân lần đầu/lâu/trend · đề xuất khẩu phần (hạ vận động/giảm%/set target) · apply guard người-bấm + báo theo ground-truth. (items trên = mở rộng tương lai, KHÔNG block.)

### 💾 BACKUP
- Bundle off-machine gần nhất `vowvet-20260606-1547.bundle` = **TRƯỚC** `175d37f` (chỉ tới `aafc93b`). **Mốc save này tạo bundle mới** qua `175d37f` (+ commit CONTEXT_SYNC) — xem báo cáo cho tên file. Nhớ kéo cloud thủ công.

---

## SESSION 2026-06-03 — Onboarding · Certificate · Tối ưu loading · Skeleton

> ⚠️ **Đính chính khung "SEO/Schema":** Đây là **VowVet / Mon Min Pet — nền tảng chăm thú cưng** (Astro SSR + Bun + Hono + Baserow + R2 + Gemini), **KHÔNG phải dự án SEO/Schema**. Phiên này KHÔNG đụng SEO/Schema. SEO hiện trạng vẫn = **meta/OG cơ bản** ở `Layout.astro`, **CHƯA có Schema.org JSON-LD**. Arc thật phiên này = *onboarding guard → certificate cam kết → wizard tạo bé → tối ưu loading (cache+parallelize) → fix quest trùng → nhãn AI trung tính → skeleton*. *(APPEND — KHÔNG ghi đè, giữ ngữ cảnh ~79 commit.)*

### 1️⃣ TRẠNG THÁI HIỆN TẠI — đã xong (9 commit v269→v276, local, CHƯA push)

| HEAD | SW | Nội dung |
|---|---|---|
| `673a5bc`→`b9f067b` | v269 | **Onboarding guard**: chưa có pet → màn "Thêm bé đầu tiên" → /pets/new; nút **Reset test dev-only** |
| `71c2548` | v270 | Certificate **làm mềm** (pastel rose/peach + hoa lá 4 góc) + **up ảnh pet** (R2) + lời chào mềm |
| `06900bd` | v271 | **2 chữ ký việt hoá** (Dancing Script) + **5 điều khoản** + ghi **Kỷ niệm** (pet_photos) khi cam kết |
| `0b59d9f` | v272 | Fix **5 icon rỗng** (width/height vào SVG + nền badge trắng) + emoji→line-art + ẩn số hiệu rỗng |
| `1207657` | v273 | Icon loài (🐶🐱→line-art) + **field bắt buộc** (tên/loài/cân/giới tính) + delay mộc 3s + bỏ SSR /auth/me |
| `65793d8` | v274 | Song song /auth/me + **tab scroll-hint** (fade gradient) + rà nhãn AI |
| `f1bad97` | v275 | **Cache /auth/me** (TTL 12s + invalidate) + **fix quest trùng** (lock+dedup) + nhãn AI trung tính |
| `e4c8bd1` | v276 | **Cache per-endpoint + parallelize /pets/[id]** + **skeleton chuyển trang** |

**File chính đã đụng:**
- `web/src/middleware.ts` — guard: chưa onboarded (`pets.length===0`) → `/onboarding`; `/pets/new` ∈ `ALLOW_NOT_ONBOARDED_EXACT`.
- `web/src/pages/onboarding.astro` — màn "Thêm bé đầu tiên" (line-art paw/hoa, lời chào mềm, nút → /pets/new).
- `web/src/pages/pets/new.astro` — wizard `welcome→pledge→form`: ô up ảnh, field bắt buộc tên/loài/cân/giới tính, icon loài line-art, submit (tạo→pledge→/photo→/photos kỷ niệm→complete-onboarding→redirect), `userName` load client-side `init()`, delay mộc 3s.
- `web/src/components/PledgeCertificate.astro` — văn bằng pastel/gold/hoa lá; 5 mục (icon badge nền trắng); 2 chữ ký (Dancing Script); con dấu `vvp2-*` (copy passport `hsp-*`, chữ vòng verify OK); số hiệu conditional.
- `web/src/pages/pets/[id].astro` — 3 fetch SSR → `Promise.all`; tab nav + fade gradient gợi ý cuộn.
- `web/src/layouts/Layout.astro` — nút Reset dev (`import.meta.env.DEV`) + **skeleton overlay** (cream/gold shimmer, reduced-motion safe).
- `api/src/routes/auth.ts` — /auth/me song song + cache. `api/src/lib/me-cache.ts` — cache per-user. `api/src/index.ts` — 2 middleware (cache GET + invalidate non-GET). `api/src/lib/daily-quests.ts` — lock + dedup. `api/src/routes/dev.ts` — dev reset. `web/src/components/care-plan/ConsentModal.astro` — "Gemini"→"AI".

**Hiệu năng (đo trước→sau, warm/cached):** /dashboard 6.2s→**1.53s** · /pets/[id] 6.5s→**1.59s** · /auth/me 2.5s→**0.22s** (HIT) · endpoint nudges/mood/alerts 2–3s→~0.2s (HIT).

### 2️⃣ CẤU TRÚC CỐT LÕI (quy chuẩn — KHÔNG phải "loại Schema")
- **⚡ Cache (v275/276):** `me-cache.ts` = `Map<userId::key,{data,exp}>` + `byUser` Set. `cacheGet/cacheSet/invalidateUser` + wrapper `getMeCache/setMeCache`. 2 middleware ở `index.ts`: ① **cache GET** (`CACHEABLE_RE`: mood/nudges/alerts/pet-score/profile/care-plan, key=path+query, đọc cookie→`verifySession`→sub, TTL 20s, serve `c.json(hit)`) ② **invalidate** mọi **non-GET** có user → `invalidateUser(sub)` bust toàn bộ → **không stale** (verify: ghi→MISS/tươi). `/auth/me` cache TTL 12s.
- **Bài học lặp-lỗi:** `<script is:inline>` = JS thuần (no TS, verify `node --check`) · SVG qua `set:html` phải gắn **width/height thẳng** (CSS scoped không áp) · **icon KHÔNG cùng hệ màu nền** (gold-trên-gold = tàng hình) · reduced-motion guard bắt buộc cho animation.
- **Verify:** mint cookie `signSession` (shared/jwt.ts) để test authed · `curl -w time_starttransfer` · **Preview MCP `preview_eval`** chạy được (getBBox/computed) nhưng **`preview_screenshot` TIMEOUT** (env) → đo DOM thay ảnh · trang test tạm `/certtest` (tạo+public→verify→XÓA+revert).
- **Dev gating:** api `NODE_ENV!=="production"` · web `import.meta.env.DEV`.
- **Stack/Git:** Astro SSR :4322 · Hono+Bun · Baserow (token, `user_field_names=true`, **~1.3s/query bảng pets** — sàn) · R2 · Gemini (AI thật). Git local-only, co-author "Claude Opus 4.8 (1M context)", bump `sw.js` VERSION mỗi release.

### 3️⃣ LỖI / TỒN ĐỌNG
1. **Cold load ~3–4s** (cache miss lần đầu) — nền Baserow ~1.3s/query bảng pets (recompute formula/lookup, **bất kể số field** — slim đã đo VÔ DỤNG). Cache chỉ giúp lần 2+. Sàn chưa hạ.
2. **Quest trùng** — race đã FIX (lock per user:pet:date + dedup-on-read) + dọn 6 dòng trùng user 18. **Chưa E2E** trên account mới toanh để chắc lock chịu 8-fetch song song.
3. **Emoji fallback khung tròn certificate** (`🐾/🐱/🐶` x-text khi chưa up ảnh) — CHƯA iconify (đã flag, chờ duyệt).
4. **Certificate chưa duyệt MẮT** end-to-end (screenshot tool timeout) — bồ mở `/pets/new` live hoặc tôi spin `/certtest`.
5. **SW auto-reload loop** (skipWaiting+claim+controllerchange→reload, `Layout.astro`/`sw.js`) — chưa fix (MEMORY flag, từ nhiều phiên).
6. **Baserow creds** rò rỉ `docs/archive/MIGRATION_REPORT.md` + `.env.backup` (đã gitignore, NÊN rotate hygiene).
7. **Cache staleness 20s** nếu data đổi từ thiết bị khác/cron (không qua ghi của user) — chấp nhận được.

### 4️⃣ NEXT STEPS (việc tiếp — chính xác)
1. **Hạ sàn Baserow 1.3s/query** (gốc cold-load): điều tra field formula/lookup nặng bảng `pets`; cân nhắc tách field tính toán/bảng denormalized/cache-warming HOẶC mở rộng `CACHEABLE_RE` + cache trang dashboard.
2. **E2E verify quest dedup** trên account mới (login fresh → dashboard → đúng 3 quest unique, lock chịu 8-fetch song song).
3. **Iconify emoji fallback certificate** (`🐾/🐱/🐶`→line-art) cho đồng bộ — sau khi bồ duyệt.
4. **Rotate Baserow credentials** rò rỉ + scrub git history nếu cần.
5. **Fix SW auto-reload loop** (bỏ trifecta) — đóng dứt điểm flag tồn nhiều phiên.

> *(Tồn từ phiên trước, CHƯA làm: Admin-place **Phase 2** (verified=cổng ẩn/hiện map) · **Audit công thức /food-brands** (RER/DER WSAVA) + brand-sync /food-brands · dọn Baserow test rows places id25/26/27 + user +84900000123. Nếu sang **SEO/Schema thật**: chưa có gì — cần JSON-LD cho /p/[qr], /heroes, /articles, landing.)*

---

## SESSION 2026-06-01 (tiếp) — Achievements WOW + Food-brands recon

> ⚠️ **Đính chính khung "SEO/Schema":** Đây là **VowVet/Mon Min Pet — nền tảng chăm thú cưng** (Astro SSR + Bun + Hono + Baserow + R2 + Gemini), **KHÔNG phải dự án SEO/Schema**. Mục dưới ghi ĐÚNG việc thật của session (animation WOW + recon dinh dưỡng), KHÔNG bịa "tối ưu SEO/Schema". *(File APPEND theo session — KHÔNG ghi đè, để giữ ngữ cảnh 70 commit.)*

### 1️⃣ Trạng thái hiện tại — ĐÃ XONG (committed)
- ✅ **Achievements WOW** (`273f558`, SW **v257**) — `web/src/pages/pets/[id]/achievements.astro`:
  - **A entrance (universal, thấy cả ở 0/20):** header gold shimmer (dịu, 8s/9s, ±0.07 opacity / scale 1.025) · grid stagger cascade (~1.45s, delay `achIdx*55` cap 900ms + fade 0.55s) · ring vẽ-dần (SSR `stroke-dasharray="0 276"` → fill target qua transition 0.8s) · count-up (`displayCount` tween easeOutCubic).
  - **B celebration (code-SẴN, CHƯA duyệt mắt vì pet 0/20):** unlocked tier glow (gold/platinum lung linh hơn đồng/bạc) · unlock burst (ring vàng + 4 tia, gate `burstCodes` clear sau 1.6s → đổi tab KHÔNG lặp).
  - **reduced-motion 2 lớp:** CSS `@media(prefers-reduced-motion:reduce){animation:none !important}` + JS `matchMedia` (count-up/ring hiện THẲNG giá trị cuối). Pattern clone từ memorial→birthday.
- 🔍 **Recon /food-brands ×2 (READ-ONLY, CHƯA code)** — chuẩn bị audit dinh dưỡng. Công thức + data layer ghi ở mục 3.
- 🩺 **Debug "achievements không hiện hiệu ứng" = BÁO ĐỘNG GIẢ** (KHÔNG phải bug). Nguyên nhân: **env đang bật reduced-motion** (DevTools "emulate prefers-reduced-motion" còn bật sau khi test bước (c), hoặc Windows Animation OFF) → guard tắt ĐÚNG thiết kế. Code đã verify khớp (class/keyframe/guard/init/achIdx). Khắc phục: tắt emulation + Windows Animation ON + Ctrl+Shift+R.

### 2️⃣ Cấu trúc cốt lõi (quy chuẩn — KHÔNG phải "loại Schema")
- **Animation pattern (proven memorial→birthday→achievements):** `<style>` (scoped) hoặc `<style is:inline>` + `@keyframes` + **BẮT BUỘC `@media (prefers-reduced-motion: reduce){ animation:none !important }`** (bài học v211). Effect chạy bằng JS (count-up/ring) phải tự check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` → hiện giá trị cuối, KHÔNG tween.
- **Iconify:** emoji UI tiện ích → `<FeatureIcon>` (SSR tĩnh) hoặc SVG-string map + `x-html` (data-driven trong x-for). GIỮ emoji thematic/biểu cảm + emoji user-chọn (picker).
- **Brand tokens:** mmp-ink/mmp-cream/mmp-gold (#ecb921 / #B48608) · slate→ink ladder (heading→ink, body→ink/70, helper→ink/55, faint→ink/45) · gold KHÔNG dùng cho text trên nền sáng (chìm → amber-500).
- **Protocol bắt buộc:** recon→report→chờ duyệt→code (chỉ file trong SCOPE)→verify (`node --check` is:inline + restart + curl)→duyệt mắt (animation)→secret-scan (value-focused)→commit local co-author **KHÔNG push** · bump `web/public/sw.js` VERSION mỗi release UI.
- **Stack:** Astro+Bun :4322 · Hono+Bun :3010 · Baserow :8888 · R2 · Gemini 2.5 Flash. Git **local-only (no remote)**.

### 3️⃣ Lỗi tồn đọng + điểm AUDIT /food-brands (CHƯA fix — chờ chốt)
- **KHÔNG có bug active** từ achievements (đã verify). reduced-motion "no effects" = env, không phải code.
- **Điểm cần xử trong audit dinh dưỡng /food-brands** (recon ghi, CHƯA sửa):
  - ⚠️ **2 công thức gram LỆCH:** Mô-đun 1 (headline 59g/107g) dùng hằng số **DRY 360 / WET 85** kcal/100g · còn card mỗi brand `gramsPerDay` dùng **`calories_per_100g` THẬT** của brand → không nhất quán.
  - ⚠️ `calories_per_100g` **có thể NULL** ở brand Baserow → card hiện "—".
  - ⚠️ **DER** = `RER(70×W^0.75) × hệ-số-HARDCODE-theo-BCS` (BCS1=1.8 … 5=1.4 … 9=0.8), **KHÔNG theo neuter/tuổi/activity** (chuẩn MER). Pet record **thiếu field neutered/dob/activity** → muốn MER chuẩn phải thêm field HOẶC cho user chọn trên trang. `life_stage` hiện chỉ là filter thủ công, KHÔNG suy từ tuổi.
  - ⚠️ **Poop Score** chỉ **cap %fat để LỌC brand** (poop5→10% / poop4→13% / else 22%), KHÔNG đổi kcal.
  - ⚠️ **compatScore** chưa tính giá/MonMin/life-stage (chỉ allergen −40/cái · sai-loài −50 · mèo-carb>20 −25 · BCS×fat/cal −10→−25).
  - ⚠️ Cache: comment public.ts ghi "1h" nhưng code `loadFoodBrands` = **24h** (lệch doc).
  - ⚠️ /food-brands là **M8 cũ — gần như CHƯA brand-sync/iconify** (1797 dòng, 1 file; nhiều `text-slate-*` + emoji 🐶🐱🦴✨🚨📋🔍🏠💬🔬🤖🎯📅 chưa iconify).
- **Baserow (dọn tay, tồn từ trước):** test rows `places` id25/26/27 (active=false, chưa xoá) + user test `+84900000123`.

### 4️⃣ NEXT STEPS (việc tiếp — chính xác)
1. **Audit công thức dinh dưỡng /food-brands** — đối chiếu RER/DER (BCS-mult 1.8→0.8) + gram-split (hằng số 360/85) với chuẩn **WSAVA/AAHA**; chốt: hợp nhất 2 công thức gram, xử `calories_per_100g` null, quyết DER nâng-cấp (thêm field neutered/tuổi/activity vào pet HAY cho user chọn). *(Recon xong — chờ bồ chốt hướng trước khi code.)*
2. **Brand-sync + iconify /food-brands** — sweep `text-slate-*`→ink + iconify emoji utility (giữ thematic) theo pattern các trang đã làm. Bề mặt lớn.
3. **Duyệt mắt Combo B achievements** — trên 1 pet CÓ badge unlocked thật (glow tier + unlock burst chưa thấy được ở pet 0/20).
4. **Dọn Baserow** — xoá test rows `places` id25/26/27 + disable user `+84900000123`.
5. **Backup + push** — tạo git bundle mới (đang trễ ~2-3 commit so với `vowvet-20260601-1911.bundle`@`eb16c3d`) + copy off-machine; cân nhắc GitHub private (**70 commit chưa push, no remote**).

---

## 📌 (2026-06-01 — tiếp) Arc BRAND-SYNC 3 TRANG CẢM XÚC — giữ palette/emoji thematic có chủ đích

> Sau snapshot admin-place (ngay dưới). 3 trang có **palette cảm xúc CỐ Ý** (khác form pages) → **KHÔNG sync full**: chỉ sweep `text-slate-*`→ink + iconify emoji UTILITY, **GIỮ tông + emoji thematic**. SW `v249`→`v252`.

### 3 commit (thứ tự)
1. **Memorial** (`927ce69`, SW v249+v250) — `memorial/[slug].astro` (public tưởng niệm). Fix contrast `text-yellow-700`→`text-amber-200` (vàng-tối chìm trên slate-900 → vàng-ấm) · iconify (🐾→paw · 🕯️ chỗ tĩnh→candle · 💬→message-circle · ✓→check · ✨→sparkles) · **🔥 nến cháy ĐỘNG** (flame SVG, CSS keyframe flicker+glow, **reduced-motion safe** `@media(prefers-reduced-motion:reduce){animation:none}` — bài học v211) · card tím→amber · bonus fix nút "Nâng cấp" trắng-trên-cream→ink. **GIỮ:** tông tối slate-900 gradient · Schema.org JSON-LD · logic.
2. **Birthday** (`0bd2928`, SW v251) — `pets/[id]/birthday.astro`. slate→ink (~20) · iconify utility (✏️/📋→copy/📲→send/📖→book-open/🖼️→image/⬇️→download/📤→share/✨ · 🐾@empty-state→paw · ✓→check) · cụm **violet share-card→brand** (trắng+viền cream, nút violet→ink, link violet→ink) · Party-planner pink→ink. **GIỮ:** gradient hero hồng-cam-fuchsia + confetti JS + 🎂🎉🎊🥰💌👍 + w.emoji (data) + màu platform (FB `#1877f2`/Zalo/sky).
3. **Lost report** (`75da1a4`, SW v252) — `pets/[id]/lost/report.astro` (**NHẠY CẢM NHẤT** — form tạo data CÔNG KHAI + broadcast Zalo/FB/push/notify-vet + `contact_phone_public`). slate→ink (~28) · iconify 11 utility (📤→share/✅→check/📍→map-pin/📸→camera/✕→close/⚠️→alert-triangle/💰→**wallet**/📲→send/🌐→globe/🩺→stethoscope) · **Việt-hoá label** (Latitude→**Vĩ độ** · Longitude→**Kinh độ** · Reward:→**Thưởng:**). **🔒 Chứng minh an toàn:** khối `<script is:inline>` (226 dòng — submit/privacy/broadcast/rewardTiers) **BYTE-IDENTICAL** HEAD↔working; grep diff `x-model`/`@click`/`contact_phone`/`broadcast`/`rewardTiers`/`emoji:` = **0**. **GIỮ:** đỏ-cam khẩn cấp + 🚨 + cụm reward (emoji+key+amount) + functional (emerald/amber/blue/red alert) + **TOÀN BỘ logic/privacy/broadcast**.

### ✅ QUYẾT ĐỊNH thiết kế — GIỮ emoji thematic có chủ đích (KHÔNG iconify, KHÔNG phải nợ)
- **Reward tiers lost** 🤝🥉🥈🥇💎 → emoji truyền **bậc trực quan** (đồng/bạc/vàng/kim cương); line-icon đơn sắc kém iconic hơn → **GIỮ** (giống nhóm C playdate). *(Recon đã xác nhận FeatureIcon có medal/diamond/handshake nhưng vẫn quyết giữ emoji.)*
- **🕯️ memorial** (nến — đã có flame động riêng ở vùng chính) · **🎂🎉🎊🥰💌 birthday** (lễ hội) · **🚨 lost** (báo động) → **emoji = thiết kế BIỂU CẢM, KHÔNG phải lạc brand** → GIỮ.
- 📌 **Pattern chung (3 trang cảm xúc):** giữ **palette + emoji thematic**; chỉ brand-hoá phần **trung tính** (`text-slate`→ink) + iconify emoji **tiện ích** (share/copy/download/camera/map-pin…). Phân biệt rõ "emoji biểu cảm" (giữ) vs "emoji tiện ích" (iconify).

### 🎂 Cụm BIRTHDAY hoàn tất (tiếp 2026-06-01) — party-nav + wall + bánh động

> Sau birthday chính (`0bd2928`, đã sweep slate→ink + iconify). Hoàn thiện cả cụm. SW `v253`→`v255`.

1. **Party planner nav-fix** (`ad6be23`, SW v253) — `pets/[id]/birthday-party.astro`: back ← `/pets/[id]`→**`/pets/[id]/birthday`** (về sinh nhật chính, KHÔNG về hồ sơ pet — party là CHÁU của birthday) + "← {pet.name}"→**"← Sinh nhật"** + slate→`ink/60`. *(Convention ~15 trang con: ← về hồ sơ pet; party deviate CÓ CHỦ Ý.)*
2. **Birthday wall tông-ấm + iconify** (`f2e09f0`, SW v254) — `birthday/[id].astro` (public no-auth, UGC lời chúc): violet/fuchsia→**ấm** (orange/amber/pink) khớp birthday chính (GIỮ today-hero fuchsia) · slate→ink (11) · iconify UI **tĩnh** (✍️→edit-pencil · 🐾→paw · 🎉→party-popper · 💌→**mail**; success party-popper **amber-500** — mmp-gold chìm trên card emerald-50/teal-50 ~1.7:1). **GIỮ:** emoji picker (`allowedEmojis` data) + w.emoji + 🥰 + species 🐱🐶 + **logic submitWish byte-identical**.
3. **Bánh kem + nến ĐỘNG** (`eb16c3d`, SW v255) — `pets/[id]/birthday.astro`: 🎂 emoji hero (state **normal** 137 + **upcoming** 166) → **SVG cake động** (bánh 2 tầng trắng/kem + nến + lửa lung linh + glow ấm). **Clone pattern nến memorial** (scoped `<style>` non-inline, flame body+core 2 lớp, `transform-box:fill-box`, flicker **1.8s** + glow **2s** — tươi hơn memorial 3s) + **reduced-motion guard** `@media(prefers-reduced-motion:reduce){animation:none}` (bài học v211). **Bonus: thêm guard cho confetti** (đóng lỗ v211 có sẵn). **GIỮ:** today-hero `🎉🎂🎉` (đã động sẵn) + header `🎂 Sinh nhật` tĩnh + gradient hồng-cam + birthdayPage JS byte-identical.

→ **Cụm BIRTHDAY DONE:** chính `0bd2928` + party-nav `ad6be23` + wall `f2e09f0` + bánh động `eb16c3d`. Pattern nến memorial tái dùng OK; phân biệt rõ animate **hero standalone** (làm động) vs cụm/header (giữ tĩnh).

### 💾 Backup + 🧹 Dọn (session-end 2026-06-01)
- **Bundle mới nhất: `vowvet-20260601-1911.bundle`** (`C:\docker\backups\`) = `eb16c3d`, **68 commit**, verify+clone-test OK. (2 bundle cũ `1025`/`1752` đã trễ → xoá được.) ⚠️ **Copy off-machine** (ổ ngoài/cloud) · repo **CHƯA có git remote** · **68 commit CHƯA push**.
- **Baserow (dọn tay):** test rows `places` **id25/26/27** (active=false, chưa xoá row) + user test **`+84900000123`** → xoá/disable.

---

## 📌 SESSION-END SNAPSHOT (2026-06-01) — Admin duyệt place + brand-sync arc

> ⚠️ **Phạm vi (KHÔNG bịa):** VowVet / Mon Min Pet — nền tảng chăm thú cưng (Astro SSR + Bun + Hono + Baserow + R2 + Gemini). Phiên này = **brand-sync vài trang + feature MỚI "Admin duyệt place" (backend + UI)**. KHÔNG đụng SEO/Schema. **SW = `vowvet-v248-admin-places`** · **60 commit local, CHƯA push** (không remote — backup chỉ bundle local).

### 1️⃣ ĐÃ XONG phiên 2026-06-01 — 8 commit (theo thứ tự)
1. **Diary year-range động** (`1064c56`, SW v243) — yearbook list mốc đáy 2026: `max(2026, năm nay)`..+3 → **[2026–2029]**. Getter `years` trong `<script is:inline>` `diary.astro`.
2. **Playdate setup — iconify A+B** (`c167d97`, SW v244) — emoji→FeatureIcon (settings/syringe/check/map-pin/flame) + helper `svgIcon` (save/rocket/check) cho emoji trong x-text · card amber→cream/gold · nút amber→`bg-mmp-ink`.
3. **Playdate setup — sweep màu form** (`d7cbe88`, SW v245) — `accent-violet-600`→`accent-mmp-ink` · `hover:bg-yellow-100`→`hover:bg-mmp-gold/15` · `text-slate-*`→ink ladder (70/55/45).
4. **Trang share — brand-sync** (`f4a4894`, SW v246) — iconify 13 emoji chức năng→FeatureIcon (+ **thêm icon `download`** vào `FeatureIcon.astro`) · sky/amber→ink/cream/gold · panel URL→cream+viền gold · 2 stat card→cream · slate→ink.
5. **Severity refactor** (`c0aa580`, SW v247) — `severityDot` pain/mobility thêm key `amber` → **byte-identical** với cognitive (superset emerald/amber/yellow/orange/red). KHÔNG tách helper (3 copy đồng nhất; dedup thật để sau nếu cần).
6. **Nhóm C playdate — ĐÃ QUYẾT giữ emoji** (`275c2e5`) — chips `looking_for` 🎾🚶🧬✨ + `play_styles` 🎾🤼💨🧘🏊 → **quyết định thiết kế** (emoji hợp tông playful; 3 emoji 🎾🤼🧘 không có icon Lucide tương đương → iconify giảm rõ nghĩa). **KHÔNG phải nợ kỹ thuật.** (Dòng ĐÃ QUYẾT ở Queue brand-sync — KHÔNG pick lại.)
7. **Git bundle backup** — `vowvet-20260601-1025.bundle` (verify + clone-test OK) ở `C:\docker\backups\`. ⚠️ Giờ **TRỄ 5 commit** (xem mục 4).
8. **Admin duyệt place — Phase 1 (`a79b84b`) + Phase 3 (`8b5875f`, SW v248)** — arc chi tiết mục 2.

### 2️⃣ ARC "Admin duyệt place" (GHI KỸ — mai làm Phase 2)
- **✅ Phase 1 backend** (`a79b84b`): 3 endpoint sau `requireAuth`+`requireAdmin`:
  - `GET /api/v1/admin/places/pending` — list `verified=false & active=true` (shape có `created_by`/`created_at` → map RIÊNG trong helper, **KHÔNG qua `toApi`** vì toApi bỏ 2 field đó).
  - `POST /api/v1/admin/places/:id/verify` — `verified=true` + `verified_by` + `verified_at` (ISO UTC).
  - `POST /api/v1/admin/places/:id/reject` — `active=false` (ẩn, GIỮ row).
  - Helper `api/src/lib/places.ts`: `listPendingPlaces` / `verifyPlace(id, adminId)` / `rejectPlace(id)`. Verify an toàn server-side đã chứng minh: **401 no-session · 403 non-admin · 200 admin · 404 missing**.
- **✅ Phase 3 frontend** (`8b5875f`): `web/src/pages/admin/places.astro` — guard frontmatter (check `ADMIN_PHONES` → redirect `/dashboard` nếu non-admin) + **SSR fetch pending FORWARD cookie** (`API_INTERNAL` nội bộ `http://vowvet-api:3000`, `headers:{cookie}`) + Alpine `adminPlacesPage` (verify/reject qua client fetch `credentials:include`, **toast + card fade-out 300ms + reject 2-bước-inline**). Brand cream/gold/ink + FeatureIcon. Link từ `admin.astro` (Quick actions).
- **Cơ chế admin:** whitelist `ADMIN_PHONES` env (dạng `+84...`). Login `normalizePhone` → `+84...` → **KHỚP** (verify live: admin GET pending 200). **An toàn THẬT ở API `requireAdmin`**; guard frontmatter chỉ là UX (web SSR có access `ADMIN_PHONES` env qua import.meta.env/process.env).
- **Baserow:** đã thêm field `verified_by` (Number) + `verified_at` (Date+time UTC) vào table `places`.
- **🔜 CÒN LẠI — Phase 2 (product decision, CHƯA làm):** biến `verified` thành **CỔNG ẩn/hiện** map public. **Hiện `verified` chỉ là BADGE** — place chưa duyệt **VẪN hiện công khai** (map fetch `/api/v1/places` KHÔNG kèm `?verified=1`; default list trả cả verified+unverified miễn `active=true`). Phase 2 = đụng public list (default `verified_only` / map fetch `?verified=1`) + **tính UX cho người thêm** ("đang chờ duyệt"). **Thứ tự đã chốt: 1→3→2** (Phase 2 sau cùng). Trước Phase 2: bồ **test bấm-nút admin UI end-to-end** + **quyết UX người-thêm**.

### 3️⃣ CẦN DỌN (Baserow, làm tay — CHƯA xoá)
- **Test rows `places` id25/26/27** — giờ chỉ `active=false` (đã reject lúc test), **chưa xoá row** → xoá hẳn trong Baserow. *(Có UI /admin/places rồi: reject = ẩn; xoá hẳn vẫn cần Baserow.)*
- **User test `+84900000123`** (tạo lúc test Phase 1 Case 2 non-admin) — disable/xoá trong Baserow `users`.

### 4️⃣ Backup
- Bundle gần nhất `vowvet-20260601-1025.bundle` (`C:\docker\backups\`) = commit `d7cbe88` → **TRỄ 5 commit** (thiếu `f4a4894` share · `c0aa580` severity · `275c2e5` nhóm-C-doc · `a79b84b` admin P1 · `8b5875f` admin P3, + doc này). → **Tạo bundle mới** (`git bundle create <path>/vowvet-<YYYYMMDD-HHMM>.bundle --all HEAD`) + **copy off-machine** (ổ ngoài/cloud). Repo **vẫn chưa có git remote**.

### 5️⃣ Queue còn lại (ngoài admin-place Phase 2)
- **Playdate brainstorm thiết kế** (chờ bồ mô tả trang muốn làm gì).
- **TopBar Hướng B** (PageHeader toàn app, đại phẫu) · **Hụi Pet stats** thật.
- **Nhóm C playdate — ĐÃ ĐÓNG** (giữ emoji, quyết định thiết kế — KHÔNG pick lại).

---

## 📌 SESSION-END SNAPSHOT (2026-05-31 buổi 3) — Brand-sync / Iconify arc — 4 mục

> ⚠️ **Đính chính phạm vi (KHÔNG bịa):** Đây là **VowVet / Mon Min Pet** — nền tảng chăm sóc thú cưng (Astro SSR + Bun + Hono + Baserow + R2 + Gemini). **KHÔNG phải dự án SEO/Schema.** Phiên buổi 3 **KHÔNG đụng SEO/Schema**. SEO hiện trạng: chỉ **meta/OG cơ bản** ở `Layout.astro` (og:title/description/image, twitter:card) — **CHƯA có Schema.org JSON-LD / structured data** nào. Phiên này = **đồng bộ icon/màu brand (gold/ink/cream) + feature Map-Lai (gợi ý OSM)**.

### 1️⃣ Trạng thái hiện tại — đã làm xong (file + tính năng)
~17 commit buổi 3 (`86a4392` → `2b87a21`, **CHƯA push**). Đây là arc **brand-sync UI** (không SEO/Schema):
- **Weather fix** (`86a4392`/`3cbd272`): `/api/v1/weather` slug sai → frontend dùng `settings.city`; route `/` trả 400 BAD_CITY thay 500.
- **🐛 BUG ẨN FIXED** (`e66db76`): `as number[]` (TypeScript) lọt vào `<script is:inline>` bills → browser `SyntaxError` → chết Alpine **TOÀN TRANG** (tab/upload/list đơ). → bài học is:inline (mục 2).
- **Arc iconify (emoji → `FeatureIcon` SVG)** nhiều màn: Check-in/Climate · BCS · Nutrition · mobility · pain · cognitive · water · **bills** (icon + brand-color xanh→gold/ink + badge danh mục 7/7) · **map** DONE ALL · **diary** DONE ALL.
- **🗺️ Map-Lai (feature MỚI)** — gợi ý địa điểm pet từ OSM Overpass:
  - Backend `GET /api/v1/places/suggest?bbox=` + `api/src/lib/overpass.ts` (Tầng 1 vet/pet_shop/grooming/dog_park · pad bbox +3km · guard 0.5° · dedup <80m Haversine · degraded khi Overpass lỗi · cache 10′). Commit `b3953b9`.
  - Frontend `map.astro`: nút "Tìm gần đây" → marker gợi ý vàng nổi → "+ Thêm" → toast → **promote tạo place Baserow** (gate Pet Score ≥200; fix `9f5a554` round6 lat/lng vì Baserow giới hạn 6 chữ số thập phân). Commit `95df5ec`/`c2b194e`.
  - Brand-sync /map (`6da3a17`/`b59b3fa`/`ce41970`/`6cb0a73`): hết emoji UI, hết hex lạc (#c4b5fd/#3b82f6→ink), category icon **màu-theo-loại** (vet đỏ/park xanh…).
- **📔 diary DONE ALL** (`10e15bc`/`22dcc70`): mood emoji → **mood face icon** (smile/frown/laugh/party-popper/paw, màu-theo-mood) render x-html · UI emoji → FeatureIcon · căn giữa nút mic/stop (`mx-auto`) · màu yearbook hồng/đen → gold/cream.
- **`FeatureIcon.astro`** (~130 icon) — buổi 3 thêm ~30 icon (mood faces · hospital/scissors/microscope · phone/tree/coffee/bed/waves · printer/stop/chevron-down/right · mood/weather…).
- **SW hiện tại = `vowvet-v242-diary-yearbook-gold`**.

### 2️⃣ Cấu trúc cốt lõi — quy chuẩn code (LƯU Ý: "schema" ở đây = quy chuẩn code, KHÔNG phải Schema.org)
- **Stack:** Astro 5 SSR + Bun (`vowvet-web` :4322) · Hono + Bun API (`vowvet-api` :3010) · Baserow REST :8888 · Cloudflare R2 · Gemini 2.5 Flash. Docker + bos-network. **Git local-only (không remote).**
- **Icon system = `web/src/components/FeatureIcon.astro`**: inline SVG Lucide-style (`viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=1.5` round); render `{name === "x" && (<svg>…)}`; màu qua text-class/`currentColor`.
- **⚠️ `<script is:inline>` = JS THUẦN** (Astro KHÔNG transpile) → TUYỆT ĐỐI không TypeScript (`as`/`: type`/generic) → SyntaxError chết Alpine, **lọt runtime** (build vẫn "ready in" OK). **BẮT BUỘC `node --check` block is:inline sau mỗi sửa.**
- **Icon ĐỘNG trong Alpine** (x-for/x-text/Leaflet divIcon): KHÔNG dùng `<FeatureIcon>` (SSR) → dùng **helper trả SVG-string + `x-html`** (proven: `catIconSvg`/`moodIcon`/`severityDot`/`categoryIcon`). Icon tĩnh → `<FeatureIcon>` literal.
- **Brand palette (tokens `--color-mmp-*`, Tailwind v4 @theme):** gold `#ecb921` · ink `#0a0a0a` · cream `#f5f1eb` · brown `#8b6f47`. **Gold/cream/amber cho NỀN/accent — KHÔNG dùng gold cho CHỮ (gold-on-white chìm ~1.9:1, bài học bills); ink cho chữ chính; brown cho accent-text đọc được.** **Functional GIỮ:** severity đỏ/amber · mood emerald/amber/rose · done/live emerald · recording red · verified `#10b981` · category-color trên marker /map.
- **SW versioning:** `web/public/sw.js` L17 `const VERSION` — bump mỗi release UI; `cacheFirst` cho `.css/.js` → dễ stale ("không thấy thay đổi" → hard-refresh / Unregister SW).
- **SEO/Schema:** chỉ meta/OG cơ bản ở `Layout.astro` — **CHƯA có JSON-LD / structured data** (chưa làm, không bịa).

### 3️⃣ Lỗi tồn đọng
- **⚠️ Row test RÁC trong Baserow `places`**: `id25`/`id26` (E2E test cũ) + **`id27`** (round6-fix verify tôi tạo) → **nên xoá thủ công** trong Baserow để `/map` sạch (CHƯA xoá).
- **SW reload loop** (`controllerchange→reload` + skipWaiting/clients.claim, `Layout.astro`) — auto-reload mỗi lần bump SW; chưa gây sự cố thực → hạ ưu tiên.
- **Live `BASEROW_USER_PASSWORD`** trong `docs/archive/MIGRATION_REPORT.md` — **đã gitignore** (KHÔNG track/push); rotate chỉ là hygiene. `.env.backup` đã xoá.
- **KHÔNG có git remote** — **51 commit local, CHƯA push** (backup chỉ ở máy).
- *(Đã fix phiên này: `as number[]` Alpine-chết · Weather 500 · promote 500 (round6) · mic "lệch màu" = cache (v242).)*

### 4️⃣ NEXT STEPS (việc tiếp, ưu tiên)
1. **Dọn row test Baserow** `id25/26/27` — xoá thủ công trong Baserow UI (nhanh, cho `/map` sạch marker rác).
2. **Severity refactor** `pain.astro`/`mobility.astro` — gom `severityDot` helper dùng chung (nhận cả `yellow` + `amber`); GIỮ shared `pain-glasgow.ts`/`cognitive-ccds.ts` (API dùng calc).
3. **Màn admin duyệt place** (CHƯA có UI): place promote/form tạo `verified=false` → hiện phải đổi cột `verified` thủ công trong Baserow → cân nhắc trang admin (list `verified=false` + nút duyệt/từ chối). Tương lai.
4. **Playdate / setup / pet 12 brainstorm** — cần user mô tả trang muốn làm gì.
5. **(tùy)** Backup remote (tạo repo private + `git push`) · TopBar Hướng B (PageHeader toàn app, đại phẫu) · Hụi Pet stats thật · bills nút `×` "Đổi ảnh"→close icon (optional).

---

## 📌 SESSION-END SNAPSHOT (2026-05-30 buổi 2 — lịch sử) — 4 mục

> ⚠️ **Đính chính phạm vi:** Đây là **VowVet / Mon Min Pet** — nền tảng chăm sóc thú cưng (UI/UX + WOW animation). **KHÔNG phải dự án SEO/Schema.** Phiên này KHÔNG làm SEO/Schema. SEO hiện chỉ có **meta/OG cơ bản** ở `Layout.astro` (og:title/image, twitter:card) — **CHƯA có Schema.org JSON-LD** (không bịa). Phiên này = **arc UI/WOW dashboard + pet page**.

### 1️⃣ Trạng thái hiện tại — đã làm xong (file + tính năng)
8 commit local `8504494 → e12e623` (CHƯA push) + v211 đang dở:
- **v206 TopBar** — `web/src/components/TopBar.astro` (nav dùng chung: Logo + pet-jump/alerts/chat/settings; count fetch client-side Alpine, `Promise.allSettled` + AbortController) → tích hợp `dashboard.astro`.
- **v207 khai tử quick-nav** — gỡ floating quick-nav khỏi `Layout.astro` + dọn CSS mồ côi `global.css` + SSR count chết `dashboard.astro` (305 dòng xoá / 5 thêm).
- **v208 Dashboard WOW** — `components/dashboard/PetScoreCompact.astro` (ring fill 0→score đồng bộ count-up — cách **A2**: rAF tick chung 1 eased; reduced-motion nhánh jump) + `PetHeroCard.astro` (halo pulse + CTA shine).
- **v209 color-sync** — slate/zinc → ink/cream trên **5 file** (dashboard + QuestStrip/QuickAccess/CarePlanProgress/CommunityMini); CommunityMini 5-màu event-type → gold/ink (giữ icon).
- **v210 tier-gold** — `PetScoreCompact.astro` TIER_META → **hệ sắc độ gold** (bỏ slate/xanh/tím): bronze tối→silver pale→gold bright→platinum glow→diamond shimmer.
- **v211 Grand Entrance** ✅ **RESOLVED** (commit `f871596` — không phải bug, do OS reduce-motion) — welcome reveal `/pets/[id]`.
→ Chi tiết: section **🧭 TOPBAR + DASHBOARD WOW v206-210**.

### 2️⃣ Cấu trúc cốt lõi — quy chuẩn / framework
- **Stack:** Astro 5 SSR + Bun (`vowvet-web`) · Hono + Bun API (`vowvet-api`) · Baserow REST · Cloudflare R2 · Gemini 2.5 Flash. Docker Compose + bos-network.
- **Frontend:** Alpine.js 3.14.7 · Tailwind v4 beta · Chart.js (CDN).
- **Brand palette STRICT:** gold `#ecb921` · ink `#0a0a0a` · cream `#f5f1eb` (tokens `--color-mmp-*` / `--c-gold`). Chỉ giữ màu **functional** có chủ đích (đỏ/amber severity · emerald done/live · difficulty traffic-light · TIER huy hiệu).
- **Animation convention:** keyframe **prefix theo scope** (`psc-`/`phc-`/`pge-`) tránh trùng (đã có 27+ keyframe) · chỉ transform/opacity (GPU) · 1-iteration `forwards` (no loop CPU) · **reduced-motion guard BẮT BUỘC**. Hạ tầng sẵn: `hero-fade-up`, `hero-*` (pet passport), `gold-pulse` (dùng chung).
- **Astro pitfalls (đã học):** `define:vars` inline script **PHẢI slot-less** — combo `slot="head"` + define:vars render hỏng (drop var). SSR `.map()` cho SVG (né Alpine x-for-in-SVG). `Number(Astro.params.id)` qua define:vars có thể bị drop → **lấy id từ `location.pathname` trong script** an toàn hơn.
- **SW versioning:** `web/public/sw.js` L17 `const VERSION` — bump mỗi release HTML/CSS. ⚠️ **`cacheFirst` cho `.css` → dễ stale** ("không thấy thay đổi" sau sửa CSS → hard-refresh / Unregister SW).
- **Schema/SEO:** chỉ meta/OG cơ bản (`Layout.astro`) — **chưa có structured data / JSON-LD**.

### 3️⃣ Lỗi tồn đọng
- **✅ Grand Entrance v211 — RESOLVED (KHÔNG phải bug):** reveal "ẩn" trên máy dev = OS bật reduce-motion → `@media (prefers-reduced-motion: reduce)` tắt overlay đúng thiết kế. Verify OK Chrome/Safari/mobile. Commit `f871596`. (chi tiết: mục ✅ RESOLVED)
- **SW reload trifecta** (`controllerchange→reload` + skipWaiting + clients.claim ở `Layout.astro` L133-139 + `sw.js`) — auto-reload mỗi lần bump SW, từng nuốt gate v211. Chưa fix (MEMORY flag).
- `data/api/gemini-usage.log.jsonl` bị git track + app ghi runtime → **nên gitignore** (KHÔNG add khi commit).
- Live Baserow creds trong `docs/archive/MIGRATION_REPORT.md` (rotate khuyến nghị — xem 🔒 SECURITY). **✅ Verify cuối phiên:** file này **đã gitignore** (`.gitignore` L22) → **KHÔNG bị track, KHÔNG lộ kể cả `git add -A` / push**; `.env.backup` đã gitignore (`.env*` + `*.backup`) **và không còn trên đĩa**. File DUY NHẤT bị track bất thường = `data/api/gemini-usage.log.jsonl` (log `.jsonl` nên `*.log` không bắt; KHÔNG chứa creds) → mai `git rm --cached` + thêm gitignore để hết noise.

### 4️⃣ NEXT STEPS (3-5 việc tiếp, ưu tiên)
1. ✅ **XONG — Grand Entrance v211**: không phải bug (OS reduce-motion), commit `f871596` (xem mục ✅ RESOLVED).
2. **Backup lên remote — repo HIỆN CHƯA CÓ remote** (✅ verify cuối phiên: `git remote -v` rỗng; local-only từ `git init`). 8 commit `8504494→e12e623` (+ v211) an toàn ở máy nhưng chưa có nơi push. Mai muốn đẩy GitHub: ① tạo repo **private** ② `git remote add origin <url>` ③ gitignore gemini log + (tùy chọn) rotate creds ④ `git push -u origin master`. ⚠️ Creds đã gitignore (xem mục 3) nên push KHÔNG lộ — rotate chỉ là hygiene thêm.
3. **TopBar Hướng B** (nav global toàn app) — chuẩn hoá ~45 header sub-page thành component `PageHeader` đặt dưới TopBar (đại phẫu, dự án riêng — xem 🚨 TOMORROW QUEUE #1).
4. **Fix SW auto-reload** — gỡ/guard `controllerchange→reload`; cân nhắc **network-first cho `.css`** để hết stale-CSS (giải quyết luôn root của bug v211 nếu là stale).
5. **Cấu hình prod:** ❌ **QUYẾT BỎ** thoát `astro dev`/inotify (restart tay không đủ phiền — giữ dev setup). Gemini log đã gitignore ✅ (`9190d13`). Còn lại: update Hụi Pet stats placeholder; (optional) rotate creds.

---

## ✅ RESOLVED — Grand Entrance v211 + cập nhật buổi 3 (2026-05-31)

> **🟢 v211 Grand Entrance — KHÔNG có bug.** Reveal "không hiện" trên máy dev = do **Windows tắt animation** (Settings → Accessibility → Visual effects → "Show animations" = **Off**) → browser báo `prefers-reduced-motion: reduce` → `@media (prefers-reduced-motion: reduce)` (`global.css`) **tắt overlay/spotlight/sparkle ĐÚNG THIẾT KẾ** (accessibility chuẩn). ✅ Verify reveal hiện OK trên **Chrome + Safari + mobile**. ✅ Commit **`f871596`**. 📌 Bài học: "animation không chạy" trên máy dev → check **OS reduce-motion TRƯỚC** khi nghi CSS stale/z-index.
>
> **✅ Đã xong buổi 3 (2026-05-31):**
> - **Weather 500** (`?city=hcm` slug sai) → fix frontend dùng `settings.city` (**`86a4392`**) + hardening route `/` trả 400 BAD_CITY thay 500 (**`3cbd272`**). Verified 200 thật.
> - **Icon form Check-in/Climate** → 7 icon FeatureIcon mới (**`a46cf1e`**) + ráp vào form thay emoji + micro-interaction (pop/hover, reduced-motion guard) + nút Lưu (`clipboard-check`) & empty state (`info`) (**`55a2928`**). Stool select giữ emoji (native). SW → `v216`.
> - **Production mode** (thoát `astro dev`/inotify) → **đã cân nhắc kỹ, QUYẾT BỎ** — restart tay mỗi lần sửa không đủ phiền; giữ dev setup hiện tại (4 hướng đã recon, không chọn).
> - **🎨 Arc icon — 8 màn iconified** (emoji→FeatureIcon SVG): Check-in/Climate · BCS Vision · Nutrition tab · mobility · pain (+chấm severity) · cognitive (+`severityDot`+`domainIcon`) · water · bills. **Pattern:** spot tĩnh → `<FeatureIcon>` SSR; spot data-driven (x-for/x-text) → helper trả **SVG-string** render `x-html` (vì FeatureIcon SSR KHÔNG dùng được trong Alpine).
> - **~21 icon mới trong `FeatureIcon.astro`** (mai khỏi vẽ lại): mood-nausea/tired/energetic · sneeze · limp · fog · cloud · bone · wand · mailbox · cookie · sunrise · refresh · ban · circle-filled · compass · toilet · anxiety · bar-chart · package · hospital · scissors · microscope.
> - **2 nút fix contrast** (BCS + cognitive → `bg-mmp-ink text-white` thay nền sáng chữ trắng chìm).
> - **🐛 BUG ẨN FIXED — `as number[]` trong `<script is:inline>` bills** (L555/560, getter maxCategoryAmt/maxMonthlyAmt): TS trong is:inline mà **Astro KHÔNG transpile** → browser `SyntaxError: Unexpected identifier 'as'` → **chết cả script → `billsPage` undefined → Alpine TOÀN TRANG chết** (tab/upload/list/filter đơ). Fix xoá 2 cast (**`e66db76`**). **📌 BÀI HỌC: `<script is:inline>` = JS THUẦN, TUYỆT ĐỐI KHÔNG viết TS (`as`/type) — Astro không transpile, lỗi LỌT RUNTIME (build vẫn "ready in" OK).** `billsPage` phải global cho `x-data="billsPage()"` nên BẮT BUỘC giữ is:inline.
> - **💰 Bills brand-color** (**`f187208`**): đổi 15 chỗ xanh lạc brand (sky/blue/indigo) → gold/ink/brown — tab active + nút Lưu = `bg-mmp-ink text-white` (theo pattern BCS/Diary), 3 số tiền `text-mmp-ink`, viền/bar/spinner/focus `mmp-gold`, text phụ `mmp-brown`, card tổng kết `bg-mmp-cream`. **Giữ functional** (green/orange/red). Trước đó: bills markup iconified + badge danh mục **7/7 icon** (`categoryIcon` SVG-string).
> - **SW**: v211→**v229** qua loạt commit icon/fix/brand.
>
> ⬇️ *Phần dưới = lịch sử debug v211 (giữ tham khảo — kết luận cuối: OS reduce-motion, KHÔNG phải CSS stale/z-index như nghi ban đầu).*

> *(Lịch sử)* Welcome-reveal cho `/pets/[id]` (overlay + spotlight + stagger + sparkle, 1 lần/ngày + birthday). SW = `vowvet-v211-grand-entrance` (đã commit `f871596`, sau nâng tiếp v212→v216).

**✅ Đã fix (2 bug đã xử):**
- **Bỏ `slot="head"`** → gate script đặt **slot-less, con đầu tiên của `<main>`** (combo `slot="head"` + define:vars render hỏng).
- **petId lấy từ URL trong script** (`location.pathname.match(/\/pets\/(\d+)/)`) — vì `define:vars` **DROP key petId** (View Source: có `const isBirthday=false` + `const todayVN="..."` nhưng KHÔNG có `const petId` → trong script `petId` undefined → `ReferenceError` → `catch{}` nuốt im → không add class). isBirthday/todayVN vẫn qua define:vars (inject OK). 
- → Gate script **GIỜ CHẠY ĐÚNG**: Console `document.documentElement.className` = `pge-run` (đã xác nhận).

**🐛 BUG CÒN LẠI (reveal vẫn không hiện trên màn hình):**
- `<html class="pge-run">` ✅ · `.pge-overlay` render trong DOM ✅ (Console `querySelector('.pge-overlay')` ra `<div class="pge-overlay no-print">`) · global.css **CÓ** rule `html.pge-run .pge-overlay{display:block;position:fixed;inset:0;z-index:90;background:rgba(10,10,10,.55);animation:pge-overlay-out .55s ease 1.7s both}` [global.css ~L345] ✅ · `.no-print` ĐÃ LOẠI (chỉ trong `@media print` [global.css L708] → vô hại trên màn hình) ✅ — **NHƯNG overlay/spotlight/sparkle vô hình.**
- File CSS + markup verify ĐÚNG HẾT (specificity html.pge-run 0,2,1 > default 0,1,0; overlay `both` giữ opacity 1 suốt 1.7s). Cái chưa biết = **computed style THẬT trong browser**.

**🔜 BƯỚC TIẾP (mai) — chạy Console trên /pets/12 (đã đăng nhập):**
```js
var o = document.querySelector('.pge-overlay');
getComputedStyle(o).position;        // 'fixed' hay 'static'?
getComputedStyle(o).backgroundColor; // 'rgba(10, 10, 10, 0.55)' hay 'rgba(0, 0, 0, 0)'?
getComputedStyle(o).display;         // 'block' hay 'none'?
```
- **static / transparent / (display none)** → rule `html.pge-run .pge-overlay` **KHÔNG áp** → **CSS STALE** (SW cache serve global.css cũ chưa có pge-) → Fix: DevTools → Application → Service Workers → **Unregister** + reload (hoặc Ctrl+Shift+R). *(Nghi phạm: SW `cacheFirst` cho `.css` [sw.js 88-95] — đúng bài học hạ tầng "SW cache → không thấy thay đổi".)*
- **fixed / đúng bg** → rule ĐÃ áp → kiểm thêm `getComputedStyle(o).opacity` + `zIndex` → có element khác che (z-index), hoặc opacity 0 (animation đã fade — check timing).

**📁 File working-tree (CHƯA commit, đừng mất):**
- `web/src/pages/pets/[id].astro` — gate script slot-less + GE markup (overlay/spotlight/sparkle/confetti/banner) + `isBirthday` SSR + 2 stagger class (`pge-d1`/`pge-d2`).
- `web/src/styles/global.css` — keyframe `pge-*` (overlay-out/spotlight/sparkle/rise/confetti/banner) + rule `html.pge-run/.pge-seen/.pge-birthday` + reduced-motion guard [~L336-432].
- `web/public/sw.js` — VERSION `vowvet-v211-grand-entrance`.
- ⚠️ `data/api/gemini-usage.log.jsonl` = log runtime, **KHÔNG add** khi commit (nên gitignore).
- *(v209-210 đã commit: `3d19d67`/`0f03f15`/`e12e623`. Chỉ v211 đang dở.)*

---

## 🗺️ MAP-LAI (2026-05-31 buổi 3) — ✅ DONE ALL: GĐ1→4 + Brand-sync (Baserow + gợi ý OSM Overpass)

> **Mục tiêu:** map gợi ý địa điểm pet từ OpenStreetMap — giữ **Baserow làm nguồn chính**, user **promote** gợi ý OSM vào DB. Trang `/map` (public, Leaflet+OSM tiles, KHÔNG cần API key). Nguồn place hiện tại = Baserow table `places` (**KHÔNG tự cập nhật** — phải user submit `/places/new` hoặc admin nhập tay; không có tích hợp Google Places/OSM POI auto). 9 category trong `lib/places.ts` `CATEGORIES`.

**✅ GĐ1 XONG (commit `b3953b9`, chưa push):**
- Backend `GET /api/v1/places/suggest?bbox=S,W,N,E` (PUBLIC, read-only, **KHÔNG ghi DB**) + file mới `api/src/lib/overpass.ts`.
- Overpass **Tầng 1** (precision cao): `amenity=veterinary→vet` · `shop=pet→pet_shop` · `shop=pet_grooming→grooming` · `leisure=dog_park→park`. Fetch POST overpass-api.de + **`AbortSignal.timeout(25000)`** + User-Agent định danh app (Acceptable Use Policy). Parse `out tags center` (node+way+relation, bỏ POI không name).
- **Dedup <80m** vs place Baserow trong bbox (`haversineDistance` từ `shared/geo.ts`). **Guard** bbox >0.2° → 400 `BBOX_TOO_LARGE`; bbox sai → 400 `BAD_BBOX`. **Degraded** (Overpass lỗi/timeout) → `{suggestions:[],degraded:true}` (**KHÔNG 500** — map vẫn chạy). Cache in-memory 10′/bbox-tile.
- **Test curl:** bbox HCMC rộng → **7 POI thật** (3 vet + 4 pet_shop, tên VN thật) → **data VN dùng được** (mỏng nhưng có; zoom siêu-cận D1 = 0). Guard 400 OK, cache `cached=true` OK, dedup đối chứng **23 place Baserow** trong box → 0 trùng (7 POI là MỚI = giá trị feature).

**📌 Quyết định đã CHỐT:**
- Promote **GIỮ gate Pet Score ≥ 200** (tái dùng `POST /api/v1/places` — anti-spam, KHÔNG cần write-path mới).
- **Chỉ Tầng 1** (chưa Tầng 2 cafe/nhà hàng có tag `dog=*` — volume lớn, để sau).
- Tên: endpoint `/places/suggest` + nút frontend **"Tìm gần đây"**.

**✅ GĐ2/3/4 XONG (commit `95df5ec` + `c2b194e`, chưa push):**
- **GĐ2** (`95df5ec`): nút **"Tìm gần đây"** + render marker gợi ý layer riêng + popup info.
- **GĐ3+4** (`c2b194e`): **promote** (click marker → "+ Thêm vào map" → `POST /api/v1/places` prefill OSM, fallback `address`=name + `pet_policy`=by_request, gate ≥200 giữ) · **pad bbox +0.03°** (~3km, query trên vùng nới) + **nới guard 0.2°→0.5°** (tính trên bbox GỐC) · **fitBounds** sau render (POI off-screen do pad → tự gom hiện) · **marker gợi ý NỔI BẬT** (nền gold đặc + 46px + viền ink dày + badge "+" + pop & glow, reduced-motion guard) · **toast** báo kết quả giữa-dưới map (gần nút, KHÔNG phải `<p>` đỉnh) cho 4 nhánh 201/401/403/lỗi.
- → **Chạy trọn vòng:** Tìm gần đây → marker vàng nổi → "+ Thêm" → toast + promote vào Baserow.
- ✅ **Nhánh 201 CHẠY TRỌN** (verified browser "✓ Đã thêm"): promote tạo place THẬT trong Baserow. Bug 500 trước đó **KHÔNG phải gate** mà là Baserow **`max_decimal_places`** (OSM lat/lng 7 số > giới hạn 6) → fix **round6** trong `createPlace` (commit `9f5a554`, vá cả promote LẪN form `/places/new`). Place tạo ra `verified=false` (chờ duyệt — xem note màn admin ở queue).

**✅ BRAND-SYNC /map DONE ALL (hết emoji pictographic + hết hex lạc):**
- **Việc A** (`6da3a17`): emoji UI tĩnh (header/nút/sheet) → FeatureIcon + 2 hex lạc → ink (`#c4b5fd` viền marker · `#3b82f6` chấm user → ink; **giữ `#10b981` verified** functional).
- **+5 icon** (`b59b3fa`): phone/tree/coffee/bed/waves vào FeatureIcon (verify hình bằng rasterize sharp→PNG vì preview headless 0×0).
- **Việc B** (`ce41970`): category emoji (chip/sheet/marker divIcon) → icon **màu-theo-loại** (vet đỏ, park xanh… giữ phân biệt loại; suggest marker icon ink trên nền vàng). Helper `catIconPaths/catColor/catIconSvg`.
- **Mẩu cuối** (`6cb0a73`, SW v238): nút gọi 📞 → `phone`; policy/amenity labels → `_miniIcon` SVG-string + x-html (stroke=currentColor theo màu badge).
- → **/map sạch emoji UI.** ⚠️ Treo nhỏ: by_request (❓) tạm dùng `info` (CHƯA có `help-circle`) · `catEmoji` helper giờ **unused** (giữ, dọn sau).

**📌 Bài học buổi này (Map-Lai):**
- **Marker Leaflet off-screen sau pad bbox**: backend pad +3km kéo POI ra ngoài viewport → frontend tạo marker đúng nhưng nằm ngoài khung → phải **fitBounds** để hiện.
- **x-transition kẹt `opacity:0` trong headless preview** (viewport 0×0, rAF không chạy) → toast dùng **plain x-show** (display toggle) cho chắc, bỏ transition.
- **Toast/feedback phải đặt GẦN chỗ user bấm** (popup giữa map), KHÔNG phải `<p>` đỉnh map → user không thấy = tưởng "không báo".
- **Preview Claude headless = viewport 0×0** → map/animation/transition không render thật; verify được DOM/state/parse nhưng KHÔNG verify được hình → cần mắt user.

**📋 Queue còn lại (chưa làm):** *(map + diary đồng bộ icon/màu → ĐÃ XONG, gỡ khỏi queue)*
- ✅ **ĐÃ QUYẾT — KHÔNG LÀM: Nhóm C playdate** (chips `looking_for` 🎾🚶🧬✨ + `play_styles` 🎾🤼💨🧘🏊 — phần emoji data-driven còn lại sau khi `/playdate/setup` đã iconify phần còn lại) — **GIỮ emoji có chủ đích.** Lý do: là chip phân loại nội dung (feature hẹn-hò-thú-cưng), emoji màu truyền nghĩa tức thì + hợp tông playful; 3 emoji 🎾🤼🧘 KHÔNG có icon Lucide tương đương → iconify sẽ giảm rõ nghĩa. **Quyết định thiết kế, KHÔNG phải nợ kỹ thuật** (đã gỡ khỏi queue).
- **playdate / setup / pet 12** brainstorm (cần bồ mô tả trang muốn làm gì).
- **severity refactor** pain/mobility (gom `severityDot` helper dùng chung, nhận cả `yellow` + `amber`).
- **Màn admin duyệt place** (CHƯA có): place promote/form tạo `verified=false`; hiện phải đổi cột `verified` thủ công trong Baserow → cân nhắc UI admin (list `verified=false` + duyệt/từ chối). Không gấp.
- **Dọn row test Baserow**: id25/26 (E2E test cũ) + id27 (round6-fix verify) — xoá trong Baserow cho sạch `/map`.
- **bills**: nút `×` "Đổi ảnh" → icon close (optional).
- **TopBar Hướng B** (PageHeader toàn app) · **Hụi Pet stats** thật.

---

## 1. TRẠNG THÁI HIỆN TẠI — Pet Score redesign HOÀN CHỈNH

> **STATUS: ✅ COMPLETE & PRODUCTION-READY** — Phase 1→8 (12 deliverables) **+ WOW arc v197-205** (Constellation sống động + Trend dễ hiểu). **SW hiện tại = `vowvet-v210-tier-gold`** (sau arc TopBar + dashboard wow + color-sync). → Bảng "8 section" dưới là baseline Phase-8; Constellation + Trend đã nâng cấp lớn ở section **🌌 WOW ARC v197-205**.

**File chính**: `web/src/pages/pets/[id]/pet-score.astro` (inline JS `scorePage()` + SSR frontmatter `stars`/`edges`).
**SW version cuối**: `vowvet-v210-tier-gold` (`web/public/sw.js` line 17).
**Backup**: `pet-score.astro.phase8-pre.bak` (+ các phase trước: phase2/3/4/45/451/5/51/53/6/7-pre.bak).

### 8 section theo thứ tự + status

| # | Section | Class anchor | Phase | Trạng thái |
|---|---|---|---|---|
| 1 | **Hero Certificate XL** | `.hero-passport` (giữ global) + `.ps-cert-hero` (nuclear fix) | 2 | ✅ Stable — gauge SMIL 280 + WAAPI count + gold gradient + ink dark + identity stat (tier/percentile/delta) + tagline "Còn X điểm chinh phục Y Tier" + recalc gold |
| 2 | **Achievement Strip** | `.achievement-strip` | 3 + 4.5 | ✅ Horizontal scroll 110px badges + gold-thread top + fade gradient phải + icon "breath" pulse + badge-float stagger + header SVG trophy + "X / 5 cấp bậc" |
| 3 | **Recommendations** | `.recommendations-strip` | 4 + 4.5 + 4.5.1 | ✅ Top 3 cards + gold left-accent (vuông trái bo phải) + icon emoji gold circle + counter pill shimmer + first-card priority-pulse + chevron hover slide + header SVG lightbulb |
| 4 | **Constellation Star Map** | `.constellation-section` | 5 + 5.1 + 5.3 | ✅ Dark deep-space + SSR 15 stars `.map()` trong frontmatter + 4 cụm Cartesian fixed + bright/faint/penalty(white+gold ring)/neutral + const-rings rotate 80s + 20 star-dust twinkle + center ring r=56 dashed + ticker auto-cycle 3s + hover star → ticker swap + header SVG star "15 cực của Bé {name}" + "15 • THÀNH TỐ" pill |
| 5 | **Trend + Community merged** | `.trend-community` | 6 | ✅ Gold-thread + header trend-up SVG + counter pill +X/30d gold-or-slate + Chart.js 30d gold line + 3-cột stats + delta badge gold/slate + divider gold + percentile bar gold position-pulse + community-avg line + leaderboard CTA card hover slide |
| 6 | **Hụi Pet teaser** | `.hui-pet-section` | 7 + 8 | ✅ Dark luxury + 8 sparkle particles + COMING SOON pill shimmer + coin float/glow + tagline italic + **discount click-to-expand** 5 tier với range data-driven từ `levels` + 3-stats grid + CTA gold href="#" |
| 7 | **Footer note** | `<p>` plain | (keep) | Mon Min Pet Score gamification 1-line |
| 8 | **(XÓA Phase 8)** Tier accordion cũ | — | 8 | ✅ Removed; range nhúng vào Hụi Pet discount rows |

### Phase 5.2 (orbit/star-pull) SKIPPED
User quyết bỏ vì: (a) perf risk (35 simultaneous animations + drop-shadow re-rasterize), (b) bug `transform-box: fill-box` cần fix `view-box`, (c) stars tĩnh + dust twinkle + ring rotate + bright twinkle + ticker swap đã đủ "vũ trụ feel".

### Backend (M1-M27 + Gamification A+B+C) — KHÔNG đụng phiên này
54 Baserow tables, 14 cron jobs, API v0.36.0, 119/119 E2E pass. Detail trong `BUILD_PROGRESS.json`.

---

## 🌌 WOW ARC v197-205 (2026-05-30 buổi 2) — Constellation sống động + Trend dễ hiểu

> Quy ước arc này (khác Phase 1-8): mỗi feature = phần **THÊM**, KHÔNG sửa cái cũ · commit checkpoint riêng mỗi lớp · chỉ touch `.constellation-section` / `.trend-community` theo task · precompute Alpine expr string trong frontmatter (proven-safe vs template-literal-in-JSX).

**Constellation (`.constellation-section`):**
- **v197 active-sync**: thread `<line>` sao→tâm sáng khi active (`threadOnExpr`); star-active scale+glow, dim sao khác (`activeClassExpr`); ticker icon đổi `iconSvg(componentIconKey)` (bỏ ✦ đen — BE không trả `.icon`).
- **v198 bright-counter**: pill "X / 15 CỰC SÁNG" — X = `stars.filter(stateClass==='star-bright')` đếm **SSR**; heading "Constellation" đồng bộ màu MMP·ID 12 (`rgba(255,255,255,0.55)`).
- **v199 align-fix**: pill căn dòng đầu heading (`items-start` + line-height 1.5 match).
- **v200-202 Comet hút lõi**: đốm gold chạy thread sao→tâm (CSS `transform` qua `--dx/--dy` precompute SSR) + đuôi mờ; **core-flash** ring + **shockwave** ripple quét chòm khi comet cắm; **v202 tách `coreLabel`** (getter) — chữ ticker đổi TRỄ 1s (`_labelTimer` setTimeout trong interval) → **comet cắm = lõi loé = shockwave = chữ đổi (1 cú, t≈1.0s)**; hover = tức thì (getter ưu tiên `hoveredComponent`); `destroy()` clear interval+timer.
- **v203 constellation lines**: net nearest-neighbor **SSR** (`edges[]`, K=2 sao gần nhất, dist≤90, dedup → **17 cạnh / 2 chòm**); đường nền gold-deep mờ 0.13, sáng `edge-on` (gold-bright) khi 1 đầu = active.

**Trend (`.trend-community`):**
- **v204**: Chart.js Y-axis **auto-zoom** quanh data (flat-safe range≥60, mid±30) thay thang cứng 0-1000 → đường thấy chuyển động thật; chấm "hôm nay" vẽ **canvas** (plugin `afterDatasetsDraw`, resize-proof — đọc lại `meta.data[last].x/y` mỗi draw) + glow `shadowBlur`; brand sync (slate→ink/gold, `pill-negative`/`delta-down`→ink, thêm icon `users` vào `ICON_PATHS`); empty-state khi 0 pet opt-in.
- **v205**: **headline kết luận** trung tính trên chart (`.trend-headline`, 3 trạng thái theo `delta_30d` >0/===0/<0, số delta gold-bright Fraunces 15px) + chú thích **"Thang 0–1000 · biểu đồ phóng to vùng thay đổi"** (chống hiểu nhầm zoom); giữ "TOP X%" (KHÔNG đổi "cao hơn X%" vì `percentile.percentile` chưa verify ở BE).

**Git checkpoints arc:** `c1ad2fc` baseline → `3220c7f` docs → `fa0c977` (v197-199) → `7f67245` (v200-202) → `ad8826e` (v203) → `8504494` (v204-205). 6 commit, history 0 secret, **chưa push**.

---

## 🧭 TOPBAR + DASHBOARD WOW v206-210 (2026-05-30 buổi 2 — tiếp)

> Quy ước: recon→plan→approve→code→restart→verify→commit mỗi bước; secret-safe commit (value-scan `.env`, count-only); **chưa push**.

**TopBar arc (nav dùng chung):**
- **v206 (GĐ1)**: tạo `web/src/components/TopBar.astro` dùng chung (Logo + nav pet-jump/alerts/chat/settings); count fetch **client-side Alpine** (`Promise.allSettled` 2 endpoint CÓ SẴN `/chat/threads?limit=50` + `/alerts/today`, AbortController 5s, fail-soft, KHÔNG tạo BE); badge chat **gold**, chấm cảnh báo **đỏ** (functional); style scoped riêng. Thay header hand-rolled trong `dashboard.astro` bằng `<TopBar pet={primaryPet} />`.
- **v207 (GĐ2-A)**: **khai tử quick-nav floating** — gỡ markup + fetch `quickNavPet` + `data-route` body trong `Layout.astro`; dọn **2 cục rác**: (a) CSS mồ côi `.vowvet-quick-nav*`/`.dashboard-pet-jump*` (global.css L2253-2485) — **GIỮ `@keyframes gold-pulse`** (dùng chung 5 element khác); (b) SSR count chết `chatUnreadTotal`/`hasUrgentClimate` + 2 fetch `chat`/`climate` (dashboard frontmatter — sửa destructure `Promise.all` an toàn, bỏ cặp vị trí 7-8). **305 dòng xoá / 5 thêm.**
- ⚠️ **Sub-page (≥45) GIỮ NGUYÊN nav ngữ cảnh riêng** (back + title + action) — KHÔNG đụng.

**Dashboard WOW (`components/dashboard/PetScoreCompact.astro` + `PetHeroCard.astro`):**
- **v208**: **score ring fill 0→490 đồng bộ count-up** — cách **A2**: drive `dashOffset` + `score` trong **CÙNG 1 rAF tick, cùng `e=1-(1-p)³`** (1800ms) → khớp 100%; bỏ transition inline; SSR `stroke-dashoffset={ARC}` (rỗng → không flash full-ring); reduced-motion → nhánh `if(reduced){jump}`. **tier badge pop-in** (`psc-badge-pop`, giữ `translateX(-50%)` CẢ 2 step → căn giữa, không lệch trái). **chips stagger** (`psc-chip-in` + `animation-delay 1.6+i*0.1s`, `both` fill). **hero halo pulse** (`phc-halo-pulse` trên **halo div [177]**, KHÔNG phải `<img>` đang breathe) + **CTA shine** (`phc-cta-shine` trên `::after`, KHÔNG đụng transform `<a>` hover-scale). **brand-sync chrome** (slate→ink/cream, GIỮ TIER_META semantic).
- 4 keyframe mới prefix `psc-*`/`phc-*` (không trùng 27 cái cũ — đã grep) + **reduced-motion guard riêng** (badge chỉ `animation:none`, KHÔNG `transform:none` để giữ căn giữa).

**Color-sync + tier-gold (5 component dashboard + global.css):**
- **v209 color-sync**: ~38 chỗ slate/zinc → ink/cream (text→`mmp-ink/70-55-45-35-25`, border→`mmp-cream`, track→`mmp-ink/[0.06]`, hover ink) trên **5 file** (dashboard.astro + QuestStrip/QuickAccess/CarePlanProgress/CommunityMini); **CommunityMini 5-màu event-type → gold/ink đồng nhất** (GIỮ icon trophy/medal/hero/hearts/cake phân biệt loại); logout đỏ→ink. **GIỮ functional**: đỏ/amber severity (UrgencyBar), emerald done/success + live ping, difficulty traffic-light (emerald/amber/rose = Dễ/TB/Khó), amber gold-adjacent. KHÔNG đụng EcosystemNav (shared 3 trang)/Logo/PetHeroCard/PetScoreCompact.
- **v210 tier-gold**: `TIER_META` (PetScoreCompact) → **hệ sắc độ gold/ink** — bỏ màu lạc (silver `#64748b` slate, platinum `#3b82f6` xanh, diamond `#7c3aed` tím). Phân biệt qua **độ sáng tăng dần + hiệu ứng tăng dần**: bronze `#a87a1e→#6e5417` (tối) → silver `#ddc77f→#c9a84a` (pale) → gold `#ecb921→#fde68a` (bright) → platinum (bright + **`psc-tier-glow`** filter halo) → diamond (sáng nhất + **`psc-tier-shimmer`** vệt sáng). Hiệu ứng đặt trên **BADGE** (glow=`filter`, shimmer=`::after`, delay 2s sau pop-in) → KHÔNG đụng A2 ring fill. Thêm field `fx`; giữ icon/label.
- → **Dashboard giờ đồng bộ gold/ink/cream TOÀN BỘ** — chỉ giữ màu functional có chủ đích (severity đỏ/amber · done/live emerald · difficulty traffic-light · tier glow/shimmer · TIER_META đã về họ gold).

**🏛️ Ghi chú kiến trúc (quan trọng):** TopBar full-width **KHÔNG phủ toàn app được** — ~45 sub-page đã có **nav ngữ cảnh riêng** (back-button + title + action) mà TopBar không thay được; nhồi TopBar vào Layout → **chồng 2 thanh** + mất back-nav nếu gỡ header cũ (mobile-first → ăn ~120px). → Chọn **Hướng A** (TopBar ở dashboard, khai tử quick-nav floating). Phủ toàn app thật = **Hướng B** (chuẩn hoá ~45 header thành `PageHeader` dưới TopBar — đại phẫu, dự án riêng — xem 🚨 Tomorrow Queue #1).

**Git checkpoints arc:** v206 `e1d235d` · v207 `2eb7d3c` · v208 `685b35c` · *(docs `61d302c`)* · v209 `3d19d67` · v210 `0f03f15` (trên nền `a204aea`). 5 code + 2 docs commit, history 0 secret, **chưa push**.

---

## 2. CẤU TRÚC CỐT LÕI

### Stack (Docker containers running)
- **Frontend**: Astro 5 SSR + Bun → `vowvet-web` :4322
- **API**: Hono + Bun → `vowvet-api` :3010
- **Data**: Baserow REST → :8888
- **Media**: Cloudflare R2 bucket `vowvet`
- **AI**: Gemini 2.5 Flash ONLY (NO OpenAI)
- **Cache**: SW (`web/public/sw.js`) — doc network-first, static cache-first, API network-only

### Pet Score Alpine architecture (`scorePage()`)
State: `pet/score/levels/tierHex/refreshing/gaugeProgress/displayScore/showCelebration/trend/trendLoaded/percentile/age/_loadingTrend/tickerIndex/tickerPaused/hoveredComponent/_tickerTimer`

Module-level consts: `GROUP_DEFS` (4 nhóm × 15 keys) · `COMPONENT_ICON` (15 keys → icon name) · `ICON_PATHS` (23 lucide outlines + lightbulb) — inside `<script is:inline>`.

Frontmatter SSR data: `STAR_POSITIONS` (15 keys → {x,y}) · `KEY_GROUP` (keys → groupKey, *prepared cho Phase 5.2 orbit nhưng skipped*) · `stars` array (15 entries với enterExpr/x/y/r/bucket/stateClass/tipX/tipY).

Methods/getters: `onMount/animateScore/startGauge/startTicker/loadTrend/renderChart/refresh/fmtTime/_comp/groupedComponents/groupNet/nextTier/pointsToNextTier/pointsToNextTierLabel/tierIconKey/topRecommendations/achievements/starState/componentIconKey/iconSvg(name, sw)` + getter `displayedComponent/sortedComponents/barWidth/barFillClass/barWrapClass`.

### Design language (proven across 8 phases)

**Palette strict** — gold/white/ink only:
- gold-deep `#B48608` · gold-bright `#ecb921` · gold-light `#f4c842` · cream `#FAF6EC` `#FFFEF9` · ink `#0a0a0a` `#1a1a1a` · slate (text mờ) `#475569/64748b/94a3b8/cbd5e1`
- **LOẠI BỎ**: red (delta override gold/slate), purple #8b5cf6 (nebula bỏ), navy #1a1a2e (bg ink), emerald (delta override)
- Functional exceptions: emoji icons (component recommendations cho dấu vui), slate cho text phụ — sanctioned

**Section design 2-tone**:
- **Sáng (white card)**: `bg-white rounded-2xl border-2 border-mmp-cream p-5 mb-4 shadow-sm` — Achievement, Recommendations, Trend-Community
- **Dark luxury**: `radial-gradient(ellipse at center, #1a1a1a 0%, #0a0a0a 70%, #050505 100%)` + `border: 1px solid rgba(236,185,33,0.25)` — Hero passport, Constellation, Hụi Pet
- **Gold-thread `::before`** 1px animated linear-gradient → liên kết visual 4 sections (Achievement/Rec/Trend/Hụi Pet)
- **Counter pill** gold gradient `135deg #ecb921 → #B48608` + ::after white sweep shimmer 3.5-4s → header rhetoric

**Animation 3-tier** (memory `design_wow_animation_playbook.md`):
- SMIL `<animate>` (gauge stroke-dashoffset, on mount, begin="indefinite" + JS beginElement)
- WAAPI rAF count-up (score 0→target 1.8s ease-out, sync với gauge)
- CSS keyframes (breath, twinkle, shimmer, pulse, gold-thread, ring-rotate, dotPulse, badge-float, position-pulse, hui-coin-float/glow)
- **Fill-mode `backwards`** (KHÔNG `both`) — proven Phase 3+: hover transform không bị animation freeze chặn
- **Reduced-motion guard** đầy đủ mọi animation

**SSR `.map()` pattern cho SVG**:
- 15 stars render server-side trong template `{stars.map(s => <g>...</g>)}` thay vì Alpine `<template x-for>` trong SVG
- Né pitfall documented trong `memory/learning_alpine_scope.md` (importNode/namespace clone)
- `@mouseenter={s.enterExpr}` precompute string trong frontmatter → tránh template-literal-in-Astro-JSX parsing risk

**Robust SVG transforms**:
- `transform-box: fill-box; transform-origin: center` cho `.const-rings` (bbox đối xứng quanh 160,160)
- `r` là attribute thật (không CSS `r` property — Safari cũ không support → tránh sao tàng hình)
- Hover scale qua `transform: scale()` + `transform-box: fill-box` thay vì `r: calc(attr(r)*1.2)` invalid CSS

---

## 3. LỖI TỒN ĐỌNG

### Đã giải quyết phiên này
- ✅ Hero VV monogram đè header calendar + flourish vàng "bơ vơ" dưới name → Phase 2-after nuclear fix CSS `display:none !important; content:none !important` scoped `.ps-cert-hero`
- ✅ Nebula vàng "vô duyên" → Phase 5.3 xóa sạch
- ✅ Sao penalty đỏ → Phase 5.1 đổi white + gold ring
- ✅ Tím nebula-2 + navy bg #1a1a2e → Phase 5.1 strict gold/ink
- ✅ Confetti cầu vồng (#8b5cf6/#06b6d4/#ec4899/#10b981/#fbbf24) → Phase 5.1 recolor gold palette (đóng note B Phase 1)
- ✅ Delta badge emerald/red → Phase 6 strict gold (up) / slate (down)
- ✅ Tier accordion redundant → Phase 8 xóa, range nhúng Hụi Pet data-driven từ `levels`
- ✅ Astro `@mouseenter`/`:class` trong `.map()` JSX → proven compile + runtime OK (curl 302 + authed 200)

### Còn tồn (đã flag, chưa fix — priority order)
1. ✅ **GIT BASELINE DONE** (2026-05-30): `git init` + commit `c1ad2fc` (478 files). Loại khỏi git: `node_modules`, `.env*`, `baserow-config.json`, `*.bak*`, `docs/archive/MIGRATION_REPORT.md`. Backup `.bak`/`.env.backup` vẫn còn trên đĩa (chỉ untrack). → chi tiết section 🔒 SECURITY AUDIT.
2. ✅ **`/pets/12/personality` 302 loop — ĐÃ ĐIỀU TRA** (2026-05-30): server ĐÚNG, loop là client-side SW reload, KHÔNG active hiện tại, KHÔNG phải nguồn Exit 255. → chi tiết section 🔍 INVESTIGATION 302 LOOP. Fix để mai.
3. **🟢 CTA `/hui-pet/register` route không tồn tại**: glob `web/src/pages/**/hui*` = 0 file. Hiện `href="#"` (Phase 7 A=a). Khi route ready → đổi link 1 dòng.
4. **🟢 Stats Hụi Pet placeholder**: 1,234+ pet / 2.5M+ điểm / 01/07 khai vận — chờ data thật từ user.
5. **🟢 `#ffd56b` coin highlight** (Phase 7): gold-family nhưng không trong palette chính (deep/bright/light). Có thể swap `#f4c842` để khít strict (cosmetic).
6. **🟢 Phase 5.2 orbit SKIPPED**: nếu sau này muốn stars di chuyển → cần fix `transform-box: view-box` (KHÔNG `fill-box`) + cân nhắc perf trên mobile yếu.

---

## 🔒 SECURITY AUDIT (2026-05-30)

- **Secret leak chặn KỊP trước commit đầu tiên:** `.env.backup` (chứa `BASEROW_TOKEN` + `BASEROW_USER_PASSWORD` thật) và `docs/archive/MIGRATION_REPORT.md` (token + password + email plaintext) — đã thêm vào `.gitignore`, KHÔNG vào git.
- **Đã verify HEAD sạch:** quét toàn bộ giá trị secret ≥16 ký tự trong `.env` khắp 478 file tracked → 0 leak. `GEMINI_API_KEY` / `JWT_SECRET` / `R2_*` KHÔNG hardcode đâu cả. Working tree + HEAD clean (`git grep` token = 0).
- **Non-secret bị flag (an toàn, KHÔNG cần lo):** `BASEROW_URL`, `APP_URL`, `API_URL`, `R2_PUBLIC_URL`, `TZ`, `VAPID_SUBJECT`, `GOOGLE_OAUTH_REDIRECT_URI`, `ZALO_OA_ID` — đều là URL/config công khai, vốn dĩ nằm trong source.
- **✅ ĐÃ ROTATE (buổi 2): `BASEROW_TOKEN`** — token cũ đã chết; token mới verify OK (leaderboard 200, 0 lỗi `ERROR_TOKEN_DOES_NOT_EXIST`). `.env.backup` **đã xoá** (chỉ chứa token chết, gitignored). *(KHÔNG ghi giá trị token vào file này.)*
- **⚠️ CÒN TREO: `BASEROW_USER_PASSWORD` CHƯA rotate.** `docs/archive/MIGRATION_REPORT.md` vẫn còn **password live** (gitignored, giữ tới khi rotate xong). **Rủi ro THẤP**: chỉ trên đĩa local · git history sạch (pickaxe 0 commit) · chưa từng push. Khi rotate: đổi pass Baserow → update `.env` → `docker compose up -d --force-recreate` → verify → xoá `MIGRATION_REPORT.md`.
- **Bài học rotate** (xem 🛠️ BÀI HỌC HẠ TẦNG): đổi `.env` PHẢI `docker compose up -d --force-recreate` — `docker restart` KHÔNG nạp lại env_file.

---

## 🔍 INVESTIGATION 302 LOOP (2026-05-30)

- **Loop `/pets/12/personality` KHÔNG active hiện tại** (sau restart web 09:59 chỉ có 1 hit do curl test).
- **Server hành xử ĐÚNG:** request không session → middleware [`middleware.ts:246`] redirect `302 /login?return_to=…`. Không có bug server-side.
- **Root cause = SW reload loop pattern (3 mảnh ghép):**
  - `sw.js:35` — `install → self.skipWaiting()` (SW mới kích hoạt ngay)
  - `sw.js:50` — `activate → self.clients.claim()` (chiếm quyền mọi tab)
  - `Layout.astro:185-189` — `controllerchange → window.location.reload()` (đổi quyền SW → tự reload)
- **Catalyst:** chạy `astro dev` mode (server tưởng `/sw.js` có bản mới liên tục) + **12 lần bump VERSION** (v184→v196) trong arc redesign → SW liên tục activate → reload.
- **ĐÍNH CHÍNH CONTEXT_SYNC cũ:**
  1. "Spam mỗi 0.5-0.7s" thực ra phần lớn là **bot quét lỗ hổng** (`/.env`, `/wp-includes/...`, `/phpinfo.php`), KHÔNG phải /personality.
  2. Loop /personality thật ~**2.45s**, status 302, **0ms** (redirect rẻ, không render SSR) → **KHÔNG đủ gây Exit 255**. Exit 255 nhiều khả năng do `astro dev` + SSR nặng (personality 2.4-2.8s, pet-score 3.7s) + file-watch restart.
- **Mức độ chắc:** CAO cho "client-side SW loop + server OK"; mắt xích "vì sao tái kích hoạt đều 2.45s" cần repro browser mới khẳng định 100%.

---

## 🛠️ BÀI HỌC HẠ TẦNG (2026-05-30 buổi 2 — QUAN TRỌNG, đọc trước khi deploy/đổi env)

1. **Sửa `.astro`/code → KHÔNG hot-reload** (Docker trên Windows): source mount từ Windows host → **inotify miss qua mount** → Vite không thấy file đổi → serve transform CŨ. **Fix: `docker restart vowvet-web`** (Vite cold-start, đọc lại file từ mount). `sw.js` (static) update ngay; chỉ `.astro` SSR kẹt cache Vite.
2. **Đổi `.env` → `docker restart` KHÔNG nạp env**: `env_file` bake lúc TẠO container (`compose up`); `restart` giữ env cũ. **Fix: `docker compose -f docker/docker-compose.yml up -d --force-recreate vowvet-api vowvet-web`** (recreate = đọc lại `.env`). *(Đã dính lúc rotate token: `docker restart` 2 lần vẫn token cũ → tới khi recreate mới nạp token mới.)*
3. **Phân biệt rõ:** code `.astro` → **`docker restart vowvet-web`** · đổi `.env` → **`docker compose up -d --force-recreate`**. KHÔNG lẫn.

---

## 🚨 TOMORROW PRIORITY QUEUE (cập nhật 2026-05-30 buổi 2 — sau arc TopBar + dashboard)

1. **TopBar Hướng B — phủ toàn app** (đại phẫu, dự án riêng): chuẩn hoá ~45 header sub-page thành component `PageHeader` chung (slot back+title+action) đặt DƯỚI TopBar (global bar + context bar). Đụng 50+ page, mobile 2 thanh, rủi ro cao. Hiện TopBar chỉ ở dashboard (Hướng A — xem 🏛️ Ghi chú kiến trúc ở section 🧭).
2. **Update Hụi Pet stats placeholder** → số thật (1.234+ pet / 2.5M+ điểm / 01/07 khai vận) khi có data BE.
3. **Chuyển `astro dev` → `astro build` production** — dev server đang làm prod (chậm 1-3.7s/req, file-watch restart). Xem `docker/docker-compose.yml` + `docker/web.Dockerfile`. *(Lưu ý: build mode → sửa code phải rebuild, mất cold-start nhanh — cân nhắc trade-off.)*
4. **(Optional) Rotate `BASEROW_USER_PASSWORD`** — xem 🔒 SECURITY (rủi ro thấp, local-only, user tự quản) → xong thì xoá `MIGRATION_REPORT.md`.

**✅ Đã xong buổi 2:** rotate token · xoá `.env.backup` · WOW arc v197-205 (6 commit) · **TopBar v206-207** · **Dashboard WOW v208** · **Color-sync v209** · **Tier-gold v210**. Tổng 8 commit `e1d235d→0f03f15`, chưa push.
**Backlog (chưa ưu tiên):** Fix SW reload loop (`controllerchange→reload` — chưa gây sự cố thực qua nhiều lần bump SW, hạ ưu tiên) · CTA `/hui-pet/register` route · `#ffd56b` cosmetic · Phase 5.2 orbit · dashboard polish (phần còn lại — v208 đã làm ring + hero) · DESIGN.md · M28 Vet Buddy.

---

## 4. BACKLOG (từ phiên redesign — tham khảo, KHÔNG ưu tiên bằng queue trên)

### ✅ ĐÃ XONG phiên 2026-05-30 (không còn là next-step)
1. ~~git init + baseline commit~~ → **DONE** (commit `c1ad2fc`, 478 files). Xem section 🔒 SECURITY AUDIT.
2. ~~Đào root cause `/pets/12/personality` 302 loop~~ → **DONE** (root cause = SW reload pattern). Xem section 🔍 INVESTIGATION 302 LOOP.

### 🟡 HIGH — vẫn còn (xem 🚨 TOMORROW PRIORITY QUEUE cho thứ tự ưu tiên thật)

3. **Polish `dashboard.astro`** (17KB, entry chính của app) apply design language Pet Score đã proven: 
   - Gold-thread `::before` cho main sections
   - Counter pill gold cho stats
   - 2-tone section (sáng/dark luxury)
   - Strict palette gold/white/ink
   - Backwards fill-mode cho stagger animations
   Hiện dashboard plain Tailwind, không đồng bộ với pet-score.

4. **Viết `DESIGN.md`** lock-in 7 patterns đã proven:
   - Section 2-tone (white card vs dark luxury)
   - Gold-thread `::before` connector
   - Counter pill gold + shimmer convention
   - Animation 3-tier (SMIL > WAAPI > CSS) + reduced-motion guard
   - Backwards fill-mode rule (không both)
   - SSR `.map()` pattern cho SVG (né Alpine x-for-in-SVG pitfall)
   - Palette strict + functional exceptions (emoji/slate)
   → File này thành source-of-truth cho mọi page sau (dashboard, settings, food-brands, …).

### 🟢 MEDIUM — backlog
5. **M28 Vet Buddy** (telehealth + primary care) — pending trong `BUILD_PROGRESS.json`. Scope sẵn: 3 tables, 8 mock vets seed, bot triage logic. ~2 ngày work. *(Hoặc thay bằng feature khác user ưu tiên hơn.)*

---

## 5. MEMORY FILES (đọc tiếp khi cần)
- `~/.claude/projects/C--docker-vowvet/memory/MEMORY.md` — index toàn bộ
- `memory/feedback_strict_brief.md` — implement detailed spec verbatim
- `memory/design_wow_animation_playbook.md` — SMIL > WAAPI > CSS 3-tier
- `memory/learning_alpine_scope.md` — Alpine SVG/importNode pitfall (lý do dùng SSR `.map()` cho stars)
- `memory/project_stack.md` — Astro+Bun+Hono+Baserow+R2 conventions
- `memory/user_profile.md` — non-coder owner, prefers being asked when unclear, exhausted by over-engineering

---

## 6. SESSION HEALTH

- **Phases applied (theo thứ tự)**: 1 (setup) → 2 (Hero) → 2-after (fix VV monogram/flourish) → 3 (Achievement) → 4 (Rec) → 4.5 (polish) → 4.5.1 (tweaks) → 5 (Constellation) → 5.1 (galaxy + ticker) → 5.3 (xóa nebula, SKIP 5.2 orbit) → 6 (Trend-Community merge) → 7 (Hụi Pet teaser) → 8 (cleanup tier accordion)
- **Protocol mỗi phase**: plan + diff text → user APPROVE → backup `.phaseN-pre.bak` → Edit tool literal match → 6 checkpoint (backup/size/markers/SW/curl 302/node new Function) → restart vowvet-web → authed render 200 → screenshot user verify → next phase
- **11 backup files** trong scope: `pet-score.astro.{phase2,phase3,phase4,phase45,phase451,phase5,phase51,phase53,phase6,phase7,phase8}-pre.bak`
- **SW version progression**: v184 → v185 → v186 → v187 → v188 → v189 → v190 → v191 → **v193** (skip v192 = Phase 5.2 skipped) → v194 → v195 → **v196** (redesign final) → v197-205 (WOW arc) → v206-208 (TopBar + dashboard wow) → **v209-210** (color-sync + tier-gold; current `vowvet-v210-tier-gold`)
- **File pet-score.astro size**: 26.8KB (v184 start) → 79.1KB (v196 end). Tăng chủ yếu inline CSS các phase + SSR stars data + ticker logic + Hụi Pet teaser.
- **Verification record**: 6/6 checkpoint pass mỗi phase. Authed render `[200] /pets/12/pet-score` verified Phase 2, 5, 5.1, 8 (logs `vowvet-web --tail`).
- **ZERO rollback** cần dùng. Backup mechanism proven nhưng chưa kích hoạt thật.
- **Palette discipline**: 4 lần phát hiện màu lệch (red penalty / purple nebula / navy bg / emerald-red delta) → user enforce strict mỗi lần → tôi flag + override. Cuối phiên: 4/4 color check `#1a1a2e/8b5cf6/rgba(220,38,38)/rgba(16,185,129)` = 0.
- **Lesson lớn**: SSR `.map()` cho SVG là pattern an toàn hơn Alpine `<template x-for>` trong SVG (project memory đã ghi pitfall; Phase 5 áp dụng → curl 302 + 200 confirm).

---

*Cuối CONTEXT_SYNC. Phiên kế tiếp đọc file này TRƯỚC khi đụng `pet-score.astro` hoặc các trang khác cần áp design language.*
