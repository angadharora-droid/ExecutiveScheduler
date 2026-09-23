import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { ACCENT, ACCENT_WARM, ALERT, INK } from "../constants.js";
import { todayISO } from "../utils.js";
import { useSettings } from "../SettingsContext.jsx";
import { dayCapacity, dayLoad, loadRatio, loadLevel } from "../capacity.js";

const LEVEL_COLOR = { over: ALERT, heavy: ACCENT_WARM, moderate: "#CFE0CC", light: "#EDEBE5", open: "#EDEBE5", unplanned: "#F1F0EC" };

// Monday-first, like the Week view. Each day is coloured by the same capacity rule as the
// Week view and Insight; a lock means the day was concluded, a dot that it holds a scheduled
// task without a plan yet.
export default function MonthView({ dayPlans, tasks, setDateISO, setTab }) {
  const { focusLimit } = useSettings();
  const cap = dayCapacity(focusLimit);
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: startOffset }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)
  );

  const definedByDate = useMemo(() => {
    const map = {};
    tasks.filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date).forEach(t => {
      (map[t.date] = map[t.date] || []).push(t);
    });
    return map;
  }, [tasks]);

  const colorFor = (iso) => {
    const plan = dayPlans[iso];
    if (!plan && !definedByDate[iso]) return LEVEL_COLOR.unplanned;
    if (!plan) return "#FBF4E4";
    return LEVEL_COLOR[loadLevel(loadRatio(dayLoad(plan, tasks, iso), cap), { planned: true }).key];
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft size={18} /></button>
        <h2 className="font-serif text-xl" style={{ color: INK }}>{base.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
        <button onClick={() => setMonthOffset(m => m + 1)}><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-black/40 uppercase">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((iso, i) => iso ? (
          <button key={i} onClick={() => { setDateISO(iso); setTab("day"); }}
            className="aspect-square rounded-lg flex items-center justify-center text-xs font-medium relative"
            style={{ background: colorFor(iso), color: INK }}>
            {Number(iso.slice(-2))}
            {iso === todayISO() && <div className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: ACCENT }} />}
            {!dayPlans[iso] && definedByDate[iso]?.length > 0 && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: ACCENT_WARM }} title={definedByDate[iso].map(t => t.title).join(", ")} />}
            {dayPlans[iso]?.concluded && <Lock size={9} className="absolute top-1 right-1 text-black/40" title="Concluded" />}
          </button>
        ) : <div key={i} />)}
      </div>
      <div className="flex gap-x-3 gap-y-1.5 justify-center flex-wrap pt-2">
        {[["Light", LEVEL_COLOR.light], ["Moderate", LEVEL_COLOR.moderate], ["Heavy", LEVEL_COLOR.heavy], ["Over capacity", LEVEL_COLOR.over], ["Scheduled task, no plan yet", "#FBF4E4"]].map(([l, c]) => (
          <div key={l} className="flex items-center gap-1.5 text-xs text-black/50"><div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-black/50"><Lock size={10} className="text-black/40" /> Concluded</div>
        <div className="flex items-center gap-1.5 text-xs text-black/50"><div className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} /> Today</div>
      </div>
    </div>
  );
}
