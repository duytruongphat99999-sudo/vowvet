# VowVet — Operations Runbook

Quick troubleshoot guide cho **common issues** trong pilot phase.

---

## 🚨 P0 — Service down (toàn bộ user không vào được)

### Symptoms
- vowvet.monminpet.com không load
- HTTP 502/503/504

### Diagnose
```powershell
docker ps                              # Kiểm tra container up
docker logs vowvet-api --tail 50       # Lỗi gì?
docker logs vowvet-web --tail 50
curl -I https://vowvet.monminpet.com   # Nginx layer OK?
```

### Fix
```powershell
# Restart soft
cd docker && docker compose restart

# Nếu vẫn fail — full recreate
cd docker && docker compose down && docker compose up -d

# Nếu baserow-config corrupt
bun run scripts/recover-baserow-config.ts
```

---

## 🔴 P1 — Vet không nhận thông báo thread mới

### Symptoms
- Owner tạo thread, vet không thấy Zalo + push

### Diagnose
```powershell
# Check ZALO_MODE
docker exec vowvet-api sh -c 'env | grep ZALO_MODE'

# Check logs xem có gửi không
docker logs vowvet-api --tail 100 | grep "VET ALERT"

# Check vet's push_subscription
docker exec vowvet-api bun -e "
const { listRows } = require('@shared/baserow.ts');
const r = await listRows('users', { filter: { is_vet__boolean: 'true' }, size: 5 });
for (const u of r.results) console.log(u.id, u.phone, 'push:', !!u.push_subscription);
"
```

### Fix
- Mode = mock → OTP/alert chỉ console.log. Switch production khi Zalo OA duyệt.
- Push subscription empty → vet cần mở `/settings` → bật push → grant browser permission.
- VAPID keys missing → check .env + `generate-vapid.ts`.

---

## 🟠 P2 — Owner không nhận OTP

### Symptoms
- Login OTP không đến phone

### Diagnose
```powershell
docker logs vowvet-api --tail 50 | grep "ZALO OTP"
```

### Fix
- Mode mock (Phase 0): OTP log to console — manual đọc code, gửi cho user qua Zalo personal
- Production mode + Zalo OA chưa duyệt → auto fallback console, vẫn ổn
- Rate limited: user spam request → đợi 15 phút auto unlock

---

## 🟠 P2 — Gemini AI fail

### Symptoms
- Care plan generate fail
- Triage trả 500 error

### Diagnose
```powershell
docker logs vowvet-api --tail 100 | grep -E "(GEMINI|quota|429)"
```

### Fix
- 429 quota exceeded → đợi 24h reset (Pro auto fallback Flash đã có)
- API key invalid → regenerate ở https://ai.google.dev
- Network/timeout → restart container

---

## 🟡 P3 — Slow response times

### Symptoms
- /api/v1/pets/X/triage > 10 giây
- Page load > 5 giây

### Diagnose
```powershell
# Check Gemini latency
docker logs vowvet-api --tail 100 | grep -E "triage.*ms"

# Check Baserow query count
docker logs vowvet-api --tail 200 | grep -c "GET /api/database"
```

### Fix
- Gemini latency 5-8s từ VN → Google US is normal. Frontend đã handle với loading state.
- Baserow >50 queries/page → kiểm tra N+1 query trong lib mới.
- Restart container nếu memory leak nghi ngờ.

---

## 🟡 P3 — SLA breach (thread waiting >2h)

### Symptoms
- Admin push notification: "X thread waiting >2h"
- /admin SLA section hiện breach list

### Fix
- Vợ Meliodas vào `/vet/dashboard` → claim thread
- Nếu vợ vắng → admin reply tạm thay (manual qua /chat/[id] sau khi set is_vet=true cho admin tạm thời)
- Sau pilot growth → tuyển thêm vet

---

## 🟡 P3 — User báo bug

### Diagnose
1. Hỏi user steps reproduce
2. Check `docker logs vowvet-api --since 1h` cho error gần thời điểm
3. Check `docker logs vowvet-web --since 1h` cho 500/302 unexpected

### Fix
- Hot fix: edit Astro page hot reload tự apply
- API fix: edit + `docker restart vowvet-api`
- Major fix: commit + redeploy

---

## 🔵 P4 — Data integrity

### Cleanup test pets
```powershell
$env:BASEROW_USER_EMAIL = "admin@vowvet.local"
$env:BASEROW_USER_PASSWORD = "..."
bun run scripts/cleanup-test-data.ts          # dry-run
bun run scripts/cleanup-test-data.ts --apply  # delete với confirm
```

### Cleanup deleted users (manual 30d retention)
```powershell
# Phase 0: manual via Baserow UI. M9+ auto cron sẽ làm.
```

### Restore from backup
```powershell
# Manual: Baserow UI → import .zip snapshot
# baserow-config.json: copy từ git history hoặc /backups
```

---

## 🔵 P4 — Maintenance tasks

### Weekly
- [ ] Backup Baserow snapshot (Baserow UI → export)
- [ ] Review AI cost trend (/admin)
- [ ] Cleanup test pets nếu có

### Monthly
- [ ] Review SLA metrics
- [ ] User survey (NPS)
- [ ] Update FAQ + emergency articles dựa trên thực tế
- [ ] Check Gemini cost vs budget

### Quarterly
- [ ] Update vaccine schedules nếu WSAVA cập nhật
- [ ] Update forbidden foods list
- [ ] Review push notification permissions (user opt-in rate)

---

## Contact escalation

| Severity | Person | Channel | Response time |
|---|---|---|---|
| P0 down | Meliodas | Zalo + Phone | <15 min |
| P1 vet alert | Meliodas | Zalo | <30 min |
| P2 user issue | Vợ Meliodas (DVM) | Chat thread | <2h working |
| P3 polish | Meliodas | Async | <24h |

---

**Owner**: Meliodas
**Last updated**: 2026-05-17
