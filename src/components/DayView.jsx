import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar, Star, GripVertical, Download, Printer, ArrowRight, Clock, Plus, Lock, AlertTriangle, CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";
import { BLOCK_COLOR, ACCENT, ACCENT_WARM, ALERT, INK, CATEGORY_DEFAULT_DURATION } from "../constants.js";
import { todayISO, fmtDate, addDays, minsToClock, timeToMins, timeStrToClock, overdueSince } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { isAnchoredBlock, relayoutSchedule, insertTaskIntoPlan, removeBlockFromPlan, planContainsTask, isOverdueFor } from "../scheduleEngine.js";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";

const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Sort key for pinned tasks: timed ones (for this very day) by clock, the rest last.
const UNTIMED = 24 * 60 + 1;
const pinnedSortKey = (t, dateISO) => (t.time && t.date === dateISO ? timeToMins(t.time) : UNTIMED);

const NEW_TASK_NOTE_LINES = 8;
const EMPTY_CLOSURE_LINES = 3;
// A free stretch shorter than this is not worth a line of its own.
const MIN_FREE_GAP = 15;

const BLOCK_CATEGORY = { smallbatch: "smallBatch", focus: "focus", delegation: "delegation" };
// Blocks that stand for a stretch of work and can take tasks.
const isWorkBlock = (b) => b.type in BLOCK_CATEGORY && !b.fixedTaskId;
const isEmptyWorkBlock = (b) => isWorkBlock(b) && !(b.taskIds || []).length;
// Blocks the user may take out of a day from the Day view: an empty work block, a break, a
// special task. Fixed-time tasks live on the board, personal windows under No-Schedule
// Window, and the evening trio in Plan My Day.
const isRemovable = (b) => isEmptyWorkBlock(b) || b.type === "break" || b.type === "special";

// Free time between two blocks, once fillers from older plans are ignored.
const freeBefore = (schedule, i) => {
  const b = schedule[i];
  const prev = schedule.slice(0, i).filter(x => x.type !== "flexible").pop();
  return prev && b.start - prev.end >= MIN_FREE_GAP ? prev.end : null;
};

