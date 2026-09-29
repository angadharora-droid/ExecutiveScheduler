// Talks to Meeting OS (the CPG meetings app) over its integration API. Set MEETING_OS_API_URL
// (the Meeting OS backend, not its website) and MEETING_OS_SECRET (the same value as on the
// Meeting OS backend); while either is empty the connection is off and nothing is ever asked.
// Env is read lazily, as in ssoClient.js, so it works whether dotenv loads before or after imports.

const apiUrl = () => String(process.env.MEETING_OS_API_URL || "").trim().replace(/\/+$/, "");
const secret = () => process.env.MEETING_OS_SECRET || "";

export function meetingOsEnabled() {
  return Boolean(apiUrl() && secret());
}

// A Meeting OS backend on a free host can take most of a minute to wake up. A refusal keeps
// Meeting OS's own message and status, so a missing field can be told apart from an outage.
async function call(path, { params = {}, body, timeoutMs = 60000 } = {}) {
  const url = new URL(`${apiUrl()}/api/integrations/${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "X-Integration-Secret": secret(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const err = new Error(data?.error || `Meeting OS ${path}: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Who can call or attend a meeting ([{ id, name, desig, email, mobile }]) and the headers in use.
export async function fetchMeetingOsDirectory() {
  const d = await call("directory", { timeoutMs: 30000 });
  return { people: d.people || [], headers: d.headers || [] };
}

// Saves a new meeting in Meeting OS, which sends its invites. Resolves to the saved meeting:
// { meetingId, refNo, title, date, time, duration, minutes, mode, venue, vcLink, calledBy, attendees }.
export async function createMeetingOsMeeting(meeting) {
  return (await call("meetings", { body: meeting })).meeting;
}

// The action points assigned to one person (by name, or by mobile number), not done yet,
// created since `since` (ms).
export async function fetchActionPoints({ name, mobile, since }) {
  return (await call("action-points", { params: { name, mobile, since } })).actionPoints || [];
}
