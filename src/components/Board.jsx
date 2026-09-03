import React, { useState } from "react";
import { Plus, Clock, Star, Circle, CheckCircle2, Pencil } from "lucide-react";
import { categoryChipTone, ACCENT, ACCENT_WARM, INK } from "../constants.js";
import { todayISO, fmtDate, timeStrToClock } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import TaskModal from "./TaskModal.jsx";
import PersonalBlockModal from "./PersonalBlockModal.jsx";
import BulkAdd from "./BulkAdd.jsx";
import Submissions from "./Submissions.jsx";
import ManageUnitsModal from "./ManageUnitsModal.jsx";

export default function Board({ tasks, addTask, addTasksBulk, updateTask, completeTask, personalBlocks, addPersonalBlock, submissions, addSubmission, approveSubmission, dismissSubmission }) {
  const { units } = useUnits();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [unitFilter, setUnitFilter] = useState("All");
  const [pbModalOpen, setPbModalOpen] = useState(false);
  const [unitsModalOpen, setUnitsModalOpen] = useState(false);
  const [subTab, setSubTab] = useState("list");
  const upcomingPersonal = personalBlocks.filter(p => p.date >= todayISO()).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 6);
  const pendingCount = submissions.filter(s => s.status === "pending").length;

  const active = tasks.filter(t => t.status !== "done");
  const done = tasks.filter(t => t.status === "done").sort((a,b) => (b.completedAt||0) - (a.completedAt||0)).slice(0, 30);
  const visible = unitFilter === "All" ? active : active.filter(t => t.unit === unitFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-2xl" style={{ color: INK }}>To-Do Board</h2>
          <p className="text-sm text-black/45 mt-0.5">{active.length} open · master task repository</p>
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
      {subTab === "submissions" && <Submissions submissions={submissions} addSubmission={addSubmission} approveSubmission={approveSubmission} dismissSubmission={dismissSubmission} />}

      {subTab === "list" && (
      <>
      {upcomingPersonal.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {upcomingPersonal.map(p => (
            <Chip key={p.id} tone="outline" className="whitespace-nowrap">{fmtDate(p.date)} · {p.title} · {p.startTime}–{p.endTime}</Chip>
          ))}
        </div>
      )}

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
          <Card className="p-8 text-center text-black/40 text-sm">Nothing here. Add a task to get started.</Card>
        )}
        {visible.map(t => (
          <Card key={t.id} className="p-4 flex items-start gap-3">
            <button onClick={() => completeTask(t.id)} className="mt-0.5 shrink-0">
              <Circle size={20} className="text-black/25 hover:text-black/50" />
            </button>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setEditing(t); setModalOpen(true); }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium" style={{ color: INK }}>{t.title}</span>
                {t.nonNegotiable && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
                {t.carryForwardCount > 1 && <Chip tone="warn">Attention</Chip>}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <Chip>{t.unit}</Chip>
                <Chip tone={categoryChipTone(t.category)}>{t.workType}</Chip>
                <Chip tone="outline">{t.priority} priority</Chip>
                <Chip tone="outline">{t.importance} importance</Chip>
                <Chip tone="outline"><Clock size={10} />{t.duration}m</Chip>
                {t.scheduleMode === "DEFINE" && t.date && <Chip tone="outline"><Clock size={10} />{fmtDate(t.date)}{t.time ? ` · ${timeStrToClock(t.time)}` : ""}</Chip>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="text-xs font-semibold text-black/40 uppercase tracking-wide cursor-pointer">Completed / History ({done.length})</summary>
          <div className="space-y-1.5 mt-2">
            {done.map(t => (
              <div key={t.id} className="px-4 py-2 text-sm text-black/35 line-through flex items-center gap-2">
                <CheckCircle2 size={14} /> {t.title}
              </div>
            ))}
          </div>
        </details>
      )}
      </>
      )}

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing} tasks={tasks}
        onSave={(f) => editing ? updateTask(editing.id, f) : addTask(f)} />
      <PersonalBlockModal open={pbModalOpen} onClose={() => setPbModalOpen(false)} onSave={addPersonalBlock} />
      <ManageUnitsModal open={unitsModalOpen} onClose={() => setUnitsModalOpen(false)} tasks={tasks}
        onUnitRemoved={(u) => { if (unitFilter === u) setUnitFilter("All"); }} />
    </div>
  );
}
