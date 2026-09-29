// Meeting OS, the group's shared record of meetings. Meetings are created from the Board's
// Meeting tab: saved in Meeting OS (which sends the invites), put on the creator's board at their
// time, and sent to attendees who have an account here as invites to accept.
import { isWindow } from "../constants.js";
import { api } from "../auth.js";

// A meeting is any task whose activity says so ("Meeting", "Board meeting", …).
export const isMeetingTask = (t) => !!t && !isWindow(t) && /meeting/i.test(t.workType || "");

// The activity a meeting gets on this board: its own activity with "meeting" in the name.
export const meetingActivity = (activityOptions) => activityOptions("focus").find((a) => /meeting/i.test(a)) || "Meeting";

// The lengths Meeting OS offers, and the one nearest to a number of minutes (a tie takes the longer).
export const MEETING_DURATIONS = [["30 minutes", 30], ["45 minutes", 45], ["1 hour", 60], ["1.5 hours", 90], ["2 hours", 120], ["3 hours", 180]];
export const nearestDuration = (minutes) => {
  const m = Number(minutes) || 60;
  return MEETING_DURATIONS.reduce((best, d) => (Math.abs(d[1] - m) <= Math.abs(best[1] - m) ? d : best))[0];
};
export const durationMinutes = (label) => (MEETING_DURATIONS.find((d) => d[0] === label) || [null, 60])[1];

// { enabled } — whether this server is connected to Meeting OS.
export async function loadMeetingOsStatus() {
  try { return await api("/api/meeting-os/status"); }
  catch { return { enabled: false }; }
}

// { people: [{ id, name, desig, email, mobile, account }], headers, me } — `account` is the
// username here of a person who has one, `me` the person the signed-in account is.
export const loadMeetingOsDirectory = () => api("/api/meeting-os/directory");

// Saves the meeting in Meeting OS: { meeting, invites }.
export const saveMeetingOsMeeting = (body) => api("/api/meeting-os/meetings", { method: "POST", body });
