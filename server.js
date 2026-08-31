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

const publicUser = (u) => ({ username: u._id, name: u.name, role: u.role });

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
  const role = req.body.role === "admin" ? "admin" : "member";
  if (!/^[a-z0-9._-]{2,30}$/.test(username)) return res.status(400).json({ error: "Username: 2–30 letters/numbers (no spaces)" });
  if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
  if (await users.findOne({ _id: username })) return res.status(409).json({ error: "That username already exists" });
  await users.insertOne({ _id: username, name, role, passwordHash: scryptHash(password), createdAt: new Date() });
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
  res.json({ ok: true });
});

app.get("/api/storage/:key", auth, async (req, res) => {
  try {
    const doc = await kv.findOne({ _id: req.params.key });
    res.json({ value: doc ? doc.value : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "storage read failed" });
  }
});

app.put("/api/storage/:key", auth, async (req, res) => {
  try {
    await kv.updateOne(
      { _id: req.params.key },
      { $set: { value: req.body.value, updatedAt: new Date(), updatedBy: req.session.u } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "storage write failed" });
  }
});

app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));

app.listen(PORT, () => console.log(`Executive Scheduler running on port ${PORT}`));
