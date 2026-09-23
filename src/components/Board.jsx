import React, { useState } from "react";
import { Plus, Clock, Star, Circle, CheckCircle2, Pencil, Search, X, RotateCcw, AlertCircle, MessageSquare, Repeat, UserPlus, Trash2, SlidersHorizontal, ClipboardList, Sun, Sparkles, CalendarDays, Zap, Inbox } from "lucide-react";
import { categoryChipTone, CATEGORY_IDS, CATEGORY_DEFAULT_DURATION, isWindow, ACCENT, ACCENT_WARM, ALERT, INK } from "../constants.js";
import { todayISO, toLocalISO, fmtDate, timeStrToClock, timeToMins, minsToClock, overdueSince, taskMatchesQuery } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { isRepeating, describeRepeat } from "../repeat.js";
import { Card, Chip, PrimaryButton, GhostButton, EmptyState } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";
import BulkAdd from "./BulkAdd.jsx";
import Submissions from "./Submissions.jsx";
import ManageUnitsModal from "./ManageUnitsModal.jsx";
import InviteModal from "./InviteModal.jsx";
import EisenhowerMatrix from "./EisenhowerMatrix.jsx";

// Latest Conclude Day comment on a task, for the one-line preview under it.
const lastNote = (t) => {
  const s = (t.sessions || []).slice(-1)[0];
  if (!s) return null;
  const text = s.discussion || s.nextAction;
  return text ? { date: s.date, outcome: s.outcome, text } : { date: s.date, outcome: s.outcome, text: "" };
};

// Board order: overdue first (oldest first), then Do First (High priority and High
// importance), then by date (undated last), then the order they were added.
const isDoFirst = (t) => t.priority === "High" && t.importance === "High";
const dateKey = (t) => (t.scheduleMode === "DEFINE" && t.date ? t.date : "9999-99-99");
const boardOrder = (a, b) =>
  (a.od && !b.od ? -1 : !a.od && b.od ? 1 : a.od && b.od ? a.od.localeCompare(b.od) : 0)
  || (isDoFirst(a.t) === isDoFirst(b.t) ? 0 : isDoFirst(a.t) ? -1 : 1)
  || dateKey(a.t).localeCompare(dateKey(b.t))
  || a.i - b.i;

// The board reads in sections: what is late, what is for today, what to do first, what is
// booked for later, and everything else that can go anywhere.
const groupOf = (t, od, today) => {
  if (od) return "overdue";
  if (t.scheduleMode === "DEFINE" && t.date === today) return "today";
  if (isDoFirst(t)) return "doFirst";
  if (t.scheduleMode === "DEFINE" && t.date) return "scheduled";
  return "anytime";
};
const GROUPS = [
  { key: "overdue", title: "Overdue", icon: AlertCircle, color: ALERT },
  { key: "today", title: "Today", icon: Sun, color: ACCENT },
  { key: "doFirst", title: "Do first", icon: Zap, color: ACCENT_WARM },
  { key: "scheduled", title: "Scheduled", icon: CalendarDays, color: "rgba(0,0,0,0.5)" },
  { key: "anytime", title: "Anytime", icon: Inbox, color: "rgba(0,0,0,0.5)" },
];

