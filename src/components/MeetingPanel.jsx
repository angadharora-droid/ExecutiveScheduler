import React, { useState, useEffect, useMemo } from "react";
import { CalendarCheck, Plus, X, Check, Clock, Mail, UserPlus, RefreshCw } from "lucide-react";
import { INK, ACCENT, ACCENT_WARM, ALERT, LEVELS } from "../constants.js";
import { todayISO, fmtDate, timeToMins, minsToClock, timeStrToClock } from "../utils.js";
import { fixedTimesOn, clashWith } from "../scheduleEngine.js";
import { useUnits } from "../UnitsContext.jsx";
import { MEETING_DURATIONS, nearestDuration, durationMinutes, loadMeetingOsDirectory } from "../lib/meetingOs.js";
import { Card, Chip, PrimaryButton, GhostButton } from "./ui.jsx";
import ClashNotice from "./ClashNotice.jsx";

const inputCls = "w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 bg-white";
const labelCls = "text-[10px] font-semibold text-black/45 uppercase tracking-wide";
const blankTopic = () => ({ topic: "", purpose: "", desiredOutcome: "", documents: "" });
const blankGuest = { name: "", desig: "", email: "", mobile: "", invite: true };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

// The Board's Meeting tab. A meeting made here is saved in Meeting OS — the group's shared
// record of meetings, which sends the calendar invites — and goes on this board at its time, so
// that time is blocked when the day is planned. Attendees come from Meeting OS's people, or are
// added by hand when they are not in it. Anyone with an account here gets the meeting as an
// invite to accept, and the list below shows who has accepted and who has not answered yet.
// `fromTask` is a Meeting task sent here from the board: the form starts from it, and saving
// updates that task instead of adding another.
export default function MeetingPanel({ tasks, dayPlans, submissions, me, fromTask, onClearFromTask, createMeeting, updateTask, onRefresh }) {
  const { units } = useUnits();
  const [dir, setDir] = useState({ loading: true, people: [], headers: [], me: "", error: "" });
  const loadDirectory = () => {
    setDir((d) => ({ ...d, loading: true, error: "" }));
    loadMeetingOsDirectory()
      .then((d) => setDir({ loading: false, people: d.people || [], headers: d.headers || [], me: d.me || "", error: "" }))
      .catch((e) => setDir({ loading: false, people: [], headers: [], me: "", error: e.message }));
  };
  useEffect(loadDirectory, []);

  const startForm = () => ({
    title: fromTask?.title || "", meetingHeader: "", unit: fromTask?.unit || units[0] || "", calledById: "",
    date: fromTask?.scheduleMode === "DEFINE" && fromTask.date >= todayISO() ? fromTask.date : todayISO(),
    time: fromTask?.scheduleMode === "DEFINE" ? fromTask.time || "" : "",
    duration: nearestDuration(fromTask?.duration || 60), mode: "inperson", venue: "", vcLink: "",
    attendeeIds: [], guests: [], topics: [blankTopic()], note: "", priority: "", importance: "",
  });
  const [form, setForm] = useState(startForm);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  // The caller starts as the signed-in person, once Meeting OS says who that is.
  useEffect(() => { if (dir.me) setForm((f) => (f.calledById ? f : { ...f, calledById: dir.me })); }, [dir.me]);

  const [query, setQuery] = useState("");
  const [guest, setGuest] = useState(blankGuest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null); // what the last save came back with

  const person = (id) => dir.people.find((p) => p.id === id);
  const caller = person(form.calledById);
  const chosen = form.attendeeIds.map(person).filter(Boolean);
  const q = query.trim().toLowerCase();
  const available = dir.people.filter((p) => p.id !== form.calledById && !form.attendeeIds.includes(p.id) && (!q || `${p.name} ${p.desig}`.toLowerCase().includes(q)));
  const minutes = durationMinutes(form.duration);

  // Whatever already holds that time on this board — another task at a set time, or (when the
  // day is planned) a break or the evening window — so the meeting is not booked over it. The
  // meeting can take the next free time, or the other task can be moved out of its way.
  const taken = useMemo(() => fixedTimesOn(form.date, tasks, dayPlans, fromTask ? [fromTask.id] : []), [form.date, tasks, dayPlans, fromTask?.id]);
  const clash = form.date && form.time ? clashWith(timeToMins(form.time), minutes, taken) : null;
  const [moved, setMoved] = useState("");
  const moveTask = (id, time) => {
    const t = tasks.find((x) => x.id === id);
    updateTask(id, { time });
    setMoved(`Moved “${t?.title || "the task"}” to ${timeStrToClock(time)}.`);
  };

  const addGuest = () => {
    if (!guest.name.trim()) return;
    set({ guests: [...form.guests, { ...guest, name: guest.name.trim(), email: guest.email.trim(), invite: guest.invite && isEmail(guest.email) }] });
    setGuest(blankGuest);
  };
  const setTopic = (i, patch) => set({ topics: form.topics.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  // Meeting OS emails the calendar invite to everyone on the meeting who has an email; those with
  // an account here also get it in their Scheduler inbox, to accept.
  const listed = [caller, ...chosen].filter(Boolean);
  const inScheduler = listed.filter((p) => p.account && p.account !== me.username).length;
  const byEmail = listed.filter((p) => p.email).length + form.guests.filter((g) => g.invite).length;
  const needsLevels = !fromTask;
  const missing = !form.title.trim() ? "Give the meeting a name"
    : !form.calledById ? "Choose who is calling it"
    : !form.date || !form.time ? "Choose the date and time"
    : !form.topics.some((t) => t.purpose.trim()) ? "Add at least one agenda purpose"
    : needsLevels && !(LEVELS.includes(form.priority) && LEVELS.includes(form.importance)) ? "Choose a priority and an importance for your board"
    : "";

  const save = async () => {
    setBusy(true); setError("");
    try {
      const result = await createMeeting({
        title: form.title.trim(), meetingHeader: form.meetingHeader.trim(), unit: form.unit, calledById: form.calledById,
        date: form.date, time: form.time, duration: form.duration, mode: form.mode, venue: form.venue.trim(), vcLink: form.vcLink.trim(),
        attendeeIds: form.attendeeIds, manualAttendees: form.guests, note: form.note.trim(),
        topics: form.topics.map((t) => ({ topic: t.topic.trim(), purpose: t.purpose.trim(), desiredOutcome: t.desiredOutcome.trim(), documents: t.documents.trim() })),
      }, { fromTask, priority: form.priority, importance: form.importance });
      setSaved(result);
      setForm({ ...startForm(), calledById: dir.me, title: "", time: "" });
      setQuery("");
      onClearFromTask?.();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setError(e.message || "The meeting was not saved — try again"); }
    setBusy(false);
  };

  // Meetings set up from here that are still ahead, each with who has answered.
  const mine = tasks
    .filter((t) => t.meetingOsMeeting?.organizer && t.status !== "done" && (t.date || "") >= todayISO())
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  if (dir.loading && !dir.people.length) {
    return <Card className="p-6 text-sm text-black/45" aria-busy="true">Loading people from Meeting OS…</Card>;
  }
  if (dir.error && !dir.people.length) {
    return (
      <Card className="p-6 space-y-3">
        <p className="text-sm" style={{ color: ALERT }}>{dir.error}</p>
        <GhostButton onClick={loadDirectory}><RefreshCw size={14} /> Try again</GhostButton>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {saved && (
        <Card className="p-4 text-sm space-y-1" style={{ boxShadow: `0 0 0 1.5px ${ACCENT}55` }}>
          <p className="font-medium flex items-center gap-2" style={{ color: ACCENT }}><Check size={15} /> “{saved.meeting.title}” is saved in Meeting OS · {saved.meeting.refNo}</p>
          <p className="text-xs text-black/55">
            On your board for {fmtDate(saved.meeting.date)} at {timeStrToClock(saved.meeting.time)} — that time is kept for it.
            {saved.invites.length ? ` ${saved.invites.length} ${saved.invites.length === 1 ? "person has" : "people have"} it in their Scheduler inbox to accept.` : ""}
            {saved.meeting.attendees.some((a) => a.invited) ? " Calendar invites go out from Meeting OS by email." : ""}
          </p>
        </Card>
      )}

      {/* Who has answered sits beside the form on a laptop, and above it on a phone. */}
      <div className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:items-start">
      <div className="lg:order-2 lg:sticky lg:top-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-black/40 uppercase tracking-wide">Your upcoming meetings ({mine.length})</p>
          {onRefresh && <button onClick={onRefresh} className="text-xs text-black/40 hover:text-black/70 flex items-center gap-1"><RefreshCw size={12} /> Refresh</button>}
        </div>
        {mine.length === 0 && <p className="text-sm text-black/40">Meetings you set up here show with who has accepted.</p>}
        <div className="space-y-2">
          {mine.map((t) => <MeetingStatus key={t.id} task={t} submissions={submissions} me={me} />)}
        </div>
      </div>

      <Card className="lg:order-1 p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-2">
          <CalendarCheck size={18} className="mt-0.5 shrink-0" style={{ color: ACCENT_WARM }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: INK }}>{fromTask ? `Set up “${fromTask.title}” in Meeting OS` : "New meeting"}</p>
            <p className="text-xs text-black/45 mt-0.5">Saved in Meeting OS, which sends the calendar invites. It goes on your board at its time, and anyone here with a Scheduler account gets it to accept.</p>
          </div>
          {fromTask && <button onClick={onClearFromTask} className="text-xs text-black/40 hover:text-black/70 shrink-0">Start a blank one</button>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Meeting name *</label>
            <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Quarterly review with HODs" className={inputCls + " mt-1"} />
          </div>
          <div>
            <label className={labelCls}>Meeting header</label>
            <input value={form.meetingHeader} onChange={(e) => set({ meetingHeader: e.target.value })} list="meeting-headers" placeholder="Optional — e.g. Ops Review" className={inputCls + " mt-1"} />
            <datalist id="meeting-headers">{dir.headers.map((h) => <option key={h} value={h} />)}</datalist>
          </div>
          <div>
            <label className={labelCls}>Unit / department</label>
            <select value={form.unit} onChange={(e) => set({ unit: e.target.value })} className={inputCls + " mt-1"}>
              {(units.includes(form.unit) ? units : [form.unit, ...units]).filter(Boolean).map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Called by *</label>
            <select value={form.calledById} onChange={(e) => set({ calledById: e.target.value, attendeeIds: form.attendeeIds.filter((id) => id !== e.target.value) })} className={inputCls + " mt-1"} style={form.calledById ? {} : { color: "rgba(0,0,0,0.4)" }}>
              <option value="" disabled>Choose…</option>
              {dir.people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.desig ? ` — ${p.desig}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date *</label>
            <input type="date" value={form.date} min={todayISO()} onChange={(e) => set({ date: e.target.value })} className={inputCls + " mt-1"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Time *</label>
              <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} className={inputCls + " mt-1"} />
            </div>
            <div>
              <label className={labelCls}>Length</label>
              <select value={form.duration} onChange={(e) => set({ duration: e.target.value })} className={inputCls + " mt-1"}>
                {MEETING_DURATIONS.map(([d]) => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {form.time && form.date && (
            <div className="sm:col-span-2 -mt-1 space-y-1.5">
              {clash
                ? <ClashNotice date={form.date} time={form.time} minutes={minutes} taken={taken} onUseTime={(time) => set({ time })} onMoveTask={updateTask ? moveTask : undefined} />
                : <p className="text-xs text-black/45">{fmtDate(form.date)}, {timeStrToClock(form.time)}–{minsToClock(timeToMins(form.time) + minutes)} — kept free on your day for this meeting.</p>}
              {moved && <p className="text-xs" style={{ color: ACCENT }}>{moved}</p>}
            </div>
          )}
          <div>
            <label className={labelCls}>Meeting type</label>
            <select value={form.mode} onChange={(e) => set({ mode: e.target.value })} className={inputCls + " mt-1"}>
              <option value="inperson">In person</option>
              <option value="vc">Video conference</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            {form.mode !== "vc" && (
              <>
                <label className={labelCls}>Venue</label>
                <input value={form.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="e.g. Board Room, 3rd Floor" className={inputCls + " mt-1"} />
              </>
            )}
            {form.mode !== "inperson" && (
              <div className={form.mode === "hybrid" ? "mt-3" : ""}>
                <label className={labelCls}>Video link</label>
                <input value={form.vcLink} onChange={(e) => set({ vcLink: e.target.value })} placeholder="https://…" className={inputCls + " mt-1"} />
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-black/[0.06] space-y-2">
          <p className={labelCls}>Attendees</p>
          <div className="flex flex-wrap gap-1.5">
            {caller && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-black/10 bg-black/[0.03]">
                {caller.name} <span className="text-black/40">· calling it</span>
              </span>
            )}
            {chosen.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs border border-black/10 bg-white">
                {p.name}
                <span className="text-[10px] font-semibold" style={{ color: p.account ? ACCENT : "rgba(0,0,0,0.4)" }}>{p.account ? "In Scheduler" : p.email ? "By email" : "No email"}</span>
                <button onClick={() => set({ attendeeIds: form.attendeeIds.filter((id) => id !== p.id) })} aria-label={`Remove ${p.name}`} className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-black/[0.05]"><X size={12} /></button>
              </span>
            ))}
            {form.guests.map((g, i) => (
              <span key={`g${i}`} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs border border-dashed border-black/20 bg-white">
                {g.name}
                <span className="text-[10px] font-semibold text-black/40">Added here · {g.invite ? "gets invite" : "no invite"}</span>
                <button onClick={() => set({ guests: form.guests.filter((_, j) => j !== i) })} aria-label={`Remove ${g.name}`} className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-black/[0.05]"><X size={12} /></button>
              </span>
            ))}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people in Meeting OS…" className={inputCls} />
          <div className="max-h-44 overflow-y-auto rounded-lg border border-black/[0.06] divide-y divide-black/[0.05]">
            {available.length === 0 && <p className="text-xs text-black/40 p-3">{q ? "Nobody by that name in Meeting OS — add them below." : "Everyone is already added."}</p>}
            {available.map((p) => (
              <button key={p.id} onClick={() => { set({ attendeeIds: [...form.attendeeIds, p.id] }); setQuery(""); }}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-black/[0.03]">
                <Plus size={13} className="text-black/35 shrink-0" />
                <span className="flex-1 min-w-0 truncate" style={{ color: INK }}>{p.name}{p.desig ? <span className="text-black/40"> — {p.desig}</span> : null}</span>
                {p.account && <span className="text-[10px] font-semibold shrink-0" style={{ color: ACCENT }}>In Scheduler</span>}
              </button>
            ))}
          </div>
          <details className="rounded-lg border border-black/[0.08] p-3" open={form.guests.length > 0 || undefined}>
            <summary className="text-xs font-semibold cursor-pointer flex items-center gap-1.5" style={{ color: INK }}><UserPlus size={13} /> Add someone who is not in Meeting OS</summary>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Name *" className={inputCls} />
              <input value={guest.desig} onChange={(e) => setGuest({ ...guest, desig: e.target.value })} placeholder="Designation" className={inputCls} />
              <input value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} placeholder="Email" inputMode="email" className={inputCls} />
              <input value={guest.mobile} onChange={(e) => setGuest({ ...guest, mobile: e.target.value })} placeholder="Mobile" inputMode="tel" className={inputCls} />
            </div>
            <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
              <label className="text-xs text-black/55 flex items-center gap-1.5">
                <input type="checkbox" checked={guest.invite} onChange={(e) => setGuest({ ...guest, invite: e.target.checked })} />
                Email them the calendar invite{guest.email && !isEmail(guest.email) ? " (needs a valid email)" : ""}
              </label>
              <GhostButton onClick={addGuest} disabled={!guest.name.trim()} className="py-1.5 px-3 min-h-9"><Plus size={13} /> Add</GhostButton>
            </div>
          </details>
          <p className="text-[11px] text-black/40">
            {inScheduler ? `${inScheduler} will get it in their Scheduler inbox to accept. ` : ""}
            {byEmail ? `${byEmail} will get the calendar invite by email. ` : ""}
            People with neither are listed on the meeting only.
          </p>
        </div>

        <div className="pt-3 border-t border-black/[0.06] space-y-3">
          <p className={labelCls}>Agenda</p>
          {form.topics.map((t, i) => (
            <div key={i} className="rounded-lg border border-black/[0.08] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input value={t.topic} onChange={(e) => setTopic(i, { topic: e.target.value })} placeholder={`Topic ${i + 1}`} className={inputCls} />
                {form.topics.length > 1 && <button onClick={() => set({ topics: form.topics.filter((_, j) => j !== i) })} aria-label="Remove this agenda item" className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><X size={14} /></button>}
              </div>
              <textarea value={t.purpose} onChange={(e) => setTopic(i, { purpose: e.target.value })} placeholder="Purpose *" rows={2} className={inputCls} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={t.desiredOutcome} onChange={(e) => setTopic(i, { desiredOutcome: e.target.value })} placeholder="Desired outcome" className={inputCls} />
                <input value={t.documents} onChange={(e) => setTopic(i, { documents: e.target.value })} placeholder="Documents to bring" className={inputCls} />
              </div>
            </div>
          ))}
          <button onClick={() => set({ topics: [...form.topics, blankTopic()] })} className="text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}><Plus size={13} /> Add agenda item</button>
          <textarea value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Special note (optional)" rows={2} className={inputCls} />
        </div>

        {needsLevels && (
          <div className="pt-3 border-t border-black/[0.06] grid grid-cols-2 gap-3">
            <p className="col-span-2 text-xs text-black/45">On your board</p>
            {[["priority", "Priority"], ["importance", "Importance"]].map(([k, l]) => (
              <div key={k}>
                <label className={labelCls}>{l} *</label>
                <select value={form[k]} onChange={(e) => set({ [k]: e.target.value })} className={inputCls + " mt-1"} style={form[k] ? {} : { color: "rgba(0,0,0,0.4)" }}>
                  <option value="" disabled>Choose…</option>
                  {LEVELS.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm" style={{ color: ALERT }}>{error}</p>}
        <PrimaryButton onClick={save} disabled={busy || !!missing} title={missing} className="w-full">
          <CalendarCheck size={15} /> {busy ? "Saving in Meeting OS…" : missing || "Save to Meeting OS"}
        </PrimaryButton>
      </Card>
      </div>
    </div>
  );
}

// One meeting and where each attendee stands: accepted, can't attend or not answered yet (people
// with a Scheduler account), invited by email, or only listed on it.
function MeetingStatus({ task, submissions, me }) {
  const m = task.meetingOsMeeting;
  const invites = submissions.filter((s) => s.kind === "invite" && s.sourceTaskId === task.id && s.submittedByUser === me.username);
  const groups = { accepted: [], waiting: [], declined: [], email: [], listed: [] };
  for (const a of m.attendees || []) {
    if (a.account === me.username) continue;
    const inv = a.account && invites.find((s) => s.owner === a.account);
    if (inv) {
      if (inv.status === "approved") groups.accepted.push(a.name);
      else if (inv.status === "dismissed") groups.declined.push(inv.reason ? `${a.name} (${inv.reason})` : a.name);
      else if (inv.status === "pending") groups.waiting.push(a.name);
    } else if (a.invited) groups.email.push(a.name);
    else groups.listed.push(a.name);
  }
  const rows = [
    ["accepted", "Accepted", <Check size={12} key="i" />, "#53604a"],
    ["waiting", "Not answered yet", <Clock size={12} key="i" />, ACCENT_WARM],
    ["declined", "Can't attend", <X size={12} key="i" />, ALERT],
    ["email", "Invited by email", <Mail size={12} key="i" />, "rgba(0,0,0,0.5)"],
    ["listed", "Listed only", null, "rgba(0,0,0,0.4)"],
  ].filter(([k]) => groups[k].length);
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium flex-1" style={{ color: INK }}>{task.title}</span>
        <Chip tone="warm"><CalendarCheck size={10} /> {m.refNo || "Meeting OS"}</Chip>
        <Chip tone="outline">{fmtDate(task.date)}{task.time ? ` · ${timeStrToClock(task.time)}` : ""}</Chip>
      </div>
      {rows.length === 0 && <p className="text-xs text-black/40">Nobody else is on this meeting.</p>}
      {rows.map(([k, label, icon, color]) => (
        <p key={k} className="text-xs flex items-start gap-1.5">
          <span className="font-semibold flex items-center gap-1 shrink-0" style={{ color }}>{icon}{label} ({groups[k].length}):</span>
          <span className="text-black/60">{groups[k].join(", ")}</span>
        </p>
      ))}
    </Card>
  );
}
