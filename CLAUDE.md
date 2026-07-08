# CLAUDE.md — VowVet / Mon Min Pet

> File này là "trí nhớ phiên" của dự án. Claude Code ĐỌC file này đầu mỗi phiên và TỰ tuân theo.
> Quy ước global ở `~/.claude/CLAUDE.md` vẫn áp dụng; file này GHI ĐÈ khi mâu thuẫn.
> Việc đang dở + số liệu perf từng phiên KHÔNG để ở đây (sẽ cũ nhanh) — xem CONTEXT_SYNC mới nhất.

---

## 0. Vai trò (SAFE MODE — không tự phá vai)
- **Bồ** (Claude tư vấn — claude.ai/ChatGPT): soạn TASK block, trình số, review. KHÔNG thực thi.
- **Claude Code** (agent này): thực thi đúng SCOPE, KHÔNG mở rộng phạm vi.
- **Duy (duytruongphat99)**: duyệt mắt trên browser, quyết định, approve.

→ Claude Code chỉ làm trong **【SCOPE】**. Gặp việc ngoài scope / đụng file cấm → **DỪNG, báo, đợi duyệt**. Không tự quyết.

---

## 1. Stack & vị trí file
- **Stack**: Astro 5 (SSR) · Bun · Alpine.js · Tailwind v4 · Baserow (DB/backend) · Leaflet (map) · Docker trên **Windows server**.
- **Domain**: `vowvet.monminpet.com` — **LOCAL-ONLY, CHƯA push GitHub**.
- **Container**: `vowvet-web` (Astro SSR) · `vowvet-api`.
- **Đường dẫn chính**:
  - `web/src/pages/…` — trang (`pets/[id].astro`, `pets/[id]/pet-score.astro`, `food-brands.astro`, `pets/new` wizard, `dev/reset-onboarding`…)
  - **Logic dinh dưỡng (DER/RER/gram) — CẤM, xem §4**: `shared/nutrition-engine.ts` **(engine, CANONICAL)** + `api/src/lib/nutrition.ts` (DB/cache) + `api/src/routes/nutrition.ts` (HTTP) + DER client-side & hằng **DRY 360 / WET 85** ở `web/src/pages/food-brands.astro`
  - `web/src/lib/…` — helper FE (`breeds.ts`, `age.ts`, `api-client.ts`, `articles.ts`)
  - `shared/health-conditions.ts` — 18 tình trạng × 3 tầng
  - `api/src/lib/me-cache.ts` + cache middleware đăng ký ở `api/src/index.ts` — cache per-user (TTL 20s, bust khi ghi)
  - `web/src/middleware.ts` — Astro middleware (guard onboarding)
  - `web/public/sw.js` — service worker (bump version mỗi release)
  - `docker/docker-compose.yml`
  - `baserow-config.json` — **gitignored** (field IDs local). Migration script thì **committed**.
- **Account test**:
  - pet **"min" id 12** (user **10**) — Mèo Anh lông ngắn, 4.5kg, đã triệt sản, ~2 tuổi.
  - `lyvu2004DTP@gmail.com` (user **18**, Google OAuth) — gmail test dùng vô hạn nhờ `/dev/reset-onboarding`.

---

## 2. 【SAU】 — Nghi thức kết thúc MỌI task (làm đủ, đúng thứ tự)
1. **Web (SSR prod)**: sửa `.astro` → **KHÔNG chỉ `restart`** (prod chạy `dist` baked trong image, `restart` nạp lại bản build cũ). Phải **rebuild image**:
   `docker compose -f docker/docker-compose.yml up -d --build vowvet-web`
   → **API** (`--watch`): sửa `.ts` → **hot-reload tự động**, không cần restart. → **Static/public** (sw.js, ảnh): **live ngay** qua mount, không cần gì.
