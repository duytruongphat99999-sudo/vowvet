# VowVet — Pilot Launch Playbook

**Target**: 10-15 khách HCMC + 5 khách Đà Lạt (Mon Min Pet clinic).

Tài liệu này hướng dẫn từng bước từ **pre-launch check** → **onboard pilot users** → **daily monitoring** → **post-launch triage bug**.

---

## 0. Pre-launch (T-7 ngày)

### 0.1 Verify infrastructure

```powershell
bun run --env-file=.env scripts/pre-launch-check.ts
```

Phải show **0 FAIL**. Warnings về Zalo + Google OAuth OK (defer M12+).

### 0.2 Backup snapshot

```powershell
# Baserow snapshot (manual export qua UI, lưu /backups/YYYY-MM-DD.zip)
# R2 bucket inventory check
docker exec vowvet-api bun -e "
const { listRows } = require('@shared/baserow.ts');
const tables = ['users', 'pets', 'vaccines', 'chat_threads'];
for (const t of tables) {
  const r = await listRows(t, { size: 1 });
  console.log(t + ':', r.count);
}
"
```

### 0.3 Clinic info final

Update `.env`:

```
CLINIC_NAME=Mon Min Clinic - HCMC
CLINIC_PHONE=+84779029133     # bác sĩ + cấp cứu 24/7
CLINIC_ADDRESS=<địa chỉ thật>
CLINIC_HOURS_WEEKDAY=08:00 - 22:00
CLINIC_HOURS_WEEKEND=08:00 - 22:00
CLINIC_24_7=true
CLINIC_MAPS_URL=https://maps.google.com/?q=<lat>,<lng>
CLINIC_ZALO_URL=https://zalo.me/1136810892220003266
```

Restart full: `cd docker && docker compose up -d`

### 0.4 Mark vet account

```powershell
$env:BASEROW_USER_EMAIL = "..."
$env:BASEROW_USER_PASSWORD = "..."
# Vợ Meliodas (DVM): set is_vet=true
# Run từ /admin Baserow UI hoặc curl PATCH
```

### 0.5 Test full flow 1 lần

- Login phone bạn → tạo pet → triage vomit_blood → escalate chat → vợ Meliodas claim → reply → owner thấy → close thread
- /emergency render đủ 12 articles + tel: click work
- /faq render đủ 16 articles
- /admin /vet/dashboard render
- Mobile 375px no horizontal scroll

---

## 1. Pre-register pilot users (T-3 ngày)

### 1.1 Tạo CSV file

`data/pilot-users.csv`:

```csv
phone,name,city,notes
+84901234567,Khách 1,ho_chi_minh,Mon Min walk-in
+84907654321,Khách 2,da_lat,Referral từ chị Lan
+84938111222,Khách 3,ho_chi_minh,VIP — Bulldog 3 tuổi
```

Format: phone (E.164), name, city slug (ho_chi_minh / da_lat / ha_noi / da_nang), notes.

### 1.2 Run onboard script

```powershell
$env:BASEROW_USER_EMAIL = "admin@vowvet.local"
$env:BASEROW_USER_PASSWORD = "..."
bun run scripts/pilot-onboard.ts
```

Output log → `data/pilot-onboard-log.json`. Script:
- Đọc CSV
- Tạo Baserow users row (phone+name, plan_tier=free, auth_method=phone_otp)
- Skip nếu phone đã tồn tại
- Log success/skip/fail

### 1.3 Welcome message qua Zalo

Phase 0: manual gửi qua Zalo personal account hoặc copy link.

Template (paste cá nhân):

```
Chào [Tên]! 🐾

Chị/anh tham gia pilot VowVet — app chăm sóc thú cưng AI từ Mon Min Clinic.

Link đăng nhập: https://vowvet.monminpet.com/login
Dùng SĐT này để nhận OTP.

Tính năng:
✅ Lịch tiêm phòng tự động
✅ AI tư vấn hằng ngày
✅ Cảnh báo khí hậu
✅ Chat trực tiếp với BS Mon Min
✅ Sơ cứu cấp tốc 12 tình huống

Có thắc mắc, nhắn lại em.
- Meliodas + Mon Min team
```

---

## 2. Launch day (T-0)

### 2.1 Morning checklist (07:00)

