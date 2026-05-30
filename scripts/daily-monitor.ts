/**
 * Daily monitor — sáng + tối chạy 1 lần, in report metrics.
 *
 * Run (PowerShell):
 *   $env:BASEROW_TOKEN = "..."
 *   bun run scripts/daily-monitor.ts
 *
 * Output: console table + write data/daily-monitor-YYYY-MM-DD.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";

const BASEROW_URL = (Bun.env.BASEROW_URL || "http://localhost:8888").replace(/\/$/, "");
const TOKEN = Bun.env.BASEROW_TOKEN;
const USAGE_LOG_PATH = Bun.env.GEMINI_USAGE_LOG || "./data/gemini-usage.log.jsonl";

if (!TOKEN) {
  console.error("❌ BASEROW_TOKEN required");
  process.exit(1);
}

let config: any;
try {
  config = JSON.parse(await readFile("./baserow-config.json", "utf-8"));
} catch {
  console.error("❌ baserow-config.json missing");
  process.exit(1);
}

async function listCount(tableName: string): Promise<number> {
  const t = config.tables[tableName];
  if (!t) return 0;
  try {
    const r = await fetch(
      `${BASEROW_URL}/api/database/rows/table/${t.id}/?user_field_names=true&size=1`,
      { headers: { Authorization: `Token ${TOKEN}`, Host: "localhost:8888" } }
    );
    if (!r.ok) return 0;
    const j = (await r.json()) as { count: number };
    return j.count;
  } catch {
    return 0;
  }
}

async function listRows(tableName: string, size = 200): Promise<any[]> {
  const t = config.tables[tableName];
  if (!t) return [];
  try {
    const r = await fetch(
      `${BASEROW_URL}/api/database/rows/table/${t.id}/?user_field_names=true&size=${size}`,
      { headers: { Authorization: `Token ${TOKEN}`, Host: "localhost:8888" } }
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { results: any[] };
    return j.results;
  } catch {
    return [];
  }
}

// ============================================================
// Collect metrics
// ============================================================
console.log(`\n📊 VowVet Daily Monitor — ${new Date().toISOString().slice(0, 16).replace("T", " ")}\n`);
console.log("=".repeat(60));

const today = new Date().toISOString().slice(0, 10);
const sevenDaysAgo = Date.now() - 7 * 24 * 3600_000;

// USERS
const users = await listRows("users");
const activeUsers = users.filter((u) => u.phone && !u.deleted_at);
const newUsers7d = activeUsers.filter(
  (u) => u.created_at && new Date(u.created_at).getTime() >= sevenDaysAgo
);
console.log(`\n👥 USERS`);
console.log(`  Active: ${activeUsers.length}/${users.length}`);
console.log(`  New (7d): ${newUsers7d.length}`);
const vets = activeUsers.filter((u) => u.is_vet === true);
console.log(`  Vets: ${vets.length}`);

// PETS
const pets = (await listRows("pets")).filter((p) => p.name);
const dogs = pets.filter((p) => {
  const sp = typeof p.species === "object" ? p.species?.value : p.species;
  return sp === "dog";
});
const cats = pets.filter((p) => {
  const sp = typeof p.species === "object" ? p.species?.value : p.species;
  return sp === "cat";
});
console.log(`\n🐾 PETS`);
console.log(`  Total: ${pets.length} (🐶 ${dogs.length} · 🐱 ${cats.length})`);

// AI COST
let aiToday = 0;
let aiAll = 0;
let aiCallsAll = 0;
try {
  const content = await readFile(USAGE_LOG_PATH, "utf-8");
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const cost = Number(e.cost_usd) || 0;
      aiAll += cost;
      aiCallsAll++;
      if (e.ts?.startsWith(today)) aiToday += cost;
    } catch {}
  }
} catch {}
console.log(`\n💰 AI COST`);
console.log(`  Today: $${aiToday.toFixed(4)}`);
console.log(`  All-time: $${aiAll.toFixed(4)} (${aiCallsAll} calls)`);

// TRIAGE
const triage = (await listRows("triage_sessions")).filter((s) => s.ai_urgency_level);
const triageUrgent = triage.filter((s) => Number(s.ai_urgency_level) >= 4);
console.log(`\n🩺 TRIAGE`);
console.log(`  Total sessions: ${triage.length}`);
console.log(`  Urgency ≥4 (urgent/emergency): ${triageUrgent.length}`);

// CHAT
const threads = (await listRows("chat_threads")).filter((t) => t.subject);
const waiting = threads.filter((t) => {
  const s = typeof t.status === "object" ? t.status?.value : t.status;
  return s === "waiting_vet";
});
const open = threads.filter((t) => {
  const s = typeof t.status === "object" ? t.status?.value : t.status;
  return s === "open";
});
const closed = threads.filter((t) => {
  const s = typeof t.status === "object" ? t.status?.value : t.status;
  return s === "closed";
});

// SLA breaches
const SLA_MINUTES = 120;
const breaches = waiting.filter((t) => {
  if (!t.created_at) return false;
  const age = (Date.now() - new Date(t.created_at).getTime()) / 60_000;
  return age > SLA_MINUTES;
});

console.log(`\n💬 CHAT`);
console.log(`  Total threads: ${threads.length}`);
console.log(`  Waiting vet: ${waiting.length}`);
console.log(`  Active (open): ${open.length}`);
console.log(`  Closed: ${closed.length}`);
console.log(`  🚨 SLA breach (waiting >${SLA_MINUTES}min): ${breaches.length}`);
if (breaches.length > 0) {
  for (const b of breaches.slice(0, 5)) {
    const age = Math.round((Date.now() - new Date(b.created_at).getTime()) / 60_000);
    console.log(`    • thread ${b.id} "${b.subject}" — waiting ${age} min`);
  }
}

// ALERTS (climate)
const alerts = (await listRows("climate_alerts")).filter((a) => a.severity);
const activeAlerts = alerts.filter((a) => !a.dismissed_at);
console.log(`\n🌡️ CLIMATE ALERTS`);
console.log(`  Total: ${alerts.length}, active: ${activeAlerts.length}`);

// VACCINES
const vaccinesCount = await listCount("vaccines");
const vacScheduleCount = await listCount("vaccine_schedules");
console.log(`\n💉 VACCINES`);
console.log(`  Records: ${vaccinesCount}, templates: ${vacScheduleCount}`);

// HEALTH score
const healthScore = computeHealth({
  sla_breaches: breaches.length,
  ai_today: aiToday,
  active_users: activeUsers.length,
  vets: vets.length,
});

console.log(`\n${"=".repeat(60)}`);
console.log(`\n🎯 OVERALL HEALTH: ${healthScore.label} ${healthScore.icon}`);
if (healthScore.warnings.length > 0) {
  console.log(`\n⚠️  Warnings:`);
  for (const w of healthScore.warnings) console.log(`  • ${w}`);
}
console.log("");

// Save snapshot
await mkdir("./data", { recursive: true });
const snapshotPath = `./data/daily-monitor-${today}.json`;
const snapshot = {
  ts: new Date().toISOString(),
  users: { total: users.length, active: activeUsers.length, new_7d: newUsers7d.length, vets: vets.length },
  pets: { total: pets.length, dogs: dogs.length, cats: cats.length },
  ai_cost: { today_usd: aiToday, all_time_usd: aiAll, total_calls: aiCallsAll },
  triage: { total: triage.length, urgent_or_emergency: triageUrgent.length },
  chat: {
    total: threads.length,
    waiting_vet: waiting.length,
    open: open.length,
    closed: closed.length,
    sla_breaches: breaches.length,
  },
  alerts: { total: alerts.length, active: activeAlerts.length },
  vaccines: { records: vaccinesCount, templates: vacScheduleCount },
  health: healthScore,
};
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
console.log(`💾 Snapshot saved: ${snapshotPath}\n`);

// Exit code based on health
if (healthScore.label === "CRITICAL") process.exit(2);
if (healthScore.label === "WARN") process.exit(1);

function computeHealth(m: {
  sla_breaches: number;
  ai_today: number;
  active_users: number;
  vets: number;
}): { label: "OK" | "WARN" | "CRITICAL"; icon: string; warnings: string[] } {
  const warnings: string[] = [];
  let critical = false;
  let warn = false;

  if (m.sla_breaches > 3) {
    warnings.push(`${m.sla_breaches} thread chờ vet >2h — vet cần phụ trách ngay`);
    critical = true;
  } else if (m.sla_breaches > 0) {
    warnings.push(`${m.sla_breaches} thread chờ vet >2h — chú ý SLA`);
    warn = true;
  }
  if (m.ai_today > 5) {
    warnings.push(`AI cost today $${m.ai_today.toFixed(2)} — vượt budget $5`);
    critical = true;
  } else if (m.ai_today > 2) {
    warnings.push(`AI cost today $${m.ai_today.toFixed(2)} — gần budget $5`);
    warn = true;
  }
  if (m.vets === 0) {
    warnings.push("Không có vet nào active — chat thread sẽ không ai handle");
    critical = true;
  }
  if (m.active_users === 0) {
    warnings.push("Không có user nào active — onboard chưa work?");
    warn = true;
  }

  if (critical) return { label: "CRITICAL", icon: "🔴", warnings };
  if (warn) return { label: "WARN", icon: "🟠", warnings };
  return { label: "OK", icon: "🟢", warnings };
}
