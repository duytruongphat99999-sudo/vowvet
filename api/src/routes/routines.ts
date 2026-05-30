/**
 * Routine routes (M19).
 *
 * Mount strategy:
 *   app.route("/api/v1/routines", routinesGlobalRoute)  — /templates
 *   app.route("/api/v1/pets", petRoutinesRoute)         — /:id/routines[...]
 *
 * Endpoints:
 *   GET    /pets/:id/routines                       — list active routines
 *   POST   /pets/:id/routines                       — create
 *   GET    /pets/:id/routines/today                 — today scheduled + completions
 *   GET    /pets/:id/routines/calendar?year&month   — month completions
 *   GET    /pets/:id/routines/streak                — streak info + badges
 *   POST   /pets/:id/routines/streak/use-freeze     — burn 1 freeze, +1 streak
 *   GET    /pets/:id/routines/:rid                  — single routine
 *   PUT    /pets/:id/routines/:rid                  — update
 *   DELETE /pets/:id/routines/:rid                  — soft delete
 *   POST   /pets/:id/routines/:rid/complete         — log completion
 *
 *   GET    /routines/templates                      — preset templates
 */
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.ts";
import { getOwnedPet } from "../lib/pets.ts";
import {
  listRoutines,
  getRoutineById,
  createRoutine,
  updateRoutineRow,
  softDeleteRoutine,
  getTodayScheduledRoutines,
  getTodayCompletions,
  getCompletionsByMonth,
  getStreak,
  logCompletion,
  useStreakFreeze,
  maybeUnlockPerfectionist,
} from "../lib/routines.ts";
import {
  ROUTINE_TEMPLATES,
  ROUTINE_BADGES,
  type RoutineTask,
  type RoutineScheduleType,
} from "@shared/routine-badges.ts";

const VALID_SCHEDULES: RoutineScheduleType[] = ["daily", "weekdays", "weekends", "custom"];
const VALID_CATEGORIES = ["food", "exercise", "grooming", "health", "training", "play", "other"];

function sanitizeTasks(raw: any): RoutineTask[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t, idx) => {
      if (!t || typeof t !== "object") return null;
      const title = String(t.title || "").trim().slice(0, 100);
      if (!title) return null;
      return {
        id: String(t.id || `t${idx + 1}`).slice(0, 32),
        title,
        emoji: String(t.emoji || "📌").slice(0, 4),
        duration_minutes: Math.max(1, Math.min(180, Number(t.duration_minutes) || 5)),
        points: Math.max(1, Math.min(5, Number(t.points) || 1)),
        category: VALID_CATEGORIES.includes(t.category) ? t.category : "other",
        notes: t.notes ? String(t.notes).slice(0, 200) : undefined,
      } as RoutineTask;
    })
    .filter(Boolean) as RoutineTask[];
}

function isValidHexColor(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// ================================================================
// /api/v1/routines/* — global (templates)
// ================================================================
export const routinesGlobalRoute = new Hono();
routinesGlobalRoute.use("*", requireAuth);

routinesGlobalRoute.get("/templates", (c) => {
  return c.json({ templates: ROUTINE_TEMPLATES, total: ROUTINE_TEMPLATES.length });
});

routinesGlobalRoute.get("/badges", (c) => {
  return c.json({ badges: Object.values(ROUTINE_BADGES) });
});

// ================================================================
// /api/v1/pets/:id/routines/* — pet-scoped
// ================================================================
export const petRoutinesRoute = new Hono();
petRoutinesRoute.use("*", requireAuth);

// ─── GET list ───
petRoutinesRoute.get("/:id{[0-9]+}/routines", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const routines = await listRoutines(petId);
    return c.json({ routines, total: routines.length });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[routines/list] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load routines" } }, 500);
  }
});

