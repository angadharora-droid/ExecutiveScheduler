import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { PERSONAL_BLOCK_CATEGORIES, INK } from "../constants.js";
import { uid, todayISO } from "../utils.js";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";

export default function PersonalBlockModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ title: "", date: todayISO(), startTime: "12:00", endTime: "14:00", category: PERSONAL_BLOCK_CATEGORIES[0] });
  useEffect(() => { if (open) setForm({ title: "", date: todayISO(), startTime: "12:00", endTime: "14:00", category: PERSONAL_BLOCK_CATEGORIES[0] }); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-md rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
          <h3 className="font-serif text-lg" style={{ color: INK }}>No-Schedule Window</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input placeholder="e.g. Khemkas Lunch, Doctor's appointment" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">From</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">To</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
            {PERSONAL_BLOCK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <p className="text-xs text-black/40">This time will be blocked out — the scheduler will build the rest of the day around it.</p>
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-end gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={!form.title.trim()} onClick={() => { onSave({ id: uid(), ...form }); onClose(); }}>Save Window</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
