/**
 * Smoke E2E — chat "direct" (nút "Nhắn tin" từ profile → tạo/mở hội thoại direct).
 *
 * Chạy:  bun run smoke:chat        (script package.json → bun scripts/smoke/chat-direct.ts)
 *        (KHÔNG phải "bun test")
 *
 * Ký session-cookie JWT cho 2 user bằng shared/jwt.ts — CÙNG secret env với container
 * (JWT_SECRET nạp từ ./.env khi chạy từ repo root). Việc ký diễn ra NGOÀI container;
 * token vẫn verify được bởi api vì cùng thuật toán HS256 + cùng secret.
 *
 * User A/B:
 *   - Mặc định theo brief: A=10 (pet "min" owner), B=18 (lyvu2004DTP, Google OAuth).
 *   - Override rõ ràng bằng SMOKE_USER_A / SMOKE_USER_B.
 *   - Nếu id mặc định KHÔNG tồn tại trong bảng users của Baserow đang chạy, script tự
 *     chọn 2 user thật (ưu tiên user có tên) và IN RÕ đã thay — để smoke vẫn xanh mà
 *     không "bịa": nó thật sự tạo hội thoại + gửi tin giữa 2 user có thật.
 *
 * Host port thật của vowvet-api là 3010 (docker-compose map 127.0.0.1:3010 → container 3000).
 * Override bằng SMOKE_API nếu môi trường khác.
 *
 * Kịch bản:
 *   1. A POST /conversations/direct { targetUserId: B }  → conversationId
 *   2. A gọi lại lần 2                                    → CÙNG conversationId (idempotent)
 *   3. A GET /conversations                               → thấy conv, type=direct, otherUserName của B
 *   4. đo tổng unread của B TRƯỚC
 *   5. A POST /conversations/:id/messages                → gửi 1 tin
 *   6. B GET /conversations                               → thấy conv, type=direct (badge FE suy ra "Nhắn tin"), unreadCount ≥ 1
 *   7. B GET /conversations/unread-count                 → tổng unread TĂNG so với bước 4
 *
 * Exit 0 nếu mọi assert pass, exit 1 nếu có bất kỳ assert fail (hoặc không ký được cookie).
 */
import { signSession } from "../../shared/jwt.ts";
import { listRows } from "../../shared/baserow.ts";

const API = Bun.env.SMOKE_API || "http://127.0.0.1:3010"; // host 3010 → container 3000

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: any) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.error(`❌ ${name}`, typeof extra === "string" ? extra : JSON.stringify(extra)?.slice(0, 250)); fail++; }
}

// ── Điều kiện tiên quyết: ký cookie ngoài container cần JWT_SECRET ──────────
if (!process.env.JWT_SECRET) {
  console.error(
    "❌ JWT_SECRET không có trong env → KHÔNG ký được cookie ngoài container.\n" +
    "   Chạy từ repo root (Bun tự nạp ./.env) hoặc set JWT_SECRET trước khi chạy."
  );
  process.exit(1);
}

interface Resolved { a: number; b: number; note: string; nameA?: string; nameB?: string }

/** Tên hiển thị GIỐNG hệt getConversations enrich (name → phone → email → `user id`). */
function displayName(u: any): string {
  return u?.name || u?.phone || u?.email || `user ${u?.id}`;
}

/** Chọn A/B: env → brief default (10/18) nếu tồn tại → fallback 2 user thật. */
async function resolveUsers(): Promise<Resolved> {
  const envA = Bun.env.SMOKE_USER_A, envB = Bun.env.SMOKE_USER_B;
  const wantA = Number(envA || 10), wantB = Number(envB || 18);

  const res = await listRows<any>("users" as any, { size: 200 });
  const alive = res.results.filter((u) => !u.deleted_at);
  const byId = new Map<number, any>(alive.map((u) => [Number(u.id), u]));
  const named = (id: number) => (byId.has(id) ? displayName(byId.get(id)) : undefined);

  if (envA && envB) return { a: wantA, b: wantB, note: "SMOKE_USER_A/B", nameA: named(wantA), nameB: named(wantB) };

  if (wantA !== wantB && byId.has(wantA) && byId.has(wantB)) {
    return { a: wantA, b: wantB, note: "brief default 10/18", nameA: named(wantA), nameB: named(wantB) };
  }
  // Fallback: 2 user thật, ưu tiên user có tên rồi tới id nhỏ.
  const ranked = [...alive].sort(
    (x, y) => Number(!!y.name) - Number(!!x.name) || Number(x.id) - Number(y.id)
  );
  if (ranked.length < 2) throw new Error("Cần ≥2 user thật trong bảng users để chạy smoke");
  return {
    a: Number(ranked[0].id),
    b: Number(ranked[1].id),
    note: `FALLBACK — brief 10/18 không tồn tại trong Baserow này (users: ${alive.map((u) => u.id).join(",")})`,
    nameA: displayName(ranked[0]),
    nameB: displayName(ranked[1]),
  };
}

