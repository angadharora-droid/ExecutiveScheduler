import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, X, Star, ChevronRight, ChevronLeft, Clock, Calendar, Sparkles,
} from "lucide-react";
import {
  UNITS, FOCUS_TYPES, DELEGATION_TYPES, DAY_TYPES, WEEKDAY_FOCUS_PREF, WEEKDAY_NAMES,
  EVENING_STOP_GROUPS, EVENING_ELIGIBLE_TYPES,
  ACCENT, ACCENT_WARM, ALERT, INK, SAGE,
} from "../constants.js";
import { uid, todayISO, fmtDate, addDays, timeToMins } from "../utils.js";
import {
  buildBlocks, layInSequenceWithPersonalBlocks, appendEveningWindow,
  suggestEveningStops, scoreTask, reasonFor,
} from "../scheduleEngine.js";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";
import PersonalBlockModal from "./PersonalBlockModal.jsx";

// Stable `initial` objects for the nested "Add New ..." task modals. These MUST NOT be
// recreated inline in the JSX — a fresh object every render fed TaskModal's reset effect
// and caused an infinite render loop (the "Plan My Day hangs" bug).
const NEW_FOCUS_TASK_INITIAL = { title: "", unit: UNITS[0], priority: "High", importance: "High", category: "focus", workType: FOCUS_TYPES[0], duration: 40, scheduleMode: "AUTO" };
const NEW_DELEGATION_TASK_INITIAL = { title: "", unit: UNITS[0], priority: "High", importance: "High", category: "delegation", workType: DELEGATION_TYPES[0], duration: 20, scheduleMode: "AUTO" };

const STEP_TITLES = ["Day Type", "Start Time", "Small Batch", "Delegation", "Focus Work", "Non-Negotiable", "Evening Window", "Generate"];

