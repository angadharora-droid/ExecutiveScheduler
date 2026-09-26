import React, { useState, useEffect } from "react";
import { X, UserPlus } from "lucide-react";
import { INK, ALERT } from "../constants.js";
import { todayISO, fmtDate, timeStrToClock } from "../utils.js";
import { Card, Chip, PrimaryButton, GhostButton, useEscape } from "./ui.jsx";

// Executive Interaction: invite another user to join one of your own tasks at a set date
// and time. It reaches them like any submission — they accept it onto their board or send
// it back — and your own task moves to the same slot so both calendars line up.
export default function InviteModal({ task, directory, invites = [], onClose, onSend }) {
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!task) return;
    setTo(directory[0]?.username || "");
    setDate(task.date && task.date >= todayISO() ? task.date : todayISO());
    setTime(task.time || "");
    setNotes("");
    setError("");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEscape(onClose, !!task);

  if (!task) return null;
  const field = "w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 bg-white";
  const label = "text-xs font-semibold text-black/50 uppercase tracking-wide";
  const moves = task.scheduleMode !== "DEFINE" || task.date !== date || (task.time || "") !== time;

  const send = async () => {
    setBusy(true);
    setError("");
    try { await onSend(task, { to, date, time, notes: notes.trim() }); onClose(); }
    catch (e) { setError(e.message || "Could not send the invite — try again"); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Executive Interaction invite">
      <Card className="w-full sm:max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl rise" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg flex items-center gap-2" style={{ color: INK }}><UserPlus size={16} /> Executive Interaction</h3>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -m-2 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium" style={{ color: INK }}>{task.title}</p>
            <p className="text-xs text-black/40 mt-0.5">{task.unit} · {task.workType} · {task.duration} min</p>
          </div>
          {invites.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {invites.map(s => (
                <Chip key={s.id} tone={s.status === "approved" ? "smallbatch" : s.status === "dismissed" ? "warn" : "outline"}>
                  {s.ownerName || s.owner || s.decidedBy || "Someone"} · {s.status === "approved" ? "accepted" : s.status === "dismissed" ? "sent back" : "waiting"}
                </Chip>
              ))}
            </div>
          )}
          {directory.length === 0 ? (
            <p className="text-sm text-black/40">There is nobody else to invite yet — an admin can add accounts under Users.</p>
          ) : (
            <>
              <div>
                <label className={label}>Invite</label>
                <select value={to} onChange={(e) => setTo(e.target.value)} className={field}>
                  {directory.map(u => <option key={u.username} value={u.username}>{u.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Date</label>
                  <input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} className={field} />
                </div>
                <div>
                  <label className={label}>Time (optional)</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
                </div>
              </div>
              <div>
                <label className={label}>Message (optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="What you'd like to cover together…" className={field + " resize-y"} />
              </div>
              <p className="text-xs text-black/40">
                They get it in their Submissions tab and have to accept it; if they don't, it comes back to you there.
                {moves && date && ` Your own task moves to ${fmtDate(date)}${time ? ` at ${timeStrToClock(time)}` : ""} as well.`}
              </p>
            </>
          )}
          {error && <p className="text-sm" style={{ color: ALERT }}>{error}</p>}
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-end gap-2 sticky bottom-0 bg-white">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={busy || !to || !date} onClick={send}><UserPlus size={14} /> {busy ? "Sending…" : "Send invite"}</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
