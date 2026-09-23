import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { MongoClient } from "mongodb";
import { verifySsoToken, directoryGuard } from "./ssoClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Add it to .env locally or as a Railway variable.");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db("executive_scheduler");
const kv = db.collection("kv");
const users = db.collection("users");
const config = db.collection("config");
const submissions = db.collection("submissions");
console.log("Connected to MongoDB");

/* ------------------------------ auth helpers ------------------------------ */

const scryptHash = (password, salt = crypto.randomBytes(16).toString("hex")) =>
  salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");

const verifyPassword = (password, stored) => {
  try {
    const [salt, hash] = stored.split(":");
    const check = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch {
    return false;
  }
};

// Session-signing secret: from env if provided, otherwise generated once and
// kept in the DB so logins survive server restarts/redeploys.
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  const doc = await config.findOneAndUpdate(
    { _id: "session_secret" },
    { $setOnInsert: { value: crypto.randomBytes(32).toString("hex") } },
    { upsert: true, returnDocument: "after" }
  );
  SECRET = doc.value;
}

// Every account is a full account with its own board. The old "submitter" (submit-only)
// role is gone: accounts still stored with it are simply read as members.
const roleOf = (user) => (user.role === "admin" ? "admin" : "member");

const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
const makeToken = (user) => {
  const payload = Buffer.from(
    JSON.stringify({ u: user._id, n: user.name, r: roleOf(user), exp: Date.now() + 30 * 86400000 })
  ).toString("base64url");
  return payload + "." + sign(payload);
};
const parseToken = (token) => {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
};

// First run: seed an admin account so there's a way in.
if ((await users.countDocuments()) === 0) {
  const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin123";
  await users.insertOne({ _id: username, name: "Admin", role: "admin", passwordHash: scryptHash(password), createdAt: new Date() });
  console.log(`Seeded admin user "${username}"${process.env.ADMIN_PASSWORD ? "" : " with default password \"admin123\" — log in and change it"}`);
}

const auth = (req, res, next) => {
  const session = parseToken((req.headers.authorization || "").replace(/^Bearer /, ""));
  if (!session) return res.status(401).json({ error: "unauthorized" });
  req.session = session;
  next();
};
const adminOnly = (req, res, next) =>
  req.session.r === "admin" ? next() : res.status(403).json({ error: "admin only" });

const ROLES = ["admin", "member"];
const publicUser = (u) => ({ username: u._id, name: u.name, role: roleOf(u) });

/* ------------------------------- submissions ------------------------------ */

// Submissions used to live as one JSON array under the shared kv key, which every account
// rewrote wholesale (two people acting at once could lose each other's changes). They now
// have their own collection, one row each; move the old inbox across once.
{
  const legacy = await kv.findOne({ _id: "shared:submissions" });
  if (legacy && !legacy.migratedAt) {
    let list = [];
    try { list = JSON.parse(legacy.value || "[]"); } catch { list = []; }
    let moved = 0;
    for (const s of Array.isArray(list) ? list : []) {
      if (!s || !s.id) continue;
      const { id, ...rest } = s;
      const r = await submissions.updateOne({ _id: id }, { $setOnInsert: { owner: null, ...rest } }, { upsert: true });
      if (r.upsertedCount) moved++;
    }
    await kv.updateOne({ _id: "shared:submissions" }, { $set: { migratedAt: new Date() } });
    console.log(`Moved ${moved} submissions from the shared inbox into the submissions collection`);
  }
}

// A submission is a task one user sends to another. The receiver (`owner`) has to approve it
// before it lands on their board; declining it ("dismissed", with an optional reason) sends
// it back to the sender, who also sees every other status change on what they sent.
//   kind "task"   — a task handed to someone.
//   kind "invite" — an Executive Interaction: the sender asks the receiver to join them for
//                   one of their own tasks at a set date (and time).
const DECISIONS = ["approved", "dismissed"];
const KINDS = ["task", "invite"];
const CATEGORIES = ["smallBatch", "focus", "delegation"];
const cleanDate = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
const cleanTime = (s) => (typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : "");
const publicSubmission = ({ _id, ...rest }) => ({ id: _id, ...rest });
// An account's inbox: submissions addressed to it, plus the old shared ones (owner null —
// rows from before submissions were addressed to a person) that any board may pick up.
const inboxFilter = (username) => ({ $or: [{ owner: username }, { owner: null }] });

