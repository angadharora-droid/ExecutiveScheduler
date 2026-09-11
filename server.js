import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { MongoClient } from "mongodb";

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

const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
const makeToken = (user) => {
  const payload = Buffer.from(
    JSON.stringify({ u: user._id, n: user.name, r: user.role, exp: Date.now() + 30 * 86400000 })
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
// Submit-only accounts have no board of their own: they can only send submissions.
const fullAccountOnly = (req, res, next) =>
  req.session.r === "submitter" ? res.status(403).json({ error: "submit-only account" }) : next();

const ROLES = ["admin", "member", "submitter"];
// `owner` is set on submit-only accounts: the username whose inbox receives what they send.
const publicUser = (u) => ({ username: u._id, name: u.name, role: u.role, owner: u.owner || null });

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

const SUBMISSION_STATUSES = ["pending", "approved", "dismissed"];
const CATEGORIES = ["smallBatch", "focus", "delegation"];
const publicSubmission = ({ _id, ...rest }) => ({ id: _id, ...rest });
// What a full account sees in its inbox: submissions addressed to it, plus the shared ones
// (owner null — legacy rows and suggestions made from inside the app) that any board may
// pick up, which is how the inbox always behaved.
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
  // A submit-only account is tied to the owner whose inbox receives what it sends
  // (defaults to the admin creating it).
  let owner = null;
  if (role === "submitter") {
    owner = String(req.body.owner || req.session.u).trim().toLowerCase();
    const target = await users.findOne({ _id: owner });
    if (!target || target.role === "submitter") return res.status(400).json({ error: "Choose an admin or member account to receive this user's submissions" });
  }
  await users.insertOne({ _id: username, name, role, owner, passwordHash: scryptHash(password), createdAt: new Date() });
  res.json({ ok: true });
});

// Point a submit-only account at a different owner. Its pending submissions follow it.
app.put("/api/auth/users/:username/owner", auth, adminOnly, async (req, res) => {
  const target = await users.findOne({ _id: req.params.username });
  if (!target) return res.status(404).json({ error: "No such user" });
  if (target.role !== "submitter") return res.status(400).json({ error: "Only submit-only accounts send to an owner" });
  const owner = String(req.body.owner || "").trim().toLowerCase();
  const ownerUser = owner ? await users.findOne({ _id: owner }) : null;
  if (!ownerUser || ownerUser.role === "submitter") return res.status(400).json({ error: "Choose an admin or member account to receive this user's submissions" });
  await users.updateOne({ _id: target._id }, { $set: { owner } });
  await submissions.updateMany({ submittedByUser: target._id, status: "pending" }, { $set: { owner } });
  res.json({ ok: true });
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
  // Submit-only accounts that sent to this user now feed the shared inbox instead.
  await users.updateMany({ owner: username }, { $set: { owner: null } });
  await submissions.updateMany({ owner: username, status: "pending" }, { $set: { owner: null } });
  res.json({ ok: true });
});

// Each user's data lives under "<username>:<key>"; keys marked shared
// (?shared=1) live under "shared:<key>" and are visible to every account.
// Submit-only accounts have no data here and are kept out.
const storageId = (req) =>
  (req.query.shared === "1" ? "shared" : req.session.u) + ":" + req.params.key;

app.get("/api/storage/:key", auth, fullAccountOnly, async (req, res) => {
  try {
    const doc = await kv.findOne({ _id: storageId(req) });
    res.json({ value: doc ? doc.value : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "storage read failed" });
  }
});

app.put("/api/storage/:key", auth, fullAccountOnly, async (req, res) => {
  try {
    await kv.updateOne(
      { _id: storageId(req) },
      { $set: { value: req.body.value, updatedAt: new Date(), updatedBy: req.session.u } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "storage write failed" });
  }
});

// A full account sees its inbox; a submit-only account sees just what it has sent.
app.get("/api/submissions", auth, async (req, res) => {
  const filter = req.session.r === "submitter" ? { submittedByUser: req.session.u } : inboxFilter(req.session.u);
  const list = await submissions.find(filter).sort({ submittedAt: 1 }).toArray();
  res.json({ submissions: list.map(publicSubmission) });
});

// Dropdown choices for the submit form: the receiving owner's own units and work types
// (each account customises these), or null so the client falls back to the defaults.
app.get("/api/submissions/options", auth, async (req, res) => {
  const me = await users.findOne({ _id: req.session.u });
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const ownerId = me.role === "submitter" ? me.owner : me._id;
  const owner = ownerId ? await users.findOne({ _id: ownerId }) : null;
  const readJson = async (key) => {
    if (!owner) return null;
    const doc = await kv.findOne({ _id: `${owner._id}:${key}` });
    try { return doc && doc.value ? JSON.parse(doc.value) : null; } catch { return null; }
  };
  res.json({
    owner: owner ? { username: owner._id, name: owner.name } : null,
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
  const duration = Math.round(Number(b.duration));
  const sub = {
    _id: crypto.randomBytes(8).toString("hex"),
    title,
    unit: String(b.unit || "").trim(),
    category: CATEGORIES.includes(b.category) ? b.category : "smallBatch",
    workType: String(b.workType || "").trim(),
    duration: Number.isFinite(duration) && duration > 0 ? duration : 15,
    notes: String(b.notes || "").trim(),
    submittedBy: String(b.submittedBy || "").trim() || me.name,
    submittedByUser: me._id,
    // A submit-only account sends to the owner it is tied to; a suggestion made from inside
    // the app goes to the shared inbox every board sees, as before.
    owner: me.role === "submitter" ? me.owner || null : null,
    status: "pending",
    submittedAt: Date.now(),
  };
  await submissions.insertOne(sub);
  res.json({ submission: publicSubmission(sub) });
});

// Approve / dismiss — only by a full account whose inbox holds the submission.
app.put("/api/submissions/:id", auth, fullAccountOnly, async (req, res) => {
  const status = req.body.status;
  if (!SUBMISSION_STATUSES.includes(status)) return res.status(400).json({ error: "Bad status" });
  const r = await submissions.updateOne(
    { _id: req.params.id, ...inboxFilter(req.session.u) },
    { $set: { status, decidedAt: Date.now(), decidedBy: req.session.u } }
  );
  if (!r.matchedCount) return res.status(404).json({ error: "No such submission" });
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

app.listen(PORT, () => console.log(`Executive Scheduler running on port ${PORT}`));