2. Có sửa `<script is:inline>` → `node --check` từng file. Inline script = **JS THUẦN**, không TS (vd `as number[]` → Alpine SyntaxError).
3. **Bump SW version** `vXXX` trong `web/public/sw.js` (để qua cache PWA).
4. Verify thật: trang cần login → mint session cookie, mở `localhost:4322`, **chụp/đo DOM thật + console SẠCH**. KHÔNG đoán "browser sẽ đúng".
5. Commit **LOCAL** (xem §3). **KHÔNG push** nếu chưa được bảo.

---

## 3. Version + Commit
- **SW**: mỗi release UI bump `vXXX` (tăng dần).
- **Commit msg**: conventional + đuôi version → `type: mô tả (vXXX)`
  (vd `perf: cache+parallelize loading + skeleton mượt mobile (v276)`).
- **Co-author**: `Claude Opus 4.8 (1M context)`.
- **LOCAL ONLY** — không `git push` trừ khi Duy yêu cầu. **Secret-scan** trước mỗi commit.

---

## 4. FILE / VÙNG CẤM ĐỤNG (ngoài global)
- **MỌI logic DER/RER/gram/hệ số ở BẤT KỲ file nào** — engine `shared/nutrition-engine.ts` + DER client-side & hằng `DRY 360`/`WET 85` ở `web/src/pages/food-brands.astro` + field `daily_calorie_target` do `scripts/migrate-m7.ts` ghi (+ nước/treat). Chỉ sửa khi có TASK riêng + **Bồ DUYỆT SỐ CŨ→MỚI từng dòng**.
- **DER có 3 nguồn lịch sử** (engine / food-brands client / migrate field) — **ENGINE `shared/nutrition-engine.ts` là CHÂN LÝ**; chỗ khác phải gọi về engine, **KHÔNG tự tính song song**.
- **Schema Baserow**: muốn thêm/đổi field → BƯỚC 0 recon → **ĐỀ XUẤT field → ĐỢI duyệt** mới tạo. Không tự thêm cột.

---

## 5. NGUYÊN TẮC CỐT LÕI (vi phạm = hỏng niềm tin)
1. **TRUNG THỰC NHÃN**: nhãn UI = đúng cái backend chạy.
   Backend AI hiện chạy **Gemini** ở nhiều endpoint (care-plan, bcs-vision, birthday, voice-diary, triage, lost-pet-vision, bills, analytics…) → UI ghi **"AI của VowVet" / "AI phân tích"** (trung tính, KHÔNG lộ nhà cung cấp, **KHÔNG ghi "Claude"**).
   Tính năng chạy **Google-search / thị trường → KHÔNG được gắn nhãn "AI"** (vd nút food-brands là *"Tìm trên thị trường"*, không phải *"Tìm bằng AI"*).
2. **KHÔNG đụng số khẩu phần** khi chưa duyệt (§4).
3. **Đụng schema Baserow** phải báo + đợi duyệt (§4).
4. **VERIFY không ĐOÁN** (§2.4).
5. **"Profile = thuốc"**: user khai sai hồ sơ → kết quả sai là do user, không phải app. App chỉ cần đúng theo dữ liệu đã khai + luôn ghi *"điểm khởi đầu, theo dõi cân + hỏi bác sĩ"*.

---

## 6. Docker / Windows (bẫy hay quên)
- `.astro` đổi → **rebuild** `vowvet-web` (`docker compose -f docker/docker-compose.yml up -d --build vowvet-web`) — KHÔNG phải `restart` (§2.1).
- `.env` đổi → `docker compose -f docker/docker-compose.yml up -d --force-recreate vowvet-api vowvet-web`.
  **`docker restart` KHÔNG nạp lại `.env`** (env baked lúc tạo container).
- File tĩnh (sw.js, ảnh) đọc từ disk mỗi request → cập nhật ngay, không cần restart.

---

