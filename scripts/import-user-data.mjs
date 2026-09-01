// Imports an Executive Scheduler JSON export into one user's storage.
//
//   node scripts/import-user-data.mjs <username> <path-to-export.json>
//
// tasks / dayplans / personalblocks are written to that user's namespace
// (replacing whatever the user had); submissions are merged into the
// shared team inbox, deduped by id.
import "dotenv/config";
import fs from "node:fs";
import { Resolver } from "node:dns/promises";
import { MongoClient } from "mongodb";

// Some networks refuse SRV lookups, which mongodb+srv:// URIs need. Resolve
// the seed list through public DNS and connect with a plain mongodb:// URI.
async function connect(uri) {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    return client;
  } catch (e) {
    const srv = uri.match(/^mongodb\+srv:\/\/([^@]+)@([^/?]+)/);
    if (!srv || e.code !== "ECONNREFUSED") throw e;
    const [, creds, host] = srv;
    const resolver = new Resolver();
    resolver.setServers(["8.8.8.8", "1.1.1.1"]);
    const [records, txt] = await Promise.all([
      resolver.resolveSrv(`_mongodb._tcp.${host}`),
      resolver.resolveTxt(host),
    ]);
    const seeds = records.map((r) => `${r.name}:${r.port}`).join(",");
    const params = txt.flat().join("") || "authSource=admin";
    const client = new MongoClient(`mongodb://${creds}@${seeds}/?${params}&tls=true`);
    await client.connect();
    return client;
  }
}

const [username, exportPath] = process.argv.slice(2);
if (!username || !exportPath) {
  console.error("Usage: node scripts/import-user-data.mjs <username> <path-to-export.json>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(exportPath, "utf8"));

const client = await connect(process.env.MONGODB_URI);
const db = client.db("executive_scheduler");
const kv = db.collection("kv");
const users = db.collection("users");

const user = await users.findOne({ _id: username.toLowerCase() });
if (!user) {
  const existing = await users.find({}).map((u) => u._id).toArray();
  console.error(`No user "${username}". Existing users: ${existing.join(", ")}`);
  await client.close();
  process.exit(1);
}

const put = async (id, value) =>
  kv.updateOne(
    { _id: id },
    { $set: { value: JSON.stringify(value), updatedAt: new Date(), updatedBy: "import-script" } },
    { upsert: true }
  );

await put(`${user._id}:tasks`, data.tasks || []);
await put(`${user._id}:dayplans`, data.dayPlans || {});
await put(`${user._id}:personalblocks`, data.personalBlocks || []);
console.log(
  `Imported for "${user._id}": ${(data.tasks || []).length} tasks, ` +
  `${Object.keys(data.dayPlans || {}).length} day plans, ` +
  `${(data.personalBlocks || []).length} personal blocks`
);

const incoming = data.submissions || [];
if (incoming.length) {
  const doc = await kv.findOne({ _id: "shared:submissions" });
  const current = doc ? JSON.parse(doc.value) : [];
  const known = new Set(current.map((s) => s.id));
  const added = incoming.filter((s) => !known.has(s.id));
  await put("shared:submissions", [...current, ...added]);
  console.log(`Submissions (shared inbox): ${added.length} added, ${incoming.length - added.length} already present`);
}

await client.close();
