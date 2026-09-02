import React from "react";
import { TrendingUp, AlertTriangle, Flag } from "lucide-react";
import { ACCENT, ACCENT_WARM, ALERT, INK, SAGE } from "../constants.js";
import { todayISO, fmtDate, addDays } from "../utils.js";
import { Card, Chip } from "./ui.jsx";

export default function Intelligence({ tasks, dayPlans }) {
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), -i));
  const next7 = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i + 1));

  const pastPlans = last7.map(d => dayPlans[d]).filter(Boolean);
  const focusMinPast = pastPlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "focus").reduce((a, b) => a + b.duration, 0), 0);
  const sbMinPast = pastPlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "smallbatch").reduce((a, b) => a + b.duration, 0), 0);
  const decisionsClosed = pastPlans.reduce((s, p) => s + (p.result?.decisionsClosed || 0), 0);
  const advanced = pastPlans.reduce((s, p) => s + (p.result?.advanced || 0), 0);
  const stalled = pastPlans.reduce((s, p) => s + (p.result?.stalled || 0), 0);
  const carried = pastPlans.reduce((s, p) => s + (p.result?.carried || 0), 0);
  const nnTotal = pastPlans.reduce((s, p) => s + (p.nonNegotiables || (p.nonNegotiable ? [p.nonNegotiable] : [])).length, 0);
  const nnAchieved = pastPlans.reduce((s, p) => {
    const m = p.result?.nonNegotiable?.match(/^(\d+)\//);
    return s + (m ? Number(m[1]) : 0);
  }, 0);

  const futurePlans = next7.map(d => dayPlans[d]).filter(Boolean);
  const focusMinFuture = futurePlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "focus").reduce((a, b) => a + b.duration, 0), 0);
  const sbMinFuture = futurePlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "smallbatch").reduce((a, b) => a + b.duration, 0), 0);
  const focusCapTotal = 7 * 120, sbCapTotal = 7 * 120;
  const capacityState = (focusMinFuture / focusCapTotal) > 0.85 ? "Overloaded" : (focusMinFuture / focusCapTotal) > 0.6 ? "Tight" : "Healthy";

  const openHighImportance = tasks.filter(t => t.status !== "done" && t.importance === "High" && (t.carryForwardCount || 0) >= 2);

  // find weekday with most free focus capacity in the next 7 days
  const capacityByDay = next7.map(d => {
    const p = dayPlans[d];
    const used = p ? p.schedule.filter(b => b.type === "focus").reduce((a, b) => a + b.duration, 0) : 0;
    return { d, free: 120 - used };
  }).sort((a, b) => b.free - a.free);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Productivity Intelligence</h2>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40 mb-2">Last 7 Days</p>
        <div className="grid grid-cols-3 gap-2.5">
          {[["Focus Time", `${focusMinPast}m`], ["Small Batch", `${sbMinPast}m`], ["Decisions Closed", decisionsClosed],
            ["Tasks Advanced", advanced], ["Stalled", stalled], ["Carried Forward", carried],
            ["Non-Neg. Achieved", `${nnAchieved}/${nnTotal}`]].map(([l,v]) => (
            <Card key={l} className="p-3 text-center">
              <p className="text-lg font-semibold" style={{ color: INK }}>{v}</p>
              <p className="text-[10px] text-black/40 uppercase tracking-wide mt-0.5">{l}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Next 7 Days Forecast</p>
          <Chip tone={capacityState === "Overloaded" ? "warn" : capacityState === "Tight" ? "outline" : "smallbatch"}>{capacityState}</Chip>
        </div>
        <Card className="p-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-black/50 mb-1"><span>Focus Capacity</span><span>{focusMinFuture} of {focusCapTotal} min planned</span></div>
            <div className="h-2 rounded-full bg-black/[0.06]"><div className="h-2 rounded-full" style={{ width: `${Math.min(100,(focusMinFuture/focusCapTotal)*100)}%`, background: ACCENT }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-black/50 mb-1"><span>Small Batch Capacity</span><span>{sbMinFuture} of {sbCapTotal} min planned</span></div>
            <div className="h-2 rounded-full bg-black/[0.06]"><div className="h-2 rounded-full" style={{ width: `${Math.min(100,(sbMinFuture/sbCapTotal)*100)}%`, background: SAGE }} /></div>
          </div>
        </Card>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40 mb-2">Recommendations</p>
        <div className="space-y-2">
          {capacityByDay[0] && capacityByDay[0].free > 60 && (
            <Card className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><TrendingUp size={15} className="mt-0.5 shrink-0" style={{color:ACCENT}} />{fmtDate(capacityByDay[0].d)} has the strongest available Focus capacity ({capacityByDay[0].free}m free).</Card>
          )}
          {capacityByDay.filter(c => c.free <= 10).slice(0,1).map(c => (
            <Card key={c.d} className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><AlertTriangle size={15} className="mt-0.5 shrink-0" style={{color:ACCENT_WARM}} />{fmtDate(c.d)} is already Focus-heavy; avoid adding another Focus task.</Card>
          ))}
          {openHighImportance.length > 0 && (
            <Card className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><Flag size={15} className="mt-0.5 shrink-0" style={{color:ALERT}} />{openHighImportance.length} high-importance task{openHighImportance.length>1?"s have":" has"} carried forward repeatedly — prioritise this week.</Card>
          )}
          {capacityByDay.length === 0 && <p className="text-sm text-black/40">Plan a few more days to unlock forecasting.</p>}
        </div>
      </div>
    </div>
  );
}
