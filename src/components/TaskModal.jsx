import React, { useState, useEffect } from "react";
import { X, Pencil } from "lucide-react";
import { CATEGORY_IDS, CATEGORY_DEFAULT_DURATION, INK, ACCENT } from "../constants.js";
import { todayISO } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";
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

export default function TaskModal({ open, onClose, onSave, initial, tasks = [] }) {
  const { units } = useUnits();
  const { categoryLabel, activityOptions } = useWorkTypes();
  const [manageOpen, setManageOpen] = useState(false);
  const defaultForm = () => ({
    title: "", unit: units[0], priority: "High", importance: "High",
    category: "smallBatch", workType: activityOptions("smallBatch")[0], duration: 15,
    scheduleMode: "AUTO", date: "", time: "",
  });
  const [form, setForm] = useState(initial || defaultForm());

  // Reset the form only when the modal actually opens. Depending on `initial` here
  // caused an infinite render loop (and a frozen page) whenever a caller passed a
  // fresh inline object each render.
  useEffect(() => {
    if (open) { setForm(initial || defaultForm()); setManageOpen(false); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  // A task can carry a unit or activity that was later removed from the user's lists —
  // keep it selectable while editing so the task isn't silently relabelled.
  const unitOptions = form.unit && !units.includes(form.unit) ? [form.unit, ...units] : units;
  const activities = activityOptions(form.category);
  const activityChoices = form.workType && !activities.includes(form.workType) ? [form.workType, ...activities] : activities;

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg" style={{ color: INK }}>{initial?.id ? "Edit Task" : "New Task"}</h3>
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
                    ? `Pinned to ${form.time} on that day as its own ${form.duration}-minute block.`
                    : `Goes into that day's ${categoryLabel(form.category)} block. Add a time to pin it to an exact slot.`}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-end gap-2 sticky bottom-0 bg-white">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={!form.title?.trim()} onClick={() => {
            // Normalise scheduling fields: Define Time always carries a date (defaulting to
            // today), Auto carries neither so stale date/time never leak into planning.
            const out = form.scheduleMode === "DEFINE"
              ? { ...form, date: form.date || todayISO(), time: form.time || "" }
              : { ...form, date: "", time: "" };
            onSave(out); onClose();
          }}>Save Task</PrimaryButton>
        </div>
      </Card>
    </div>
    <ManageWorkTypesModal open={manageOpen} onClose={() => setManageOpen(false)} tasks={tasks} zClass="z-[60]" />
    </>
  );
}
