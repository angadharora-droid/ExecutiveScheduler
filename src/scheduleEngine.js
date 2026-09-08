import { PROPERTY_UNITS, FOCUS_SLOT_MINUTES, DEFAULT_FOCUS_LIMIT, clampFocusLimit } from "./constants.js";
import { timeToMins, todayISO } from "./utils.js";

/* ============================== SCHEDULE ARCHITECTURE ============================== */

const FW = FOCUS_SLOT_MINUTES;

// The day's block structure. A day holds at most `focusLimit` Focus Work slots — the
// user's own setting. The day type's built-in slots are trimmed to that limit first, then
// `extraFocus` appends more Focus blocks (each with a short break before it) up to it.
export function buildBlocks(dayType, half, extraFocus = 0, focusLimit = DEFAULT_FOCUS_LIMIT) {
  const limit = clampFocusLimit(focusLimit);
  return addExtraFocusBlocks(capFocusBlocks(baseBlocks(dayType, half), limit), extraFocus, limit);
}

// Drop Focus blocks beyond `limit` (and the short break that led into each), so a user who
// wants only two Focus slots a day gets exactly two on a Full Office Day. Lunch stays, but a
// short break left sitting right after another break (or first in the day) goes too.
export function capFocusBlocks(blocks, limit) {
  const out = [];
  let seen = 0;
  blocks.forEach(b => {
    if (b.type !== "focus") { out.push(b); return; }
    seen++;
    if (seen <= limit) { out.push(b); return; }
    const prev = out[out.length - 1];
    if (prev && prev.type === "break" && /^break/.test(prev.key)) out.pop();
  });
  if (seen <= limit) return blocks;
  return out.filter((b, i) => !(b.type === "break" && /^break/.test(b.key) && (i === 0 || out[i - 1].type === "break")));
}

// How many extra Focus slots `blocks` can still take under `limit`.
export const focusRoomLeft = (blocks, limit) => Math.max(0, clampFocusLimit(limit) - blocks.filter(b => b.type === "focus").length);

export function addExtraFocusBlocks(blocks, extraFocus, focusLimit = DEFAULT_FOCUS_LIMIT) {
  const n = Math.min(Math.max(0, Number(extraFocus) || 0), focusRoomLeft(blocks, focusLimit));
  if (!n) return blocks;
  const out = [...blocks];
  let lastFocus = -1;
  out.forEach((b, i) => { if (b.type === "focus") lastFocus = i; });
  const base = out.filter(b => b.type === "focus").length;
  const extras = [];
  for (let i = 1; i <= n; i++) {
    extras.push({ key: `break-focus${base + i}`, label: "Break", type: "break", duration: 10 });
    extras.push({ key: `focus${base + i}`, label: `Focus Work ${base + i}`, type: "focus", duration: FW });
  }
  out.splice(lastFocus > -1 ? lastFocus + 1 : out.length, 0, ...extras);
  return out;
}

function baseBlocks(dayType, half) {
  if (dayType === "full" || dayType === "wfh") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 30 },
      { key: "sb1", label: "Small Batch 1", type: "smallbatch", duration: 30 },
      { key: "break1", label: "Break", type: "break", duration: 10 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 20 },
      { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
      { key: "lunch", label: "Lunch", type: "break", duration: 40 },
      { key: "focus2", label: "Focus Work 2", type: "focus", duration: FW },
      { key: "break2", label: "Break", type: "break", duration: 10 },
      { key: "focus3", label: "Focus Work 3", type: "focus", duration: FW },
      { key: "break3", label: "Break", type: "break", duration: 15 },
      { key: "sb2", label: "Small Batch 2", type: "smallbatch", duration: 20 },
    ];
  }
  if (dayType === "half") {
    if (half === "second") {
      return [
        { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 15 },
        { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
        { key: "break1", label: "Break", type: "break", duration: 10 },
        { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 25 },
        { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
      ];
    }
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "sb1", label: "Small Batch 1", type: "smallbatch", duration: 25 },
      { key: "break1", label: "Break", type: "break", duration: 5 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
      { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
    ];
  }
  if (dayType === "travel") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "sb1", label: "Small Batch (phone-based)", type: "smallbatch", duration: 20 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
      { key: "focus1", label: "Focus Work (if reachable)", type: "focus", duration: FW },
    ];
  }
  if (dayType === "property" || dayType === "factory") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "visit", label: dayType === "property" ? "Property Visit" : "Factory Visit", type: "visit", duration: 180 },
      { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 20 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
    ];
  }
  if (dayType === "event") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "event", label: "Event / Function", type: "visit", duration: 120 },
      { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 20 },
    ];
  }
  return [
    { key: "warmup", label: "Warm Up", type: "warmup", duration: 20 },
    { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 25 },
    { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
  ];
}

