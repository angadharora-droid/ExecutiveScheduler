import React, { useState, useEffect } from "react";
import { Check, Users, Send, Undo2, UserPlus, Clock, X, RotateCcw } from "lucide-react";
import { UNITS, CATEGORY_IDS, CATEGORY_DEFAULT_DURATION, DEFAULT_WORK_TYPES, normalizeWorkTypes, categoryChipTone, INK, ACCENT, ALERT } from "../constants.js";
import { todayISO, fmtDate, timeStrToClock } from "../utils.js";
import { loadSendOptions } from "../storage.js";
import { useWorkTypes } from "../WorkTypesContext.jsx";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import MinutesInput from "./MinutesInput.jsx";

const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const whenText = (s) => (s.date ? `${fmtDate(s.date)}${s.time ? ` · ${timeStrToClock(s.time)}` : ""}` : "");
const inputCls = "w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 bg-white";
const labelCls = "text-[10px] font-semibold text-black/40 uppercase tracking-wide";

const KindChip = ({ s }) => s.kind === "invite"
  ? <Chip tone="focus"><UserPlus size={10} /> Executive Interaction</Chip>
  : <Chip tone="outline"><Send size={10} /> Task</Chip>;

// Tasks users send one another. Anyone can send to anyone; the receiver has to approve before
// it lands on their board, and what they decline goes back to the sender (the Sent list).
export default function Submissions({ me, directory, submissions, actions }) {
  const { addSubmission, approveSubmission, declineSubmission, withdrawSubmission, clearSubmission, keepReturnedSubmission, refreshSubmissions } = actions;
  // Who it goes to — one person or several; each gets their own copy to approve.
  const [to, setTo] = useState([]);
  const first = to[0] || "";
  // The send form offers the (first) receiver's own units and work types, so what arrives matches their board.
  const [units, setUnits] = useState(UNITS);
  const [workTypes, setWorkTypes] = useState(DEFAULT_WORK_TYPES);
  const blankForm = (u = units, w = workTypes) => ({ title: "", unit: u[0], category: "smallBatch", workType: w.smallBatch.activities[0], duration: CATEGORY_DEFAULT_DURATION.smallBatch, date: "", time: "", notes: "" });
  const [form, setForm] = useState(() => blankForm(UNITS, DEFAULT_WORK_TYPES));
  const [decisions, setDecisions] = useState({}); // id -> { priority, importance, date, time }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isMine = (s) => s.submittedByUser === me.username;
  const inbox = submissions.filter(s => s.status === "pending" && !isMine(s));
  const sent = submissions.filter(isMine).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  const returned = sent.filter(s => s.status === "dismissed");
  const nameOf = (username) => directory.find(u => u.username === username)?.name || username;

  // Pick up anything sent or decided since the app loaded.
  useEffect(() => { if (refreshSubmissions) refreshSubmissions(); }, [refreshSubmissions]);
  // Nobody is ticked to begin with — who it goes to is a deliberate choice every time.
  useEffect(() => {
    if (!first) return;
    let stale = false;
    loadSendOptions(first).then((d) => {
      if (stale) return;
      const u = Array.isArray(d.units) && d.units.length ? d.units : UNITS;
      const w = normalizeWorkTypes(d.workTypes);
      setUnits(u);
      setWorkTypes(w);
      // Keep what was typed; only re-point the dropdowns that no longer match this receiver.
      setForm(f => ({
        ...f,
        unit: u.includes(f.unit) ? f.unit : u[0],
        workType: w[f.category].activities.includes(f.workType) ? f.workType : w[f.category].activities[0],
      }));
    }).catch(() => { /* built-in defaults stay */ });
    return () => { stale = true; };
  }, [first]);
  const toNames = to.length === 1 ? nameOf(to[0]) : `${to.length} people`;

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 3000); };
  // Run a server-backed action, showing its error (e.g. "no longer waiting") instead of failing silently.
  const run = async (fn, okMsg) => {
    setError("");
    try { await fn(); if (okMsg) flash(okMsg); }
    catch (e) { setError(e.message || "That didn't go through — try again"); }
  };

  const submit = async () => {
    setBusy(true);
    await run(async () => {
      await addSubmission({ ...form, kind: "task", to });
      // The form clears, receivers included, so one more click never sends it again.
      setForm({ ...blankForm(), unit: form.unit });
      setTo([]);
    }, `Sent to ${to.map(nameOf).join(", ")} for approval.`);
    setBusy(false);
  };

  // Priority and Importance are the receiver's call on approval — they start blank.
  const decisionFor = (s) => ({ priority: "", importance: "", date: s.date || "", time: s.time || "", ...decisions[s.id] });
  const decided = (d) => !!d.priority && !!d.importance;
  const setDecision = (s, field, val) => setDecisions(prev => ({ ...prev, [s.id]: { ...decisionFor(s), [field]: val } }));
  const decline = (s) => {
    const reason = window.prompt(`Send "${s.title}" back to ${s.submittedBy || "the sender"}? Add a reason (optional):`, "");
    if (reason === null) return;
    run(() => declineSubmission(s.id, reason.trim()), `Sent back to ${s.submittedBy || "the sender"}.`);
  };
  // Put a returned task back in the form, addressed to whoever is picked next.
  const sendAgain = (s) => {
    setForm({ title: s.title, unit: s.unit, category: s.category, workType: s.workType, duration: s.duration, date: s.date || "", time: s.time || "", notes: s.notes || "" });
    run(() => clearSubmission(s.id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Work types are named the way this board names them everywhere else; the activities on
  // offer are the receiver's own, so what arrives matches their lists.
  const { categoryLabel } = useWorkTypes();
  const label = (cat) => categoryLabel(cat);
  const activities = (cat) => workTypes[cat]?.activities || DEFAULT_WORK_TYPES[cat].activities;
  const SENT_STATUS = {
    pending: (s) => ({ text: `Waiting for ${s.ownerName || nameOf(s.owner)}`, tone: "outline" }),
    approved: (s) => ({ text: `${s.kind === "invite" ? "Accepted" : "Approved"} by ${s.ownerName || nameOf(s.owner)}`, tone: "smallbatch" }),
    dismissed: (s) => ({ text: `Sent back by ${s.ownerName || nameOf(s.owner)}`, tone: "warn" }),
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 text-xs text-black/45 flex items-start gap-2">
        <Users size={14} className="mt-0.5 shrink-0" />
        <span>Send a task to anyone. It lands on their board only once they approve it; if they don't, it comes back to you below. To invite someone to join one of your own tasks (an Executive Interaction), use <span className="font-semibold">Invite</span> on that task in the Board tab.</span>
      </Card>

      {notice && <Card className="p-3 text-sm" style={{ color: ACCENT }}>{notice}</Card>}
      {error && <Card className="p-3 text-sm" style={{ color: ALERT }}>{error}</Card>}

      <div>
        <p className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">Waiting for your approval ({inbox.length})</p>
        {inbox.length === 0 && <p className="text-sm text-black/40">Nothing waiting on you.</p>}
        <div className="space-y-2">
          {inbox.map(s => {
            const d = decisionFor(s);
            return (
              <Card key={s.id} className="p-4 space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium flex-1" style={{ color: INK }}>{s.title}</span>
                  <KindChip s={s} />
                  <Chip tone="outline">{s.unit}</Chip>
                  <Chip tone={categoryChipTone(s.category)}>{s.workType}</Chip>
                  <Chip tone="outline"><Clock size={10} />{s.duration}m</Chip>
                </div>
                {s.notes && <p className="text-xs text-black/45">{s.notes}</p>}
                <p className="text-[11px] text-black/35">
                  {s.kind === "invite" ? "Invited by" : "Sent by"} {s.submittedBy || "someone"}{s.submittedAt ? ` · ${fmtWhen(s.submittedAt)}` : ""}
                  {whenText(s) && <span className="font-semibold text-black/50"> · asked for {whenText(s)}</span>}
                </p>
                <div className="flex items-end gap-2 flex-wrap pt-1">
                  <div>
                    <label className={labelCls}>Date</label>
                    <input type="date" value={d.date} min={todayISO()} onChange={(e) => setDecision(s, "date", e.target.value)}
                      className="block border border-black/10 rounded-lg px-2 py-1.5 text-xs outline-none" />
                  </div>
                  <div>
                    <label className={labelCls}>Time</label>
                    <input type="time" value={d.time} disabled={!d.date} onChange={(e) => setDecision(s, "time", e.target.value)}
                      className="block border border-black/10 rounded-lg px-2 py-1.5 text-xs outline-none disabled:opacity-40" />
                  </div>
                  <div>
                    <label className={labelCls}>Priority</label>
                    <select value={d.priority} onChange={(e) => setDecision(s, "priority", e.target.value)} className="block border border-black/10 rounded-lg px-2 py-1.5 text-xs outline-none" style={d.priority ? {} : { color: "rgba(0,0,0,0.4)" }}>
                      <option value="" disabled>Choose…</option><option>High</option><option>Low</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Importance</label>
                    <select value={d.importance} onChange={(e) => setDecision(s, "importance", e.target.value)} className="block border border-black/10 rounded-lg px-2 py-1.5 text-xs outline-none" style={d.importance ? {} : { color: "rgba(0,0,0,0.4)" }}>
                      <option value="" disabled>Choose…</option><option>High</option><option>Low</option>
                    </select>
                  </div>
                  <PrimaryButton disabled={!decided(d)} title={decided(d) ? "" : "Choose a priority and an importance first"} onClick={() => run(() => approveSubmission(s, d), d.date ? `On your board for ${fmtDate(d.date)}.` : "Added to your board.")} className="py-1.5 px-3">
                    <Check size={13} /> {s.kind === "invite" ? "Accept" : "Approve to Board"}
                  </PrimaryButton>
                  <GhostButton onClick={() => decline(s)} className="py-1.5 px-3"><Undo2 size={13} /> Send back</GhostButton>
                </div>
                <p className="text-[11px] text-black/35">
                  {d.date ? `Lands on your board pinned to ${fmtDate(d.date)}${d.time ? ` at ${timeStrToClock(d.time)}` : ""}.` : "No date — it joins your board for Auto Schedule."}
                </p>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="p-6 space-y-3">
        <p className="text-sm font-medium" style={{ color: INK }}>Send a task to someone</p>
        {directory.length === 0 ? (
          <p className="text-sm text-black/40">There is nobody else to send to yet — an admin can add accounts under Users.</p>
        ) : (
          <>
            <div>
              <label className={labelCls}>To</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {directory.map(u => {
                  const on = to.includes(u.username);
                  return (
                    <button key={u.username} type="button" aria-pressed={on}
                      onClick={() => setTo(prev => (on ? prev.filter(x => x !== u.username) : [...prev, u.username]))}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1"
                      style={{ borderColor: on ? INK : "rgba(0,0,0,0.1)", background: on ? INK : "white", color: on ? "white" : "rgba(0,0,0,0.6)" }}>
                      {on && <Check size={11} />}{u.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-black/40 mt-1">Pick one or more — each person gets their own copy to approve.</p>
            </div>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs to happen?" className={inputCls} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Unit</label>
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls + " mt-0.5"}>
                  {(units.includes(form.unit) ? units : [form.unit, ...units]).map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Work type</label>
                <select value={form.category} className={inputCls + " mt-0.5"}
                  onChange={(e) => setForm({ ...form, category: e.target.value, workType: activities(e.target.value)[0], duration: CATEGORY_DEFAULT_DURATION[e.target.value] || form.duration })}>
                  {CATEGORY_IDS.map(c => <option key={c} value={c}>{label(c)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Activity</label>
                <select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })} className={inputCls + " mt-0.5"}>
                  {(activities(form.category).includes(form.workType) ? activities(form.category) : [form.workType, ...activities(form.category)]).map(w => <option key={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Minutes</label>
                <MinutesInput value={form.duration} onChange={(duration) => setForm({ ...form, duration })} className={inputCls + " mt-0.5"} />
              </div>
              <div>
                <label className={labelCls}>Date (optional)</label>
                <input type="date" value={form.date} min={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value, time: e.target.value ? form.time : "" })} className={inputCls + " mt-0.5"} />
              </div>
              <div>
                <label className={labelCls}>Time (optional)</label>
                <input type="time" value={form.time} disabled={!form.date} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls + " mt-0.5 disabled:opacity-40"} />
              </div>
            </div>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any context (optional)" className={inputCls} />
            <PrimaryButton disabled={busy || !form.title.trim() || !to.length} onClick={submit}>
              <Send size={14} /> {busy ? "Sending…" : to.length ? `Send to ${toNames} for approval` : "Choose who this goes to"}
            </PrimaryButton>
          </>
        )}
      </Card>

      <div>
        <p className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">
          Sent by you ({sent.length}){returned.length > 0 && <span style={{ color: ALERT }}> · {returned.length} came back</span>}
        </p>
        {sent.length === 0 && <p className="text-sm text-black/40">Nothing sent yet.</p>}
        <div className="space-y-2">
          {sent.map(s => {
            const st = (SENT_STATUS[s.status] || SENT_STATUS.pending)(s);
            const back = s.status === "dismissed";
            return (
              <Card key={s.id} className="p-4 space-y-2" style={back ? { boxShadow: `0 0 0 1.5px ${ALERT}40` } : {}}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium flex-1" style={{ color: INK }}>{s.title}</span>
                  <KindChip s={s} />
                  <Chip tone={st.tone}>{st.text}</Chip>
                </div>
                <p className="text-[11px] text-black/35">
                  {s.unit}{s.workType ? ` · ${s.workType}` : ""} · {s.duration} min{whenText(s) ? ` · ${whenText(s)}` : ""}{s.submittedAt ? ` · sent ${fmtWhen(s.submittedAt)}` : ""}
                </p>
                {back && <p className="text-xs" style={{ color: ALERT }}>{s.reason ? `Reason: ${s.reason}` : "No reason given."}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  {s.status === "pending" && <GhostButton onClick={() => { if (window.confirm(`Withdraw “${s.title}” from ${s.ownerName || nameOf(s.owner)}?${s.kind === "invite" ? " Your task goes back to where it was." : ""}`)) run(() => withdrawSubmission(s.id), "Withdrawn."); }} className="py-1.5 px-3"><X size={13} /> Withdraw</GhostButton>}
                  {back && s.kind !== "invite" && (
                    <>
                      <PrimaryButton onClick={() => run(() => keepReturnedSubmission(s), "Added to your own board.")} className="py-1.5 px-3"><Check size={13} /> Add to my board</PrimaryButton>
                      <GhostButton onClick={() => sendAgain(s)} className="py-1.5 px-3"><RotateCcw size={13} /> Send to someone else</GhostButton>
                    </>
                  )}
                  {s.status !== "pending" && <GhostButton onClick={() => run(() => clearSubmission(s.id))} className="py-1.5 px-3">Clear</GhostButton>}
                </div>
                {back && s.kind === "invite" && <p className="text-[11px] text-black/35">The task is still on your own board — invite someone else from there, or move it.</p>}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
