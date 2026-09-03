import React, { useState, useEffect } from "react";
import { X, Plus, RotateCcw } from "lucide-react";
import { CATEGORY_IDS, DEFAULT_WORK_TYPES, categoryChipTone, INK, ALERT } from "../constants.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";

function CategoryEditor({ cat, tasks }) {
  const { workTypes, renameCategory, addActivity, removeActivity } = useWorkTypes();
  const wt = workTypes[cat] || DEFAULT_WORK_TYPES[cat];
  const [labelDraft, setLabelDraft] = useState(wt.label);
  const [newActivity, setNewActivity] = useState("");
  useEffect(() => { setLabelDraft(wt.label); }, [wt.label]);

  const commitLabel = () => {
    const clean = labelDraft.trim();
    if (!clean) { setLabelDraft(wt.label); return; }
    if (clean !== wt.label) renameCategory(cat, clean);
  };
  const openCountFor = (a) => tasks.filter(t => t.status !== "done" && t.category === cat && t.workType === a).length;
  const submitNew = () => {
    const clean = newActivity.trim();
    if (!clean) return;
    addActivity(cat, clean);
    setNewActivity("");
  };
  const handleRemove = (a) => {
    const count = openCountFor(a);
    const msg = count
      ? `Remove activity "${a}"? ${count} open task${count > 1 ? "s" : ""} will keep this label but it won't appear in dropdowns anymore.`
      : `Remove activity "${a}"?`;
    if (!window.confirm(msg)) return;
    removeActivity(cat, a);
  };

  return (
    <div className="rounded-xl border border-black/10 p-3.5 space-y-3">
      <div>
        <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">Work type name</label>
        <div className="flex items-center gap-2 mt-1">
          <Chip tone={categoryChipTone(cat)} className="shrink-0">{DEFAULT_WORK_TYPES[cat].label}</Chip>
          <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="flex-1 border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-black/30" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-black/40 uppercase tracking-wide">Activities</label>
        <div className="space-y-1.5 mt-1">
          {wt.activities.map(a => {
            const count = openCountFor(a);
            const last = wt.activities.length <= 1;
            return (
              <div key={a} className="flex items-center gap-2 p-2 rounded-lg border border-black/10">
                <span className="text-sm flex-1" style={{ color: INK }}>{a}</span>
                {count > 0 && <span className="text-[11px] text-black/35">{count} open</span>}
                <button onClick={() => handleRemove(a)} disabled={last}
                  title={last ? "At least one activity is required" : `Remove ${a}`} className="disabled:opacity-30">
                  <X size={14} style={{ color: ALERT }} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <input placeholder="New activity (e.g. Site visit)" value={newActivity}
            onChange={(e) => setNewActivity(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
            className="flex-1 border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-black/30" />
          <PrimaryButton disabled={!newActivity.trim()} onClick={submitNew} className="py-1.5 px-3"><Plus size={14} /> Add</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// zClass lets this sit above another modal (e.g. opened from inside the Task modal).
export default function ManageWorkTypesModal({ open, onClose, tasks = [], zClass = "z-50" }) {
  const { resetWorkTypes } = useWorkTypes();
  if (!open) return null;

  const handleReset = () => {
    if (!window.confirm("Reset work type names and activity lists to the built-in defaults? Existing tasks keep their labels.")) return;
    resetWorkTypes();
  };

  return (
    <div className={`fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center ${zClass} p-0 sm:p-4`}>
      <Card className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg" style={{ color: INK }}>Work Types & Activities</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-black/45">
            The three work types drive the day's schedule blocks (Small Batch, Focus Work, Delegation), so they can be renamed but not added or removed. The activities under each are entirely yours to shape.
          </p>
          {CATEGORY_IDS.map(cat => <CategoryEditor key={cat} cat={cat} tasks={tasks} />)}
          <p className="text-xs text-black/40">These lists are yours — each account customizes its own. Removing an activity doesn't touch existing tasks; they keep their label.</p>
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-between sticky bottom-0 bg-white">
          <GhostButton onClick={handleReset}><RotateCcw size={13} /> Reset to defaults</GhostButton>
          <GhostButton onClick={onClose}>Done</GhostButton>
        </div>
      </Card>
    </div>
  );
}