async function main() {
  const { a: USER_A, b: USER_B, note, nameA, nameB } = await resolveUsers();
  console.log(`\n=== Smoke chat-direct — A=${USER_A} B=${USER_B} @ ${API} (${note}) ===`);

  // A: cookie phone-OTP (phone non-admin để tránh nhánh isAdmin). B: chỉ email (Google user).
  const tokenA = signSession({ sub: USER_A, phone: "+84900000010", email: "smoke-a@local", is_onboarded: true } as any, 3600);
  const tokenB = signSession({ sub: USER_B, email: "smoke-b@local", is_onboarded: true } as any, 3600);
  const hdrA = { cookie: `vowvet_session=${tokenA}`, "Content-Type": "application/json" };
  const hdrB = { cookie: `vowvet_session=${tokenB}`, "Content-Type": "application/json" };

  // 1. A tạo/mở hội thoại direct
  const d1 = await fetch(`${API}/api/v1/conversations/direct`, {
    method: "POST", headers: hdrA, body: JSON.stringify({ targetUserId: USER_B }),
  });
  const d1j = await d1.json();
  ok("1. POST /conversations/direct (A) → 200", d1.status === 200, d1j);
  const convId = Number(d1j.conversationId);
  ok("1b. trả conversationId hợp lệ", Number.isInteger(convId) && convId > 0, d1j);
  if (!Number.isInteger(convId) || convId <= 0) return finish();

  // 2. Gọi lại → phải CÙNG conversationId (idempotent)
  const d2 = await fetch(`${API}/api/v1/conversations/direct`, {
    method: "POST", headers: hdrA, body: JSON.stringify({ targetUserId: USER_B }),
  });
  const d2j = await d2.json();
  ok("2. idempotent: lần 2 trả CÙNG conversationId", Number(d2j.conversationId) === convId, { first: convId, second: d2j.conversationId });

  // 3. A GET /conversations → thấy conv với otherUserName của B, type=direct
  const la = await fetch(`${API}/api/v1/conversations`, { headers: hdrA });
  const laj = await la.json();
  const convA = (laj.conversations || []).find((c: any) => c.id === convId);
  ok("3. A thấy conv trong /conversations", !!convA, laj);
  ok("3b. conv.type === 'direct'", convA?.type === "direct", convA?.type);
  ok(
    nameB ? `3c. otherUserName === tên của B ("${nameB}")` : "3c. otherUserName của B không rỗng",
    nameB ? convA?.otherUserName === nameB : typeof convA?.otherUserName === "string" && convA.otherUserName.length > 0,
    convA?.otherUserName
  );
  console.log(`   otherUserName(B) = "${convA?.otherUserName}"`);

  // 4. Tổng unread của B TRƯỚC khi A gửi
  const ub0 = await fetch(`${API}/api/v1/conversations/unread-count`, { headers: hdrB });
  const unreadBefore = Number((await ub0.json())?.count) || 0;
  console.log(`   B unread trước = ${unreadBefore}`);

  // 5. A gửi 1 tin
  const content = `smoke direct conv#${convId}`;
  const sm = await fetch(`${API}/api/v1/conversations/${convId}/messages`, {
    method: "POST", headers: hdrA, body: JSON.stringify({ content }),
  });
  const smj = await sm.json();
  ok("5. POST /conversations/:id/messages (A) → 200", sm.status === 200, smj);
  ok("5b. message trả về id + content đúng", Number(smj.message?.id) > 0 && smj.message?.content === content, smj.message);

  // 6. B GET /conversations → thấy conv, type=direct (badge FE suy ra "Nhắn tin"), unread ≥ 1
  const lb = await fetch(`${API}/api/v1/conversations`, { headers: hdrB });
  const lbj = await lb.json();
  const convB = (lbj.conversations || []).find((c: any) => c.id === convId);
  ok("6. B thấy conv trong /conversations", !!convB, lbj);
  ok("6b. B: conv.type === 'direct' (badge FE suy ra 'Nhắn tin')", convB?.type === "direct", convB?.type);
  ok("6c. B: unreadCount ≥ 1 (tin A vừa gửi)", Number(convB?.unreadCount) >= 1, convB?.unreadCount);
  ok(
    nameA ? `6d. otherUserName === tên của A ("${nameA}")` : "6d. otherUserName của A không rỗng",
    nameA ? convB?.otherUserName === nameA : typeof convB?.otherUserName === "string" && convB.otherUserName.length > 0,
    convB?.otherUserName
  );
  console.log(`   otherUserName(A) = "${convB?.otherUserName}"`);

  // 7. Tổng unread của B TĂNG
  const ub1 = await fetch(`${API}/api/v1/conversations/unread-count`, { headers: hdrB });
  const unreadAfter = Number((await ub1.json())?.count) || 0;
  ok("7. B: tổng unread TĂNG sau khi A gửi", unreadAfter > unreadBefore, { before: unreadBefore, after: unreadAfter });
  console.log(`   B unread sau = ${unreadAfter}`);

  finish();
}

function finish() {
  console.log(`\n${pass} pass / ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ Smoke lỗi runtime (API không reachable?):", err?.message || err);
  process.exit(1);
});
