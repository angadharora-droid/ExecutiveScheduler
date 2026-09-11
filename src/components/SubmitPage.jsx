import React, { useState, useEffect } from "react";
import { Send, Inbox } from "lucide-react";
import {
  UNITS, CATEGORY_IDS, CATEGORY_DEFAULT_DURATION, DEFAULT_WORK_TYPES, normalizeWorkTypes,
  categoryChipTone, INK, PAPER, ACCENT, ALERT,
} from "../constants.js";
import { api } from "../auth.js";
import { Card, Chip, PrimaryButton } from "./ui.jsx";

const SERIF = { fontFamily: "Georgia, 'Iowan Old Style', ui-serif, serif" };
const SANS = { fontFamily: "'Inter', ui-sans-serif, system-ui" };
const inputCls = "w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 bg-white";
const labelCls = "text-xs font-semibold text-black/50 uppercase tracking-wide";
const STATUS = {
  pending: { label: "Waiting for review", tone: "outline" },
  approved: { label: "Added to board", tone: "focus" },
  dismissed: { label: "Not taken up", tone: "default" },
};
const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");

const blankForm = (units, workTypes) => ({
  title: "", unit: units[0], category: "smallBatch",
  workType: workTypes.smallBatch.activities[0], duration: CATEGORY_DEFAULT_DURATION.smallBatch, notes: "",
});

/* What a submit-only account sees instead of the board: a form that sends a task to the
   owner it is tied to, and the status of everything it has sent so far. */
export default function SubmitPage() {
  const [owner, setOwner] = useState(null);
  const [units, setUnits] = useState(UNITS);
  const [workTypes, setWorkTypes] = useState(DEFAULT_WORK_TYPES);
  const [form, setForm] = useState(() => blankForm(UNITS, DEFAULT_WORK_TYPES));
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = () => api("/api/submissions").then((d) => setMine(d.submissions || [])).catch((e) => setError(e.message));

  useEffect(() => {
    // The form offers the owner's own units and work types so what arrives matches their board.
    api("/api/submissions/options").then((d) => {
      const u = Array.isArray(d.units) && d.units.length ? d.units : UNITS;
      const w = normalizeWorkTypes(d.workTypes);
      setOwner(d.owner);
      setUnits(u);
      setWorkTypes(w);
      setForm(blankForm(u, w));
    }).catch(() => { /* built-in defaults stay */ });
    refresh();
  }, []);

  const activities = (cat) => workTypes[cat]?.activities || DEFAULT_WORK_TYPES[cat].activities;
  const label = (cat) => workTypes[cat]?.label || DEFAULT_WORK_TYPES[cat].label;
  const canSubmit = form.title.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/submissions", { method: "POST", body: form });
      setMine((prev) => [...prev, d.submission]);
      setForm({ ...blankForm(units, workTypes), unit: form.unit });
      setNotice(owner ? `Sent to ${owner.name}.` : "Sent for review.");
      setTimeout(() => setNotice(""), 2500);
    } catch (e) { setError(e.message || "Could not send — try again"); }
    setBusy(false);
  };

  const sent = [...mine].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  const waiting = sent.filter((s) => s.status === "pending").length;

  return (
    <div className="min-h-screen pb-16" style={{ background: PAPER, ...SANS }}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 pt-10 space-y-5">
        <div>
          <h2 className="text-2xl flex items-center gap-2" style={{ color: INK, ...SERIF }}><Send size={18} /> Submit a task</h2>
          <p className="text-sm text-black/45 mt-0.5">
            {owner
              ? <>Goes to <span className="font-medium" style={{ color: INK }}>{owner.name}</span> for review</>
              : "Goes to the shared inbox for review"}
          </p>
        </div>

        {notice && <Card className="p-3 text-sm" style={{ color: ACCENT }}>{notice}</Card>}
        {error && <Card className="p-3 text-sm" style={{ color: ALERT }}>{error}</Card>}

        <Card className="p-6 space-y-3">
          <input value={form.title} autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="What needs to happen?" className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls + " mt-1"}>
                {units.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Work type</label>
              <select value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, workType: activities(e.target.value)[0], duration: CATEGORY_DEFAULT_DURATION[e.target.value] || form.duration })}
                className={inputCls + " mt-1"}>
                {CATEGORY_IDS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Activity</label>
              <select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })} className={inputCls + " mt-1"}>
                {activities(form.category).map((w) => <option key={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Minutes</label>
              <input type="number" min="5" step="5" value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} className={inputCls + " mt-1"} />
            </div>
          </div>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Any context (optional)" className={inputCls} />
          <PrimaryButton disabled={!canSubmit} onClick={submit}>
            <Send size={14} /> {busy ? "Sending…" : owner ? `Send to ${owner.name}` : "Send for review"}
          </PrimaryButton>
        </Card>

        <div>
          <p className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">
            Your submissions ({sent.length}){waiting ? ` · ${waiting} waiting` : ""}
          </p>
          {sent.length === 0 && (
            <Card className="p-5 text-sm text-black/40 flex items-center gap-2"><Inbox size={14} /> Nothing sent yet.</Card>
          )}
          <div className="space-y-2">
            {sent.map((s) => {
              const st = STATUS[s.status] || STATUS.pending;
              return (
                <Card key={s.id} className="p-4 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium flex-1" style={{ color: INK }}>{s.title}</span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {s.unit && <Chip tone="outline">{s.unit}</Chip>}
                    {s.workType && <Chip tone={categoryChipTone(s.category)}>{s.workType}</Chip>}
                    <span className="text-[11px] text-black/35">{s.duration} min{s.submittedAt ? ` · ${fmtWhen(s.submittedAt)}` : ""}</span>
                  </div>
                  {s.notes && <p className="text-xs text-black/45">{s.notes}</p>}
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
