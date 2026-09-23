import { FOCUS_SLOT_MINUTES, ACCENT_WARM, ALERT, SAGE } from "./constants.js";

// One capacity rule for the Week view, the Month view and the Insight forecast, so a day
// reads the same everywhere. A day's Focus capacity follows the account's own Focus Work
// limit; Small Batch and Delegation have a fixed daily allowance.
export const SMALL_BATCH_CAP = 120;
export const DELEGATION_CAP = 20;
export const dayCapacity = (focusLimit) => ({ focus: focusLimit * FOCUS_SLOT_MINUTES, smallBatch: SMALL_BATCH_CAP, delegation: DELEGATION_CAP });

const TYPE_TO_CATEGORY = { focus: "focus", smallbatch: "smallBatch", delegation: "delegation" };

// The open work a day holds, in minutes per work type, together with the tasks themselves.
// With a plan: the open tasks seated in it (a finished task no longer counts), plus any open
// task pinned to the day that the plan does not hold yet. Without one: the open tasks pinned
// to the day, plus `extra` (repeating tasks due that day, say).
export function dayLoad(plan, tasks, date, extra = []) {
  const openById = new Map(tasks.filter(t => t.status !== "done").map(t => [t.id, t]));
  const load = { focus: 0, smallBatch: 0, delegation: 0, tasks: [] };
  const seen = new Set();
  const count = (t, category = t.category) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    load.tasks.push(t);
    if (category in load && category !== "tasks") load[category] += Number(t.duration) || 0;
  };
  if (plan) {
    plan.schedule.forEach(b => {
      const ids = b.fixedTaskId ? [b.fixedTaskId] : (b.taskIds || []);
      ids.forEach(id => { const t = openById.get(id); if (t) count(t, t.category in load ? t.category : TYPE_TO_CATEGORY[b.type]); });
    });
  }
  tasks.filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === date).forEach(t => count(t));
  extra.forEach(t => count(t));
  return load;
}

// How full a day is against its capacity: the busiest of its Focus and Small Batch shares.
export const loadRatio = (load, cap) => Math.max(cap.focus ? load.focus / cap.focus : 0, cap.smallBatch ? load.smallBatch / cap.smallBatch : 0);

// The word (and colour) for a load: over 100% is always red.
export function loadLevel(ratio, { planned = true } = {}) {
  if (ratio > 1) return { label: "Over capacity", color: ALERT, key: "over" };
  if (ratio >= 0.85) return { label: "Heavy Day", color: ACCENT_WARM, key: "heavy" };
  if (ratio >= 0.5) return { label: "Moderate Day", color: ACCENT_WARM, key: "moderate" };
  if (ratio > 0) return { label: "Light Day", color: SAGE, key: "light" };
  return planned ? { label: "Open Day", color: SAGE, key: "open" } : { label: "Unplanned", color: "rgba(0,0,0,0.3)", key: "unplanned" };
}
