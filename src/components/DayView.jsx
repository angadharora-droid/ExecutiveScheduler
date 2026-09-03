import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Star, GripVertical, Download, ArrowRight, Clock, Plus, Lock } from "lucide-react";
import { BLOCK_COLOR, ACCENT, ACCENT_WARM, INK } from "../constants.js";
import { todayISO, fmtDate, addDays, minsToClock, timeToMins, timeStrToClock } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { isAnchoredBlock, relayoutSchedule, insertTaskIntoPlan, planContainsTask } from "../scheduleEngine.js";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";

const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Sort key for pinned tasks: timed ones by clock, untimed ones last.
const UNTIMED = 24 * 60 + 1;
const pinnedSortKey = (t) => (t.time ? timeToMins(t.time) : UNTIMED);

function buildPrintableHTML(plan, tasks, dateISO, boardOnly, categoryLabel) {
  const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
  const rows = plan.schedule.map(b => {
    const nn = nnList.some(id => (b.taskIds || []).includes(id));
    // A fixed-time task block already carries the title as its label — don't list it twice.
    const taskLines = b.fixedTaskId ? [] : (b.taskIds || [])
      .map(id => tasks.find(t => t.id === id)).filter(Boolean)
      .map(t => `${t.title}${t.time ? ` (${timeStrToClock(t.time)})` : ""}`);
    const stopLines = (b.stops || []).map((s, i) => `${i + 1}. ${s.label} (${s.group})`);
    const instructionLines = (b.instructions || []).map(id => tasks.find(t => t.id === id)?.title).filter(Boolean).map(t => `→ ${t} (tomorrow)`);
    const sub = [...taskLines, ...stopLines, ...instructionLines];
    return `
      <tr>
        <td class="time">${minsToClock(b.start)}</td>
        <td class="bar" style="background:${BLOCK_COLOR[b.type] || "#ccc"}"></td>
        <td class="body">
          <div class="label">${escapeHTML(b.label)}${b.fixedTaskId ? ' <span class="fixed">Fixed time</span>' : ""}${nn ? ' <span class="star">★ Non-Negotiable</span>' : ""}</div>
          ${sub.length ? `<div class="sub">${sub.map(s => `· ${escapeHTML(s)}`).join("<br/>")}</div>` : ""}
        </td>
        <td class="dur">${b.duration}m</td>
      </tr>`;
  }).join("");

  const extra = boardOnly.length ? `
    <h2>Also scheduled for this day (not yet in the plan)</h2>
    <table><tbody>${boardOnly.map(t => `
      <tr>
        <td class="time">${t.time ? timeStrToClock(t.time) : "—"}</td>
        <td class="bar" style="background:${BLOCK_COLOR.flexible}"></td>
        <td class="body"><div class="label">${escapeHTML(t.title)}</div><div class="sub">${escapeHTML(categoryLabel(t.category))}</div></td>
        <td class="dur">${t.duration}m</td>
      </tr>`).join("")}</tbody></table>` : "";

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
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <h1>${fmtDate(dateISO)}</h1>
  <div class="sub-h">Executive schedule · generated from Executive Time Scheduler</div>
  <table><tbody>${rows}</tbody></table>
  ${extra}
  <script>window.onload = function() { window.print(); };</script>
</body></html>`;
}

function PinnedTaskRow({ task, onAdd }) {
  const { categoryLabel } = useWorkTypes();
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-right font-medium text-black/50">{task.time ? timeStrToClock(task.time) : "any time"}</span>
      <span className="flex-1 truncate" style={{ color: INK }}>{task.title}</span>
      <Chip tone="outline">{categoryLabel(task.category)} · {task.duration}m</Chip>
      {onAdd && (
        <button onClick={() => onAdd(task)} className="font-semibold flex items-center gap-1 shrink-0" style={{ color: ACCENT }}>
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  );
}

export default function DayView({ dateISO, setDateISO, dayPlans, tasks, savePlan, goPlan, goConclude, addTask }) {
  const { units } = useUnits();
  const { categoryLabel } = useWorkTypes();
  const plan = dayPlans[dateISO];
  const [dragIdx, setDragIdx] = useState(null);
  const [instructionText, setInstructionText] = useState("");

  // Every open task pinned (Define Time) to this date — whether or not the stored plan knows about it.
  const pinnedToDay = tasks
    .filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === dateISO)
    .sort((a, b) => pinnedSortKey(a) - pinnedSortKey(b));
  const boardOnly = plan ? pinnedToDay.filter(t => !planContainsTask(plan, t.id)) : [];

  const addToSchedule = (task) => {
    if (!plan) return;
    const { schedule, inserted } = insertTaskIntoPlan(plan, task);
    if (inserted) savePlan(dateISO, { ...plan, schedule });
    else window.alert(`No room left in this day's ${categoryLabel(task.category)} block. Give the task a time to pin it exactly, or replan the day.`);
  };
  const addAllToSchedule = () => {
    if (!plan) return;
    let working = plan;
    boardOnly.forEach(t => {
      const { schedule, inserted } = insertTaskIntoPlan(working, t);
      if (inserted) working = { ...working, schedule };
    });
    if (working !== plan) savePlan(dateISO, working);
  };

  const addTomorrowInstruction = () => {
    if (!instructionText.trim()) return;
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
    const html = buildPrintableHTML(plan, tasks, dateISO, boardOnly, categoryLabel);
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
    if (!plan) return;
    const sched = [...plan.schedule];
    const [moved] = sched.splice(fromIdx, 1);
    sched.splice(toIdx, 0, moved);
    savePlan(dateISO, { ...plan, schedule: relayoutSchedule(sched, plan.startTime) });
  };

  const nnList = plan ? (plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : [])) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between no-print">
        <button onClick={() => setDateISO(addDays(dateISO, -1))}><ChevronLeft size={18} /></button>
        <div className="text-center">
          <h2 className="font-serif text-xl" style={{ color: INK }}>{fmtDate(dateISO)}</h2>
          {dateISO === todayISO() && <span className="text-xs" style={{ color: ACCENT }}>Today</span>}
        </div>
        <button onClick={() => setDateISO(addDays(dateISO, 1))}><ChevronRight size={18} /></button>
      </div>
      <h2 className="font-serif text-xl hidden print-only" style={{ color: INK }}>{fmtDate(dateISO)} — Schedule</h2>

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
                <Calendar size={13} /> {pinnedToDay.length} task{pinnedToDay.length > 1 ? "s" : ""} scheduled for this day
              </p>
              {pinnedToDay.map(t => <PinnedTaskRow key={t.id} task={t} />)}
              <p className="text-xs text-black/40 pt-1">Timed tasks are placed at their exact time when you plan the day; the rest join their category block.</p>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-2 printable-area">
          {plan.schedule.map((b, i) => {
            const nn = nnList.some(id => (b.taskIds || []).includes(id));
            const anchored = isAnchoredBlock(b);
            const fixedTask = b.fixedTaskId ? tasks.find(x => x.id === b.fixedTaskId) : null;
            return (
              <div key={b.key + i} draggable={!anchored}
                onDragStart={() => { if (!anchored) setDragIdx(i); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
                className="flex gap-3 items-stretch">
                <div className="w-16 shrink-0 text-right pt-3">
                  <p className="text-xs font-medium text-black/50">{minsToClock(b.start)}</p>
                </div>
                <div className="w-1 rounded-full shrink-0" style={{ background: BLOCK_COLOR[b.type] }} />
                <Card className="flex-1 p-3.5" style={nn ? { boxShadow: `0 0 0 1.5px ${ACCENT_WARM}` } : {}}>
                  <div className="flex items-center gap-2">
                    {anchored
                      ? <Lock size={13} className="text-black/20 no-print shrink-0" title="Fixed to this time" />
                      : <GripVertical size={14} className="text-black/20 cursor-grab no-print shrink-0" />}
                    <p className="text-sm font-medium flex-1" style={{ color: INK }}>{b.label}</p>
                    {nn && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
                    <span className="text-xs text-black/35">{b.duration}m</span>
                  </div>
                  {b.fixedTaskId && (
                    <p className="mt-1 pl-6 text-xs text-black/40 flex items-center gap-1">
                      <Clock size={10} /> Fixed time · {fixedTask ? categoryLabel(fixedTask.category) : "Task"}{(fixedTask?.unit || b.unit) ? ` · ${fixedTask?.unit || b.unit}` : ""}
                      {!fixedTask && <span className="text-black/30">· task removed from board</span>}
                    </p>
                  )}
                  {!b.fixedTaskId && b.taskIds?.length > 0 && (
                    <div className="mt-1.5 pl-6 space-y-0.5">
                      {b.taskIds.map(id => {
                        const t = tasks.find(x => x.id === id);
                        return t ? (
                          <p key={id} className="text-xs text-black/55">
                            · {t.title}{t.time ? <span className="text-black/35"> · {timeStrToClock(t.time)}</span> : null}
                          </p>
                        ) : null;
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
                      <div className="flex gap-1.5 pt-0.5 no-print">
                        <input value={instructionText} onChange={(e) => setInstructionText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addTomorrowInstruction(); }}
                          placeholder="Tomorrow's instruction…"
                          className="flex-1 border border-black/10 rounded-lg px-2.5 py-1.5 text-xs outline-none" />
                        <button onClick={addTomorrowInstruction} className="text-xs font-semibold px-2" style={{ color: ACCENT }}>Add</button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            );
          })}

          {boardOnly.length > 0 && (
            <Card className="p-4 space-y-2 mt-4 no-print" style={{ borderColor: ACCENT_WARM, background: "#FBF4E4" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: ACCENT_WARM }}>
                  <Calendar size={13} /> {boardOnly.length} task{boardOnly.length > 1 ? "s" : ""} scheduled for this day but not in the plan
                </p>
                {boardOnly.length > 1 && <button onClick={addAllToSchedule} className="text-xs font-semibold" style={{ color: ACCENT }}>Add all</button>}
              </div>
              {boardOnly.map(t => <PinnedTaskRow key={t.id} task={t} onAdd={addToSchedule} />)}
            </Card>
          )}

          <div className="pt-4 flex gap-2 justify-end no-print">
            <GhostButton onClick={downloadSchedule}><Download size={14} /> Download Schedule</GhostButton>
            <GhostButton onClick={goPlan}>Replan</GhostButton>
            <PrimaryButton onClick={goConclude}>Conclude My Day <ArrowRight size={15} /></PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
