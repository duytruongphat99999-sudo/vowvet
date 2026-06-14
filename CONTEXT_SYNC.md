# CONTEXT SYNC — 2026-06-14 (Chủ Nhật, 10:26)

> Handoff MỚI NHẤT — arc "scan result: cụm phân tích theo hồ sơ + fix nút Quét lại".
> Bản 2026-06-13 (UX track ① scan result) là nền ngay trước. `docs/CONTEXT_SYNC.md` = nền 2026-06-08.
> STATE: HEAD `8cacecc` (172 commit) — **TẤT CẢ việc phiên này + 2 phiên trước UNCOMMITTED**, CHƯA deploy lên domain, CHƯA verify phone.
> SW tay đã bump tới **`v307-rescan-cta`** (v304→305→306→307 trong phiên này). Repo **LOCAL-ONLY, KHÔNG remote**.

## 🎯 ĐANG LÀM GÌ
Hoàn thiện "mặt tiền" trang quét nhãn `/scan/result`: (1) cụm "phân tích sản phẩm theo hồ sơ bé" — điểm độ-khớp **rule-based** (không để Gemini chấm), khớp/chưa-khớp, box ⭐ thành phần, box độc, liều-từ-nhãn; (2) vá bug nút "Quét lại" không mở camera (route về profile) → quét-lại **tại chỗ** trên /scan/result giữ user-gesture. Tất cả KHUNG/UX + data — KHÔNG đụng công thức dinh dưỡng, KHÔNG đụng prompt verdict/analysis của Gemini.

## ✅ ĐÃ XONG PHIÊN NÀY (UNCOMMITTED — chờ bật billing + eyeball phone)

### A) Cụm "phân tích theo hồ sơ bé" (5 phần) — rule-based, KHÔNG để LLM chế
- **`web/src/data/vet-flags.ts`** (MỚI): data thuần JSON-safe — `TOXIC_FLAGS` (8 chung: chocolate/allium/nho/xylitol/cồn/caffeine/bột nở/macadamia + 6 riêng mèo: permethrin/paracetamol/ibuprofen/aspirin/tinh dầu/lily), `PRAISE_FLAGS` (S.boulardii placeholder "lợi khuẩn hỗ trợ tiêu hóa" — KHÔNG "đặc trị"), `SCORE_RUBRIC` (loài −3 / tuổi −2 / dị ứng −3 / bột rời −1 / thiếu info −1 / sàn 1 / **toxicForcesFloor=true** → dính độc ép điểm về 1). Comment VN, Duy sửa số/thêm dòng không đụng logic.
- **`api/src/lib/food-label-vision.ts`**: +field OCR `feeding_guide` (interface + prompt CHÉP NGUYÊN VĂN khối liều/khẩu phần, TUYỆT ĐỐI không tự tính + parse `str().slice(0,1200)` + thêm vào `hasAnyField`).
- **`api/src/routes/food-scan.ts`**: +`profile` slim (name/speciesEn/speciesVi/lifeStage/dob/weightKg) vào response JSON — CHỈ ĐỌC, KHÔNG đụng carb/ash. `feeding_guide` tự theo `ocr`.
- **`web/src/components/ScanResultCard.astro`**: inject vet-flags qua `<script type="application/json" id="vv-vet-flags" set:html>` (inline widget = JS thuần không import được TS → đọc qua id lúc init). Getters mới: `vetFlags/_vfNorm/_vfText/_vfMatch/vetFlagWarnings/clientDanger/anyDanger/vetStars/_petStage/_labelStage/_stageVi/rubric/_looseForm/verdictLines`. Render: điểm rule-based + "Khớp/Chưa khớp ở chỗ…" + câu chốt cố định *"Đây là phân tích để tham khảo — quyết định dùng hay không nên hỏi bác sĩ thú y."*; box ⭐ (nền vàng nhạt viền gold); box độc đỏ/vàng (dedupe vs box vet-approved kbWarnings, chất riêng mèo chỉ hiện khi bé là mèo); mục 💊 liều verbatim + cân bé. **GỠ** score+conclusion của Gemini (giữ scenarios/insights/tips/watch làm phần bổ sung); `verdictLines` lọc dòng "Tổng thể… phù hợp" cũ; gating `anyDanger` ẩn phân tích/CTA/khen cạnh box độc.
- SW v304 → v305-scan-profile-match.

### B) RECON bug nút "Quét lại" (chỉ điều tra, không sửa)
- Kết luận **(C)**: 3 nút "Quét lại" đều route `/pets/[id]?scan=1` → handler [id].astro:222 CHỈ đổi tab + scroll tới `#food-scan`, **chưa bao giờ auto-mở camera**. Camera = native `<label for>` bọc `<input capture>` (id].astro:1673). Cú `.click()` mở picker cũ nằm ở `reset()` mồ côi (đợt refactor A2 bỏ rơi). KHÔNG phải lỗi handler chết (A) hay TASK B làm lệch (B).

