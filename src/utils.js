export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// All dates are handled in LOCAL time. The previous implementation went through
// toISOString() (UTC): in any timezone ahead of UTC (like IST) that made
// addDays(today, +1) return today again and addDays(today, -1) skip 2 days back —
// breaking the Tomorrow button, Day-view arrows, Week view and follow-up dates.
const pad2 = (n) => String(n).padStart(2, "0");
export const toLocalISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayISO = () => toLocalISO(new Date());
export const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
};
export const minsToClock = (startMin) => {
  const h = Math.floor(startMin / 60) % 24;
  const m = startMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};
export const timeToMins = (t) => {
  if (!t) return 11 * 60;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const minsToTimeStr = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
// "15:30" -> "3:30 PM" for display; empty/undefined stays empty.
export const timeStrToClock = (t) => (t ? minsToClock(timeToMins(t)) : "");

// The date from which an open task counts as overdue, or null. A task is overdue when a
// Conclude Day carried it forward without a specific new date (overdueSince is stamped
// with the day it was missed), or when it was pinned to a day that has already passed.
export const overdueSince = (t) => {
  if (!t || t.status === "done") return null;
  if (t.overdueSince) return t.overdueSince;
  if (t.scheduleMode === "DEFINE" && t.date && t.date < todayISO()) return t.date;
  return null;
};

// Free-text search across everything a task carries: title, unit, activity, notes and the
// Conclude Day comments logged against it.
export const taskMatchesQuery = (t, q) => {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    t.title, t.unit, t.workType, t.notes, t.nextAction,
    ...(t.sessions || []).flatMap(s => [s.discussion, s.nextAction, s.owner, s.outcome]),
  ].filter(Boolean).join(" \n ").toLowerCase();
  return hay.includes(needle);
};