// The printout is a working sheet: every task carries a tick box and a line to write on,
// tasks are grouped by activity, and the day closes with a Small Batch closure list and
// blank lines for new tasks that come up. It is as compact as the screen: breaks and empty
// blocks are one thin line each, and short gaps are not shown.
function buildPrintableHTML(plan, tasks, dateISO, boardOnly, categoryLabel, activityOptions) {
  const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
  const activityRank = (t) => { const i = activityOptions(t.category).indexOf(t.workType); return i === -1 ? 999 : i; };
  const byActivity = (list) => list.map((t, i) => ({ t, i })).sort((a, b) => activityRank(a.t) - activityRank(b.t) || a.i - b.i).map(({ t }) => t);
  const box = (t) => `<span class="box">${t?.status === "done" ? "✓" : ""}</span>`;
  const taskLine = (t, showTime = true) => `
    <div class="task">${box(t)}<span class="act">${escapeHTML(t.workType || "")}</span><span class="title">${escapeHTML(t.title)}${showTime && t.time && t.date === dateISO ? ` (${timeStrToClock(t.time)})` : ""}</span><span class="fill"></span></div>`;
  const thin = (text) => `<tr class="thin"><td colspan="4">${text}</td></tr>`;

  const schedule = plan.schedule.filter(b => b.type !== "flexible");
  const rows = schedule.map((b, i) => {
    const free = freeBefore(schedule, i);
    const freeRow = free !== null ? thin(`Free until ${minsToClock(b.start)} · ${b.start - free}m`) : "";
    if (b.type === "break") return freeRow + thin(`— ${escapeHTML(b.label)} · ${minsToClock(b.start)} · ${b.duration}m —`);
    if (isEmptyWorkBlock(b) || b.type === "warmup" || b.type === "buffer") return freeRow + thin(`${isEmptyWorkBlock(b) ? "Open: " : ""}${escapeHTML(b.label)} · ${minsToClock(b.start)} · ${b.duration}m`);
    const nn = nnList.some(id => (b.taskIds || []).includes(id));
    const fixedTask = b.fixedTaskId ? tasks.find(t => t.id === b.fixedTaskId) : null;
    const blockTasks = b.fixedTaskId ? [] : byActivity((b.taskIds || []).map(id => tasks.find(t => t.id === id)).filter(Boolean));
    const stopLines = (b.stops || []).map((s, j) => `${j + 1}. ${s.label} (${s.group})`);
    const instructionLines = (b.instructions || []).map(id => tasks.find(t => t.id === id)?.title).filter(Boolean).map(t => `→ ${t} (tomorrow)`);
    const sub = [...stopLines, ...instructionLines];
    return `${freeRow}
      <tr>
        <td class="time">${minsToClock(b.start)}<br/><span class="dur">${b.duration}m</span></td>
        <td class="bar" style="background:${BLOCK_COLOR[b.type] || "#ccc"}"></td>
        <td class="body" colspan="2">
          <div class="label">${b.fixedTaskId ? `${box(fixedTask)} ` : ""}${escapeHTML(b.label)}${b.fixedTaskId ? ` <span class="fixed">Fixed time${fixedTask?.workType ? ` · ${escapeHTML(fixedTask.workType)}` : ""}</span>` : ""}${b.shifted ? ` <span class="fixed">moved from ${minsToClock(b.requestedStart)}</span>` : ""}${nn ? ' <span class="star">★ Non-Negotiable</span>' : ""}</div>
          ${b.fixedTaskId ? '<div class="task"><span class="fill"></span></div>' : ""}
          ${blockTasks.map(t => taskLine(t)).join("")}
          ${sub.length ? `<div class="sub">${sub.map(s => `· ${escapeHTML(s)}`).join("<br/>")}</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  const extra = boardOnly.length ? `
    <h2>Also scheduled for this day (not yet in the plan)</h2>
    <table><tbody>${byActivity(boardOnly).map(t => `
      <tr>
        <td class="time">${t.time && t.date === dateISO ? timeStrToClock(t.time) : "—"}</td>
        <td class="bar" style="background:${BLOCK_COLOR.flexible}"></td>
        <td class="body" colspan="2">${taskLine(t, false)}<div class="sub">${escapeHTML(categoryLabel(t.category))}${t.date !== dateISO ? ` · overdue since ${fmtDate(t.date)}` : ""} · ${t.duration}m</div></td>
      </tr>`).join("")}</tbody></table>` : "";

  const sbIds = Array.from(new Set(plan.schedule.filter(b => b.type === "smallbatch").flatMap(b => b.taskIds || [])));
  const sbTasks = byActivity(sbIds.map(id => tasks.find(t => t.id === id)).filter(Boolean));
  const blankLine = '<div class="task blank"><span class="box"></span><span class="fill"></span></div>';
  const closure = `
    <h2>${escapeHTML(categoryLabel("smallBatch"))} Closure</h2>
    <div class="section">${sbTasks.length ? sbTasks.map(t => taskLine(t, false)).join("") : blankLine.repeat(EMPTY_CLOSURE_LINES)}</div>`;
  const newTaskNotes = `
    <h2>New Task Notes</h2>
    <div class="section">${blankLine.repeat(NEW_TASK_NOTE_LINES)}</div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Schedule — ${fmtDate(dateISO)}</title>
<style>
  body { font-family: Georgia, 'Iowan Old Style', serif; color: #20222B; max-width: 720px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  h2 { font-size: 14px; margin: 28px 0 8px; color: #666; }
  .sub-h { font-family: ui-sans-serif, system-ui; font-size: 12px; color: #888; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 6px; vertical-align: top; font-family: ui-sans-serif, system-ui; border-bottom: 1px solid #eee; }
  .time { font-size: 11px; color: #666; white-space: nowrap; width: 58px; line-height: 1.4; }
  .dur { color: #999; }
  .bar { width: 4px; padding: 0; }
  .label { font-size: 13px; font-weight: 600; }
  .sub { font-size: 11px; color: #555; margin-top: 3px; line-height: 1.5; }
  .thin td { padding: 3px 6px; font-size: 10.5px; color: #888; text-align: center; border-bottom: 1px dashed #eee; }
  .star { color: #B8862C; font-size: 11px; font-weight: 600; }
  .fixed { color: #4A6E8B; font-size: 11px; font-weight: 600; }
  .task { display: flex; align-items: flex-end; gap: 7px; margin-top: 8px; font-family: ui-sans-serif, system-ui; font-size: 11.5px; color: #333; break-inside: avoid; }
  .box { display: inline-block; flex: none; width: 11px; height: 11px; border: 1.3px solid #444; border-radius: 2px; font-size: 10px; line-height: 11px; text-align: center; vertical-align: -1px; }
  .act { flex: none; font-size: 9.5px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
  .title { max-width: 55%; }
  .fill { flex: 1; min-width: 30%; height: 13px; border-bottom: 1px solid #999; }
  .section .task { margin-top: 13px; }
  .section .title { max-width: 45%; }
  .section .fill { min-width: 45%; }
  .blank { margin-top: 20px !important; }
  h2 { break-after: avoid; }
  tr { break-inside: avoid; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <h1>${fmtDate(dateISO)}</h1>
  <div class="sub-h">Executive schedule · generated from Executive Time Scheduler</div>
  <table><tbody>${rows}</tbody></table>
  ${extra}
  ${closure}
  ${newTaskNotes}
  <script>window.onload = function() { window.print(); };</script>
</body></html>`;
}

function PinnedTaskRow({ task, dateISO, onAdd }) {
  const { categoryLabel } = useWorkTypes();
  const overdue = task.date !== dateISO ? task.date : null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-right font-medium text-black/50">{task.time && !overdue ? timeStrToClock(task.time) : "any time"}</span>
      <span className="flex-1 truncate" style={{ color: INK }}>{task.title}</span>
      {overdue && <Chip tone="warn"><AlertCircle size={10} /> Overdue · {fmtDate(overdue)}</Chip>}
      <Chip tone="outline">{categoryLabel(task.category)} · {task.duration}m</Chip>
      {onAdd && (
        <button onClick={() => onAdd(task)} className="font-semibold flex items-center gap-1 shrink-0" style={{ color: ACCENT }}>
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  );
}

// Where the clock is right now, drawn across today's timeline.
function NowLine({ mins, after = false }) {
  return (
    <div className="flex items-center gap-2 py-0.5 no-print" aria-label={`Now, ${minsToClock(mins)}`}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ALERT }} />
      <span className="flex-1 h-px" style={{ background: ALERT, opacity: 0.55 }} />
      <span className="text-[11px] font-semibold tabular whitespace-nowrap" style={{ color: ALERT }}>Now · {minsToClock(mins)}{after ? " · the plan is done for today" : ""}</span>
    </div>
  );
}

// One thin line in the timeline: free time, a break, an empty block, Warm Up, Buffer.
function ThinRow({ children, color, onRemove, title }) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs text-black/45">
      <span className="w-1 h-4 rounded-full shrink-0" style={{ background: color || "transparent" }} />
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {onRemove && <button onClick={onRemove} title={title || "Remove"} className="text-black/25 hover:text-black/60 no-print"><X size={13} /></button>}
    </div>
  );
}