### C) Fix "Quét lại" tại chỗ (Hướng 1) — native label-for giữ user-gesture
- **`web/src/pages/scan/result.astro`**: +input ẩn `#vv-rescan-input` (`accept="image/*" capture="environment"`, `@change="onRescanPick"`) đặt NGOÀI mọi `x-if`; 2 nút error-state + empty-state đổi `<a href=?scan=1>` → `<label for="vv-rescan-input">`.
- **`web/src/components/ScanResultCard.astro`**: +method `onRescanPick($event)` (tái dùng nav-first TASK B: `scanFilePut` IDB → `?pending=1`; fallback IDB lỗi → route `?scan=1`); 2 nút fail-state + isNonFood đổi button → label-for.
- SW v305 → v306-rescan-inplace.

### D) Nút "Quét lại" thứ 5 (CTA row khi quét thành công)
- **`web/src/components/ScanResultCard.astro`**: loop `visibleCtas` tách trong `<span class="contents">` — `c.action==='rescan'` → `<label for="vv-rescan-input">`, CTA khác GIỮ NGUYÊN `<button @click="runCta">`. Class/`:class` copy y cũ.
- SW v306 → v307-rescan-cta. → cả **5 nút Quét lại** giờ dùng 1 cơ chế label-for tại chỗ.

## 🚧 ĐANG DỞ
- **KHÔNG có việc dở code** — mọi task xong, `node --check` inline OK, build PASS (web+api), container healthy, log sạch.
- "Dở" thật = **CHƯA verify trên phone** (camera iOS Safari + output scan thật) vì:
  - **Gemini billing OFF** → OCR + pass-2 đều 429 free-tier → KHÔNG dựng được kết quả scan thật ở local.
  - **localhost:4322 KHÔNG route /api** → luồng scan (IDB + /api + R2) chỉ chạy trên domain/phone.

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **Bật billing Gemini** (việc tay Duy) → mở quota OCR + pass-2 analysis → mới thấy được cụm 5-phần đầy đủ.
2. **Eyeball phone toàn luồng** sau khi billing bật:
   - Quét nhãn thật → điểm rule-based + Khớp/Chưa-khớp + câu chốt cố định hiện đúng; box ⭐ chỉ khi có chất trong PRAISE_FLAGS; box độc đỏ khi trúng TOXIC_FLAGS (thử nhãn có "tỏi/chocolate"); mục 💊 liều khi nhãn có bảng liều.
   - **Soi kỹ (note Duy):** 4 mục phụ Gemini (🎯/🔍/💡/🛡️) có lọt chữ "phù hợp/nên dùng" không (pet khoẻ) → nếu có, hú để gỡ luôn (ngoài scope đã làm).
   - **5 nút "Quét lại"** (error/empty/fail/isNonFood + CTA-success): bấm → mở camera NGAY trên /scan/result (KHÔNG nhảy profile), chọn ảnh → spinner pending → kết quả mới.
3. **Gate (c) verbatim OCR** (nợ từ phiên trước): ảnh mặt sau bao Fera → `tmp/bao-hat.jpg` → curl pet 12 đọc `raw_ingredients` đủ-6-chủng → PASS mới đủ điều kiện commit OCR.
4. **Gộp commit** toàn bộ (cụm phân tích + feeding_guide + fix Quét lại + việc 2 phiên trước) khi phone xanh. Co-author `Claude Opus 4.8 (1M context)`. Secret-scan trước.
5. **Dọn dead-code** (TASK riêng, đừng xoá lung tung): nhánh `if (c.action==='rescan')` trong `runCta` giờ KHÔNG còn caller (5 nút đã thành label) = dead-code; `reset()` trong ScanResultCard (có `input.click()` cũ) cũng mồ côi từ A2. Để lại, dọn sau.
6. **Phiên nâng prompt 6-ý** (BS Thục Đoan duyệt): wording S.boulardii chuẩn, "lý do trừ điểm" tinh, polish Key Specs.
7. **Perf 3 trang chậm** (recon xong phiên trước, chưa sửa): dashboard 7-10s, /pets/[id] +1.3s, SW network-first. → TASK riêng.
8. **② Discovery quest → Lost Pet V1** · **⑤ GPS slot** (/map + đổi label).

