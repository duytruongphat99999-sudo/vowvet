/**
 * Analytics aggregations (M10).
 *
 * Sources:
 *   - /app/data/gemini-usage.log.jsonl → AI cost trends
 *   - chat_threads + chat_messages    → vet workload + response time
 *   - triage_sessions                  → urgency distribution + red flag hits
 *   - notification_log                 → push reliability
 *
 * Phase 0: aggregate on-demand (no materialized views). Acceptable for pilot scale.
 */
import { readFile } from "node:fs/promises";
import { listRows } from "@shared/baserow.ts";
import { TRIAGE_SYMPTOMS, getSymptom } from "@shared/triage-symptoms.ts";

const USAGE_LOG_PATH = process.env.GEMINI_USAGE_LOG || "/app/data/gemini-usage.log.jsonl";

// ============================================================
// AI cost analytics
// ============================================================

interface UsageEntry {
  ts: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  pet_id?: number;
  user_id?: number;
  feature?: string; // "triage" hoặc undefined (care-plan default)
}

async function readUsageLog(): Promise<UsageEntry[]> {
  try {
    const content = await readFile(USAGE_LOG_PATH, "utf-8");
    const entries: UsageEntry[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as UsageEntry);
      } catch {}
    }
    return entries;
  } catch {
    return [];
  }
}

export interface AiCostSummary {
  today_usd: number;
  yesterday_usd: number;
  week_usd: number;
  month_usd: number;
  all_time_usd: number;
  by_feature: Record<string, { calls: number; cost_usd: number }>;
  by_day_last_7: Array<{ date: string; cost_usd: number; calls: number }>;
  total_calls: number;
}

export async function aiCostSummary(): Promise<AiCostSummary> {
  const entries = await readUsageLog();
  const todayISO = new Date().toISOString().slice(0, 10);
  const yesterdayISO = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
  const weekCutoff = Date.now() - 7 * 24 * 3600_000;
  const monthCutoff = Date.now() - 30 * 24 * 3600_000;

  let today = 0,
    yest = 0,
    week = 0,
    month = 0,
    all = 0;
  const byFeature: Record<string, { calls: number; cost_usd: number }> = {};
  const byDay = new Map<string, { cost_usd: number; calls: number }>();

  for (const e of entries) {
    const cost = e.cost_usd || 0;
    const ts = new Date(e.ts).getTime();
    const day = e.ts.slice(0, 10);
    const feature = e.feature || "care_plan";

    all += cost;
    if (day === todayISO) today += cost;
    if (day === yesterdayISO) yest += cost;
    if (ts >= weekCutoff) week += cost;
    if (ts >= monthCutoff) month += cost;

    if (!byFeature[feature]) byFeature[feature] = { calls: 0, cost_usd: 0 };
    byFeature[feature].calls++;
    byFeature[feature].cost_usd += cost;

    const dayAgg = byDay.get(day) || { cost_usd: 0, calls: 0 };
    dayAgg.cost_usd += cost;
    dayAgg.calls++;
    byDay.set(day, dayAgg);
  }

  // Build last 7 days incl. today
  const last7: Array<{ date: string; cost_usd: number; calls: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000).toISOString().slice(0, 10);
    const agg = byDay.get(d) || { cost_usd: 0, calls: 0 };
    last7.push({
      date: d,
      cost_usd: Math.round(agg.cost_usd * 10_000) / 10_000,
      calls: agg.calls,
    });
  }

  return {
    today_usd: Math.round(today * 10_000) / 10_000,
    yesterday_usd: Math.round(yest * 10_000) / 10_000,
    week_usd: Math.round(week * 10_000) / 10_000,
    month_usd: Math.round(month * 10_000) / 10_000,
    all_time_usd: Math.round(all * 10_000) / 10_000,
    by_feature: Object.fromEntries(
      Object.entries(byFeature).map(([k, v]) => [
        k,
        { calls: v.calls, cost_usd: Math.round(v.cost_usd * 10_000) / 10_000 },
      ])
    ),
    by_day_last_7: last7,
    total_calls: entries.length,
  };
}