/* --------------------------------- routes --------------------------------- */

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await users.findOne({ _id: username });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Wrong username or password" });
  }
  res.json({ token: makeToken(user), user: publicUser(user) });
});

// Central sign-on from the CPG portal: the browser brings a hand-off token, the auth service
// says which local account (the lowercased username, i.e. users._id) it is linked to, and that
// account is signed in exactly as /api/auth/login does. Always 401 while AUTH_SERVICE_URL is
// not set; the password login above is untouched.
app.post("/api/auth/sso", async (req, res) => {
  const verified = await verifySsoToken(String(req.body.token || ""));
  if (!verified) return res.status(401).json({ error: "SSO sign-in failed" });
  const user = await users.findOne({ _id: String(verified.localUserId || "").trim().toLowerCase() });
  if (!user) return res.status(404).json({ error: "No account linked" });
  res.json({ token: makeToken(user), user: publicUser(user) });
});

// User directory for the portal's admin screen (shared-secret guarded). `id` is the username the
// SSO route looks accounts up by; there is no email on file. Password hashes are never included.
app.get("/api/sso/users", directoryGuard, async (req, res) => {
  const list = await users.find({}, { projection: { name: 1, role: 1 } }).sort({ createdAt: 1 }).toArray();
  res.json(list.map((u) => ({ id: u._id, name: u.name, email: "", role: roleOf(u) })));
});

app.get("/api/auth/me", auth, async (req, res) => {
  const user = await users.findOne({ _id: req.session.u });
  if (!user) return res.status(401).json({ error: "unauthorized" });
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/change-password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: "New password must be at least 4 characters" });
  const user = await users.findOne({ _id: req.session.u });
  if (!user || !verifyPassword(String(currentPassword || ""), user.passwordHash)) {
    return res.status(401).json({ error: "Current password is wrong" });
  }
  await users.updateOne({ _id: user._id }, { $set: { passwordHash: scryptHash(String(newPassword)) } });
  res.json({ ok: true });
});

app.get("/api/auth/users", auth, adminOnly, async (req, res) => {
  const list = await users.find({}).sort({ createdAt: 1 }).toArray();
  res.json({ users: list.map(publicUser) });
});

app.post("/api/auth/users", auth, adminOnly, async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const name = String(req.body.name || "").trim() || username;
  const password = String(req.body.password || "");
  const role = ROLES.includes(req.body.role) ? req.body.role : "member";
  if (!/^[a-z0-9._-]{2,30}$/.test(username)) return res.status(400).json({ error: "Username: 2–30 letters/numbers (no spaces)" });
  if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
  if (await users.findOne({ _id: username })) return res.status(409).json({ error: "That username already exists" });
  await users.insertOne({ _id: username, name, role, passwordHash: scryptHash(password), createdAt: new Date() });
  res.json({ ok: true });
});

// Who a task can be sent to: every account, by name. Open to all signed-in users (the
// admin-only list above also carries roles).
app.get("/api/users", auth, async (req, res) => {
  const list = await users.find({}).sort({ name: 1 }).toArray();
  res.json({ users: list.map((u) => ({ username: u._id, name: u.name })) });
});

app.put("/api/auth/users/:username/password", auth, adminOnly, async (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
  const r = await users.updateOne({ _id: req.params.username }, { $set: { passwordHash: scryptHash(password) } });
  if (!r.matchedCount) return res.status(404).json({ error: "No such user" });
  res.json({ ok: true });
});

