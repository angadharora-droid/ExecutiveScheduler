import React from "react";
import { Calendar, Lock, Repeat, Check } from "lucide-react";
import { categoryChipTone, ACCENT, INK, SAGE, ALERT } from "../constants.js";
import { todayISO, fmtDate, addDays } from "../utils.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { isRepeating, occursOn } from "../repeat.js";
import { dayCapacity, dayLoad, loadRatio, loadLevel } from "../capacity.js";
import { Card, Chip } from "./ui.jsx";

const DELEGATION_COLOR = "#6E7B8B";

// Monday to Sunday, each day measured by the open work it holds against the same capacity
// rule the Month view and Insight use. One stacked bar per day shows how the day's capacity
// is spoken for; the numbers under it say by what.
export default function WeekView({ dayPlans, tasks, setDateISO, setTab }) {
  const { categoryLabel } = useWorkTypes();
  const { focusLimit } = useSettings();
  const cap = dayCapacity(focusLimit);
  const capTotal = cap.focus + cap.smallBatch + cap.delegation;
  const today = todayISO();
  const start = addDays(today, -(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const Segment = ({ used, color }) => used > 0 ? <div className="h-full" style={{ width: `${Math.min(100, (used / capTotal) * 100)}%`, background: color }} /> : null;
  const Figure = ({ label, used, max, color }) => (
    <span className="inline-flex items-center gap-1 tabular" style={{ color: used > max ? ALERT : "rgba(0,0,0,0.5)" }}>
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label} {used}/{max}
    </span>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="font-serif text-2xl" style={{ color: INK }}>Week View</h2>
        <p className="text-sm text-black/45 mt-0.5">Where can I fit this task? Tap a day to open it.</p>
      </div>
      <div className="space-y-2.5">
        {days.map(d => {
          const plan = dayPlans[d];
          const isToday = d === today;
          const past = d < today;
          // Repeating tasks that will come round on this day. Their occurrence isn't on the
          // board yet (it appears when the current one is finished), but the time is spoken for.
          const repeatsForDay = d >= today ? tasks.filter(t => occursOn(t, d)) : [];
          const load = dayLoad(plan, tasks, d, repeatsForDay);
          const level = loadLevel(loadRatio(load, cap), { planned: !!plan });
          const listed = load.tasks.filter(t => !repeatsForDay.includes(t));
          const over = load.focus > cap.focus || load.smallBatch > cap.smallBatch || load.delegation > cap.delegation;
          return (
            <Card key={d} className={`p-4 ${past ? "opacity-70" : ""}`} onClick={() => { setDateISO(d); setTab("day"); }}
              style={isToday ? { boxShadow: `0 0 0 1.5px ${ACCENT}` } : {}}>
              <div className="flex items-center justify-between mb-2.5 gap-2">
                <p className="text-sm font-semibold flex items-center gap-1.5 min-w-0" style={{ color: INK }}>
                  <span className="truncate">{fmtDate(d)}</span>
                  {isToday && <Chip tone="focus">Today</Chip>}
                  {plan?.concluded ? <Lock size={12} className="text-black/35 shrink-0" title="Concluded" /> : plan ? <Check size={12} className="text-black/35 shrink-0" title="Planned" /> : null}
                </p>
                <span className="text-xs font-medium whitespace-nowrap" style={{ color: level.color }}>{level.label}</span>
              </div>
              <div className="h-2.5 rounded-full bg-black/[0.06] overflow-hidden flex" style={over ? { boxShadow: `0 0 0 1px ${ALERT}` } : {}}>
                <Segment used={load.focus} color={ACCENT} />
                <Segment used={load.smallBatch} color={SAGE} />
                <Segment used={load.delegation} color={DELEGATION_COLOR} />
              </div>
              <div className="flex gap-3 flex-wrap mt-1.5 text-[11px]">
                <Figure label={categoryLabel("focus")} used={load.focus} max={cap.focus} color={ACCENT} />
                <Figure label={categoryLabel("smallBatch")} used={load.smallBatch} max={cap.smallBatch} color={SAGE} />
                <Figure label={categoryLabel("delegation")} used={load.delegation} max={cap.delegation} color={DELEGATION_COLOR} />
              </div>
              {(listed.length > 0 || repeatsForDay.length > 0) && (
                <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] space-y-1">
                  {listed.slice(0, 6).map(t => (
                    <p key={t.id} className="text-xs text-black/55 flex items-center gap-1.5">
                      {isRepeating(t) ? <Repeat size={11} className="text-black/30 shrink-0" /> : <Calendar size={11} className="text-black/30 shrink-0" />}
                      <span className="truncate">{t.title}</span> <Chip tone={categoryChipTone(t.category)}>{t.workType || categoryLabel(t.category)}</Chip>
                    </p>
                  ))}
                  {listed.length > 6 && <p className="text-[11px] text-black/40 pl-4">+ {listed.length - 6} more</p>}
                  {repeatsForDay.map(t => (
                    <p key={t.id} className="text-xs text-black/40 flex items-center gap-1.5" title="Repeats on this day — appears on the board once the current one is finished">
                      <Repeat size={11} className="text-black/25 shrink-0" /> <span className="truncate">{t.title}</span> <Chip tone="outline">Repeats</Chip>
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
