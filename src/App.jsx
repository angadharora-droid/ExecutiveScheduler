import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Sparkles, TrendingUp, Calendar, Sun, Moon, Layers, Grid3x3 } from "lucide-react";
import { ACCENT, PAPER, UNITS, DEFAULT_WORK_TYPES } from "./constants.js";
import { uid, todayISO } from "./utils.js";
import { loadAll, saveTasks, saveDayPlans, loadPersonalBlocks, savePersonalBlocks, loadSubmissions, saveSubmissions, loadUnits, saveUnits, loadWorkTypes, saveWorkTypes } from "./storage.js";
import { UnitsContext } from "./UnitsContext.jsx";
import { WorkTypesContext } from "./WorkTypesContext.jsx";
import { insertTaskIntoPlan, removeTaskFromPlan } from "./scheduleEngine.js";
import Board from "./components/Board.jsx";
import EisenhowerMatrix from "./components/EisenhowerMatrix.jsx";
import PlanMyDay from "./components/PlanMyDay.jsx";
import DayView from "./components/DayView.jsx";
import ConcludeDay from "./components/ConcludeDay.jsx";
import WeekView from "./components/WeekView.jsx";
import MonthView from "./components/MonthView.jsx";
import Intelligence from "./components/Intelligence.jsx";

const TABS = [
  { id: "board", label: "Board", icon: Layers },
  { id: "matrix", label: "View Board", icon: Grid3x3 },
  { id: "plan", label: "Plan Day", icon: Sparkles },
  { id: "day", label: "Day", icon: Sun },
  { id: "conclude", label: "Conclude", icon: Moon },
  { id: "week", label: "Week", icon: Calendar },
  { id: "month", label: "Month", icon: Calendar },
  { id: "intel", label: "Insight", icon: TrendingUp },
];

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [dayPlans, setDayPlans] = useState({});
  const [personalBlocks, setPersonalBlocks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [tab, setTab] = useState("board");
  const [dateISO, setDateISO] = useState(todayISO());
  // Date the Plan My Day wizard opens on. null = its default (tomorrow); set when the user
  // arrives from a specific day via Replan / Plan My Day in the Day tab.
  const [planDate, setPlanDate] = useState(null);
  const [units, setUnits] = useState(UNITS);
  const [workTypes, setWorkTypes] = useState(DEFAULT_WORK_TYPES);

  useEffect(() => {
    loadAll().then(({ tasks, dayPlans }) => { setTasks(tasks); setDayPlans(dayPlans); });
    loadPersonalBlocks().then((blocks) => { setPersonalBlocks(blocks); setLoaded(true); });
    loadSubmissions().then(setSubmissions);
    loadUnits().then((u) => { if (u) setUnits(u); });
    loadWorkTypes().then((w) => { if (w) setWorkTypes(w); });
  }, []);

  const addUnit = useCallback((name) => {
    const clean = name.trim();
    if (!clean) return;
    setUnits(prev => {
      if (prev.some(u => u.toLowerCase() === clean.toLowerCase())) return prev;
      const next = [...prev, clean];
      saveUnits(next);
      return next;
    });
  }, []);
  const removeUnit = useCallback((name) => {
    setUnits(prev => {
      if (prev.length <= 1) return prev; // always keep at least one unit
      const next = prev.filter(u => u !== name);
      saveUnits(next);
      return next;
    });
  }, []);
  const unitsValue = useMemo(() => ({ units, addUnit, removeUnit }), [units, addUnit, removeUnit]);

  // Per-user Work Type names + Activity lists. The three ids are fixed (they drive the
  // schedule blocks); names and activities are this account's own.
  const persistWorkTypes = useCallback((updater) => {
    setWorkTypes(prev => {
      const next = updater(prev);
      if (next !== prev) saveWorkTypes(next);
      return next;
    });
  }, []);
  const renameCategory = useCallback((cat, label) => {
    const clean = label.trim();
    if (!clean) return;
    persistWorkTypes(prev => prev[cat] && prev[cat].label !== clean ? { ...prev, [cat]: { ...prev[cat], label: clean } } : prev);
  }, [persistWorkTypes]);
  const addActivity = useCallback((cat, name) => {
    const clean = name.trim();
    if (!clean) return;
    persistWorkTypes(prev => {
      const wt = prev[cat];
      if (!wt || wt.activities.some(a => a.toLowerCase() === clean.toLowerCase())) return prev;
      return { ...prev, [cat]: { ...wt, activities: [...wt.activities, clean] } };
    });
  }, [persistWorkTypes]);
  const removeActivity = useCallback((cat, name) => {
    persistWorkTypes(prev => {
      const wt = prev[cat];
      if (!wt || wt.activities.length <= 1 || !wt.activities.includes(name)) return prev; // always keep one
      return { ...prev, [cat]: { ...wt, activities: wt.activities.filter(a => a !== name) } };
    });
  }, [persistWorkTypes]);
  const resetWorkTypes = useCallback(() => persistWorkTypes(() => DEFAULT_WORK_TYPES), [persistWorkTypes]);
  const workTypesValue = useMemo(() => ({
    workTypes,
    categoryLabel: (cat) => workTypes[cat]?.label || DEFAULT_WORK_TYPES[cat]?.label || cat,
    activityOptions: (cat) => workTypes[cat]?.activities || DEFAULT_WORK_TYPES[cat]?.activities || [],
    renameCategory, addActivity, removeActivity, resetWorkTypes,
  }), [workTypes, renameCategory, addActivity, removeActivity, resetWorkTypes]);

  const persistTasks = useCallback((updater) => {
    setTasks(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveTasks(next);
      return next;
    });
  }, []);
  const persistPlans = useCallback((updater) => {
    setDayPlans(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveDayPlans(next);
      return next;
    });
  }, []);
  const addPersonalBlock = useCallback((block) => {
    setPersonalBlocks(prev => { const next = [...prev, block]; savePersonalBlocks(next); return next; });
  }, []);
  const persistSubmissions = useCallback((updater) => {
    setSubmissions(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveSubmissions(next);
      return next;
    });
  }, []);
  const addSubmission = useCallback((sub) => {
    setSubmissions(prev => { const next = [...prev, sub]; saveSubmissions(next); return next; });
  }, []);
  const dismissSubmission = useCallback((id) => {
    persistSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: "dismissed" } : s));
  }, [persistSubmissions]);

  // Keep generated day plans in step with Define-Time tasks. A task pinned to a date whose
  // plan already exists is placed into that plan (at its clock time when it has one, else
  // in its category block); when it moves to another date, loses its date, or goes back to
  // Auto it leaves the old plan. Concluded days are left untouched.
  const isPinned = (t) => !!t && t.scheduleMode === "DEFINE" && !!t.date && t.status !== "done";
  const PLAN_SYNC_FIELDS = ["scheduleMode", "date", "time", "duration", "category", "title", "unit"];
  const syncTaskWithPlans = useCallback((before, after) => {
    persistPlans(prev => {
      let next = prev;
      if (isPinned(before) && prev[before.date] && !prev[before.date].concluded) {
        const { schedule, removed } = removeTaskFromPlan(prev[before.date], before.id, before.duration);
        if (removed) next = { ...next, [before.date]: { ...prev[before.date], schedule } };
      }
      if (isPinned(after) && next[after.date] && !next[after.date].concluded) {
        const { schedule, inserted } = insertTaskIntoPlan(next[after.date], after);
        if (inserted) next = { ...next, [after.date]: { ...next[after.date], schedule } };
      }
      return next;
    });
  }, [persistPlans]);

  const addTask = (form) => {
    const t = { id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form };
    persistTasks(prev => [t, ...prev]);
    if (isPinned(t)) syncTaskWithPlans(null, t);
    return t;
  };
  const addTasksBulk = (forms) => {
    const newOnes = forms.map(form => ({ id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form }));
    persistTasks(prev => [...newOnes, ...prev]);
    newOnes.filter(isPinned).forEach(t => syncTaskWithPlans(null, t));
    return newOnes;
  };
  const approveSubmission = (sub, priority, importance) => {
    addTask({
      title: sub.title, unit: sub.unit, category: sub.category, workType: sub.workType,
      duration: sub.duration, priority, importance, scheduleMode: "AUTO",
    });
    persistSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, status: "approved" } : s));
  };
  const updateTask = (id, patch) => {
    const before = tasks.find(t => t.id === id);
    persistTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    if (!before) return;
    const after = { ...before, ...patch };
    if ((isPinned(before) || isPinned(after)) && PLAN_SYNC_FIELDS.some(k => before[k] !== after[k])) syncTaskWithPlans(before, after);
  };
  const updateTasksBulk = (patchesById) => persistTasks(prev => prev.map(t => patchesById[t.id] ? { ...t, ...patchesById[t.id] } : t));
  const completeTask = (id) => updateTask(id, { status: "done", completedAt: Date.now() });
  // Functional update so multiple savePlan calls in the same tick (e.g. concluding a day
  // while also placing follow-ups on other dates) chain correctly instead of clobbering each other.
  const savePlan = (date, plan) => persistPlans(prev => ({ ...prev, [date]: plan }));
  const savePlansBulk = (patchesByDate) => persistPlans(prev => ({ ...prev, ...patchesByDate }));

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-sm text-black/40" style={{background: PAPER}}>Loading…</div>;

  return (
    <UnitsContext.Provider value={unitsValue}>
    <WorkTypesContext.Provider value={workTypesValue}>
    <div className="min-h-screen pb-24" style={{ background: PAPER, fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        .font-serif { font-family: Georgia, 'Iowan Old Style', ui-serif, serif; }
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body, .min-h-screen { background: white !important; }
        }
      `}</style>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        {tab === "board" && <Board tasks={tasks} addTask={addTask} addTasksBulk={addTasksBulk} updateTask={updateTask} completeTask={completeTask} personalBlocks={personalBlocks} addPersonalBlock={addPersonalBlock} submissions={submissions} addSubmission={addSubmission} approveSubmission={approveSubmission} dismissSubmission={dismissSubmission} />}
        {tab === "matrix" && <EisenhowerMatrix tasks={tasks} />}
        {tab === "plan" && <PlanMyDay tasks={tasks} addTask={addTask} updateTask={updateTask} dayPlans={dayPlans} savePlan={savePlan} jumpToDayView={(d) => { setDateISO(d); setTab("day"); }} personalBlocks={personalBlocks} addPersonalBlock={addPersonalBlock} initialDate={planDate} />}
        {tab === "day" && <DayView dateISO={dateISO} setDateISO={setDateISO} dayPlans={dayPlans} tasks={tasks} savePlan={savePlan} goPlan={() => { setPlanDate(dateISO); setTab("plan"); }} goConclude={() => setTab("conclude")} addTask={addTask} />}
        {tab === "conclude" && <ConcludeDay dateISO={dateISO} dayPlans={dayPlans} tasks={tasks} updateTask={updateTask} updateTasksBulk={updateTasksBulk} savePlan={savePlan} savePlansBulk={savePlansBulk} onDone={() => setTab("intel")} />}
        {tab === "week" && <WeekView dayPlans={dayPlans} tasks={tasks} setDateISO={setDateISO} setTab={setTab} />}
        {tab === "month" && <MonthView dayPlans={dayPlans} tasks={tasks} setDateISO={setDateISO} setTab={setTab} />}
        {tab === "intel" && <Intelligence tasks={tasks} dayPlans={dayPlans} />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-black/[0.06] px-2 py-2 no-print">
        <div className="max-w-4xl mx-auto flex justify-between">
          {TABS.map(t => {
            const Icon = t.icon;
            const sel = tab === t.id;
            return (
              <button key={t.id} onClick={() => { if (t.id === "plan") setPlanDate(null); setTab(t.id); }} className="flex flex-col items-center gap-1 px-1.5 py-1 flex-1">
                <Icon size={18} color={sel ? ACCENT : "rgba(0,0,0,0.35)"} />
                <span className="text-[10px] font-medium" style={{ color: sel ? ACCENT : "rgba(0,0,0,0.35)" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
    </WorkTypesContext.Provider>
    </UnitsContext.Provider>
  );
}
