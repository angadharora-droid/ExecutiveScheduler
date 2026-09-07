import React, { useState } from "react";
import { Lock, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { CATEGORY_IDS, CONCLUDE_STATUSES, ACCENT, ALERT, INK } from "../constants.js";
import { fmtDate, addDays, todayISO } from "../utils.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { insertTaskIntoPlan } from "../scheduleEngine.js";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";

const CLASS_COPY = {
  "HIGH IMPACT": "Major decisions and meaningful advancement today.",
  "PRODUCTIVE": "Good planned progress across the board.",
  "PROGRESS MADE": "Important work moved forward despite limited closure.",
  "ADMIN HEAVY": "Many tasks completed but relatively little Focus Work advanced.",
  "FRAGMENTED": "Considerable activity but limited concentration.",
  "STALLED": "Important work repeatedly failed to progress — worth a closer look tomorrow.",
};

function ResultCard({ result, dateISO, eyebrow, onDone, doneLabel, secondary }) {
  return (
    <Card className="max-w-xl mx-auto p-7 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: ACCENT }}>
          {eyebrow}
        </p>
        <h2 className="font-serif text-2xl mt-1" style={{ color: INK }}>{result.classification}</h2>
        <p className="text-sm text-black/55 mt-2">{CLASS_COPY[result.classification]}</p>
        <p className="text-xs text-black/40 mt-1">{fmtDate(dateISO)}</p>
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
      <p className="text-xs text-black/45 flex items-center gap-1.5"><Lock size={12} /> This day is concluded and locked — its schedule can no longer be changed or concluded again.</p>
      <div className="flex gap-2">
        {secondary}
        <PrimaryButton onClick={onDone} className="flex-1">{doneLabel}</PrimaryButton>
      </div>
    </Card>
  );
}

export default function ConcludeDay({ dateISO, setDateISO, dayPlans, tasks, updateTasksBulk, savePlansBulk, purgeFromFuturePlans, onDone, goDay }) {
  const { categoryLabel, activityOptions } = useWorkTypes();
  const plan = dayPlans[dateISO];
  const nextDay = addDays(dateISO, 1);
  const workedIds = plan ? Array.from(new Set(plan.schedule.flatMap(b => b.taskIds || []))) : [];
  const workedTasks = tasks.filter(t => workedIds.includes(t.id));
  // Anything not marked Completed carries to the next day as overdue unless a specific date
  // is chosen, so the follow-up date starts out on tomorrow. A task ticked off during the day
  // from the board starts out as Completed.
  const [entries, setEntries] = useState(() => Object.fromEntries(workedTasks.map(t => [t.id, {
    status: t.status === "done" ? "Completed" : "Progress Made", summary: "", nextAction: "", delegatedTo: "", expectedBy: "",
    followUpDate: nextDay, followUpCategory: t.category,
  }])));
  const [result, setResult] = useState(null);

  // The component is keyed by date in App, so a date change remounts it with fresh entries.
  const dateNav = (
    <div className="flex items-center justify-between">
      <button onClick={() => setDateISO(addDays(dateISO, -1))}><ChevronLeft size={18} /></button>
      <div className="text-center">
        <h2 className="font-serif text-2xl" style={{ color: INK }}>Conclude My Day</h2>
        <p className="text-sm text-black/45">{fmtDate(dateISO)}{dateISO === todayISO() ? " · Today" : ""}</p>
      </div>
      <button onClick={() => setDateISO(addDays(dateISO, 1))}><ChevronRight size={18} /></button>
    </div>
  );

  if (!plan) return (
    <div className="max-w-xl mx-auto space-y-4">
      {dateNav}
      <Card className="p-8 text-center text-sm text-black/45">No plan to conclude for this day.</Card>
    </div>
  );

  // Already closed out: show the recorded result, never the form again.
  if (plan.concluded) return (
    <div className="max-w-xl mx-auto space-y-4">
      {dateNav}
      <ResultCard result={plan.result || { classification: "CONCLUDED", plannedMin: 0, productiveMin: 0, focusMin: 0, completed: 0, decisionsClosed: 0, advanced: 0, stalled: 0, carried: 0, nonNegotiable: "—" }}
        dateISO={dateISO} eyebrow={<><Lock size={12} /> Day concluded</>} onDone={onDone} doneLabel="View Insights"
        secondary={<GhostButton onClick={goDay} className="flex-1">Open Day view</GhostButton>} />
    </div>
  );

  if (result) return (
    <ResultCard result={result} dateISO={dateISO} eyebrow="Today's Result" onDone={onDone} doneLabel="Done" />
  );

  const setField = (id, field, val) => setEntries(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const conclude = () => {
    let completed = 0, decisionsClosed = 0, advanced = 0, stalled = 0, carried = 0;
    const patches = {};
    const completedTasks = [];
    const followUps = []; // task-shaped: { id, title, date, category, duration, time }
    workedTasks.forEach(t => {
      const e = entries[t.id];
      const session = { date: dateISO, discussion: e.summary, outcome: e.status, nextAction: e.nextAction, owner: e.delegatedTo || null, dueBy: e.expectedBy || null };
      const sessions = [...(t.sessions || []), session];
      if (e.status === "Completed") {
        completed++;
        completedTasks.push(t);
        patches[t.id] = { status: "done", completedAt: t.completedAt || Date.now(), sessions, overdueSince: null };
      } else {
        if (e.status === "Progress Made") advanced++;
        if (t.category === "focus" && sessions.length >= 3 && !e.nextAction) stalled++;
        const cfCount = (t.carryForwardCount || 0) + 1;
        carried++;
        const target = e.followUpDate || nextDay;
        // A date the user picked is a deliberate reschedule; the default (tomorrow) means the
        // task simply wasn't finished — it goes to the next day flagged as overdue.
        const deliberate = target !== nextDay;
        const category = e.followUpCategory || t.category;
        patches[t.id] = {
          sessions, carryForwardCount: cfCount, nextAction: e.nextAction, lastOutcome: e.status, carriedFrom: dateISO,
          status: "open", scheduleMode: "DEFINE", date: target, time: "",
          overdueSince: deliberate ? null : (t.overdueSince || dateISO),
          category, workType: category === t.category ? t.workType : activityOptions(category)[0],
        };
        followUps.push({ id: t.id, title: t.title, date: target, category, duration: t.duration, time: "" });
      }
      if (e.status === "Completed" && t.category === "focus") decisionsClosed++;
    });
    updateTasksBulk(patches);
    // Finished tasks must not linger in any later day's plan.
    purgeFromFuturePlans(completedTasks, dateISO);

    // If the target day already has a generated schedule, slot the follow-up straight into it.
    // Collected into one bulk write below so concluding today and re-slotting other days
    // never clobber each other, however many dates are touched in this action.
    let workingPlans = {};
    followUps.forEach((fu) => {
      const basePlan = workingPlans[fu.date] || dayPlans[fu.date];
      if (!basePlan || basePlan.concluded) return; // no open plan for that day — it's pulled in when the day is planned
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
    else if (workedTasks.length > 0 && completed >= Math.ceil(workedTasks.length * 0.6)) classification = "PRODUCTIVE";
    else if (completed > advanced * 2) classification = "ADMIN HEAVY";
    else if (stalled >= 1) classification = "STALLED";
    else if (completed === 0 && advanced === 0) classification = "FRAGMENTED";

    const summary = {
      plannedMin, productiveMin, focusMin, sbMin, completed, decisionsClosed, advanced, stalled, carried,
      nonNegotiable: nnList.length ? `${nnAchievedCount}/${nnList.length} Achieved` : "None set",
      classification, concludedAt: Date.now(),
    };
    savePlansBulk({ ...workingPlans, [dateISO]: { ...(workingPlans[dateISO] || plan), concluded: true, result: summary } });
    setResult(summary);
  };

  const carriedCount = workedTasks.filter(t => entries[t.id]?.status !== "Completed").length;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {dateNav}
      {workedTasks.length === 0 && (
        <Card className="p-8 text-center text-sm text-black/45">No tasks were scheduled for this day. You can still close it out to lock the schedule.</Card>
      )}
      {workedTasks.map(t => {
        const e = entries[t.id];
        const isCompleted = e.status === "Completed";
        const target = e.followUpDate || nextDay;
        const asOverdue = target === nextDay;
        return (
          <Card key={t.id} className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium flex-1" style={{ color: INK }}>{t.title}</p>
              <Chip tone="outline">{categoryLabel(t.category)}</Chip>
              {t.overdueSince && <Chip tone="warn">Overdue · since {fmtDate(t.overdueSince)}</Chip>}
              {t.status === "done" && <Chip tone="smallbatch"><CheckCircle2 size={10} /> Done today</Chip>}
            </div>
            <select value={e.status} onChange={(ev) => setField(t.id, "status", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
              {CONCLUDE_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input placeholder="Discussion / progress summary (saved to the task's notes)" value={e.summary} onChange={(ev) => setField(t.id, "summary", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <input placeholder="Next action (e.g. Amit to revert by Thursday)" value={e.nextAction} onChange={(ev) => setField(t.id, "nextAction", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            {!isCompleted && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">Carry to</label>
                    <input type="date" min={nextDay} value={e.followUpDate} onChange={(ev) => setField(t.id, "followUpDate", ev.target.value)}
                      className="w-full mt-0.5 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">As</label>
                    <select value={e.followUpCategory} onChange={(ev) => setField(t.id, "followUpCategory", ev.target.value)}
                      className="w-full mt-0.5 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                      {CATEGORY_IDS.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                    </select>
                  </div>
                </div>
                {asOverdue ? (
                  <p className="text-xs flex items-start gap-1.5" style={{ color: ALERT }}>
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>Not finished — carries to {fmtDate(nextDay)} as <strong>overdue</strong> and is pulled into that day's {categoryLabel(e.followUpCategory)} block automatically. Pick a later date to reschedule it deliberately instead.</span>
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: ACCENT }}>Rescheduled — will be placed on {fmtDate(target)}'s {categoryLabel(e.followUpCategory)} schedule.</p>
                )}
              </>
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
      <Card className="p-4 text-xs text-black/50 flex items-start gap-2">
        <Lock size={13} className="mt-0.5 shrink-0" />
        <span>Closing out locks {fmtDate(dateISO)}: the schedule can't be edited, replanned or concluded again.{carriedCount > 0 ? ` ${carriedCount} unfinished task${carriedCount > 1 ? "s" : ""} will carry forward.` : ""} Comments above are saved into each task's notes.</span>
      </Card>
      <PrimaryButton onClick={conclude} className="w-full">Close Out {dateISO === todayISO() ? "Today" : fmtDate(dateISO)}</PrimaryButton>
    </div>
  );
}