const titleCase = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export default function Board({ tasks, dayPlans = {}, addTask, addTasksBulk, updateTask, completeTask, reopenTask, deleteTask, me, directory, submissions, submissionActions, sendInvite, onOpenToday, onPlanToday }) {
  const { units } = useUnits();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  // A new task started as a No-Schedule Window (the button beside Add Task).
  const [preset, setPreset] = useState(null);
  const [inviting, setInviting] = useState(null); // the task an Executive Interaction invite is being written for
  const { categoryLabel, activityOptions } = useWorkTypes();
  // Units are a multi-select: none chosen means all.
  const [unitFilter, setUnitFilter] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [activityFilter, setActivityFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [unitsModalOpen, setUnitsModalOpen] = useState(false);
  const [subTab, setSubTab] = useState("list");
  // On a phone the three filter rows fold away behind one button; on wider screens they show.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const today = todayISO();
  const openNew = () => { setEditing(null); setPreset(null); setModalOpen(true); };
  const openWindow = () => {
    setEditing(null);
    setPreset({ title: "", unit: "", priority: "", importance: "", category: "noSchedule", workType: activityOptions("noSchedule")[0], duration: CATEGORY_DEFAULT_DURATION.noSchedule, scheduleMode: "DEFINE", date: today, time: "12:00", notes: "" });
    setModalOpen(true);
  };
  // What needs this user in the Submissions tab: things waiting for their approval, and
  // things they sent that came back.
  const sentByMe = (s) => s.submittedByUser === me.username;
  const pendingCount = submissions.filter(s => sentByMe(s) ? s.status === "dismissed" : s.status === "pending").length;
  // Executive Interaction invites sent for each task, shown on its card.
  const invitesByTask = {};
  submissions.filter(s => s.kind === "invite" && sentByMe(s) && s.sourceTaskId).forEach(s => { (invitesByTask[s.sourceTaskId] ||= []).push(s); });
  const searching = query.trim().length > 0;

  // Activities on offer follow the chosen Work Type (all of them when none is chosen), plus any
  // activity a task still carries after it was removed from the user's lists.
  const filterCats = categoryFilter === "All" ? CATEGORY_IDS : [categoryFilter];
  const activityChoices = Array.from(new Set([
    ...filterCats.flatMap(c => activityOptions(c)),
    ...tasks.filter(t => filterCats.includes(t.category)).map(t => t.workType).filter(Boolean),
  ]));
  // A chosen activity that no longer belongs to the chosen Work Type falls back to All.
  const activity = activityChoices.includes(activityFilter) ? activityFilter : "All";
  const filtering = unitFilter.length > 0 || categoryFilter !== "All" || activity !== "All";
  const filterCount = unitFilter.length + (categoryFilter !== "All" ? 1 : 0) + (activity !== "All" ? 1 : 0);
  const matchesFilters = (t) =>
    (unitFilter.length === 0 || unitFilter.includes(t.unit)) &&
    (categoryFilter === "All" || t.category === categoryFilter) &&
    (activity === "All" || t.workType === activity) &&
    taskMatchesQuery(t, query);
  const clearFilters = () => { setUnitFilter([]); setCategoryFilter("All"); setActivityFilter("All"); setQuery(""); };
  const toggleUnit = (u) => setUnitFilter(prev => (prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]));

  const active = tasks.filter(t => t.status !== "done");
  const visible = active
    .filter(matchesFilters)
    .map((t, i) => ({ t, i, od: overdueSince(t) }))
    .sort(boardOrder);
  const overdueCount = active.filter(t => overdueSince(t)).length;
  const todayCount = active.filter(t => !isWindow(t) && t.scheduleMode === "DEFINE" && t.date === today).length;
  const todayPlan = dayPlans[today];
  const groups = GROUPS.map(g => ({ ...g, items: visible.filter(({ t, od }) => groupOf(t, od, today) === g.key).map(({ t }) => t) })).filter(g => g.items.length);
  const doneAll = tasks.filter(t => t.status === "done").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  // A search looks through the whole history; otherwise only the most recent completions are
  // listed. The Unit / Work Type / Activity filters narrow the history the same way as the board.
  const doneMatching = doneAll.filter(matchesFilters);
  const done = searching ? doneMatching : doneMatching.slice(0, 30);

  const openEditor = (t) => { setEditing(t); setModalOpen(true); };
  const confirmDelete = (t) => { if (window.confirm(`Delete “${t.title}” for good?`)) deleteTask(t.id); };
  const chipStyle = (on) => ({ borderColor: on ? INK : "rgba(0,0,0,0.1)", background: on ? INK : "white", color: on ? "white" : "rgba(0,0,0,0.6)" });

  const renderTask = (t) => {
    const od = overdueSince(t);
    const note = lastNote(t);
    return (
      <Card key={t.id} className="p-4 flex items-start gap-2 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]" style={od ? { boxShadow: `0 0 0 1.5px ${ALERT}40` } : {}}>
        <button onClick={() => completeTask(t.id)} aria-label={`Mark “${t.title}” complete`} title="Mark complete"
          className="w-11 h-11 -m-2 mr-0 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04] group">
          <Circle size={20} className="text-black/25 group-hover:text-black/50" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditor(t)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openEditor(t); }} aria-label={`Open “${t.title}”`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: INK }}>{t.title}</span>
            {t.nonNegotiable && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
            {od && <Chip tone="warn"><AlertCircle size={10} /> Overdue · since {fmtDate(od)}</Chip>}
            {!od && t.carryForwardCount > 1 && <Chip tone="warn">Attention</Chip>}
            {!od && t.carryForwardCount === 1 && <Chip tone="outline">Carried forward</Chip>}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {t.unit && <Chip>{t.unit}</Chip>}
            <Chip tone={categoryChipTone(t.category)}>{t.workType}</Chip>
            {!isWindow(t) && <span className="text-[11px] text-black/45 tabular">{t.duration}m</span>}
            {t.priority && t.importance && <span className="text-[11px] text-black/45">· {isDoFirst(t) ? "Do first" : `${t.priority} priority · ${t.importance} importance`}</span>}
            {isWindow(t) && t.date && <span className="text-[11px] text-black/45 tabular">· {fmtDate(t.date)} · {timeStrToClock(t.time)}–{minsToClock(timeToMins(t.time) + (Number(t.duration) || 0))}</span>}
            {!isWindow(t) && t.scheduleMode === "DEFINE" && t.date && <span className="text-[11px] text-black/45 tabular">· {t.date === today ? "Today" : fmtDate(t.date)}{t.time ? ` · ${timeStrToClock(t.time)}` : ""}</span>}
            {isRepeating(t) && <Chip tone="outline"><Repeat size={10} />{describeRepeat(t.repeat)}</Chip>}
            {t.delegatedTo && <Chip tone="outline"><UserPlus size={10} />with {t.delegatedTo}</Chip>}
            {(invitesByTask[t.id] || []).map(s => (
              <Chip key={s.id} tone={s.status === "approved" ? "smallbatch" : s.status === "dismissed" ? "warn" : "outline"}>
                <UserPlus size={10} />{s.ownerName || s.owner} · {s.status === "approved" ? "accepted" : s.status === "dismissed" ? "sent back" : "invited"}
              </Chip>
            ))}
          </div>
          {(note || t.notes) && (
            <div className="mt-2 pl-0.5 space-y-0.5">
              {note && (
                <p className="text-xs text-black/50 flex items-start gap-1.5">
                  <MessageSquare size={11} className="mt-0.5 shrink-0 text-black/30" />
                  <span className="min-w-0 truncate"><span className="font-medium text-black/60">{fmtDate(note.date)} · {note.outcome}</span>{note.text ? ` — ${note.text}` : ""}</span>
                </p>
              )}
              {t.notes && <p className="text-xs text-black/45 truncate pl-[17px]">{t.notes}</p>}
            </div>
          )}
        </div>
        {!isWindow(t) && (
          <button onClick={() => setInviting(t)} title="Executive Interaction — invite someone to join you for this task" aria-label={`Invite someone to “${t.title}”`}
            className="shrink-0 min-h-9 text-[11px] font-semibold flex items-center gap-1 px-2.5 rounded-lg border border-black/10 hover:bg-black/[0.03]" style={{ color: ACCENT }}>
            <UserPlus size={12} /> Invite
          </button>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      {/* The day at a glance, and the two things to do from here. */}
      <Card className="p-5 sm:p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FFFFFF 0%, #F4F0E7 100%)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">{fmtDate(today)}</p>
        <h2 className="font-serif text-2xl mt-1" style={{ color: INK }}>{greeting()}{me.name ? `, ${titleCase(me.name.split(" ")[0])}` : ""}</h2>
        <p className="text-sm text-black/55 mt-1.5">
          {active.length} open task{active.length === 1 ? "" : "s"}
          {overdueCount > 0 && <span className="font-semibold" style={{ color: ALERT }}> · {overdueCount} overdue</span>}
          {" · "}{todayCount} for today · {todayPlan ? (todayPlan.concluded ? "today is concluded" : "today is planned") : "today is not planned yet"}
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          {todayPlan
            ? <PrimaryButton onClick={onOpenToday}><Sun size={15} /> Open today's plan</PrimaryButton>
            : <PrimaryButton onClick={onPlanToday}><Sparkles size={15} /> Plan today</PrimaryButton>}
          <GhostButton onClick={openNew}><Plus size={15} /> Add task</GhostButton>
          <GhostButton onClick={openWindow}><Clock size={14} /> No-Schedule Window</GhostButton>
        </div>
      </Card>

      <div role="tablist" aria-label="Board sections" className="flex gap-1 border-b border-black/[0.06] overflow-x-auto">
        {[["list", "Board"], ["matrix", "Matrix"], ["bulk", "Bulk Add"], ["submissions", `Submissions${pendingCount ? ` (${pendingCount})` : ""}`]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={subTab === id} onClick={() => setSubTab(id)}
            className="px-3 min-h-11 text-sm font-medium -mb-px border-b-2 whitespace-nowrap"
            style={{ borderColor: subTab === id ? ACCENT : "transparent", color: subTab === id ? INK : "rgba(0,0,0,0.4)" }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === "matrix" && <EisenhowerMatrix tasks={tasks} />}
      {subTab === "bulk" && <BulkAdd addTasksBulk={addTasksBulk} />}
      {subTab === "submissions" && <Submissions me={me} directory={directory} submissions={submissions} actions={submissionActions} />}

      {subTab === "list" && (
      <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks"
            placeholder="Search tasks — title, unit, activity, notes…"
            className="w-full bg-white border border-black/10 rounded-xl pl-9 pr-10 py-2.5 text-sm outline-none focus:border-black/30" />
          {searching && (
            <button onClick={() => setQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-full text-black/35 hover:text-black/60" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <GhostButton onClick={() => setFiltersOpen(o => !o)} className="sm:hidden px-3" title="Show or hide filters">
          <SlidersHorizontal size={14} /> {filterCount ? `Filters · ${filterCount}` : "Filters"}
        </GhostButton>
      </div>

      <div className={`${filtersOpen ? "" : "hidden"} sm:block space-y-3`}>
      <div className="flex gap-2 items-start">
        <span className="shrink-0 w-[68px] text-[10px] font-semibold text-black/40 uppercase tracking-wide pt-2">Unit</span>
        <div className="flex gap-1.5 flex-wrap items-center">
          <button onClick={() => setUnitFilter([])} className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border" style={chipStyle(unitFilter.length === 0)}>All</button>
          {units.map(u => (
            <button key={u} onClick={() => toggleUnit(u)} aria-pressed={unitFilter.includes(u)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border" style={chipStyle(unitFilter.includes(u))}>
              {u}
            </button>
          ))}
          <button onClick={() => setUnitsModalOpen(true)} title="Add or remove units"
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-black/20 text-black/50 hover:bg-black/[0.03] flex items-center gap-1">
            <Pencil size={11} /> Edit
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 items-center">
        <span className="shrink-0 w-[68px] text-[10px] font-semibold text-black/40 uppercase tracking-wide">Work Type</span>
        {["All", ...CATEGORY_IDS].map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border" style={chipStyle(categoryFilter === c)}>
            {c === "All" ? "All" : categoryLabel(c)}
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="shrink-0 w-[68px] text-[10px] font-semibold text-black/40 uppercase tracking-wide">Activity</span>
        <select value={activity} onChange={(e) => setActivityFilter(e.target.value)} aria-label="Activity"
          className="bg-white border border-black/10 rounded-full px-3 py-1.5 text-xs font-medium outline-none"
          style={activity !== "All" ? { borderColor: INK, background: INK, color: "white" } : { color: "rgba(0,0,0,0.6)" }}>
          <option value="All">All activities</option>
          {activityChoices.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filtering || searching) && (
          <>
            <span className="text-xs text-black/45">{visible.length} of {active.length} open shown</span>
            <button onClick={clearFilters} className="text-xs font-semibold flex items-center gap-1 min-h-9" style={{ color: ACCENT }}>
              <X size={12} /> Clear filters
            </button>
          </>
        )}
      </div>
      </div>

      {visible.length === 0 && (
        searching || filtering
          ? <EmptyState icon={Search} title={searching ? `No open tasks match “${query.trim()}”${filtering ? " with these filters" : ""}.` : "No open tasks match these filters."}
              action={<GhostButton onClick={clearFilters}><X size={14} /> Clear filters</GhostButton>} />
          : <EmptyState icon={ClipboardList} title="Your board is empty." hint="Add the things that need to happen — one at a time, or many at once under Bulk Add. Plan My Day builds each day from what is here."
              action={<PrimaryButton onClick={openNew}><Plus size={16} /> Add your first task</PrimaryButton>} />
      )}
      {groups.map(g => {
        const Icon = g.icon;
        return (
          <section key={g.key} className="space-y-2" aria-label={g.title}>
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide pt-1" style={{ color: g.color }}>
              <Icon size={12} /> {g.title} <span className="font-normal text-black/35">· {g.items.length}</span>
            </h3>
            {g.items.map(renderTask)}
          </section>
        );
      })}

      {(done.length > 0 || searching) && (
        <details className="mt-6" open={searching ? true : undefined}>
          <summary className="text-xs font-semibold text-black/40 uppercase tracking-wide cursor-pointer min-h-9 flex items-center">
            Completed / History ({searching ? `${done.length} match${done.length === 1 ? "" : "es"}` : done.length})
          </summary>
          <div className="space-y-1.5 mt-2">
            {done.length === 0 && <p className="px-4 py-2 text-sm text-black/35">No completed tasks match.</p>}
            {done.map(t => (
              <div key={t.id} className="px-4 py-2 text-sm text-black/35 flex items-center gap-2 rounded-lg hover:bg-black/[0.02] group">
                <CheckCircle2 size={14} className="shrink-0" />
                <button onClick={() => openEditor(t)} className="line-through flex-1 min-w-0 text-left truncate min-h-9" title="Open task">{t.title}</button>
                {t.completedAt && <span className="text-[11px] text-black/30 whitespace-nowrap tabular">{fmtDate(toLocalISO(new Date(t.completedAt)))}</span>}
                <button onClick={() => reopenTask(t.id)} title="Take this task back to the board"
                  className="min-h-9 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap px-2.5 rounded-lg border border-black/10 hover:bg-white" style={{ color: ACCENT }}>
                  <RotateCcw size={11} /> Restore
                </button>
                <button onClick={() => confirmDelete(t)} title="Delete for good" aria-label={`Delete “${t.title}” for good`} className="w-9 h-9 inline-flex items-center justify-center rounded-full text-black/25 hover:text-black/60 hover:bg-black/[0.04]"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Add task is always one thumb away on a phone. */}
      <button onClick={openNew} aria-label="Add task" title="Add task"
        className="sm:hidden fixed right-4 z-30 w-14 h-14 rounded-full text-white shadow-[0_6px_18px_rgba(0,0,0,0.22)] flex items-center justify-center no-print"
        style={{ background: INK, bottom: "calc(72px + env(safe-area-inset-bottom))" }}>
        <Plus size={24} />
      </button>
      </>
      )}

      <TaskModal open={modalOpen} onClose={() => { setModalOpen(false); setPreset(null); }} initial={editing || preset} tasks={tasks}
        onSave={(f) => editing ? updateTask(editing.id, f) : addTask(f)}
        onDelete={editing ? deleteTask : undefined}
        onReopen={editing?.status === "done" ? () => { reopenTask(editing.id); setModalOpen(false); } : undefined} />
      <InviteModal task={inviting} directory={directory} invites={inviting ? invitesByTask[inviting.id] || [] : []}
        onClose={() => setInviting(null)} onSend={sendInvite} />
      <ManageUnitsModal open={unitsModalOpen} onClose={() => setUnitsModalOpen(false)} tasks={tasks}
        onUnitRemoved={(u) => setUnitFilter(prev => prev.filter(x => x !== u))} />
    </div>
  );
}
