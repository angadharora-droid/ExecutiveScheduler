import { normalizeWorkTypes, normalizeSettings } from "./constants.js";
import { api } from "./auth.js";
import { createSyncedKey, mergeByKey, mergeById, keepOurs } from "./sync.js";

// Each account's documents, each with a single writer that keeps saves in order and merges
// instead of overwriting when the server's copy has moved on (see sync.js). The server's
// key/value API is reached through the window.storage shim in main.jsx.
const transport = {
  get: (key, knownVersion) => window.storage.get(key, { knownVersion }),
  put: (key, value, baseVersion) => window.storage.set(key, value, { baseVersion }),
};
const synced = (key, merge, fallback) => createSyncedKey(key, { transport, merge, fallback });
const docs = {
  tasks: synced("tasks", mergeById, []),
  dayplans: synced("dayplans", mergeByKey, {}),
  personalblocks: synced("personalblocks", mergeById, []),
  // Unit list, Work Type names / Activity lists and scheduling preferences are per-user too:
  // every account shapes its own dropdowns and limits, starting from the built-in defaults.
  // Small and rarely edited, so when two copies clash the one from here simply wins.
  units: synced("units", keepOurs, null),
  worktypes: synced("worktypes", keepOurs, null),
  settings: synced("settings", keepOurs, null),
};

export async function loadAll() {
  const [tasks, dayPlans] = await Promise.all([docs.tasks.load(), docs.dayplans.load()]);
  return {
    tasks: Array.isArray(tasks) ? tasks : [],
    dayPlans: dayPlans && typeof dayPlans === "object" && !Array.isArray(dayPlans) ? dayPlans : {},
  };
}
export const saveTasks = (tasks) => docs.tasks.save(tasks);
export const saveDayPlans = (dayPlans) => docs.dayplans.save(dayPlans);
export async function loadPersonalBlocks() {
  const blocks = await docs.personalblocks.load();
  return Array.isArray(blocks) ? blocks : [];
}
export const savePersonalBlocks = (blocks) => docs.personalblocks.save(blocks);
export async function loadUnits() {
  const u = await docs.units.load();
  return Array.isArray(u) && u.length ? u : null;
}
export const saveUnits = (units) => docs.units.save(units);
export async function loadWorkTypes() {
  const w = await docs.worktypes.load();
  return w && typeof w === "object" ? normalizeWorkTypes(w) : null;
}
export const saveWorkTypes = (workTypes) => docs.worktypes.save(workTypes);
export async function loadSettings() {
  const s = await docs.settings.load();
  return s && typeof s === "object" ? normalizeSettings(s) : null;
}
export const saveSettings = (settings) => docs.settings.save(settings);

// The server refused a save because its copy had moved on (another device, or an older save
// of the same burst), and the merged result is what was written: `cb(theirs, from)` gets that
// copy and the copy this device last agreed on. Returns the unsubscribe.
export const onRemote = (key, cb) => docs[key].onRemote(cb);
// True while a save is still on its way to the server.
export const hasUnsavedChanges = () => Object.values(docs).some((d) => d.busy());

// Submissions have their own API rather than the key/value store: the server keeps one
// row per submission and changes it in place, so one user sending and another approving
// at the same moment never overwrite each other. The list holds both what is in the
// signed-in user's inbox and what they have sent.
export async function loadSubmissions() {
  try {
    const d = await api("/api/submissions");
    return Array.isArray(d.submissions) ? d.submissions : [];
  } catch (e) { console.error(e); return []; }
}
// `form.to` may name one receiver or several; one submission comes back per receiver.
export async function createSubmission(form) {
  const d = await api("/api/submissions", { method: "POST", body: form });
  return Array.isArray(d.submissions) && d.submissions.length ? d.submissions : [d.submission];
}
// `body` is a decision by the receiver ({ status, reason }) or a sender action ({ action }).
export async function updateSubmission(id, body) {
  await api(`/api/submissions/${encodeURIComponent(id)}`, { method: "PUT", body });
}
// Everyone a task can be sent to: [{ username, name }].
export async function loadDirectory() {
  try {
    const d = await api("/api/users");
    return Array.isArray(d.users) ? d.users : [];
  } catch (e) { console.error(e); return []; }
}
// The receiver's own units and work types, so what is sent matches their board.
export async function loadSendOptions(to) {
  return api(`/api/submissions/options?to=${encodeURIComponent(to)}`);
}
