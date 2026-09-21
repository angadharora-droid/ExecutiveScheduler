import { uid, addDays, fmtDate, todayISO } from "./utils.js";

/* ============================== TASK FREQUENCY ============================== */

// A task may carry a repeat rule:
//   { freq: "daily" | "days" | "weekly" | "monthly", days: [0-6], until: "YYYY-MM-DD" | "",
//     time: "HH:MM" | "", anchor: "YYYY-MM-DD" }
// `days` are the chosen weekdays for "days"; `anchor` (the date the rule was set on) gives
// "weekly" its weekday and "monthly" its day of the month; `time` is the series' clock time,
// kept here because carrying an unfinished task forward clears the task's own time.
//
// Only one occurrence is ever open on the board. Completing it rolls the series forward: the
// next occurrence is added, pinned (Define Time) to its date, so it is pulled into that day's
// plan like any other dated task. Changing the rule on the open task changes what comes next.
export const REPEAT_OPTIONS = [
  ["none", "Does not repeat"],
  ["daily", "Every day"],
  ["days", "On selected days"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Monday-first, to match the Week view.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const isRepeating = (t) => !!t?.repeat?.freq && t.repeat.freq !== "none";

const asDate = (iso) => new Date(iso + "T00:00:00");
const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

// The Sunday that closes the (Monday–Sunday) week holding `iso`, and the month's last day.
export const endOfWeek = (iso) => { const wd = asDate(iso).getDay(); return wd === 0 ? iso : addDays(iso, 7 - wd); };
export const endOfMonth = (iso) => { const d = asDate(iso); return addDays(iso, daysInMonth(d) - d.getDate()); };

const ruleMatches = (repeat, dateISO) => {
  const d = asDate(dateISO);
  const a = repeat.anchor ? asDate(repeat.anchor) : d;
  switch (repeat.freq) {
    case "daily": return true;
    case "days": return (repeat.days || []).includes(d.getDay());
    case "weekly": return d.getDay() === a.getDay();
    // The 31st falls back to the last day of a shorter month.
    case "monthly": return d.getDate() === Math.min(a.getDate(), daysInMonth(d));
    default: return false;
  }
};

// First date after `afterISO` the rule fires on, or null once the series has run out.
export function nextOccurrence(repeat, afterISO) {
  if (!repeat?.freq || repeat.freq === "none") return null;
  for (let i = 1; i <= 400; i++) {
    const d = addDays(afterISO, i);
    if (repeat.until && d > repeat.until) return null;
    if (ruleMatches(repeat, d)) return d;
  }
  return null;
}

// Will this open task come round again on `dateISO`? (A later occurrence that isn't on the
// board yet — used to show the series across the Week view.)
export const occursOn = (t, dateISO) =>
  isRepeating(t) && t.status !== "done" && !!t.date && dateISO > t.date &&
  (!t.repeat.until || dateISO <= t.repeat.until) && ruleMatches(t.repeat, dateISO);

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

// "Daily · till Sun, 27 Sep" — the rule in a few words, for chips and hints.
export function describeRepeat(repeat) {
  if (!repeat?.freq || repeat.freq === "none") return "";
  const a = repeat.anchor ? asDate(repeat.anchor) : null;
  const days = DAY_ORDER.filter(d => (repeat.days || []).includes(d));
  const what =
    repeat.freq === "daily" ? "Daily"
    : repeat.freq === "days" ? (days.length === 7 ? "Daily" : days.length ? days.map(d => DAY_SHORT[d]).join(", ") : "No days chosen")
    : repeat.freq === "weekly" ? `Weekly${a ? ` · ${DAY_SHORT[a.getDay()]}` : ""}`
    : `Monthly${a ? ` · ${ordinal(a.getDate())}` : ""}`;
  return repeat.until ? `${what} · till ${fmtDate(repeat.until)}` : what;
}

// The task that follows `t` once it is completed on `completedOn`, or null — when `t` does
// not repeat, its series has run out, or it already rolled forward (`repeatNextId` still on
// the board), which keeps a restore-and-complete-again from doubling the series.
export function nextOccurrenceTask(t, completedOn, tasks) {
  if (!isRepeating(t)) return null;
  if (t.repeatNextId && tasks.some(x => x.id === t.repeatNextId)) return null;
  // Finished late → the next one after the day it was finished; finished ahead of time → the
  // next one after its date. Never before today (a day concluded late must not put an
  // already-missed occurrence on the board).
  const from = [t.date || "", completedOn, addDays(todayISO(), -1)].sort().pop();
  const date = nextOccurrence(t.repeat, from);
  if (!date) return null;
  /* eslint-disable no-unused-vars */
  const { id, status, createdAt, completedAt, sessions, carryForwardCount, overdueSince, nextAction, lastOutcome, carriedFrom, repeatNextId, repeatFrom, ...rest } = t;
  /* eslint-enable no-unused-vars */
  return {
    ...rest, id: uid(), status: "open", createdAt: Date.now(), carryForwardCount: 0, sessions: [],
    scheduleMode: "DEFINE", date, time: t.repeat.time || "", overdueSince: null, repeatFrom: t.id,
  };
}
