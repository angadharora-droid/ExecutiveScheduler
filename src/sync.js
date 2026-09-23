// One writer per stored document.
//
// Everything an account keeps — its tasks, its day plans, its personal windows, its
// settings — is one document each on the server, replaced whole on every save. Two things
// used to be able to lose a save:
//
//   1. A burst. Plan My Day re-dating twenty overdue tasks fired a save per task, all at the
//      same instant with nothing keeping them in order, so an older copy could reach the
//      server after the newest one. That is how a freshly generated day vanished.
//   2. A second device. A tab that loaded earlier wrote its older copy over everything done
//      elsewhere since.
//
// Here each document has a single writer: at most one request in flight, and while it runs
// the newest value waits its turn (anything older still waiting is dropped — only the
// latest matters, it contains the rest). Every write names the version of the document it
// was based on; when the server's copy has moved on it refuses, and the changes made here
// since then are merged onto the server's copy and written again. `refresh()` asks whether
// the server has something newer (another device's work) and hands it over the same way.

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// Three-way merge of a map keyed by id (day plans, keyed by date): the server's copy with
// everything that changed here since `base` laid on top — entries added, changed or removed.
// An entry changed both here and there is a real conflict: the server's copy (the later
// save) stands, and the entry is reported in `conflicts` so the user can be told.
export function mergeByKey(base, ours, theirs, conflicts = []) {
  const b = base || {}, o = ours || {}, t = theirs || {};
  const out = { ...t };
  for (const k of new Set([...Object.keys(b), ...Object.keys(o)])) {
    const changedThere = k in t ? (k in b ? !same(b[k], t[k]) : true) : k in b;
    if (!(k in o)) {
      if (k in b && k in t && !changedThere) delete out[k]; // removed here, untouched there
      else if (k in b && changedThere) conflicts.push({ key: k });
    } else if (!(k in b) || !same(b[k], o[k])) {
      if (changedThere && !same(t[k], o[k])) conflicts.push({ key: k });
      else out[k] = o[k];
    }
  }
  return out;
}

// The same for a list of { id } items (tasks, personal windows). Items keep the server's
// order; anything added here goes to the front, where the board puts new tasks.
export function mergeById(base, ours, theirs, conflicts = []) {
  const index = (list) => new Map((list || []).map((x) => [x.id, x]));
  const b = index(base), o = index(ours), t = index(theirs);
  const changedThere = (id) => (t.has(id) ? (b.has(id) ? !same(b.get(id), t.get(id)) : true) : b.has(id));
  const removed = new Set();
  const changed = new Map();
  for (const id of new Set([...b.keys(), ...o.keys()])) {
    if (!o.has(id)) {
      if (b.has(id) && t.has(id) && !changedThere(id)) removed.add(id);
      else if (b.has(id) && changedThere(id)) conflicts.push({ id, title: t.get(id)?.title || b.get(id)?.title || "" });
    } else if (!b.has(id) || !same(b.get(id), o.get(id))) {
      if (changedThere(id) && !same(t.get(id), o.get(id))) conflicts.push({ id, title: t.get(id)?.title || o.get(id)?.title || "" });
      else changed.set(id, o.get(id));
    }
  }
  const kept = (theirs || []).filter((x) => !removed.has(x.id)).map((x) => (changed.has(x.id) ? changed.get(x.id) : x));
  const present = new Set(kept.map((x) => x.id));
  const added = (ours || []).filter((x) => changed.has(x.id) && !present.has(x.id));
  return [...added, ...kept];
}

// For small per-account settings there is nothing to merge: the copy from here wins.
export const keepOurs = (base, ours) => ours;

// What the app's state becomes when the server's copy arrives. Nothing changed here since
// `from`: take theirs as is. Otherwise lay the changes made here since `from` over it — and
// that merged copy has to be saved, because the server does not have it yet.
export function reconcile(prev, from, theirs, merge, conflicts = []) {
  if (prev === from) return { next: theirs, save: false };
  return { next: merge(from, prev, theirs, conflicts), save: true };
}

const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];
const MAX_CONFLICT_ROUNDS = 5;

// `transport.get(key, knownVersion)` resolves { value, version } — or { unchanged: true }
// when the server's version is still `knownVersion`. `transport.put(key, value, baseVersion)`
// resolves { ok: true, version } once written, or { ok: false, conflict: true, value, version }
// when the server refused because its copy had moved past `baseVersion`.
export function createSyncedKey(key, { transport, merge, fallback, parse = JSON.parse }) {
  let version = 0;      // server version of `base`
  let base = fallback;  // the last copy the server and this device agreed on
  let loaded = false;
  let pending = null;   // newest value waiting to be written: { value }
  let inflight = null;  // the write under way
  let retryTimer = null;
  let failures = 0;
  const listeners = new Set();
  const notify = (theirs, from, conflicts = []) => listeners.forEach((cb) => cb(theirs, from, conflicts));
  const read = (raw) => (raw == null ? fallback : parse(raw));

  async function load() {
    try {
      const r = await transport.get(key);
      version = r?.version || 0;
      base = read(r?.value);
    } catch (e) {
      console.error(`Loading ${key} failed`, e);
    }
    loaded = true;
    return base;
  }

  async function write(ours) {
    const from = base;
    let attempt = ours;
    const conflicts = [];
    for (let round = 0; round < MAX_CONFLICT_ROUNDS; round++) {
      const r = await transport.put(key, JSON.stringify(attempt), version);
      if (r && r.ok) {
        version = r.version || version + 1;
        base = attempt;
        if (attempt !== ours) notify(attempt, ours, conflicts);
        return;
      }
      if (!r || !r.conflict) throw new Error(`storage set failed for ${key}`);
      // The server has a newer copy: our changes since `from` go on top of it. Anything
      // changed on both sides keeps the server's version and is reported.
      version = r.version || 0;
      conflicts.length = 0;
      attempt = merge(from, ours, read(r.value), conflicts);
    }
    throw new Error(`Saving ${key}: the server kept changing underneath`);
  }

  function kick() {
    if (inflight || retryTimer || !pending) return;
    const { value } = pending;
    pending = null;
    inflight = write(value).then(
      () => { failures = 0; },
      (e) => {
        failures++;
        console.error(`Saving ${key} failed (attempt ${failures})`, e);
        if (failures > RETRY_DELAYS.length) { console.error(`Giving up on this save of ${key}`); failures = 0; return; }
        if (!pending) pending = { value }; // try again — unless something newer is already waiting
        retryTimer = setTimeout(() => { retryTimer = null; kick(); }, RETRY_DELAYS[failures - 1]);
      }
    ).finally(() => { inflight = null; kick(); });
  }

  function save(value) {
    pending = { value };
    kick();
  }

  async function refresh() {
    if (!loaded || inflight || pending) return; // our own write is about to say where the server stands
    let r;
    try { r = await transport.get(key, version); } catch { return; }
    if (!r || r.unchanged || (r.version || 0) === version) return;
    if (inflight || pending) return;
    const from = base;
    version = r.version || 0;
    base = read(r.value);
    notify(base, from);
  }

  const onRemote = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
  const busy = () => !!(inflight || pending || retryTimer);
  return { load, save, refresh, onRemote, busy };
}
