import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, TrendingUp, Calendar, Sun, Moon, Layers, Grid3x3 } from "lucide-react";
import { ACCENT, PAPER } from "./constants.js";
import { uid, todayISO } from "./utils.js";
import { loadAll, saveTasks, saveDayPlans, loadPersonalBlocks, savePersonalBlocks, loadSubmissions, saveSubmissions } from "./storage.js";
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

  useEffect(() => {
    loadAll().then(({ tasks, dayPlans }) => { setTasks(tasks); setDayPlans(dayPlans); });
    loadPersonalBlocks().then((blocks) => { setPersonalBlocks(blocks); setLoaded(true); });
    loadSubmissions().then(setSubmissions);
  }, []);

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

  const addTask = (form) => {
    const t = { id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form };
    persistTasks(prev => [t, ...prev]);
    return t;
  };
  const addTasksBulk = (forms) => {
    const newOnes = forms.map(form => ({ id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form }));
    persistTasks(prev => [...newOnes, ...prev]);
    return newOnes;
  };
  const approveSubmission = (sub, priority, importance) => {
    addTask({
      title: sub.title, unit: sub.unit, category: sub.category, workType: sub.workType,
      duration: sub.duration, priority, importance, scheduleMode: "AUTO",
    });
    persistSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, status: "approved" } : s));
  };
  const updateTask = (id, patch) => persistTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  const updateTasksBulk = (patchesById) => persistTasks(prev => prev.map(t => patchesById[t.id] ? { ...t, ...patchesById[t.id] } : t));
  const completeTask = (id) => updateTask(id, { status: "done", completedAt: Date.now() });
  // Functional update so multiple savePlan calls in the same tick (e.g. concluding a day
  // while also placing follow-ups on other dates) chain correctly instead of clobbering each other.
  const savePlan = (date, plan) => persistPlans(prev => ({ ...prev, [date]: plan }));
  const savePlansBulk = (patchesByDate) => persistPlans(prev => ({ ...prev, ...patchesByDate }));

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-sm text-black/40" style={{background: PAPER}}>Loading…</div>;

  return (
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
        {tab === "plan" && <PlanMyDay tasks={tasks} addTask={addTask} updateTask={updateTask} dayPlans={dayPlans} savePlan={savePlan} jumpToDayView={(d) => { setDateISO(d); setTab("day"); }} personalBlocks={personalBlocks} addPersonalBlock={addPersonalBlock} />}
        {tab === "day" && <DayView dateISO={dateISO} setDateISO={setDateISO} dayPlans={dayPlans} tasks={tasks} savePlan={savePlan} goPlan={() => setTab("plan")} goConclude={() => setTab("conclude")} addTask={addTask} />}
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
              <button key={t.id} onClick={() => setTab(t.id)} className="flex flex-col items-center gap-1 px-1.5 py-1 flex-1">
                <Icon size={18} color={sel ? ACCENT : "rgba(0,0,0,0.35)"} />
                <span className="text-[10px] font-medium" style={{ color: sel ? ACCENT : "rgba(0,0,0,0.35)" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