app.delete("/api/auth/users/:username", auth, adminOnly, async (req, res) => {
  const username = req.params.username;
  if (username === req.session.u) return res.status(400).json({ error: "You can't delete your own account" });
  const target = await users.findOne({ _id: username });
  if (!target) return res.status(404).json({ error: "No such user" });
  if (target.role === "admin" && (await users.countDocuments({ role: "admin" })) <= 1) {
    return res.status(400).json({ error: "Can't delete the last admin" });
  }
  await users.deleteOne({ _id: username });
  // Nobody is left to approve what was waiting on this user — it goes back to its senders.
  await submissions.updateMany(
    { owner: username, status: "pending" },
    { $set: { status: "dismissed", reason: "This account was removed", decidedAt: Date.now(), decidedBy: req.session.u } }
  );
  res.json({ ok: true });
});

// Each user's data lives under "<username>:<key>"; keys marked shared
// (?shared=1) live under "shared:<key>" and are visible to every account.
//
// Every document carries a version that goes up by one on each write. A client sends the
// version its copy was based on (`baseVersion`); when the document has moved on since —
// another device, or an earlier save of the same burst — the write is refused with 409 and
// the current copy, and the client merges its changes onto that instead of writing over it.
// A read may pass ?v=<version> to hear only whether anything changed.
{
  // Documents from before versions existed start at 1, so a client that failed to load one
  // (and so holds version 0) can never write over it.
  const r = await kv.updateMany({ version: { $exists: false } }, { $set: { version: 1 } });
  if (r.modifiedCount) console.log(`Stamped version 1 on ${r.modifiedCount} stored documents`);
}
const storageId = (req) =>
  (req.query.shared === "1" ? "shared" : req.session.u) + ":" + req.params.key;

app.get("/api/storage/:key", auth, async (req, res) => {
  try {
    const doc = await kv.findOne({ _id: storageId(req) });
    const version = doc?.version || 0;
    if (req.query.v !== undefined && Number(req.query.v) === version) return res.json({ version, unchanged: true });
    res.json({ value: doc ? doc.value : null, version });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "storage read failed" });
  }
});

app.put("/api/storage/:key", auth, async (req, res) => {
  try {
    const id = storageId(req);
    const { value, baseVersion } = req.body || {};
    const fields = { value, updatedAt: new Date(), updatedBy: req.session.u };
    if (typeof baseVersion !== "number") {
      // A page loaded before versions existed cannot say what its copy was based on, so it is
      // not allowed to write over what is here now — it has to be reloaded first.
      return res.status(409).json({ error: "This screen is out of date — reload the app to keep saving", version: (await kv.findOne({ _id: id }))?.version || 0 });
    }
    const conflict = async () => {
      const cur = await kv.findOne({ _id: id });
      res.status(409).json({ error: "conflict", value: cur ? cur.value : null, version: cur?.version || 0 });
    };
    if (baseVersion === 0) {
      // The client has never seen this document: create it — unless it exists by now.
      try { await kv.insertOne({ _id: id, ...fields, version: 1 }); }
      catch (e) { if (e.code === 11000) return conflict(); throw e; }
      return res.json({ ok: true, version: 1 });
    }
    const r = await kv.updateOne({ _id: id, version: baseVersion }, { $set: { ...fields, version: baseVersion + 1 } });
    if (!r.matchedCount) return conflict();
    res.json({ ok: true, version: baseVersion + 1 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "storage write failed" });
  }
});

// Everything that concerns the signed-in user: what is in their inbox and what they have
// sent (minus the sent ones they cleared away). The client tells the two apart.
app.get("/api/submissions", auth, async (req, res) => {
  const me = req.session.u;
  const list = await submissions
    .find({ $or: [...inboxFilter(me).$or, { submittedByUser: me, senderCleared: { $ne: true } }] })
    .sort({ submittedAt: 1 }).toArray();
  res.json({ submissions: list.map(publicSubmission) });
});

