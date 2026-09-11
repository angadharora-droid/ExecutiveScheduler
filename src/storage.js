import { normalizeWorkTypes, normalizeSettings } from "./constants.js";
import { api } from "./auth.js";

export async function loadAll() {
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
export async function saveTasks(tasks) {
  try { await window.storage.set("tasks", JSON.stringify(tasks)); } catch (e) { console.error(e); }
}
export async function saveDayPlans(dayPlans) {
  try { await window.storage.set("dayplans", JSON.stringify(dayPlans)); } catch (e) { console.error(e); }
}
export async function loadPersonalBlocks() {
  try {
    const r = await window.storage.get("personalblocks");
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* no data yet */ }
  return [];
}
export async function savePersonalBlocks(blocks) {
  try { await window.storage.set("personalblocks", JSON.stringify(blocks)); } catch (e) { console.error(e); }
}
// Unit list is per-user: every account customizes its own dropdowns and
// filters, starting from the built-in defaults.
export async function loadUnits() {
  try {
    const r = await window.storage.get("units");
    if (r && r.value) {
      const u = JSON.parse(r.value);
      if (Array.isArray(u) && u.length) return u;
    }
  } catch (e) { /* no data yet */ }
  return null;
}
export async function saveUnits(units) {
  try { await window.storage.set("units", JSON.stringify(units)); } catch (e) { console.error(e); }
}
// Work Type names and Activity lists are per-user too (not shared): each account
// shapes its own dropdowns, starting from the built-in defaults.
export async function loadWorkTypes() {
  try {
    const r = await window.storage.get("worktypes");
    if (r && r.value) {
      const w = JSON.parse(r.value);
      if (w && typeof w === "object") return normalizeWorkTypes(w);
    }
  } catch (e) { /* no data yet */ }
  return null;
}
export async function saveWorkTypes(workTypes) {
  try { await window.storage.set("worktypes", JSON.stringify(workTypes)); } catch (e) { console.error(e); }
}
// Scheduling preferences (e.g. the Focus Work slot limit) are per-user: each account
// tunes its own, starting from the built-in defaults.
export async function loadSettings() {
  try {
    const r = await window.storage.get("settings");
    if (r && r.value) {
      const s = JSON.parse(r.value);
      if (s && typeof s === "object") return normalizeSettings(s);
    }
  } catch (e) { /* no data yet */ }
  return null;
}
export async function saveSettings(settings) {
  try { await window.storage.set("settings", JSON.stringify(settings)); } catch (e) { console.error(e); }
}
// Submissions have their own API rather than the key/value store: the server keeps one
// row per submission and changes it in place, so a submit-only account sending one and
// the owner approving another at the same moment never overwrite each other.
export async function loadSubmissions() {
  try {
    const d = await api("/api/submissions");
    return Array.isArray(d.submissions) ? d.submissions : [];
  } catch (e) { console.error(e); return []; }
}
export async function createSubmission(form) {
  const d = await api("/api/submissions", { method: "POST", body: form });
  return d.submission;
}
export async function updateSubmissionStatus(id, status) {
  await api(`/api/submissions/${encodeURIComponent(id)}`, { method: "PUT", body: { status } });
}
