import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { CATEGORY_IDS, CATEGORY_DEFAULT_DURATION, LEVELS, MIN_TASK_MINUTES, INK, ALERT } from "../constants.js";
import { uid } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";
import MinutesInput from "./MinutesInput.jsx";

// Priority and Importance start blank on every row: a row is only imported once both are set.
const emptyRow = (unit, workType) => ({
  id: uid(), title: "", unit, category: "smallBatch", workType,
  priority: "", importance: "", duration: 15, scheduleMode: "AUTO", date: "", time: "",
});

export default function BulkAdd({ addTasksBulk }) {
  const { units } = useUnits();
  const { categoryLabel, activityOptions } = useWorkTypes();
  const newRow = () => emptyRow(units[0], activityOptions("smallBatch")[0]);
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, newRow));
  const [done, setDone] = useState(0);

  const setCell = (id, field, value) => setRows(prev => prev.map(r => {
    if (r.id !== id) return r;
    if (field === "category") return { ...r, category: value, workType: activityOptions(value)[0], duration: CATEGORY_DEFAULT_DURATION[value] };
    return { ...r, [field]: value };
  }));
  const addRow = () => setRows(prev => [...prev, newRow()]);
  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));

  const titled = rows.filter(r => r.title.trim());
  const ready = (r) => LEVELS.includes(r.priority) && LEVELS.includes(r.importance);
  const filled = titled.filter(ready);
  const incomplete = titled.length - filled.length;

  const importAll = () => {
    const forms = filled.map(({ id, ...form }) => ({ ...form, duration: Math.max(MIN_TASK_MINUTES, Number(form.duration) || MIN_TASK_MINUTES) }));
    addTasksBulk(forms);
    setDone(forms.length);
    setRows(prev => { const rest = prev.filter(r => r.title.trim() && !ready(r)); return rest.length ? rest : Array.from({ length: 5 }, newRow); });
  };

  const th = "text-[10px] font-semibold text-black/40 uppercase tracking-wide text-left px-2 py-2 whitespace-nowrap";
  const td = "p-1";
  const cellInput = "w-full border border-black/10 rounded px-1.5 py-1.5 text-xs outline-none min-w-[7rem]";
  const levelSelect = (r, name) => (
    <select value={r[name]} onChange={(e) => setCell(r.id, name, e.target.value)} className={cellInput + " min-w-[5.5rem]"}
      style={r[name] ? {} : { color: r.title.trim() ? ALERT : "rgba(0,0,0,0.4)" }}>
      <option value="">Choose…</option>
      {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-medium mb-3" style={{ color: INK }}>Bulk Add — spreadsheet view</p>
        <div className="overflow-x-auto -mx-1">
          <table className="border-collapse w-full">
            <thead>
              <tr className="border-b border-black/[0.08]">
                <th className={th}>Task</th>
                <th className={th}>Unit</th>
                <th className={th}>Work Type</th>
                <th className={th}>Activity</th>
                <th className={th}>Priority</th>
                <th className={th}>Importance</th>
                <th className={th}>Min</th>
                <th className={th}>Schedule</th>
                <th className={th}>Date</th>
                <th className={th}>Time</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                // An activity picked before its list changed stays selectable on this row.
                const acts = activityOptions(r.category);
                const actChoices = r.workType && !acts.includes(r.workType) ? [r.workType, ...acts] : acts;
                return (
                <tr key={r.id} className="border-b border-black/[0.04]">
                  <td className={td}><input value={r.title} onChange={(e) => setCell(r.id, "title", e.target.value)} placeholder="Task title" className={cellInput + " min-w-[12rem]"} /></td>
                  <td className={td}>
                    <select value={r.unit} onChange={(e) => setCell(r.id, "unit", e.target.value)} className={cellInput}>
                      {units.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <select value={r.category} onChange={(e) => setCell(r.id, "category", e.target.value)} className={cellInput}>
                      {CATEGORY_IDS.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <select value={r.workType} onChange={(e) => setCell(r.id, "workType", e.target.value)} className={cellInput}>
                      {actChoices.map(w => <option key={w}>{w}</option>)}
                    </select>
                  </td>
                  <td className={td}>{levelSelect(r, "priority")}</td>
                  <td className={td}>{levelSelect(r, "importance")}</td>
                  <td className={td}><MinutesInput value={r.duration} onChange={(v) => setCell(r.id, "duration", v)} className={cellInput + " min-w-[4rem]"} /></td>
                  <td className={td}>
                    <select value={r.scheduleMode} onChange={(e) => setCell(r.id, "scheduleMode", e.target.value)} className={cellInput}>
                      <option value="AUTO">Auto</option>
                      <option value="DEFINE">Define</option>
                    </select>
                  </td>
                  <td className={td}><input type="date" disabled={r.scheduleMode !== "DEFINE"} value={r.date} onChange={(e) => setCell(r.id, "date", e.target.value)} className={cellInput + " disabled:opacity-30 min-w-[8.5rem]"} /></td>
                  <td className={td}><input type="time" disabled={r.scheduleMode !== "DEFINE"} value={r.time} onChange={(e) => setCell(r.id, "time", e.target.value)} className={cellInput + " disabled:opacity-30 min-w-[6rem]"} /></td>
                  <td className={td}><button onClick={() => removeRow(r.id)}><X size={14} className="text-black/30" /></button></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
          <GhostButton onClick={addRow}><Plus size={14} /> Add Row</GhostButton>
          <div className="flex items-center gap-3">
            {incomplete > 0 && <span className="text-xs" style={{ color: ALERT }}>{incomplete} row{incomplete > 1 ? "s need" : " needs"} a Priority and an Importance</span>}
            <PrimaryButton disabled={filled.length === 0} onClick={importAll}><Plus size={15} /> Import {filled.length || ""} Task{filled.length === 1 ? "" : "s"}</PrimaryButton>
          </div>
        </div>
      </Card>
      {done > 0 && <p className="text-xs text-black/40">Imported {done} task{done === 1 ? "" : "s"} to the board.</p>}
    </div>
  );
}
