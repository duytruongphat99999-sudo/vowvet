# CONTEXT SYNC — 2026-07-16 21:00

## 🎯 ĐANG LÀM GÌ
Khép kín **vòng foster cho user Zalo-thuần** (không email/phone): đăng ký sạch không ép tạo bé (v344) → tự lấy link định danh (v346) → được trao bé qua link (v345). CẢ 3 EPIC XONG HẲN: code + verify HTTP + eyeball tunnel PASS + **PR #15 MERGED vào main**. Song song: vụ chat "phải F5 / gửi không ai thấy" **ĐÓNG HẲN 17/07 — KHÔNG PHẢI BUG** (polling 5s sống, eyeball tunnel u27→u30 realtime; nguyên nhân: nick Zalo sai u49 ≠ u30). PR #16 (gate profile) **nghiệm thu PASS 17/07** (mắt + data) — merge cùng PR docs. Việc kế: nút "Hồ sơ Pet Hero của tôi" trên dashboard (VIỆC TIẾP THEO #1, vị trí đã duyệt).

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
- **Survey gate profile + vá**: bug gate THẬT (16/07 22:29: `/heroes/profile/<id>` 404 với MỌI người lạ vì `public_profile_enabled=false` mặc định, chỉ hero act đầu bật `pet-heroes.ts:192`, foster KHÔNG bật → nút "Nhắn tin" chết + link v346 404) → **PR #16** (`fix(foster): bật public_profile_enabled khi set is_foster_carer`; verify 6/6 + regression u53 chủ-pet-thường vẫn private + verifier PASS).
- **Ops**: PR #16 nghiệm thu PASS 17/07 (mắt + data): Duy bỏ tick TAY cả public_profile_enabled + is_foster_carer của u30 trong Baserow → /heroes/profile/30 → bấm "Bật" ở "Tôi nhận nuôi tạm" 1 lần → query lại: CẢ 2 = true. Code tự bật, không phải tay. Merged. Kèm: u27 (login thật) mở /heroes/profile/30 → THẤY nút "Nhắn tin" → KHÔNG có bug isOwner; lần trước không thấy là do browser đó chưa login. (Script recon/verify read-only còn ở `data/api/_recon_*.ts` + `_verify_*.ts` — untracked, KHÔNG commit.)
- **Ops**: Vụ "chat phải F5" — **ĐÓNG 17/07, KHÔNG PHẢI BUG**. Eyeball tunnel: u27→u30 realtime, không F5, badge đỏ chạy. Nguyên nhân: test bằng nick Zalo sai (u49 ≠ u30). Full điều tra: survey read-only 16/07 (server/client/SW sạch, cache không phủ /conversations).
- **Recon định vị pet** (trả lời câu hỏi): CHỈ có lost-pet network (last-seen + sightings + QR collar in giấy + OSM/Leaflet + Haversine). KHÔNG có GPS tracker/real-time — muốn có phải tích hợp phần cứng mới.

## 🚧 ĐANG DỞ
- Không có việc code dở — việc kế xem VIỆC TIẾP THEO #1 (nút "Hồ sơ Pet Hero của tôi", vị trí đã duyệt).