export default function DayView({ dateISO, setDateISO, dayPlans, tasks, savePlan, updateTask, deleteTask, goPlan, goConclude, addTask }) {
  const { units } = useUnits();
  const { categoryLabel, activityOptions } = useWorkTypes();
  const { focusLimit } = useSettings();
  const plan = dayPlans[dateISO];
  const locked = !!plan?.concluded;
  const [dragIdx, setDragIdx] = useState(null);
  const [instructionText, setInstructionText] = useState("");
  // The block a new task is being written for (from its "Add task" link), or null.
  const [addingTo, setAddingTo] = useState(null);
  // The clock, kept current while today's plan is on screen.
  const isToday = dateISO === todayISO();
  const [nowMins, setNowMins] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => {
    const tick = () => { const d = new Date(); setNowMins(d.getHours() * 60 + d.getMinutes()); };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // Every open task pinned (Define Time) to this date — whether or not the stored plan knows
  // about it — plus anything overdue from an earlier day, which is prompted here until it is
  // put into a day. A concluded day is history: nothing new is prompted against it.
  const pinnedToDay = locked ? [] : tasks
    .filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && (t.date === dateISO || isOverdueFor(t, dateISO, dayPlans)))
    .sort((a, b) => pinnedSortKey(a, dateISO) - pinnedSortKey(b, dateISO));
  const boardOnly = plan ? pinnedToDay.filter(t => !planContainsTask(plan, t.id)) : [];

  // An overdue task being added is re-dated to this day (and its stale clock time dropped)
  // so the board and the plan agree on where it now lives.
  const forThisDay = (task) => (task.date === dateISO ? task : { ...task, date: dateISO, time: "" });
  const addToSchedule = (task) => {
    if (!plan || locked) return;
    const t = forThisDay(task);
    const { schedule, inserted } = insertTaskIntoPlan(plan, t, focusLimit);
    if (!inserted) {
      window.alert(task.category === "focus"
        ? `${focusLimit === 1 ? "The day's only Focus Work slot is" : `All ${focusLimit} Focus Work slots are`} taken — that's your daily limit. Clear a slot, raise your limit (Plan My Day → Focus Work), or give the task a time to pin it exactly.`
        : `No room left in this day's ${categoryLabel(task.category)} block. Give the task a time to pin it exactly, or replan the day.`);
      return;
    }
    if (t !== task) updateTask(task.id, { date: dateISO, time: "" });
    savePlan(dateISO, { ...plan, schedule });
  };
  const addAllToSchedule = () => {
    if (!plan || locked) return;
    let working = plan;
    boardOnly.forEach(task => {
      const t = forThisDay(task);
      const { schedule, inserted } = insertTaskIntoPlan(working, t, focusLimit);
      if (!inserted) return;
      if (t !== task) updateTask(task.id, { date: dateISO, time: "" });
      working = { ...working, schedule };
    });
    if (working !== plan) savePlan(dateISO, working);
  };

  // A block the user takes out of the day: an empty work block, a break or a special task.
  // The plan's own lists of breaks and special tasks forget it too, so a Replan stays honest.
  const removeBlock = (b) => {
    if (!plan || locked || !isRemovable(b)) return;
    if (!window.confirm(`Take “${b.label}” (${minsToClock(b.start)} · ${b.duration}m) out of ${fmtDate(dateISO)}?`)) return;
    const { schedule } = removeBlockFromPlan(plan, b.key);
    savePlan(dateISO, {
      ...plan, schedule,
      breaks: (plan.breaks || []).filter(x => `break-${x.id}` !== b.key),
      specialTasks: (plan.specialTasks || []).filter(s => `special-${s.id}` !== b.key),
    });
  };

  // Tomorrow's instructions are Delegation tasks for the person named, pinned to tomorrow
  // and listed in the Closure block; one can be taken off again (it is deleted outright).
  const addTomorrowInstruction = () => {
    if (!instructionText.trim() || locked) return;
    const tomorrow = addDays(dateISO, 1);
    const t = addTask({
      title: instructionText.trim(), unit: units[0], priority: "High", importance: "Low",
      category: "delegation", workType: activityOptions("delegation")[0], duration: CATEGORY_DEFAULT_DURATION.delegation, scheduleMode: "DEFINE", date: tomorrow, time: "",
    });
    const closureIdx = plan.schedule.findIndex(b => b.type === "closure");
    if (closureIdx > -1) {
      const sched = [...plan.schedule];
      sched[closureIdx] = { ...sched[closureIdx], instructions: [...(sched[closureIdx].instructions || []), t.id] };
      savePlan(dateISO, { ...plan, schedule: sched });
    }
    setInstructionText("");
  };
  const removeInstruction = (id) => {
    const t = tasks.find(x => x.id === id);
    if (!window.confirm(`Remove “${t?.title || "this instruction"}”? The task goes with it.`)) return;
    if (t && deleteTask) deleteTask(id);
    else savePlan(dateISO, { ...plan, schedule: plan.schedule.map(b => (b.type === "closure" ? { ...b, instructions: (b.instructions || []).filter(x => x !== id) } : b)) });
  };

  const printableHTML = () => buildPrintableHTML(plan, tasks, dateISO, boardOnly, categoryLabel, activityOptions);
  const downloadSchedule = () => {
    if (!plan) return;
    const blob = new Blob([printableHTML()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${dateISO}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  // Opens the sheet in its own window and the print dialog with it — "Save as PDF" there
  // gives a file that can go straight to WhatsApp.
  const printSchedule = () => {
    if (!plan) return;
    const w = window.open("", "_blank");
    if (!w) { downloadSchedule(); return; }
    w.document.open();
    w.document.write(printableHTML());
    w.document.close();
  };

  // Drag-reorder only re-sequences the flow blocks; anything anchored to a clock time
  // (personal windows, special tasks, fixed-time tasks, the evening window) stays put.
  const reorder = (fromIdx, toIdx) => {
    if (!plan || locked) return;
    const sched = [...plan.schedule];
    const [moved] = sched.splice(fromIdx, 1);
    sched.splice(toIdx, 0, moved);
    savePlan(dateISO, { ...plan, schedule: relayoutSchedule(sched, plan.startTime) });
  };

  const nnList = plan ? (plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : [])) : [];
  const clashes = plan ? plan.schedule.filter(b => b.shifted).length : 0;
  const schedule = plan ? plan.schedule.filter(b => b.type !== "flexible") : [];
  const newTaskInitial = addingTo ? {
    title: "", unit: units[0], priority: "", importance: "", category: BLOCK_CATEGORY[addingTo.type],
    workType: activityOptions(BLOCK_CATEGORY[addingTo.type])[0], duration: CATEGORY_DEFAULT_DURATION[BLOCK_CATEGORY[addingTo.type]],
    scheduleMode: "DEFINE", date: dateISO, time: "", notes: "",
  } : null;

  const when = (b) => `${minsToClock(b.start)} · ${b.duration}m`;

  // Today: what is on right now, and what comes next.
  const current = isToday ? schedule.find(b => b.start <= nowMins && nowMins < b.end) : null;
  const upcoming = isToday ? schedule.find(b => b.start > nowMins) : null;
  const nowBanner = isToday && !locked && (current || upcoming) ? (
    <Card className="px-4 py-3 flex items-center gap-3 no-print mb-2" style={{ background: "#EEF3F3", borderColor: "rgba(47,93,98,0.25)" }}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ACCENT }} />
      <div className="min-w-0 flex-1">
        {current
          ? <p className="text-sm truncate" style={{ color: INK }}><span className="font-semibold">Now:</span> {current.label} <span className="text-black/45 tabular">· ends {minsToClock(current.end)} · {current.end - nowMins} min left</span></p>
          : <p className="text-sm truncate" style={{ color: INK }}><span className="font-semibold">Free until</span> {minsToClock(upcoming.start)} <span className="text-black/45">· then {upcoming.label}</span></p>}
        {current && upcoming && <p className="text-[11px] text-black/45 mt-0.5 truncate">Next: {upcoming.label} at {minsToClock(upcoming.start)}</p>}
      </div>
    </Card>
  ) : null;
  const plannedMin = schedule.reduce((s, b) => s + b.duration, 0);
  const taskCount = new Set(schedule.flatMap(b => b.taskIds || [])).size;
  const freeMin = schedule.reduce((s, b, i) => { const f = freeBefore(schedule, i); return s + (f !== null ? b.start - f : 0); }, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between no-print">
        <button onClick={() => setDateISO(addDays(dateISO, -1))} aria-label="Previous day" className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <h2 className="font-serif text-xl flex items-center justify-center gap-2" style={{ color: INK }}>
            {locked && <Lock size={15} className="text-black/40" />}{fmtDate(dateISO)}
          </h2>
          {dateISO === todayISO()
            ? <span className="text-xs" style={{ color: ACCENT }}>Today</span>
            : <button onClick={() => setDateISO(todayISO())} className="text-xs font-semibold" style={{ color: ACCENT }}>Back to today</button>}
        </div>
        <button onClick={() => setDateISO(addDays(dateISO, 1))} aria-label="Next day" className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><ChevronRight size={18} /></button>
      </div>
      <h2 className="font-serif text-xl hidden print-only" style={{ color: INK }}>{fmtDate(dateISO)} — Schedule</h2>

      {locked && (
        <Card className="p-4 flex items-start gap-3 no-print" style={{ background: "#EFEEEA" }}>
          <Lock size={16} className="mt-0.5 shrink-0 text-black/50" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: INK }}>Day concluded · {plan.result?.classification || "Locked"}</p>
            <p className="text-xs text-black/50 mt-0.5">
              {plan.result ? `${plan.result.completed} completed · ${plan.result.carried} carried forward · ${plan.result.focusMin}m focus.` : ""} The schedule is locked and can't be changed.
            </p>
          </div>
        </Card>
      )}

      {!locked && clashes > 0 && (
        <Card className="p-3.5 flex items-start gap-2.5 no-print" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: ALERT }} />
          <p className="text-xs" style={{ color: INK }}>
            {clashes} fixed-time block{clashes > 1 ? "s were" : " was"} asked for a time already taken and moved to the next free slot. Change the clashing task's time to place it exactly.
          </p>
        </Card>
      )}

      {!plan ? (
        <div className="space-y-3">
          <Card className="p-10 text-center space-y-3 no-print">
            <Calendar size={26} className="mx-auto text-black/25" />
            <p className="text-sm text-black/45">No plan generated for this day yet.</p>
            <PrimaryButton onClick={goPlan} className="mx-auto">Plan My Day</PrimaryButton>
          </Card>
          {pinnedToDay.length > 0 && (
            <Card className="p-4 space-y-2" style={{ borderColor: ACCENT_WARM, background: "#FBF4E4" }}>
              <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: ACCENT_WARM }}>
                <Calendar size={13} /> {pinnedToDay.length} task{pinnedToDay.length > 1 ? "s" : ""} waiting for this day
              </p>
              {pinnedToDay.map(t => <PinnedTaskRow key={t.id} task={t} dateISO={dateISO} />)}
              <p className="text-xs text-black/40 pt-1">Timed tasks are placed at their exact time when you plan the day; the rest — including anything overdue — join their category block.</p>
            </Card>
          )}
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
        <div className="space-y-1.5 printable-area">
          {nowBanner}
          {schedule.map((b, i) => {
            const free = freeBefore(schedule, i);
            const freeRow = free !== null && (
              <ThinRow key={`free-${i}`}>Free until {minsToClock(b.start)} · {b.start - free}m{locked ? "" : " — add a task, a break or a special task to use it"}</ThinRow>
            );
            const nowRow = isToday && nowMins < b.start && (i === 0 || schedule[i - 1].end <= nowMins) ? <NowLine key={`now-${i}`} mins={nowMins} /> : null;
            const isCurrent = isToday && b.start <= nowMins && nowMins < b.end;
            const anchored = isAnchoredBlock(b);
            const draggable = !anchored && !locked;
            const dragProps = {
              draggable,
              onDragStart: () => { if (draggable) setDragIdx(i); },
              onDragOver: (e) => e.preventDefault(),
              onDrop: () => { if (dragIdx !== null && dragIdx !== i) reorder(plan.schedule.indexOf(schedule[dragIdx]), plan.schedule.indexOf(b)); setDragIdx(null); },
            };
            const removeProps = !locked && isRemovable(b) ? { onRemove: () => removeBlock(b), title: `Take ${b.label} out of the day` } : {};

            // Thin lines: breaks, empty work blocks, Warm Up, Buffer.
            if (b.type === "break") return <React.Fragment key={b.key + i}>{freeRow}{nowRow}<div {...dragProps}><ThinRow color={BLOCK_COLOR.break} {...removeProps}>— {b.label} · {when(b)} —</ThinRow></div></React.Fragment>;
            if (b.type === "warmup" || b.type === "buffer") return <React.Fragment key={b.key + i}>{freeRow}{nowRow}<div {...dragProps}><ThinRow color={BLOCK_COLOR[b.type]}><span className="font-medium text-black/60">{b.label}</span> · {when(b)}</ThinRow></div></React.Fragment>;
            if (isEmptyWorkBlock(b)) return (
              <React.Fragment key={b.key + i}>{freeRow}{nowRow}
                <div {...dragProps}>
                  <ThinRow color={BLOCK_COLOR[b.type]} {...removeProps}>
                    <span className="font-medium text-black/60">Open: {b.label}</span> · {when(b)}
                    {!locked && <button onClick={() => setAddingTo(b)} className="ml-2 font-semibold no-print" style={{ color: ACCENT }}>+ Add task</button>}
                  </ThinRow>
                </div>
              </React.Fragment>
            );

            const nn = nnList.some(id => (b.taskIds || []).includes(id));
            const fixedTask = b.fixedTaskId ? tasks.find(x => x.id === b.fixedTaskId) : null;
            const closureQuiet = b.type === "closure" && locked && !(b.instructions || []).length;
            if (closureQuiet) return <React.Fragment key={b.key + i}>{freeRow}{nowRow}<ThinRow color={BLOCK_COLOR.closure}><span className="font-medium text-black/60">{b.label}</span> · {when(b)}</ThinRow></React.Fragment>;
            return (
              <React.Fragment key={b.key + i}>
              {freeRow}{nowRow}
              <div {...dragProps} className="flex gap-2 items-stretch">
                <div className="w-1 rounded-full shrink-0" style={{ background: BLOCK_COLOR[b.type] }} />
                <Card className="flex-1 min-w-0 px-3 py-2.5" style={{ ...(nn ? { boxShadow: `0 0 0 1.5px ${ACCENT_WARM}` } : {}), ...(isCurrent ? { boxShadow: `0 0 0 2px ${ACCENT}`, background: "#FBFCFB" } : {}), ...(locked ? { opacity: 0.92 } : {}) }}>
                  <div className="flex items-center gap-2">
                    {anchored || locked
                      ? <Lock size={12} className="text-black/20 no-print shrink-0" title={locked ? "Day concluded" : "Fixed to this time"} />
                      : <GripVertical size={13} className="text-black/20 cursor-grab no-print shrink-0" />}
                    <span className="text-[11px] text-black/45 whitespace-nowrap tabular">{when(b)}</span>
                    <p className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: INK, textDecoration: fixedTask?.status === "done" ? "line-through" : "none" }}>{b.label}</p>
                    {isCurrent && <Chip tone="focus">Now</Chip>}
                    {fixedTask?.status === "done" && <CheckCircle2 size={13} className="text-black/35" />}
                    {nn && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
                    {!locked && isRemovable(b) && <button onClick={() => removeBlock(b)} title={`Take ${b.label} out of the day`} className="text-black/25 hover:text-black/60 no-print"><X size={13} /></button>}
                  </div>
                  {b.fixedTaskId && (
                    <p className="mt-0.5 pl-5 text-xs text-black/40 flex items-center gap-1">
                      <Clock size={10} />
                      {b.type === "personal"
                        ? `${fixedTask?.workType || b.category || "No-Schedule Window"} · no work scheduled`
                        : `Fixed time · ${fixedTask ? categoryLabel(fixedTask.category) : "Task"}${(fixedTask?.unit || b.unit) ? ` · ${fixedTask?.unit || b.unit}` : ""}`}
                      {!fixedTask && <span className="text-black/30">· task removed from board</span>}
                    </p>
                  )}
                  {b.shifted && (
                    <p className="mt-0.5 pl-5 text-xs flex items-center gap-1" style={{ color: ALERT }}>
                      <AlertTriangle size={10} /> Asked for {minsToClock(b.requestedStart)} — that slot was already taken, so it was moved here.
                    </p>
                  )}
                  {!b.fixedTaskId && b.taskIds?.length > 0 && (
                    <div className="mt-1 pl-5 space-y-0.5">
                      {b.taskIds.map(id => {
                        const t = tasks.find(x => x.id === id);
                        if (!t) return null;
                        const od = !locked && overdueSince(t);
                        return (
                          <p key={id} className="text-xs text-black/55 flex items-center gap-1.5 flex-wrap" style={t.status === "done" ? { textDecoration: "line-through", opacity: 0.6 } : {}}>
                            · {t.title}{t.time && t.date === dateISO ? <span className="text-black/35"> · {timeStrToClock(t.time)}</span> : null}
                            {t.status === "done" && <CheckCircle2 size={11} className="text-black/35" />}
                            {od && <Chip tone="warn">Overdue</Chip>}
                          </p>
                        );
                      })}
                      {!locked && isWorkBlock(b) && b.type !== "focus" && (
                        <button onClick={() => setAddingTo(b)} className="text-xs font-semibold no-print" style={{ color: ACCENT }}>+ Add task</button>
                      )}
                    </div>
                  )}
                  {b.type === "evening" && b.stops?.length > 0 && (
                    <div className="mt-1 pl-5 space-y-0.5">
                      {b.stops.map((s, si) => <p key={s.id} className="text-xs text-black/55">{si + 1}. {s.label} <span className="text-black/30">· {s.group}</span></p>)}
                    </div>
                  )}
                  {b.type === "evening" && (!b.stops || b.stops.length === 0) && (
                    <p className="mt-1 pl-5 text-xs text-black/35">No stops selected — open for informal rounds.</p>
                  )}
                  {b.type === "personal" && !b.fixedTaskId && (
                    <p className="mt-0.5 pl-5 text-xs text-black/40">{b.category || "No-Schedule Window"} · no work scheduled</p>
                  )}
                  {b.type === "closure" && (
                    <div className="mt-1.5 pl-5 space-y-1">
                      {(b.instructions || []).map(id => {
                        const t = tasks.find(x => x.id === id);
                        return t ? (
                          <p key={id} className="text-xs text-black/55 flex items-center gap-1.5">
                            <span className="flex-1 min-w-0 truncate">→ {t.title} <span className="text-black/30">(tomorrow · {categoryLabel(t.category)})</span></span>
                            {!locked && <button onClick={() => removeInstruction(id)} title="Remove this instruction" className="text-black/25 hover:text-black/60 no-print"><X size={12} /></button>}
                          </p>
                        ) : null;
                      })}
                      {!locked && (
                        <div className="flex gap-1.5 pt-0.5 no-print">
                          <input value={instructionText} onChange={(e) => setInstructionText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addTomorrowInstruction(); }}
                            placeholder="Tomorrow's instruction — for whom, what…"
                            className="flex-1 border border-black/10 rounded-lg px-2.5 py-1.5 text-xs outline-none" />
                          <button onClick={addTomorrowInstruction} className="text-xs font-semibold px-2" style={{ color: ACCENT }}>Add</button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </div>
              </React.Fragment>
            );
          })}
          {isToday && schedule.length > 0 && nowMins >= schedule[schedule.length - 1].end && <NowLine mins={nowMins} after />}
        </div>

        {/* On a laptop this sits beside the timeline; on a phone it follows it. */}
        <aside className="space-y-3 mt-5 lg:mt-0 lg:sticky lg:top-[72px] no-print">
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">{plan.dayType ? `${plan.dayType === "half" ? `${plan.half || "first"} half` : plan.dayType} day` : "The day"} · from {timeStrToClock(plan.startTime || "11:00")}</p>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              {[["Blocks", schedule.length], ["Planned", `${plannedMin}m`], ["Tasks", taskCount]].map(([l, v]) => (
                <div key={l} className="p-2 rounded-xl bg-black/[0.03]">
                  <p className="text-base font-semibold tabular" style={{ color: INK }}>{v}</p>
                  <p className="text-[10px] text-black/40 uppercase tracking-wide">{l}</p>
                </div>
              ))}
            </div>
            {freeMin > 0 && <p className="text-[11px] text-black/45 mt-2">{freeMin} min free in between — add a task, a break or a special task to use it.</p>}
          </Card>

          {boardOnly.length > 0 && (
            <Card className="p-4 space-y-2" style={{ borderColor: ACCENT_WARM, background: "#FBF4E4" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: ACCENT_WARM }}>
                  <Calendar size={13} /> {boardOnly.length} waiting, not in the plan
                </p>
                {boardOnly.length > 1 && <button onClick={addAllToSchedule} className="text-xs font-semibold min-h-9" style={{ color: ACCENT }}>Add all</button>}
              </div>
              {boardOnly.map(t => <PinnedTaskRow key={t.id} task={t} dateISO={dateISO} onAdd={addToSchedule} />)}
            </Card>
          )}

          <div className="flex gap-2 flex-wrap lg:flex-col">
            {!locked && <PrimaryButton onClick={goConclude} className="lg:w-full">Conclude My Day <ArrowRight size={15} /></PrimaryButton>}
            {!locked && <GhostButton onClick={goPlan} className="lg:w-full"><Sparkles size={14} /> Replan</GhostButton>}
            <GhostButton onClick={printSchedule} className="lg:w-full" title="Opens the print dialog — choose Save as PDF to share it"><Printer size={14} /> Print / PDF</GhostButton>
            <GhostButton onClick={downloadSchedule} className="lg:w-full"><Download size={14} /> Download</GhostButton>
          </div>
        </aside>
        </div>
      )}

      {addingTo && (
        <TaskModal open={!!addingTo} onClose={() => setAddingTo(null)} initial={newTaskInitial} tasks={tasks}
          onSave={(f) => addTask(f, { blockKey: addingTo.key })} />
      )}
    </div>
  );
}