// Dropdown choices for the send form: the receiver's own units and work types (each account
// customises these) so what arrives matches their board — or null, and the client falls
// back to the defaults. Without `to`, the signed-in user's own.
app.get("/api/submissions/options", auth, async (req, res) => {
  const to = String(req.query.to || req.session.u).trim().toLowerCase();
  const owner = await users.findOne({ _id: to });
  if (!owner) return res.status(404).json({ error: "No such user" });
  const readJson = async (key) => {
    const doc = await kv.findOne({ _id: `${owner._id}:${key}` });
    try { return doc && doc.value ? JSON.parse(doc.value) : null; } catch { return null; }
  };
  res.json({
    owner: { username: owner._id, name: owner.name },
    units: await readJson("units"),
    workTypes: await readJson("worktypes"),
  });
});

app.post("/api/submissions", auth, async (req, res) => {
  const me = await users.findOne({ _id: req.session.u });
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const b = req.body || {};
  const title = String(b.title || "").trim();
  if (!title) return res.status(400).json({ error: "Say what needs to happen" });
  // One receiver or several (`to` is a username or a list of them): each gets a copy of
  // their own to approve, so one person's decision never touches another's.
  const toList = [...new Set((Array.isArray(b.to) ? b.to : [b.to]).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))];
  const receivers = (await Promise.all(toList.map((id) => users.findOne({ _id: id })))).filter(Boolean);
  if (!receivers.length) return res.status(400).json({ error: "Choose who this goes to" });
  if (receivers.some((r) => r._id === me._id)) return res.status(400).json({ error: "That's you — add it to your own board instead" });
  const kind = KINDS.includes(b.kind) ? b.kind : "task";
  const date = cleanDate(b.date);
  if (kind === "invite" && !date) return res.status(400).json({ error: "An invite needs a date" });
  const duration = Math.round(Number(b.duration));
  const base = {
    kind,
    title,
    unit: String(b.unit || "").trim(),
    category: CATEGORIES.includes(b.category) ? b.category : "smallBatch",
    workType: String(b.workType || "").trim(),
    duration: Number.isFinite(duration) && duration > 0 ? duration : 15,
    notes: String(b.notes || "").trim(),
    // When the sender would like it done. The receiver may change either on approval.
    date,
    time: date ? cleanTime(b.time) : "",
    sourceTaskId: kind === "invite" ? String(b.sourceTaskId || "") : "",
    submittedBy: me.name,
    submittedByUser: me._id,
    status: "pending",
    submittedAt: Date.now(),
  };
  const subs = receivers.map((r) => ({ _id: crypto.randomBytes(8).toString("hex"), ...base, owner: r._id, ownerName: r.name }));
  for (const sub of subs) await submissions.insertOne(sub);
  res.json({ submission: publicSubmission(subs[0]), submissions: subs.map(publicSubmission) });
});

// The receiver decides a pending submission (approve / decline with a reason). The sender
// may withdraw one that is still pending, or clear a decided one out of their Sent list.
app.put("/api/submissions/:id", auth, async (req, res) => {
  const me = req.session.u;
  const { status, action } = req.body || {};
  let r;
  if (DECISIONS.includes(status)) {
    r = await submissions.updateOne(
      { _id: req.params.id, status: "pending", ...inboxFilter(me) },
      { $set: { status, reason: status === "dismissed" ? String(req.body.reason || "").trim().slice(0, 300) : "", decidedAt: Date.now(), decidedBy: me } }
    );
  } else if (action === "withdraw") {
    r = await submissions.updateOne(
      { _id: req.params.id, status: "pending", submittedByUser: me },
      { $set: { status: "withdrawn", decidedAt: Date.now(), decidedBy: me, senderCleared: true } }
    );
  } else if (action === "clear") {
    r = await submissions.updateOne(
      { _id: req.params.id, status: { $ne: "pending" }, submittedByUser: me },
      { $set: { senderCleared: true } }
    );
  } else {
    return res.status(400).json({ error: "Bad request" });
  }
  if (!r.matchedCount) return res.status(404).json({ error: "That submission is no longer waiting" });
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

app.listen(PORT, () => console.log(`Executive Scheduler running on port ${PORT}`));
