# CONTEXT SYNC — 2026-07-16 21:00

## 🎯 ĐANG LÀM GÌ
Khép kín **vòng foster cho user Zalo-thuần** (không email/phone): đăng ký sạch không ép tạo bé (v344) → tự lấy link định danh (v346) → được trao bé qua link (v345). CẢ 3 EPIC XONG HẲN: code + verify HTTP + eyeball tunnel PASS + **PR #15 MERGED vào main**. Song song: vụ chat "phải F5 / gửi không ai thấy" ĐÃ ĐIỀU TRA XONG (survey read-only 16/07) — **KHÔNG PHẢI BUG**, là test bằng 2 nick Zalo khác nhau; còn mở 1 lượt test nút "Nhắn tin" /direct + polling tunnel.

## ✅ ĐÃ XONG PHIÊN NÀY
- **v344 Foster onboarding** (commit `20d15a9`, verify HTTP 21/21):
  - `api/src/routes/auth.ts` — **GATE FIX mấu chốt**: `/me` cũ tính `is_onboarded = pets.length>0` rồi ký lại cookie mỗi lần gọi → đá foster 0-bé về /onboarding. Sửa thành `pets.length>0 || onboarded===true` + thêm `is_foster_carer` vào payload.
  - `api/src/routes/users.ts` + `api/src/lib/users.ts` — endpoint `POST /users/onboard-foster` (guard onboarded=false → 409, set `onboarded`+`is_foster_carer`, re-sign cookie, KHÔNG tạo pet) + helper `markOnboardedAsFoster`.
  - `web/src/pages/onboarding.astro` — 2 lựa chọn: "Tôi có bé" → /pets/new cũ · "Tôi nhận foster" → endpoint → dashboard.
  - `web/src/pages/dashboard.astro` — empty-state branch theo `is_foster_carer`. `web/src/lib/api-client.ts` — type. SW v344.
- **v345 Trao bé đa-định-danh** (commit `4bc88ee`, verify HTTP 14/14):
  - `api/src/routes/pets.ts` — `/transfer` resolve recipient: email → link `/heroes/profile/<id>` → link slug → phone → userId số. Helper `heroUserIdFromLink`/`heroSlugFromLink` **anchor domain monminpet.com/localhost** (chống parse số bừa/domain giả hậu tố — 6/6 input xấu bị chặn khi verify). Cover user Zalo-thuần làm recipient.
  - `web/src/pages/pets/[id].astro` — nới `transferNext()` client (server mới là chốt validate) + placeholder/hint modal. SW v345. KHÔNG đụng `foster-transfer.ts`.
- **v346 Nút chia sẻ link nhận bé** (commit `a44dea5`, verify HTTP 9/9):
  - `web/src/pages/dashboard.astro` — empty-state foster thêm nút "Chia sẻ để nhận bé" (copy link `/heroes/profile/<id mình>`) + **fallback ô text** (webview Zalo hay chặn clipboard). KHÔNG cần đụng auth.ts (`user.id` có sẵn trong /me). SW v346.
- **Ops**: 4 commit push nhánh `feat/foster-zalo-flow` → **PR #15 MERGED vào main (`23a9b9a`)**: `d50eb1e` + `20d15a9` + `4bc88ee` + `a44dea5`.
- **Ops**: Eyeball tunnel PASS (Duy xác nhận): Google + Zalo, trao bé, thu hồi bé, nhắn tin, admin chen ngang xử lý — DONE hết.
- **Survey gate profile + vá**: tìm ra gate `public_profile_enabled` chặn nút "Nhắn tin" + link v346 → **PR #16** (`fix(foster): bật public_profile_enabled khi set is_foster_carer`) — CHƯA merge, xem ĐANG DỞ.
- **Điều tra vụ chat "F5 mới thấy tin"** (read-only → kết luận KHÔNG PHẢI BUG, xem ĐANG DỞ).
- **Recon định vị pet** (trả lời câu hỏi): CHỈ có lost-pet network (last-seen + sightings + QR collar in giấy + OSM/Leaflet + Haversine). KHÔNG có GPS tracker/real-time — muốn có phải tích hợp phần cứng mới.

