import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { ACCENT, ACCENT_WARM, ALERT, INK } from "../constants.js";
import { todayISO } from "../utils.js";

export default function MonthView({ dayPlans, tasks, setDateISO, setTab }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: startOffset }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)
  );
  const CAP = 240;

  const definedByDate = useMemo(() => {
    const map = {};
    tasks.filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date).forEach(t => {
      (map[t.date] = map[t.date] || []).push(t);
    });
    return map;
  }, [tasks]);

  const workloadColor = (iso) => {
    const plan = dayPlans[iso];
    if (!plan) return definedByDate[iso]?.length ? "#FBF4E4" : "#F1F0EC";
    const total = plan.schedule.reduce((s, b) => s + (b.type === "focus" || b.type === "smallbatch" ? b.duration : 0), 0);
    const ratio = total / CAP;
    if (ratio > 1) return ALERT;
    if (ratio >= 0.75) return ACCENT_WARM;
    if (ratio >= 0.35) return "#CFE0CC";
    return "#EDEBE5";
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft size={18} /></button>
        <h2 className="font-serif text-xl" style={{ color: INK }}>{base.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
        <button onClick={() => setMonthOffset(m => m + 1)}><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-black/40 uppercase">
        {["S","M","T","W","T","F","S"].map((d,i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((iso, i) => iso ? (
          <button key={i} onClick={() => { setDateISO(iso); setTab("day"); }}
            className="aspect-square rounded-lg flex items-center justify-center text-xs font-medium relative"
            style={{ background: workloadColor(iso), color: INK }}>
            {Number(iso.slice(-2))}
            {iso === todayISO() && <div className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: ACCENT }} />}
            {!dayPlans[iso] && definedByDate[iso]?.length > 0 && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: ACCENT_WARM }} title={definedByDate[iso].map(t => t.title).join(", ")} />}
            {dayPlans[iso] && <Lock size={9} className="absolute top-1 right-1 text-black/40" />}
          </button>
        ) : <div key={i} />)}
      </div>
      <div className="flex gap-3 justify-center flex-wrap pt-2">
        {[["Light", "#EDEBE5"], ["Balanced", "#CFE0CC"], ["Heavy", ACCENT_WARM], ["Overloaded", ALERT], ["Has scheduled task", "#FBF4E4"]].map(([l,c]) => (
          <div key={l} className="flex items-center gap-1.5 text-xs text-black/50"><div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</div>
        ))}
      </div>
    </div>
  );
}