## 📌 QUYẾT ĐỊNH KỸ THUẬT ĐÃ CHỐT
- **Điểm chấm = RULE-BASED trong code client** (KHÔNG để Gemini chấm). Lý do: rubric deterministic → Gemini không thể chế lý do trừ điểm (note 2 Duy); KHÔNG cần sửa `scan-analysis.ts` (file cấm). Dị ứng tái dùng kết quả match server (`verdict.flags.allergens`), KHÔNG tự match lại client (allergen-normalizer cấm).
- **Toxic → ép điểm về sàn 1** (không phải −4): 6/10 mà dính độc phản trực giác. Số ở `SCORE_RUBRIC.toxicForcesFloor`.
- **vet-flags vs danger_kb**: gộp 1 kiểu box đỏ, **dedupe** trùng chất. vet-flags = lớp đang chạy NGAY (danger_kb còn chờ BS duyệt). Box vet-flags ghi attribution KHÁC ("dựa trên thành phần đọc được", KHÔNG mạo nhận BS duyệt).
- **Liều (5) = đọc verbatim feeding_guide, KHÔNG auto-tính khoảng theo cân** (né mìn 1). Hiện bảng liều + cân bé, con sen tự đối chiếu. Thiếu → "bao bì không ghi liều, hỏi bác sĩ".
- **vet-flags nạp client qua `<script type=application/json>` + đọc theo id** (KHÔNG import): inline widget là JS thuần. Matcher: từ-khoá 1 chữ khớp theo TOKEN (Set words) để tránh FP ("ghee"≠"hẹ", "the"≠"hẹ"); nhiều chữ khớp substring.
- **Quét lại = native `label-for`, CẤM JS `.click()`**: file dialog cần user-gesture trên CHÍNH trang; `.click()` sau nav bị nuốt. 1 input ẩn chung `#vv-rescan-input` đặt ở result.astro NGOÀI `x-if` (ScanResultCard wrap trong `x-if="result"` nên không để input trong đó được). onRescanPick tái dùng nav-first TASK B, không viết lại submit.
- **CTA loop tách bằng `<span class="contents">`** (giữ flex layout + thứ tự): rescan→label, khác→button. KHÔNG sửa `scan-verdict.ts` (server vẫn đẩy CTA y cũ, chỉ đổi render client).

## ⚠️ LƯU Ý / CẠM BẪY
### Vận hành (giữ nguyên các phiên trước)
- **Web = PROD BUILD**: sửa `.astro` → `docker compose -f docker/docker-compose.yml up -d --build vowvet-web` (restart suông VÔ DỤNG). `.env` đổi → `up -d --force-recreate`.
- `up -d --build vowvet-web` đôi khi recreate luôn container `vowvet-api` (cùng project) — KHÔNG rebuild api, vô hại.
- **localhost:4322 KHÔNG route /api** → eyeball local vô dụng cho luồng scan. Verify trên domain/phone.
- **Gemini free tier 20 req/NGÀY** chung mọi feature; mỗi scan đốt 2 call (OCR+analysis) → ~10 scan/ngày cạn. Phải bật billing mới test đủ.
- **`node --check` inline `.astro`**: regex phải anchor `/^<script is:inline>/m` (đầu dòng) — comment frontmatter nhắc chuỗi "<script is:inline>" sẽ false-match nếu không anchor. (Đã dính lần này, đã xử.)
- `jimp` ở **api/node_modules** (workspace), không root.

### FILE CẤM ĐỤNG (nguyên trạng)
- `nutrition-engine.ts`/nutrition* + công thức RER/DER/carb/ash trong `food-scan.ts` · `scan-verdict.ts` (READ) · `scan-analysis.ts` prompt+validator · `allergen-normalizer.ts` · `health-conditions.ts` vocab · `global.css` · schema Baserow ngoài `danger_kb` · `.env` · `sw.js` (artifact, bump qua nguồn) · `scan-handoff.js` (cache-first serve bản cũ — chỉ GỌI scanFilePut/scanFileTake).
- **TASK B nguyên văn**: `foodScanLauncher.submit()` nav-first ([id].astro:2941-2952), `onPick` launcher (2932), handler `?scan=1` (222) — Duy chưa verify B vì 429, KHÔNG được sửa lén (sẽ lẫn bug B với task mới).
- **Block 5-mục/Key Specs/CTA Task A + cụm phân tích/điểm/box độc/box sao/liều vừa làm = chỉ THÊM, KHÔNG phá.**

### 3 MÌN PROMPT — ĐÓNG BĂNG, chờ BS Thục Đoan duyệt
- MÌN 1 liều-theo-cân: KHÔNG để AI tự tính liều, chỉ đọc liều TỪ NHÃN.
- MÌN 2 medical claim: KHÔNG overclaim "đặc trị" cho OTC.
- MÌN 3 logic chấm điểm: điểm rule-based đã giải quyết phần này (code chấm, không LLM); chỉ HIỂN THỊ, lý do lấy ĐÚNG rubric.

## 📂 FILE QUAN TRỌNG ĐÃ ĐỤNG (phiên này, UNCOMMITTED)
- `web/src/data/vet-flags.ts` — **MỚI**: bảng độc + câu-khen + rubric (data thuần, Duy/BS sửa số).
- `web/src/components/ScanResultCard.astro` — render kết quả: cụm phân tích rule-based (điểm/khớp-chưa-khớp/box sao/box độc/liều) + onRescanPick + 4 nút Quét lại → label-for + CTA loop tách rescan.
- `web/src/pages/scan/result.astro` — +input ẩn `#vv-rescan-input` + 2 nút error/empty → label-for.
- `api/src/lib/food-label-vision.ts` — +field OCR `feeding_guide` (verbatim, không tính).
- `api/src/routes/food-scan.ts` — +`profile` slim vào response (read-only; carb/ash NGUYÊN TRẠNG).
- `web/public/sw.js` — VERSION v304 → **v307-rescan-cta**.
