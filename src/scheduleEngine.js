import { PROPERTY_UNITS } from "./constants.js";
import { timeToMins, minsToTimeStr } from "./utils.js";

/* ============================== SCHEDULE ARCHITECTURE ============================== */

export function buildBlocks(dayType, half) {
  const FW = 40;
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

/* ============================== EVENING WINDOW + PERSONAL BLOCKS ============================== */

export const EVENING_INTERACTION = { key: "evening", label: "Executive Interaction Window", type: "evening", start: 17 * 60 + 45, end: 19 * 60 + 15 };
export const EVENING_BUFFER = { key: "buffer", label: "Buffer & Pending Callbacks", type: "buffer", start: 19 * 60 + 15, end: 19 * 60 + 40 };
export const EVENING_CLOSURE = { key: "closure", label: "Closure & Tomorrow's Instructions", type: "closure", start: 19 * 60 + 40, end: 20 * 60 };

// Interleave fixed-time personal blocks with a sequentially-timed list of structured blocks.
// Structured blocks are pushed later whenever they would overlap a personal block.
export function layInSequenceWithPersonalBlocks(structuredBlocks, cursorStart, personalBlocks, specialTasks = []) {
  const fixedItems = [
    ...personalBlocks.map(p => ({ id: p.id, label: p.title, type: "personal", category: p.category, startTime: p.startTime, endTime: p.endTime })),
    ...specialTasks.map(s => ({ id: s.id, label: s.title, type: "special", startTime: s.time, endTime: minsToTimeStr(timeToMins(s.time) + s.duration) })),
  ];
  const remaining = [...fixedItems].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  const out = [];
  let cursor = cursorStart;

  const flushFixedUpTo = (t) => {
    while (remaining.length && timeToMins(remaining[0].startTime) <= t) {
      const fx = remaining.shift();
      const fxStart = timeToMins(fx.startTime), fxEnd = timeToMins(fx.endTime);
      if (fxStart > cursor) {
        out.push({ key: `gap-${fx.id}`, label: "FLEXIBLE / OPERATIONAL WINDOW", type: "flexible", duration: fxStart - cursor, start: cursor, end: fxStart, taskIds: [] });
      }
      out.push({ key: `${fx.type}-${fx.id}`, label: fx.label, type: fx.type, category: fx.category, duration: fxEnd - Math.max(fxStart, cursor), start: Math.max(fxStart, cursor), end: fxEnd, taskIds: [] });
      cursor = Math.max(cursor, fxEnd);
    }
  };

  for (const b of structuredBlocks) {
    flushFixedUpTo(cursor + b.duration);
    const start = cursor;
    const end = start + b.duration;
    out.push({ ...b, start, end });
    cursor = end;
  }
  flushFixedUpTo(Infinity);
  return { schedule: out, cursor };
}

export function appendEveningWindow(schedule, cursor, mode, customStart, customEnd, stops) {
  if (mode === "skip") return schedule;
  const start = mode === "modify" ? timeToMins(customStart) : EVENING_INTERACTION.start;
  const end = mode === "modify" ? timeToMins(customEnd) : EVENING_INTERACTION.end;
  const out = [...schedule];
  if (start > cursor) {
    out.push({ key: "gap-evening", label: "FLEXIBLE / OPERATIONAL WINDOW", type: "flexible", duration: start - cursor, start: cursor, end: start, taskIds: [] });
  }
  out.push({ key: "evening", label: "Executive Interaction Window", type: "evening", duration: end - start, start, end, stops: stops || [], taskIds: [] });
  if (mode !== "modify") {
    out.push({ ...EVENING_BUFFER, duration: EVENING_BUFFER.end - EVENING_BUFFER.start, taskIds: [] });
    out.push({ ...EVENING_CLOSURE, duration: EVENING_CLOSURE.end - EVENING_CLOSURE.start, taskIds: [], instructions: [] });
  }
  return out;
}

export function suggestEveningStops(tasks, weekdayLabel, weekday) {
  const suggestions = [];
  const propertyPending = tasks.filter(t => t.status !== "done" && PROPERTY_UNITS.includes(t.unit) && daysPending(t) >= 1);
  propertyPending.slice(0, 3).forEach(t => suggestions.push({ label: `${t.unit} — pending task on your To-Do Board`, source: t.title, group: "Property / Area" }));
  if (weekday === 3) suggestions.push({ label: "Restaurant rounds after meeting with Natasha", source: "Wednesday preference", group: "Property / Area" });
  return suggestions;
}

// Inserts a follow-up task directly into an already-generated day's schedule, under the
// chosen Small Batch / Delegation / Focus Work block, and shifts everything after it in time.
export function insertTaskIntoPlan(plan, taskId, category, taskDuration) {
  const schedule = plan.schedule.map(b => ({ ...b, taskIds: [...(b.taskIds || [])] }));
  let targetIdx = -1;
  let newDuration = null;

  if (category === "smallBatch") {
    targetIdx = schedule.findIndex(b => b.type === "smallbatch" && b.key === "sb1");
    if (targetIdx > -1 && schedule[targetIdx].taskIds.length < 10) {
      schedule[targetIdx].taskIds.push(taskId);
    } else {
      targetIdx = -1;
    }
  } else if (category === "delegation") {
    targetIdx = schedule.findIndex(b => b.type === "delegation");
    if (targetIdx > -1) {
      schedule[targetIdx].taskIds.push(taskId);
      newDuration = schedule[targetIdx].duration + taskDuration;
    }
  } else if (category === "focus") {
    targetIdx = schedule.findIndex(b => b.type === "focus" && b.taskIds.length === 0);
    if (targetIdx > -1) {
      schedule[targetIdx].taskIds = [taskId];
      newDuration = taskDuration;
    }
  }

  if (targetIdx === -1) return { schedule: plan.schedule, inserted: false };

  if (newDuration != null) {
    const delta = newDuration - schedule[targetIdx].duration;
    schedule[targetIdx].duration = newDuration;
    schedule[targetIdx].end += delta;
    for (let i = targetIdx + 1; i < schedule.length; i++) {
      schedule[i].start += delta;
      schedule[i].end += delta;
    }
  }
  return { schedule, inserted: true };
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
