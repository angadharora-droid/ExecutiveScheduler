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
export async function loadSubmissions() {
  try {
    const r = await window.storage.get("submissions", true);
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* no data yet */ }
  return [];
}
export async function saveSubmissions(list) {
  try { await window.storage.set("submissions", JSON.stringify(list), true); } catch (e) { console.error(e); }
}
