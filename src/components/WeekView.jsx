import React from "react";
import { Lock, Repeat, Check, Sparkles } from "lucide-react";
import { ACCENT, INK, SAGE, ALERT } from "../constants.js";
import { todayISO, fmtDate, addDays, timeStrToClock } from "../utils.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import { isRepeating, occursOn } from "../repeat.js";
import { dayCapacity, dayLoad, loadRatio, loadLevel } from "../capacity.js";
import { Card, Chip } from "./ui.jsx";

const DELEGATION_COLOR = "#6E7B8B";
const WINDOW_COLOR = "#8B6F9B";
const dotColor = (category) => category === "focus" ? ACCENT : category === "delegation" ? DELEGATION_COLOR : category === "noSchedule" ? WINDOW_COLOR : SAGE;
const MAX_LISTED = 8;

// Monday to Sunday, each day measured by the open work it holds against the same capacity
// rule the Month view and Insight use. One stacked bar per day shows how the day's capacity
// is spoken for; the numbers under it say by what. Each task is a dot in its work type's
// colour and its title, so a narrow column still reads.
export default function WeekView({ dayPlans, tasks, setDateISO, setTab, onPlan }) {
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
    <div className="max-w-2xl lg:max-w-none mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl" style={{ color: INK }}>Week View</h2>
          <p className="text-sm text-black/45 mt-0.5">Where can I fit this task? Tap a day to open it.</p>
        </div>
        <div className="flex gap-x-3 gap-y-1 flex-wrap text-[11px] text-black/45">
          {[["focus", categoryLabel("focus")], ["smallBatch", categoryLabel("smallBatch")], ["delegation", categoryLabel("delegation")], ["noSchedule", categoryLabel("noSchedule")]].map(([c, l]) => (
            <span key={c} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: dotColor(c) }} />{l}</span>
          ))}
        </div>
      </div>
      {/* Stacked on a phone; the whole week side by side on a laptop. */}
      <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-7 lg:gap-2 lg:items-stretch">
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
            <Card key={d} className={`p-4 lg:p-3 ${past ? "opacity-70" : ""}`} onClick={() => { setDateISO(d); setTab("day"); }}
              style={isToday ? { boxShadow: `0 0 0 1.5px ${ACCENT}` } : {}}>
              <div className="flex items-center justify-between mb-2.5 gap-2 lg:flex-col lg:items-start lg:gap-0.5">
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
              <div className="flex gap-x-3 gap-y-0.5 flex-wrap mt-1.5 text-[11px] lg:flex-col">
                <Figure label={categoryLabel("focus")} used={load.focus} max={cap.focus} color={ACCENT} />
                <Figure label={categoryLabel("smallBatch")} used={load.smallBatch} max={cap.smallBatch} color={SAGE} />
                <Figure label={categoryLabel("delegation")} used={load.delegation} max={cap.delegation} color={DELEGATION_COLOR} />
              </div>
              {(listed.length > 0 || repeatsForDay.length > 0) && (
                <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] space-y-1.5">
                  {listed.slice(0, MAX_LISTED).map(t => (
                    <div key={t.id} className="flex items-start gap-1.5 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full mt-[5px] shrink-0" style={{ background: dotColor(t.category) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block leading-snug line-clamp-2" style={{ color: INK }}>{t.title}</span>
                        <span className="block text-[10px] text-black/40 truncate">
                          {t.time ? `${timeStrToClock(t.time)} · ` : ""}{t.workType || categoryLabel(t.category)}{isRepeating(t) ? " · repeats" : ""}
                        </span>
                      </span>
                    </div>
                  ))}
                  {listed.length > MAX_LISTED && <p className="text-[11px] text-black/40 pl-3">+ {listed.length - MAX_LISTED} more</p>}
                  {repeatsForDay.map(t => (
                    <div key={t.id} className="flex items-start gap-1.5 text-xs" title="Repeats on this day — appears on the board once the current one is finished">
                      <Repeat size={10} className="text-black/30 shrink-0 mt-[3px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block leading-snug line-clamp-2 text-black/50">{t.title}</span>
                        <span className="block text-[10px] text-black/35">repeats · not on the board yet</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {!plan && !past && onPlan && (
                <button onClick={(e) => { e.stopPropagation(); onPlan(d); }} className="mt-2.5 text-xs font-semibold flex items-center gap-1 min-h-9" style={{ color: ACCENT }}>
                  <Sparkles size={12} /> Plan this day
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
