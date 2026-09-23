import React, { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { PERSONAL_BLOCK_CATEGORIES, INK, ALERT } from "../constants.js";
import { uid, todayISO, timeToMins } from "../utils.js";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";

const blank = () => ({ title: "", date: todayISO(), startTime: "12:00", endTime: "14:00", category: PERSONAL_BLOCK_CATEGORIES[0] });

// A No-Schedule Window: time blocked out of a day. New, or — with `initial` — an existing
// one being edited (and then also deletable). It must end after it starts.
export default function PersonalBlockModal({ open, onClose, onSave, initial = null, onDelete }) {
  const [form, setForm] = useState(blank());
  useEffect(() => { if (open) setForm(initial ? { ...blank(), ...initial } : blank()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const problem = !form.title.trim() ? "Give it a name."
    : !form.date ? "Pick a date."
    : !form.startTime || !form.endTime ? "Set both times."
    : timeToMins(form.endTime) <= timeToMins(form.startTime) ? "It has to end after it starts."
    : null;
  const field = "w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-md rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
          <h3 className="font-serif text-lg" style={{ color: INK }}>{initial ? "Edit No-Schedule Window" : "No-Schedule Window"}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input placeholder="e.g. Khemkas Lunch, Doctor's appointment" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field} />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={field} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">From</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={field + " mt-1"} />
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">To</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={field + " mt-1"} />
            </div>
          </div>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={field}>
            {PERSONAL_BLOCK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          {problem && form.title.trim() ? (
            <p className="text-xs" style={{ color: ALERT }}>{problem}</p>
          ) : (
            <p className="text-xs text-black/40">This time will be blocked out — the scheduler builds the rest of the day around it.</p>
          )}
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-between gap-2">
          <div>
            {initial && onDelete && (
              <GhostButton onClick={() => { if (window.confirm(`Remove “${initial.title}”?`)) { onDelete(initial.id); onClose(); } }}>
                <Trash2 size={13} /> Remove
              </GhostButton>
            )}
          </div>
          <div className="flex gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton disabled={!!problem} onClick={() => { onSave(initial ? { ...initial, ...form } : { id: uid(), ...form }); onClose(); }}>
              {initial ? "Save changes" : "Save Window"}
            </PrimaryButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