## 🚧 ĐANG DỞ
- **Vụ "chat phải F5" — ĐÃ ĐIỀU TRA, KHÔNG PHẢI BUG (16/07, survey read-only).**
  - Triệu chứng "gửi được, 2 bên không nhận" = test bằng 2 nick Zalo KHÁC NHAU: bé trao 14/07 cho u30 "Duy Trường Phát" (zalo 8904438…); browser B hôm nay login ra u49 "Lê Minh Duy" (zalo 5135739…, tạo mới 13:54:46) → u49 không có foster conv → gõ vào phòng Admin #24. Không tin nào lạc phòng, không tin nào mất.
  - Server + client + SW đều sạch: msg 22 có thật trong Baserow; u27 GET conv 22 → 200; POST /message throw mọi non-2xx (`shared/baserow.ts:61-63`), không nuốt lỗi; GET lọc field số thường (không link_row); SSR + poll chung 1 route; cache 20s (`api/src/index.ts:100`) không phủ /conversations.
  - Admin = u24 (vowvet.monminpet99@gmail.com). u27 KHÔNG phải admin.
  - **BUG GATE TÌM RA khi test (16/07 22:29, ảnh eyeball)**: `/heroes/profile/<id>` trả 404 "Profile riêng tư hoặc không tồn tại" với MỌI người lạ (kể cả login) vì `public_profile_enabled=false` mặc định Baserow — chỉ hero act ĐẦU TIÊN bật (`pet-heroes.ts:192`), foster act KHÔNG bật → foster private vĩnh viễn → nút "Nhắn tin" (dòng 104, SAU gate dòng 27) chết từ khai sinh + link v346 "Chia sẻ để nhận bé" phát link 404. **ĐÃ VÁ — PR #16** (`auto/foster-public-profile`, 2 chỗ: `markOnboardedAsFoster` + `POST /pets/foster/toggle` ON; OFF không tắt public; verify 6/6 + verifier PASS). Sau merge: (a) backfill TAY u30+u49 bật `public_profile_enabled` Baserow UI, (b) `git checkout main && git pull && docker restart vowvet-api`, (c) chạy lại lượt test 3 bước: A(u27) → /heroes/profile/49 → Nhắn tin → B(u49) trả lời → A đợi 10s không F5 (đóng nốt nút /direct + polling tunnel).
  - Script recon read-only còn để ở `data/api/_recon_chat*.ts` (chạy: `MSYS_NO_PATHCONV=1 docker exec -w /app/api vowvet-api bun run /app/data/_recon_chat4.ts`) — untracked, KHÔNG commit.

