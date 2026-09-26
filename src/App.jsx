import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Sparkles, TrendingUp, Calendar, Sun, Layers, LogOut, KeyRound, Users as UsersIcon, ChevronDown, SlidersHorizontal } from "lucide-react";
import { ACCENT, ALERT, PAPER, INK, UNITS, DEFAULT_WORK_TYPES, DEFAULT_SETTINGS, clampFocusLimit, normalizeSettings, normalizeWorkTypes } from "./constants.js";
import { uid, todayISO, addDays, fmtDate } from "./utils.js";
import { clearAuth } from "./auth.js";
import { ssoLogout } from "./lib/sso.js";
import { ChangePassword } from "./AuthGate.jsx";
import { useEscape } from "./components/ui.jsx";
import { loadAll, saveTasks, saveDayPlans, loadPersonalBlocks, savePersonalBlocks, loadSubmissions, createSubmission, updateSubmission, loadDirectory, loadUnits, saveUnits, loadWorkTypes, saveWorkTypes, loadSettings, saveSettings, onRemote, hasUnsavedChanges } from "./storage.js";
import { reconcile, mergeById, mergeByKey } from "./sync.js";
import { getAuth } from "./auth.js";
import { UnitsContext } from "./UnitsContext.jsx";
import { WorkTypesContext } from "./WorkTypesContext.jsx";
import { SettingsContext } from "./SettingsContext.jsx";
import { insertTaskIntoPlan, removeTaskFromPlan, removeTasksFromOpenPlans } from "./scheduleEngine.js";
import { nextOccurrenceTask, isRepeating } from "./repeat.js";
import { windowsToTasks, retirePastWindows } from "./migrations.js";
import Board from "./components/Board.jsx";
import PlanMyDay from "./components/PlanMyDay.jsx";
import DayView from "./components/DayView.jsx";
import ConcludeDay from "./components/ConcludeDay.jsx";
import WeekView from "./components/WeekView.jsx";
import MonthView from "./components/MonthView.jsx";
import Intelligence from "./components/Intelligence.jsx";
import ManageWorkTypesModal from "./components/ManageWorkTypesModal.jsx";

// Five places to be. The matrix lives inside the Board, Conclude is reached from the Day it
// closes, and Week and Month share the Calendar.
const TABS = [
  { id: "board", label: "Board", icon: Layers },
  { id: "plan", label: "Plan", icon: Sparkles },
  { id: "day", label: "Day", icon: Sun },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "intel", label: "Insight", icon: TrendingUp },
];
const tabOf = (tab) => (tab === "conclude" ? "day" : tab === "week" || tab === "month" ? "calendar" : tab);

