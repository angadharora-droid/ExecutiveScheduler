import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, X, Star, ChevronRight, ChevronLeft, Clock, Calendar, Sparkles, Lock, AlertCircle,
} from "lucide-react";
import {
  DAY_TYPES, WEEKDAY_FOCUS_PREF, WEEKDAY_NAMES,
  EVENING_STOP_GROUPS, EVENING_ELIGIBLE_TYPES, breakPrefsOf,
  ACCENT, ACCENT_WARM, ALERT, INK, SAGE,
} from "../constants.js";
import { uid, todayISO, fmtDate, addDays, timeToMins, timeStrToClock } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import {
  buildBlocks, layoutWithFixed, personalToFixedBlock, specialToFixedBlock, taskToFixedBlock, eveningFixedBlocks,
  lunchFixedBlocks, dayTypeHasLunch, suggestEveningStops, scoreTask, reasonFor, isOverdueFor,
} from "../scheduleEngine.js";

// Small amber note beside a task that some other open day's plan already holds.
const AlsoOn = ({ date }) => date ? <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: ACCENT_WARM }}>Also on {fmtDate(date)}</span> : null;
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";
import PersonalBlockModal from "./PersonalBlockModal.jsx";
import FocusLimitControl from "./FocusLimitControl.jsx";
import BreaksLunchControl from "./BreaksLunchControl.jsx";

const focusKeyIndex = (k) => Number((k.match(/^focus(\d+)$/) || [])[1]) || 0;

const STEP_TITLES = ["Day Type", "Start Time", "Small Batch", "Delegation", "Focus Work", "Non-Negotiable", "Evening Window", "Generate"];

