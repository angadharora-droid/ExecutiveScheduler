import React, { useState } from "react";
import { Plus, Clock, Star, Circle, CheckCircle2, Pencil, Search, X, RotateCcw, AlertCircle, MessageSquare } from "lucide-react";
import { categoryChipTone, ACCENT, ACCENT_WARM, ALERT, INK } from "../constants.js";
import { todayISO, toLocalISO, fmtDate, timeStrToClock, overdueSince, taskMatchesQuery } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";
import PersonalBlockModal from "./PersonalBlockModal.jsx";
import BulkAdd from "./BulkAdd.jsx";
import Submissions from "./Submissions.jsx";
import ManageUnitsModal from "./ManageUnitsModal.jsx";

// Latest Conclude Day comment on a task, for the one-line preview under it.
const lastNote = (t) => {
  const s = (t.sessions || []).slice(-1)[0];
  if (!s) return null;
  const text = s.discussion || s.nextAction;
  return text ? { date: s.date, outcome: s.outcome, text } : { date: s.date, outcome: s.outcome, text: "" };
};

export default function Board({ tasks, addTask, addTasksBulk, updateTask, completeTask, reopenTask, personalBlocks, addPersonalBlock, submissions, addSubmission, approveSubmission, dismissSubmission, refreshSubmissions }) {
  const { units } = useUnits();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [unitFilter, setUnitFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [pbModalOpen, setPbModalOpen] = useState(false);
  const [unitsModalOpen, setUnitsModalOpen] = useState(false);
  const [subTab, setSubTab] = useState("list");
  const upcomingPersonal = personalBlocks.filter(p => p.date >= todayISO()).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 6);
  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const searching = query.trim().length > 0;

  const active = tasks.filter(t => t.status !== "done");
  // Overdue tasks float to the top so they prompt for attention; the rest keep board order.
  const visible = active
    .filter(t => unitFilter === "All" || t.unit === unitFilter)
    .filter(t => taskMatchesQuery(t, query))
    .map((t, i) => ({ t, i, od: overdueSince(t) }))
    .sort((a, b) => (a.od && !b.od ? -1 : !a.od && b.od ? 1 : a.od && b.od ? a.od.localeCompare(b.od) : a.i - b.i))
    .map(({ t }) => t);
  const overdueCount = active.filter(t => overdueSince(t)).length;
  const doneAll = tasks.filter(t => t.status === "done").sort((a,b) => (b.completedAt||0) - (a.completedAt||0));
  // A search looks through the whole history; otherwise only the most recent completions are listed.
  const done = searching ? doneAll.filter(t => taskMatchesQuery(t, query)) : doneAll.slice(0, 30);

  const openEditor = (t) => { setEditing(t); setModalOpen(true); };

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
          <GhostButton onClick={() => setPbModalOpen(true)}><Clock size={14} /> No-Schedule Window</GhostButton>
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
      {subTab === "submissions" && <Submissions submissions={submissions} addSubmission={addSubmission} approveSubmission={approveSubmission} dismissSubmission={dismissSubmission} refreshSubmissions={refreshSubmissions} />}

      {subTab === "list" && (
      <>
      {upcomingPersonal.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {upcomingPersonal.map(p => (
            <Chip key={p.id} tone="outline" className="whitespace-nowrap">{fmtDate(p.date)} · {p.title} · {p.startTime}–{p.endTime}</Chip>
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

      <div className="flex gap-2 overflow-x-auto pb-1 items-center">
        {["All", ...units].map(u => (
          <button key={u} onClick={() => setUnitFilter(u)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border"
            style={{ borderColor: unitFilter === u ? INK : "rgba(0,0,0,0.1)", background: unitFilter === u ? INK : "white", color: unitFilter === u ? "white" : "rgba(0,0,0,0.6)" }}>
            {u}
          </button>
        ))}
        <button onClick={() => setUnitsModalOpen(true)} title="Add or remove units"
          className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-black/20 text-black/50 hover:bg-black/[0.03] flex items-center gap-1">
          <Pencil size={11} /> Edit
        </button>
      </div>

      <div className="space-y-2">
        {visible.length === 0 && (
          <Card className="p-8 text-center text-black/40 text-sm">
            {searching ? `No open tasks match “${query.trim()}”.` : "Nothing here. Add a task to get started."}
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
                  {!od && t.carryForwardCount > 1 && <Chip tone="warn">Attention</Chip>}
                  {!od && t.carryForwardCount === 1 && <Chip tone="outline">Carried forward</Chip>}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Chip>{t.unit}</Chip>
                  <Chip tone={categoryChipTone(t.category)}>{t.workType}</Chip>
                  <Chip tone="outline">{t.priority} priority</Chip>
                  <Chip tone="outline">{t.importance} importance</Chip>
                  <Chip tone="outline"><Clock size={10} />{t.duration}m</Chip>
                  {t.scheduleMode === "DEFINE" && t.date && <Chip tone="outline"><Clock size={10} />{fmtDate(t.date)}{t.time ? ` · ${timeStrToClock(t.time)}` : ""}</Chip>}
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
              </div>
            ))}
          </div>
        </details>
      )}
      </>
      )}

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} tasks={tasks}
        onSave={(f) => editing ? updateTask(editing.id, f) : addTask(f)}
        onReopen={editing?.status === "done" ? () => { reopenTask(editing.id); setModalOpen(false); } : undefined} />
      <PersonalBlockModal open={pbModalOpen} onClose={() => setPbModalOpen(false)} onSave={addPersonalBlock} />
      <ManageUnitsModal open={unitsModalOpen} onClose={() => setUnitsModalOpen(false)} tasks={tasks}
        onUnitRemoved={(u) => { if (unitFilter === u) setUnitFilter("All"); }} />
    </div>
  );
}