// The signed-in user's name in the header, with what they can do to their account behind it.
function UserMenu({ me, onChangePassword, onSettings, placement = "down", full = false }) {
  const [open, setOpen] = useState(false);
  useEscape(() => setOpen(false), open);
  const initials = (me.name || me.username || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const signOut = () => { ssoLogout(); clearAuth(); window.location.reload(); };
  const item = "w-full text-left px-3 min-h-11 text-sm flex items-center gap-2.5 hover:bg-black/[0.03]";
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className={`min-h-11 flex items-center gap-2 pl-1 pr-2 rounded-xl hover:bg-black/[0.04] ${full ? "w-full" : "rounded-full"}`}>
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0" style={{ background: ACCENT }}>{initials}</span>
        <span className={`text-sm ${full ? "flex-1 text-left" : "hidden sm:inline max-w-[10rem]"} truncate`} style={{ color: INK }}>{me.name}</span>
        <ChevronDown size={14} className="text-black/40 shrink-0" style={placement === "up" ? { transform: "rotate(180deg)" } : {}} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className={`absolute ${placement === "up" ? "left-0 right-0 bottom-full mb-1" : "right-0 mt-1 w-60"} bg-white rounded-xl border border-black/[0.08] shadow-lg z-40 py-1 rise`}>
            <div className="px-3 py-2.5 border-b border-black/[0.06]">
              <p className="text-sm font-medium truncate" style={{ color: INK }}>{me.name}</p>
              <p className="text-[11px] text-black/40 truncate">{me.username}{me.role === "admin" ? " · admin" : ""}</p>
            </div>
            <button role="menuitem" onClick={() => { setOpen(false); onSettings(); }} className={item}><SlidersHorizontal size={14} className="text-black/40" /> Work types & settings</button>
            <button role="menuitem" onClick={() => { setOpen(false); onChangePassword(); }} className={item}><KeyRound size={14} className="text-black/40" /> Change password</button>
            {me.role === "admin" && <a role="menuitem" href="/admin" className={item}><UsersIcon size={14} className="text-black/40" /> Manage users</a>}
            <button role="menuitem" onClick={signOut} className={`${item} border-t border-black/[0.06]`} style={{ color: ALERT }}><LogOut size={14} /> Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [dayPlans, setDayPlans] = useState({});
  const [submissions, setSubmissions] = useState([]);
  // Everyone else with an account — who a task can be sent to or an invite go to.
  const [directory, setDirectory] = useState([]);
  const me = useMemo(() => getAuth()?.user || { username: "", name: "" }, []);
  const [tab, setTab] = useState("board");
  const [calView, setCalView] = useState("week");
  const [showPassword, setShowPassword] = useState(false);
  const [dateISO, setDateISO] = useState(todayISO());
  // Date the Plan My Day wizard opens on. null = its default (tomorrow); set when the user
  // arrives from a specific day via Replan / Plan My Day in the Day tab.
  const [planDate, setPlanDate] = useState(null);
  const [units, setUnits] = useState(UNITS);
  const [workTypes, setWorkTypes] = useState(DEFAULT_WORK_TYPES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // A one-line message for the user (a save refused because the same item changed on
  // another screen, say) — a string, or { text, action: { label, onClick } } when there is
  // something to do about it, like undoing a delete. Clears itself after a while.
  const [notice, setNotice] = useState(null);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), notice?.action ? 8000 : 12000); return () => clearTimeout(t); }, [notice]);
  // Work types, activities, the Focus limit and usual breaks, from the account menu.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Plan My Day keeps what was chosen for a date while the user is elsewhere in the app, so
  // leaving the wizard and coming back does not throw the choices away.
  const [planDrafts, setPlanDrafts] = useState({});
  const saveDraft = useCallback((date, state) => setPlanDrafts(prev => { const next = { ...prev }; if (state) next[date] = state; else delete next[date]; return next; }), []);

  const refreshSubmissions = useCallback(() => loadSubmissions().then(setSubmissions), []);

  useEffect(() => {
    // The board shows only once tasks and plans are in: anything the server sends later is
    // merged against what was loaded, so the screen must start from it. Any No-Schedule
    // Windows still kept in the old separate list move onto the board as tasks first, and
    // windows whose day has passed are retired.
    Promise.all([loadAll(), loadPersonalBlocks()]).then(([{ tasks, dayPlans }, blocks]) => {
      const today = todayISO();
      const moved = windowsToTasks(blocks, tasks, dayPlans, today);
      const retired = retirePastWindows(moved.tasks, today);
      setTasks(retired.tasks); setDayPlans(moved.dayPlans); setLoaded(true);
      if (moved.changed || retired.changed) saveTasks(retired.tasks);
      if (moved.changed) { saveDayPlans(moved.dayPlans); savePersonalBlocks([]); }
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
    // Something changed both here and on another screen: the other screen's version stands,
    // and the user is told which item so they can redo their change on the current copy.
    const describe = {
      tasks: (c) => `“${c.title || "A task"}” was changed on another screen, so your change to it was not saved. Reopen it to redo it.`,
      dayplans: (c) => `The plan for ${fmtDate(c.key)} was changed on another screen, so your change to it was not saved. Reopen that day to redo it.`,
    };
    const adopt = (what, setState, merge, save, fallback) => (theirs, from, conflicts = []) => {
      setState(prev => {
        const { next, save: needed } = reconcile(prev, from, theirs ?? fallback, merge);
        if (needed) save(next);
        return next;
      });
      if (conflicts.length) setNotice(describe[what](conflicts[0]) + (conflicts.length > 1 ? ` (${conflicts.length - 1} more)` : ""));
    };
    const offs = [
      onRemote("tasks", adopt("tasks", setTasks, mergeById, saveTasks, [])),
      onRemote("dayplans", adopt("dayplans", setDayPlans, mergeByKey, saveDayPlans, {})),
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
  // Withdrawing an invite also puts the task back where it was before the invite moved it,
  // as long as it still sits at the invite's slot.
  const withdrawSubmission = async (id) => {
    const sub = submissions.find(s => s.id === id);
    await changeSubmission(id, { action: "withdraw" });
    const t = sub?.kind === "invite" && sub.sourceTaskId ? tasks.find(x => x.id === sub.sourceTaskId) : null;
    if (t?.inviteRestore && t.date === sub.date && (t.time || "") === (sub.time || "")) updateTask(t.id, { ...t.inviteRestore, inviteRestore: null });
  };
  const clearSubmission = useCallback((id) => changeSubmission(id, { action: "clear" }), [changeSubmission]);

  // Keep generated day plans in step with Define-Time tasks. A task pinned to a date whose
  // plan already exists is placed into that plan (at its clock time when it has one, else
  // in its category block); when it moves to another date, loses its date, or goes back to
  // Auto it leaves the old plan. Concluded days and days already behind us are left
  // untouched — they are history.
  const isPinned = (t) => !!t && t.scheduleMode === "DEFINE" && !!t.date && t.status !== "done";
  const PLAN_SYNC_FIELDS = ["scheduleMode", "date", "time", "duration", "category", "title", "unit"];
  const planIsOpen = (plans, date) => !!plans[date] && !plans[date].concluded && date >= todayISO();
  // `blockKey` names the block a task added from the Day view should join.
  const syncTaskWithPlans = useCallback((before, after, blockKey = null) => {
    persistPlans(prev => {
      let next = prev;
      if (isPinned(before) && planIsOpen(prev, before.date)) {
        const { schedule, removed } = removeTaskFromPlan(prev[before.date], before.id, before.duration);
        if (removed) next = { ...next, [before.date]: { ...prev[before.date], schedule } };
      }
      if (isPinned(after) && planIsOpen(next, after.date)) {
        const { schedule, inserted } = insertTaskIntoPlan(next[after.date], after, settings.focusLimit, blockKey);
        if (inserted) next = { ...next, [after.date]: { ...next[after.date], schedule } };
      }
      return next;
    });
  }, [persistPlans, settings.focusLimit]);

  const addTask = (form, { blockKey = null } = {}) => {
    const t = { id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form };
    persistTasks(prev => [t, ...prev]);
    if (isPinned(t)) syncTaskWithPlans(null, t, blockKey);
    return t;
  };
  // Off the board and out of every open day it was placed in (days already concluded keep
  // their record) — with a few seconds to change your mind.
  const deleteTask = (id) => {
    const t = tasks.find(x => x.id === id);
    persistTasks(prev => prev.filter(x => x.id !== id));
    if (!t) return;
    persistPlans(prev => removeTasksFromOpenPlans(prev, [t], todayISO()));
    setNotice({
      text: `“${t.title}” deleted.`,
      action: { label: "Undo", onClick: () => { persistTasks(prev => (prev.some(x => x.id === t.id) ? prev : [t, ...prev])); if (isPinned(t)) syncTaskWithPlans(null, t); setNotice(null); } },
    });
  };
  const addTasksBulk = (forms) => {
    const newOnes = forms.map(form => ({ id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form }));
    persistTasks(prev => [...newOnes, ...prev]);
    newOnes.filter(isPinned).forEach(t => syncTaskWithPlans(null, t));
    return newOnes;
  };
  // A submission turned into a task on this board. With a date it arrives pinned to that day
  // (Define Time), and with a clock time as its own fixed block. A No-Schedule Window is
  // always pinned — it is time kept clear on a day — and carries no priority or importance.
  const taskFromSubmission = (sub, { priority = "High", importance = "High", date = "", time = "" } = {}, note = "") => {
    const win = sub.category === "noSchedule";
    const on = win ? date || sub.date || todayISO() : date;
    return {
      title: sub.title, unit: sub.unit, category: sub.category, workType: sub.workType,
      duration: sub.duration, priority: win ? "" : priority, importance: win ? "" : importance,
      notes: [sub.notes, note].filter(Boolean).join("\n"),
      ...(on ? { scheduleMode: "DEFINE", date: on, time: win ? time || sub.time || "12:00" : time || "" } : { scheduleMode: "AUTO", date: "", time: "" }),
    };
  };
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
    // Rows from the old shared inbox name no receiver; whoever sent it back is the next best.
    const who = sub.owner || sub.decidedBy;
    const by = sub.ownerName || directory.find(u => u.username === who)?.name || who || "the receiver";
    if (sub.kind !== "invite") addTask(taskFromSubmission(sub, { date: sub.date, time: sub.time }, `Returned by ${by}${sub.reason ? ` — ${sub.reason}` : ""}`));
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
      // Remember where the task was, so withdrawing the invite can put it back.
      const inviteRestore = task.inviteRestore || { scheduleMode: task.scheduleMode || "AUTO", date: task.date || "", time: task.time || "", overdueSince: task.overdueSince || null };
      updateTask(task.id, { scheduleMode: "DEFINE", date, time: time || "", overdueSince: null, inviteRestore });
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
    // A repeating task's occurrence for a day still ahead is not simply ticked off in passing.
    if (t && isRepeating(t) && t.date && t.date > todayISO() && !window.confirm(`This is the ${fmtDate(t.date)} occurrence of “${t.title}”. Mark it done already? The one after it will be added to the board.`)) return;
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

  if (!loaded) return (
    <div className="min-h-dvh flex items-center justify-center p-6" style={{ background: PAPER, fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <div className="w-full max-w-sm space-y-3" aria-busy="true" aria-live="polite">
        <p className="text-lg text-center" style={{ color: INK, fontFamily: "Georgia, 'Iowan Old Style', ui-serif, serif" }}>Executive Scheduler</p>
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-2xl bg-black/[0.06] pulse-soft" style={{ animationDelay: `${i * 120}ms` }} />)}
        </div>
        <p className="text-xs text-center text-black/40">Loading your board…</p>
      </div>
    </div>
  );

  const activeTab = tabOf(tab);
  const showCalendar = tab === "calendar" || tab === "week" || tab === "month";
  const calendarView = tab === "month" ? "month" : tab === "week" ? "week" : calView;

  return (
    <UnitsContext.Provider value={unitsValue}>
    <WorkTypesContext.Provider value={workTypesValue}>
    <SettingsContext.Provider value={settingsValue}>
    <div className="min-h-dvh lg:flex" style={{ background: PAPER, fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        .font-serif { font-family: Georgia, 'Iowan Old Style', ui-serif, serif; }
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body, .min-h-dvh { background: white !important; }
        }
      `}</style>
      {/* On a laptop the sections live in a sidebar; on a phone, in the bar at the bottom. */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 sticky top-0 h-dvh border-r border-black/[0.06] px-4 py-5 no-print">
        <div className="px-2">
          <p className="font-serif text-lg" style={{ color: INK }}>Executive Scheduler</p>
          <p className="text-xs text-black/40 mt-0.5">{fmtDate(todayISO())}</p>
        </div>
        <nav aria-label="Sections" className="mt-6 space-y-1">
          {TABS.map(t => {
            const Icon = t.icon;
            const sel = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => { if (t.id === "plan") setPlanDate(null); setTab(t.id); }} aria-current={sel ? "page" : undefined}
                className="w-full min-h-11 flex items-center gap-3 px-3 rounded-xl text-sm font-medium hover:bg-black/[0.03]"
                style={sel ? { background: "white", color: INK, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.06)" } : { color: "rgba(0,0,0,0.55)", border: "1px solid transparent" }}>
                <Icon size={18} color={sel ? ACCENT : "rgba(0,0,0,0.4)"} /> {t.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t border-black/[0.06]">
          <UserMenu me={me} onChangePassword={() => setShowPassword(true)} onSettings={() => setSettingsOpen(true)} placement="up" full />
        </div>
      </aside>
      <div className="flex-1 min-w-0 pb-24 lg:pb-10">
      <header className="sticky top-0 z-30 no-print lg:hidden" style={{ background: "rgba(247,245,241,0.9)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-baseline gap-2.5">
            <span className="font-serif text-lg truncate" style={{ color: INK }}>Executive Scheduler</span>
            <span className="text-xs text-black/40 hidden sm:inline whitespace-nowrap">{fmtDate(todayISO())}</span>
          </div>
          <UserMenu me={me} onChangePassword={() => setShowPassword(true)} onSettings={() => setSettingsOpen(true)} />
        </div>
      </header>
      {showPassword && <ChangePassword onClose={() => setShowPassword(false)} />}
      <ManageWorkTypesModal open={settingsOpen} onClose={() => setSettingsOpen(false)} tasks={tasks} />
      <main className="max-w-4xl lg:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-8">
        {tab === "board" && <Board tasks={tasks} dayPlans={dayPlans} addTask={addTask} addTasksBulk={addTasksBulk} updateTask={updateTask} completeTask={completeTask} reopenTask={reopenTask} deleteTask={deleteTask} me={me} directory={directory} submissions={submissions} sendInvite={sendInvite}
          onOpenToday={() => { setDateISO(todayISO()); setTab("day"); }} onPlanToday={() => { setPlanDate(todayISO()); setTab("plan"); }}
          submissionActions={{ addSubmission, approveSubmission, declineSubmission, withdrawSubmission, clearSubmission, keepReturnedSubmission, refreshSubmissions }} />}
        {tab === "plan" && <PlanMyDay tasks={tasks} addTask={addTask} updateTask={updateTask} updateTasksBulk={updateTasksBulk} deleteTask={deleteTask} dayPlans={dayPlans} savePlan={savePlan} jumpToDayView={(d) => { setDateISO(d); setTab("day"); }} initialDate={planDate} drafts={planDrafts} saveDraft={saveDraft} />}
        {tab === "day" && <DayView dateISO={dateISO} setDateISO={setDateISO} dayPlans={dayPlans} tasks={tasks} savePlan={savePlan} updateTask={updateTask} deleteTask={deleteTask} goPlan={() => { setPlanDate(dateISO); setTab("plan"); }} goConclude={() => setTab("conclude")} addTask={addTask} />}
        {tab === "conclude" && <ConcludeDay key={dateISO} dateISO={dateISO} setDateISO={setDateISO} dayPlans={dayPlans} tasks={tasks} me={me} updateTask={updateTask} updateTasksBulk={updateTasksBulk} savePlan={savePlan} savePlansBulk={savePlansBulk} purgeFromFuturePlans={purgeFromFuturePlans} spawnNextOccurrences={spawnNextOccurrences} onDone={() => setTab("intel")} goDay={() => setTab("day")} />}
        {showCalendar && (
          <div className="space-y-4">
            <div className="flex justify-center no-print">
              <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-full border border-black/10 bg-white p-0.5">
                {[["week", "Week"], ["month", "Month"]].map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={calendarView === id} onClick={() => { setCalView(id); setTab("calendar"); }}
                    className="min-h-10 px-5 rounded-full text-xs font-semibold" style={calendarView === id ? { background: INK, color: "white" } : { color: "rgba(0,0,0,0.55)" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {calendarView === "week"
              ? <WeekView dayPlans={dayPlans} tasks={tasks} setDateISO={setDateISO} setTab={setTab} onPlan={(d) => { setPlanDate(d); setTab("plan"); }} />
              : <MonthView dayPlans={dayPlans} tasks={tasks} setDateISO={setDateISO} setTab={setTab} />}
          </div>
        )}
        {tab === "intel" && <Intelligence tasks={tasks} dayPlans={dayPlans} />}
      </main>
      </div>

      {notice && (
        <div className="fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-lg no-print rise" style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }} role="status" aria-live="polite">
          <div className="rounded-xl px-4 py-3 text-sm text-white shadow-lg flex items-center gap-3" style={{ background: INK }}>
            <span className="flex-1">{typeof notice === "string" ? notice : notice.text}</span>
            {notice.action && <button onClick={notice.action.onClick} className="min-h-9 px-2.5 rounded-lg text-sm font-semibold hover:bg-white/10" style={{ color: "#9FD0CB" }}>{notice.action.label}</button>}
            <button onClick={() => setNotice(null)} className="w-9 h-9 -mr-2 inline-flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10" aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      <nav role="tablist" aria-label="Sections" className="fixed bottom-0 left-0 right-0 border-t border-black/[0.06] no-print lg:hidden"
        style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-4xl mx-auto grid grid-cols-5">
          {TABS.map(t => {
            const Icon = t.icon;
            const sel = activeTab === t.id;
            return (
              <button key={t.id} role="tab" aria-selected={sel} onClick={() => { if (t.id === "plan") setPlanDate(null); setTab(t.id); }}
                className="relative min-h-[56px] flex flex-col items-center justify-center gap-1 hover:bg-black/[0.02]">
                {sel && <span className="absolute top-0 h-0.5 w-8 rounded-full" style={{ background: ACCENT }} />}
                <Icon size={20} color={sel ? ACCENT : "rgba(0,0,0,0.4)"} strokeWidth={sel ? 2.25 : 2} />
                <span className="text-[11px] font-medium" style={{ color: sel ? ACCENT : "rgba(0,0,0,0.45)" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
    </SettingsContext.Provider>
    </WorkTypesContext.Provider>
    </UnitsContext.Provider>
  );
}
