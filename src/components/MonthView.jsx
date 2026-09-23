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

  // Everything with a date this month, for the list beside the grid on a laptop.
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const listed = tasks
    .filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date && t.date.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));

  return (
    <div className="max-w-2xl lg:max-w-none mx-auto lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset(m => m - 1)} aria-label="Previous month" className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><ChevronLeft size={18} /></button>
        <h2 className="font-serif text-xl" style={{ color: INK }}>{base.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
        <button onClick={() => setMonthOffset(m => m + 1)} aria-label="Next month" className="w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><ChevronRight size={18} /></button>
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

    <aside className="hidden lg:block lg:sticky lg:top-6">
      <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">Scheduled this month · {listed.length}</p>
        {listed.length === 0 ? (
          <p className="text-xs text-black/40 mt-2">Nothing pinned to a date this month yet.</p>
        ) : (
          <div className="mt-2 space-y-1 max-h-[60vh] overflow-y-auto">
            {listed.map(t => (
              <button key={t.id} onClick={() => { setDateISO(t.date); setTab("day"); }} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-black/[0.03] min-h-9">
                <span className="w-9 shrink-0 text-[11px] tabular text-black/45">{Number(t.date.slice(-2))}</span>
                <span className="flex-1 min-w-0 truncate text-xs" style={{ color: INK }}>{t.title}</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.category === "focus" ? ACCENT : t.category === "noSchedule" ? "#8B6F9B" : t.category === "delegation" ? "#6E7B8B" : "#7A8B6F" }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
    </div>
  );
}