## 7. Kiến trúc hiệu năng (giữ "sàn" này)
- **Cache per-user**: `me-cache.ts` + `middleware/index.ts`, **TTL 20s**, **bust khi ghi** (tránh stale lúc verify).
- **Sàn Baserow ~1.3s/query** (cố định: Baserow recompute formula/lookup bảng pets bất kể số field → slim query VÔ DỤNG). Cách duy nhất nhanh hơn = **song song hóa fetch SSR bằng `Promise.all`**, không phải cắt field.
- **Perceived perf**: **skeleton screen + hiện dần** (mobile hay "đứng hình rồi bụp"). Skeleton phải reduced-motion safe.
- **Báo cáo perf**: luôn kèm **bảng TTFB trước/sau** + **honest** (nói rõ cache lạnh vẫn 3–4s).
- Mốc hiện tại (v276, HEAD `e4c8bd1`): dashboard 6.2→1.53s · /pets/12 6.5→1.59s.

---

## 8. Bẫy Baserow
- **Pagination**: dùng `size=200` (mặc định nhỏ → dễ thiếu rows).
- **link_row**: field link trả/nhận theo format riêng (mảng row IDs) — verify trước khi ghi.
- **Tọa độ**: Baserow giới hạn **6 chữ số thập phân**. OSM trả 7 số → phải `round6()` trước khi ghi (không thì 500).
- **single_select**: thêm giá trị mới → phải **thêm option trong Baserow UI trước**, không thì insert trả **HTTP 400**.
- `pets` table id **636**.

---

## 9. Design tokens (brand MMP)
- **Màu**: cream `rgb(250,246,238)` (`#FAF6EC`) · gold-bright `#ecb921` · gold-deep `#B48608` · ink `#0a0a0a` · brown phụ `#8b6f47`.
- **⚠️ Contrast**: gold `#ecb921` **KHÔNG** làm chữ trên nền trắng/cream (~1.9:1, fail). Chỉ dùng nền/viền/thanh/icon-fill. **Chữ chính = ink**, **chữ phụ = brown**.
- **Màu semantic (A-policy)**: emerald/green = success, sky/blue = info/health — **HỢP LỆ** cho TRẠNG THÁI LÂM SÀNG/SEMANTIC (đạt chuẩn, info sức khoẻ, cảnh báo nhẹ) ở **toàn app NGOÀI pet-detail**. Khớp token `--color-vv-success #10b981` / `--color-vv-info #2563eb` (`global.css`).
- **Pet-detail + care-plan tab = MONOCHROME** gold/ink — giữ override `.pet-detail-tabs` (`global.css`), KHÔNG dùng màu semantic trong scope này.
- **Vẫn CẤM**: purple / navy; màu dùng để **TRANG TRÍ** (không mang nghĩa trạng thái); **gradient màu**; >1 gold/viewport. **Đỏ** chỉ cho banner cảnh báo Tầng-3 + nút xóa.
- **Decisions log (2026-06-08)**: hợp thức hoá semantic màu ngoài pet-detail (A-policy) — align với token `global.css`; pet-detail giữ monochrome.
- **Font**: Fraunces *italic* (display) · Inter (body) · Azeret Mono (số) · Dancing Script việt-hoá (chữ ký certificate).
- **Icon**: line-art Lucide-style (viewBox 24, stroke `currentColor` 1.5), KHÔNG emoji.
- **Animation**: BẮT BUỘC **reduced-motion 2 lớp** — CSS `@media (prefers-reduced-motion)` + JS `matchMedia`.

---

## 10. Format TASK Bồ giao (để Claude Code đoán đúng ý)

```
TASK     : <mục tiêu 1 câu>
SCOPE    : <file/khu vực CHỈ ĐƯỢC đụng>
CẤM ĐỤNG : <file/khu vực cấm — luôn gồm nutrition.ts + schema Baserow>
YÊU CẦU  : 1) … 2) … 3) …
SAU      : restart → node --check → bump SW vXXX → verify console sạch → commit local
LƯU Ý    : <bẫy / điều kiện biên>
```

---

## 11. Backup
- Bundle off-machine: `git bundle --all` → `C:\docker\backups\vowvet-<YYYYMMDD-HHMM>.bundle` → verify + clone-test → kéo lên cloud.
- Tạo bundle mới mỗi mốc lớn (release / nhiều commit).
