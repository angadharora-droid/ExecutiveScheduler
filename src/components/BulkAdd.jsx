import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { UNITS, SMALL_BATCH_TYPES, WORK_TYPE_OPTIONS, CATEGORY_DEFAULT_DURATION, INK } from "../constants.js";
import { uid } from "../utils.js";
import { Card, PrimaryButton, GhostButton } from "./ui.jsx";

const emptyRow = () => ({
  id: uid(), title: "", unit: UNITS[0], category: "smallBatch", workType: SMALL_BATCH_TYPES[0],
  priority: "High", importance: "High", duration: 15, scheduleMode: "AUTO", date: "", time: "",
});

export default function BulkAdd({ addTasksBulk }) {
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, emptyRow));
  const [done, setDone] = useState(0);

  const setCell = (id, field, value) => setRows(prev => prev.map(r => {
    if (r.id !== id) return r;
    if (field === "category") return { ...r, category: value, workType: WORK_TYPE_OPTIONS(value)[0], duration: CATEGORY_DEFAULT_DURATION[value] };
    return { ...r, [field]: value };
  }));
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));

  const filled = rows.filter(r => r.title.trim());

  const importAll = () => {
    const forms = filled.map(({ id, ...form }) => form);
    addTasksBulk(forms);
    setDone(forms.length);
    setRows(Array.from({ length: 5 }, emptyRow));
  };

  const th = "text-[10px] font-semibold text-black/40 uppercase tracking-wide text-left px-2 py-2 whitespace-nowrap";
  const td = "p-1";
  const cellInput = "w-full border border-black/10 rounded px-1.5 py-1.5 text-xs outline-none min-w-[7rem]";

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
              {rows.map(r => (
                <tr key={r.id} className="border-b border-black/[0.04]">
                  <td className={td}><input value={r.title} onChange={(e) => setCell(r.id, "title", e.target.value)} placeholder="Task title" className={cellInput + " min-w-[12rem]"} /></td>
                  <td className={td}>
                    <select value={r.unit} onChange={(e) => setCell(r.id, "unit", e.target.value)} className={cellInput}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <select value={r.category} onChange={(e) => setCell(r.id, "category", e.target.value)} className={cellInput}>
                      <option value="smallBatch">Small Batch</option>
                      <option value="focus">Focus Work</option>
                      <option value="delegation">Delegation</option>
                    </select>
                  </td>
                  <td className={td}>
                    <select value={r.workType} onChange={(e) => setCell(r.id, "workType", e.target.value)} className={cellInput}>
                      {WORK_TYPE_OPTIONS(r.category).map(w => <option key={w}>{w}</option>)}
                    </select>
                  </td>
                  <td className={td}>
                    <select value={r.priority} onChange={(e) => setCell(r.id, "priority", e.target.value)} className={cellInput}>
                      <option>High</option><option>Low</option>
                    </select>
                  </td>
                  <td className={td}>
                    <select value={r.importance} onChange={(e) => setCell(r.id, "importance", e.target.value)} className={cellInput}>
                      <option>High</option><option>Low</option>
                    </select>
                  </td>
                  <td className={td}><input type="number" value={r.duration} onChange={(e) => setCell(r.id, "duration", Number(e.target.value))} className={cellInput + " min-w-[4rem]"} /></td>
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
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3">
          <GhostButton onClick={addRow}><Plus size={14} /> Add Row</GhostButton>
          <PrimaryButton disabled={filled.length === 0} onClick={importAll}><Plus size={15} /> Import {filled.length || ""} Tasks</PrimaryButton>
        </div>
      </Card>
      {done > 0 && <p className="text-xs text-black/40">Imported {done} tasks to the board.</p>}
    </div>
  );
}
