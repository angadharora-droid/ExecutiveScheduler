import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, X, Star, ChevronRight, ChevronLeft, ChevronDown, Clock, Calendar, Sparkles, Lock, AlertCircle, Pencil, Check,
} from "lucide-react";
import {
  DAY_TYPES, WEEKDAY_FOCUS_PREF, WEEKDAY_NAMES,
  EVENING_STOP_GROUPS, isWindow, DEFAULT_DAY_MINUTES,
  ACCENT, ACCENT_WARM, ALERT, INK, SAGE, PAPER,
} from "../constants.js";
import { uid, todayISO, fmtDate, addDays, timeToMins, timeStrToClock, minsToClock, minsToTimeStr } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { useSettings } from "../SettingsContext.jsx";
import {
  buildBlocks, layoutWithFixed, specialToFixedBlock, taskToFixedBlock, eveningFixedBlocks, eveningTimesValid,
  breakFixedBlocks, withSmallBatch2, smallBatchDuration, suggestEveningStops, scoreTask, reasonFor, isOverdueFor,
  clashWith, nextFreeStart,
} from "../scheduleEngine.js";

// Small amber note beside a task that some other open day's plan already holds.
const AlsoOn = ({ date }) => date ? <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: ACCENT_WARM }}>Also on {fmtDate(date)}</span> : null;
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";
import FocusLimitControl from "./FocusLimitControl.jsx";
import BreaksControl from "./BreaksControl.jsx";
import MinutesInput from "./MinutesInput.jsx";

const focusKeyIndex = (k) => Number((k.match(/^focus(\d+)$/) || [])[1]) || 0;
// The Focus tasks picked for a day. Plans made before the Focus step became a list kept one
// task per slot (`focusSlots`); those read back in slot order.
const focusPicksOf = (dp) => dp.focusPicks || Object.entries(dp.focusSlots || {})
  .sort(([a], [b]) => focusKeyIndex(a) - focusKeyIndex(b)).map(([, id]) => id).filter(Boolean);
// Two break lists that would place the same breaks (ids aside).
const sameBreaks = (a, b) => JSON.stringify((a || []).map(x => [x.label, x.time, x.duration])) === JSON.stringify((b || []).map(x => [x.label, x.time, x.duration]));

const STEP_TITLES = ["Day Type", "Start Time", "Small Batch", "Delegation", "Focus Work", "Non-Negotiable", "Evening Window", "Generate"];

