import React, { useState } from "react";
import { Plus, X, Coffee } from "lucide-react";
import { INK, DEFAULT_BREAK, BREAK_MINUTES_MIN, BREAK_MINUTES_MAX, normalizeBreaks } from "../constants.js";
import { uid, timeStrToClock } from "../utils.js";
import { Chip, GhostButton } from "./ui.jsx";

// A list of breaks — each with a name, a clock time and a length — that the user owns
// outright: nothing is placed for them. Shared by Plan My Day's Start Time step (that day's
// breaks) and the Work Types settings modal (the usual breaks every day starts from), so
// both are edited the same way.
export default function BreaksControl({ breaks, onChange }) {
  const [form, setForm] = useState({ ...DEFAULT_BREAK });
  const list = breaks || [];
  const field = "border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 bg-white";

  const add = () => {
    if (!form.time) return;
    onChange(normalizeBreaks({ breaks: [...list, { id: uid(), ...form }] }));
    setForm({ ...DEFAULT_BREAK, time: form.time });
  };
  const remove = (id) => onChange(list.filter(b => b.id !== id));

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <p className="text-xs text-black/40">No breaks yet — the day runs without any until you add one.</p>
      ) : (
        <div className="space-y-1.5">
          {list.map(b => (
            <div key={b.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/10">
              <Coffee size={13} className="text-black/35" />
              <span className="text-sm flex-1" style={{ color: INK }}>{b.label}</span>
              <Chip tone="outline">{timeStrToClock(b.time)} · {b.duration}m</Chip>
              <button type="button" onClick={() => remove(b.id)} title="Remove this break"><X size={14} className="text-black/30" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <input placeholder="Break, Lunch, Tea…" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={`flex-1 min-w-[8rem] ${field}`} />
        <input type="time" value={form.time} aria-label="Break time" onChange={(e) => setForm({ ...form, time: e.target.value })} className={field} />
        <input type="number" min={BREAK_MINUTES_MIN} max={BREAK_MINUTES_MAX} value={form.duration} aria-label="Break length in minutes"
          onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} className={`w-20 ${field}`} />
        <GhostButton onClick={add}><Plus size={14} /> Add</GhostButton>
      </div>
    </div>
  );
}
