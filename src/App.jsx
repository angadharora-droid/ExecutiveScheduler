import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Sparkles, TrendingUp, Calendar, Sun, Moon, Layers, Grid3x3 } from "lucide-react";
import { ACCENT, PAPER, UNITS, DEFAULT_WORK_TYPES, DEFAULT_SETTINGS, clampFocusLimit, normalizeSettings, normalizeWorkTypes } from "./constants.js";
import { uid, todayISO, addDays } from "./utils.js";
import { loadAll, saveTasks, saveDayPlans, loadPersonalBlocks, savePersonalBlocks, loadSubmissions, createSubmission, updateSubmission, loadDirectory, loadUnits, saveUnits, loadWorkTypes, saveWorkTypes, loadSettings, saveSettings, onRemote, hasUnsavedChanges } from "./storage.js";
import { reconcile, mergeById, mergeByKey } from "./sync.js";
import { getAuth } from "./auth.js";
import { UnitsContext } from "./UnitsContext.jsx";
import { WorkTypesContext } from "./WorkTypesContext.jsx";
import { SettingsContext } from "./SettingsContext.jsx";
import { insertTaskIntoPlan, removeTaskFromPlan, removeTasksFromOpenPlans } from "./scheduleEngine.js";
import { nextOccurrenceTask } from "./repeat.js";
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
  // Everyone else with an account — who a task can be sent to or an invite go to.
  const [directory, setDirectory] = useState([]);
  const me = useMemo(() => getAuth()?.user || { username: "", name: "" }, []);
  const [tab, setTab] = useState("board");
  const [dateISO, setDateISO] = useState(todayISO());
  // Date the Plan My Day wizard opens on. null = its default (tomorrow); set when the user
  // arrives from a specific day via Replan / Plan My Day in the Day tab.
  const [planDate, setPlanDate] = useState(null);
  const [units, setUnits] = useState(UNITS);
  const [workTypes, setWorkTypes] = useState(DEFAULT_WORK_TYPES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const refreshSubmissions = useCallback(() => loadSubmissions().then(setSubmissions), []);

  useEffect(() => {
    // The board shows only once tasks, plans and personal windows are all in: anything the
    // server sends later is merged against what was loaded, so the screen must start from it.
    Promise.all([loadAll(), loadPersonalBlocks()]).then(([{ tasks, dayPlans }, blocks]) => {
      setTasks(tasks); setDayPlans(dayPlans); setPersonalBlocks(blocks); setLoaded(true);
    });
    refreshSubmissions();
    loadDirectory().then((list) => setDirectory(list.filter(u => u.username !== me.username)));
    loadUnits().then((u) => { if (u) setUnits(u); });
    loadWorkTypes().then((w) => { if (w) setWorkTypes(w); });
    loadSettings().then((s) => { if (s) setSettings(s); });
  }, [refreshSubmissions]);

  // Other users send tasks and invites into this inbox (and decide on what was sent from
  // here) at any moment, so keep it current while the app sits open: re-fetch once a minute while the tab is visible, and when it regains focus.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") refreshSubmissions(); };
    const timer = setInterval(tick, 60000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); };
  }, [refreshSubmissions]);

  // A save the server refused because its copy had moved on (this account open on another
  // device, or an older save of the same burst) comes back here merged: the state takes that
  // copy, with anything changed here in the meantime laid over it, and that goes back to the
  // server. The board itself is not polled — what another device did shows on the next open.
  useEffect(() => {
    const adopt = (setState, merge, save, fallback) => (theirs, from) => setState(prev => {
      const { next, save: needed } = reconcile(prev, from, theirs ?? fallback, merge);
      if (needed) save(next);
      return next;
    });
    const offs = [
      onRemote("tasks", adopt(setTasks, mergeById, saveTasks, [])),
      onRemote("dayplans", adopt(setDayPlans, mergeByKey, saveDayPlans, {})),
      onRemote("personalblocks", adopt(setPersonalBlocks, mergeById, savePersonalBlocks, [])),
      onRemote("units", (u) => { if (Array.isArray(u) && u.length) setUnits(u); }),
      onRemote("worktypes", (w) => { if (w && typeof w === "object") setWorkTypes(normalizeWorkTypes(w)); }),
      onRemote("settings", (s) => { if (s && typeof s === "object") setSettings(normalizeSettings(s)); }),
    ];
    return () => offs.forEach(off => off());
  }, []);

  // Closing the tab while a save is still on its way would lose it — the browser asks first.
  useEffect(() => {
    const guard = (e) => { if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
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

  // Per-user scheduling preferences — the Focus Work slot limit and the usual breaks. Each
  // account sets its own; they are stored under that account's username like units and
  // work types.
  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = normalizeSettings({ ...prev, ...patch });
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      saveSettings(next);
      return next;
    });
  }, []);
  const setFocusLimit = useCallback((n) => updateSettings({ focusLimit: clampFocusLimit(n) }), [updateSettings]);
  const resetSettings = useCallback(() => updateSettings(DEFAULT_SETTINGS), [updateSettings]);
  const settingsValue = useMemo(() => ({
    settings, focusLimit: settings.focusLimit, setFocusLimit, updateSettings, resetSettings,
  }), [settings, setFocusLimit, updateSettings, resetSettings]);

  // Only a real change is saved: an updater that hands back the same object (a plan sync
  // that found nothing to do, a purge that touched no plan) must not send a copy to the
  // server, where it would only compete with the saves that matter.
  const persistTasks = useCallback((updater) => {
    setTasks(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next !== prev) saveTasks(next);
      return next;
    });
  }, []);
  const persistPlans = useCallback((updater) => {
    setDayPlans(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next !== prev) saveDayPlans(next);
      return next;
    });
  }, []);
  const addPersonalBlock = useCallback((block) => {
    setPersonalBlocks(prev => { const next = [...prev, block]; savePersonalBlocks(next); return next; });
  }, []);
  // Submissions are rows on the server: tasks (and Executive Interaction invites) users send
  // one another. Each change goes to the server first — the other side may have acted in the
  // meantime (withdrawn it, already decided it) — and only then shows here; when the server
  // says no, the list is reloaded so the screen matches it and the error is passed on.
  const addSubmission = useCallback(async (form) => {
    const created = await createSubmission(form); // one per receiver
    setSubmissions(prev => [...prev, ...created]);
    return created[0];
  }, []);
  const changeSubmission = useCallback(async (id, body, patch) => {
    try { await updateSubmission(id, body); }
    catch (e) { refreshSubmissions(); throw e; }
    setSubmissions(prev => patch ? prev.map(s => s.id === id ? { ...s, ...patch } : s) : prev.filter(s => s.id !== id));
  }, [refreshSubmissions]);
  // Declining sends it back to whoever sent it, with the reason.
  const declineSubmission = useCallback((id, reason) => changeSubmission(id, { status: "dismissed", reason }, { status: "dismissed", reason }), [changeSubmission]);
  const withdrawSubmission = useCallback((id) => changeSubmission(id, { action: "withdraw" }), [changeSubmission]);
  const clearSubmission = useCallback((id) => changeSubmission(id, { action: "clear" }), [changeSubmission]);

  // Keep generated day plans in step with Define-Time tasks. A task pinned to a date whose
  // plan already exists is placed into that plan (at its clock time when it has one, else
  // in its category block); when it moves to another date, loses its date, or goes back to
  // Auto it leaves the old plan. Concluded days and days already behind us are left
  // untouched — they are history.
  const isPinned = (t) => !!t && t.scheduleMode === "DEFINE" && !!t.date && t.status !== "done";
  const PLAN_SYNC_FIELDS = ["scheduleMode", "date", "time", "duration", "category", "title", "unit"];
  const planIsOpen = (plans, date) => !!plans[date] && !plans[date].concluded && date >= todayISO();
  const syncTaskWithPlans = useCallback((before, after) => {
    persistPlans(prev => {
      let next = prev;
      if (isPinned(before) && planIsOpen(prev, before.date)) {
        const { schedule, removed } = removeTaskFromPlan(prev[before.date], before.id, before.duration);
        if (removed) next = { ...next, [before.date]: { ...prev[before.date], schedule } };
      }
      if (isPinned(after) && planIsOpen(next, after.date)) {
        const { schedule, inserted } = insertTaskIntoPlan(next[after.date], after, settings.focusLimit);
        if (inserted) next = { ...next, [after.date]: { ...next[after.date], schedule } };
      }
      return next;
    });
  }, [persistPlans, settings.focusLimit]);

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
  // A submission turned into a task on this board. With a date it arrives pinned to that day
  // (Define Time), and with a clock time as its own fixed block.
  const taskFromSubmission = (sub, { priority = "High", importance = "High", date = "", time = "" } = {}, note = "") => ({
    title: sub.title, unit: sub.unit, category: sub.category, workType: sub.workType,
    duration: sub.duration, priority, importance,
    notes: [sub.notes, note].filter(Boolean).join("\n"),
    ...(date ? { scheduleMode: "DEFINE", date, time: time || "" } : { scheduleMode: "AUTO", date: "", time: "" }),
  });
  // Approving puts it on this board — at the date / time asked for, unless changed here.
  const approveSubmission = async (sub, decision) => {
    await changeSubmission(sub.id, { status: "approved" }, { status: "approved" });
    const invite = sub.kind === "invite";
    addTask({
      ...taskFromSubmission(sub, decision, `${invite ? "Executive Interaction — invited" : "Sent"} by ${sub.submittedBy || "someone"}`),
      ...(invite ? { title: `${sub.title} — with ${sub.submittedBy}` } : {}),
    });
  };
  // Something sent that came back (declined) can simply be kept on the sender's own board.
  const keepReturnedSubmission = async (sub) => {
    await clearSubmission(sub.id);
    if (sub.kind !== "invite") addTask(taskFromSubmission(sub, { date: sub.date, time: sub.time }, `Returned by ${sub.ownerName || sub.owner}${sub.reason ? ` — ${sub.reason}` : ""}`));
  };
  // Executive Interaction: invite another user to join one of this board's tasks at a set
  // date / time. The task itself moves to that slot too, so both calendars line up once the
  // invite is accepted.
  const sendInvite = async (task, { to, date, time, notes }) => {
    const created = await addSubmission({
      kind: "invite", to, date, time, notes, sourceTaskId: task.id,
      title: task.title, unit: task.unit, category: task.category, workType: task.workType, duration: task.duration,
    });
    if (task.date !== date || (task.time || "") !== (time || "") || task.scheduleMode !== "DEFINE") {
      updateTask(task.id, { scheduleMode: "DEFINE", date, time: time || "", overdueSince: null });
    }
    return created;
  };
  const updateTask = (id, patch) => {
    const before = tasks.find(t => t.id === id);
    persistTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    if (!before) return;
    const after = { ...before, ...patch };
    if ((isPinned(before) || isPinned(after)) && PLAN_SYNC_FIELDS.some(k => before[k] !== after[k])) syncTaskWithPlans(before, after);
  };
  const updateTasksBulk = (patchesById) => persistTasks(prev => prev.map(t => patchesById[t.id] ? { ...t, ...patchesById[t.id] } : t));
  // A task that is done has no business in any later day's plan (today's plan keeps it so
  // Conclude Day can record it as completed).
  const purgeFromFuturePlans = (taskList, afterDate) => {
    if (!taskList.length) return;
    persistPlans(prev => removeTasksFromOpenPlans(prev, taskList, addDays(afterDate, 1)));
  };
  // Completing a repeating task rolls its series forward: the next occurrence goes onto the
  // board pinned to its date (and into that day's plan when one is already open), linked
  // from the finished one through `repeatNextId`.
  const spawnNextOccurrences = (doneTasks, completedOn) => {
    const spawned = [];
    const links = {};
    doneTasks.forEach(t => {
      const next = nextOccurrenceTask(t, completedOn, tasks);
      if (next) { spawned.push(next); links[t.id] = next.id; }
    });
    if (!spawned.length) return;
    persistTasks(prev => [...spawned, ...prev.map(t => links[t.id] ? { ...t, repeatNextId: links[t.id] } : t)]);
    spawned.forEach(t => syncTaskWithPlans(null, t));
  };
  const completeTask = (id) => {
    const t = tasks.find(x => x.id === id);
    updateTask(id, { status: "done", completedAt: Date.now() });
    if (!t) return;
    purgeFromFuturePlans([t], todayISO());
    if (t.status !== "done") spawnNextOccurrences([t], todayISO());
  };
  // Take a task back out of Completed. It keeps its date, so one that was due on a day that
  // has passed shows up as overdue and gets pulled into the next day planned. Restoring a
  // repeating task also undoes its roll-forward — the next occurrence it put on the board
  // goes again, as long as nothing has been done with that one yet.
  const reopenTask = (id) => {
    const t = tasks.find(x => x.id === id);
    const next = t?.repeatNextId ? tasks.find(x => x.id === t.repeatNextId) : null;
    const undo = !!next && next.status !== "done" && !(next.sessions || []).length;
    updateTask(id, { status: "open", completedAt: null, ...(undo ? { repeatNextId: null } : {}) });
    if (!undo) return;
    persistTasks(prev => prev.filter(x => x.id !== next.id));
    persistPlans(prev => removeTasksFromOpenPlans(prev, [next], todayISO()));
  };
  // Functional update so multiple savePlan calls in the same tick (e.g. concluding a day
  // while also placing follow-ups on other dates) chain correctly instead of clobbering each other.
  const savePlan = (date, plan) => persistPlans(prev => ({ ...prev, [date]: plan }));
  const savePlansBulk = (patchesByDate) => persistPlans(prev => ({ ...prev, ...patchesByDate }));

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-sm text-black/40" style={{background: PAPER}}>Loading…</div>;

  return (
    <UnitsContext.Provider value={unitsValue}>
    <WorkTypesContext.Provider value={workTypesValue}>
    <SettingsContext.Provider value={settingsValue}>
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
        {tab === "board" && <Board tasks={tasks} addTask={addTask} addTasksBulk={addTasksBulk} updateTask={updateTask} completeTask={completeTask} reopenTask={reopenTask} personalBlocks={personalBlocks} addPersonalBlock={addPersonalBlock} me={me} directory={directory} submissions={submissions} sendInvite={sendInvite}
          submissionActions={{ addSubmission, approveSubmission, declineSubmission, withdrawSubmission, clearSubmission, keepReturnedSubmission, refreshSubmissions }} />}
        {tab === "matrix" && <EisenhowerMatrix tasks={tasks} />}
        {tab === "plan" && <PlanMyDay tasks={tasks} addTask={addTask} updateTask={updateTask} updateTasksBulk={updateTasksBulk} dayPlans={dayPlans} savePlan={savePlan} jumpToDayView={(d) => { setDateISO(d); setTab("day"); }} personalBlocks={personalBlocks} addPersonalBlock={addPersonalBlock} initialDate={planDate} />}
        {tab === "day" && <DayView dateISO={dateISO} setDateISO={setDateISO} dayPlans={dayPlans} tasks={tasks} savePlan={savePlan} updateTask={updateTask} goPlan={() => { setPlanDate(dateISO); setTab("plan"); }} goConclude={() => setTab("conclude")} addTask={addTask} />}
        {tab === "conclude" && <ConcludeDay key={dateISO} dateISO={dateISO} setDateISO={setDateISO} dayPlans={dayPlans} tasks={tasks} updateTask={updateTask} updateTasksBulk={updateTasksBulk} savePlan={savePlan} savePlansBulk={savePlansBulk} purgeFromFuturePlans={purgeFromFuturePlans} spawnNextOccurrences={spawnNextOccurrences} onDone={() => setTab("intel")} goDay={() => setTab("day")} />}
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
    </SettingsContext.Provider>
    </WorkTypesContext.Provider>
    </UnitsContext.Provider>
  );
}
