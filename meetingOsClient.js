// Reads from Meeting OS (the CPG meetings app) over its integration API. Set MEETING_OS_API_URL
// (the Meeting OS backend, not its website) and MEETING_OS_SECRET (the same value as on the
// Meeting OS backend); while either is empty the link is off and nothing is ever asked.
// Env is read lazily, as in ssoClient.js, so it works whether dotenv loads before or after imports.

const apiUrl = () => String(process.env.MEETING_OS_API_URL || "").trim().replace(/\/+$/, "");
const secret = () => process.env.MEETING_OS_SECRET || "";

export function meetingOsEnabled() {
  return Boolean(apiUrl() && secret());
}

// A Meeting OS backend on a free host can take most of a minute to wake up.
async function call(path, params = {}, timeoutMs = 60000) {
  const url = new URL(`${apiUrl()}/api/integrations/${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { "X-Integration-Secret": secret() }, signal: AbortSignal.timeout(timeoutMs) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(`Meeting OS ${path}: ${res.status}${data?.error ? ` ${data.error}` : ""}`);
  return data;
}

// The Meeting OS accounts an account here can be linked to: [{ id, name, desig, email, role, mobile }].
export async function fetchMeetingOsPeople() {
  return (await call("people", {}, 20000)).people || [];
}

// The action points assigned to one Meeting OS account (or to its mobile number), not done yet,
// created since `since` (ms).
export async function fetchActionPoints({ userId, mobile, since }) {
  return (await call("action-points", { userId, mobile, since })).actionPoints || [];
}