// ─── GET today ───
petRoutinesRoute.get("/:id{[0-9]+}/routines/today", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const [scheduled, completions, streak] = await Promise.all([
      getTodayScheduledRoutines(petId),
      getTodayCompletions(petId),
      getStreak(petId),
    ]);
    // Map completion by routine_id for quick lookup
    const completionMap = new Map(completions.map((c) => [c.routine_id, c]));
    const today = scheduled.map((r) => ({
      ...r,
      completion: completionMap.get(r.id) || null,
    }));
    const completedCount = today.filter((r) => r.completion && r.completion.tasks_completion_rate >= 50).length;
    return c.json({
      today,
      streak,
      scheduled_count: scheduled.length,
      completed_count: completedCount,
      pending_count: Math.max(0, scheduled.length - completedCount),
    });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[routines/today] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load today" } }, 500);
  }
});

// ─── GET calendar ───
petRoutinesRoute.get("/:id{[0-9]+}/routines/calendar", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const now = new Date();
  const year = Number(c.req.query("year")) || now.getFullYear();
  const month = Number(c.req.query("month")) || (now.getMonth() + 1);
  try {
    await getOwnedPet(petId, session.sub);
    const [completions, routines, streak] = await Promise.all([
      getCompletionsByMonth(petId, year, month),
      listRoutines(petId, true),
      getStreak(petId),
    ]);
    // Group by date
    const byDate: Record<string, any[]> = {};
    for (const c of completions) {
      if (!byDate[c.completion_date]) byDate[c.completion_date] = [];
      const routine = routines.find((r) => r.id === c.routine_id);
      byDate[c.completion_date].push({
        ...c,
        routine_name: routine?.name || "Routine",
        routine_icon: routine?.icon || "📋",
        routine_color: routine?.color || "#6366F1",
      });
    }
    return c.json({ year, month, by_date: byDate, streak });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[routines/calendar] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi calendar" } }, 500);
  }
});

// ─── GET streak ───
petRoutinesRoute.get("/:id{[0-9]+}/routines/streak", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const streak = await getStreak(petId);
    return c.json(streak);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi streak" } }, 500);
  }
});

// ─── POST use-freeze ───
petRoutinesRoute.post("/:id{[0-9]+}/routines/streak/use-freeze", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  try {
    await getOwnedPet(petId, session.sub);
    const result = await useStreakFreeze(petId);
    if (!result.ok) {
      return c.json({ error: { code: "NO_FREEZE", message: "Hết ngày phép tháng này" } }, 400);
    }
    const streak = await getStreak(petId);
    return c.json({ ok: true, remaining: result.remaining, streak });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi freeze" } }, 500);
  }
});

// ─── POST create routine ───
petRoutinesRoute.post("/:id{[0-9]+}/routines", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return c.json({ error: { code: "NAME_REQUIRED", message: "Tên routine bắt buộc" } }, 400);

  const tasks = sanitizeTasks(body.tasks);
  if (tasks.length === 0) return c.json({ error: { code: "NO_TASKS", message: "Cần ít nhất 1 task" } }, 400);

  const schedule_type = VALID_SCHEDULES.includes(body.schedule_type) ? body.schedule_type : "daily";
  const start_time = typeof body.start_time === "string" && isValidTime(body.start_time) ? body.start_time : "08:00";
  const color = typeof body.color === "string" && isValidHexColor(body.color) ? body.color : "#6366F1";
  const icon = typeof body.icon === "string" ? body.icon.slice(0, 4) : "📋";
  const custom_days = Array.isArray(body.custom_days) ? body.custom_days.map(String).slice(0, 7) : [];

  try {
    await getOwnedPet(petId, session.sub);
    const routine = await createRoutine({
      petId,
      name,
      icon,
      color,
      schedule_type,
      custom_days,
      start_time,
      tasks,
      push_reminder: body.push_reminder !== false,
    });
    return c.json(routine, 201);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[routines/create] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi tạo routine" } }, 500);
  }
});

// ─── GET single routine ───
petRoutinesRoute.get("/:id{[0-9]+}/routines/:rid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const routineId = Number(c.req.param("rid"));
  try {
    await getOwnedPet(petId, session.sub);
    const routine = await getRoutineById(routineId);
    if (!routine || routine.pet_id !== petId) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy routine" } }, 404);
    }
    return c.json(routine);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi load routine" } }, 500);
  }
});