/* ============================== FIXED-TIME BLOCKS ============================== */

export const EVENING_INTERACTION = { key: "evening", label: "Executive Interaction Window", type: "evening", start: 17 * 60 + 45, end: 19 * 60 + 15 };
export const EVENING_BUFFER = { key: "buffer", label: "Buffer & Pending Callbacks", type: "buffer", start: 19 * 60 + 15, end: 19 * 60 + 40 };
export const EVENING_CLOSURE = { key: "closure", label: "Closure & Tomorrow's Instructions", type: "closure", start: 19 * 60 + 40, end: 20 * 60 };

// Block types that are pinned to a clock time and must never be dragged along when the
// sequential (flow) blocks around them are re-laid: personal windows, special tasks, the
// evening window trio, and any task the user gave a "Define Time" clock time.
const ANCHORED_TYPES = new Set(["personal", "special", "evening", "buffer", "closure"]);
export const isAnchoredBlock = (b) => ANCHORED_TYPES.has(b.type) || !!b.fixedTaskId;

const TASK_BLOCK_TYPE = { smallBatch: "smallbatch", focus: "focus", delegation: "delegation" };
const MIN_BLOCK = 5;

const gapBlock = (start, end) => ({ key: `gap-${start}`, label: "FLEXIBLE / OPERATIONAL WINDOW", type: "flexible", duration: end - start, start, end, taskIds: [] });

// A task with a Define-Time clock time becomes its own block at exactly that time.
export function taskToFixedBlock(task) {
  const start = timeToMins(task.time);
  const duration = Math.max(MIN_BLOCK, Number(task.duration) || MIN_BLOCK);
  return {
    key: `task-${task.id}`, label: task.title, type: TASK_BLOCK_TYPE[task.category] || "smallbatch",
    start, end: start + duration, duration, taskIds: [task.id], fixedTaskId: task.id, unit: task.unit,
  };
}

export function personalToFixedBlock(p) {
  const start = timeToMins(p.startTime);
  const end = Math.max(timeToMins(p.endTime), start + MIN_BLOCK);
  return { key: `personal-${p.id}`, label: p.title, type: "personal", category: p.category, start, end, duration: end - start, taskIds: [] };
}

export function specialToFixedBlock(s) {
  const start = timeToMins(s.time);
  const duration = Math.max(MIN_BLOCK, Number(s.duration) || MIN_BLOCK);
  return { key: `special-${s.id}`, label: s.title, type: "special", start, end: start + duration, duration, taskIds: [] };
}

export function eveningFixedBlocks(mode, customStart, customEnd, stops) {
  if (mode === "skip") return [];
  const start = mode === "modify" ? timeToMins(customStart) : EVENING_INTERACTION.start;
  const end = Math.max(mode === "modify" ? timeToMins(customEnd) : EVENING_INTERACTION.end, start + MIN_BLOCK);
  const out = [{ key: "evening", label: EVENING_INTERACTION.label, type: "evening", duration: end - start, start, end, stops: stops || [], taskIds: [] }];
  if (mode !== "modify") {
    out.push({ ...EVENING_BUFFER, duration: EVENING_BUFFER.end - EVENING_BUFFER.start, taskIds: [] });
    out.push({ ...EVENING_CLOSURE, duration: EVENING_CLOSURE.end - EVENING_CLOSURE.start, taskIds: [], instructions: [] });
  }
  return out;
}

/* ============================== LAYOUT ============================== */

