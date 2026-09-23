import React from "react";
import { TrendingUp, AlertTriangle, Flag } from "lucide-react";
import { ACCENT, ACCENT_WARM, ALERT, INK, SAGE } from "../constants.js";
import { todayISO, fmtDate, addDays } from "../utils.js";
import { useSettings } from "../SettingsContext.jsx";
import { occursOn } from "../repeat.js";
import { dayCapacity, dayLoad, loadRatio, loadLevel } from "../capacity.js";
import { Card, Chip } from "./ui.jsx";

// Outcomes that count as time actually worked on a task.
const WORKED = ["Completed", "Progress Made"];

export default function Intelligence({ tasks, dayPlans }) {
  const { focusLimit } = useSettings();
  const cap = dayCapacity(focusLimit);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), -i));
  const next7 = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i + 1));

  // Last 7 days: only time on tasks concluded as Completed or Progress Made counts — a
  // planned block that was never worked is not work done.
  const workedMinutes = (category) => tasks.reduce((sum, t) => {
    if (t.category !== category) return sum;
    const sessions = (t.sessions || []).filter(s => last7.includes(s.date) && WORKED.includes(s.outcome)).length;
    return sum + sessions * (Number(t.duration) || 0);
  }, 0);
  const focusMinPast = workedMinutes("focus");
  const sbMinPast = workedMinutes("smallBatch");
  const pastPlans = last7.map(d => dayPlans[d]).filter(p => p && p.concluded);
  const decisionsClosed = pastPlans.reduce((s, p) => s + (p.result?.decisionsClosed || 0), 0);
  const advanced = pastPlans.reduce((s, p) => s + (p.result?.advanced || 0), 0);
  const stalled = pastPlans.reduce((s, p) => s + (p.result?.stalled || 0), 0);
  const carried = pastPlans.reduce((s, p) => s + (p.result?.carried || 0), 0);
  const nnTotal = pastPlans.reduce((s, p) => s + (p.nonNegotiables || (p.nonNegotiable ? [p.nonNegotiable] : [])).length, 0);
  const nnAchieved = pastPlans.reduce((s, p) => {
    const m = p.result?.nonNegotiable?.match(/^(\d+)\//);
    return s + (m ? Number(m[1]) : 0);
  }, 0);

  // Next 7 days: open work per day against the same capacity rule the Week and Month views use.
  const days = next7.map(d => {
    const plan = dayPlans[d];
    const load = dayLoad(plan, tasks, d, tasks.filter(t => occursOn(t, d)));
    return { d, plan, load, ratio: loadRatio(load, cap), free: Math.max(0, cap.focus - load.focus) };
  });
  const focusMinFuture = days.reduce((s, x) => s + x.load.focus, 0);
  const sbMinFuture = days.reduce((s, x) => s + x.load.smallBatch, 0);
  const focusCapTotal = 7 * cap.focus, sbCapTotal = 7 * cap.smallBatch;
  const anythingPlanned = days.some(x => x.plan || x.load.tasks.length);
  const weekLevel = loadLevel(Math.max(focusMinFuture / focusCapTotal, sbMinFuture / sbCapTotal), { planned: anythingPlanned });
  const forecastLabel = { over: "Over capacity", heavy: "Overloaded", moderate: "Tight", light: "Healthy", open: "Healthy", unplanned: "Unplanned" }[weekLevel.key];
  const forecastTone = weekLevel.key === "over" || weekLevel.key === "heavy" ? "warn" : weekLevel.key === "moderate" ? "outline" : "smallbatch";
  const overDays = days.filter(x => x.ratio > 1);
  const heavyDays = days.filter(x => x.ratio <= 1 && x.free <= 10);
  // The day with the most Focus room — worth pointing out only when the days actually differ.
  const frees = days.map(x => x.free);
  const best = [...days].sort((a, b) => b.free - a.free)[0];
  const realDifference = Math.max(...frees) - Math.min(...frees) >= 30;

  const openHighImportance = tasks.filter(t => t.status !== "done" && t.importance === "High" && (t.carryForwardCount || 0) >= 2);

  const bar = (used, total, color) => (
    <div className="h-2 rounded-full bg-black/[0.06]"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, (used / total) * 100)}%`, background: used > total ? ALERT : color }} /></div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Productivity Intelligence</h2>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40 mb-2">Last 7 Days · from concluded days</p>
        <div className="grid grid-cols-3 gap-2.5">
          {[["Focus Time", `${focusMinPast}m`], ["Small Batch", `${sbMinPast}m`], ["Decisions Closed", decisionsClosed],
            ["Tasks Advanced", advanced], ["Stalled", stalled], ["Carried Forward", carried],
            ["Non-Neg. Achieved", `${nnAchieved}/${nnTotal}`]].map(([l, v]) => (
            <Card key={l} className="p-3 text-center">
              <p className="text-lg font-semibold" style={{ color: INK }}>{v}</p>
              <p className="text-[10px] text-black/40 uppercase tracking-wide mt-0.5">{l}</p>
            </Card>
          ))}
        </div>
        <p className="text-[11px] text-black/35 mt-1.5">Focus and Small Batch minutes count tasks concluded as Completed or Progress Made, not blocks that were only planned.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Next 7 Days Forecast</p>
          <Chip tone={forecastTone}>{forecastLabel}</Chip>
        </div>
        <Card className="p-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-black/50 mb-1"><span>Focus Capacity</span><span style={focusMinFuture > focusCapTotal ? { color: ALERT, fontWeight: 600 } : {}}>{focusMinFuture} of {focusCapTotal} min</span></div>
            {bar(focusMinFuture, focusCapTotal, ACCENT)}
          </div>
          <div>
            <div className="flex justify-between text-xs text-black/50 mb-1"><span>Small Batch Capacity</span><span style={sbMinFuture > sbCapTotal ? { color: ALERT, fontWeight: 600 } : {}}>{sbMinFuture} of {sbCapTotal} min</span></div>
            {bar(sbMinFuture, sbCapTotal, SAGE)}
          </div>
          {!anythingPlanned && <p className="text-xs text-black/40">Nothing is planned or scheduled for the coming week yet.</p>}
        </Card>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40 mb-2">Recommendations</p>
        <div className="space-y-2">
          {overDays.map(x => (
            <Card key={x.d} className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: ALERT }} />{fmtDate(x.d)} is over capacity ({x.load.focus} of {cap.focus} min Focus, {x.load.smallBatch} of {cap.smallBatch} min Small Batch) — move something out.</Card>
          ))}
          {heavyDays.slice(0, 1).map(x => (
            <Card key={x.d} className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: ACCENT_WARM }} />{fmtDate(x.d)} is already Focus-heavy; avoid adding another Focus task.</Card>
          ))}
          {anythingPlanned && realDifference && best.free > 60 && (
            <Card className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><TrendingUp size={15} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />{fmtDate(best.d)} has the most Focus room this week ({best.free}m free).</Card>
          )}
          {openHighImportance.length > 0 && (
            <Card className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><Flag size={15} className="mt-0.5 shrink-0" style={{ color: ALERT }} />{openHighImportance.length} high-importance task{openHighImportance.length > 1 ? "s have" : " has"} carried forward repeatedly — prioritise this week.</Card>
          )}
          {!anythingPlanned && <p className="text-sm text-black/40">Plan a few days to unlock forecasting.</p>}
          {anythingPlanned && !overDays.length && !heavyDays.length && !(realDifference && best.free > 60) && !openHighImportance.length && <p className="text-sm text-black/40">Nothing stands out — the week looks balanced.</p>}
        </div>
      </div>
    </div>
  );
}
