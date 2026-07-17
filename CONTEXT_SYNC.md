# CONTEXT SYNC — 2026-07-16 21:00

## 🎯 ĐANG LÀM GÌ
Khép kín **vòng foster cho user Zalo-thuần** (không email/phone): đăng ký sạch không ép tạo bé (v344) → tự lấy link định danh (v346) → được trao bé qua link (v345). CẢ 3 EPIC XONG HẲN: code + verify HTTP + eyeball tunnel PASS + **PR #15 MERGED vào main**. Song song: vụ chat "phải F5 / gửi không ai thấy" **ĐÓNG HẲN 17/07 — KHÔNG PHẢI BUG** (polling 5s sống, eyeball tunnel u27→u30 realtime; nguyên nhân: nick Zalo sai u49 ≠ u30). PR #16 (gate profile) nghiệm thu PASS + **PR #18 (nút "Hồ sơ Pet Hero của tôi") merged 17/07, eyeball PASS**. Backfill foster trước #16 XONG (u34+u49). Việc kế: 2 item đầu VIỆC TIẾP THEO — CHƯA QUYẾT HƯỚNG, chờ Bồ/Duy chốt.

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
- **Ops**: PR #18 merged 17/07 — card "Hồ sơ Pet Hero của tôi" ở `dashboard.astro:332` (ngoài ternary, mọi user, cả 2 trạng thái) → `/heroes/profile/{user.id}`. SW v347. Đóng nợ v346. Eyeball tunnel PASS.
- **Ops**: Vụ "chat phải F5" — **ĐÓNG 17/07, KHÔNG PHẢI BUG**. Eyeball tunnel: u27→u30 realtime, không F5, badge đỏ chạy. Nguyên nhân: test bằng nick Zalo sai (u49 ≠ u30). Full điều tra: survey read-only 16/07 (server/client/SW sạch, cache không phủ /conversations).
- **Recon định vị pet** (trả lời câu hỏi): CHỈ có lost-pet network (last-seen + sightings + QR collar in giấy + OSM/Leaflet + Haversine). KHÔNG có GPS tracker/real-time — muốn có phải tích hợp phần cứng mới.
- **Ops**: PR #20 merged 17/07 — A1: `foster-transfer.ts:90` + `conversations.ts:98` → `context_id=0` → findOrCreate match theo CẶP USER, 1 phòng/cặp (như Zalo). Zero migration (17 conv cũ giữ nguyên; 4 cặp mồ côi đều nick soft-delete). Verify sau-settle: A↔B 2 transfer → 1 conv #25 context=0. Bonus: fix dangling #7/#22.
- **Ops**: PR #22 merged 17/07 — B2: tách quyền xem hồ sơ ≠ nhắn tin. Fallback ở route `heroes.ts` GET /profile (KHÔNG đụng `getHeroProfile` → /acts + /my-stats + slug KHÔNG rò) → viewer ĐÃ LOGIN xem hồ sơ private = 200 + `{user_id, name, avatar_url, limited:true}`. Guest → vẫn 404. User soft-delete → 404. FE gate SERVER-SIDE (Astro omit markup + không fetch `is_foster_carer` khi limited) — KHÔNG dùng x-show vì `initialData` lộ view-source. SW v349. Verify 2 tầng API 7/7 + HTML 5/5, state u66 (foster+private) xác nhận thật.

## 🚧 ĐANG DỞ
- Không có việc code dở — việc kế xem VIỆC TIẾP THEO (item 1 "tìm hồ sơ người khác" chưa recon/chưa quyết hướng).

