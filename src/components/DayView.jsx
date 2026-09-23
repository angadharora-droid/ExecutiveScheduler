import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Star, GripVertical, Download, ArrowRight, Clock, Plus, Lock, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { BLOCK_COLOR, ACCENT, ACCENT_WARM, ALERT, INK } from "../constants.js";
import { todayISO, fmtDate, addDays, minsToClock, timeToMins, timeStrToClock, overdueSince } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { isAnchoredBlock, relayoutSchedule, insertTaskIntoPlan, planContainsTask, isOverdueFor } from "../scheduleEngine.js";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";

const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Sort key for pinned tasks: timed ones (for this very day) by clock, the rest last.
const UNTIMED = 24 * 60 + 1;
const pinnedSortKey = (t, dateISO) => (t.time && t.date === dateISO ? timeToMins(t.time) : UNTIMED);

const NEW_TASK_NOTE_LINES = 8;
const EMPTY_CLOSURE_LINES = 3;

// The printout is a working sheet: every task carries a tick box and a line to write on,
// tasks are grouped by activity, and the day closes with a Small Batch closure list and
// blank lines for new tasks that come up.
function buildPrintableHTML(plan, tasks, dateISO, boardOnly, categoryLabel, activityOptions) {
  const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
  // Order tasks by activity — the user's own activity list order within each work type, an
  // activity since removed from the list last — keeping their planned order within an activity.
  const activityRank = (t) => { const i = activityOptions(t.category).indexOf(t.workType); return i === -1 ? 999 : i; };
  const byActivity = (list) => list.map((t, i) => ({ t, i })).sort((a, b) => activityRank(a.t) - activityRank(b.t) || a.i - b.i).map(({ t }) => t);
  const box = (t) => `<span class="box">${t?.status === "done" ? "✓" : ""}</span>`;
  const taskLine = (t, showTime = true) => `
    <div class="task">${box(t)}<span class="act">${escapeHTML(t.workType || "")}</span><span class="title">${escapeHTML(t.title)}${showTime && t.time && t.date === dateISO ? ` (${timeStrToClock(t.time)})` : ""}</span><span class="fill"></span></div>`;

  // Free time between blocks is printed as such. Plans made before free time was simply left
  // open carry FLEXIBLE filler blocks; those are skipped.
  let prevEnd = null;
  const rows = plan.schedule.filter(b => b.type !== "flexible").map(b => {
    const free = prevEnd !== null && b.start > prevEnd
      ? `<tr><td class="time">${minsToClock(prevEnd)}</td><td class="bar"></td><td class="body"><div class="sub">Free until ${minsToClock(b.start)}</div></td><td class="dur">${b.start - prevEnd}m</td></tr>`
      : "";
    prevEnd = Math.max(prevEnd ?? 0, b.end);
    const nn = nnList.some(id => (b.taskIds || []).includes(id));
    const fixedTask = b.fixedTaskId ? tasks.find(t => t.id === b.fixedTaskId) : null;
    // A fixed-time task block already carries the title as its label — it gets the tick box
    // on the label and a write-in line below instead of being listed twice.
    const blockTasks = b.fixedTaskId ? [] : byActivity((b.taskIds || []).map(id => tasks.find(t => t.id === id)).filter(Boolean));
    const stopLines = (b.stops || []).map((s, i) => `${i + 1}. ${s.label} (${s.group})`);
    const instructionLines = (b.instructions || []).map(id => tasks.find(t => t.id === id)?.title).filter(Boolean).map(t => `→ ${t} (tomorrow)`);
    const sub = [...stopLines, ...instructionLines];
    return `${free}
      <tr>
        <td class="time">${minsToClock(b.start)}</td>
        <td class="bar" style="background:${BLOCK_COLOR[b.type] || "#ccc"}"></td>
        <td class="body">
          <div class="label">${b.fixedTaskId ? `${box(fixedTask)} ` : ""}${escapeHTML(b.label)}${b.fixedTaskId ? ` <span class="fixed">Fixed time${fixedTask?.workType ? ` · ${escapeHTML(fixedTask.workType)}` : ""}</span>` : ""}${b.shifted ? ` <span class="fixed">moved from ${minsToClock(b.requestedStart)}</span>` : ""}${nn ? ' <span class="star">★ Non-Negotiable</span>' : ""}</div>
          ${b.fixedTaskId ? '<div class="task"><span class="fill"></span></div>' : ""}
          ${blockTasks.map(t => taskLine(t)).join("")}
          ${sub.length ? `<div class="sub">${sub.map(s => `· ${escapeHTML(s)}`).join("<br/>")}</div>` : ""}
        </td>
        <td class="dur">${b.duration}m</td>
      </tr>`;
  }).join("");

  const extra = boardOnly.length ? `
    <h2>Also scheduled for this day (not yet in the plan)</h2>
    <table><tbody>${byActivity(boardOnly).map(t => `
      <tr>
        <td class="time">${t.time && t.date === dateISO ? timeStrToClock(t.time) : "—"}</td>
        <td class="bar" style="background:${BLOCK_COLOR.flexible}"></td>
        <td class="body">${taskLine(t, false)}<div class="sub">${escapeHTML(categoryLabel(t.category))}${t.date !== dateISO ? ` · overdue since ${fmtDate(t.date)}` : ""}</div></td>
        <td class="dur">${t.duration}m</td>
      </tr>`).join("")}</tbody></table>` : "";

  // Small Batch closure: the day's Small Batch tasks once more, to be closed out one by one.
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
  td { padding: 8px 6px; vertical-align: top; font-family: ui-sans-serif, system-ui; border-bottom: 1px solid #eee; }
  .time { font-size: 11px; color: #666; white-space: nowrap; width: 60px; }
  .bar { width: 4px; padding: 0; }
  .label { font-size: 13px; font-weight: 600; }
  .sub { font-size: 11px; color: #555; margin-top: 3px; line-height: 1.5; }
  .dur { font-size: 11px; color: #999; text-align: right; width: 40px; white-space: nowrap; }
  .star { color: #B8862C; font-size: 11px; font-weight: 600; }
  .fixed { color: #4A6E8B; font-size: 11px; font-weight: 600; }
  .task { display: flex; align-items: flex-end; gap: 7px; margin-top: 9px; font-family: ui-sans-serif, system-ui; font-size: 11.5px; color: #333; break-inside: avoid; }
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

export default function DayView({ dateISO, setDateISO, dayPlans, tasks, savePlan, updateTask, goPlan, goConclude, addTask }) {
  const { units } = useUnits();
  const { categoryLabel, activityOptions } = useWorkTypes();
  const { focusLimit } = useSettings();
  const plan = dayPlans[dateISO];
  const locked = !!plan?.concluded;
  const [dragIdx, setDragIdx] = useState(null);
  const [instructionText, setInstructionText] = useState("");

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

  const addTomorrowInstruction = () => {
    if (!instructionText.trim() || locked) return;
    const tomorrow = addDays(dateISO, 1);
    const t = addTask({
      title: instructionText.trim(), unit: units[0], priority: "High", importance: "Low",
      category: "smallBatch", workType: "Instruction", duration: 15, scheduleMode: "DEFINE", date: tomorrow, time: "",
    });
    const closureIdx = plan.schedule.findIndex(b => b.type === "closure");
    if (closureIdx > -1) {
      const sched = [...plan.schedule];
      sched[closureIdx] = { ...sched[closureIdx], instructions: [...(sched[closureIdx].instructions || []), t.id] };
      savePlan(dateISO, { ...plan, schedule: sched });
    }
    setInstructionText("");
  };

  const downloadSchedule = () => {
    if (!plan) return;
    const html = buildPrintableHTML(plan, tasks, dateISO, boardOnly, categoryLabel, activityOptions);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${dateISO}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between no-print">
        <button onClick={() => setDateISO(addDays(dateISO, -1))}><ChevronLeft size={18} /></button>
        <div className="text-center">
          <h2 className="font-serif text-xl flex items-center justify-center gap-2" style={{ color: INK }}>
            {locked && <Lock size={15} className="text-black/40" />}{fmtDate(dateISO)}
          </h2>
          {dateISO === todayISO() && <span className="text-xs" style={{ color: ACCENT }}>Today</span>}
        </div>
        <button onClick={() => setDateISO(addDays(dateISO, 1))}><ChevronRight size={18} /></button>
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
        <div className="space-y-2 printable-area">
          {plan.schedule.map((b, i) => {
            if (b.type === "flexible") return null; // filler from plans made before free time was simply left open
            const nn = nnList.some(id => (b.taskIds || []).includes(id));
            const anchored = isAnchoredBlock(b);
            const draggable = !anchored && !locked;
            const fixedTask = b.fixedTaskId ? tasks.find(x => x.id === b.fixedTaskId) : null;
            // Idle time before this block is free — nothing was placed in it.
            const prev = plan.schedule.slice(0, i).filter(x => x.type !== "flexible").pop();
            const freeFrom = prev && b.start > prev.end ? prev.end : null;
            return (
              <React.Fragment key={b.key + i}>
              {freeFrom !== null && (
                <div className="flex gap-3 items-center">
                  <div className="w-16 shrink-0 text-right"><p className="text-xs text-black/30">{minsToClock(freeFrom)}</p></div>
                  <div className="w-1 shrink-0" />
                  <p className="flex-1 text-xs text-black/35 py-1">Free until {minsToClock(b.start)} · {b.start - freeFrom}m{locked ? "" : " — add a task, a break or a special task to use it"}</p>
                </div>
              )}
              <div draggable={draggable}
                onDragStart={() => { if (draggable) setDragIdx(i); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
                className="flex gap-3 items-stretch">
                <div className="w-16 shrink-0 text-right pt-3">
                  <p className="text-xs font-medium text-black/50">{minsToClock(b.start)}</p>
                </div>
                <div className="w-1 rounded-full shrink-0" style={{ background: BLOCK_COLOR[b.type] }} />
                <Card className="flex-1 p-3.5" style={{ ...(nn ? { boxShadow: `0 0 0 1.5px ${ACCENT_WARM}` } : {}), ...(locked ? { opacity: 0.92 } : {}) }}>
                  <div className="flex items-center gap-2">
                    {anchored || locked
                      ? <Lock size={13} className="text-black/20 no-print shrink-0" title={locked ? "Day concluded" : "Fixed to this time"} />
                      : <GripVertical size={14} className="text-black/20 cursor-grab no-print shrink-0" />}
                    <p className="text-sm font-medium flex-1" style={{ color: INK, textDecoration: fixedTask?.status === "done" ? "line-through" : "none" }}>{b.label}</p>
                    {fixedTask?.status === "done" && <CheckCircle2 size={13} className="text-black/35" />}
                    {nn && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
                    <span className="text-xs text-black/35">{b.duration}m</span>
                  </div>
                  {b.fixedTaskId && (
                    <p className="mt-1 pl-6 text-xs text-black/40 flex items-center gap-1">
                      <Clock size={10} /> Fixed time · {fixedTask ? categoryLabel(fixedTask.category) : "Task"}{(fixedTask?.unit || b.unit) ? ` · ${fixedTask?.unit || b.unit}` : ""}
                      {!fixedTask && <span className="text-black/30">· task removed from board</span>}
                    </p>
                  )}
                  {b.shifted && (
                    <p className="mt-1 pl-6 text-xs flex items-center gap-1" style={{ color: ALERT }}>
                      <AlertTriangle size={10} /> Asked for {minsToClock(b.requestedStart)} — that slot was already taken, so it was moved here.
                    </p>
                  )}
                  {!b.fixedTaskId && b.taskIds?.length > 0 && (
                    <div className="mt-1.5 pl-6 space-y-0.5">
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
                    </div>
                  )}
                  {b.type === "evening" && b.stops?.length > 0 && (
                    <div className="mt-1.5 pl-6 space-y-0.5">
                      {b.stops.map((s, si) => <p key={s.id} className="text-xs text-black/55">{si + 1}. {s.label} <span className="text-black/30">· {s.group}</span></p>)}
                    </div>
                  )}
                  {b.type === "evening" && (!b.stops || b.stops.length === 0) && (
                    <p className="mt-1.5 pl-6 text-xs text-black/35">No stops selected — open for informal rounds.</p>
                  )}
                  {b.type === "personal" && b.category && (
                    <p className="mt-1 pl-6 text-xs text-black/40">{b.category} · no work scheduled</p>
                  )}
                  {b.type === "closure" && (
                    <div className="mt-2 pl-6 space-y-1.5">
                      {(b.instructions || []).map(id => {
                        const t = tasks.find(x => x.id === id);
                        return t ? <p key={id} className="text-xs text-black/55">→ {t.title} <span className="text-black/30">(tomorrow)</span></p> : null;
                      })}
                      {!locked && (
                        <div className="flex gap-1.5 pt-0.5 no-print">
                          <input value={instructionText} onChange={(e) => setInstructionText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addTomorrowInstruction(); }}
                            placeholder="Tomorrow's instruction…"
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

          {boardOnly.length > 0 && (
            <Card className="p-4 space-y-2 mt-4 no-print" style={{ borderColor: ACCENT_WARM, background: "#FBF4E4" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: ACCENT_WARM }}>
                  <Calendar size={13} /> {boardOnly.length} task{boardOnly.length > 1 ? "s" : ""} waiting for this day but not in the plan
                </p>
                {boardOnly.length > 1 && <button onClick={addAllToSchedule} className="text-xs font-semibold" style={{ color: ACCENT }}>Add all</button>}
              </div>
              {boardOnly.map(t => <PinnedTaskRow key={t.id} task={t} dateISO={dateISO} onAdd={addToSchedule} />)}
            </Card>
          )}

          <div className="pt-4 flex gap-2 justify-end no-print">
            <GhostButton onClick={downloadSchedule}><Download size={14} /> Download Schedule</GhostButton>
            {!locked && <GhostButton onClick={goPlan}>Replan</GhostButton>}
            {!locked && <PrimaryButton onClick={goConclude}>Conclude My Day <ArrowRight size={15} /></PrimaryButton>}
          </div>
        </div>
      )}
    </div>
  );
}