// ============================================================
// Vet workload analytics
// ============================================================

export interface VetWorkloadSummary {
  total_threads_handled: number;
  open_count: number;
  closed_count: number;
  avg_response_time_minutes: number | null; // first owner msg → first vet msg
  threads_last_7_days: number;
  avg_messages_per_thread: number | null;
}

export async function vetWorkloadSummary(vetId: number): Promise<VetWorkloadSummary> {
  // List threads vet đã claim
  const threadsRes = await listRows<any>("chat_threads", {
    filter: { vet_user_id__link_row_has: String(vetId) },
    size: 200,
  });
  const threads = threadsRes.results.filter((r: any) => r.subject);

  let openCount = 0;
  let closedCount = 0;
  let last7Count = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600_000;

  for (const t of threads) {
    const status = typeof t.status === "object" ? t.status?.value : t.status;
    if (status === "open") openCount++;
    else if (status === "closed") closedCount++;
    const createdMs = t.created_at ? new Date(t.created_at).getTime() : 0;
    if (createdMs >= sevenDaysAgo) last7Count++;
  }

  // Compute avg response time + messages per thread (fetch messages once)
  let totalResponseMs = 0;
  let respondedThreads = 0;
  let totalMessages = 0;

  // Batch fetch messages cho all threads (limit to first 20 newest để giảm load)
  const recentThreads = threads.slice(0, 20);
  for (const t of recentThreads) {
    try {
      const mRes = await listRows<any>("chat_messages", {
        filter: { thread_id__link_row_has: String(t.id) },
        size: 100,
      });
      const msgs = mRes.results.filter((m: any) => m.content);
      totalMessages += msgs.length;

      // Find first owner message + first vet message after that
      const sortedMsgs = msgs.sort((a: any, b: any) => {
        const ta = new Date(a.created_at).getTime() || 0;
        const tb = new Date(b.created_at).getTime() || 0;
        return ta - tb;
      });
      let firstOwnerMs: number | null = null;
      let firstVetMs: number | null = null;
      for (const m of sortedMsgs) {
        const role = typeof m.sender_role === "object" ? m.sender_role?.value : m.sender_role;
        const tms = new Date(m.created_at).getTime();
        if (role === "owner" && firstOwnerMs === null) firstOwnerMs = tms;
        if (role === "vet" && firstOwnerMs !== null && firstVetMs === null) {
          firstVetMs = tms;
          break;
        }
      }
      if (firstOwnerMs && firstVetMs) {
        totalResponseMs += firstVetMs - firstOwnerMs;
        respondedThreads++;
      }
    } catch {}
  }

  return {
    total_threads_handled: threads.length,
    open_count: openCount,
    closed_count: closedCount,
    avg_response_time_minutes:
      respondedThreads > 0 ? Math.round(totalResponseMs / respondedThreads / 60_000) : null,
    threads_last_7_days: last7Count,
    avg_messages_per_thread:
      recentThreads.length > 0 ? Math.round((totalMessages / recentThreads.length) * 10) / 10 : null,
  };
}

// ============================================================
// Triage analytics
// ============================================================

export interface TriageSummary {
  total_sessions: number;
  by_urgency: Record<number, number>;
  red_flag_hits: number; // sessions có ≥1 symptom red_flag
  top_symptoms: Array<{ id: string; name_vi: string; count: number }>;
  user_action_breakdown: Record<string, number>;
  sessions_last_7_days: number;
  avg_cost_usd: number;
}

