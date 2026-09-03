import React, { useState } from "react";
import { CATEGORY_IDS, CONCLUDE_STATUSES, ACCENT, INK } from "../constants.js";
import { fmtDate } from "../utils.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { insertTaskIntoPlan } from "../scheduleEngine.js";
import { Card, PrimaryButton } from "./ui.jsx";

export default function ConcludeDay({ dateISO, dayPlans, tasks, updateTask, updateTasksBulk, savePlan, savePlansBulk, onDone }) {
  const { categoryLabel, activityOptions } = useWorkTypes();
  const plan = dayPlans[dateISO];
  const workedIds = plan ? Array.from(new Set(plan.schedule.flatMap(b => b.taskIds || []))) : [];
  const workedTasks = tasks.filter(t => workedIds.includes(t.id));
  const [entries, setEntries] = useState(() => Object.fromEntries(workedTasks.map(t => [t.id, { status: "Progress Made", summary: "", nextAction: "", delegatedTo: "", expectedBy: "", followUpDate: "", followUpCategory: t.category }])));
  const [result, setResult] = useState(null);

  if (!plan) return <Card className="max-w-xl mx-auto p-8 text-center text-sm text-black/45">No plan to conclude for this day.</Card>;
  if (workedTasks.length === 0) return <Card className="max-w-xl mx-auto p-8 text-center text-sm text-black/45">No tasks were scheduled for this day.</Card>;

  const setField = (id, field, val) => setEntries(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const conclude = () => {
    let completed = 0, decisionsClosed = 0, advanced = 0, stalled = 0, carried = 0;
    const patches = {};
    const followUps = []; // task-shaped: { id, title, date, category, duration, time }
    workedTasks.forEach(t => {
      const e = entries[t.id];
      const session = { date: dateISO, discussion: e.summary, outcome: e.status, nextAction: e.nextAction, owner: e.delegatedTo || null, dueBy: e.expectedBy || null };
      const sessions = [...(t.sessions || []), session];
      if (e.status === "Completed") {
        completed++;
        patches[t.id] = { status: "done", completedAt: Date.now(), sessions };
      } else {
        if (e.status === "Progress Made") advanced++;
        if (t.category === "focus" && sessions.length >= 3 && !e.nextAction) stalled++;
        const cfCount = (t.carryForwardCount || 0) + 1;
        carried++;
        if (e.followUpDate) {
          // Next action pinned to a specific future date — reclassify and place on that day.
          patches[t.id] = {
            sessions, carryForwardCount: cfCount, nextAction: e.nextAction, lastOutcome: e.status,
            status: "open", scheduleMode: "DEFINE", date: e.followUpDate, time: "",
            category: e.followUpCategory, workType: activityOptions(e.followUpCategory)[0],
          };
          followUps.push({ id: t.id, title: t.title, date: e.followUpDate, category: e.followUpCategory, duration: t.duration, time: "" });
        } else {
          // No specific date — carry it back onto the open board, eligible for the next day planned.
          patches[t.id] = {
            sessions, carryForwardCount: cfCount, nextAction: e.nextAction, lastOutcome: e.status,
            status: "open", scheduleMode: "AUTO", date: "", time: "",
          };
        }
      }
      if (e.status === "Completed" && t.category === "focus") decisionsClosed++;
    });
    updateTasksBulk(patches);

    // If the target day already has a generated schedule, slot the follow-up straight into it.
    // Collected into one bulk write below so concluding today and re-slotting other days
    // never clobber each other, however many dates are touched in this action.
    let workingPlans = {};
    followUps.forEach((fu) => {
      const basePlan = workingPlans[fu.date] || dayPlans[fu.date];
      if (!basePlan) return; // no plan yet for that day — it'll surface as a recommendation when planned
      const { schedule } = insertTaskIntoPlan(basePlan, fu);
      workingPlans[fu.date] = { ...basePlan, schedule };
    });

    const focusMin = plan.schedule.filter(b => b.type === "focus").reduce((s, b) => s + b.duration, 0);
    const sbMin = plan.schedule.filter(b => b.type === "smallbatch").reduce((s, b) => s + b.duration, 0);
    const plannedMin = plan.schedule.reduce((s, b) => s + b.duration, 0);
    const productiveMin = focusMin + sbMin;
    const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
    const nnAchievedCount = nnList.filter(id => entries[id]?.status === "Completed").length;

    let classification = "PROGRESS MADE";
    if (decisionsClosed >= 1 && advanced >= 1) classification = "HIGH IMPACT";
    else if (completed >= Math.ceil(workedTasks.length * 0.6)) classification = "PRODUCTIVE";
    else if (completed > advanced * 2) classification = "ADMIN HEAVY";
    else if (stalled >= 1) classification = "STALLED";
    else if (completed === 0 && advanced === 0) classification = "FRAGMENTED";

    const summary = {
      plannedMin, productiveMin, focusMin, sbMin, completed, decisionsClosed, advanced, stalled, carried,
      nonNegotiable: nnList.length ? `${nnAchievedCount}/${nnList.length} Achieved` : "None set",
      classification,
    };
    savePlansBulk({ ...workingPlans, [dateISO]: { ...(workingPlans[dateISO] || plan), concluded: true, result: summary } });
    setResult(summary);
  };

  if (result) {
    const CLASS_COPY = {
      "HIGH IMPACT": "Major decisions and meaningful advancement today.",
      "PRODUCTIVE": "Good planned progress across the board.",
      "PROGRESS MADE": "Important work moved forward despite limited closure.",
      "ADMIN HEAVY": "Many tasks completed but relatively little Focus Work advanced.",
      "FRAGMENTED": "Considerable activity but limited concentration.",
      "STALLED": "Important work repeatedly failed to progress — worth a closer look tomorrow.",
    };
    return (
      <Card className="max-w-xl mx-auto p-7 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>Today's Result</p>
          <h2 className="font-serif text-2xl mt-1" style={{ color: INK }}>{result.classification}</h2>
          <p className="text-sm text-black/55 mt-2">{CLASS_COPY[result.classification]}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[["Planned", `${result.plannedMin}m`], ["Productive", `${result.productiveMin}m`], ["Focus", `${result.focusMin}m`],
            ["Completed", result.completed], ["Decisions", result.decisionsClosed], ["Advanced", result.advanced],
            ["Stalled", result.stalled], ["Carried", result.carried], ["Non-Neg.", result.nonNegotiable]].map(([label, val]) => (
            <div key={label} className="p-3 rounded-xl bg-black/[0.03]">
              <p className="text-base font-semibold" style={{ color: INK }}>{val}</p>
              <p className="text-[10px] text-black/40 uppercase tracking-wide mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <PrimaryButton onClick={onDone} className="w-full">Done</PrimaryButton>
      </Card>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Conclude My Day</h2>
      {workedTasks.map(t => {
        const e = entries[t.id];
        return (
          <Card key={t.id} className="p-4 space-y-3">
            <p className="text-sm font-medium" style={{ color: INK }}>{t.title}</p>
            <select value={e.status} onChange={(ev) => setField(t.id, "status", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
              {CONCLUDE_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input placeholder="Discussion / progress summary" value={e.summary} onChange={(ev) => setField(t.id, "summary", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <input placeholder="Next action (e.g. Amit to revert by Thursday)" value={e.nextAction} onChange={(ev) => setField(t.id, "nextAction", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            {e.status !== "Completed" && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" min={dateISO} value={e.followUpDate} onChange={(ev) => setField(t.id, "followUpDate", ev.target.value)}
                  placeholder="Follow-up date" className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                {e.followUpDate && (
                  <select value={e.followUpCategory} onChange={(ev) => setField(t.id, "followUpCategory", ev.target.value)}
                    className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                    {CATEGORY_IDS.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                  </select>
                )}
              </div>
            )}
            {e.followUpDate && (
              <p className="text-xs" style={{ color: ACCENT }}>Will be placed on {fmtDate(e.followUpDate)}'s {categoryLabel(e.followUpCategory)} schedule.</p>
            )}
            {e.status === "Delegated" && (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Delegated to" value={e.delegatedTo} onChange={(ev) => setField(t.id, "delegatedTo", ev.target.value)}
                  className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <input placeholder="Expected by" value={e.expectedBy} onChange={(ev) => setField(t.id, "expectedBy", ev.target.value)}
                  className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            )}
          </Card>
        );
      })}
      <PrimaryButton onClick={conclude} className="w-full">Close Out Today</PrimaryButton>
    </div>
  );
}
