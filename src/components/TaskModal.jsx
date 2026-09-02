import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { UNITS, SMALL_BATCH_TYPES, WORK_TYPE_OPTIONS, CATEGORY_DEFAULT_DURATION, INK } from "../constants.js";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";

const DEFAULT_FORM = {
  title: "", unit: UNITS[0], priority: "High", importance: "High",
  category: "smallBatch", workType: SMALL_BATCH_TYPES[0], duration: 15,
  scheduleMode: "AUTO", date: "", time: "",
};

export default function TaskModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || DEFAULT_FORM);

  // Reset the form only when the modal actually opens. Depending on `initial` here
  // caused an infinite render loop (and a frozen page) whenever a caller passed a
  // fresh inline object each render.
  useEffect(() => {
    if (open) setForm(initial || DEFAULT_FORM);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
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
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Work Type</label>
              <select value={form.category} onChange={(e) => {
                const cat = e.target.value;
                setForm({ ...form, category: cat, workType: WORK_TYPE_OPTIONS(cat)[0], duration: CATEGORY_DEFAULT_DURATION[cat] });
              }} className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="smallBatch">Small Batch</option>
                <option value="focus">Focus Work</option>
                <option value="delegation">Delegation & Instructions</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Activity</label>
            <select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })}
              className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
              {WORK_TYPE_OPTIONS(form.category).map(w => <option key={w}>{w}</option>)}
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
              <button onClick={() => setForm({ ...form, scheduleMode: "DEFINE" })}
                className="flex-1 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: form.scheduleMode === "DEFINE" ? INK : "rgba(0,0,0,0.1)", background: form.scheduleMode === "DEFINE" ? INK : "white", color: form.scheduleMode === "DEFINE" ? "white" : INK }}>
                Define Time
              </button>
            </div>
            {form.scheduleMode === "DEFINE" && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="time" value={form.time || ""} onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            )}
          </div>
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-end gap-2 sticky bottom-0 bg-white">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={!form.title?.trim()} onClick={() => { onSave(form); onClose(); }}>Save Task</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
