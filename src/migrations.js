import { NO_SCHEDULE_TYPES, MIN_TASK_MINUTES } from "./constants.js";
import { timeToMins } from "./utils.js";

// No-Schedule Windows used to be their own list beside the board. They are tasks of the
// noSchedule work type now. This moves an account's old windows onto the board once — a
// window whose day has passed arrives as history — and points the blocks they already hold
// in open plans at those tasks, so the Day view sees each window in its plan.
export function windowsToTasks(blocks, tasks, dayPlans, today) {
  const list = Array.isArray(blocks) ? blocks.filter(b => b && b.id && b.date) : [];
  if (!list.length) return { tasks, dayPlans, changed: false };
  const have = new Set(tasks.map(t => t.id));
  const fresh = list.filter(p => !have.has(p.id)).map(p => {
    const start = timeToMins(p.startTime || "12:00");
    const end = timeToMins(p.endTime || p.startTime || "13:00");
    const past = p.date < today;
    return {
      id: p.id, title: p.title || "No-Schedule Window", unit: "", category: "noSchedule",
      workType: NO_SCHEDULE_TYPES.includes(p.category) ? p.category : NO_SCHEDULE_TYPES[0],
      priority: "", importance: "", duration: Math.max(MIN_TASK_MINUTES, end - start),
      scheduleMode: "DEFINE", date: p.date, time: p.startTime || "12:00", notes: "",
      status: past ? "done" : "open", completedAt: past ? Date.parse(`${p.date}T23:59:00`) : null,
      createdAt: Date.now(), carryForwardCount: 0, sessions: [], movedFromWindow: true,
    };
  });
  const ids = new Set(list.map(p => p.id));
  let plansChanged = false;
  const nextPlans = { ...dayPlans };
  for (const [date, plan] of Object.entries(dayPlans)) {
    if (!plan || plan.concluded || date < today) continue;
    let touched = false;
    const schedule = plan.schedule.map(b => {
      const m = /^personal-(.+)$/.exec(b.key || "");
      if (!m || !ids.has(m[1]) || b.fixedTaskId) return b;
      touched = true;
      return { ...b, key: `task-${m[1]}`, taskIds: [m[1]], fixedTaskId: m[1] };
    });
    if (touched) { nextPlans[date] = { ...plan, schedule }; plansChanged = true; }
  }
  return { tasks: fresh.length ? [...fresh, ...tasks] : tasks, dayPlans: plansChanged ? nextPlans : dayPlans, changed: fresh.length > 0 || plansChanged };
}

// A No-Schedule Window whose day has passed drops off the open board by itself: it is done
// with, and needs no ticking.
export function retirePastWindows(tasks, today) {
  let changed = false;
  const next = tasks.map(t => {
    if (t.category !== "noSchedule" || t.status === "done" || !t.date || t.date >= today) return t;
    changed = true;
    return { ...t, status: "done", completedAt: Date.parse(`${t.date}T23:59:00`) };
  });
  return { tasks: changed ? next : tasks, changed };
}
