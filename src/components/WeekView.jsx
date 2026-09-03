import React from "react";
import { Calendar, Lock } from "lucide-react";
import { categoryChipTone, ACCENT, ACCENT_WARM, ALERT, INK, SAGE } from "../constants.js";
import { todayISO, fmtDate, addDays } from "../utils.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { Card, Chip } from "./ui.jsx";

export default function WeekView({ dayPlans, tasks, setDateISO, setTab }) {
  const { categoryLabel } = useWorkTypes();
  const start = addDays(todayISO(), -(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const CAP = 120;
  const DELEGATION_CAP = 20;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Week View</h2>
      <p className="text-sm text-black/45 -mt-3">Where can I fit this task?</p>
      <div className="space-y-3">
        {days.map(d => {
          const plan = dayPlans[d];
          const definedForDay = tasks.filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === d);
          const sb = plan
            ? plan.schedule.filter(b => b.type === "smallbatch").reduce((s, b) => s + b.duration, 0)
            : definedForDay.filter(t => t.category === "smallBatch").reduce((s, t) => s + t.duration, 0);
          const fw = plan
            ? plan.schedule.filter(b => b.type === "focus").reduce((s, b) => s + b.duration, 0)
            : definedForDay.filter(t => t.category === "focus").reduce((s, t) => s + t.duration, 0);
          const dg = plan
            ? plan.schedule.filter(b => b.type === "delegation").reduce((s, b) => s + b.duration, 0)
            : definedForDay.filter(t => t.category === "delegation").reduce((s, t) => s + t.duration, 0);
          const load = (sb + fw) / (CAP * 2);
          const label = !plan ? (definedForDay.length ? "Partially Scheduled" : "Unplanned") : load >= 0.9 ? "Heavy Day" : load >= 0.5 ? "Moderate Day" : "Light Day";
          const color = !plan ? (definedForDay.length ? ACCENT_WARM : "rgba(0,0,0,0.15)") : load >= 0.9 ? ALERT : load >= 0.5 ? ACCENT_WARM : SAGE;
          return (
            <Card key={d} className="p-4 cursor-pointer" onClick={() => { setDateISO(d); setTab("day"); }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: INK }}>
                  {fmtDate(d)}
                  {plan && <Lock size={12} className="text-black/35" />}
                </p>
                <span className="text-xs font-medium" style={{ color }}>{label}</span>
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-[10px] text-black/40 mb-0.5"><span>{categoryLabel("smallBatch")}</span><span>{sb} / {CAP}</span></div>
                  <div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (sb/CAP)*100)}%`, background: SAGE }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-black/40 mb-0.5"><span>{categoryLabel("focus")}</span><span>{fw} / {CAP}</span></div>
                  <div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (fw/CAP)*100)}%`, background: ACCENT }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-black/40 mb-0.5"><span>{categoryLabel("delegation")}</span><span>{dg} / {DELEGATION_CAP}</span></div>
                  <div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (dg/DELEGATION_CAP)*100)}%`, background: "#6E7B8B" }} /></div>
                </div>
              </div>
              {definedForDay.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] space-y-1">
                  {definedForDay.map(t => (
                    <p key={t.id} className="text-xs text-black/55 flex items-center gap-1.5">
                      <Calendar size={11} className="text-black/30" /> {t.title} <Chip tone={categoryChipTone(t.category)}>{categoryLabel(t.category)}</Chip>
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