export default function PlanMyDay({ tasks, addTask, updateTask, updateTasksBulk, dayPlans, savePlan, jumpToDayView, personalBlocks, addPersonalBlock, initialDate }) {
  const { units } = useUnits();
  const { workTypes, categoryLabel, activityOptions } = useWorkTypes();
  // This account's own Focus Work slot limit — the most Focus slots any day it plans may hold.
  const { focusLimit, settings } = useSettings();
  // ...and its own break / lunch settings, which shape the breaks in every day it plans.
  const breakPrefs = useMemo(() => breakPrefsOf(settings), [settings]);
  // Stable `initial` objects for the nested "Add New ..." task modals. These MUST NOT be
  // recreated inline in the JSX — a fresh object every render fed TaskModal's reset effect
  // and caused an infinite render loop (the "Plan My Day hangs" bug).
  const newFocusTaskInitial = useMemo(() => ({ title: "", unit: units[0], priority: "High", importance: "High", category: "focus", workType: activityOptions("focus")[0], duration: 40, scheduleMode: "AUTO" }), [units, workTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  const newDelegationTaskInitial = useMemo(() => ({ title: "", unit: units[0], priority: "High", importance: "High", category: "delegation", workType: activityOptions("delegation")[0], duration: 20, scheduleMode: "AUTO" }), [units, workTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [step, setStep] = useState(1);
  // The wizard is normally run at day-end for the next day, so it opens on tomorrow. A date
  // handed in (Replan / Plan My Day from a specific day in the Day tab) takes precedence.
  const [dateISO, setDateISO] = useState(initialDate || addDays(todayISO(), 1));
  const weekday = new Date(dateISO + "T00:00:00").getDay();
  const weekdayLabel = WEEKDAY_NAMES[weekday];
  const pref = WEEKDAY_FOCUS_PREF[weekday] || {};

  const [dayType, setDayType] = useState(dayPlans[dateISO]?.dayType || "full");
  const [half, setHalf] = useState(dayPlans[dateISO]?.half || "first");
  const [startTime, setStartTime] = useState(dayPlans[dateISO]?.startTime || "11:00");
  const [sb1, setSb1] = useState(dayPlans[dateISO]?.sb1 || []);
  const [delegation, setDelegation] = useState(dayPlans[dateISO]?.delegation || []);
  const [focusSlots, setFocusSlots] = useState(dayPlans[dateISO]?.focusSlots || {});
  // Focus Work slots beyond what the day type ships with, within the user's Focus limit.
  const [extraFocus, setExtraFocus] = useState(dayPlans[dateISO]?.extraFocus || 0);
  const [nonNegotiables, setNonNegotiables] = useState(
    dayPlans[dateISO]?.nonNegotiables || (dayPlans[dateISO]?.nonNegotiable ? [dayPlans[dateISO].nonNegotiable] : [])
  );
  const [overflowPrompt, setOverflowPrompt] = useState(false);
  const [newFocusModal, setNewFocusModal] = useState(null);
  const [newDelegationModal, setNewDelegationModal] = useState(false);
  const [pbModalOpen, setPbModalOpen] = useState(false);

  const [eveningMode, setEveningMode] = useState(dayPlans[dateISO]?.eveningMode || (EVENING_ELIGIBLE_TYPES.includes(dayType) ? "retain" : "skip"));
  const [eveningStart, setEveningStart] = useState(dayPlans[dateISO]?.eveningStart || "17:45");
  const [eveningEnd, setEveningEnd] = useState(dayPlans[dateISO]?.eveningEnd || "19:15");
  const [eveningStops, setEveningStops] = useState(dayPlans[dateISO]?.eveningStops || []);
  const [stopGroup, setStopGroup] = useState(Object.keys(EVENING_STOP_GROUPS)[0]);
  const [customStop, setCustomStop] = useState("");
  const [specialTasks, setSpecialTasks] = useState(dayPlans[dateISO]?.specialTasks || []);
  const [specialForm, setSpecialForm] = useState({ title: "", time: "12:00", duration: 30 });
  const addSpecialTask = () => {
    if (!specialForm.title.trim()) return;
    setSpecialTasks(prev => [...prev, { id: uid(), ...specialForm }]);
    setSpecialForm({ title: "", time: "12:00", duration: 30 });
  };
  const removeSpecialTask = (id) => setSpecialTasks(prev => prev.filter(s => s.id !== id));

  // Reload the whole wizard's state whenever the target date changes (Today / Tomorrow / any date).
  useEffect(() => {
    const dp = dayPlans[dateISO] || {};
    setStep(1);
    setDayType(dp.dayType || "full");
    setHalf(dp.half || "first");
    setStartTime(dp.startTime || "11:00");
    setSb1(dp.sb1 || []);
    setDelegation(dp.delegation || []);
    setFocusSlots(dp.focusSlots || {});
    setExtraFocus(dp.extraFocus || 0);
    setNonNegotiables(dp.nonNegotiables || (dp.nonNegotiable ? [dp.nonNegotiable] : []));
    setEveningMode(dp.eveningMode || (EVENING_ELIGIBLE_TYPES.includes(dp.dayType || "full") ? "retain" : "skip"));
    setEveningStart(dp.eveningStart || "17:45");
    setEveningEnd(dp.eveningEnd || "19:15");
    setEveningStops(dp.eveningStops || []);
    setSpecialTasks(dp.specialTasks || []);
  }, [dateISO]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dayPlans[dateISO]?.eveningMode) return; // respect an existing saved plan
    setEveningMode(EVENING_ELIGIBLE_TYPES.includes(dayType) ? "retain" : "skip");
  }, [dayType]); // eslint-disable-line react-hooks/exhaustive-deps

  const todaysPersonalBlocks = personalBlocks.filter(p => p.date === dateISO);
  const eveningSuggestions = useMemo(() => suggestEveningStops(tasks, weekdayLabel, weekday), [tasks, weekdayLabel, weekday]);
  const showEveningBuilder = eveningMode === "retain" || eveningMode === "modify";

  const addStop = (label, group) => setEveningStops(prev => [...prev, { id: uid(), label, group }]);
  const removeStop = (id) => setEveningStops(prev => prev.filter(s => s.id !== id));
  const moveStop = (idx, dir) => setEveningStops(prev => {
    const next = [...prev];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const openTasks = tasks.filter(t => t.status !== "done");
  // Tasks explicitly pinned (Define Time) to this exact date — auto-included, not offered as a
  // pick — together with everything overdue from earlier days, which is prompted into the next
  // day planned (its old clock time no longer applies, so it joins its category block).
  const overdueForDay = openTasks.filter(t => isOverdueFor(t, dateISO, dayPlans));
  const overdueIds = new Set(overdueForDay.map(t => t.id));
  const pinnedToDay = [...openTasks.filter(t => t.scheduleMode === "DEFINE" && t.date === dateISO), ...overdueForDay];
  const untimed = (t) => !t.time || overdueIds.has(t.id);
  // A pinned task WITH a clock time becomes its own fixed block at exactly that time.
  // Without one it joins its category block (Small Batch 1 / Delegation / next Focus slot).
  const timedTasks = pinnedToDay.filter(t => !untimed(t)).sort((a, b) => timeToMins(a.time) - timeToMins(b.time));
  const timedIds = new Set(timedTasks.map(t => t.id));
  const pinnedSmallBatch = pinnedToDay.filter(t => untimed(t) && t.category === "smallBatch");
  const pinnedDelegation = pinnedToDay.filter(t => untimed(t) && t.category === "delegation");
  const pinnedFocus = pinnedToDay.filter(t => untimed(t) && t.category === "focus");
  // Where else (another open, upcoming day) a task is already planned — so the same job
  // isn't unknowingly booked twice.
  const plannedElsewhere = useMemo(() => {
    const map = {};
    const today = todayISO();
    Object.entries(dayPlans).forEach(([d, p]) => {
      if (d === dateISO || !p || p.concluded || d < today) return;
      (p.schedule || []).forEach(b => (b.taskIds || []).forEach(id => { if (!map[id]) map[id] = d; }));
    });
    return map;
  }, [dayPlans, dateISO]);
  const pinnedSmallBatchIds = pinnedSmallBatch.map(t => t.id);
  const pinnedDelegationIds = pinnedDelegation.map(t => t.id);
  // Only Auto Schedule tasks are offered as pickable options — Define Time tasks are already committed to a date.
  const smallBatchEligible = openTasks.filter(t => t.category === "smallBatch" && t.scheduleMode !== "DEFINE");
  const focusEligible = openTasks.filter(t => t.category === "focus" && t.scheduleMode !== "DEFINE");
  const delegationEligible = openTasks.filter(t => t.category === "delegation" && t.scheduleMode !== "DEFINE");

  const finalSb1 = useMemo(() => Array.from(new Set([...pinnedSmallBatchIds, ...sb1])), [pinnedSmallBatchIds.join(","), sb1]); // eslint-disable-line
  const finalDelegation = useMemo(() => Array.from(new Set([...pinnedDelegationIds, ...delegation])), [pinnedDelegationIds.join(","), delegation]); // eslint-disable-line

  const blocks = useMemo(() => buildBlocks(dayType, half, extraFocus, focusLimit, breakPrefs), [dayType, half, extraFocus, focusLimit, breakPrefs]);
  // The n-th Focus block always has key `focus<n>`, so slot keys double as positions.
  const focusBlockKeys = blocks.filter(b => b.type === "focus").map(b => b.key);
  // Slots the day type itself ships with (already trimmed to the user's limit); the rest are extras.
  const baseFocusCount = useMemo(() => buildBlocks(dayType, half, 0, focusLimit).filter(b => b.type === "focus").length, [dayType, half, focusLimit]);
  const maxExtraFocus = Math.max(0, focusLimit - baseFocusCount);
  const atFocusLimit = focusBlockKeys.length >= focusLimit;

  // Auto-seat any pinned Focus tasks for this date into open Focus slots as soon as they're
  // known, opening extra slots for them only up to the user's Focus limit. Whatever still
  // doesn't fit is listed under the slots so the user can raise the limit or move a task.
  useEffect(() => {
    if (pinnedFocus.length === 0) return;
    setFocusSlots(prev => {
      const already = new Set(Object.values(prev));
      const unassigned = pinnedFocus.filter(t => !already.has(t.id));
      if (unassigned.length === 0) return prev;
      const next = { ...prev };
      let ai = 0;
      focusBlockKeys.forEach(k => { if (!next[k] && unassigned[ai]) { next[k] = unassigned[ai].id; ai++; } });
      for (let n = focusBlockKeys.length + 1; ai < unassigned.length && n <= focusLimit; n++) { next[`focus${n}`] = unassigned[ai].id; ai++; }
      return ai > 0 ? next : prev;
    });
    // focusSlots is a dependency so a pinned task left waiting at the limit takes a slot the
    // moment one is cleared; it seats nothing when nothing is open, so this cannot loop.
  }, [dateISO, pinnedFocus.map(t => t.id).join(","), focusBlockKeys.join(","), focusLimit, focusSlots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the slot count in step with the seated slot keys and the user's Focus limit: grow to
  // cover every seated key (auto-seated overflow above, or a saved plan / day-type change that
  // left assignments beyond the day type's own Focus blocks) but never past the limit — and
  // when the limit is lowered, shed the extra slots and any selections beyond it.
  useEffect(() => {
    const maxIdx = Object.entries(focusSlots).filter(([, v]) => v).map(([k]) => focusKeyIndex(k)).reduce((m, n) => Math.max(m, n), 0);
    const wanted = Math.min(Math.max(focusBlockKeys.length, maxIdx), focusLimit);
    const nextExtra = Math.min(maxExtraFocus, Math.max(0, wanted - baseFocusCount));
    if (nextExtra !== extraFocus) setExtraFocus(nextExtra);
    if (maxIdx > focusLimit) setFocusSlots(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => focusKeyIndex(k) <= focusLimit)));
  }, [focusSlots, focusBlockKeys.join(","), focusLimit, baseFocusCount, maxExtraFocus, extraFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pinned Focus tasks for this day that found no slot under the limit.
  const seatedIds = new Set(Object.values(focusSlots).filter(Boolean));
  const unseatedPinnedFocus = pinnedFocus.filter(t => !seatedIds.has(t.id));

  const addFocusSlot = () => { if (!atFocusLimit) setExtraFocus(e => Math.min(maxExtraFocus, e + 1)); };
  // Only the last slot can go, and only if it is an extra one, so numbering stays contiguous.
  const removeLastFocusSlot = () => {
    if (extraFocus <= 0) return;
    const lastKey = focusBlockKeys[focusBlockKeys.length - 1];
    setFocusSlots(prev => { const next = { ...prev }; delete next[lastKey]; return next; });
    setExtraFocus(e => Math.max(0, e - 1));
  };

  const toggleSb1 = (id) => {
    if (sb1.includes(id)) { setSb1(sb1.filter(x => x !== id)); return; }
    if (finalSb1.length >= 10) { setOverflowPrompt(true); return; }
    setSb1([...sb1, id]);
  };

  const [delegationOverflow, setDelegationOverflow] = useState(false);
  const toggleDelegation = (id) => {
    if (delegation.includes(id)) { setDelegation(delegation.filter(x => x !== id)); return; }
    if (finalDelegation.length >= 5) { setDelegationOverflow(true); return; }
    setDelegation([...delegation, id]);
  };

  const toggleNonNegotiable = (id) => {
    if (nonNegotiables.includes(id)) { setNonNegotiables(nonNegotiables.filter(x => x !== id)); return; }
    if (nonNegotiables.length >= 3) return;
    setNonNegotiables([...nonNegotiables, id]);
  };

  const delegationRecommendations = useMemo(() => {
    const pool = delegationEligible.filter(t => !delegation.includes(t.id));
    return pool
      .map(t => ({ t, score: scoreTask(t, { dateISO, weekdayLabel }) }))
      .sort((a, b) => b.score - a.score)
      .map(({ t }) => ({ task: t, reason: reasonFor(t, weekdayLabel) }));
  }, [delegationEligible, delegation, dateISO, weekdayLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ranked list of all eligible tasks per focus slot, computed once per relevant change instead of
  // re-scoring and re-sorting the whole pool on every keystroke/render.
  const focusRecommendations = useMemo(() => {
    const out = {};
    focusBlockKeys.forEach(slotKey => {
      const chosenElsewhere = Object.entries(focusSlots).filter(([k, v]) => k !== slotKey && v).map(([, v]) => v);
      const pool = focusEligible.filter(t => !chosenElsewhere.includes(t.id));
      const ranked = pool
        .map(t => ({ t, score: scoreTask(t, { dateISO, weekdayLabel }) }))
        .sort((a, b) => b.score - a.score);
      // Every eligible Focus task is listed, best match first. A selected task that is not in
      // the pool (e.g. one pinned to this day) is placed at the top so it stays visible.
      const selectedId = focusSlots[slotKey];
      if (selectedId && !ranked.find(r => r.t.id === selectedId)) {
        const selTask = tasks.find(x => x.id === selectedId);
        if (selTask) ranked.unshift({ t: selTask });
      }
      out[slotKey] = ranked.map(({ t }) => ({ task: t, reason: reasonFor(t, weekdayLabel), pinned: t.scheduleMode === "DEFINE" }));
    });
    return out;
  }, [focusBlockKeys.join(","), focusSlots, focusEligible, tasks, dateISO, weekdayLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const tomorrowISO = addDays(todayISO(), 1);
  const locked = !!dayPlans[dateISO]?.concluded;

  const header = (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 className="font-serif text-2xl" style={{ color: INK }}>Plan My Day</h2>
        <p className="text-sm text-black/45 mt-0.5">
          {fmtDate(dateISO)}{locked ? " · concluded" : ` · Step ${step} of ${STEP_TITLES.length} — ${STEP_TITLES[step-1]}`}
        </p>
      </div>
      <div className="flex gap-2">
        {[[todayISO(), "Today"], [tomorrowISO, "Tomorrow"]].map(([d, label]) => (
          <button key={d} onClick={() => setDateISO(d)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1"
            style={{ borderColor: dateISO === d ? INK : "rgba(0,0,0,0.1)", background: dateISO === d ? INK : "white", color: dateISO === d ? "white" : "rgba(0,0,0,0.6)" }}>
            {label}{dayPlans[d]?.concluded ? <Lock size={10} /> : dayPlans[d] ? " ✓" : ""}
          </button>
        ))}
        <input type="date" value={dateISO} min={todayISO()} onChange={(e) => setDateISO(e.target.value)}
          className="border border-black/10 rounded-full px-3 py-1.5 text-xs outline-none" />
      </div>
    </div>
  );

  // A concluded day is locked: it can be looked at, never replanned.
  if (locked) {
    const r = dayPlans[dateISO].result;
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {header}
        <Card className="p-10 text-center space-y-4">
          <Lock size={26} className="mx-auto text-black/30" />
          <div>
            <p className="text-sm font-medium" style={{ color: INK }}>{fmtDate(dateISO)} has been concluded and is locked.</p>
            <p className="text-xs text-black/45 mt-1">
              {r ? `${r.classification} · ${r.completed} completed · ${r.carried} carried forward.` : ""} Its schedule can't be replanned. Pick another day above.
            </p>
          </div>
          <div className="flex gap-2 justify-center">
            <GhostButton onClick={() => jumpToDayView(dateISO)}>Open Day view</GhostButton>
            {dateISO !== tomorrowISO && <PrimaryButton onClick={() => setDateISO(tomorrowISO)}>Plan tomorrow <ChevronRight size={15} /></PrimaryButton>}
          </div>
        </Card>
      </div>
    );
  }

  const generate = () => {
    // Overdue tasks pulled into this day now live on this day (their old clock time is gone).
    // One write for all of them — the plan saved below is where they land, so there is
    // nothing for a per-task plan sync to do.
    if (overdueForDay.length) updateTasksBulk(Object.fromEntries(overdueForDay.map(t => [t.id, { date: dateISO, time: "" }])));
    // Timed tasks are laid in as their own fixed blocks below, so they must not also be
    // seated in a category block (possible when a saved plan pre-dates the task's time).
    const sb1Ids = finalSb1.filter(id => !timedIds.has(id));
    const delegationIds = finalDelegation.filter(id => !timedIds.has(id));
    const structuredWithTasks = blocks.map(b => {
      if (b.type === "smallbatch" && b.key === "sb1") return { ...b, taskIds: sb1Ids };
      if (b.type === "delegation") {
        const durSum = delegationIds.reduce((s, id) => { const t = tasks.find(x => x.id === id); return s + (t?.duration || 0); }, 0);
        return { ...b, taskIds: delegationIds, duration: durSum > 0 ? durSum : b.duration };
      }
      if (b.type === "focus") {
        const chosenId = focusSlots[b.key] && !timedIds.has(focusSlots[b.key]) ? focusSlots[b.key] : null;
        const chosenTask = chosenId ? tasks.find(x => x.id === chosenId) : null;
        return { ...b, taskIds: chosenId ? [chosenId] : [], duration: chosenTask?.duration || b.duration };
      }
      return { ...b, taskIds: [] };
    });
    // Everything with a clock time is anchored; the structured blocks flow around it.
    const fixedBlocks = [
      ...todaysPersonalBlocks.map(personalToFixedBlock),
      ...specialTasks.map(specialToFixedBlock),
      ...timedTasks.map(taskToFixedBlock),
      ...lunchFixedBlocks(dayType, half, breakPrefs, timeToMins(startTime)),
      ...eveningFixedBlocks(eveningMode, eveningStart, eveningEnd, eveningStops),
    ];
    const { schedule: finalSchedule } = layoutWithFixed(structuredWithTasks, timeToMins(startTime), fixedBlocks);

    const plan = {
      date: dateISO, dayType, half, startTime, sb1: finalSb1, delegation: finalDelegation, focusSlots, extraFocus, focusLimit, ...breakPrefs,
      nonNegotiables, schedule: finalSchedule, concluded: false, createdAt: Date.now(),
      eveningMode, eveningStart, eveningEnd, eveningStops, specialTasks,
    };
    savePlan(dateISO, plan);
    jumpToDayView(dateISO);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {header}

      <div className="flex gap-1">
        {STEP_TITLES.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < step ? ACCENT : "rgba(0,0,0,0.08)" }} />
        ))}
      </div>

      {pinnedToDay.length > 0 && (
        <Card className="p-4" style={{ background: "#FBF4E4", borderColor: ACCENT_WARM }}>
          <div className="flex items-start gap-2">
            <Calendar size={15} style={{ color: ACCENT_WARM }} className="mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_WARM }}>
                {pinnedToDay.length} already scheduled for {fmtDate(dateISO)}
                {overdueForDay.length > 0 && <span style={{ color: ALERT }}> · {overdueForDay.length} overdue</span>}
              </p>
              <div className="text-xs text-black/55 mt-1 space-y-0.5">
                {timedTasks.map(t => (
                  <p key={t.id}><span className="font-semibold" style={{ color: INK }}>{timeStrToClock(t.time)}</span> · {t.title} <span className="text-black/35">· fixed slot, {t.duration}m</span></p>
                ))}
                {[...pinnedSmallBatch, ...pinnedDelegation, ...pinnedFocus].map(t => (
                  <p key={t.id} className="flex items-center gap-1.5 flex-wrap">
                    {overdueIds.has(t.id) && <AlertCircle size={11} style={{ color: ALERT }} />}
                    <span>{t.title} <span className="text-black/35">· joins the {categoryLabel(t.category)} block</span></span>
                    {overdueIds.has(t.id) && <span className="font-semibold" style={{ color: ALERT }}>overdue since {fmtDate(t.overdueSince || t.date)}</span>}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6">
          <p className="text-sm font-medium mb-4" style={{ color: INK }}>What does today look like?</p>
          <div className="grid grid-cols-2 gap-3">
            {DAY_TYPES.map(dt => {
              const Icon = dt.icon;
              const sel = dayType === dt.id;
              return (
                <button key={dt.id} onClick={() => setDayType(dt.id)}
                  className="p-4 rounded-xl border text-left flex flex-col gap-2"
                  style={{ borderColor: sel ? INK : "rgba(0,0,0,0.1)", background: sel ? "#EFEEEA" : "white" }}>
                  <Icon size={18} color={sel ? INK : "rgba(0,0,0,0.4)"} />
                  <span className="text-sm font-medium" style={{ color: INK }}>{dt.label}</span>
                </button>
              );
            })}
          </div>
          {dayType === "half" && (
            <div className="mt-4 flex gap-2">
              {["first", "second"].map(h => (
                <button key={h} onClick={() => setHalf(h)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border capitalize"
                  style={{ borderColor: half === h ? INK : "rgba(0,0,0,0.1)", background: half === h ? INK : "white", color: half === h ? "white" : INK }}>
                  {h} Half
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm font-medium mb-4" style={{ color: INK }}>What time are you starting?</p>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="border border-black/10 rounded-lg px-3 py-2 text-lg outline-none" />
            <p className="text-xs text-black/40 mt-3">Today's schedule will be calculated from this time.</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm font-medium" style={{ color: INK }}>Your breaks & lunch</p>
            <p className="text-xs text-black/40 mt-0.5 mb-4">Yours alone — each account sets its own. Applies to this day and every day you plan from now on.</p>
            <BreaksLunchControl lunchApplies={dayTypeHasLunch(dayType, half)} />
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium" style={{ color: INK }}>No-Schedule Windows today</p>
              <button onClick={() => setPbModalOpen(true)} className="text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
                <Plus size={13} /> Add
              </button>
            </div>
            {todaysPersonalBlocks.length === 0 ? (
              <p className="text-xs text-black/40">None yet — e.g. a lunch out or a doctor's appointment. The scheduler builds today's plan around whatever you add here.</p>
            ) : (
              <div className="space-y-1.5">
                {todaysPersonalBlocks.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/10">
                    <Clock size={13} className="text-black/35" />
                    <span className="text-sm flex-1" style={{ color: INK }}>{p.title}</span>
                    <Chip tone="outline">{p.startTime}–{p.endTime}</Chip>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: INK }}>Select today's Small Batch tasks</p>
            <span className="text-xs font-semibold" style={{ color: finalSb1.length >= 10 ? ALERT : "rgba(0,0,0,0.4)" }}>{finalSb1.length} / 10 selected</span>
          </div>
          {pinnedSmallBatch.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {pinnedSmallBatch.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: SAGE, background: "#F2F5F0" }}>
                  <Calendar size={14} className="text-black/30" />
                  <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                  <Chip tone="smallbatch">Scheduled for this day</Chip>
                  <Chip tone="outline">{t.unit}</Chip>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {smallBatchEligible.length === 0 && pinnedSmallBatch.length === 0 && <p className="text-sm text-black/40">No small batch tasks on the board yet.</p>}
            {smallBatchEligible.map(t => (
              <label key={t.id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer"
                style={{ borderColor: sb1.includes(t.id) ? SAGE : "rgba(0,0,0,0.08)", background: sb1.includes(t.id) ? "#F2F5F0" : "white" }}>
                <input type="checkbox" checked={sb1.includes(t.id)} onChange={() => toggleSb1(t.id)} className="accent-[#7A8B6F]" />
                <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                <AlsoOn date={plannedElsewhere[t.id]} />
                <Chip tone="outline">{t.unit}</Chip>
              </label>
            ))}
          </div>
          {overflowPrompt && (
            <div className="mt-3 p-3 rounded-lg border" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
              <p className="text-sm mb-2" style={{ color: ALERT }}>Your Small Batch is full at 10 tasks.</p>
              <div className="flex gap-2">
                <GhostButton onClick={() => setOverflowPrompt(false)}>Queue to Next Available Day</GhostButton>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium" style={{ color: INK }}>Delegation & Instructions</p>
            <span className="text-xs font-semibold" style={{ color: finalDelegation.length >= 5 ? ALERT : "rgba(0,0,0,0.4)" }}>{finalDelegation.length} / 5 selected</span>
          </div>
          <p className="text-xs text-black/40 mb-4">Recommended from your Delegation & Instructions tasks</p>
          <div className="space-y-1.5">
            {pinnedDelegation.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "#6E7B8B", background: "#EEF0F2" }}>
                <Calendar size={14} className="text-black/30" />
                <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                <Chip tone="delegation">Scheduled for this day</Chip>
                <Chip tone="outline">{t.duration}m</Chip>
              </div>
            ))}
            {delegation.map(id => {
              const t = tasks.find(x => x.id === id);
              if (!t) return null;
              return (
                <label key={id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer"
                  style={{ borderColor: "#6E7B8B", background: "#EEF0F2" }}>
                  <input type="checkbox" checked readOnly onChange={() => toggleDelegation(id)} />
                  <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                  <Chip tone="delegation">Selected</Chip>
                  <Chip tone="outline">{t.duration}m</Chip>
                </label>
              );
            })}
            {delegationRecommendations.map(({ task, reason }) => (
              <label key={task.id} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <input type="checkbox" checked={false}
                  onChange={() => toggleDelegation(task.id)} className="mt-1" />
                <div className="flex-1">
                  <p className="text-sm" style={{ color: INK }}>{task.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#6E7B8B" }}>Recommended: {reason}</p>
                </div>
                <AlsoOn date={plannedElsewhere[task.id]} />
                <Chip tone="outline">{task.duration}m</Chip>
              </label>
            ))}
            {delegationEligible.length === 0 && pinnedDelegation.length === 0 && <p className="text-sm text-black/40">No Delegation & Instructions tasks on the board yet.</p>}
          </div>
          {delegationOverflow && (
            <div className="mt-3 p-3 rounded-lg border" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
              <p className="text-sm" style={{ color: ALERT }}>Up to 5 Delegation & Instructions tasks per day — deselect one to add another.</p>
            </div>
          )}
          <button onClick={() => setNewDelegationModal(true)} className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: "#6E7B8B" }}>
            <Plus size={13} /> Add New Delegation Task
          </button>
        </Card>
      )}

      {step === 5 && (
        <div className="space-y-4">
          {focusBlockKeys.map((key, i) => {
            const chosenId = focusSlots[key];
            const chosenTask = chosenId ? tasks.find(t => t.id === chosenId) : null;
            const isExtra = i >= baseFocusCount;
            const removable = isExtra && i === focusBlockKeys.length - 1;
            return (
            <Card key={key} className="p-5">
              <div className="flex items-center justify-between mb-1 gap-2">
                <p className="text-sm font-semibold flex items-center gap-2" style={{ color: INK }}>
                  Focus Work {i + 1}
                  {isExtra && <Chip tone="outline">Extra slot</Chip>}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-black/40">{chosenTask ? `${chosenTask.duration} min (from task)` : "duration pulled from selected task"}</span>
                  {removable && (
                    <button onClick={removeLastFocusSlot} title="Remove this slot" className="text-black/30 hover:text-black/60"><X size={14} /></button>
                  )}
                </div>
              </div>
              {pref[`focus${i+1}`] && <p className="text-xs mb-3" style={{ color: ACCENT }}>Weekly preference: {pref[`focus${i+1}`]}{pref.note && i === 2 ? ` · ${pref.note}` : ""}</p>}
              <div className="space-y-1.5">
                {(focusRecommendations[key] || []).map(({ task, reason, pinned }) => {
                  const sel = focusSlots[key] === task.id;
                  return (
                    <label key={task.id} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer"
                      style={{ borderColor: sel ? ACCENT : "rgba(0,0,0,0.08)", background: sel ? "#EEF3F3" : "white" }}>
                      <input type="radio" name={key} checked={sel} disabled={pinned}
                        onChange={() => setFocusSlots({ ...focusSlots, [key]: task.id })} className="mt-1" />
                      <div className="flex-1">
                        <p className="text-sm" style={{ color: INK }}>{task.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: ACCENT }}>{pinned ? "Scheduled for this day" : sel ? "Selected" : `Recommended: ${reason}`}</p>
                      </div>
                      <AlsoOn date={plannedElsewhere[task.id]} />
                      <Chip tone="outline">{task.duration}m</Chip>
                      {sel && <Chip tone="focus">{pinned ? "Scheduled" : "Selected"}</Chip>}
                    </label>
                  );
                })}
                {focusEligible.length === 0 && pinnedFocus.length === 0 && <p className="text-sm text-black/40">No focus tasks on the board yet.</p>}
              </div>
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <button onClick={() => setNewFocusModal(key)} className="text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
                  <Plus size={13} /> Add New Focus Task
                </button>
                {chosenId && !focusRecommendations[key]?.find(r => r.task.id === chosenId && r.pinned) && (
                  <button onClick={() => setFocusSlots(prev => { const next = { ...prev }; delete next[key]; return next; })} className="text-xs font-semibold text-black/40 hover:text-black/60">
                    Clear selection
                  </button>
                )}
              </div>
            </Card>
          );})}
          {focusBlockKeys.length === 0 && (
            <Card className="p-5 text-sm text-black/45">This day type has no Focus Work slot built in — add one below if you need it.</Card>
          )}
          {unseatedPinnedFocus.length > 0 && (
            <Card className="p-4 space-y-2" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: ALERT }}>
                <AlertCircle size={13} /> {unseatedPinnedFocus.length} Focus task{unseatedPinnedFocus.length > 1 ? "s" : ""} scheduled for this day {unseatedPinnedFocus.length > 1 ? "don't" : "doesn't"} fit within your limit of {focusLimit} Focus Work slot{focusLimit === 1 ? "" : "s"}.
              </p>
              {unseatedPinnedFocus.map(t => (
                <p key={t.id} className="text-sm pl-5" style={{ color: INK }}>{t.title} <span className="text-xs text-black/40">· {t.duration}m</span></p>
              ))}
              <p className="text-xs text-black/50 pl-5">Raise your limit below, clear a slot, or move the task to another day — otherwise it stays on the board, waiting for this day.</p>
            </Card>
          )}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-black/50">
                {focusBlockKeys.length} of {focusLimit} Focus Work slot{focusLimit === 1 ? "" : "s"} today.{" "}
                {atFocusLimit ? "Your daily limit is reached — raise it below to add another." : "Each extra slot is added after the last one with a short break before it."}
              </p>
              <GhostButton onClick={addFocusSlot} disabled={atFocusLimit}><Plus size={14} /> Add Focus Work slot</GhostButton>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap border-t border-black/[0.06] pt-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: INK }}>Your Focus Work limit</p>
                <p className="text-[11px] text-black/40">The most Focus Work slots in any day you plan. Yours alone — every account sets its own.</p>
              </div>
              <FocusLimitControl />
            </div>
          </Card>
        </div>
      )}

      {step === 6 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: INK }}>What are today's non-negotiables?</p>
            <span className="text-xs font-semibold" style={{ color: nonNegotiables.length >= 3 ? ALERT : "rgba(0,0,0,0.4)" }}>{nonNegotiables.length} / 3 selected</span>
          </div>
          <div className="space-y-1.5">
            {Array.from(new Set([...timedTasks.map(t => t.id), ...finalSb1, ...finalDelegation, ...Object.values(focusSlots).filter(Boolean)])).map(id => {
              const t = tasks.find(x => x.id === id);
              if (!t) return null;
              const sel = nonNegotiables.includes(id);
              const disabled = !sel && nonNegotiables.length >= 3;
              return (
                <label key={id} className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{ borderColor: sel ? ACCENT_WARM : "rgba(0,0,0,0.08)", background: sel ? "#FBF4E4" : "white", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
                  <input type="checkbox" checked={sel} disabled={disabled} onChange={() => toggleNonNegotiable(id)} />
                  <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                  {sel && <Star size={14} fill={ACCENT_WARM} stroke="none" />}
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {step === 7 && (
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm font-medium mb-1" style={{ color: INK }}>Evening Executive Interaction Window</p>
            <p className="text-xs text-black/40 mb-4">
              {EVENING_ELIGIBLE_TYPES.includes(dayType)
                ? "5:45 – 7:15 PM · visibility, employee & guest interaction, property rounds"
                : "This day type doesn't get the evening window automatically — retain, modify, or skip it."}
            </p>
            <div className="flex gap-2">
              {["retain", "modify", "skip"].map(m => (
                <button key={m} onClick={() => setEveningMode(m)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border capitalize"
                  style={{ borderColor: eveningMode === m ? INK : "rgba(0,0,0,0.1)", background: eveningMode === m ? INK : "white", color: eveningMode === m ? "white" : INK }}>
                  {m}
                </button>
              ))}
            </div>
            {eveningMode === "modify" && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">From</label>
                  <input type="time" value={eveningStart} onChange={(e) => setEveningStart(e.target.value)}
                    className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">To</label>
                  <input type="time" value={eveningEnd} onChange={(e) => setEveningEnd(e.target.value)}
                    className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                </div>
              </div>
            )}
          </Card>

          {showEveningBuilder && (
            <Card className="p-6">
              <p className="text-sm font-medium mb-1" style={{ color: INK }}>Is there anyone or anywhere you specifically need to visit today?</p>
              <p className="text-xs text-black/40 mb-4">Select stops for Employees, Guests, Property or External / Social visits — you can reorder them below.</p>

              {eveningSuggestions.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {eveningSuggestions.map((s, i) => (
                    <button key={i} onClick={() => addStop(s.label, s.group)}
                      className="w-full text-left p-2.5 rounded-lg border border-black/10 flex items-center gap-2 hover:bg-black/[0.02]">
                      <Sparkles size={13} style={{ color: ACCENT }} />
                      <span className="text-xs" style={{ color: INK }}>Suggested today: {s.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-2">
                {Object.keys(EVENING_STOP_GROUPS).map(g => (
                  <button key={g} onClick={() => setStopGroup(g)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border"
                    style={{ borderColor: stopGroup === g ? INK : "rgba(0,0,0,0.1)", background: stopGroup === g ? INK : "white", color: stopGroup === g ? "white" : "rgba(0,0,0,0.6)" }}>
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                {EVENING_STOP_GROUPS[stopGroup].map(opt => (
                  <button key={opt} onClick={() => addStop(opt, stopGroup)}
                    className="px-2.5 py-1 rounded-full text-xs border border-black/10 hover:bg-black/[0.03]" style={{ color: INK }}>
                    + {opt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mb-4">
                <input placeholder="Add person / area / visit" value={customStop} onChange={(e) => setCustomStop(e.target.value)}
                  className="flex-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <GhostButton onClick={() => { if (customStop.trim()) { addStop(customStop.trim(), stopGroup); setCustomStop(""); } }}>Add</GhostButton>
              </div>

              {eveningStops.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-black/40 uppercase tracking-wide">Sequence</p>
                  {eveningStops.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/10">
                      <span className="text-xs text-black/35 w-4">{i + 1}</span>
                      <span className="text-sm flex-1" style={{ color: INK }}>{s.label}</span>
                      <Chip tone="outline">{s.group}</Chip>
                      <button onClick={() => moveStop(i, -1)} disabled={i === 0}><ChevronLeft size={14} className="rotate-90 text-black/30" /></button>
                      <button onClick={() => moveStop(i, 1)} disabled={i === eveningStops.length - 1}><ChevronRight size={14} className="rotate-90 text-black/30" /></button>
                      <button onClick={() => removeStop(s.id)}><X size={14} className="text-black/30" /></button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {step === 8 && (
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm font-medium mb-1" style={{ color: INK }}>Special Tasks</p>
            <p className="text-xs text-black/40 mb-4">One-off items with their own fixed time — separate from Small Batch, Focus Work, or Delegation. Think appointments, calls at a set hour, or anything that needs its own slot.</p>
            {specialTasks.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {specialTasks.map(s => (
                  <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border" style={{ borderColor: "#4A6E8B", background: "#EAF0F5" }}>
                    <Clock size={13} className="text-black/35" />
                    <span className="text-sm flex-1" style={{ color: INK }}>{s.title}</span>
                    <Chip tone="outline">{s.time} · {s.duration}m</Chip>
                    <button onClick={() => removeSpecialTask(s.id)}><X size={14} className="text-black/30" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <input placeholder="Title" value={specialForm.title} onChange={(e) => setSpecialForm({ ...specialForm, title: e.target.value })}
                className="flex-1 min-w-[8rem] border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <input type="time" value={specialForm.time} onChange={(e) => setSpecialForm({ ...specialForm, time: e.target.value })}
                className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <input type="number" value={specialForm.duration} onChange={(e) => setSpecialForm({ ...specialForm, duration: Number(e.target.value) })}
                placeholder="Minutes" className="w-20 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <GhostButton onClick={addSpecialTask}><Plus size={14} /> Add</GhostButton>
            </div>
          </Card>

          <Card className="p-8 text-center space-y-4">
            <Sparkles size={28} style={{ color: ACCENT }} className="mx-auto" />
            <p className="text-sm text-black/60">Ready to generate {fmtDate(dateISO)}'s schedule — {finalSb1.length} small batch, {finalDelegation.length} delegation, {Object.values(focusSlots).filter(Boolean).length} focus blocks{timedTasks.length ? `, ${timedTasks.length} fixed-time task${timedTasks.length > 1 ? "s" : ""}` : ""}{specialTasks.length ? `, ${specialTasks.length} special task${specialTasks.length > 1 ? "s" : ""}` : ""}{nonNegotiables.length ? `, ${nonNegotiables.length} non-negotiable${nonNegotiables.length > 1 ? "s" : ""}` : ""}{showEveningBuilder ? `, ${eveningStops.length} evening stops` : ""}.</p>
            <PrimaryButton onClick={generate} className="mx-auto"><Sparkles size={16} /> Generate Today's Schedule</PrimaryButton>
          </Card>
        </div>
      )}

      <PersonalBlockModal open={pbModalOpen} onClose={() => setPbModalOpen(false)} onSave={addPersonalBlock} />

      <div className="flex justify-between">
        <GhostButton onClick={() => setStep(Math.max(1, step - 1))} className={step === 1 ? "invisible" : ""}><ChevronLeft size={15} /> Back</GhostButton>
        {step < STEP_TITLES.length && <PrimaryButton onClick={() => setStep(step + 1)}>Next <ChevronRight size={15} /></PrimaryButton>}
      </div>

      {newFocusModal && (
        <TaskModal open={!!newFocusModal} onClose={() => setNewFocusModal(null)}
          initial={newFocusTaskInitial} tasks={tasks}
          onSave={(f) => {
            const t = addTask(f);
            setFocusSlots(prev => ({ ...prev, [newFocusModal]: t.id }));
          }} />
      )}
      {newDelegationModal && (
        <TaskModal open={newDelegationModal} onClose={() => setNewDelegationModal(false)}
          initial={newDelegationTaskInitial} tasks={tasks}
          onSave={(f) => {
            const t = addTask(f);
            setDelegation(prev => [...prev, t.id]);
          }} />
      )}
    </div>
  );
}
