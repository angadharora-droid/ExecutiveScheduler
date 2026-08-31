import "dotenv/config";
import path from "node:path";
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
const kv = client.db("executive_scheduler").collection("kv");
console.log("Connected to MongoDB");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/api/storage/:key", async (req, res) => {
  try {
    const doc = await kv.findOne({ _id: req.params.key });
    res.json({ value: doc ? doc.value : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "storage read failed" });
  }
});

app.put("/api/storage/:key", async (req, res) => {
  try {
    await kv.updateOne(
      { _id: req.params.key },
      { $set: { value: req.body.value, updatedAt: new Date() } },
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
