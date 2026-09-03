import React, { useState } from "react";
import { Check, Users } from "lucide-react";
import { CATEGORY_IDS, categoryChipTone, INK } from "../constants.js";
import { uid } from "../utils.js";
import { useUnits } from "../UnitsContext.jsx";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";

export default function Submissions({ submissions, addSubmission, approveSubmission, dismissSubmission }) {
  const { units } = useUnits();
  const { categoryLabel, activityOptions } = useWorkTypes();
  const blankForm = (submittedBy = "") => ({ title: "", unit: units[0], category: "smallBatch", workType: activityOptions("smallBatch")[0], duration: 15, notes: "", submittedBy });
  const [form, setForm] = useState(blankForm);
  const [decisions, setDecisions] = useState({}); // id -> { priority, importance }
  const pending = submissions.filter(s => s.status === "pending");

  const typeOptions = activityOptions(form.category);
  const setDecision = (id, field, val) => setDecisions(prev => ({ ...prev, [id]: { priority: "High", importance: "High", ...prev[id], [field]: val } }));

  return (
    <div className="space-y-5">
      <Card className="p-5 text-xs text-black/45 flex items-start gap-2">
        <Users size={14} className="mt-0.5 shrink-0" />
        Suggestions here are shared — anyone with this board can add one, and Arjun sets Priority and Importance before it joins the board.
      </Card>

      <Card className="p-6 space-y-3">
        <p className="text-sm font-medium" style={{ color: INK }}>Suggest a task</p>
        <input value={form.submittedBy} onChange={(e) => setForm({ ...form, submittedBy: e.target.value })}
          placeholder="Your name (e.g. Himshikhar)" className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="What needs to happen?" className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <div className="grid grid-cols-2 gap-3">
          <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
            {units.map(u => <option key={u}>{u}</option>)}
          </select>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, workType: activityOptions(e.target.value)[0] })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
            {CATEGORY_IDS.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
          <select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })} className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
            {typeOptions.map(w => <option key={w}>{w}</option>)}
          </select>
          <input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" placeholder="Minutes" />
        </div>
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Any context (optional)" className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
        <PrimaryButton disabled={!form.title.trim()} onClick={() => {
          addSubmission({ ...form, id: uid(), submittedAt: Date.now(), status: "pending" });
          setForm(blankForm(form.submittedBy));
        }}>Submit for Review</PrimaryButton>
      </Card>

      <div>
        <p className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">Pending Review ({pending.length})</p>
        {pending.length === 0 && <p className="text-sm text-black/40">Nothing waiting on you.</p>}
        <div className="space-y-2">
          {pending.map(s => {
            const d = decisions[s.id] || { priority: "High", importance: "High" };
            return (
              <Card key={s.id} className="p-4 space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium flex-1" style={{ color: INK }}>{s.title}</span>
                  <Chip tone="outline">{s.unit}</Chip>
                  <Chip tone={categoryChipTone(s.category)}>{s.workType}</Chip>
                </div>
                {s.notes && <p className="text-xs text-black/45">{s.notes}</p>}
                <p className="text-[11px] text-black/35">Suggested by {s.submittedBy || "someone"}</p>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <select value={d.priority} onChange={(e) => setDecision(s.id, "priority", e.target.value)} className="border border-black/10 rounded-lg px-2 py-1.5 text-xs outline-none">
                    <option>High</option><option>Low</option>
                  </select>
                  <select value={d.importance} onChange={(e) => setDecision(s.id, "importance", e.target.value)} className="border border-black/10 rounded-lg px-2 py-1.5 text-xs outline-none">
                    <option>High</option><option>Low</option>
                  </select>
                  <PrimaryButton onClick={() => approveSubmission(s, d.priority, d.importance)} className="py-1.5 px-3"><Check size={13} /> Approve to Board</PrimaryButton>
                  <GhostButton onClick={() => dismissSubmission(s.id)} className="py-1.5 px-3">Dismiss</GhostButton>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