## ⚠️ BẪY MỚI (chưa vá)
- **Mỗi transfer đẻ conversation MỚI cho cùng cặp user** (context_id = handover_id mới). Cặp 35↔37 đang có 3 conv: #11,12,15. Hiện 17 foster conv. Về sau sẽ tạo ĐÚNG triệu chứng "nhắn không thấy": A ở phòng cũ, B ở phòng mới. Cần findOrCreate theo CẶP USER thay vì theo handover.
- **Test bằng nhiều nick Zalo** → nick Zalo app-scoped, tên khác nhau = TK khác nhau thật. Trước khi kết luận bug chat: query user + conversation của nick đang cầm TRƯỚC.
- **"Thu hồi bé" (`foster-reclaim.ts:107-111`) XOÁ handover + hero_act + trừ foster_acts_count** → conv foster cũ trỏ `context_id` vào handover đã xoá (conv #7→17, #22→31 đang dangling); `POST /conversations/foster` với handover_id đó sẽ 404. Foster act ghi ĐÚNG (đối chiếu u33=1/1, u35=6/6, u39=6/6 khớp handovers) — u27=0 là do reclaim, KHÔNG phải bug ghi.

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **Đóng vụ chat**: merge PR #16 → backfill tay u30+u49 (`public_profile_enabled` Baserow UI) → `git checkout main && git pull && docker restart vowvet-api` → lượt test 2 phút trên tunnel: A(u27) → `/heroes/profile/49` → bấm "Nhắn tin" → gửi "test 1" · B(u49) mở /messages xem có phòng direct mới không · B trả lời "test 2" → A đợi 10s KHÔNG F5 (tin tự hiện = polling tunnel OK). Xong lượt này là đóng cả nút /direct lẫn câu polling gốc.
2. **(đã ghi nợ v346)** Nút share-link cho foster ĐÃ nhận ≥1 bé (hiện chỉ ở empty-state → nhận bé xong là mất nút). Đặt ở hồ sơ `[userId].astro` hoặc settings.
3. (tồn cũ) Zalo ZNS (OTP/notify thật) · chặn hẳn phone-OTP backend (HỎI trước — đụng auth).

## 📌 QUYẾT ĐỊNH KỸ THUẬT ĐÃ CHỐT
- **Gate onboarding nằm ở `/me`** (`auth.ts` ~212): `is_onboarded = pets.length>0 || onboarded===true`. Mọi login endpoint ĐÃ dùng `getIsOnboarded` (đọc field `onboarded`) từ trước → fix 1 dòng /me là mắt xích thiếu duy nhất. Middleware chỉ đọc cookie, KHÔNG tự tính.
- **Foster = 2 field boolean có sẵn** (`onboarded` + `is_foster_carer`), KHÔNG đẻ "loại tài khoản", KHÔNG đụng schema Baserow.
- **Transfer đa-định-danh**: client chỉ nới validation "cho đi tiếp", **server là chốt chặn thật** (regex chặt + anchor domain). **userId-số là đường chính** (chạy bất kể public toggle); slug là phụ (`getHeroProfileBySlug` trả null khi hồ sơ tắt public). Bỏ hướng mã VOW-xxxx (đụng schema).
- **Link tuyệt đối công khai ở web SSR**: dùng **`Astro.site`** (`https://vowvet.monminpet.com` khai ở `astro.config.mjs:6`), **KHÔNG** `Astro.url.origin` (sau proxy trả `http://localhost` → link hỏng). Đã dính bẫy này 2 lần.
- **Chat server ĐÚNG** (đã chứng minh bằng diagnostic) — mọi bản vá chat sau này nhắm CLIENT/môi trường, đừng mò lại server.

## ⚠️ LƯU Ý / CẠM BẪY
- **Web prod KHÔNG proxy `/api`** → mọi client-fetch `/api/v1/*` ở localhost:4322 trả 404 (login, poll chat, nút foster...). Chỉ tunnel `vowvet.monminpet.com` mới proxy. → **verify local = HTTP-in-container**: viết script bun vào `data/api/` (mount `/app/data`), chạy `MSYS_NO_PATHCONV=1 docker exec -w /app/api vowvet-api bun run /app/data/_x.ts` (`-w` để resolve `@shared`); web nội bộ = `http://vowvet-web:4321`. Eyeball tận mắt = trên tunnel.
- **Mint cookie test cho user Zalo-thuần PHẢI kèm `zalo_user_id`** — `verifySession` đòi phone/email/zalo, thiếu → 401 trông như regression (dính 2 lần).
- **User test throwaway: dùng identity MỚI mỗi lần chạy** — user vừa soft-delete gây USER_NOT_FOUND/redirect loop (u18 lyvu2004DTP ĐÃ soft-delete, đừng dùng lại).
- **guard.sh**: chặn `rm -f`, `cat >` heredoc (dùng Write tool), node/bun chạy file trong tmp/scratch (node --check → để file ở repo root rồi `rm` thường), lệnh ghép pipe dính interpreter. verify.sh chạy đúng dạng `bash .claude/scripts/verify.sh` (relative, cwd=root). **require-verify.sh chặn commit nếu file sửa SAU verify cuối** → sửa gì thêm là phải chạy lại verify.sh trước commit.
- **Nhánh `feat/foster-zalo-flow` ĐÃ MERGED (PR #15)** — đừng commit lên nhánh đó nữa; local sync bằng `git checkout main && git pull`. Main cấm push thẳng.
- Sửa `.astro`/`shared/*` → **rebuild** `docker compose -f docker/docker-compose.yml up -d --build vowvet-web` (không chỉ restart); sửa `api/src/*.ts` → `docker restart vowvet-api`; đổi `.env` → `--force-recreate`.
- **CẤM đụng**: nutrition engine (`shared/nutrition-engine.ts` + DER client food-brands), schema Baserow (field/option mới phải duyệt), `/chat` telehealth (`api/src/lib/chat.ts` — hệ RIÊNG, khác `conversations.ts` foster/support), `.env`, `.claude/scripts/*`.
- Baserow: toạ độ round6 · single_select thêm option phải làm ở UI trước · pagination `size=200` · pets table id 636.

## 📂 FILE QUAN TRỌNG ĐÃ ĐỤNG
- `api/src/routes/auth.ts`: gate `/me` is_onboarded (dòng ~212) + `is_foster_carer`/`id` trong payload
- `api/src/routes/users.ts`: endpoint `POST /users/onboard-foster` (cạnh complete-onboarding)
- `api/src/lib/users.ts`: helper `markOnboardedAsFoster`
- `api/src/routes/pets.ts`: `/transfer` resolve đa-định-danh + helper `heroUserIdFromLink`/`heroSlugFromLink` (anchor domain)
- `web/src/pages/onboarding.astro`: màn 2 lựa chọn foster/chủ-pet + inline JS gọi onboard-foster
- `web/src/pages/dashboard.astro`: empty-state foster (v344) + nút "Chia sẻ để nhận bé" + fallback + `Astro.site` link (v346)
- `web/src/pages/pets/[id].astro`: modal Trao bé — `transferNext()` nới + placeholder/hint link hồ sơ
- `web/src/lib/api-client.ts`: `MeResponse.user` thêm `is_foster_carer?`
- `web/public/sw.js`: VERSION hiện tại **v346-share-link-button**
- (CHẨN ĐOÁN, KHÔNG SỬA — cho bug chat): `web/src/pages/messages/[id].astro` (poll 5s, lastId, send optimistic) · `api/src/routes/conversations.ts` (GET ?after= + auto mark-read, POST trả {message}) · `api/src/lib/conversations.ts` (getMessages filter id>after — ĐÚNG)
