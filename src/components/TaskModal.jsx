import React, { useState, useEffect, useMemo } from "react";
import { X, Pencil, AlertTriangle, MessageSquare, RotateCcw } from "lucide-react";
import { CATEGORY_IDS, CATEGORY_DEFAULT_DURATION, INK, ACCENT, ALERT } from "../constants.js";
import { todayISO, fmtDate, timeToMins, timeStrToClock, overdueSince } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import ManageWorkTypesModal from "./ManageWorkTypesModal.jsx";

const FieldLabel = ({ children, onEdit }) => (
  <div className="flex items-center justify-between">
    <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">{children}</label>
    {onEdit && (
      <button type="button" onClick={onEdit} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
        <Pencil size={10} /> Edit
      </button>
    )}
  </div>
);

const MIN_DUR = 5;

export default function TaskModal({ open, onClose, onSave, initial, tasks = [], onReopen }) {
  const { units } = useUnits();
  const { categoryLabel, activityOptions } = useWorkTypes();
  const [manageOpen, setManageOpen] = useState(false);
  const defaultForm = () => ({
    title: "", unit: units[0], priority: "High", importance: "High",
    category: "smallBatch", workType: activityOptions("smallBatch")[0], duration: 15,
    scheduleMode: "AUTO", date: "", time: "", notes: "",
  });
  const [form, setForm] = useState(initial || defaultForm());

  // Reset the form only when the modal actually opens. Depending on `initial` here
  // caused an infinite render loop (and a frozen page) whenever a caller passed a
  // fresh inline object each render.
  useEffect(() => {
    if (open) { setForm(initial ? { notes: "", ...initial } : defaultForm()); setManageOpen(false); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Another open task already pinned to the same date whose minutes overlap this one's.
  // The scheduler never stacks two fixed blocks — the later one gets pushed after the
  // earlier — so say so here, before the clash is saved.
  const clash = useMemo(() => {
    if (!open || form.scheduleMode !== "DEFINE" || !form.date || !form.time) return null;
    const s = timeToMins(form.time), e = s + Math.max(MIN_DUR, Number(form.duration) || MIN_DUR);
    return tasks.find(t =>
      t.id !== initial?.id && t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === form.date && t.time &&
      timeToMins(t.time) < e && timeToMins(t.time) + Math.max(MIN_DUR, Number(t.duration) || MIN_DUR) > s
    ) || null;
  }, [open, form.scheduleMode, form.date, form.time, form.duration, tasks, initial?.id]);

  if (!open) return null;

  // A task can carry a unit or activity that was later removed from the user's lists —
  // keep it selectable while editing so the task isn't silently relabelled.
  const unitOptions = form.unit && !units.includes(form.unit) ? [form.unit, ...units] : units;
  const activities = activityOptions(form.category);
  const activityChoices = form.workType && !activities.includes(form.workType) ? [form.workType, ...activities] : activities;
  const sessions = initial?.sessions || [];
  const od = overdueSince(initial);
  const isDone = initial?.status === "done";

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif text-lg" style={{ color: INK }}>{initial?.id ? "Edit Task" : "New Task"}</h3>
            {isDone && <Chip tone="outline">Completed</Chip>}
            {od && <Chip tone="warn">Overdue · since {fmtDate(od)}</Chip>}
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Task</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs to happen?"
              className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                {unitOptions.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel onEdit={() => setManageOpen(true)}>Work Type</FieldLabel>
              <select value={form.category} onChange={(e) => {
                const cat = e.target.value;
                setForm({ ...form, category: cat, workType: activityOptions(cat)[0], duration: CATEGORY_DEFAULT_DURATION[cat] });
              }} className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                {CATEGORY_IDS.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FieldLabel onEdit={() => setManageOpen(true)}>Activity</FieldLabel>
            <select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })}
              className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
              {activityChoices.map(w => <option key={w}>{w}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                <option>High</option><option>Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Importance</label>
              <select value={form.importance} onChange={(e) => setForm({ ...form, importance: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                <option>High</option><option>Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Minutes</label>
              <input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Scheduling</label>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setForm({ ...form, scheduleMode: "AUTO" })}
                className="flex-1 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: form.scheduleMode === "AUTO" ? INK : "rgba(0,0,0,0.1)", background: form.scheduleMode === "AUTO" ? INK : "white", color: form.scheduleMode === "AUTO" ? "white" : INK }}>
                Auto Schedule
              </button>
              <button onClick={() => setForm({ ...form, scheduleMode: "DEFINE", date: form.date || todayISO() })}
                className="flex-1 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: form.scheduleMode === "DEFINE" ? INK : "rgba(0,0,0,0.1)", background: form.scheduleMode === "DEFINE" ? INK : "white", color: form.scheduleMode === "DEFINE" ? "white" : INK }}>
                Define Time
              </button>
            </div>
            {form.scheduleMode === "DEFINE" && (
              <>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">Date</label>
                    <input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="w-full mt-0.5 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">Time (optional)</label>
                    <input type="time" value={form.time || ""} onChange={(e) => setForm({ ...form, time: e.target.value })}
                      className="w-full mt-0.5 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                </div>
                <p className="text-xs text-black/40 mt-2">
                  {form.time
                    ? `Pinned to ${timeStrToClock(form.time)} on that day as its own ${form.duration}-minute block.`
                    : `Goes into that day's ${categoryLabel(form.category)} block. Add a time to pin it to an exact slot.`}
                </p>
                {clash && (
                  <p className="text-xs mt-2 p-2.5 rounded-lg flex items-start gap-1.5" style={{ color: ALERT, background: "#FBEFEF" }}>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>Clashes with “{clash.title}” ({timeStrToClock(clash.time)} · {clash.duration}m) on {fmtDate(form.date)}. Two tasks can't share a slot — this one will be placed right after it unless you pick another time.</span>
                  </p>
                )}
                {od && form.date === initial?.date && (
                  <p className="text-xs mt-2" style={{ color: ALERT }}>Choose a new date to clear the overdue flag.</p>
                )}
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Context, background, links, anything to remember…" rows={3}
              className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 resize-y" />
          </div>
          {sessions.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquare size={12} /> Conclude Day notes ({sessions.length})
              </label>
              <div className="mt-1.5 space-y-1.5">
                {[...sessions].reverse().map((s, i) => (
                  <div key={i} className="p-3 rounded-lg bg-black/[0.03] text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold" style={{ color: INK }}>{fmtDate(s.date)}</span>
                      <Chip tone={s.outcome === "Completed" ? "smallbatch" : "outline"}>{s.outcome}</Chip>
                    </div>
                    {s.discussion && <p className="text-black/70">{s.discussion}</p>}
                    {s.nextAction && <p className="text-black/55">Next: {s.nextAction}</p>}
                    {s.owner && <p className="text-black/55">Delegated to {s.owner}{s.dueBy ? ` · expected by ${s.dueBy}` : ""}</p>}
                    {!s.discussion && !s.nextAction && !s.owner && <p className="text-black/35 italic">No comment recorded.</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-between gap-2 sticky bottom-0 bg-white">
          <div>
            {isDone && onReopen && (
              <GhostButton onClick={onReopen}><RotateCcw size={13} /> Restore to board</GhostButton>
            )}
          </div>
          <div className="flex gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton disabled={!form.title?.trim()} onClick={() => {
              // Normalise scheduling fields: Define Time always carries a date (defaulting to
              // today), Auto carries neither so stale date/time never leak into planning.
              const out = form.scheduleMode === "DEFINE"
                ? { ...form, date: form.date || todayISO(), time: form.time || "" }
                : { ...form, date: "", time: "" };
              // Moving the task to a different date (or off Define Time) is a deliberate
              // reschedule — it is no longer overdue.
              const rescheduled = (initial?.date || "") !== out.date || (initial?.scheduleMode || "AUTO") !== out.scheduleMode;
              if (rescheduled) out.overdueSince = null;
              onSave(out); onClose();
            }}>Save Task</PrimaryButton>
          </div>
        </div>
      </Card>
    </div>
    <ManageWorkTypesModal open={manageOpen} onClose={() => setManageOpen(false)} tasks={tasks} zClass="z-[60]" />
    </>
  );
}
