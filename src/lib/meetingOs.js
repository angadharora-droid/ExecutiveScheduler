// Meeting OS, the CPG meetings app. A Meeting task on the board can be scheduled there: its own
// New Meeting form opens inside a dialog here, filled in from the task, and says when the
// meeting is saved. Only accounts linked to a Meeting OS account (on /admin) are offered this.
import { isWindow } from "../constants.js";
import { api } from "../auth.js";

export const MEETING_OS_URL = (import.meta.env.VITE_MEETING_OS_URL || "https://meetingos.centrepointgroup.in").replace(/\/+$/, "");
const MEETING_OS_ORIGIN = new URL(MEETING_OS_URL).origin;

// A meeting is any task whose activity says so ("Meeting", "Board meeting", …).
export const isMeetingTask = (t) => !!t && !isWindow(t) && /meeting/i.test(t.workType || "");

// Meeting OS's New Meeting form with the task's title, date, time, length and unit filled in.
// `embed` shows it without Meeting OS's own header and menus, for the dialog here.
export function newMeetingUrl(task, { embed = false } = {}) {
  const q = new URLSearchParams();
  q.set("title", task.title || "");
  if (task.scheduleMode === "DEFINE" && task.date) {
    q.set("date", task.date);
    if (task.time) q.set("time", task.time);
  }
  if (Number(task.duration) > 0) q.set("minutes", String(task.duration));
  if (task.unit) q.set("unit", task.unit);
  if (embed) { q.set("embed", "scheduler"); q.set("parent", window.location.origin); }
  return `${MEETING_OS_URL}/new-meeting?${q}`;
}

// The "meeting saved" message from the Meeting OS page inside `frame`, or null for anything else.
export function savedMeetingFrom(event, frame) {
  if (event.origin !== MEETING_OS_ORIGIN || !frame || event.source !== frame.contentWindow) return null;
  const d = event.data;
  return d && d.type === "meeting-os:saved" && d.meetingId ? d : null;
}

// { enabled, linked, name } — whether this account is offered Meeting OS.
export async function loadMeetingOsStatus() {
  try { return await api("/api/meeting-os/status"); }
  catch { return { enabled: false, linked: false, name: "" }; }
}
