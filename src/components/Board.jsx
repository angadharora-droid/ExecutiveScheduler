import React, { useState } from "react";
import { Plus, Clock, Star, Circle, CheckCircle2, Pencil, Search, X, RotateCcw, AlertCircle, MessageSquare, Repeat, UserPlus, Trash2 } from "lucide-react";
import { categoryChipTone, CATEGORY_IDS, ACCENT, ACCENT_WARM, ALERT, INK } from "../constants.js";
import { todayISO, toLocalISO, fmtDate, timeStrToClock, overdueSince, taskMatchesQuery } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { isRepeating, describeRepeat } from "../repeat.js";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";
import PersonalBlockModal from "./PersonalBlockModal.jsx";
import BulkAdd from "./BulkAdd.jsx";
import Submissions from "./Submissions.jsx";
import ManageUnitsModal from "./ManageUnitsModal.jsx";
import InviteModal from "./InviteModal.jsx";

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

export default function Board({ tasks, addTask, addTasksBulk, updateTask, completeTask, reopenTask, deleteTask, personalBlocks, addPersonalBlock, updatePersonalBlock, removePersonalBlock, me, directory, submissions, submissionActions, sendInvite }) {
  const { units } = useUnits();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [inviting, setInviting] = useState(null); // the task an Executive Interaction invite is being written for
  const { categoryLabel, activityOptions } = useWorkTypes();
  // Units are a multi-select: none chosen means all.
  const [unitFilter, setUnitFilter] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [activityFilter, setActivityFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [pbModalOpen, setPbModalOpen] = useState(false);
  const [pbEditing, setPbEditing] = useState(null); // the No-Schedule Window being edited, if any
  const [unitsModalOpen, setUnitsModalOpen] = useState(false);
  const [subTab, setSubTab] = useState("list");
  const upcomingPersonal = personalBlocks.filter(p => p.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).slice(0, 6);
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
    .sort(boardOrder)
    .map(({ t }) => t);
  const overdueCount = active.filter(t => overdueSince(t)).length;
  const doneAll = tasks.filter(t => t.status === "done").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  // A search looks through the whole history; otherwise only the most recent completions are
  // listed. The Unit / Work Type / Activity filters narrow the history the same way as the board.
  const doneMatching = doneAll.filter(matchesFilters);
  const done = searching ? doneMatching : doneMatching.slice(0, 30);

  const openEditor = (t) => { setEditing(t); setModalOpen(true); };
  const confirmDelete = (t) => { if (window.confirm(`Delete “${t.title}” for good? This can't be undone.`)) deleteTask(t.id); };
  const chipStyle = (on) => ({ borderColor: on ? INK : "rgba(0,0,0,0.1)", background: on ? INK : "white", color: on ? "white" : "rgba(0,0,0,0.6)" });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-2xl" style={{ color: INK }}>To-Do Board</h2>
          <p className="text-sm text-black/45 mt-0.5">
            {active.length} open · master task repository
            {overdueCount > 0 && <span className="font-semibold" style={{ color: ALERT }}> · {overdueCount} overdue</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={() => { setPbEditing(null); setPbModalOpen(true); }}><Clock size={14} /> No-Schedule Window</GhostButton>
          <PrimaryButton onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={16} /> Add Task</PrimaryButton>
        </div>
      </div>

      <div className="flex gap-1 border-b border-black/[0.06]">
        {[["list", "Board"], ["bulk", "Bulk Add"], ["submissions", `Submissions${pendingCount ? ` (${pendingCount})` : ""}`]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className="px-3 py-2 text-sm font-medium -mb-px border-b-2"
            style={{ borderColor: subTab === id ? ACCENT : "transparent", color: subTab === id ? INK : "rgba(0,0,0,0.4)" }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === "bulk" && <BulkAdd addTasksBulk={addTasksBulk} />}
      {subTab === "submissions" && <Submissions me={me} directory={directory} submissions={submissions} actions={submissionActions} />}

      {subTab === "list" && (
      <>
      {upcomingPersonal.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {upcomingPersonal.map(p => (
            <button key={p.id} onClick={() => { setPbEditing(p); setPbModalOpen(true); }} title="Edit or remove this window" className="shrink-0">
              <Chip tone="outline" className="whitespace-nowrap hover:bg-black/[0.03]"><Clock size={10} /> {fmtDate(p.date)} · {p.title} · {timeStrToClock(p.startTime)}–{timeStrToClock(p.endTime)} <Pencil size={9} className="text-black/30" /></Chip>
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 pointer-events-none" />
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks — title, unit, activity, notes, conclude comments…"
          className="w-full bg-white border border-black/10 rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:border-black/30" />
        {searching && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/35 hover:text-black/60" title="Clear search">
            <X size={14} />
          </button>
        )}
      </div>

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
        <select value={activity} onChange={(e) => setActivityFilter(e.target.value)}
          className="bg-white border border-black/10 rounded-full px-3 py-1.5 text-xs font-medium outline-none"
          style={activity !== "All" ? { borderColor: INK, background: INK, color: "white" } : { color: "rgba(0,0,0,0.6)" }}>
          <option value="All">All activities</option>
          {activityChoices.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {(filtering || searching) && (
          <>
            <span className="text-xs text-black/45">{visible.length} of {active.length} open shown</span>
            <button onClick={clearFilters} className="text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
              <X size={12} /> Clear filters
            </button>
          </>
        )}
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <Card className="p-8 text-center text-black/40 text-sm">
            {searching ? `No open tasks match “${query.trim()}”${filtering ? " with these filters" : ""}.`
              : filtering ? "No open tasks match these filters."
              : "Nothing here. Add a task to get started."}
          </Card>
        )}
        {visible.map(t => {
          const od = overdueSince(t);
          const note = lastNote(t);
          return (
            <Card key={t.id} className="p-4 flex items-start gap-3" style={od ? { boxShadow: `0 0 0 1.5px ${ALERT}40` } : {}}>
              <button onClick={() => completeTask(t.id)} className="mt-0.5 shrink-0" title="Mark complete">
                <Circle size={20} className="text-black/25 hover:text-black/50" />
              </button>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditor(t)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: INK }}>{t.title}</span>
                  {t.nonNegotiable && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
                  {od && <Chip tone="warn"><AlertCircle size={10} /> Overdue · since {fmtDate(od)}</Chip>}
                  {!od && isDoFirst(t) && <Chip tone="outline">Do First</Chip>}
                  {!od && t.carryForwardCount > 1 && <Chip tone="warn">Attention</Chip>}
                  {!od && t.carryForwardCount === 1 && <Chip tone="outline">Carried forward</Chip>}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Chip>{t.unit}</Chip>
                  <Chip tone={categoryChipTone(t.category)}>{t.workType}</Chip>
                  {t.priority && <Chip tone="outline">{t.priority} priority</Chip>}
                  {t.importance && <Chip tone="outline">{t.importance} importance</Chip>}
                  <Chip tone="outline"><Clock size={10} />{t.duration}m</Chip>
                  {t.scheduleMode === "DEFINE" && t.date && <Chip tone="outline"><Clock size={10} />{fmtDate(t.date)}{t.time ? ` · ${timeStrToClock(t.time)}` : ""}</Chip>}
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
              <button onClick={() => setInviting(t)} title="Executive Interaction — invite someone to join you for this task"
                className="shrink-0 text-[11px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md border border-black/10 hover:bg-black/[0.03]" style={{ color: ACCENT }}>
                <UserPlus size={12} /> Invite
              </button>
            </Card>
          );
        })}
      </div>

      {(done.length > 0 || searching) && (
        <details className="mt-6" open={searching ? true : undefined}>
          <summary className="text-xs font-semibold text-black/40 uppercase tracking-wide cursor-pointer">
            Completed / History ({searching ? `${done.length} match${done.length === 1 ? "" : "es"}` : done.length})
          </summary>
          <div className="space-y-1.5 mt-2">
            {done.length === 0 && <p className="px-4 py-2 text-sm text-black/35">No completed tasks match.</p>}
            {done.map(t => (
              <div key={t.id} className="px-4 py-2 text-sm text-black/35 flex items-center gap-2 rounded-lg hover:bg-black/[0.02] group">
                <CheckCircle2 size={14} className="shrink-0" />
                <button onClick={() => openEditor(t)} className="line-through flex-1 min-w-0 text-left truncate" title="Open task">{t.title}</button>
                {t.completedAt && <span className="text-[11px] text-black/30 whitespace-nowrap">{fmtDate(toLocalISO(new Date(t.completedAt)))}</span>}
                <button onClick={() => reopenTask(t.id)} title="Take this task back to the board"
                  className="text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded-md border border-black/10 hover:bg-white" style={{ color: ACCENT }}>
                  <RotateCcw size={11} /> Restore
                </button>
                <button onClick={() => confirmDelete(t)} title="Delete for good" className="text-black/25 hover:text-black/60 px-1"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </details>
      )}
      </>
      )}

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} tasks={tasks}
        onSave={(f) => editing ? updateTask(editing.id, f) : addTask(f)}
        onDelete={editing ? deleteTask : undefined}
        onReopen={editing?.status === "done" ? () => { reopenTask(editing.id); setModalOpen(false); } : undefined} />
      <InviteModal task={inviting} directory={directory} invites={inviting ? invitesByTask[inviting.id] || [] : []}
        onClose={() => setInviting(null)} onSend={sendInvite} />
      <PersonalBlockModal open={pbModalOpen} initial={pbEditing} onClose={() => { setPbModalOpen(false); setPbEditing(null); }}
        onSave={(b) => (pbEditing ? updatePersonalBlock(b.id, b) : addPersonalBlock(b))} onDelete={removePersonalBlock} />
      <ManageUnitsModal open={unitsModalOpen} onClose={() => setUnitsModalOpen(false)} tasks={tasks}
        onUnitRemoved={(u) => setUnitFilter(prev => prev.filter(x => x !== u))} />
    </div>
  );
}
