import React from "react";
import { Calendar, Lock, Repeat, Check } from "lucide-react";
import { categoryChipTone, ACCENT, INK, SAGE } from "../constants.js";
import { todayISO, fmtDate, addDays } from "../utils.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { isRepeating, occursOn } from "../repeat.js";
import { dayCapacity, dayLoad, loadRatio, loadLevel } from "../capacity.js";
import { Card, Chip } from "./ui.jsx";

// Monday to Sunday, each day measured by the open work it holds against the same capacity
// rule the Month view and Insight use.
export default function WeekView({ dayPlans, tasks, setDateISO, setTab }) {
  const { categoryLabel } = useWorkTypes();
  const { focusLimit } = useSettings();
  const cap = dayCapacity(focusLimit);
  const start = addDays(todayISO(), -(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const Bar = ({ label, used, max, color }) => {
    const over = used > max;
    return (
      <div>
        <div className="flex justify-between text-[10px] mb-0.5" style={{ color: over ? "#B23A3A" : "rgba(0,0,0,0.4)" }}>
          <span>{label}</span><span className={over ? "font-semibold" : ""}>{used} / {max}{over ? " · over" : ""}</span>
        </div>
        <div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (used / max) * 100)}%`, background: over ? "#B23A3A" : color }} /></div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Week View</h2>
      <p className="text-sm text-black/45 -mt-3">Where can I fit this task?</p>
      <div className="space-y-3">
        {days.map(d => {
          const plan = dayPlans[d];
          // Repeating tasks that will come round on this day. Their occurrence isn't on the
          // board yet (it appears when the current one is finished), but the time is spoken for.
          const repeatsForDay = d >= todayISO() ? tasks.filter(t => occursOn(t, d)) : [];
          const load = dayLoad(plan, tasks, d, repeatsForDay);
          const level = loadLevel(loadRatio(load, cap), { planned: !!plan });
          const listed = load.tasks.filter(t => !repeatsForDay.includes(t));
          return (
            <Card key={d} className="p-4 cursor-pointer" onClick={() => { setDateISO(d); setTab("day"); }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: INK }}>
                  {fmtDate(d)}
                  {plan?.concluded ? <Lock size={12} className="text-black/35" title="Concluded" /> : plan ? <Check size={12} className="text-black/35" title="Planned" /> : null}
                </p>
                <span className="text-xs font-medium" style={{ color: level.color }}>{level.label}</span>
              </div>
              <div className="space-y-1.5">
                <Bar label={categoryLabel("smallBatch")} used={load.smallBatch} max={cap.smallBatch} color={SAGE} />
                <Bar label={categoryLabel("focus")} used={load.focus} max={cap.focus} color={ACCENT} />
                <Bar label={categoryLabel("delegation")} used={load.delegation} max={cap.delegation} color="#6E7B8B" />
              </div>
              {(listed.length > 0 || repeatsForDay.length > 0) && (
                <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] space-y-1">
                  {listed.map(t => (
                    <p key={t.id} className="text-xs text-black/55 flex items-center gap-1.5">
                      {isRepeating(t) ? <Repeat size={11} className="text-black/30" /> : <Calendar size={11} className="text-black/30" />} {t.title} <Chip tone={categoryChipTone(t.category)}>{categoryLabel(t.category)}</Chip>
                    </p>
                  ))}
                  {repeatsForDay.map(t => (
                    <p key={t.id} className="text-xs text-black/40 flex items-center gap-1.5" title="Repeats on this day — appears on the board once the current one is finished">
                      <Repeat size={11} className="text-black/25" /> {t.title} <Chip tone="outline">Repeats</Chip>
                    </p>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
