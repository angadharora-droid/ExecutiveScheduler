import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, X, Check, Star, ChevronRight, ChevronLeft, Clock, Calendar,
  Sparkles, ArrowRight, TrendingUp, AlertTriangle, Coffee, Users,
  Briefcase, Home, Plane, Factory, Building2, PartyPopper, MoreHorizontal,
  GripVertical, CheckCircle2, Circle, Flag, Layers, Sun, Moon, Download, Printer, Lock, Grid3x3
} from "lucide-react";

/* ============================== CONSTANTS ============================== */

const UNITS = ["CPA", "HCP Nagpur", "CP Navi Mumbai", "Restaurants", "Mickys / CP Foods", "Corporate", "HR", "L&D", "CEO / Leadership", "Finance", "Sales & Marketing", "Development", "Other"];

const SMALL_BATCH_TYPES = ["Follow-up", "Call", "Approval", "Email", "Quick Review", "Instruction"];
const FOCUS_TYPES = ["Meeting", "Deep Work", "Brainstorming", "Review", "Decision", "Planning"];
const DELEGATION_TYPES = ["Delegation", "Instruction", "Handover", "Task Assignment"];
const WORK_TYPE_OPTIONS = (cat) => cat === "focus" ? FOCUS_TYPES : cat === "delegation" ? DELEGATION_TYPES : SMALL_BATCH_TYPES;
const CATEGORY_LABEL = { smallBatch: "Small Batch", focus: "Focus Work", delegation: "Delegation & Instructions" };
const CATEGORY_DEFAULT_DURATION = { smallBatch: 15, focus: 40, delegation: 20 };
const categoryChipTone = (cat) => cat === "focus" ? "focus" : cat === "delegation" ? "delegation" : "smallbatch";

const DAY_TYPES = [
  { id: "full", label: "Full Office Day", icon: Briefcase },
  { id: "half", label: "Half Day", icon: Sun },
  { id: "wfh", label: "WFH", icon: Home },
  { id: "travel", label: "Travel Day", icon: Plane },
  { id: "property", label: "Property Visit", icon: Building2 },
  { id: "factory", label: "Factory Visit", icon: Factory },
  { id: "event", label: "Event / Function", icon: PartyPopper },
  { id: "flexible", label: "Flexible / Other", icon: MoreHorizontal },
];

const WEEKDAY_FOCUS_PREF = {
  1: { focus1: "CPA" },
  2: { focus2: "Amit" },
  3: { focus3: "Natasha", note: "Consider a Restaurant Visit afterwards" },
  4: { focus1: "HR", focus2: "L&D" },
  5: { focus1: "CEO / Leadership" },
  6: { focus1: "Guest Reviews" },
};
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CONCLUDE_STATUSES = ["Completed", "Progress Made", "Needs Follow-Up", "Decision Pending", "Needs Another Meeting", "Waiting on Someone", "Delegated", "Reschedule", "No Progress"];

const EVENING_STOP_GROUPS = {
  "Employee / Team": ["Specific employee", "HOD / Manager", "Department", "Team interaction"],
  "Guest": ["VIP Guest", "Long-stay Guest", "Guest requiring follow-up", "Event / Banquet host", "Specific guest"],
  "Property / Area": ["Front Office / Lobby", "Restaurant", "Banquet", "Kitchen", "BOH", "Guest Floors", "Engineering / Facility", "Other operational area"],
  "External / Social Visit": ["Restaurant visit", "Client", "Vendor", "Business associate", "Social commitment", "Other"],
};
const PROPERTY_UNITS = ["Restaurants", "HCP Nagpur", "CP Navi Mumbai", "CPA", "Mickys / CP Foods"];
const EVENING_ELIGIBLE_TYPES = ["full"]; // day types that get the evening window automatically
const EVENING_OPTIONAL_TYPES = ["half", "wfh", "factory", "property", "event"]; // ask retain/modify/skip
const PERSONAL_BLOCK_CATEGORIES = ["Personal / Social", "Medical", "Family", "Other"];

const ACCENT = "#2F5D62";      // signal teal — focus work
const ACCENT_WARM = "#B8862C"; // ochre — non-negotiable
const ALERT = "#B23A3A";       // stalled / overloaded
const INK = "#20222B";
const PAPER = "#F7F5F1";
const SAGE = "#7A8B6F";        // small batch

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const minsToClock = (startMin) => {
  const h = Math.floor(startMin / 60) % 24;
  const m = startMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};
const timeToMins = (t) => {
  if (!t) return 11 * 60;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const minsToTimeStr = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/* ============================== STORAGE ============================== */

async function loadAll() {
  let tasks = [];
  let dayPlans = {};
  try {
    const r = await window.storage.get("tasks");
    if (r && r.value) tasks = JSON.parse(r.value);
  } catch (e) { /* no data yet */ }
  try {
    const r = await window.storage.get("dayplans");
    if (r && r.value) dayPlans = JSON.parse(r.value);
  } catch (e) { /* no data yet */ }
  return { tasks, dayPlans };
}
async function saveTasks(tasks) {
  try { await window.storage.set("tasks", JSON.stringify(tasks)); } catch (e) { console.error(e); }
}
async function saveDayPlans(dayPlans) {
  try { await window.storage.set("dayplans", JSON.stringify(dayPlans)); } catch (e) { console.error(e); }
}
async function loadPersonalBlocks() {
  try {
    const r = await window.storage.get("personalblocks");
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* no data yet */ }
  return [];
}
async function savePersonalBlocks(blocks) {
  try { await window.storage.set("personalblocks", JSON.stringify(blocks)); } catch (e) { console.error(e); }
}
async function loadSubmissions() {
  try {
    const r = await window.storage.get("submissions", true);
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* no data yet */ }
  return [];
}
async function saveSubmissions(list) {
  try { await window.storage.set("submissions", JSON.stringify(list), true); } catch (e) { console.error(e); }
}

/* ============================== SCHEDULE ARCHITECTURE ============================== */

function buildBlocks(dayType, half) {
  const FW = 40;
  if (dayType === "full" || dayType === "wfh") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 30 },
      { key: "sb1", label: "Small Batch 1", type: "smallbatch", duration: 30 },
      { key: "break1", label: "Break", type: "break", duration: 10 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 20 },
      { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
      { key: "lunch", label: "Lunch", type: "break", duration: 40 },
      { key: "focus2", label: "Focus Work 2", type: "focus", duration: FW },
      { key: "break2", label: "Break", type: "break", duration: 10 },
      { key: "focus3", label: "Focus Work 3", type: "focus", duration: FW },
      { key: "break3", label: "Break", type: "break", duration: 15 },
      { key: "sb2", label: "Small Batch 2", type: "smallbatch", duration: 20 },
    ];
  }
  if (dayType === "half") {
    if (half === "second") {
      return [
        { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 15 },
        { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
        { key: "break1", label: "Break", type: "break", duration: 10 },
        { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 25 },
        { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
      ];
    }
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "sb1", label: "Small Batch 1", type: "smallbatch", duration: 25 },
      { key: "break1", label: "Break", type: "break", duration: 5 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
      { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
    ];
  }
  if (dayType === "travel") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "sb1", label: "Small Batch (phone-based)", type: "smallbatch", duration: 20 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
      { key: "focus1", label: "Focus Work (if reachable)", type: "focus", duration: FW },
    ];
  }
  if (dayType === "property" || dayType === "factory") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "visit", label: dayType === "property" ? "Property Visit" : "Factory Visit", type: "visit", duration: 180 },
      { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 20 },
      { key: "delegation", label: "Delegation & Instructions", type: "delegation", duration: 15 },
    ];
  }
  if (dayType === "event") {
    return [
      { key: "warmup", label: "Warm Up — Emails / Flash Reports", type: "warmup", duration: 20 },
      { key: "event", label: "Event / Function", type: "visit", duration: 120 },
      { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 20 },
    ];
  }
  return [
    { key: "warmup", label: "Warm Up", type: "warmup", duration: 20 },
    { key: "sb1", label: "Small Batch", type: "smallbatch", duration: 25 },
    { key: "focus1", label: "Focus Work 1", type: "focus", duration: FW },
  ];
}

/* ============================== EVENING WINDOW + PERSONAL BLOCKS ============================== */

const EVENING_INTERACTION = { key: "evening", label: "Executive Interaction Window", type: "evening", start: 17 * 60 + 45, end: 19 * 60 + 15 };
const EVENING_BUFFER = { key: "buffer", label: "Buffer & Pending Callbacks", type: "buffer", start: 19 * 60 + 15, end: 19 * 60 + 40 };
const EVENING_CLOSURE = { key: "closure", label: "Closure & Tomorrow's Instructions", type: "closure", start: 19 * 60 + 40, end: 20 * 60 };

// Interleave fixed-time personal blocks with a sequentially-timed list of structured blocks.
// Structured blocks are pushed later whenever they would overlap a personal block.
function layInSequenceWithPersonalBlocks(structuredBlocks, cursorStart, personalBlocks, specialTasks = []) {
  const fixedItems = [
    ...personalBlocks.map(p => ({ id: p.id, label: p.title, type: "personal", category: p.category, startTime: p.startTime, endTime: p.endTime })),
    ...specialTasks.map(s => ({ id: s.id, label: s.title, type: "special", startTime: s.time, endTime: minsToTimeStr(timeToMins(s.time) + s.duration) })),
  ];
  const remaining = [...fixedItems].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));
  const out = [];
  let cursor = cursorStart;

  const flushFixedUpTo = (t) => {
    while (remaining.length && timeToMins(remaining[0].startTime) <= t) {
      const fx = remaining.shift();
      const fxStart = timeToMins(fx.startTime), fxEnd = timeToMins(fx.endTime);
      if (fxStart > cursor) {
        out.push({ key: `gap-${fx.id}`, label: "FLEXIBLE / OPERATIONAL WINDOW", type: "flexible", duration: fxStart - cursor, start: cursor, end: fxStart, taskIds: [] });
      }
      out.push({ key: `${fx.type}-${fx.id}`, label: fx.label, type: fx.type, category: fx.category, duration: fxEnd - Math.max(fxStart, cursor), start: Math.max(fxStart, cursor), end: fxEnd, taskIds: [] });
      cursor = Math.max(cursor, fxEnd);
    }
  };

  for (const b of structuredBlocks) {
    flushFixedUpTo(cursor + b.duration);
    const start = cursor;
    const end = start + b.duration;
    out.push({ ...b, start, end });
    cursor = end;
  }
  flushFixedUpTo(Infinity);
  return { schedule: out, cursor };
}