// Lay `flowBlocks` one after another from `cursorStart`, weaving in `fixedBlocks` at their
// own clock times. Every fixed block keeps its real start; a flow block that would overlap
// the next fixed block is pushed to after it. Idle time before a fixed block becomes a
// FLEXIBLE / OPERATIONAL WINDOW.
//
// Two fixed blocks can never sit on the same minutes: when one is asked for a time that an
// earlier fixed block already occupies, it is moved to start right after that block and
// flagged (`shifted`, with the clock time it asked for in `requestedStart`) so the Day view
// can say so. The requested time is what a later re-layout starts from, so the block goes
// back to its own time as soon as the clash is gone.
export function layoutWithFixed(flowBlocks, cursorStart, fixedBlocks) {
  const remaining = fixedBlocks
    .map(fx => {
      const start = fx.requestedStart ?? fx.start;
      const duration = Math.max(MIN_BLOCK, Number(fx.duration) || (fx.end - fx.start) || MIN_BLOCK);
      const { requestedStart, shifted, ...rest } = fx; // eslint-disable-line no-unused-vars
      return { ...rest, start, end: start + duration, duration, taskIds: fx.taskIds || [] };
    })
    .sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = cursorStart;
  let fixedEnd = -Infinity; // end of the latest fixed block placed so far

  const placeFixed = (fx) => {
    if (fx.start < fixedEnd) fx = { ...fx, requestedStart: fx.start, shifted: true, start: fixedEnd, end: fixedEnd + fx.duration };
    if (fx.start > cursor) out.push(gapBlock(cursor, fx.start));
    out.push(fx);
    fixedEnd = Math.max(fixedEnd, fx.end);
    cursor = Math.max(cursor, fx.end);
  };

  for (const b of flowBlocks) {
    // Re-check after each placement: the cursor moves, so a later fixed block may now collide.
    while (remaining.length && remaining[0].start < cursor + b.duration) placeFixed(remaining.shift());
    out.push({ ...b, start: cursor, end: cursor + b.duration, taskIds: b.taskIds || [] });
    cursor += b.duration;
  }
  while (remaining.length) placeFixed(remaining.shift());
  return { schedule: out, cursor };
}

// Re-lay an existing schedule after a change (drag reorder, task inserted/removed): anchored
// blocks stay at their clock times, flow blocks are re-sequenced in array order from the
// day's start time, and stale flexible gaps are dropped and regenerated.
export function relayoutSchedule(schedule, startTime) {
  const fixed = schedule.filter(isAnchoredBlock);
  const flow = schedule.filter(b => !isAnchoredBlock(b) && b.type !== "flexible");
  return layoutWithFixed(flow, timeToMins(startTime), fixed).schedule;
}

/* ============================== PLAN MUTATIONS ============================== */

export function planContainsTask(plan, taskId) {
  return !!plan && plan.schedule.some(b => (b.taskIds || []).includes(taskId) || b.fixedTaskId === taskId);
}

// Take a task out of a plan wherever it sits: its own fixed block is deleted, a shared
// block just loses the id (and, for delegation, the minutes it contributed).
export function removeTaskFromPlan(plan, taskId, taskDuration) {
  let removed = false;
  const schedule = [];
  for (const b of plan.schedule) {
    if (b.fixedTaskId === taskId) { removed = true; continue; }
    const ids = b.taskIds || [];
    if (!ids.includes(taskId)) { schedule.push(b); continue; }
    removed = true;
    const next = { ...b, taskIds: ids.filter(id => id !== taskId) };
    if (b.type === "delegation" && next.taskIds.length > 0 && taskDuration) next.duration = Math.max(MIN_BLOCK, b.duration - taskDuration);
    schedule.push(next);
  }
  if (!removed) return { schedule: plan.schedule, removed: false };
  return { schedule: relayoutSchedule(schedule, plan.startTime), removed: true };
}

// Place a task into an already-generated day. A task with a clock time gets its own block
// at that time; otherwise it joins the matching Small Batch / Delegation / Focus block.
// Everything after the change is re-laid so fixed blocks keep their times.
//
// `focusLimit` is the user's Focus Work slot limit: when every Focus slot is taken, one
// more is opened only while the day is still under that limit; otherwise the task is not
// inserted (it stays on the board, waiting for the day) and `inserted` is false.
export function insertTaskIntoPlan(plan, task, focusLimit = DEFAULT_FOCUS_LIMIT) {
  const base = removeTaskFromPlan(plan, task.id, task.duration).schedule;
  const schedule = base.map(b => ({ ...b, taskIds: [...(b.taskIds || [])] }));
  const duration = Math.max(MIN_BLOCK, Number(task.duration) || MIN_BLOCK);

  if (task.time) {
    return { schedule: relayoutSchedule([...schedule, taskToFixedBlock(task)], plan.startTime), inserted: true };
  }

  let targetIdx = -1;
  if (task.category === "smallBatch") {
    targetIdx = schedule.findIndex(b => b.type === "smallbatch" && b.key === "sb1");
    if (targetIdx === -1) targetIdx = schedule.findIndex(b => b.type === "smallbatch" && !b.fixedTaskId);
    if (targetIdx > -1 && schedule[targetIdx].taskIds.length < 10) schedule[targetIdx].taskIds.push(task.id);
    else targetIdx = -1;
  } else if (task.category === "delegation") {
    targetIdx = schedule.findIndex(b => b.type === "delegation" && !b.fixedTaskId);
    if (targetIdx > -1) {
      schedule[targetIdx].taskIds.push(task.id);
      schedule[targetIdx].duration += duration;
    }
  } else if (task.category === "focus") {
    targetIdx = schedule.findIndex(b => b.type === "focus" && !b.fixedTaskId && b.taskIds.length === 0);
    if (targetIdx > -1) {
      schedule[targetIdx].taskIds = [task.id];
      schedule[targetIdx].duration = duration;
    } else {
      // Every Focus slot is taken — open one more right after the last Focus block (with a
      // short break before it), but only while the day is under the user's Focus limit.
      const focusBlocks = schedule.filter(b => b.type === "focus" && !b.fixedTaskId);
      if (focusBlocks.length < clampFocusLimit(focusLimit)) {
        const n = focusBlocks.length + 1;
        let lastFocus = -1;
        schedule.forEach((b, i) => { if (b.type === "focus" && !b.fixedTaskId) lastFocus = i; });
        const at = lastFocus > -1 ? lastFocus + 1 : schedule.length;
        schedule.splice(at, 0,
          { key: `break-focus${n}`, label: "Break", type: "break", duration: 10, taskIds: [] },
          { key: `focus${n}`, label: `Focus Work ${n}`, type: "focus", duration, taskIds: [task.id] },
        );
        targetIdx = at + 1;
      }
    }
  }

  if (targetIdx === -1) return { schedule: plan.schedule, inserted: false };
  return { schedule: relayoutSchedule(schedule, plan.startTime), inserted: true };
}

