import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Star, GripVertical, Download, ArrowRight } from "lucide-react";
import { BLOCK_COLOR, ACCENT, ACCENT_WARM, INK } from "../constants.js";
import { todayISO, fmtDate, addDays, minsToClock, timeToMins } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";

function buildPrintableHTML(plan, tasks, dateISO) {
  const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
  const rows = plan.schedule.map(b => {
    const nn = nnList.some(id => (b.taskIds || []).includes(id));
    const taskLines = (b.taskIds || []).map(id => tasks.find(t => t.id === id)?.title).filter(Boolean);
    const stopLines = (b.stops || []).map((s, i) => `${i + 1}. ${s.label} (${s.group})`);
    const instructionLines = (b.instructions || []).map(id => tasks.find(t => t.id === id)?.title).filter(Boolean).map(t => `→ ${t} (tomorrow)`);
    const sub = [...taskLines, ...stopLines, ...instructionLines];
    return `
      <tr>
        <td class="time">${minsToClock(b.start)}</td>
        <td class="bar" style="background:${BLOCK_COLOR[b.type] || "#ccc"}"></td>
        <td class="body">
          <div class="label">${b.label}${nn ? ' <span class="star">★ Non-Negotiable</span>' : ""}</div>
          ${sub.length ? `<div class="sub">${sub.map(s => `· ${s}`).join("<br/>")}</div>` : ""}
        </td>
        <td class="dur">${b.duration}m</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Schedule — ${fmtDate(dateISO)}</title>
<style>
  body { font-family: Georgia, 'Iowan Old Style', serif; color: #20222B; max-width: 720px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  .sub-h { font-family: ui-sans-serif, system-ui; font-size: 12px; color: #888; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 6px; vertical-align: top; font-family: ui-sans-serif, system-ui; border-bottom: 1px solid #eee; }
  .time { font-size: 11px; color: #666; white-space: nowrap; width: 60px; }
  .bar { width: 4px; padding: 0; }
  .label { font-size: 13px; font-weight: 600; }
  .sub { font-size: 11px; color: #555; margin-top: 3px; line-height: 1.5; }
  .dur { font-size: 11px; color: #999; text-align: right; width: 40px; white-space: nowrap; }
  .star { color: #B8862C; font-size: 11px; font-weight: 600; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <h1>${fmtDate(dateISO)}</h1>
  <div class="sub-h">Executive schedule · generated from Executive Time Scheduler</div>
  <table><tbody>${rows}</tbody></table>
  <script>window.onload = function() { window.print(); };</script>
</body></html>`;
}

export default function DayView({ dateISO, setDateISO, dayPlans, tasks, savePlan, goPlan, goConclude, addTask }) {
  const { units } = useUnits();
  const plan = dayPlans[dateISO];
  const [dragIdx, setDragIdx] = useState(null);
  const [instructionText, setInstructionText] = useState("");

  const addTomorrowInstruction = () => {
    if (!instructionText.trim()) return;
    const tomorrow = addDays(dateISO, 1);
    const t = addTask({
      title: instructionText.trim(), unit: units[0], priority: "High", importance: "Low",
      category: "smallBatch", workType: "Instruction", duration: 15, scheduleMode: "DEFINE", date: tomorrow,
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
    const html = buildPrintableHTML(plan, tasks, dateISO);
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

  const reorder = (fromIdx, toIdx) => {
    if (!plan) return;
    const sched = [...plan.schedule];
    const [moved] = sched.splice(fromIdx, 1);
    sched.splice(toIdx, 0, moved);
    let cursor = timeToMins(plan.startTime);
    const relaid = sched.map(b => { const e = { ...b, start: cursor, end: cursor + b.duration }; cursor += b.duration; return e; });
    savePlan(dateISO, { ...plan, schedule: relaid });
  };

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
        <Card className="p-10 text-center space-y-3 no-print">
          <Calendar size={26} className="mx-auto text-black/25" />
          <p className="text-sm text-black/45">No plan generated for this day yet.</p>
          <PrimaryButton onClick={goPlan} className="mx-auto">Plan My Day</PrimaryButton>
        </Card>
      ) : (
        <div className="space-y-2 printable-area">
          {plan.schedule.map((b, i) => {
            const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
            const nn = nnList.some(id => (b.taskIds || []).includes(id));
            return (
              <div key={b.key + i} draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
                className="flex gap-3 items-stretch">
                <div className="w-16 shrink-0 text-right pt-3">
                  <p className="text-xs font-medium text-black/50">{minsToClock(b.start)}</p>
                </div>
                <div className="w-1 rounded-full shrink-0" style={{ background: BLOCK_COLOR[b.type] }} />
                <Card className="flex-1 p-3.5" style={nn ? { boxShadow: `0 0 0 1.5px ${ACCENT_WARM}` } : {}}>
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-black/20 cursor-grab no-print" />
                    <p className="text-sm font-medium flex-1" style={{ color: INK }}>{b.label}</p>
                    {nn && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
                    <span className="text-xs text-black/35">{b.duration}m</span>
                  </div>
                  {b.taskIds?.length > 0 && (
                    <div className="mt-1.5 pl-6 space-y-0.5">
                      {b.taskIds.map(id => {
                        const t = tasks.find(x => x.id === id);
                        return t ? <p key={id} className="text-xs text-black/55">· {t.title}</p> : null;
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