export default function PlanMyDay({ tasks, addTask, updateTask, dayPlans, savePlan, jumpToDayView, personalBlocks, addPersonalBlock }) {
  const [step, setStep] = useState(1);
  const [dateISO, setDateISO] = useState(todayISO());
  const weekday = new Date(dateISO + "T00:00:00").getDay();
  const weekdayLabel = WEEKDAY_NAMES[weekday];
  const pref = WEEKDAY_FOCUS_PREF[weekday] || {};

  const [dayType, setDayType] = useState(dayPlans[dateISO]?.dayType || "full");
  const [half, setHalf] = useState(dayPlans[dateISO]?.half || "first");
  const [startTime, setStartTime] = useState(dayPlans[dateISO]?.startTime || "11:00");
  const [sb1, setSb1] = useState(dayPlans[dateISO]?.sb1 || []);
  const [delegation, setDelegation] = useState(dayPlans[dateISO]?.delegation || []);
  const [focusSlots, setFocusSlots] = useState(dayPlans[dateISO]?.focusSlots || {});
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
  // Tasks explicitly pinned (Define Time) to this exact date — auto-included, not offered as a pick.
  const pinnedSmallBatch = openTasks.filter(t => t.category === "smallBatch" && t.scheduleMode === "DEFINE" && t.date === dateISO);
  const pinnedDelegation = openTasks.filter(t => t.category === "delegation" && t.scheduleMode === "DEFINE" && t.date === dateISO);
  const pinnedFocus = openTasks.filter(t => t.category === "focus" && t.scheduleMode === "DEFINE" && t.date === dateISO);
  const pinnedSmallBatchIds = pinnedSmallBatch.map(t => t.id);
  const pinnedDelegationIds = pinnedDelegation.map(t => t.id);
  // Only Auto Schedule tasks are offered as pickable options — Define Time tasks are already committed to a date.
  const smallBatchEligible = openTasks.filter(t => t.category === "smallBatch" && t.scheduleMode !== "DEFINE");
  const focusEligible = openTasks.filter(t => t.category === "focus" && t.scheduleMode !== "DEFINE");
  const delegationEligible = openTasks.filter(t => t.category === "delegation" && t.scheduleMode !== "DEFINE");

  const finalSb1 = useMemo(() => Array.from(new Set([...pinnedSmallBatchIds, ...sb1])), [pinnedSmallBatchIds.join(","), sb1]); // eslint-disable-line
  const finalDelegation = useMemo(() => Array.from(new Set([...pinnedDelegationIds, ...delegation])), [pinnedDelegationIds.join(","), delegation]); // eslint-disable-line

  // Auto-seat any pinned Focus tasks for this date into open Focus slots as soon as they're known.
  useEffect(() => {
    if (pinnedFocus.length === 0) return;
    setFocusSlots(prev => {
      const already = new Set(Object.values(prev));
      const unassigned = pinnedFocus.filter(t => !already.has(t.id));
      if (unassigned.length === 0) return prev;
      const slotKeys = ["focus1", "focus2", "focus3"];
      const next = { ...prev };
      let ai = 0;
      slotKeys.forEach(k => { if (!next[k] && unassigned[ai]) { next[k] = unassigned[ai].id; ai++; } });
      return next;
    });
  }, [dateISO, pinnedFocus.map(t => t.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const blocks = useMemo(() => buildBlocks(dayType, half), [dayType, half]);
  const focusBlockKeys = blocks.filter(b => b.type === "focus").map(b => b.key);

  const delegationRecommendations = useMemo(() => {
    const pool = delegationEligible.filter(t => !delegation.includes(t.id));
    return pool
      .map(t => ({ t, score: scoreTask(t, { dateISO, weekdayLabel }) }))
      .sort((a, b) => b.score - a.score)
      .map(({ t }) => ({ task: t, reason: reasonFor(t, weekdayLabel) }));
  }, [delegationEligible, delegation, dateISO, weekdayLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ranked recommendations per focus slot, computed once per relevant change instead of
  // re-scoring and re-sorting the whole pool on every keystroke/render.
  const focusRecommendations = useMemo(() => {
    const out = {};
    focusBlockKeys.forEach(slotKey => {
      const chosenElsewhere = Object.entries(focusSlots).filter(([k, v]) => k !== slotKey && v).map(([, v]) => v);
      const pool = focusEligible.filter(t => !chosenElsewhere.includes(t.id));
      const ranked = pool
        .map(t => ({ t, score: scoreTask(t, { dateISO, weekdayLabel }) }))
        .sort((a, b) => b.score - a.score);
      const selectedId = focusSlots[slotKey];
      const top = ranked.slice(0, 5);
      if (selectedId && !top.find(r => r.t.id === selectedId)) {
        const sel = ranked.find(r => r.t.id === selectedId) || (tasks.find(x => x.id === selectedId) ? { t: tasks.find(x => x.id === selectedId) } : null);
        if (sel) top.unshift(sel);
      }
      out[slotKey] = top.map(({ t }) => ({ task: t, reason: reasonFor(t, weekdayLabel), pinned: t.scheduleMode === "DEFINE" }));
    });
    return out;
  }, [focusBlockKeys.join(","), focusSlots, focusEligible, tasks, dateISO, weekdayLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = () => {
    const structuredWithTasks = blocks.map(b => {
      if (b.type === "smallbatch" && b.key === "sb1") return { ...b, taskIds: finalSb1 };
      if (b.type === "delegation") {
        const durSum = finalDelegation.reduce((s, id) => { const t = tasks.find(x => x.id === id); return s + (t?.duration || 0); }, 0);
        return { ...b, taskIds: finalDelegation, duration: durSum > 0 ? durSum : b.duration };
      }
      if (b.type === "focus") {
        const chosenId = focusSlots[b.key];
        const chosenTask = chosenId ? tasks.find(x => x.id === chosenId) : null;
        return { ...b, taskIds: chosenId ? [chosenId] : [], duration: chosenTask?.duration || b.duration };
      }
      return { ...b, taskIds: [] };
    });
    const { schedule: laidIn, cursor } = layInSequenceWithPersonalBlocks(structuredWithTasks, timeToMins(startTime), todaysPersonalBlocks, specialTasks);
    const finalSchedule = appendEveningWindow(laidIn, cursor, eveningMode, eveningStart, eveningEnd, eveningStops);

    const plan = {
      date: dateISO, dayType, half, startTime, sb1: finalSb1, delegation: finalDelegation, focusSlots,
      nonNegotiables, schedule: finalSchedule, concluded: false, createdAt: Date.now(),
      eveningMode, eveningStart, eveningEnd, eveningStops, specialTasks,
    };
    savePlan(dateISO, plan);
    jumpToDayView(dateISO);
  };

  const tomorrowISO = addDays(todayISO(), 1);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-2xl" style={{ color: INK }}>Plan My Day</h2>
          <p className="text-sm text-black/45 mt-0.5">{fmtDate(dateISO)} · Step {step} of {STEP_TITLES.length} — {STEP_TITLES[step-1]}</p>
        </div>
        <div className="flex gap-2">
          {[[todayISO(), "Today"], [tomorrowISO, "Tomorrow"]].map(([d, label]) => (
            <button key={d} onClick={() => setDateISO(d)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{ borderColor: dateISO === d ? INK : "rgba(0,0,0,0.1)", background: dateISO === d ? INK : "white", color: dateISO === d ? "white" : "rgba(0,0,0,0.6)" }}>
              {label}{dayPlans[d] ? " ✓" : ""}
            </button>
          ))}
          <input type="date" value={dateISO} min={todayISO()} onChange={(e) => setDateISO(e.target.value)}
            className="border border-black/10 rounded-full px-3 py-1.5 text-xs outline-none" />
        </div>
      </div>

      <div className="flex gap-1">
        {STEP_TITLES.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < step ? ACCENT : "rgba(0,0,0,0.08)" }} />
        ))}
      </div>

      {(pinnedSmallBatch.length + pinnedDelegation.length + pinnedFocus.length) > 0 && (
        <Card className="p-4" style={{ background: "#FBF4E4", borderColor: ACCENT_WARM }}>
          <div className="flex items-start gap-2">
            <Calendar size={15} style={{ color: ACCENT_WARM }} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_WARM }}>
                {pinnedSmallBatch.length + pinnedDelegation.length + pinnedFocus.length} already scheduled for {fmtDate(dateISO)}
              </p>
              <p className="text-xs text-black/55 mt-1">
                {[...pinnedSmallBatch, ...pinnedDelegation, ...pinnedFocus].map(t => t.title).join(" · ")}
              </p>
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
            return (
            <Card key={key} className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold" style={{ color: INK }}>Focus Work {i + 1}</p>
                <span className="text-xs text-black/40">{chosenTask ? `${chosenTask.duration} min (from task)` : "duration pulled from selected task"}</span>
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
                      <Chip tone="outline">{task.duration}m</Chip>
                      {sel && <Chip tone="focus">{pinned ? "Scheduled" : "Selected"}</Chip>}
                    </label>
                  );
                })}
                {focusEligible.length === 0 && pinnedFocus.length === 0 && <p className="text-sm text-black/40">No focus tasks on the board yet.</p>}
              </div>
              <button onClick={() => setNewFocusModal(key)} className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
                <Plus size={13} /> Add New Focus Task
              </button>
            </Card>
          );})}
        </div>
      )}

      {step === 6 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: INK }}>What are today's non-negotiables?</p>
            <span className="text-xs font-semibold" style={{ color: nonNegotiables.length >= 3 ? ALERT : "rgba(0,0,0,0.4)" }}>{nonNegotiables.length} / 3 selected</span>
          </div>
          <div className="space-y-1.5">
            {[...finalSb1, ...finalDelegation, ...Object.values(focusSlots).filter(Boolean)].map(id => {
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
            <p className="text-sm text-black/60">Ready to generate {fmtDate(dateISO)}'s schedule — {finalSb1.length} small batch, {finalDelegation.length} delegation, {Object.values(focusSlots).filter(Boolean).length} focus blocks{specialTasks.length ? `, ${specialTasks.length} special task${specialTasks.length > 1 ? "s" : ""}` : ""}{nonNegotiables.length ? `, ${nonNegotiables.length} non-negotiable${nonNegotiables.length > 1 ? "s" : ""}` : ""}{showEveningBuilder ? `, ${eveningStops.length} evening stops` : ""}.</p>
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
          initial={NEW_FOCUS_TASK_INITIAL}
          onSave={(f) => {
            const t = addTask(f);
            setFocusSlots(prev => ({ ...prev, [newFocusModal]: t.id }));
          }} />
      )}
      {newDelegationModal && (
        <TaskModal open={newDelegationModal} onClose={() => setNewDelegationModal(false)}
          initial={NEW_DELEGATION_TASK_INITIAL}
          onSave={(f) => {
            const t = addTask(f);
            setDelegation(prev => [...prev, t.id]);
          }} />
      )}
    </div>
  );
}