// Drop the given tasks from every plan that is still open (not concluded) on or after
// `fromDate` — e.g. a task finished today must not still show up in tomorrow's plan.
export function removeTasksFromOpenPlans(dayPlans, tasksToRemove, fromDate) {
  let next = dayPlans;
  for (const [date, plan] of Object.entries(dayPlans)) {
    if (!plan || plan.concluded || date < fromDate) continue;
    let working = plan, changed = false;
    for (const t of tasksToRemove) {
      const { schedule, removed } = removeTaskFromPlan(working, t.id, t.duration);
      if (removed) { working = { ...working, schedule }; changed = true; }
    }
    if (changed) next = { ...next, [date]: working };
  }
  return next;
}

/* ============================== OVERDUE ============================== */

// Overdue relative to the day being planned or viewed: still open, pinned to an earlier
// date, and that date is already behind us (it has passed, or its day was concluded).
// Such tasks are pulled into the next day that gets planned.
export function isOverdueFor(task, dateISO, dayPlans) {
  if (!task || task.status === "done" || task.scheduleMode !== "DEFINE" || !task.date) return false;
  if (task.date >= dateISO) return false;
  return task.date < todayISO() || !!dayPlans?.[task.date]?.concluded;
}

/* ============================== EVENING SUGGESTIONS ============================== */

export function suggestEveningStops(tasks, weekdayLabel, weekday) {
  const suggestions = [];
  const propertyPending = tasks.filter(t => t.status !== "done" && PROPERTY_UNITS.includes(t.unit) && daysPending(t) >= 1);
  propertyPending.slice(0, 3).forEach(t => suggestions.push({ label: `${t.unit} — pending task on your To-Do Board`, source: t.title, group: "Property / Area" }));
  if (weekday === 3) suggestions.push({ label: "Restaurant rounds after meeting with Natasha", source: "Wednesday preference", group: "Property / Area" });
  return suggestions;
}

/* ============================== RECOMMENDATION ENGINE ============================== */

export function daysPending(task) {
  const created = new Date(task.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / 86400000));
}

export function scoreTask(task, { dateISO, weekdayLabel }) {
  let score = 0;
  if (task.importance === "High") score += 30;
  if (task.priority === "High") score += 20;
  score += Math.min(daysPending(task), 10) * 3;
  score += (task.carryForwardCount || 0) * 8;
  if (task.unit && weekdayLabel && task.unit.toLowerCase().includes(weekdayLabel.toLowerCase())) score += 25;
  if (task.nonNegotiable) score += 50;
  return score;
}

export function reasonFor(task, weekdayLabel) {
  const reasons = [];
  if (task.importance === "High" && daysPending(task) >= 2) reasons.push(`High Importance • Pending ${daysPending(task)} Days`);
  else if (task.unit && weekdayLabel && task.unit.toLowerCase().includes(weekdayLabel.toLowerCase())) reasons.push(`${weekdayLabel} ${task.unit} Slot`);
  else if (task.carryForwardCount > 0) reasons.push("Carried forward from previous day");
  else if (task.importance === "High") reasons.push("High Importance");
  else reasons.push("Pending task");
  return reasons[0];
}