## ⚠️ BẪY MỚI (chưa vá)
- ⛔ **CLAUDE.md §1 "Account test" STALE** — pet 12 / u10 / u18 đều CHẾT (query 17/07 xác nhận). Hook `protect-harness.sh` chặn agent sửa CLAUDE.md, chưa sửa tay được. → **Account test dùng `PROJECT.md` làm nguồn** (u26 chủ-pet · u30 Zalo/foster, kèm guard "account THẬT của Duy — chỉ đọc/login/probe GET"). **ĐỪNG tin §1 CLAUDE.md.**
- ✅ **Bẫy "mỗi transfer đẻ conv mới" — VÁ XONG (A1, PR #20 merged)**. Còn 2 nợ liên quan (dưới).
- **`findOrCreateConversation` là list-then-create, KHÔNG atomic** → 2 request cùng cặp <1s vẫn đẻ conv trùng (thấy thật: #26+#27 cách 191ms — transfer fire-forget + openFoster gọi 0ms sau). Pre-existing, A1 KHÔNG làm tệ hơn. Luồng FE thật có bước người bấm "Nhắn cho người nhận" (`pets/[id].astro:4550`) → cửa sổ race đóng. Diệt hẳn phải chạm `findOrCreate` hoặc uniqueness DB.
- **`lib/conversations.ts:55-62` `.find()` trả conv ĐẦU TIÊN gặp (≈ id asc), KHÔNG đảm bảo là phòng CŨ NHẤT.** Data hiện tại chưa chạm. Cần chắc → `.sort()` theo `created_at` trước `.find()`.
- **Test bằng nhiều nick Zalo** → nick Zalo app-scoped, tên khác nhau = TK khác nhau thật. Trước khi kết luận bug chat: query user + conversation của nick đang cầm TRƯỚC.
- **"Thu hồi bé" (`foster-reclaim.ts:107-111`) XOÁ handover + hero_act + trừ foster_acts_count** → conv foster cũ trỏ `context_id` vào handover đã xoá (conv #7→17, #22→31 đang dangling); `POST /conversations/foster` với handover_id đó sẽ 404. Foster act ghi ĐÚNG (đối chiếu u33=1/1, u35=6/6, u39=6/6 khớp handovers) — u27=0 là do reclaim, KHÔNG phải bug ghi.
- **Nhãn 2 công tắc profile là TEXT TĨNH, KHÔNG phản ánh trạng thái** (nút ghi "Bật" dù `is_foster_carer` đã true; "Tắt profile công khai" không bao giờ đổi) → đọc nhãn để đoán trạng thái là SAI, phải query Baserow. Đã đốt 2 vòng phiên này.
- **`togglePrivate()` (`heroes/profile/[userId].astro:423-439`) hardcode `enabled:false`** — ONE-WAY, tắt rồi UI đó không bật lại được (alert chỉ đường "vào lại /heroes/profile").
- **Dòng 432 `if (res.ok)` KHÔNG có else** → request fail là im lặng tuyệt đối, user không biết gì.
- **Backfill foster trước #16 — XONG**: u34 + u49 ĐÃ tick tay 17/07 (`public_profile_enabled`). Query toàn bảng: 9 foster → chỉ 2 user sống cần backfill, xong. **u34 là USER THẬT (không phải nick test) — bug gate đã dính người ngoài.**
- ⛔ **Verify server-side (script HTTP + grep HTML) MÙ với client-side fetch.** B2 suýt lọt pill foster vì nó fetch SAU khi trang load → cả 2 tầng verify server-side đều không thấy. Cùng vệt v345 (client validate chặn) · v346 (`Astro.url.origin`) · localhost:4322 (client fetch 404 im lặng). → Vá gì dính client-fetch: **gate SERVER-SIDE để verify thấy được**, hoặc **eyeball tay**.
- **`GET /pets/foster/carer/:id` (`pets.ts:568`) KHÔNG gate `public_profile_enabled`** → gọi thẳng vẫn rò foster status của user private. Độc lập B2 (trước B2 rò y hệt) — B2 chỉ đóng tầng UI.
- **Hằng số trong `<script>`** ("Người nuôi tạm" `FOSTER_LABELS` · "Chưa có cấp" `HERO_TIERS`) LUÔN có trong HTML dù pill bị omit → grep chuỗi = **false-negative**. Phải grep MARKUP pill (container/template), không grep nhãn. (Đã dính lúc verify B2b — assertion sai, fix xong.)
- **foster conv vs direct conv CÙNG CẶP USER = 2 phòng riêng** (type khác nhau → A1 chỉ match trong cùng type). u30↔u27 sẽ có #22 (foster) + phòng direct mới → `/messages` hiện 2 dòng trùng tên. Cùng lớp vấn đề A1 vừa vá, CHƯA đóng hết (A1 chỉ gom foster↔foster).

## 🎯 VIỆC TIẾP THEO (ưu tiên cao → thấp)
1. **(CHƯA QUYẾT HƯỚNG, chưa recon) Tìm hồ sơ người khác**: không có đường nào ngoài leaderboard `/heroes` → muốn nhắn ai phải gõ id tay. Chưa recon.
2. (kiến trúc, tồn cũ — Bồ khôi phục 17/07, đã rớt khỏi bản trước) Hàng đợi **"foster XIN nhận → owner duyệt"** — hiện chỉ có mô hình owner-đẩy (owner chủ động trao); chưa có chiều foster chủ động xin.
3. (kiến trúc, tồn cũ — Bồ khôi phục 17/07, đã rớt khỏi bản trước) **Badge đa-admin**: `read_at` dùng chung — 1 admin đọc là CẢ TEAM hết unread (đếm đã vá theo `user1_id` trong `getAdminSupportUnread`, nhưng mark-read vẫn chung).

## ✅ QUYẾT ĐỊNH CHỐT 17/07 — auth Zalo + mail, KHÔNG phone-OTP cho user
- Duy xác nhận: "VowVet chỉ Zalo và mail". Không còn user login bằng phone.
- **Zalo ZNS (OTP/notify thật) → BỎ HẲN.** Không ai cần nhận OTP ngoài → `ZALO_MODE=mock` đủ. Tiết kiệm: Zalo OA + tích vàng + duyệt template + ~300đ/tin.
- **Route phone-OTP backend (`/auth/request-otp|verify-otp` + `/login?method=phone`) → GIỮ NGUYÊN, KHÔNG chặn.** Đó là **ĐƯỜNG CỨU ADMIN duy nhất**: mất quyền Gmail `vowvet.monminpet99@gmail.com` → thêm `ADMIN_PHONES=+84779029133` vào `.env` + force-recreate → login bằng phone, OTP đọc từ log container (mock, không cần ZNS thật). **Chặn route = mất admin vĩnh viễn.**

## 📌 QUYẾT ĐỊNH KỸ THUẬT ĐÃ CHỐT
- **Gate onboarding nằm ở `/me`** (`auth.ts` ~212): `is_onboarded = pets.length>0 || onboarded===true`. Mọi login endpoint ĐÃ dùng `getIsOnboarded` (đọc field `onboarded`) từ trước → fix 1 dòng /me là mắt xích thiếu duy nhất. Middleware chỉ đọc cookie, KHÔNG tự tính.
- **Foster = 2 field boolean có sẵn** (`onboarded` + `is_foster_carer`), KHÔNG đẻ "loại tài khoản", KHÔNG đụng schema Baserow.
- **Transfer đa-định-danh**: client chỉ nới validation "cho đi tiếp", **server là chốt chặn thật** (regex chặt + anchor domain). **userId-số là đường chính** (chạy bất kể public toggle); slug là phụ (`getHeroProfileBySlug` trả null khi hồ sơ tắt public). Bỏ hướng mã VOW-xxxx (đụng schema).
- **Link tuyệt đối công khai ở web SSR**: dùng **`Astro.site`** (`https://vowvet.monminpet.com` khai ở `astro.config.mjs:6`), **KHÔNG** `Astro.url.origin` (sau proxy trả `http://localhost` → link hỏng). Đã dính bẫy này 2 lần.
- **Chat server ĐÚNG** (đã chứng minh bằng diagnostic) — mọi bản vá chat sau này nhắm CLIENT/môi trường, đừng mò lại server.
- **B2 đánh đổi (chấp nhận 17/07)**: user ĐÃ LOGIN thấy TÊN của mọi user private → quét `/heroes/profile/1..N` ra danh sách tên. Đổi lại: chat 2 chiều, không ai phải bật gì. **Riêng tư = giấu THÀNH TÍCH, không phải cấm liên lạc.**

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