## ⚠️ BẪY MỚI (chưa vá)
- **Mỗi transfer đẻ conversation MỚI cho cùng cặp user** (context_id = handover_id mới). Cặp 35↔37 đang có 3 conv: #11,12,15. Hiện 17 foster conv. Về sau sẽ tạo ĐÚNG triệu chứng "nhắn không thấy": A ở phòng cũ, B ở phòng mới. Cần findOrCreate theo CẶP USER thay vì theo handover.
- **Test bằng nhiều nick Zalo** → nick Zalo app-scoped, tên khác nhau = TK khác nhau thật. Trước khi kết luận bug chat: query user + conversation của nick đang cầm TRƯỚC.
- **"Thu hồi bé" (`foster-reclaim.ts:107-111`) XOÁ handover + hero_act + trừ foster_acts_count** → conv foster cũ trỏ `context_id` vào handover đã xoá (conv #7→17, #22→31 đang dangling); `POST /conversations/foster` với handover_id đó sẽ 404. Foster act ghi ĐÚNG (đối chiếu u33=1/1, u35=6/6, u39=6/6 khớp handovers) — u27=0 là do reclaim, KHÔNG phải bug ghi.
- **Nhãn 2 công tắc profile là TEXT TĨNH, KHÔNG phản ánh trạng thái** (nút ghi "Bật" dù `is_foster_carer` đã true; "Tắt profile công khai" không bao giờ đổi) → đọc nhãn để đoán trạng thái là SAI, phải query Baserow. Đã đốt 2 vòng phiên này.
- **`togglePrivate()` (`heroes/profile/[userId].astro:423-439`) hardcode `enabled:false`** — ONE-WAY, tắt rồi UI đó không bật lại được (alert chỉ đường "vào lại /heroes/profile").
- **Dòng 432 `if (res.ok)` KHÔNG có else** → request fail là im lặng tuyệt đối, user không biết gì.
- **Backfill u49**: `public_profile_enabled=false` (đăng ký foster TRƯỚC #16) → toggle "Tôi nhận nuôi tạm" OFF→ON hoặc tick tay Baserow.

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **Nút "Hồ sơ Pet Hero của tôi"** ở `dashboard.astro:332` (cạnh "Nhắn tin với VowVet", **NGOÀI ternary** `{!primaryPet}` → render MỌI user, CẢ 2 trạng thái — vị trí Bồ+Duy duyệt 17/07) → `/heroes/profile/{user.id}`. Đóng luôn nợ v346 (foster ≥1 bé mất nút share ở empty-state → vào hồ sơ lấy link). Sub-label: grep nút "Share" trên trang profile phát ra gì — phát URL profile thì giữ vế "Link chia sẻ nhận bé", phát thứ khác thì bỏ vế đó. SW v347, rebuild vowvet-web.
2. (tồn cũ) Zalo ZNS (OTP/notify thật) · chặn hẳn phone-OTP backend (HỎI trước — đụng auth).
3. (kiến trúc, tồn cũ — Bồ khôi phục 17/07, đã rớt khỏi bản trước) Hàng đợi **"foster XIN nhận → owner duyệt"** — hiện chỉ có mô hình owner-đẩy (owner chủ động trao); chưa có chiều foster chủ động xin.
4. (kiến trúc, tồn cũ — Bồ khôi phục 17/07, đã rớt khỏi bản trước) **Badge đa-admin**: `read_at` dùng chung — 1 admin đọc là CẢ TEAM hết unread (đếm đã vá theo `user1_id` trong `getAdminSupportUnread`, nhưng mark-read vẫn chung).

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
- `api/src/lib/users.ts`: `markOnboardedAsFoster` (caller DUY NHẤT `users.ts:207`) set onboarded + is_foster_carer + public_profile_enabled (PR #16). `markOnboarded` (chủ-pet, caller `onboarding.ts:56` + `users.ts:166`) KHÔNG đụng public_profile_enabled — regression u53 xác nhận vẫn false.
- `api/src/routes/pets.ts`: `/transfer` resolve đa-định-danh + helper `heroUserIdFromLink`/`heroSlugFromLink` (anchor domain)
- `web/src/pages/onboarding.astro`: màn 2 lựa chọn foster/chủ-pet + inline JS gọi onboard-foster
- `web/src/pages/dashboard.astro`: empty-state foster (v344) + nút "Chia sẻ để nhận bé" + fallback + `Astro.site` link (v346)
- `web/src/pages/pets/[id].astro`: modal Trao bé — `transferNext()` nới + placeholder/hint link hồ sơ
- `web/src/lib/api-client.ts`: `MeResponse.user` thêm `is_foster_carer?`
- `web/public/sw.js`: VERSION hiện tại **v346-share-link-button**
- (CHẨN ĐOÁN, KHÔNG SỬA — cho bug chat): `web/src/pages/messages/[id].astro` (poll 5s, lastId, send optimistic) · `api/src/routes/conversations.ts` (GET ?after= + auto mark-read, POST trả {message}) · `api/src/lib/conversations.ts` (getMessages filter id>after — ĐÚNG)