- [ ] Check `docker ps` — cả 4 container Up
- [ ] `curl https://vowvet.monminpet.com/health` → 200
- [ ] Vợ Meliodas mở `/vet/dashboard` — bật push notification
- [ ] Meliodas mở `/admin` — monitor metrics
- [ ] Test 1 user login flow end-to-end

### 2.2 Send invites (08:00-10:00)

Gửi welcome message cho 5 user đầu (HCMC). Cách 30 phút 1 user — tránh peak load.

### 2.3 Mid-day check (12:00)

- /admin analytics: AI cost today < $0.50
- SLA breaches: 0
- Triage sessions tăng dần
- Push notification reach (notification_log table)

### 2.4 Evening (20:00)

- Daily monitor report:
  ```powershell
  bun run scripts/daily-monitor.ts
  ```
- Review SLA breaches → vợ Meliodas xử lý hoặc reschedule
- Note user feedback từ Zalo personal

---

## 3. Daily ops (T+1 → T+30)

### 3.1 Cron jobs đang chạy (auto)

- **07:00** weather forecast fetch (M5)
- **08:00** vaccine reminder push (M6)
- **8h-22h hourly** severe weather watch (M5)
- **Sunday 00:00** cleanup old (M5)
- **Every 30 min** SLA breach check (M10 — alert admin nếu thread waiting >2h)

### 3.2 Manual daily

- [ ] Sáng: chạy `daily-monitor.ts` xem report
- [ ] Trưa: check vet response SLA
- [ ] Chiều: review AI cost (target <$1/day cho pilot)
- [ ] Tối: backup Baserow snapshot weekly

### 3.3 Weekly

- Review analytics trend (AI cost, triage urgency distribution)
- Cleanup test pets nếu phát hiện duplicates: `scripts/cleanup-test-data.ts`
- Update FAQ + emergency articles dựa trên câu hỏi thực tế

---

## 4. Post-launch SLA targets

| Metric | Target | Acceptable | Concern |
|---|---|---|---|
| Vet response time | <30 min | <2h | >2h (SLA breach) |
| Owner first interaction | <24h sau register | <48h | >7 ngày |
| Triage AI latency | <5s | <10s | >15s (Gemini quota?) |
| Push delivery | >90% | >75% | <50% (VAPID issue?) |
| Crash/error rate | <1% | <5% | >10% (investigate) |
| AI cost/user/month | <$2 | <$5 | >$10 (review prompt) |

---

## 5. Escalation paths

| Vấn đề | Liên hệ | Time |
|---|---|---|
| Baserow down | Self-host owner | <30 min |
| API container crash | Restart `docker compose up -d` | <5 min |
| Gemini quota exceeded | Đợi reset 24h, fallback Pro→Flash auto | Day reset |
| Zalo OTP fail | Switch ZALO_MODE=mock + manual support | <5 min |
| Push không reach | Check VAPID + user re-subscribe | <30 min |
| Vet không respond | Manual SMS Zalo cá nhân | <2h |

---

## 6. Pilot success criteria (T+30 review)

- [ ] 10+ users active (≥1 check-in/week)
- [ ] 50+ care plans generated
- [ ] 20+ triage sessions
- [ ] 5+ chat threads với vet
- [ ] AI cost <$30 tổng tháng đầu
- [ ] Vet response SLA met >80%
- [ ] 0 critical bug (data loss / auth bypass)
- [ ] User NPS >7/10 (qua chat survey)

Nếu đạt → expand 50 users tháng 2.

---

## Appendix — quick reference scripts

```powershell
# Pre-launch check
bun run --env-file=.env scripts/pre-launch-check.ts

# Onboard CSV
bun run scripts/pilot-onboard.ts

# Daily monitor (run sáng + tối)
bun run scripts/daily-monitor.ts

# Cleanup duplicates
bun run scripts/cleanup-test-data.ts

# Recovery (rare emergency)
bun run scripts/recover-baserow-config.ts
```

---

**Owner**: Meliodas (admin@vowvet.local, +84779029133)
**DVM**: Vợ Meliodas (+84779029133, is_vet=true) — same hotline, bác sĩ tư vấn 24/7
**Zalo OA**: https://zalo.me/1136810892220003266
**Last updated**: 2026-05-19