export async function triageSummary(): Promise<TriageSummary> {
  const res = await listRows<any>("triage_sessions", { size: 200 });
  const sessions = res.results.filter((r: any) => r.ai_urgency_level);

  const byUrgency: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const actionBreakdown: Record<string, number> = {};
  const symptomCounts = new Map<string, number>();
  let redFlagHits = 0;
  let totalCost = 0;
  let last7Count = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600_000;

  for (const s of sessions) {
    const urgency = Number(s.ai_urgency_level) || 0;
    if (urgency >= 1 && urgency <= 5) byUrgency[urgency]++;

    // Symptom parsing
    let symIds: string[] = [];
    try {
      if (s.symptoms_json) {
        const parsed = JSON.parse(s.symptoms_json);
        if (Array.isArray(parsed)) symIds = parsed.filter((x) => typeof x === "string");
      }
    } catch {}
    let hasRedFlag = false;
    for (const id of symIds) {
      const sym = getSymptom(id);
      if (sym) {
        symptomCounts.set(id, (symptomCounts.get(id) || 0) + 1);
        if (sym.red_flag) hasRedFlag = true;
      }
    }
    if (hasRedFlag) redFlagHits++;

    const action = typeof s.user_action_taken === "object" ? s.user_action_taken?.value : s.user_action_taken;
    if (action) actionBreakdown[action] = (actionBreakdown[action] || 0) + 1;

    totalCost += Number(s.ai_cost_usd) || 0;

    // Last 7 days — use id-proxy since no created_at field
    // Approximate: assume newer ids = newer. Skip this metric if no timestamp.
    // Phase 1 hack: use s.id descending heuristic
  }

  // Top 10 symptoms
  const topSymptoms = [...symptomCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({
      id,
      name_vi: getSymptom(id)?.name_vi || id,
      count,
    }));

  return {
    total_sessions: sessions.length,
    by_urgency: byUrgency,
    red_flag_hits: redFlagHits,
    top_symptoms: topSymptoms,
    user_action_breakdown: actionBreakdown,
    sessions_last_7_days: sessions.length, // Phase 0 approximation
    avg_cost_usd:
      sessions.length > 0 ? Math.round((totalCost / sessions.length) * 10_000) / 10_000 : 0,
  };
}

// ============================================================
// Pilot SLA check — threads waiting >2h chưa được claim
// ============================================================

export interface SlaBreach {
  thread_id: number;
  subject: string;
  owner_user_id: number;
  pet_name: string | null;
  waiting_minutes: number;
  created_at: string;
}

export async function checkSlaBreaches(thresholdMinutes = 120): Promise<SlaBreach[]> {
  const res = await listRows<any>("chat_threads", {
    filter: { status__single_select_equal: "waiting_vet" },
    size: 100,
  });
  const threads = res.results.filter((r: any) => r.subject);
  const cutoff = Date.now() - thresholdMinutes * 60_000;

  const breaches: SlaBreach[] = [];
  for (const t of threads) {
    const status = typeof t.status === "object" ? t.status?.value : t.status;
    if (status !== "waiting_vet") continue;
    const createdMs = t.created_at ? new Date(t.created_at).getTime() : 0;
    if (createdMs === 0 || createdMs > cutoff) continue;

    const ownerLinks = Array.isArray(t.owner_user_id) ? t.owner_user_id : [];
    const petLinks = Array.isArray(t.pet_id) ? t.pet_id : [];
    breaches.push({
      thread_id: t.id,
      subject: t.subject,
      owner_user_id: ownerLinks[0]?.id || 0,
      pet_name: petLinks[0]?.value || null,
      waiting_minutes: Math.round((Date.now() - createdMs) / 60_000),
      created_at: t.created_at,
    });
  }
  return breaches.sort((a, b) => b.waiting_minutes - a.waiting_minutes);
}

// ============================================================
// Composite admin overview
// ============================================================

export interface AnalyticsOverview {
  ai_cost: AiCostSummary;
  triage: TriageSummary;
  sla_breaches: SlaBreach[];
}

export async function adminAnalyticsOverview(): Promise<AnalyticsOverview> {
  const [ai_cost, triage, sla_breaches] = await Promise.all([
    aiCostSummary(),
    triageSummary(),
    checkSlaBreaches(),
  ]);
  return { ai_cost, triage, sla_breaches };
}