// ─── PUT update ───
petRoutinesRoute.put("/:id{[0-9]+}/routines/:rid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const routineId = Number(c.req.param("rid"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  try {
    await getOwnedPet(petId, session.sub);
    const existing = await getRoutineById(routineId);
    if (!existing || existing.pet_id !== petId) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy routine" } }, 404);
    }

    const patch: any = {};
    if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 80);
    if (typeof body.icon === "string") patch.icon = body.icon.slice(0, 4);
    if (typeof body.color === "string" && isValidHexColor(body.color)) patch.color = body.color;
    if (VALID_SCHEDULES.includes(body.schedule_type)) patch.schedule_type = body.schedule_type;
    if (Array.isArray(body.custom_days)) patch.custom_days = body.custom_days.map(String).slice(0, 7);
    if (typeof body.start_time === "string" && isValidTime(body.start_time)) patch.start_time = body.start_time;
    if (Array.isArray(body.tasks)) {
      const tasks = sanitizeTasks(body.tasks);
      if (tasks.length === 0) return c.json({ error: { code: "NO_TASKS", message: "Cần ít nhất 1 task" } }, 400);
      patch.tasks = tasks;
    }
    if (typeof body.push_reminder === "boolean") patch.push_reminder = body.push_reminder;
    if (typeof body.active === "boolean") patch.active = body.active;

    const updated = await updateRoutineRow(routineId, patch);
    return c.json(updated);
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[routines/update] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi update routine" } }, 500);
  }
});

// ─── DELETE (soft) ───
petRoutinesRoute.delete("/:id{[0-9]+}/routines/:rid{[0-9]+}", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const routineId = Number(c.req.param("rid"));
  try {
    await getOwnedPet(petId, session.sub);
    const existing = await getRoutineById(routineId);
    if (!existing || existing.pet_id !== petId) {
      return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy routine" } }, 404);
    }
    await softDeleteRoutine(routineId);
    return c.json({ ok: true });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    return c.json({ error: { code: "INTERNAL", message: "Lỗi xoá routine" } }, 500);
  }
});

// ─── POST complete ───
petRoutinesRoute.post("/:id{[0-9]+}/routines/:rid{[0-9]+}/complete", async (c) => {
  const session = c.get("user");
  const petId = Number(c.req.param("id"));
  const routineId = Number(c.req.param("rid"));

  let body: any;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Body phải JSON" } }, 400);
  }

  const taskIds = Array.isArray(body.completed_task_ids) ? body.completed_task_ids.map(String) : [];
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 200) : undefined;

  try {
    await getOwnedPet(petId, session.sub);
    const result = await logCompletion(petId, routineId, taskIds, notes);

    // Maybe perfectionist
    const perfectBadges = await maybeUnlockPerfectionist(petId, result.completion.tasks_completion_rate);
    if (perfectBadges.length > 0) {
      result.badgesUnlocked = [...result.badgesUnlocked, ...perfectBadges];
    }

    // Quest hook: real routine completion. Only fires if at least one task was completed.
    let completedQuests: any[] = [];
    if (taskIds.length > 0) {
      try {
        const { trackQuestTrigger } = await import("../lib/daily-quests.ts");
        completedQuests = await trackQuestTrigger(session.sub, petId, "routine_complete");
      } catch (err) {
        console.error("[routines/complete] quest track failed:", err);
      }
    }

    return c.json({
      completion: result.completion,
      streak: result.badgesUnlocked.length > 0 ? await getStreak(petId) : result.streak,
      newStreak: result.streak.current_streak,
      badgesUnlocked: result.badgesUnlocked,
      pointsEarned: result.pointsEarned,
      completed_quests: completedQuests,
    });
  } catch (err: any) {
    if (err?.status === 404 || err?.status === 403) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error("[routines/complete] error:", err);
    return c.json({ error: { code: "INTERNAL", message: "Lỗi log completion" } }, 500);
  }
});