function appendEveningWindow(schedule, cursor, mode, customStart, customEnd, stops) {
  if (mode === "skip") return schedule;
  const start = mode === "modify" ? timeToMins(customStart) : EVENING_INTERACTION.start;
  const end = mode === "modify" ? timeToMins(customEnd) : EVENING_INTERACTION.end;
  const out = [...schedule];
  if (start > cursor) {
    out.push({ key: "gap-evening", label: "FLEXIBLE / OPERATIONAL WINDOW", type: "flexible", duration: start - cursor, start: cursor, end: start, taskIds: [] });
  }
  out.push({ key: "evening", label: "Executive Interaction Window", type: "evening", duration: end - start, start, end, stops: stops || [], taskIds: [] });
  if (mode !== "modify") {
    out.push({ ...EVENING_BUFFER, duration: EVENING_BUFFER.end - EVENING_BUFFER.start, taskIds: [] });
    out.push({ ...EVENING_CLOSURE, duration: EVENING_CLOSURE.end - EVENING_CLOSURE.start, taskIds: [], instructions: [] });
  }
  return out;
}

function suggestEveningStops(tasks, weekdayLabel, weekday) {
  const suggestions = [];
  const propertyPending = tasks.filter(t => t.status !== "done" && PROPERTY_UNITS.includes(t.unit) && daysPending(t) >= 1);
  propertyPending.slice(0, 3).forEach(t => suggestions.push({ label: `${t.unit} — pending task on your To-Do Board`, source: t.title, group: "Property / Area" }));
  if (weekday === 3) suggestions.push({ label: "Restaurant rounds after meeting with Natasha", source: "Wednesday preference", group: "Property / Area" });
  return suggestions;
}

// Inserts a follow-up task directly into an already-generated day's schedule, under the
// chosen Small Batch / Delegation / Focus Work block, and shifts everything after it in time.
function insertTaskIntoPlan(plan, taskId, category, taskDuration) {
  const schedule = plan.schedule.map(b => ({ ...b, taskIds: [...(b.taskIds || [])] }));
  let targetIdx = -1;
  let newDuration = null;

  if (category === "smallBatch") {
    targetIdx = schedule.findIndex(b => b.type === "smallbatch" && b.key === "sb1");
    if (targetIdx > -1 && schedule[targetIdx].taskIds.length < 10) {
      schedule[targetIdx].taskIds.push(taskId);
    } else {
      targetIdx = -1;
    }
  } else if (category === "delegation") {
    targetIdx = schedule.findIndex(b => b.type === "delegation");
    if (targetIdx > -1) {
      schedule[targetIdx].taskIds.push(taskId);
      newDuration = schedule[targetIdx].duration + taskDuration;
    }
  } else if (category === "focus") {
    targetIdx = schedule.findIndex(b => b.type === "focus" && b.taskIds.length === 0);
    if (targetIdx > -1) {
      schedule[targetIdx].taskIds = [taskId];
      newDuration = taskDuration;
    }
  }

  if (targetIdx === -1) return { schedule: plan.schedule, inserted: false };

  if (newDuration != null) {
    const delta = newDuration - schedule[targetIdx].duration;
    schedule[targetIdx].duration = newDuration;
    schedule[targetIdx].end += delta;
    for (let i = targetIdx + 1; i < schedule.length; i++) {
      schedule[i].start += delta;
      schedule[i].end += delta;
    }
  }
  return { schedule, inserted: true };
}

/* ============================== RECOMMENDATION ENGINE ============================== */

function daysPending(task) {
  const created = new Date(task.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / 86400000));
}

function scoreTask(task, { dateISO, weekdayLabel }) {
  let score = 0;
  if (task.importance === "High") score += 30;
  if (task.priority === "High") score += 20;
  score += Math.min(daysPending(task), 10) * 3;
  score += (task.carryForwardCount || 0) * 8;
  if (task.unit && weekdayLabel && task.unit.toLowerCase().includes(weekdayLabel.toLowerCase())) score += 25;
  if (task.nonNegotiable) score += 50;
  return score;
}

function reasonFor(task, weekdayLabel) {
  const reasons = [];
  if (task.importance === "High" && daysPending(task) >= 2) reasons.push(`High Importance • Pending ${daysPending(task)} Days`);
  else if (task.unit && weekdayLabel && task.unit.toLowerCase().includes(weekdayLabel.toLowerCase())) reasons.push(`${weekdayLabel} ${task.unit} Slot`);
  else if (task.carryForwardCount > 0) reasons.push("Carried forward from previous day");
  else if (task.importance === "High") reasons.push("High Importance");
  else reasons.push("Pending task");
  return reasons[0];
}

/* ============================== SMALL UI PRIMITIVES ============================== */

function Chip({ children, tone = "default", className = "" }) {
  const tones = {
    default: "bg-black/5 text-[#20222B]",
    focus: "text-white",
    smallbatch: "text-white",
    delegation: "text-white",
    warn: "text-white",
    outline: "border border-black/15 text-[#20222B]/70",
  };
  const style =
    tone === "focus" ? { background: ACCENT } :
    tone === "smallbatch" ? { background: SAGE } :
    tone === "delegation" ? { background: "#6E7B8B" } :
    tone === "warn" ? { background: ALERT } : {};
  return (
    <span style={style} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "", style = {}, onClick }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`} style={style}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: disabled ? "#C9C7C2" : INK }}
      className={`text-white px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:cursor-not-allowed flex items-center gap-2 justify-center ${className}`}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, className = "" }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/[0.03] flex items-center gap-2 justify-center ${className}`}>
      {children}
    </button>
  );
}

/* ============================== TASK MODAL ============================== */

function TaskModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || {});
  useEffect(() => { setForm(initial || {
    title: "", unit: UNITS[0], priority: "High", importance: "High",
    category: "smallBatch", workType: SMALL_BATCH_TYPES[0], duration: 15,
    scheduleMode: "AUTO", date: "", time: "",
  }); }, [initial, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg" style={{ color: INK }}>{initial?.id ? "Edit Task" : "New Task"}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Task</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs to happen?"
              className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Unit</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Work Type</label>
              <select value={form.category} onChange={(e) => {
                const cat = e.target.value;
                setForm({ ...form, category: cat, workType: WORK_TYPE_OPTIONS(cat)[0], duration: CATEGORY_DEFAULT_DURATION[cat] });
              }} className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                <option value="smallBatch">Small Batch</option>
                <option value="focus">Focus Work</option>
                <option value="delegation">Delegation & Instructions</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Activity</label>
            <select value={form.workType} onChange={(e) => setForm({ ...form, workType: e.target.value })}
              className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
              {WORK_TYPE_OPTIONS(form.category).map(w => <option key={w}>{w}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                <option>High</option><option>Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Importance</label>
              <select value={form.importance} onChange={(e) => setForm({ ...form, importance: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                <option>High</option><option>Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Minutes</label>
              <input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Scheduling</label>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setForm({ ...form, scheduleMode: "AUTO" })}
                className="flex-1 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: form.scheduleMode === "AUTO" ? INK : "rgba(0,0,0,0.1)", background: form.scheduleMode === "AUTO" ? INK : "white", color: form.scheduleMode === "AUTO" ? "white" : INK }}>
                Auto Schedule
              </button>
              <button onClick={() => setForm({ ...form, scheduleMode: "DEFINE" })}
                className="flex-1 px-3 py-2 rounded-lg text-sm border" style={{ borderColor: form.scheduleMode === "DEFINE" ? INK : "rgba(0,0,0,0.1)", background: form.scheduleMode === "DEFINE" ? INK : "white", color: form.scheduleMode === "DEFINE" ? "white" : INK }}>
                Define Time
              </button>
            </div>
            {form.scheduleMode === "DEFINE" && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <input type="time" value={form.time || ""} onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            )}
          </div>
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-end gap-2 sticky bottom-0 bg-white">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={!form.title?.trim()} onClick={() => { onSave(form); onClose(); }}>Save Task</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

/* ============================== PERSONAL / NO-SCHEDULE BLOCK MODAL ============================== */

function PersonalBlockModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ title: "", date: todayISO(), startTime: "12:00", endTime: "14:00", category: PERSONAL_BLOCK_CATEGORIES[0] });
  useEffect(() => { if (open) setForm({ title: "", date: todayISO(), startTime: "12:00", endTime: "14:00", category: PERSONAL_BLOCK_CATEGORIES[0] }); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-md rounded-b-none sm:rounded-2xl">
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between">
          <h3 className="font-serif text-lg" style={{ color: INK }}>No-Schedule Window</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input placeholder="e.g. Khemkas Lunch, Doctor's appointment" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">From</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">To</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
          </div>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
            {PERSONAL_BLOCK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <p className="text-xs text-black/40">This time will be blocked out — the scheduler will build the rest of the day around it.</p>
        </div>
        <div className="p-5 border-t border-black/[0.06] flex justify-end gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={!form.title.trim()} onClick={() => { onSave({ id: uid(), ...form }); onClose(); }}>Save Window</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

/* ============================== BULK ADD (SPREADSHEET GRID) ============================== */

const emptyRow = () => ({
  id: uid(), title: "", unit: UNITS[0], category: "smallBatch", workType: SMALL_BATCH_TYPES[0],
  priority: "High", importance: "High", duration: 15, scheduleMode: "AUTO", date: "", time: "",
});

function BulkAdd({ addTasksBulk }) {
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

/* ============================== SUBMISSIONS (SHARED) ============================== */

function Submissions({ submissions, addSubmission, approveSubmission, dismissSubmission }) {
  const [form, setForm] = useState({ title: "", unit: UNITS[0], category: "smallBatch", workType: SMALL_BATCH_TYPES[0], duration: 15, notes: "", submittedBy: "" });
  const [decisions, setDecisions] = useState({}); // id -> { priority, importance }
  const pending = submissions.filter(s => s.status === "pending");

  const typeOptions = WORK_TYPE_OPTIONS(form.category);
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
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, workType: WORK_TYPE_OPTIONS(e.target.value)[0] })}
            className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
            <option value="smallBatch">Small Batch</option>
            <option value="focus">Focus Work</option>
            <option value="delegation">Delegation & Instructions</option>
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
          setForm({ title: "", unit: UNITS[0], category: "smallBatch", workType: SMALL_BATCH_TYPES[0], duration: 15, notes: "", submittedBy: form.submittedBy });
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

/* ============================== TO-DO BOARD ============================== */

function Board({ tasks, addTask, addTasksBulk, updateTask, completeTask, personalBlocks, addPersonalBlock, submissions, addSubmission, approveSubmission, dismissSubmission }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [unitFilter, setUnitFilter] = useState("All");
  const [pbModalOpen, setPbModalOpen] = useState(false);
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All", ...UNITS].map(u => (
          <button key={u} onClick={() => setUnitFilter(u)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border"
            style={{ borderColor: unitFilter === u ? INK : "rgba(0,0,0,0.1)", background: unitFilter === u ? INK : "white", color: unitFilter === u ? "white" : "rgba(0,0,0,0.6)" }}>
            {u}
          </button>
        ))}
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
                {t.scheduleMode === "DEFINE" && t.date && <Chip tone="outline">{fmtDate(t.date)}{t.time ? ` · ${t.time}` : ""}</Chip>}
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

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} initial={editing}
        onSave={(f) => editing ? updateTask(editing.id, f) : addTask(f)} />
      <PersonalBlockModal open={pbModalOpen} onClose={() => setPbModalOpen(false)} onSave={addPersonalBlock} />
    </div>
  );
}

/* ============================== PLAN MY DAY ============================== */

function PlanMyDay({ tasks, addTask, updateTask, dayPlans, savePlan, jumpToDayView, personalBlocks, addPersonalBlock }) {
  const [step, setStep] = useState(1);
  const [dateISO, setDateISO] = useState(todayISO());
  const weekday = new Date(dateISO + "T00:00:00").getDay();
  const weekdayLabel = WEEKDAY_NAMES[weekday];
  const pref = WEEKDAY_FOCUS_PREF[weekday] || {};

  const [dayType, setDayType] = useState(dayPlans[dateISO]?.dayType || "full");
  const [half, setHalf] = useState(dayPlans[dateISO]?.half || "first");
  const [startTime, setStartTime] = useState(dayPlans[dateISO]?.startTime || "11:00");
  const [sb1, setSb1] = useState(dayPlans[dateISO]?.sb1 || []);
  const [delegation, setDelegation] = useState(dayPlans[dateISO]?.delegation || []);
  const [focusSlots, setFocusSlots] = useState(dayPlans[dateISO]?.focusSlots || {});
  const [nonNegotiables, setNonNegotiables] = useState(
    dayPlans[dateISO]?.nonNegotiables || (dayPlans[dateISO]?.nonNegotiable ? [dayPlans[dateISO].nonNegotiable] : [])
  );
  const [overflowPrompt, setOverflowPrompt] = useState(false);
  const [newFocusModal, setNewFocusModal] = useState(null);
  const [newDelegationModal, setNewDelegationModal] = useState(false);
  const [pbModalOpen, setPbModalOpen] = useState(false);

  const [eveningMode, setEveningMode] = useState(dayPlans[dateISO]?.eveningMode || (EVENING_ELIGIBLE_TYPES.includes(dayType) ? "retain" : "skip"));
  const [eveningStart, setEveningStart] = useState(dayPlans[dateISO]?.eveningStart || "17:45");
  const [eveningEnd, setEveningEnd] = useState(dayPlans[dateISO]?.eveningEnd || "19:15");
  const [eveningStops, setEveningStops] = useState(dayPlans[dateISO]?.eveningStops || []);
  const [stopGroup, setStopGroup] = useState(Object.keys(EVENING_STOP_GROUPS)[0]);
  const [customStop, setCustomStop] = useState("");
  const [specialTasks, setSpecialTasks] = useState(dayPlans[dateISO]?.specialTasks || []);
  const [specialForm, setSpecialForm] = useState({ title: "", time: "12:00", duration: 30 });
  const addSpecialTask = () => {
    if (!specialForm.title.trim()) return;
    setSpecialTasks(prev => [...prev, { id: uid(), ...specialForm }]);
    setSpecialForm({ title: "", time: "12:00", duration: 30 });
  };
  const removeSpecialTask = (id) => setSpecialTasks(prev => prev.filter(s => s.id !== id));

  // Reload the whole wizard's state whenever the target date changes (Today / Tomorrow / any date).
  useEffect(() => {
    const dp = dayPlans[dateISO] || {};
    setStep(1);
    setDayType(dp.dayType || "full");
    setHalf(dp.half || "first");
    setStartTime(dp.startTime || "11:00");
    setSb1(dp.sb1 || []);
    setDelegation(dp.delegation || []);
    setFocusSlots(dp.focusSlots || {});
    setNonNegotiables(dp.nonNegotiables || (dp.nonNegotiable ? [dp.nonNegotiable] : []));
    setEveningMode(dp.eveningMode || (EVENING_ELIGIBLE_TYPES.includes(dp.dayType || "full") ? "retain" : "skip"));
    setEveningStart(dp.eveningStart || "17:45");
    setEveningEnd(dp.eveningEnd || "19:15");
    setEveningStops(dp.eveningStops || []);
    setSpecialTasks(dp.specialTasks || []);
  }, [dateISO]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dayPlans[dateISO]?.eveningMode) return; // respect an existing saved plan
    setEveningMode(EVENING_ELIGIBLE_TYPES.includes(dayType) ? "retain" : "skip");
  }, [dayType]); // eslint-disable-line react-hooks/exhaustive-deps

  const todaysPersonalBlocks = personalBlocks.filter(p => p.date === dateISO);
  const eveningSuggestions = useMemo(() => suggestEveningStops(tasks, weekdayLabel, weekday), [tasks, weekdayLabel, weekday]);
  const showEveningBuilder = eveningMode === "retain" || eveningMode === "modify";

  const addStop = (label, group) => setEveningStops(prev => [...prev, { id: uid(), label, group }]);
  const removeStop = (id) => setEveningStops(prev => prev.filter(s => s.id !== id));
  const moveStop = (idx, dir) => setEveningStops(prev => {
    const next = [...prev];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const openTasks = tasks.filter(t => t.status !== "done");
  // Tasks explicitly pinned (Define Time) to this exact date — auto-included, not offered as a pick.
  const pinnedSmallBatch = openTasks.filter(t => t.category === "smallBatch" && t.scheduleMode === "DEFINE" && t.date === dateISO);
  const pinnedDelegation = openTasks.filter(t => t.category === "delegation" && t.scheduleMode === "DEFINE" && t.date === dateISO);
  const pinnedFocus = openTasks.filter(t => t.category === "focus" && t.scheduleMode === "DEFINE" && t.date === dateISO);
  const pinnedSmallBatchIds = pinnedSmallBatch.map(t => t.id);
  const pinnedDelegationIds = pinnedDelegation.map(t => t.id);
  // Only Auto Schedule tasks are offered as pickable options — Define Time tasks are already committed to a date.
  const smallBatchEligible = openTasks.filter(t => t.category === "smallBatch" && t.scheduleMode !== "DEFINE");
  const focusEligible = openTasks.filter(t => t.category === "focus" && t.scheduleMode !== "DEFINE");
  const delegationEligible = openTasks.filter(t => t.category === "delegation" && t.scheduleMode !== "DEFINE");

  const finalSb1 = useMemo(() => Array.from(new Set([...pinnedSmallBatchIds, ...sb1])), [pinnedSmallBatchIds.join(","), sb1]); // eslint-disable-line
  const finalDelegation = useMemo(() => Array.from(new Set([...pinnedDelegationIds, ...delegation])), [pinnedDelegationIds.join(","), delegation]); // eslint-disable-line

  // Auto-seat any pinned Focus tasks for this date into open Focus slots as soon as they're known.
  useEffect(() => {
    if (pinnedFocus.length === 0) return;
    setFocusSlots(prev => {
      const already = new Set(Object.values(prev));
      const unassigned = pinnedFocus.filter(t => !already.has(t.id));
      if (unassigned.length === 0) return prev;
      const slotKeys = ["focus1", "focus2", "focus3"];
      const next = { ...prev };
      let ai = 0;
      slotKeys.forEach(k => { if (!next[k] && unassigned[ai]) { next[k] = unassigned[ai].id; ai++; } });
      return next;
    });
  }, [dateISO, pinnedFocus.map(t => t.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSb1 = (id) => {
    if (sb1.includes(id)) { setSb1(sb1.filter(x => x !== id)); return; }
    if (finalSb1.length >= 10) { setOverflowPrompt(true); return; }
    setSb1([...sb1, id]);
  };

  const [delegationOverflow, setDelegationOverflow] = useState(false);
  const toggleDelegation = (id) => {
    if (delegation.includes(id)) { setDelegation(delegation.filter(x => x !== id)); return; }
    if (finalDelegation.length >= 5) { setDelegationOverflow(true); return; }
    setDelegation([...delegation, id]);
  };

  const toggleNonNegotiable = (id) => {
    if (nonNegotiables.includes(id)) { setNonNegotiables(nonNegotiables.filter(x => x !== id)); return; }
    if (nonNegotiables.length >= 3) return;
    setNonNegotiables([...nonNegotiables, id]);
  };

  const blocks = useMemo(() => buildBlocks(dayType, half), [dayType, half]);
  const focusBlockKeys = blocks.filter(b => b.type === "focus").map(b => b.key);

  const delegationRecommendations = useMemo(() => {
    const pool = delegationEligible.filter(t => !delegation.includes(t.id));
    return pool
      .map(t => ({ t, score: scoreTask(t, { dateISO, weekdayLabel }) }))
      .sort((a, b) => b.score - a.score)
      .map(({ t }) => ({ task: t, reason: reasonFor(t, weekdayLabel) }));
  }, [delegationEligible, delegation, dateISO, weekdayLabel]);

  const recommendationsFor = (slotKey) => {
    const chosenElsewhere = Object.entries(focusSlots).filter(([k, v]) => k !== slotKey && v).map(([, v]) => v);
    const pool = focusEligible.filter(t => !chosenElsewhere.includes(t.id));
    const ranked = pool
      .map(t => ({ t, score: scoreTask(t, { dateISO, weekdayLabel }) }))
      .sort((a, b) => b.score - a.score);
    const selectedId = focusSlots[slotKey];
    const top = ranked.slice(0, 5);
    if (selectedId && !top.find(r => r.t.id === selectedId)) {
      const sel = ranked.find(r => r.t.id === selectedId) || (tasks.find(x => x.id === selectedId) ? { t: tasks.find(x => x.id === selectedId) } : null);
      if (sel) top.unshift(sel);
    }
    return top.map(({ t }) => ({ task: t, reason: reasonFor(t, weekdayLabel), pinned: t.scheduleMode === "DEFINE" }));
  };

  const generate = () => {
    const structuredWithTasks = blocks.map(b => {
      if (b.type === "smallbatch" && b.key === "sb1") return { ...b, taskIds: finalSb1 };
      if (b.type === "delegation") {
        const durSum = finalDelegation.reduce((s, id) => { const t = tasks.find(x => x.id === id); return s + (t?.duration || 0); }, 0);
        return { ...b, taskIds: finalDelegation, duration: durSum > 0 ? durSum : b.duration };
      }
      if (b.type === "focus") {
        const chosenId = focusSlots[b.key];
        const chosenTask = chosenId ? tasks.find(x => x.id === chosenId) : null;
        return { ...b, taskIds: chosenId ? [chosenId] : [], duration: chosenTask?.duration || b.duration };
      }
      return { ...b, taskIds: [] };
    });
    const { schedule: laidIn, cursor } = layInSequenceWithPersonalBlocks(structuredWithTasks, timeToMins(startTime), todaysPersonalBlocks, specialTasks);
    const finalSchedule = appendEveningWindow(laidIn, cursor, eveningMode, eveningStart, eveningEnd, eveningStops);

    const plan = {
      date: dateISO, dayType, half, startTime, sb1: finalSb1, delegation: finalDelegation, focusSlots,
      nonNegotiables, schedule: finalSchedule, concluded: false, createdAt: Date.now(),
      eveningMode, eveningStart, eveningEnd, eveningStops, specialTasks,
    };
    savePlan(dateISO, plan);
    jumpToDayView(dateISO);
  };

  const stepTitles = ["Day Type", "Start Time", "Small Batch", "Delegation", "Focus Work", "Non-Negotiable", "Evening Window", "Generate"];
  const tomorrowISO = addDays(todayISO(), 1);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-2xl" style={{ color: INK }}>Plan My Day</h2>
          <p className="text-sm text-black/45 mt-0.5">{fmtDate(dateISO)} · Step {step} of {stepTitles.length} — {stepTitles[step-1]}</p>
        </div>
        <div className="flex gap-2">
          {[[todayISO(), "Today"], [tomorrowISO, "Tomorrow"]].map(([d, label]) => (
            <button key={d} onClick={() => setDateISO(d)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{ borderColor: dateISO === d ? INK : "rgba(0,0,0,0.1)", background: dateISO === d ? INK : "white", color: dateISO === d ? "white" : "rgba(0,0,0,0.6)" }}>
              {label}{dayPlans[d] ? " ✓" : ""}
            </button>
          ))}
          <input type="date" value={dateISO} min={todayISO()} onChange={(e) => setDateISO(e.target.value)}
            className="border border-black/10 rounded-full px-3 py-1.5 text-xs outline-none" />
        </div>
      </div>

      <div className="flex gap-1">
        {stepTitles.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < step ? ACCENT : "rgba(0,0,0,0.08)" }} />
        ))}
      </div>

      {(pinnedSmallBatch.length + pinnedDelegation.length + pinnedFocus.length) > 0 && (
        <Card className="p-4" style={{ background: "#FBF4E4", borderColor: ACCENT_WARM }}>
          <div className="flex items-start gap-2">
            <Calendar size={15} style={{ color: ACCENT_WARM }} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT_WARM }}>
                {pinnedSmallBatch.length + pinnedDelegation.length + pinnedFocus.length} already scheduled for {fmtDate(dateISO)}
              </p>
              <p className="text-xs text-black/55 mt-1">
                {[...pinnedSmallBatch, ...pinnedDelegation, ...pinnedFocus].map(t => t.title).join(" · ")}
              </p>
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6">
          <p className="text-sm font-medium mb-4" style={{ color: INK }}>What does today look like?</p>
          <div className="grid grid-cols-2 gap-3">
            {DAY_TYPES.map(dt => {
              const Icon = dt.icon;
              const sel = dayType === dt.id;
              return (
                <button key={dt.id} onClick={() => setDayType(dt.id)}
                  className="p-4 rounded-xl border text-left flex flex-col gap-2"
                  style={{ borderColor: sel ? INK : "rgba(0,0,0,0.1)", background: sel ? "#EFEEEA" : "white" }}>
                  <Icon size={18} color={sel ? INK : "rgba(0,0,0,0.4)"} />
                  <span className="text-sm font-medium" style={{ color: INK }}>{dt.label}</span>
                </button>
              );
            })}
          </div>
          {dayType === "half" && (
            <div className="mt-4 flex gap-2">
              {["first", "second"].map(h => (
                <button key={h} onClick={() => setHalf(h)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border capitalize"
                  style={{ borderColor: half === h ? INK : "rgba(0,0,0,0.1)", background: half === h ? INK : "white", color: half === h ? "white" : INK }}>
                  {h} Half
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm font-medium mb-4" style={{ color: INK }}>What time are you starting?</p>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="border border-black/10 rounded-lg px-3 py-2 text-lg outline-none" />
            <p className="text-xs text-black/40 mt-3">Today's schedule will be calculated from this time.</p>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium" style={{ color: INK }}>No-Schedule Windows today</p>
              <button onClick={() => setPbModalOpen(true)} className="text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
                <Plus size={13} /> Add
              </button>
            </div>
            {todaysPersonalBlocks.length === 0 ? (
              <p className="text-xs text-black/40">None yet — e.g. a lunch out or a doctor's appointment. The scheduler builds today's plan around whatever you add here.</p>
            ) : (
              <div className="space-y-1.5">
                {todaysPersonalBlocks.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/10">
                    <Clock size={13} className="text-black/35" />
                    <span className="text-sm flex-1" style={{ color: INK }}>{p.title}</span>
                    <Chip tone="outline">{p.startTime}–{p.endTime}</Chip>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: INK }}>Select today's Small Batch tasks</p>
            <span className="text-xs font-semibold" style={{ color: finalSb1.length >= 10 ? ALERT : "rgba(0,0,0,0.4)" }}>{finalSb1.length} / 10 selected</span>
          </div>
          {pinnedSmallBatch.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {pinnedSmallBatch.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: SAGE, background: "#F2F5F0" }}>
                  <Calendar size={14} className="text-black/30" />
                  <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                  <Chip tone="smallbatch">Scheduled for this day</Chip>
                  <Chip tone="outline">{t.unit}</Chip>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {smallBatchEligible.length === 0 && pinnedSmallBatch.length === 0 && <p className="text-sm text-black/40">No small batch tasks on the board yet.</p>}
            {smallBatchEligible.map(t => (
              <label key={t.id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer"
                style={{ borderColor: sb1.includes(t.id) ? SAGE : "rgba(0,0,0,0.08)", background: sb1.includes(t.id) ? "#F2F5F0" : "white" }}>
                <input type="checkbox" checked={sb1.includes(t.id)} onChange={() => toggleSb1(t.id)} className="accent-[#7A8B6F]" />
                <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                <Chip tone="outline">{t.unit}</Chip>
              </label>
            ))}
          </div>
          {overflowPrompt && (
            <div className="mt-3 p-3 rounded-lg border" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
              <p className="text-sm mb-2" style={{ color: ALERT }}>Your Small Batch is full at 10 tasks.</p>
              <div className="flex gap-2">
                <GhostButton onClick={() => setOverflowPrompt(false)}>Queue to Next Available Day</GhostButton>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium" style={{ color: INK }}>Delegation & Instructions</p>
            <span className="text-xs font-semibold" style={{ color: finalDelegation.length >= 5 ? ALERT : "rgba(0,0,0,0.4)" }}>{finalDelegation.length} / 5 selected</span>
          </div>
          <p className="text-xs text-black/40 mb-4">Recommended from your Delegation & Instructions tasks</p>
          <div className="space-y-1.5">
            {pinnedDelegation.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "#6E7B8B", background: "#EEF0F2" }}>
                <Calendar size={14} className="text-black/30" />
                <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                <Chip tone="delegation">Scheduled for this day</Chip>
                <Chip tone="outline">{t.duration}m</Chip>
              </div>
            ))}
            {delegation.map(id => {
              const t = tasks.find(x => x.id === id);
              if (!t) return null;
              return (
                <label key={id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer"
                  style={{ borderColor: "#6E7B8B", background: "#EEF0F2" }}>
                  <input type="checkbox" checked readOnly onChange={() => toggleDelegation(id)} />
                  <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                  <Chip tone="delegation">Selected</Chip>
                  <Chip tone="outline">{t.duration}m</Chip>
                </label>
              );
            })}
            {delegationRecommendations.map(({ task, reason }) => (
              <label key={task.id} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <input type="checkbox" checked={false}
                  onChange={() => toggleDelegation(task.id)} className="mt-1" />
                <div className="flex-1">
                  <p className="text-sm" style={{ color: INK }}>{task.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#6E7B8B" }}>Recommended: {reason}</p>
                </div>
                <Chip tone="outline">{task.duration}m</Chip>
              </label>
            ))}
            {delegationEligible.length === 0 && pinnedDelegation.length === 0 && <p className="text-sm text-black/40">No Delegation & Instructions tasks on the board yet.</p>}
          </div>
          {delegationOverflow && (
            <div className="mt-3 p-3 rounded-lg border" style={{ borderColor: ALERT, background: "#FBEFEF" }}>
              <p className="text-sm" style={{ color: ALERT }}>Up to 5 Delegation & Instructions tasks per day — deselect one to add another.</p>
            </div>
          )}
          <button onClick={() => setNewDelegationModal(true)} className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: "#6E7B8B" }}>
            <Plus size={13} /> Add New Delegation Task
          </button>
        </Card>
      )}

      {step === 5 && (
        <div className="space-y-4">
          {focusBlockKeys.map((key, i) => {
            const chosenId = focusSlots[key];
            const chosenTask = chosenId ? tasks.find(t => t.id === chosenId) : null;
            return (
            <Card key={key} className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold" style={{ color: INK }}>Focus Work {i + 1}</p>
                <span className="text-xs text-black/40">{chosenTask ? `${chosenTask.duration} min (from task)` : "duration pulled from selected task"}</span>
              </div>
              {pref[`focus${i+1}`] && <p className="text-xs mb-3" style={{ color: ACCENT }}>Weekly preference: {pref[`focus${i+1}`]}{pref.note && i === 2 ? ` · ${pref.note}` : ""}</p>}
              <div className="space-y-1.5">
                {recommendationsFor(key).map(({ task, reason, pinned }) => {
                  const sel = focusSlots[key] === task.id;
                  return (
                    <label key={task.id} className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer"
                      style={{ borderColor: sel ? ACCENT : "rgba(0,0,0,0.08)", background: sel ? "#EEF3F3" : "white" }}>
                      <input type="radio" name={key} checked={sel} disabled={pinned}
                        onChange={() => setFocusSlots({ ...focusSlots, [key]: task.id })} className="mt-1" />
                      <div className="flex-1">
                        <p className="text-sm" style={{ color: INK }}>{task.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: ACCENT }}>{pinned ? "Scheduled for this day" : sel ? "Selected" : `Recommended: ${reason}`}</p>
                      </div>
                      <Chip tone="outline">{task.duration}m</Chip>
                      {sel && <Chip tone="focus">{pinned ? "Scheduled" : "Selected"}</Chip>}
                    </label>
                  );
                })}
                {focusEligible.length === 0 && pinnedFocus.length === 0 && <p className="text-sm text-black/40">No focus tasks on the board yet.</p>}
              </div>
              <button onClick={() => setNewFocusModal(key)} className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: ACCENT }}>
                <Plus size={13} /> Add New Focus Task
              </button>
            </Card>
          );})}
        </div>
      )}

      {step === 6 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: INK }}>What are today's non-negotiables?</p>
            <span className="text-xs font-semibold" style={{ color: nonNegotiables.length >= 3 ? ALERT : "rgba(0,0,0,0.4)" }}>{nonNegotiables.length} / 3 selected</span>
          </div>
          <div className="space-y-1.5">
            {[...finalSb1, ...finalDelegation, ...Object.values(focusSlots).filter(Boolean)].map(id => {
              const t = tasks.find(x => x.id === id);
              if (!t) return null;
              const sel = nonNegotiables.includes(id);
              const disabled = !sel && nonNegotiables.length >= 3;
              return (
                <label key={id} className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{ borderColor: sel ? ACCENT_WARM : "rgba(0,0,0,0.08)", background: sel ? "#FBF4E4" : "white", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
                  <input type="checkbox" checked={sel} disabled={disabled} onChange={() => toggleNonNegotiable(id)} />
                  <span className="text-sm flex-1" style={{ color: INK }}>{t.title}</span>
                  {sel && <Star size={14} fill={ACCENT_WARM} stroke="none" />}
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {step === 7 && (
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm font-medium mb-1" style={{ color: INK }}>Evening Executive Interaction Window</p>
            <p className="text-xs text-black/40 mb-4">
              {EVENING_ELIGIBLE_TYPES.includes(dayType)
                ? "5:45 – 7:15 PM · visibility, employee & guest interaction, property rounds"
                : "This day type doesn't get the evening window automatically — retain, modify, or skip it."}
            </p>
            <div className="flex gap-2">
              {["retain", "modify", "skip"].map(m => (
                <button key={m} onClick={() => setEveningMode(m)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border capitalize"
                  style={{ borderColor: eveningMode === m ? INK : "rgba(0,0,0,0.1)", background: eveningMode === m ? INK : "white", color: eveningMode === m ? "white" : INK }}>
                  {m}
                </button>
              ))}
            </div>
            {eveningMode === "modify" && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">From</label>
                  <input type="time" value={eveningStart} onChange={(e) => setEveningStart(e.target.value)}
                    className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">To</label>
                  <input type="time" value={eveningEnd} onChange={(e) => setEveningEnd(e.target.value)}
                    className="w-full mt-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                </div>
              </div>
            )}
          </Card>

          {showEveningBuilder && (
            <Card className="p-6">
              <p className="text-sm font-medium mb-1" style={{ color: INK }}>Is there anyone or anywhere you specifically need to visit today?</p>
              <p className="text-xs text-black/40 mb-4">Select stops for Employees, Guests, Property or External / Social visits — you can reorder them below.</p>

              {eveningSuggestions.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {eveningSuggestions.map((s, i) => (
                    <button key={i} onClick={() => addStop(s.label, s.group)}
                      className="w-full text-left p-2.5 rounded-lg border border-black/10 flex items-center gap-2 hover:bg-black/[0.02]">
                      <Sparkles size={13} style={{ color: ACCENT }} />
                      <span className="text-xs" style={{ color: INK }}>Suggested today: {s.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-2">
                {Object.keys(EVENING_STOP_GROUPS).map(g => (
                  <button key={g} onClick={() => setStopGroup(g)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border"
                    style={{ borderColor: stopGroup === g ? INK : "rgba(0,0,0,0.1)", background: stopGroup === g ? INK : "white", color: stopGroup === g ? "white" : "rgba(0,0,0,0.6)" }}>
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                {EVENING_STOP_GROUPS[stopGroup].map(opt => (
                  <button key={opt} onClick={() => addStop(opt, stopGroup)}
                    className="px-2.5 py-1 rounded-full text-xs border border-black/10 hover:bg-black/[0.03]" style={{ color: INK }}>
                    + {opt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mb-4">
                <input placeholder="Add person / area / visit" value={customStop} onChange={(e) => setCustomStop(e.target.value)}
                  className="flex-1 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <GhostButton onClick={() => { if (customStop.trim()) { addStop(customStop.trim(), stopGroup); setCustomStop(""); } }}>Add</GhostButton>
              </div>

              {eveningStops.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-black/40 uppercase tracking-wide">Sequence</p>
                  {eveningStops.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-black/10">
                      <span className="text-xs text-black/35 w-4">{i + 1}</span>
                      <span className="text-sm flex-1" style={{ color: INK }}>{s.label}</span>
                      <Chip tone="outline">{s.group}</Chip>
                      <button onClick={() => moveStop(i, -1)} disabled={i === 0}><ChevronLeft size={14} className="rotate-90 text-black/30" /></button>
                      <button onClick={() => moveStop(i, 1)} disabled={i === eveningStops.length - 1}><ChevronRight size={14} className="rotate-90 text-black/30" /></button>
                      <button onClick={() => removeStop(s.id)}><X size={14} className="text-black/30" /></button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {step === 8 && (
        <div className="space-y-4">
          <Card className="p-6">
            <p className="text-sm font-medium mb-1" style={{ color: INK }}>Special Tasks</p>
            <p className="text-xs text-black/40 mb-4">One-off items with their own fixed time — separate from Small Batch, Focus Work, or Delegation. Think appointments, calls at a set hour, or anything that needs its own slot.</p>
            {specialTasks.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {specialTasks.map(s => (
                  <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border" style={{ borderColor: "#4A6E8B", background: "#EAF0F5" }}>
                    <Clock size={13} className="text-black/35" />
                    <span className="text-sm flex-1" style={{ color: INK }}>{s.title}</span>
                    <Chip tone="outline">{s.time} · {s.duration}m</Chip>
                    <button onClick={() => removeSpecialTask(s.id)}><X size={14} className="text-black/30" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <input placeholder="Title" value={specialForm.title} onChange={(e) => setSpecialForm({ ...specialForm, title: e.target.value })}
                className="flex-1 min-w-[8rem] border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <input type="time" value={specialForm.time} onChange={(e) => setSpecialForm({ ...specialForm, time: e.target.value })}
                className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <input type="number" value={specialForm.duration} onChange={(e) => setSpecialForm({ ...specialForm, duration: Number(e.target.value) })}
                placeholder="Minutes" className="w-20 border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              <GhostButton onClick={addSpecialTask}><Plus size={14} /> Add</GhostButton>
            </div>
          </Card>

          <Card className="p-8 text-center space-y-4">
            <Sparkles size={28} style={{ color: ACCENT }} className="mx-auto" />
            <p className="text-sm text-black/60">Ready to generate {fmtDate(dateISO)}'s schedule — {finalSb1.length} small batch, {finalDelegation.length} delegation, {Object.values(focusSlots).filter(Boolean).length} focus blocks{specialTasks.length ? `, ${specialTasks.length} special task${specialTasks.length > 1 ? "s" : ""}` : ""}{nonNegotiables.length ? `, ${nonNegotiables.length} non-negotiable${nonNegotiables.length > 1 ? "s" : ""}` : ""}{showEveningBuilder ? `, ${eveningStops.length} evening stops` : ""}.</p>
            <PrimaryButton onClick={generate} className="mx-auto"><Sparkles size={16} /> Generate Today's Schedule</PrimaryButton>
          </Card>
        </div>
      )}

      <PersonalBlockModal open={pbModalOpen} onClose={() => setPbModalOpen(false)} onSave={addPersonalBlock} />

      <div className="flex justify-between">
        <GhostButton onClick={() => setStep(Math.max(1, step - 1))} className={step === 1 ? "invisible" : ""}><ChevronLeft size={15} /> Back</GhostButton>
        {step < stepTitles.length && <PrimaryButton onClick={() => setStep(step + 1)}>Next <ChevronRight size={15} /></PrimaryButton>}
      </div>

      {newFocusModal && (
        <TaskModal open={!!newFocusModal} onClose={() => setNewFocusModal(null)}
          initial={{ title: "", unit: UNITS[0], priority: "High", importance: "High", category: "focus", workType: FOCUS_TYPES[0], duration: 40, scheduleMode: "AUTO" }}
          onSave={(f) => {
            const t = addTask(f);
            setFocusSlots(prev => ({ ...prev, [newFocusModal]: t.id }));
          }} />
      )}
      {newDelegationModal && (
        <TaskModal open={newDelegationModal} onClose={() => setNewDelegationModal(false)}
          initial={{ title: "", unit: UNITS[0], priority: "High", importance: "High", category: "delegation", workType: DELEGATION_TYPES[0], duration: 20, scheduleMode: "AUTO" }}
          onSave={(f) => {
            const t = addTask(f);
            setDelegation(prev => [...prev, t.id]);
          }} />
      )}
    </div>
  );
}

/* ============================== DAY VIEW ============================== */

const BLOCK_COLOR = { warmup: "#8B8579", smallbatch: SAGE, break: "#C9C7C2", delegation: "#6E7B8B", focus: ACCENT, visit: "#7A5C8B", evening: "#9B5B4A", buffer: "#B7A78E", closure: "#4A5A6E", flexible: "#D8D5CD", personal: "#8B6F9B", special: "#4A6E8B" };

function buildPrintableHTML(plan, tasks, dateISO) {
  const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
  const rows = plan.schedule.map(b => {
    const nn = nnList.some(id => b.taskIds.includes(id));
    const taskLines = (b.taskIds || []).map(id => tasks.find(t => t.id === id)?.title).filter(Boolean);
    const stopLines = (b.stops || []).map((s, i) => `${i + 1}. ${s.label} (${s.group})`);
    const instructionLines = (b.instructions || []).map(id => tasks.find(t => t.id === id)?.title).filter(Boolean).map(t => `→ ${t} (tomorrow)`);
    const sub = [...taskLines, ...stopLines, ...instructionLines];
    return `
      <tr>
        <td class="time">${minsToClock(b.start)}</td>
        <td class="bar" style="background:${BLOCK_COLOR[b.type] || "#ccc"}"></td>
        <td class="body">
          <div class="label">${b.label}${nn ? ' <span class="star">★ Non-Negotiable</span>' : ""}</div>
          ${sub.length ? `<div class="sub">${sub.map(s => `· ${s}`).join("<br/>")}</div>` : ""}
        </td>
        <td class="dur">${b.duration}m</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Schedule — ${fmtDate(dateISO)}</title>
<style>
  body { font-family: Georgia, 'Iowan Old Style', serif; color: #20222B; max-width: 720px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  .sub-h { font-family: ui-sans-serif, system-ui; font-size: 12px; color: #888; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 6px; vertical-align: top; font-family: ui-sans-serif, system-ui; border-bottom: 1px solid #eee; }
  .time { font-size: 11px; color: #666; white-space: nowrap; width: 60px; }
  .bar { width: 4px; padding: 0; }
  .label { font-size: 13px; font-weight: 600; }
  .sub { font-size: 11px; color: #555; margin-top: 3px; line-height: 1.5; }
  .dur { font-size: 11px; color: #999; text-align: right; width: 40px; white-space: nowrap; }
  .star { color: #B8862C; font-size: 11px; font-weight: 600; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <h1>${fmtDate(dateISO)}</h1>
  <div class="sub-h">Executive schedule · generated from Executive Time Scheduler</div>
  <table><tbody>${rows}</tbody></table>
  <script>window.onload = function() { window.print(); };</script>
</body></html>`;
}

function DayView({ dateISO, setDateISO, dayPlans, tasks, savePlan, goPlan, goConclude, addTask }) {
  const plan = dayPlans[dateISO];
  const [dragIdx, setDragIdx] = useState(null);
  const [instructionText, setInstructionText] = useState("");

  const addTomorrowInstruction = () => {
    if (!instructionText.trim()) return;
    const tomorrow = addDays(dateISO, 1);
    const t = addTask({
      title: instructionText.trim(), unit: UNITS[0], priority: "High", importance: "Low",
      category: "smallBatch", workType: "Instruction", duration: 15, scheduleMode: "DEFINE", date: tomorrow,
    });
    const closureIdx = plan.schedule.findIndex(b => b.type === "closure");
    if (closureIdx > -1) {
      const sched = [...plan.schedule];
      sched[closureIdx] = { ...sched[closureIdx], instructions: [...(sched[closureIdx].instructions || []), t.id] };
      savePlan(dateISO, { ...plan, schedule: sched });
    }
    setInstructionText("");
  };

  const downloadSchedule = () => {
    if (!plan) return;
    const html = buildPrintableHTML(plan, tasks, dateISO);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${dateISO}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const reorder = (fromIdx, toIdx) => {
    if (!plan) return;
    const sched = [...plan.schedule];
    const [moved] = sched.splice(fromIdx, 1);
    sched.splice(toIdx, 0, moved);
    let cursor = timeToMins(plan.startTime);
    const relaid = sched.map(b => { const e = { ...b, start: cursor, end: cursor + b.duration }; cursor += b.duration; return e; });
    savePlan(dateISO, { ...plan, schedule: relaid });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between no-print">
        <button onClick={() => setDateISO(addDays(dateISO, -1))}><ChevronLeft size={18} /></button>
        <div className="text-center">
          <h2 className="font-serif text-xl" style={{ color: INK }}>{fmtDate(dateISO)}</h2>
          {dateISO === todayISO() && <span className="text-xs" style={{ color: ACCENT }}>Today</span>}
        </div>
        <button onClick={() => setDateISO(addDays(dateISO, 1))}><ChevronRight size={18} /></button>
      </div>
      <h2 className="font-serif text-xl hidden print-only" style={{ color: INK }}>{fmtDate(dateISO)} — Schedule</h2>

      {!plan ? (
        <Card className="p-10 text-center space-y-3 no-print">
          <Calendar size={26} className="mx-auto text-black/25" />
          <p className="text-sm text-black/45">No plan generated for this day yet.</p>
          <PrimaryButton onClick={goPlan} className="mx-auto">Plan My Day</PrimaryButton>
        </Card>
      ) : (
        <div className="space-y-2 printable-area">
          {plan.schedule.map((b, i) => {
            const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
            const nn = nnList.some(id => b.taskIds.includes(id));
            return (
              <div key={b.key + i} draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
                className="flex gap-3 items-stretch">
                <div className="w-16 shrink-0 text-right pt-3">
                  <p className="text-xs font-medium text-black/50">{minsToClock(b.start)}</p>
                </div>
                <div className="w-1 rounded-full shrink-0" style={{ background: BLOCK_COLOR[b.type] }} />
                <Card className="flex-1 p-3.5" style={nn ? { boxShadow: `0 0 0 1.5px ${ACCENT_WARM}` } : {}}>
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-black/20 cursor-grab no-print" />
                    <p className="text-sm font-medium flex-1" style={{ color: INK }}>{b.label}</p>
                    {nn && <Star size={13} fill={ACCENT_WARM} stroke="none" />}
                    <span className="text-xs text-black/35">{b.duration}m</span>
                  </div>
                  {b.taskIds?.length > 0 && (
                    <div className="mt-1.5 pl-6 space-y-0.5">
                      {b.taskIds.map(id => {
                        const t = tasks.find(x => x.id === id);
                        return t ? <p key={id} className="text-xs text-black/55">· {t.title}</p> : null;
                      })}
                    </div>
                  )}
                  {b.type === "evening" && b.stops?.length > 0 && (
                    <div className="mt-1.5 pl-6 space-y-0.5">
                      {b.stops.map((s, si) => <p key={s.id} className="text-xs text-black/55">{si + 1}. {s.label} <span className="text-black/30">· {s.group}</span></p>)}
                    </div>
                  )}
                  {b.type === "evening" && (!b.stops || b.stops.length === 0) && (
                    <p className="mt-1.5 pl-6 text-xs text-black/35">No stops selected — open for informal rounds.</p>
                  )}
                  {b.type === "personal" && b.category && (
                    <p className="mt-1 pl-6 text-xs text-black/40">{b.category} · no work scheduled</p>
                  )}
                  {b.type === "closure" && (
                    <div className="mt-2 pl-6 space-y-1.5">
                      {(b.instructions || []).map(id => {
                        const t = tasks.find(x => x.id === id);
                        return t ? <p key={id} className="text-xs text-black/55">→ {t.title} <span className="text-black/30">(tomorrow)</span></p> : null;
                      })}
                      <div className="flex gap-1.5 pt-0.5 no-print">
                        <input value={instructionText} onChange={(e) => setInstructionText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addTomorrowInstruction(); }}
                          placeholder="Tomorrow's instruction…"
                          className="flex-1 border border-black/10 rounded-lg px-2.5 py-1.5 text-xs outline-none" />
                        <button onClick={addTomorrowInstruction} className="text-xs font-semibold px-2" style={{ color: ACCENT }}>Add</button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
          <div className="pt-4 flex gap-2 justify-end no-print">
            <GhostButton onClick={downloadSchedule}><Download size={14} /> Download Schedule</GhostButton>
            <GhostButton onClick={goPlan}>Replan</GhostButton>
            <PrimaryButton onClick={goConclude}>Conclude My Day <ArrowRight size={15} /></PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== CONCLUDE DAY ============================== */

function ConcludeDay({ dateISO, dayPlans, tasks, updateTask, updateTasksBulk, savePlan, savePlansBulk, onDone }) {
  const plan = dayPlans[dateISO];
  const workedIds = plan ? Array.from(new Set(plan.schedule.flatMap(b => b.taskIds))) : [];
  const workedTasks = tasks.filter(t => workedIds.includes(t.id));
  const [entries, setEntries] = useState(() => Object.fromEntries(workedTasks.map(t => [t.id, { status: "Progress Made", summary: "", nextAction: "", delegatedTo: "", expectedBy: "", followUpDate: "", followUpCategory: t.category }])));
  const [result, setResult] = useState(null);

  if (!plan) return <Card className="max-w-xl mx-auto p-8 text-center text-sm text-black/45">No plan to conclude for this day.</Card>;
  if (workedTasks.length === 0) return <Card className="max-w-xl mx-auto p-8 text-center text-sm text-black/45">No tasks were scheduled for this day.</Card>;

  const setField = (id, field, val) => setEntries(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const conclude = () => {
    let completed = 0, decisionsClosed = 0, advanced = 0, stalled = 0, carried = 0;
    const patches = {};
    const followUps = []; // { taskId, date, category, duration }
    workedTasks.forEach(t => {
      const e = entries[t.id];
      const session = { date: dateISO, discussion: e.summary, outcome: e.status, nextAction: e.nextAction, owner: e.delegatedTo || null, dueBy: e.expectedBy || null };
      const sessions = [...(t.sessions || []), session];
      if (e.status === "Completed") {
        completed++;
        patches[t.id] = { status: "done", completedAt: Date.now(), sessions };
      } else {
        if (e.status === "Progress Made") advanced++;
        if (t.category === "focus" && sessions.length >= 3 && !e.nextAction) stalled++;
        const cfCount = (t.carryForwardCount || 0) + 1;
        carried++;
        if (e.followUpDate) {
          // Next action pinned to a specific future date — reclassify and place on that day.
          patches[t.id] = {
            sessions, carryForwardCount: cfCount, nextAction: e.nextAction, lastOutcome: e.status,
            status: "open", scheduleMode: "DEFINE", date: e.followUpDate, time: "",
            category: e.followUpCategory, workType: WORK_TYPE_OPTIONS(e.followUpCategory)[0],
          };
          followUps.push({ taskId: t.id, date: e.followUpDate, category: e.followUpCategory, duration: t.duration });
        } else {
          // No specific date — carry it back onto the open board, eligible for the next day planned.
          patches[t.id] = {
            sessions, carryForwardCount: cfCount, nextAction: e.nextAction, lastOutcome: e.status,
            status: "open", scheduleMode: "AUTO", date: "", time: "",
          };
        }
      }
      if (e.status === "Completed" && t.category === "focus") decisionsClosed++;
    });
    updateTasksBulk(patches);

    // If the target day already has a generated schedule, slot the follow-up straight into it.
    // Collected into one bulk write below so concluding today and re-slotting other days
    // never clobber each other, however many dates are touched in this action.
    let workingPlans = {};
    followUps.forEach(({ taskId, date, category, duration }) => {
      const basePlan = workingPlans[date] || dayPlans[date];
      if (!basePlan) return; // no plan yet for that day — it'll surface as a recommendation when planned
      const { schedule } = insertTaskIntoPlan(basePlan, taskId, category, duration);
      workingPlans[date] = { ...basePlan, schedule };
    });

    const focusMin = plan.schedule.filter(b => b.type === "focus").reduce((s, b) => s + b.duration, 0);
    const sbMin = plan.schedule.filter(b => b.type === "smallbatch").reduce((s, b) => s + b.duration, 0);
    const plannedMin = plan.schedule.reduce((s, b) => s + b.duration, 0);
    const productiveMin = focusMin + sbMin;
    const nnList = plan.nonNegotiables || (plan.nonNegotiable ? [plan.nonNegotiable] : []);
    const nnAchievedCount = nnList.filter(id => entries[id]?.status === "Completed").length;

    let classification = "PROGRESS MADE";
    if (decisionsClosed >= 1 && advanced >= 1) classification = "HIGH IMPACT";
    else if (completed >= Math.ceil(workedTasks.length * 0.6)) classification = "PRODUCTIVE";
    else if (completed > advanced * 2) classification = "ADMIN HEAVY";
    else if (stalled >= 1) classification = "STALLED";
    else if (completed === 0 && advanced === 0) classification = "FRAGMENTED";

    const summary = {
      plannedMin, productiveMin, focusMin, sbMin, completed, decisionsClosed, advanced, stalled, carried,
      nonNegotiable: nnList.length ? `${nnAchievedCount}/${nnList.length} Achieved` : "None set",
      classification,
    };
    savePlansBulk({ ...workingPlans, [dateISO]: { ...(workingPlans[dateISO] || plan), concluded: true, result: summary } });
    setResult(summary);
  };

  if (result) {
    const CLASS_COPY = {
      "HIGH IMPACT": "Major decisions and meaningful advancement today.",
      "PRODUCTIVE": "Good planned progress across the board.",
      "PROGRESS MADE": "Important work moved forward despite limited closure.",
      "ADMIN HEAVY": "Many tasks completed but relatively little Focus Work advanced.",
      "FRAGMENTED": "Considerable activity but limited concentration.",
      "STALLED": "Important work repeatedly failed to progress — worth a closer look tomorrow.",
    };
    return (
      <Card className="max-w-xl mx-auto p-7 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>Today's Result</p>
          <h2 className="font-serif text-2xl mt-1" style={{ color: INK }}>{result.classification}</h2>
          <p className="text-sm text-black/55 mt-2">{CLASS_COPY[result.classification]}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[["Planned", `${result.plannedMin}m`], ["Productive", `${result.productiveMin}m`], ["Focus", `${result.focusMin}m`],
            ["Completed", result.completed], ["Decisions", result.decisionsClosed], ["Advanced", result.advanced],
            ["Stalled", result.stalled], ["Carried", result.carried], ["Non-Neg.", result.nonNegotiable]].map(([label, val]) => (
            <div key={label} className="p-3 rounded-xl bg-black/[0.03]">
              <p className="text-base font-semibold" style={{ color: INK }}>{val}</p>
              <p className="text-[10px] text-black/40 uppercase tracking-wide mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <PrimaryButton onClick={onDone} className="w-full">Done</PrimaryButton>
      </Card>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Conclude My Day</h2>
      {workedTasks.map(t => {
        const e = entries[t.id];
        return (
          <Card key={t.id} className="p-4 space-y-3">
            <p className="text-sm font-medium" style={{ color: INK }}>{t.title}</p>
            <select value={e.status} onChange={(ev) => setField(t.id, "status", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
              {CONCLUDE_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input placeholder="Discussion / progress summary" value={e.summary} onChange={(ev) => setField(t.id, "summary", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            <input placeholder="Next action (e.g. Amit to revert by Thursday)" value={e.nextAction} onChange={(ev) => setField(t.id, "nextAction", ev.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
            {e.status !== "Completed" && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" min={dateISO} value={e.followUpDate} onChange={(ev) => setField(t.id, "followUpDate", ev.target.value)}
                  placeholder="Follow-up date" className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                {e.followUpDate && (
                  <select value={e.followUpCategory} onChange={(ev) => setField(t.id, "followUpCategory", ev.target.value)}
                    className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none">
                    <option value="smallBatch">Small Batch</option>
                    <option value="focus">Focus Work</option>
                    <option value="delegation">Delegation & Instructions</option>
                  </select>
                )}
              </div>
            )}
            {e.followUpDate && (
              <p className="text-xs" style={{ color: ACCENT }}>Will be placed on {fmtDate(e.followUpDate)}'s {CATEGORY_LABEL[e.followUpCategory]} schedule.</p>
            )}
            {e.status === "Delegated" && (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Delegated to" value={e.delegatedTo} onChange={(ev) => setField(t.id, "delegatedTo", ev.target.value)}
                  className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
                <input placeholder="Expected by" value={e.expectedBy} onChange={(ev) => setField(t.id, "expectedBy", ev.target.value)}
                  className="border border-black/10 rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
            )}
          </Card>
        );
      })}
      <PrimaryButton onClick={conclude} className="w-full">Close Out Today</PrimaryButton>
    </div>
  );
}

/* ============================== WEEK VIEW ============================== */

/* ============================== EISENHOWER MATRIX ============================== */

const QUADRANTS = [
  { key: "do", title: "Do First", subtitle: "Urgent & Important", priority: "High", importance: "High", color: ALERT, bg: "#FBEFEF" },
  { key: "schedule", title: "Schedule", subtitle: "Important, Not Urgent", priority: "Low", importance: "High", color: ACCENT, bg: "#EEF3F3" },
  { key: "delegate", title: "Delegate", subtitle: "Urgent, Not Important", priority: "High", importance: "Low", color: ACCENT_WARM, bg: "#FBF4E4" },
  { key: "eliminate", title: "Eliminate / Later", subtitle: "Neither Urgent nor Important", priority: "Low", importance: "Low", color: "rgba(0,0,0,0.35)", bg: "#F1F0EC" },
];

function EisenhowerMatrix({ tasks }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const active = tasks.filter(t => t.status !== "done" && (categoryFilter === "all" || t.category === categoryFilter));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="font-serif text-2xl flex items-center gap-2" style={{ color: INK }}><Grid3x3 size={20} /> View Board</h2>
        <p className="text-sm text-black/45 mt-0.5">Eisenhower matrix — from each task's own Priority (urgency) and Importance</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[["all", "All"], ["smallBatch", "Small Batch"], ["focus", "Focus Work"], ["delegation", "Delegation & Instructions"]].map(([id, label]) => (
          <button key={id} onClick={() => setCategoryFilter(id)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border"
            style={{ borderColor: categoryFilter === id ? INK : "rgba(0,0,0,0.1)", background: categoryFilter === id ? INK : "white", color: categoryFilter === id ? "white" : "rgba(0,0,0,0.6)" }}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QUADRANTS.map(q => {
          const items = active.filter(t => t.priority === q.priority && t.importance === q.importance);
          return (
            <Card key={q.key} className="p-4" style={{ background: q.bg }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: INK }}>{q.title}</p>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: q.color }}>{q.subtitle}</p>
                </div>
                <span className="text-xs font-semibold" style={{ color: q.color }}>{items.length}</span>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {items.length === 0 && <p className="text-xs text-black/35">Nothing here.</p>}
                {items.map(t => (
                  <div key={t.id} className="p-2.5 rounded-lg bg-white/70">
                    <p className="text-sm" style={{ color: INK }}>{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Chip tone={categoryChipTone(t.category)}>{t.workType}</Chip>
                      <Chip tone="outline">{t.unit}</Chip>
                      {t.scheduleMode === "DEFINE" && t.date && <Chip tone="outline">{fmtDate(t.date)}</Chip>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== WEEK VIEW ============================== */

function WeekView({ dayPlans, tasks, setDateISO, setTab }) {
  const start = addDays(todayISO(), -(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const CAP = 120;
  const DELEGATION_CAP = 20;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Week View</h2>
      <p className="text-sm text-black/45 -mt-3">Where can I fit this task?</p>
      <div className="space-y-3">
        {days.map(d => {
          const plan = dayPlans[d];
          const definedForDay = tasks.filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === d);
          const sb = plan
            ? plan.schedule.filter(b => b.type === "smallbatch").reduce((s, b) => s + b.duration, 0)
            : definedForDay.filter(t => t.category === "smallBatch").reduce((s, t) => s + t.duration, 0);
          const fw = plan
            ? plan.schedule.filter(b => b.type === "focus").reduce((s, b) => s + b.duration, 0)
            : definedForDay.filter(t => t.category === "focus").reduce((s, t) => s + t.duration, 0);
          const dg = plan
            ? plan.schedule.filter(b => b.type === "delegation").reduce((s, b) => s + b.duration, 0)
            : definedForDay.filter(t => t.category === "delegation").reduce((s, t) => s + t.duration, 0);
          const load = (sb + fw) / (CAP * 2);
          const label = !plan ? (definedForDay.length ? "Partially Scheduled" : "Unplanned") : load >= 0.9 ? "Heavy Day" : load >= 0.5 ? "Moderate Day" : "Light Day";
          const color = !plan ? (definedForDay.length ? ACCENT_WARM : "rgba(0,0,0,0.15)") : load >= 0.9 ? ALERT : load >= 0.5 ? ACCENT_WARM : SAGE;
          return (
            <Card key={d} className="p-4 cursor-pointer" onClick={() => { setDateISO(d); setTab("day"); }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: INK }}>
                  {fmtDate(d)}
                  {plan && <Lock size={12} className="text-black/35" />}
                </p>
                <span className="text-xs font-medium" style={{ color }}>{label}</span>
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-[10px] text-black/40 mb-0.5"><span>Small Batch</span><span>{sb} / {CAP}</span></div>
                  <div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (sb/CAP)*100)}%`, background: SAGE }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-black/40 mb-0.5"><span>Focus</span><span>{fw} / {CAP}</span></div>
                  <div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (fw/CAP)*100)}%`, background: ACCENT }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-black/40 mb-0.5"><span>Delegation & Instructions</span><span>{dg} / {DELEGATION_CAP}</span></div>
                  <div className="h-1.5 rounded-full bg-black/[0.06]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (dg/DELEGATION_CAP)*100)}%`, background: "#6E7B8B" }} /></div>
                </div>
              </div>
              {definedForDay.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-black/[0.06] space-y-1">
                  {definedForDay.map(t => (
                    <p key={t.id} className="text-xs text-black/55 flex items-center gap-1.5">
                      <Calendar size={11} className="text-black/30" /> {t.title} <Chip tone={categoryChipTone(t.category)}>{CATEGORY_LABEL[t.category]}</Chip>
                    </p>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== MONTH VIEW ============================== */

function MonthView({ dayPlans, tasks, setDateISO, setTab }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: startOffset }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)
  );
  const CAP = 240;

  const definedByDate = useMemo(() => {
    const map = {};
    tasks.filter(t => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date).forEach(t => {
      (map[t.date] = map[t.date] || []).push(t);
    });
    return map;
  }, [tasks]);

  const workloadColor = (iso) => {
    const plan = dayPlans[iso];
    if (!plan) return definedByDate[iso]?.length ? "#FBF4E4" : "#F1F0EC";
    const total = plan.schedule.reduce((s, b) => s + (b.type === "focus" || b.type === "smallbatch" ? b.duration : 0), 0);
    const ratio = total / CAP;
    if (ratio > 1) return ALERT;
    if (ratio >= 0.75) return ACCENT_WARM;
    if (ratio >= 0.35) return "#CFE0CC";
    return "#EDEBE5";
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft size={18} /></button>
        <h2 className="font-serif text-xl" style={{ color: INK }}>{base.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
        <button onClick={() => setMonthOffset(m => m + 1)}><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-black/40 uppercase">
        {["S","M","T","W","T","F","S"].map((d,i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((iso, i) => iso ? (
          <button key={i} onClick={() => { setDateISO(iso); setTab("day"); }}
            className="aspect-square rounded-lg flex items-center justify-center text-xs font-medium relative"
            style={{ background: workloadColor(iso), color: INK }}>
            {Number(iso.slice(-2))}
            {iso === todayISO() && <div className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: ACCENT }} />}
            {!dayPlans[iso] && definedByDate[iso]?.length > 0 && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: ACCENT_WARM }} title={definedByDate[iso].map(t => t.title).join(", ")} />}
            {dayPlans[iso] && <Lock size={9} className="absolute top-1 right-1 text-black/40" />}
          </button>
        ) : <div key={i} />)}
      </div>
      <div className="flex gap-3 justify-center flex-wrap pt-2">
        {[["Light", "#EDEBE5"], ["Balanced", "#CFE0CC"], ["Heavy", ACCENT_WARM], ["Overloaded", ALERT], ["Has scheduled task", "#FBF4E4"]].map(([l,c]) => (
          <div key={l} className="flex items-center gap-1.5 text-xs text-black/50"><div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</div>
        ))}
      </div>
    </div>
  );
}

/* ============================== PRODUCTIVITY INTELLIGENCE ============================== */

function Intelligence({ tasks, dayPlans }) {
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), -i));
  const next7 = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i + 1));

  const pastPlans = last7.map(d => dayPlans[d]).filter(Boolean);
  const focusMinPast = pastPlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "focus").reduce((a, b) => a + b.duration, 0), 0);
  const sbMinPast = pastPlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "smallbatch").reduce((a, b) => a + b.duration, 0), 0);
  const decisionsClosed = pastPlans.reduce((s, p) => s + (p.result?.decisionsClosed || 0), 0);
  const advanced = pastPlans.reduce((s, p) => s + (p.result?.advanced || 0), 0);
  const stalled = pastPlans.reduce((s, p) => s + (p.result?.stalled || 0), 0);
  const carried = pastPlans.reduce((s, p) => s + (p.result?.carried || 0), 0);
  const nnTotal = pastPlans.reduce((s, p) => s + (p.nonNegotiables || (p.nonNegotiable ? [p.nonNegotiable] : [])).length, 0);
  const nnAchieved = pastPlans.reduce((s, p) => {
    const m = p.result?.nonNegotiable?.match(/^(\d+)\//);
    return s + (m ? Number(m[1]) : 0);
  }, 0);

  const futurePlans = next7.map(d => dayPlans[d]).filter(Boolean);
  const focusMinFuture = futurePlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "focus").reduce((a, b) => a + b.duration, 0), 0);
  const sbMinFuture = futurePlans.reduce((s, p) => s + p.schedule.filter(b => b.type === "smallbatch").reduce((a, b) => a + b.duration, 0), 0);
  const focusCapTotal = 7 * 120, sbCapTotal = 7 * 120;
  const capacityState = (focusMinFuture / focusCapTotal) > 0.85 ? "Overloaded" : (focusMinFuture / focusCapTotal) > 0.6 ? "Tight" : "Healthy";

  const openHighImportance = tasks.filter(t => t.status !== "done" && t.importance === "High" && (t.carryForwardCount || 0) >= 2);

  // find weekday with most free focus capacity in the next 7 days
  const capacityByDay = next7.map(d => {
    const p = dayPlans[d];
    const used = p ? p.schedule.filter(b => b.type === "focus").reduce((a, b) => a + b.duration, 0) : 0;
    return { d, free: 120 - used };
  }).sort((a, b) => b.free - a.free);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="font-serif text-2xl" style={{ color: INK }}>Productivity Intelligence</h2>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40 mb-2">Last 7 Days</p>
        <div className="grid grid-cols-3 gap-2.5">
          {[["Focus Time", `${focusMinPast}m`], ["Small Batch", `${sbMinPast}m`], ["Decisions Closed", decisionsClosed],
            ["Tasks Advanced", advanced], ["Stalled", stalled], ["Carried Forward", carried],
            ["Non-Neg. Achieved", `${nnAchieved}/${nnTotal}`]].map(([l,v]) => (
            <Card key={l} className="p-3 text-center">
              <p className="text-lg font-semibold" style={{ color: INK }}>{v}</p>
              <p className="text-[10px] text-black/40 uppercase tracking-wide mt-0.5">{l}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/40">Next 7 Days Forecast</p>
          <Chip tone={capacityState === "Overloaded" ? "warn" : capacityState === "Tight" ? "outline" : "smallbatch"}>{capacityState}</Chip>
        </div>
        <Card className="p-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-black/50 mb-1"><span>Focus Capacity</span><span>{focusMinFuture} of {focusCapTotal} min planned</span></div>
            <div className="h-2 rounded-full bg-black/[0.06]"><div className="h-2 rounded-full" style={{ width: `${Math.min(100,(focusMinFuture/focusCapTotal)*100)}%`, background: ACCENT }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-black/50 mb-1"><span>Small Batch Capacity</span><span>{sbMinFuture} of {sbCapTotal} min planned</span></div>
            <div className="h-2 rounded-full bg-black/[0.06]"><div className="h-2 rounded-full" style={{ width: `${Math.min(100,(sbMinFuture/sbCapTotal)*100)}%`, background: SAGE }} /></div>
          </div>
        </Card>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40 mb-2">Recommendations</p>
        <div className="space-y-2">
          {capacityByDay[0] && capacityByDay[0].free > 60 && (
            <Card className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><TrendingUp size={15} className="mt-0.5 shrink-0" style={{color:ACCENT}} />{fmtDate(capacityByDay[0].d)} has the strongest available Focus capacity ({capacityByDay[0].free}m free).</Card>
          )}
          {capacityByDay.filter(c => c.free <= 10).slice(0,1).map(c => (
            <Card key={c.d} className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><AlertTriangle size={15} className="mt-0.5 shrink-0" style={{color:ACCENT_WARM}} />{fmtDate(c.d)} is already Focus-heavy; avoid adding another Focus task.</Card>
          ))}
          {openHighImportance.length > 0 && (
            <Card className="p-3 text-sm flex items-start gap-2" style={{ color: INK }}><Flag size={15} className="mt-0.5 shrink-0" style={{color:ALERT}} />{openHighImportance.length} high-importance task{openHighImportance.length>1?"s have":" has"} carried forward repeatedly — prioritise this week.</Card>
          )}
          {capacityByDay.length === 0 && <p className="text-sm text-black/40">Plan a few more days to unlock forecasting.</p>}
        </div>
      </div>
    </div>
  );
}

/* ============================== APP SHELL ============================== */

const TABS = [
  { id: "board", label: "Board", icon: Layers },
  { id: "matrix", label: "View Board", icon: Grid3x3 },
  { id: "plan", label: "Plan Day", icon: Sparkles },
  { id: "day", label: "Day", icon: Sun },
  { id: "conclude", label: "Conclude", icon: Moon },
  { id: "week", label: "Week", icon: Calendar },
  { id: "month", label: "Month", icon: Calendar },
  { id: "intel", label: "Insight", icon: TrendingUp },
];

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [dayPlans, setDayPlans] = useState({});
  const [personalBlocks, setPersonalBlocks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [tab, setTab] = useState("board");
  const [dateISO, setDateISO] = useState(todayISO());

  useEffect(() => {
    loadAll().then(({ tasks, dayPlans }) => { setTasks(tasks); setDayPlans(dayPlans); });
    loadPersonalBlocks().then((blocks) => { setPersonalBlocks(blocks); setLoaded(true); });
    loadSubmissions().then(setSubmissions);
  }, []);

  const persistTasks = useCallback((updater) => {
    setTasks(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveTasks(next);
      return next;
    });
  }, []);
  const persistPlans = useCallback((updater) => {
    setDayPlans(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveDayPlans(next);
      return next;
    });
  }, []);
  const addPersonalBlock = useCallback((block) => {
    setPersonalBlocks(prev => { const next = [...prev, block]; savePersonalBlocks(next); return next; });
  }, []);
  const persistSubmissions = useCallback((updater) => {
    setSubmissions(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveSubmissions(next);
      return next;
    });
  }, []);
  const addSubmission = useCallback((sub) => {
    setSubmissions(prev => { const next = [...prev, sub]; saveSubmissions(next); return next; });
  }, []);
  const dismissSubmission = useCallback((id) => {
    persistSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: "dismissed" } : s));
  }, [persistSubmissions]);

  const addTask = (form) => {
    const t = { id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form };
    persistTasks(prev => [t, ...prev]);
    return t;
  };
  const addTasksBulk = (forms) => {
    const newOnes = forms.map(form => ({ id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [], ...form }));
    persistTasks(prev => [...newOnes, ...prev]);
    return newOnes;
  };
  const approveSubmission = (sub, priority, importance) => {
    addTask({
      title: sub.title, unit: sub.unit, category: sub.category, workType: sub.workType,
      duration: sub.duration, priority, importance, scheduleMode: "AUTO",
    });
    persistSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, status: "approved" } : s));
  };
  const updateTask = (id, patch) => persistTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  const updateTasksBulk = (patchesById) => persistTasks(prev => prev.map(t => patchesById[t.id] ? { ...t, ...patchesById[t.id] } : t));
  const completeTask = (id) => updateTask(id, { status: "done", completedAt: Date.now() });
  // Functional update so multiple savePlan calls in the same tick (e.g. concluding a day
  // while also placing follow-ups on other dates) chain correctly instead of clobbering each other.
  const savePlan = (date, plan) => persistPlans(prev => ({ ...prev, [date]: plan }));
  const savePlansBulk = (patchesByDate) => persistPlans(prev => ({ ...prev, ...patchesByDate }));

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-sm text-black/40" style={{background: PAPER}}>Loading…</div>;

  return (
    <div className="min-h-screen pb-24" style={{ background: PAPER, fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        .font-serif { font-family: Georgia, 'Iowan Old Style', ui-serif, serif; }
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body, .min-h-screen { background: white !important; }
        }
      `}</style>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
        {tab === "board" && <Board tasks={tasks} addTask={addTask} addTasksBulk={addTasksBulk} updateTask={updateTask} completeTask={completeTask} personalBlocks={personalBlocks} addPersonalBlock={addPersonalBlock} submissions={submissions} addSubmission={addSubmission} approveSubmission={approveSubmission} dismissSubmission={dismissSubmission} />}
        {tab === "matrix" && <EisenhowerMatrix tasks={tasks} />}
        {tab === "plan" && <PlanMyDay tasks={tasks} addTask={addTask} updateTask={updateTask} dayPlans={dayPlans} savePlan={savePlan} jumpToDayView={(d) => { setDateISO(d); setTab("day"); }} personalBlocks={personalBlocks} addPersonalBlock={addPersonalBlock} />}
        {tab === "day" && <DayView dateISO={dateISO} setDateISO={setDateISO} dayPlans={dayPlans} tasks={tasks} savePlan={savePlan} goPlan={() => setTab("plan")} goConclude={() => setTab("conclude")} addTask={addTask} />}
        {tab === "conclude" && <ConcludeDay dateISO={dateISO} dayPlans={dayPlans} tasks={tasks} updateTask={updateTask} updateTasksBulk={updateTasksBulk} savePlan={savePlan} savePlansBulk={savePlansBulk} onDone={() => setTab("intel")} />}
        {tab === "week" && <WeekView dayPlans={dayPlans} tasks={tasks} setDateISO={setDateISO} setTab={setTab} />}
        {tab === "month" && <MonthView dayPlans={dayPlans} tasks={tasks} setDateISO={setDateISO} setTab={setTab} />}
        {tab === "intel" && <Intelligence tasks={tasks} dayPlans={dayPlans} />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-black/[0.06] px-2 py-2 no-print">
        <div className="max-w-4xl mx-auto flex justify-between">
          {TABS.map(t => {
            const Icon = t.icon;
            const sel = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="flex flex-col items-center gap-1 px-1.5 py-1 flex-1">
                <Icon size={18} color={sel ? ACCENT : "rgba(0,0,0,0.35)"} />
                <span className="text-[10px] font-medium" style={{ color: sel ? ACCENT : "rgba(0,0,0,0.35)" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