export default function PlanMyDay({ tasks, addTask, updateTask, updateTasksBulk, deleteTask, dayPlans, savePlan, jumpToDayView, initialDate, drafts = {}, saveDraft }) {
  const { units } = useUnits();
  const { workTypes, categoryLabel, activityOptions } = useWorkTypes();
  // This account's own Focus Work slot limit — the most Focus slots any day it plans may hold
  // — and its usual breaks, which a fresh day starts from.
  const { focusLimit, settings, updateSettings } = useSettings();
  // Stable `initial` objects for the nested "Add New ..." task modals. These MUST NOT be
  // recreated inline in the JSX — a fresh object every render fed TaskModal's reset effect
  // and caused an infinite render loop (the "Plan My Day hangs" bug).
  const newFocusTaskInitial = useMemo(() => ({ title: "", unit: units[0], priority: "", importance: "", category: "focus", workType: activityOptions("focus")[0], duration: 40, scheduleMode: "AUTO" }), [units, workTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  const newDelegationTaskInitial = useMemo(() => ({ title: "", unit: units[0], priority: "", importance: "", category: "delegation", workType: activityOptions("delegation")[0], duration: 20, scheduleMode: "AUTO" }), [units, workTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  // The wizard opens on today until today is planned, then on tomorrow. A date handed in
  // (Replan / Plan My Day from a specific day in the Day tab) takes precedence.
  const [dateISO, setDateISO] = useState(initialDate || (dayPlans[todayISO()] ? addDays(todayISO(), 1) : todayISO()));
  // What the wizard starts from for this date: the draft left behind earlier (see saveDraft),
  // else the saved plan, else nothing.
  const init = drafts[dateISO] || dayPlans[dateISO] || {};
  const [step, setStep] = useState(init.step || 1);
  const weekday = new Date(dateISO + "T00:00:00").getDay();
  const weekdayLabel = WEEKDAY_NAMES[weekday];
  const pref = WEEKDAY_FOCUS_PREF[weekday] || {};

  const [dayType, setDayType] = useState(init.dayType || "full");
  const [half, setHalf] = useState(init.half || "first");
  const [startTime, setStartTime] = useState(init.startTime || "11:00");
  // How long the day runs from its start — 9 hours unless changed for this date. Moving the
  // start moves the end with it.
  const [dayMinutes, setDayMinutes] = useState(init.dayMinutes || DEFAULT_DAY_MINUTES);
  const [sb1, setSb1] = useState(init.sb1 || []);
  // Small Batch 2 is optional: the block exists only for the tasks chosen here.
  const [sb2, setSb2] = useState(init.sb2 || []);
  const [sb2Open, setSb2Open] = useState(init.sb2Open ?? (init.sb2 || []).length > 0);
  // The day's breaks — when and for how long — starting from this account's usual ones
  // (which may still be loading when the wizard opens, hence the effect below).
  const [breaks, setBreaks] = useState(init.breaks || settings.breaks);
  const [breaksTouched, setBreaksTouched] = useState(!!init.breaksTouched);
  useEffect(() => { if (!breaksTouched && !(drafts[dateISO] || dayPlans[dateISO])?.breaks) setBreaks(settings.breaks); }, [settings.breaks]); // eslint-disable-line react-hooks/exhaustive-deps
  const [delegation, setDelegation] = useState(init.delegation || []);
  // Focus Work picked for the day (tasks on Auto; ones pinned to the day come in by
  // themselves), and the clock times given here to any Focus task of the day. A task with a
  // time is fixed at it; one without takes the next Focus slot. Times reach the tasks
  // themselves when the day is generated.
  const [focusPicks, setFocusPicks] = useState(() => focusPicksOf(init));
  const [focusTimes, setFocusTimes] = useState(init.focusTimes || {});
  // A time asked for that is already taken: task id -> { text, next } (next free start).
  const [timeAlerts, setTimeAlerts] = useState({});
  const [nonNegotiables, setNonNegotiables] = useState(init.nonNegotiables || (init.nonNegotiable ? [init.nonNegotiable] : []));
  const [overflowPrompt, setOverflowPrompt] = useState(false);
  const [newFocusModal, setNewFocusModal] = useState(false);
  // The list of what is already on the day stays folded to one line unless asked for.
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [newDelegationModal, setNewDelegationModal] = useState(false);
  // The No-Schedule Window being written for this day: null, "new", or the window task itself.
  const [windowModal, setWindowModal] = useState(null);
  const newWindowInitial = useMemo(() => ({
    title: "", unit: "", priority: "", importance: "", category: "noSchedule", workType: activityOptions("noSchedule")[0],
    duration: 60, scheduleMode: "DEFINE", date: dateISO, time: "12:00", notes: "",
  }), [dateISO, workTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  // This weekday's usual Focus (Monday → CPA, say). A Focus task added here starts on that
  // unit, and tasks that match it are offered first.
  const prefFocus = Object.entries(pref).filter(([k]) => /^focus\d+$/.test(k)).map(([, v]) => v);
  const prefUnit = prefFocus.find(v => units.includes(v));
  const newFocusInitial = useMemo(() => (prefUnit ? { ...newFocusTaskInitial, unit: prefUnit } : newFocusTaskInitial), [prefUnit, newFocusTaskInitial]);

  // The evening window is skipped unless it is asked for — on every day type.
  const [eveningMode, setEveningMode] = useState(init.eveningMode || "skip");
  const [eveningStart, setEveningStart] = useState(init.eveningStart || "17:45");
  const [eveningEnd, setEveningEnd] = useState(init.eveningEnd || "19:15");
  const [eveningStops, setEveningStops] = useState(init.eveningStops || []);
  const [stopGroup, setStopGroup] = useState(Object.keys(EVENING_STOP_GROUPS)[0]);
  const [customStop, setCustomStop] = useState("");
  const [specialTasks, setSpecialTasks] = useState(init.specialTasks || []);
  const [specialForm, setSpecialForm] = useState({ title: "", time: "12:00", duration: 30 });
  const addSpecialTask = () => {
    if (!specialForm.title.trim()) return;
    setSpecialTasks(prev => [...prev, { id: uid(), ...specialForm }]);
    setSpecialForm({ title: "", time: "12:00", duration: 30 });
  };
  const removeSpecialTask = (id) => setSpecialTasks(prev => prev.filter(s => s.id !== id));

  // Everything chosen so far, kept per date while the user is elsewhere in the app (App holds
  // it): switching dates or tabs and coming back picks up exactly here.
  const snapshot = () => ({ step, dayType, half, startTime, dayMinutes, sb1, sb2, sb2Open, breaks, breaksTouched, delegation, focusPicks, focusTimes, nonNegotiables, eveningMode, eveningStart, eveningEnd, eveningStops, specialTasks, draft: true });
  const latest = useRef(null);
  latest.current = { date: dateISO, snapshot: snapshot() };
  useEffect(() => () => { if (saveDraft && latest.current) saveDraft(latest.current.date, latest.current.snapshot); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changeDate = (d) => { if (d === dateISO) return; saveDraft?.(dateISO, snapshot()); setDateISO(d); };

  // Reload the whole wizard's state whenever the target date changes (Today / Tomorrow / any date).
  useEffect(() => {
    const dp = drafts[dateISO] || dayPlans[dateISO] || {};
    setStep(dp.step || 1);
    setDayType(dp.dayType || "full");
    setHalf(dp.half || "first");
    setStartTime(dp.startTime || "11:00");
    setDayMinutes(dp.dayMinutes || DEFAULT_DAY_MINUTES);
    setSb1(dp.sb1 || []);
    setSb2(dp.sb2 || []);
    setSb2Open(dp.sb2Open ?? (dp.sb2 || []).length > 0);
    setBreaks(dp.breaks || settings.breaks);
    setBreaksTouched(!!dp.breaksTouched);
    setDelegation(dp.delegation || []);
    setFocusPicks(focusPicksOf(dp));
    setFocusTimes(dp.focusTimes || {});
    setTimeAlerts({});
    setNonNegotiables(dp.nonNegotiables || (dp.nonNegotiable ? [dp.nonNegotiable] : []));
    setEveningMode(dp.eveningMode || "skip");
    setEveningStart(dp.eveningStart || "17:45");
    setEveningEnd(dp.eveningEnd || "19:15");
    setEveningStops(dp.eveningStops || []);
    setSpecialTasks(dp.specialTasks || []);
  }, [dateISO]); // eslint-disable-line react-hooks/exhaustive-deps

  // No-Schedule Windows on this day: tasks of that work type, laid in as fixed blocks below.
  const windowsForDay = tasks.filter(t => isWindow(t) && t.status !== "done" && t.date === dateISO).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const eveningSuggestions = useMemo(() => suggestEveningStops(tasks, weekdayLabel, weekday), [tasks, weekdayLabel, weekday]);
  const showEveningBuilder = eveningMode === "retain" || eveningMode === "modify";
  // A modified evening window has to end after it starts; until it does, the wizard waits.
  const eveningOk = eveningTimesValid(eveningMode, eveningStart, eveningEnd);
  // Where the day ends; nothing but the user's own fixed times is placed after it.
  const startMins = timeToMins(startTime);
  const dayEnd = startMins + dayMinutes;
  const dayLength = `${Math.floor(dayMinutes / 60)}h${dayMinutes % 60 ? ` ${dayMinutes % 60}m` : ""}`;
  // An end time before the start runs past midnight.
  const setDayEndTime = (t) => { if (t) setDayMinutes(((timeToMins(t) - startMins) % 1440 + 1440) % 1440 || 1440); };
  // The working day a break has to fall inside: from the start time to the day's end, or to
  // the end of Closure when an evening window runs later.
  const closureEnd = eveningMode === "skip" ? 0 : (eveningMode === "modify" ? Math.max(timeToMins(eveningEnd), timeToMins(eveningStart)) : 19 * 60 + 15) + 45;
  const dayEndMins = Math.max(dayEnd, closureEnd);
  // A Half Day's second half starts in the afternoon; picking a half sets a matching start.
  const chooseHalf = (h) => {
    setHalf(h);
    if (h === "second" && timeToMins(startTime) < 13 * 60) setStartTime("14:00");
    if (h === "first" && timeToMins(startTime) >= 13 * 60) setStartTime("11:00");
  };

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
  // What can go into this day: open tasks on Auto, pinned to this date, or overdue from an
  // earlier one. A task since pinned to another date (from the Day view, say) belongs there.
  const usableKey = openTasks.filter(t => t.scheduleMode !== "DEFINE" || t.date === dateISO || isOverdueFor(t, dateISO, dayPlans)).map(t => t.id).join(",");
  const usableIdSet = useMemo(() => new Set(usableKey ? usableKey.split(",") : []), [usableKey]);
  const durationOf = (id) => tasks.find(x => x.id === id)?.duration || 0;
  // A task finished or moved to another date since the plan was made (or the draft left)
  // drops out of every choice: Replan never carries it back into the day, nor counts it.
  useEffect(() => {
    const keep = (ids) => { const next = ids.filter(id => usableIdSet.has(id)); return next.length === ids.length ? ids : next; };
    setSb1(keep); setSb2(keep); setDelegation(keep); setNonNegotiables(keep); setFocusPicks(keep);
  }, [usableIdSet]);
  // Tasks explicitly pinned (Define Time) to this exact date — auto-included, not offered as a
  // pick — together with everything overdue from earlier days, which is prompted into the next
  // day planned (its old clock time no longer applies, so it joins its category block).
  const overdueForDay = openTasks.filter(t => isOverdueFor(t, dateISO, dayPlans));
  const overdueIds = new Set(overdueForDay.map(t => t.id));
  const pinnedToDay = [...openTasks.filter(t => t.scheduleMode === "DEFINE" && t.date === dateISO), ...overdueForDay];
  const untimed = (t) => !t.time || overdueIds.has(t.id);
  // The day's Focus Work: tasks pinned to it first, then the ones picked here. Its time is the
  // one set here, else a pinned task's own (an overdue task's old time no longer applies).
  const focusTimeOf = (t) => (t.id in focusTimes ? focusTimes[t.id] : untimed(t) ? "" : t.time || "");
  const pinnedFocusAll = pinnedToDay.filter(t => t.category === "focus");
  const pickedFocus = focusPicks.map(id => tasks.find(t => t.id === id))
    .filter(t => t && t.category === "focus" && usableIdSet.has(t.id) && !pinnedFocusAll.includes(t));
  const dayFocus = [...pinnedFocusAll, ...pickedFocus];
  // Without a time, Focus tasks take the day's Focus slots in order, up to the user's limit.
  const untimedFocus = dayFocus.filter(t => !focusTimeOf(t));
  const seatedFocus = untimedFocus.slice(0, focusLimit);
  const unseatedFocus = untimedFocus.slice(focusLimit);
  // A task WITH a clock time becomes its own fixed block at exactly that time. Without one
  // it joins its category (Small Batch 1 / Delegation / the next Focus slot).
  const timedTasks = [
    ...pinnedToDay.filter(t => t.category !== "focus" && !untimed(t)),
    ...dayFocus.filter(t => focusTimeOf(t)).map(t => ({ ...t, time: focusTimeOf(t) })),
  ].sort((a, b) => timeToMins(a.time) - timeToMins(b.time));
  const timedIds = new Set(timedTasks.map(t => t.id));
  const pinnedSmallBatch = pinnedToDay.filter(t => untimed(t) && t.category === "smallBatch");
  const pinnedDelegation = pinnedToDay.filter(t => untimed(t) && t.category === "delegation");
  const pinnedFocus = pinnedFocusAll.filter(t => !focusTimeOf(t));
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

  const finalSb1 = useMemo(() => Array.from(new Set([...pinnedSmallBatchIds, ...sb1])).filter(id => usableIdSet.has(id)), [pinnedSmallBatchIds.join(","), sb1, usableIdSet]); // eslint-disable-line
  const finalDelegation = useMemo(() => Array.from(new Set([...pinnedDelegationIds, ...delegation])).filter(id => usableIdSet.has(id)), [pinnedDelegationIds.join(","), delegation, usableIdSet]); // eslint-disable-line

  // Slots the day type itself ships with (already trimmed to the user's limit); the day gets
  // more, up to the limit, when more Focus tasks without a time are picked.
  const baseFocusCount = useMemo(() => buildBlocks(dayType, half, 0, focusLimit).filter(b => b.type === "focus").length, [dayType, half, focusLimit]);
  const extraFocus = Math.max(0, seatedFocus.length - baseFocusCount);
  const blocks = useMemo(() => buildBlocks(dayType, half, extraFocus, focusLimit), [dayType, half, extraFocus, focusLimit]);
  // The n-th Focus block takes the n-th seated Focus task.
  const focusBlockKeys = blocks.filter(b => b.type === "focus").map(b => b.key);

  const toggleSb1 = (id) => {
    if (sb1.includes(id)) { setSb1(sb1.filter(x => x !== id)); return; }
    if (finalSb1.length >= 10) { setOverflowPrompt(true); return; }
    setSb1([...sb1, id]);
  };

  // Small Batch 2 takes the user's picks only; a task that later joins Small Batch 1 leaves it.
  const toggleSb2 = (id) => setSb2(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 10 ? prev : [...prev, id]);
  const finalSb2 = sb2.filter(id => !finalSb1.includes(id) && usableIdSet.has(id));
  // How much work each Small Batch list holds with the tasks chosen.
  const sb1Minutes = smallBatchDuration(finalSb1.map(durationOf), 0);
  const sb2Minutes = smallBatchDuration(finalSb2.map(durationOf), 0);

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

  // Focus tasks not picked yet, best match first: this weekday's usual Focus leads, then the
  // usual score (importance, days pending, carried forward...).
  const prefMatch = (t) => prefFocus.find(v => t.unit === v || t.title.toLowerCase().includes(v.toLowerCase()));
  const focusRecommendations = useMemo(() => focusEligible
    .filter(t => !focusPicks.includes(t.id))
    .map(t => ({ t, score: scoreTask(t, { dateISO, weekdayLabel }) + (prefMatch(t) ? 40 : 0) }))
    .sort((a, b) => b.score - a.score)
    .map(({ t }) => ({ task: t, reason: prefMatch(t) ? `${weekdayLabel}'s usual Focus · ${prefMatch(t)}` : reasonFor(t, weekdayLabel) })),
  [focusEligible, focusPicks, dateISO, weekdayLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFocus = (id) => {
    if (focusPicks.includes(id)) {
      setFocusPicks(focusPicks.filter(x => x !== id));
      setFocusTimes(p => { if (!(id in p)) return p; const n = { ...p }; delete n[id]; return n; });
      setTimeAlerts(a => { if (!a[id]) return a; const n = { ...a }; delete n[id]; return n; });
      return;
    }
    setFocusPicks([...focusPicks, id]);
  };

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
          <button key={d} onClick={() => changeDate(d)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1"
            style={{ borderColor: dateISO === d ? INK : "rgba(0,0,0,0.1)", background: dateISO === d ? INK : "white", color: dateISO === d ? "white" : "rgba(0,0,0,0.6)" }}>
            {label}{dayPlans[d]?.concluded ? <Lock size={10} /> : dayPlans[d] ? " ✓" : ""}
          </button>
        ))}
        <input type="date" value={dateISO} min={todayISO()} onChange={(e) => { if (e.target.value) changeDate(e.target.value); }}
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
            {dateISO !== tomorrowISO && <PrimaryButton onClick={() => changeDate(tomorrowISO)}>Plan tomorrow <ChevronRight size={15} /></PrimaryButton>}
          </div>
        </Card>
      </div>
    );
  }

  // Everything on the day with a clock time of its own, leaving out task `exceptId`: timed
  // tasks (with the times set here), special tasks, breaks and the evening window.
  const fixedBlocksFor = (exceptId = null) => [
    ...specialTasks.map(specialToFixedBlock),
    ...timedTasks.filter(t => t.id !== exceptId).map(taskToFixedBlock),
    ...breakFixedBlocks(breaks, startMins),
    ...eveningFixedBlocks(eveningMode, eveningStart, eveningEnd, eveningStops),
  ];

  // Give a Focus task of the day a time (or take it away with ""). A time already taken by
  // something else on the day is refused, with what holds it and the next free time.
  const setFocusTime = (t, time) => {
    if (time) {
      const start = timeToMins(time);
      const duration = Math.max(5, Number(t.duration) || 5);
      const others = fixedBlocksFor(t.id);
      const c = clashWith(start, duration, others);
      if (c) {
        setTimeAlerts(a => ({ ...a, [t.id]: { text: `${minsToClock(start)} is already taken — ${c.label} runs ${minsToClock(c.start)} to ${minsToClock(c.end)}.`, next: nextFreeStart(start, duration, others) } }));
        return;
      }
    }
    setTimeAlerts(a => { if (!a[t.id]) return a; const n = { ...a }; delete n[t.id]; return n; });
    setFocusTimes(p => ({ ...p, [t.id]: time }));
  };

  // The day as it will be laid out from everything chosen — generated below, and previewed
  // on the last step so what won't fit in the day's hours is known before it is generated.
  const composeSchedule = () => {
    // Timed tasks are laid in as their own fixed blocks below, so they must not also be
    // seated in a category block (possible when a saved plan pre-dates the task's time).
    const sb1Ids = finalSb1.filter(id => !timedIds.has(id));
    const sb2Ids = finalSb2.filter(id => !timedIds.has(id));
    const delegationIds = finalDelegation.filter(id => !timedIds.has(id));
    // Every block is as long as the tasks in it (whole 5-minute steps); an empty one keeps
    // its usual length. Small Batch and Delegation take no slot on the clock.
    const structuredWithTasks = withSmallBatch2(blocks, sb2Ids).map(b => {
      if (b.type === "smallbatch" && b.key === "sb1") return { ...b, taskIds: sb1Ids, duration: smallBatchDuration(sb1Ids.map(durationOf), b.duration) };
      if (b.type === "smallbatch" && b.key === "sb2") return { ...b, taskIds: sb2Ids, duration: smallBatchDuration(sb2Ids.map(durationOf), b.duration) };
      if (b.type === "delegation") return { ...b, taskIds: delegationIds, duration: smallBatchDuration(delegationIds.map(durationOf), b.duration) };
      if (b.type === "focus") {
        const chosenTask = seatedFocus[focusBlockKeys.indexOf(b.key)];
        return { ...b, taskIds: chosenTask ? [chosenTask.id] : [], duration: chosenTask?.duration || b.duration };
      }
      return { ...b, taskIds: [] };
    });
    // Everything with a clock time is anchored; the structured blocks flow around it.
    return layoutWithFixed(structuredWithTasks, startMins, fixedBlocksFor(), dayEnd).schedule;
  };

  const generate = () => {
    // Overdue tasks pulled into this day now live on this day (their old clock time is gone),
    // and a Focus task given a time here is pinned to this day at it (one that was given none
    // keeps what it had). One write for all of them — the plan saved below is where they
    // land, so there is nothing for a per-task plan sync to do.
    const patches = Object.fromEntries(overdueForDay.map(t => [t.id, { date: dateISO, time: "" }]));
    const placed = new Set([...timedIds, ...seatedFocus.map(t => t.id)]);
    dayFocus.forEach(t => {
      if (!(t.id in focusTimes) || !placed.has(t.id)) return;
      const time = focusTimes[t.id];
      if (t.scheduleMode !== "DEFINE" && !time) return; // an Auto pick with no time stays on Auto
      if (t.scheduleMode === "DEFINE" && t.date === dateISO && (t.time || "") === time) return;
      patches[t.id] = { ...patches[t.id], scheduleMode: "DEFINE", date: dateISO, time, overdueSince: null };
    });
    if (Object.keys(patches).length) updateTasksBulk(patches);
    const plan = {
      date: dateISO, dayType, half, startTime, dayMinutes, sb1: finalSb1, sb2: finalSb2, delegation: finalDelegation,
      focusPicks: pickedFocus.map(t => t.id), extraFocus, focusLimit, breaks,
      nonNegotiables: nonNegotiables.filter(id => usableIdSet.has(id)), schedule: composeSchedule(), concluded: false, createdAt: Date.now(),
      eveningMode, eveningStart, eveningEnd, eveningStops, specialTasks,
    };
    savePlan(dateISO, plan);
    // The plan is the record now; the draft for this date has served its purpose.
    latest.current = null;
    saveDraft?.(dateISO, null);
    jumpToDayView(dateISO);
  };

  // On the last step: the blocks that would not fit in the day's hours, and anything with a
  // time that something else already holds (added after its time was set, say).
  const preview = step === STEP_TITLES.length ? composeSchedule() : [];
  const wontFit = preview.filter(b => b.overflow);
  const moved = preview.filter(b => b.shifted);

  // What has been chosen so far, kept in view beside the steps on a laptop.
  const focusSummary = [...seatedFocus, ...dayFocus.filter(t => focusTimeOf(t))].map(t => (focusTimeOf(t) ? `${t.title} (${timeStrToClock(focusTimeOf(t))})` : t.title));
  const soFar = [
    ["Day", `${DAY_TYPES.find(d => d.id === dayType)?.label || dayType}${dayType === "half" ? ` · ${half} half` : ""}`],
    ["Hours", `${timeStrToClock(startTime)} – ${minsToClock(dayEnd)} · ${dayLength}`],
    ["Breaks", breaks.length ? breaks.map(b => `${b.label} ${timeStrToClock(b.time)}`).join(", ") : "none"],
    ["Windows", windowsForDay.length ? windowsForDay.map(w => w.title).join(", ") : "none"],
    ["Small Batch", `${finalSb1.length} task${finalSb1.length === 1 ? "" : "s"}${finalSb1.length ? ` · ${sb1Minutes}m` : ""}${finalSb2.length ? ` + ${finalSb2.length} in Small Batch 2` : ""}`],
    ["Delegation", finalDelegation.length ? `${finalDelegation.length} task${finalDelegation.length === 1 ? "" : "s"}` : "none"],
    ["Focus", focusSummary.length ? focusSummary.join(" · ") : "no picks yet"],
    ["Non-negotiables", nonNegotiables.length || "none"],
    ["Evening", eveningMode === "skip" ? "skipped" : `${eveningMode}${showEveningBuilder ? ` · ${eveningStops.length} stop${eveningStops.length === 1 ? "" : "s"}` : ""}`],
    ["Special tasks", specialTasks.length || "none"],
  ];

  // One Focus task in the Focus step. A task in the day (scheduled for it, or picked) shows
  // its time: set one to fix the task there, or leave it empty for the next Focus slot.
  const timedFocusCount = dayFocus.filter(t => focusTimeOf(t)).length;
  const focusRow = (t, { pinned = false, selected = false, reason = "" } = {}) => {
    const inDay = pinned || selected;
    const time = inDay ? focusTimeOf(t) : "";
    const start = time ? timeToMins(time) : null;
    const end = start != null ? start + (Number(t.duration) || 0) : null;
    const slot = seatedFocus.indexOf(t);
    const alert = timeAlerts[t.id];
    const overdue = overdueIds.has(t.id);
    const outside = start != null && (start < startMins || end > dayEnd);
    return (
      <div key={t.id} className="rounded-lg border" style={inDay ? { borderColor: ACCENT, background: "#EEF3F3" } : { borderColor: "rgba(0,0,0,0.08)", background: "white" }}>
        <label className={`flex items-center gap-3 p-3 ${pinned ? "" : "cursor-pointer"}`}>
          {pinned
            ? <Calendar size={14} className="shrink-0" style={{ color: ACCENT }} />
            : <input type="checkbox" checked={selected} onChange={() => toggleFocus(t.id)} className="accent-[#2F5D62]" />}
          <span className="flex-1 min-w-0">
            <span className="block text-sm" style={{ color: INK }}>{t.title}</span>
            {(pinned || reason) && (
              <span className="block text-[11px] mt-0.5" style={{ color: pinned ? (overdue ? ALERT : ACCENT) : "rgba(0,0,0,0.4)" }}>
                {pinned ? (overdue ? `Overdue since ${fmtDate(t.overdueSince || t.date)} — placed here for you` : "Scheduled for this day — placed here for you") : reason}
              </span>
            )}
          </span>
          <AlsoOn date={plannedElsewhere[t.id]} />
          <Chip tone="outline">{t.duration}m</Chip>
        </label>
        {inDay && (
          <div className="px-3 pb-3 -mt-1 pl-10 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <input type="time" value={time} onChange={(e) => setFocusTime(t, e.target.value)} aria-label={`Time for ${t.title}`}
                className="border border-black/10 rounded-lg px-2 py-1 text-xs outline-none tabular bg-white" />
              {time ? (
                <>
                  <span className="text-black/50 tabular">fixed at {timeStrToClock(time)} – {minsToClock(end)}</span>
                  <button onClick={() => setFocusTime(t, "")} className="font-semibold" style={{ color: ACCENT }}>No time</button>
                </>
              ) : (
                <span style={{ color: slot === -1 ? ALERT : "rgba(0,0,0,0.45)" }}>
                  {slot === -1 ? "No time, and no Focus slot left — set a time or raise your limit" : `No time — takes Focus Work ${slot + 1}`}
                </span>
              )}
            </div>
            {alert && (
              <p className="text-xs p-2 rounded-lg flex items-start gap-1.5" role="alert" style={{ color: ALERT, background: "#FBEFEF" }}>
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>
                  {alert.text}{" "}
                  {alert.next < 24 * 60 && <button onClick={() => setFocusTime(t, minsToTimeStr(alert.next))} className="font-semibold underline">Use {minsToClock(alert.next)}</button>}
                </span>
              </p>
            )}
            {outside && !alert && <p className="text-[11px]" style={{ color: ACCENT_WARM }}>Outside the day's hours ({timeStrToClock(startTime)} – {minsToClock(dayEnd)}) — it is still placed at this time.</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-2xl lg:max-w-none mx-auto space-y-6">
      {header}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-6 lg:items-start">
      <div className="space-y-6 min-w-0">
      {/* Where you are in the wizard, and a way back to any step already done. */}
      <ol className="flex flex-wrap gap-1.5" aria-label="Steps">
        {STEP_TITLES.map((title, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={title} className="shrink-0">
              <button onClick={() => { if (n < step) setStep(n); }} disabled={n > step} aria-current={state === "current" ? "step" : undefined}
                className="flex items-center gap-1.5 pl-1.5 pr-3 min-h-9 rounded-full text-xs font-medium border whitespace-nowrap disabled:cursor-default"
                style={state === "current" ? { background: INK, borderColor: INK, color: "white" } : state === "done" ? { background: "white", borderColor: "rgba(0,0,0,0.1)", color: INK } : { background: "transparent", borderColor: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.35)" }}>
                <span className="w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center"
                  style={state === "current" ? { background: "rgba(255,255,255,0.2)" } : state === "done" ? { background: ACCENT, color: "white" } : { background: "rgba(0,0,0,0.06)" }}>
                  {state === "done" ? <Check size={10} /> : n}
                </span>
                {title}
              </button>
            </li>
          );
        })}
      </ol>

      {pinnedToDay.length > 0 && (
        <Card className="p-4" style={{ background: "#FBF4E4", borderColor: ACCENT_WARM }}>
          <div className="flex items-start gap-2">
            <Calendar size={15} style={{ color: ACCENT_WARM }} className="mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_WARM }}>
                  {pinnedToDay.length} already scheduled for {fmtDate(dateISO)}
                  {overdueForDay.length > 0 && <span style={{ color: ALERT }}> · {overdueForDay.length} overdue</span>}
                </p>
                <button onClick={() => setPinnedOpen(o => !o)} aria-expanded={pinnedOpen}
                  className="text-xs font-semibold shrink-0 flex items-center gap-1 hover:opacity-70" style={{ color: ACCENT_WARM }}>
                  {pinnedOpen ? "Hide" : "Show"} <ChevronDown size={13} style={{ transform: pinnedOpen ? "rotate(180deg)" : "none" }} />
                </button>
              </div>
              {!pinnedOpen && <p className="text-[11px] text-black/45 mt-0.5">These are placed into the day for you — the steps only add to them.</p>}
              {pinnedOpen && <div className="text-xs text-black/55 mt-1 space-y-0.5">
                {timedTasks.map(t => (
                  <p key={t.id}><span className="font-semibold" style={{ color: INK }}>{timeStrToClock(t.time)}</span> · {t.title} <span className="text-black/35">· {isWindow(t) ? "no-schedule window" : "fixed slot"}, {t.duration}m</span></p>
                ))}
                {[...pinnedSmallBatch, ...pinnedDelegation, ...pinnedFocus].map(t => (
                  <p key={t.id} className="flex items-center gap-1.5 flex-wrap">
                    {overdueIds.has(t.id) && <AlertCircle size={11} style={{ color: ALERT }} />}
                    <span>{t.title} <span className="text-black/35">· joins the {categoryLabel(t.category)} {t.category === "focus" ? "block" : "list"}</span></span>
                    {overdueIds.has(t.id) && <span className="font-semibold" style={{ color: ALERT }}>overdue since {fmtDate(t.overdueSince || t.date)}</span>}
                  </p>
                ))}
              </div>}
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6">
          <p className="text-sm font-medium mb-4" style={{ color: INK }}>What does {dateISO === todayISO() ? "today" : fmtDate(dateISO)} look like?</p>
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
                <button key={h} onClick={() => chooseHalf(h)}
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
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">Starts</label>
                <input type="time" value={startTime} onChange={(e) => { if (e.target.value) setStartTime(e.target.value); }}
                  className="block mt-0.5 border border-black/10 rounded-lg px-3 py-2 text-lg outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">Ends</label>
                <input type="time" value={minsToTimeStr(dayEnd)} onChange={(e) => setDayEndTime(e.target.value)}
                  className="block mt-0.5 border border-black/10 rounded-lg px-3 py-2 text-lg outline-none" />
              </div>
              <span className="text-sm text-black/45 pb-2.5 tabular">{dayLength}</span>
            </div>
            <p className="text-xs text-black/40 mt-3">
              {fmtDate(dateISO)}'s schedule is calculated from the start and kept within {dayMinutes === DEFAULT_DAY_MINUTES ? "9 hours of it" : "these hours"} — anything that doesn't fit is listed apart, not pushed into the night. Only times you set yourself (a meeting, the evening window) can fall after the end.{dayType === "half" ? ` A ${half} half runs ${half === "first" ? "until early afternoon" : "from the afternoon"}.` : ""}
              {dayMinutes !== DEFAULT_DAY_MINUTES && <> <button onClick={() => setDayMinutes(DEFAULT_DAY_MINUTES)} className="font-semibold" style={{ color: ACCENT }}>Back to 9 hours</button></>}
            </p>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium" style={{ color: INK }}>Your breaks</p>
              {!sameBreaks(breaks, settings.breaks) && (
                <button onClick={() => updateSettings({ breaks })} className="text-xs font-semibold" style={{ color: ACCENT }}>Make these my usual breaks</button>
              )}
            </div>
            <p className="text-xs text-black/40 mt-0.5 mb-4">
              When you take them and for how long — nothing is placed for you.{" "}
              {settings.breaks.length ? "This day starts from your usual breaks; change it here for today only, or make the change usual." : "Add a break with a time and a length; the rest of the day flows around it."}
            </p>
            <BreaksControl breaks={breaks} onChange={(b) => { setBreaksTouched(true); setBreaks(b); }} window={{ start: timeToMins(startTime), end: dayEndMins }} />
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium" style={{ color: INK }}>No-Schedule Windows {dateISO === todayISO() ? "today" : `on ${fmtDate(dateISO)}`}</p>
              <button onClick={() => setWindowModal("new")} className="text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
                <Plus size={13} /> Add
              </button>
            </div>
            {windowsForDay.length === 0 ? (
              <p className="text-xs text-black/40">None yet — e.g. a lunch out or a doctor's appointment. A window is a task of its own work type on the board; the day's plan is built around it.</p>
            ) : (
              <div className="space-y-1.5">
                {windowsForDay.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/10">
                    <Clock size={13} className="text-black/35" />
                    <span className="text-sm flex-1 min-w-0 truncate" style={{ color: INK }}>{t.title} <span className="text-black/35">· {t.workType}</span></span>
                    <Chip tone="outline">{timeStrToClock(t.time)}–{minsToClock(timeToMins(t.time) + (Number(t.duration) || 0))}</Chip>
                    <button onClick={() => setWindowModal(t)} title="Edit"><Pencil size={13} className="text-black/35 hover:text-black/60" /></button>
                    <button onClick={() => { if (window.confirm(`Remove “${t.title}”?`)) deleteTask?.(t.id); }} title="Remove"><X size={14} className="text-black/30 hover:text-black/60" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium" style={{ color: INK }}>Select {dateISO === todayISO() ? "today's" : `${fmtDate(dateISO)}'s`} Small Batch tasks</p>
            <span className="text-xs font-semibold" style={{ color: finalSb1.length >= 10 ? ALERT : "rgba(0,0,0,0.4)" }}>{finalSb1.length} / 10 selected</span>
          </div>
          <p className="text-xs text-black/40 mb-4">
            {finalSb1.length === 0 ? "Small Batch takes no slot on the clock — it's a list to work through in the day's free moments. A task with its own time gets a slot at that time."
              : `About ${sb1Minutes}m of work, done in the day's free moments — no fixed slot. A task with its own time gets a slot at that time.`}
          </p>
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
          <div className="mt-5 pt-4 border-t border-black/[0.06]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium" style={{ color: INK }}>Small Batch 2</p>
                <p className="text-xs text-black/40 mt-0.5">A second Small Batch list for the day — it appears only if you put tasks in it.</p>
              </div>
              {sb2Open
                ? <span className="text-xs font-semibold" style={{ color: finalSb2.length >= 10 ? ALERT : "rgba(0,0,0,0.4)" }}>{finalSb2.length} / 10 selected{sb2Minutes ? ` · ${sb2Minutes}m` : ""}</span>
                : <GhostButton onClick={() => setSb2Open(true)}><Plus size={14} /> Add Small Batch 2</GhostButton>}
            </div>
            {sb2Open && (
              <div className="space-y-1.5 max-h-72 overflow-y-auto mt-3">
                {smallBatchEligible.filter(t => !finalSb1.includes(t.id)).length === 0 && <p className="text-sm text-black/40">Every small batch task on the board is already in Small Batch 1.</p>}
                {smallBatchEligible.filter(t => !finalSb1.includes(t.id)).map(t => (
                  <label key={t.id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer"
                    style={{ borderColor: sb2.includes(t.id) ? SAGE : "rgba(0,0,0,0.08)", background: sb2.includes(t.id) ? "#F2F5F0" : "white" }}>
                    <input type="checkbox" checked={sb2.includes(t.id)} onChange={() => toggleSb2(t.id)} className="accent-[#7A8B6F]" />
                    <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                    <AlsoOn date={plannedElsewhere[t.id]} />
                    <Chip tone="outline">{t.unit}</Chip>
                  </label>
                ))}
                {finalSb2.length === 0 && <button onClick={() => setSb2Open(false)} className="text-xs text-black/40 hover:text-black/60 pt-1">No Small Batch 2 today</button>}
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium" style={{ color: INK }}>Delegation & Instructions</p>
            <span className="text-xs font-semibold" style={{ color: finalDelegation.length >= 5 ? ALERT : "rgba(0,0,0,0.4)" }}>{finalDelegation.length} / 5 selected</span>
          </div>
          <p className="text-xs text-black/40 mb-4">Recommended from your Delegation & Instructions tasks. Like Small Batch, it's a list for any time in the day — no fixed slot unless a task has its own time.</p>
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
          <Card className="p-6">
            <div className="flex items-center justify-between mb-1 gap-3">
              <p className="text-sm font-medium" style={{ color: INK }}>Select {dateISO === todayISO() ? "today's" : `${fmtDate(dateISO)}'s`} Focus Work</p>
              <span className="text-xs font-semibold whitespace-nowrap" style={{ color: unseatedFocus.length ? ALERT : "rgba(0,0,0,0.4)" }}>
                {seatedFocus.length} / {focusLimit} slots{timedFocusCount ? ` · ${timedFocusCount} at a set time` : ""}
              </span>
            </div>
            <p className="text-xs text-black/40">Without a time, each task takes the next Focus slot in the day. Give one a time to fix it there — you'll be told if something already holds that time.</p>
            {prefFocus.length > 0 && <p className="text-xs mt-1.5" style={{ color: ACCENT }}>{weekdayLabel}'s usual Focus: {prefFocus.join(" · ")}{pref.note ? ` · ${pref.note}` : ""}</p>}
            {dayFocus.length > 0 && (
              <div className="space-y-1.5 mt-4">
                {pinnedFocusAll.map(t => focusRow(t, { pinned: true }))}
                {pickedFocus.map(t => focusRow(t, { selected: true }))}
              </div>
            )}
            <div className="space-y-1.5 mt-3 max-h-96 overflow-y-auto">
              {focusRecommendations.map(({ task, reason }) => focusRow(task, { reason }))}
              {dayFocus.length === 0 && focusRecommendations.length === 0 && <p className="text-sm text-black/40">No focus tasks on the board yet.</p>}
            </div>
            <button onClick={() => setNewFocusModal(true)} className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
              <Plus size={13} /> Add New Focus Task
            </button>
          </Card>
          {unseatedFocus.length > 0 && (
            <Card className="p-4 space-y-2" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: ALERT }}>
                <AlertCircle size={13} /> {unseatedFocus.length} Focus task{unseatedFocus.length > 1 ? "s" : ""} without a time {unseatedFocus.length > 1 ? "don't" : "doesn't"} fit within your limit of {focusLimit} Focus Work slot{focusLimit === 1 ? "" : "s"}.
              </p>
              {unseatedFocus.map(t => (
                <p key={t.id} className="text-sm pl-5" style={{ color: INK }}>{t.title} <span className="text-xs text-black/40">· {t.duration}m</span></p>
              ))}
              <p className="text-xs text-black/50 pl-5">Give one a time above, raise your limit below, or take one out — otherwise it stays off this day (one scheduled for this day waits on the board).</p>
            </Card>
          )}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold" style={{ color: INK }}>Your Focus Work limit</p>
                <p className="text-[11px] text-black/40">The most Focus Work slots in any day you plan. Tasks at a set time don't use a slot. Yours alone — every account sets its own.</p>
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
            {Array.from(new Set([...timedTasks.filter(t => !isWindow(t)).map(t => t.id), ...finalSb1, ...finalDelegation, ...seatedFocus.map(t => t.id)])).map(id => {
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
              Skipped unless you want it. Retain adds the 5:45 – 7:15 PM window (visibility, employee & guest interaction, property rounds) with Buffer and Closure after it; Modify sets your own times.
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
                {!eveningOk && <p className="col-span-2 text-xs flex items-center gap-1.5" style={{ color: ALERT }}><AlertCircle size={13} /> The window has to end after it starts.</p>}
                {eveningOk && <p className="col-span-2 text-xs text-black/40">Buffer & Pending Callbacks (25m) and Closure (20m) follow the window wherever it ends.</p>}
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

              <div className="flex flex-wrap gap-2 pb-2">
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
              <MinutesInput value={specialForm.duration} onChange={(duration) => setSpecialForm({ ...specialForm, duration })}
                placeholder="Minutes" className="w-20 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <GhostButton onClick={addSpecialTask}><Plus size={14} /> Add</GhostButton>
            </div>
          </Card>

          <Card className="p-8 text-center space-y-4">
            <Sparkles size={28} style={{ color: ACCENT }} className="mx-auto" />
            <p className="text-sm text-black/60">Ready to generate {fmtDate(dateISO)}'s schedule — {finalSb1.length + finalSb2.length} small batch{finalSb2.length ? ` (${finalSb2.length} in Small Batch 2)` : ""}, {finalDelegation.length} delegation, {seatedFocus.length + dayFocus.filter(t => focusTimeOf(t)).length} focus{breaks.length ? `, ${breaks.length} break${breaks.length > 1 ? "s" : ""}` : ""}{timedTasks.length ? `, ${timedTasks.length} fixed-time task${timedTasks.length > 1 ? "s" : ""}` : ""}{specialTasks.length ? `, ${specialTasks.length} special task${specialTasks.length > 1 ? "s" : ""}` : ""}{nonNegotiables.length ? `, ${nonNegotiables.length} non-negotiable${nonNegotiables.length > 1 ? "s" : ""}` : ""}{showEveningBuilder ? `, ${eveningStops.length} evening stop${eveningStops.length === 1 ? "" : "s"}` : ""}.</p>
            {(moved.length > 0 || unseatedFocus.length > 0) && (
              <div className="text-left p-3 rounded-lg border space-y-1" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
                {moved.map(b => (
                  <p key={b.key} className="text-xs flex items-start gap-1.5" style={{ color: INK }}>
                    <AlertCircle size={13} className="mt-0.5 shrink-0" style={{ color: ALERT }} />
                    <span>{b.label} asks for {minsToClock(b.requestedStart)}, which something else already holds — it will go at {minsToClock(b.start)}.</span>
                  </p>
                ))}
                {unseatedFocus.map(t => (
                  <p key={t.id} className="text-xs flex items-start gap-1.5" style={{ color: INK }}>
                    <AlertCircle size={13} className="mt-0.5 shrink-0" style={{ color: ALERT }} />
                    <span>{t.title} has no time and no Focus slot left — it stays off this day.</span>
                  </p>
                ))}
                {(unseatedFocus.length > 0 || moved.some(b => b.type === "focus")) && <p className="text-xs text-black/50 pl-5"><button onClick={() => setStep(5)} className="font-semibold" style={{ color: ACCENT }}>Change it in Focus Work</button></p>}
              </div>
            )}
            {wontFit.length > 0 && (
              <div className="text-left p-3 rounded-lg border space-y-1" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: ALERT }}>
                  <AlertCircle size={13} /> {wontFit.length === 1 ? "This doesn't" : `These ${wontFit.length} don't`} fit before {minsToClock(dayEnd)}:
                </p>
                {wontFit.map(b => (
                  <p key={b.key} className="text-xs pl-5" style={{ color: INK }}>
                    {b.label}{(b.taskIds || []).length ? ` — ${b.taskIds.map(id => tasks.find(t => t.id === id)?.title).filter(Boolean).join(", ")}` : " (empty)"} <span className="text-black/40">· {b.duration}m</span>
                  </p>
                ))}
                <p className="text-xs text-black/50 pl-5">
                  The day view lists {wontFit.length === 1 ? "it" : "them"} apart until there is room.{" "}
                  <button onClick={() => setStep(2)} className="font-semibold" style={{ color: ACCENT }}>End the day later</button>, give a Focus task a time or take one out in step 5.
                </p>
              </div>
            )}
            {!eveningOk && <p className="text-xs" style={{ color: ALERT }}>Fix the evening window's times (step 7) first.</p>}
            <PrimaryButton onClick={generate} disabled={!eveningOk} className="mx-auto"><Sparkles size={16} /> Generate {dateISO === todayISO() ? "Today's" : `${fmtDate(dateISO)}'s`} Schedule</PrimaryButton>
          </Card>
        </div>
      )}

      {windowModal && (
        <TaskModal open={!!windowModal} onClose={() => setWindowModal(null)} tasks={tasks} dayPlans={dayPlans}
          initial={windowModal === "new" ? newWindowInitial : windowModal}
          onSave={(f) => (windowModal === "new" ? addTask(f) : updateTask(windowModal.id, f))}
          onDelete={windowModal !== "new" ? deleteTask : undefined} />
      )}

      {/* Back / Next stay put at the bottom of the screen, so ticking an item never moves them. */}
      <div className="sticky bottom-[76px] lg:bottom-4 z-30 -mx-4 px-4 py-2 flex justify-between" style={{ background: PAPER }}>
        <GhostButton onClick={() => setStep(Math.max(1, step - 1))} className={step === 1 ? "invisible" : ""}><ChevronLeft size={15} /> Back</GhostButton>
        {step < STEP_TITLES.length && <PrimaryButton onClick={() => setStep(step + 1)} disabled={step === 7 && !eveningOk}>Next <ChevronRight size={15} /></PrimaryButton>}
      </div>
      </div>

      <aside className="hidden lg:block lg:sticky lg:top-6 space-y-3">
        <Card className="p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">Plan so far · {fmtDate(dateISO)}</p>
          {soFar.map(([k, v]) => (
            <div key={k} className="flex gap-3 text-xs leading-relaxed">
              <span className="w-24 shrink-0 text-black/40">{k}</span>
              <span className="min-w-0 flex-1 break-words" style={{ color: INK }}>{v}</span>
            </div>
          ))}
        </Card>
        {pinnedToDay.length > 0 && (
          <Card className="p-4" style={{ background: "#FBF4E4", borderColor: ACCENT_WARM }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: ACCENT_WARM }}>{pinnedToDay.length} already on this day</p>
            <p className="text-xs text-black/50 mt-1">Pinned tasks{overdueForDay.length ? ` and ${overdueForDay.length} overdue` : ""} are placed for you — the steps only add to them.</p>
          </Card>
        )}
        {step < STEP_TITLES.length && <GhostButton onClick={() => setStep(STEP_TITLES.length)} className="w-full" title="Skip the remaining steps and review before generating"><Sparkles size={14} /> Go to the last step</GhostButton>}
      </aside>
      </div>

      {newFocusModal && (
        <TaskModal open={newFocusModal} onClose={() => setNewFocusModal(false)}
          initial={newFocusInitial} tasks={tasks} dayPlans={dayPlans}
          onSave={(f) => {
            const t = addTask(f);
            setFocusPicks(prev => [...prev, t.id]);
          }} />
      )}
      {newDelegationModal && (
        <TaskModal open={newDelegationModal} onClose={() => setNewDelegationModal(false)}
          initial={newDelegationTaskInitial} tasks={tasks} dayPlans={dayPlans}
          onSave={(f) => {
            const t = addTask(f);
            setDelegation(prev => [...prev, t.id]);
          }} />
      )}
    </div>
  );
}
