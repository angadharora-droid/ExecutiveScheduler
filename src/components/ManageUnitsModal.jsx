import React, { useState } from "react";
import { X, Plus } from "lucide-react";
import { INK, ALERT } from "../constants.js";
import { useUnits } from "../UnitsContext.jsx";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";

export default function ManageUnitsModal({ open, onClose, tasks, onUnitRemoved }) {
  const { units, addUnit, removeUnit } = useUnits();
  const [newUnit, setNewUnit] = useState("");
  if (!open) return null;

  const openCountFor = (u) => tasks.filter(t => t.status !== "done" && t.unit === u).length;

  const submitNew = () => {
    const clean = newUnit.trim();
    if (!clean) return;
    addUnit(clean);
    setNewUnit("");
  };

  const handleRemove = (u) => {
    const count = openCountFor(u);
    const msg = count
      ? `Remove unit "${u}"? ${count} open task${count > 1 ? "s" : ""} will keep this label but it won't appear in dropdowns or filters anymore.`
      : `Remove unit "${u}"?`;
    if (!window.confirm(msg)) return;
    removeUnit(u);
    onUnitRemoved?.(u);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg" style={{ color: INK }}>Manage Units</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <input placeholder="New unit name (e.g. Bakery)" value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
              className="flex-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30" />
            <PrimaryButton disabled={!newUnit.trim()} onClick={submitNew}><Plus size={14} /> Add</PrimaryButton>
          </div>
          <div className="space-y-1.5">
            {units.map(u => {
              const count = openCountFor(u);
              return (
                <div key={u} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/10">
                  <span className="text-sm flex-1" style={{ color: INK }}>{u}</span>
                  {count > 0 && <span className="text-[11px] text-black/35">{count} open task{count > 1 ? "s" : ""}</span>}
                  <button onClick={() => handleRemove(u)} disabled={units.length <= 1}
                    title={units.length <= 1 ? "At least one unit is required" : `Remove ${u}`}
                    className="disabled:opacity-30">
                    <X size={14} style={{ color: ALERT }} />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-black/40">This list is yours — each account customizes its own units. Removing a unit doesn't touch existing tasks — they keep their label.</p>
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-end sticky bottom-0 bg-white">
          <GhostButton onClick={onClose}>Done</GhostButton>
        </div>
      </Card>
    </div>
  );
}
