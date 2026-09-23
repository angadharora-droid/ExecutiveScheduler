// Rebuild account 7823026662's plan for 2026-09-23 exactly as Plan My Day's generate() would
// have, from what the downloaded "schedule-2026-09-23 2.html" shows, and verify the result
// block by block against that file before writing. Dry run unless --write is passed.
import "dotenv/config";
import { MongoClient } from "mongodb";
import { buildBlocks, layoutWithFixed, personalToFixedBlock, eveningFixedBlocks, lunchFixedBlocks } from "../src/scheduleEngine.js";
import { breakPrefsOf } from "../src/constants.js";
import { timeToMins, minsToClock } from "../src/utils.js";

const USER = "7823026662";
const DATE = "2026-09-23";
const WRITE = process.argv.includes("--write");

// What the downloaded file shows, in order: [clock, label, minutes].
const EXPECTED = [
  ["11:00 AM", "Warm Up — Emails / Flash Reports", 30],
  ["11:30 AM", "Small Batch 1", 30],
  ["12:00 PM", "Break", 10],
  ["12:10 PM", "Delegation & Instructions", 20],
  ["12:30 PM", "Focus Work 1", 30],
  ["1:00 PM", "Break", 10],
  ["1:10 PM", "Focus Work 2", 30],
  ["1:40 PM", "Break", 10],
  ["1:50 PM", "Small Batch 2", 20],
  ["2:10 PM", "FLEXIBLE / OPERATIONAL WINDOW", 215],
  ["5:45 PM", "Executive Interaction Window", 90],
  ["7:15 PM", "Mahaparasd - Manaswini & Rohan (Khare Town)", 120],
  ["9:15 PM", "Buffer & Pending Callbacks", 25],
  ["9:40 PM", "Closure & Tomorrow's Instructions", 20],
  ["10:00 PM", "Mahaprasad - the empire Nanak (Lashkaribaug)", 60],
  ["11:00 PM", "Mahaprasad - Deosinghani Family", 68],
];
const SB1_TITLES = [
  "Check HR reports for mickys", "Follow up on Dholida Prep", "make vendor evaluation doc : Mickys",
  "make vendor on boarding COP", "JD of GFA", "Go live : Life term HDFC",
  "Follow up of income audit process : himanshi", "Make proposal for Asha vyawahare",
  "Pavan's Ledger - Reconcilation", "Amravati Excise Documentation", "Finalize RND procurement JD",
  "pr list fo CPA by devangi", "Review handover sheet Micky’s", "review dholida kalaakar menu",
];
const FOCUS1_ID = "z95syt8ymuawlnmv"; // Micky’s B2C revised structure (Auto task picked in the wizard)
const FOCUS2_ID = "f69jdefpmuawlnmv"; // Micky’s B2B revised structure (pinned to the day)

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const kv = client.db("executive_scheduler").collection("kv");
const read = async (key) => { const d = await kv.findOne({ _id: `${USER}:${key}` }); return { doc: d, value: JSON.parse(d?.value || "null") }; };

const plansDoc = await read("dayplans");
const tasks = (await read("tasks")).value;
const personalBlocks = (await read("personalblocks")).value;
const settings = (await read("settings")).value;

const fail = (msg) => { console.error("ABORT:", msg); process.exit(1); };
if (plansDoc.value[DATE]) fail(`a plan for ${DATE} already exists — nothing to restore`);

// The same inputs generate() derives: pinned Small Batch tasks in board order, the two Focus picks.
const norm = (s) => s.trim().replace(/\s+/g, " ");
const pinnedSb = tasks.filter((t) => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === DATE && t.category === "smallBatch");
if (pinnedSb.length !== 14) fail(`expected 14 pinned Small Batch tasks, found ${pinnedSb.length}`);
const missing = SB1_TITLES.filter((title) => !pinnedSb.some((t) => norm(t.title) === norm(title)));
if (missing.length) fail(`titles not found on the board: ${missing.join(" | ")}`);
const byId = new Map(tasks.map((t) => [t.id, t]));
const focus1 = byId.get(FOCUS1_ID), focus2 = byId.get(FOCUS2_ID);
if (!focus1 || !focus2 || focus1.status === "done" || focus2.status === "done") fail("focus tasks not found or already done");
const pinnedDelegation = tasks.filter((t) => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === DATE && t.category === "delegation");
if (pinnedDelegation.length) fail("unexpected pinned delegation tasks");
const timed = tasks.filter((t) => t.status !== "done" && t.scheduleMode === "DEFINE" && t.date === DATE && t.time);
if (timed.length) fail("unexpected timed tasks");

const dayType = "full", half = "first", startTime = "11:00", extraFocus = 0;
const focusLimit = settings.focusLimit;
const breakPrefs = breakPrefsOf(settings);
if (focusLimit !== 2) fail(`focus limit is ${focusLimit}, the file shows 2 slots`);
const finalSb1 = pinnedSb.map((t) => t.id);
const finalDelegation = [];
const focusSlots = { focus1: FOCUS1_ID, focus2: FOCUS2_ID };
const eveningMode = "retain", eveningStart = "17:45", eveningEnd = "19:15", eveningStops = [], specialTasks = [], nonNegotiables = [];

// Lifted from generate() in PlanMyDay.jsx.
const blocks = buildBlocks(dayType, half, extraFocus, focusLimit, breakPrefs);
const structuredWithTasks = blocks.map((b) => {
  if (b.type === "smallbatch" && b.key === "sb1") return { ...b, taskIds: finalSb1 };
  if (b.type === "delegation") return { ...b, taskIds: finalDelegation, duration: b.duration };
  if (b.type === "focus") {
    const chosenId = focusSlots[b.key] || null;
    const chosenTask = chosenId ? byId.get(chosenId) : null;
    return { ...b, taskIds: chosenId ? [chosenId] : [], duration: chosenTask?.duration || b.duration };
  }
  return { ...b, taskIds: [] };
});
const todaysPersonalBlocks = personalBlocks.filter((p) => p.date === DATE);
const fixedBlocks = [
  ...todaysPersonalBlocks.map(personalToFixedBlock),
  ...lunchFixedBlocks(dayType, half, breakPrefs, timeToMins(startTime)),
  ...eveningFixedBlocks(eveningMode, eveningStart, eveningEnd, eveningStops),
];
const { schedule } = layoutWithFixed(structuredWithTasks, timeToMins(startTime), fixedBlocks);

// Verify against the downloaded file.
const got = schedule.map((b) => [minsToClock(b.start), b.label, b.duration]);
let ok = got.length === EXPECTED.length;
got.forEach((row, i) => {
  const exp = EXPECTED[i];
  const match = exp && row[0] === exp[0] && row[1] === exp[1] && row[2] === exp[2];
  if (!match) ok = false;
  console.log(`${match ? "  " : "!!"} ${row[0].padStart(8)}  ${row[1].padEnd(46)} ${String(row[2]).padStart(4)}m  ${(schedule[i].taskIds || []).length ? `${schedule[i].taskIds.length} task(s)` : ""}${schedule[i].shifted ? `  moved from ${minsToClock(schedule[i].requestedStart)}` : ""}`);
});
if (!ok) fail("rebuilt schedule does not match the downloaded file");
const sb1Block = schedule.find((b) => b.key === "sb1");
if (sb1Block.taskIds.length !== 14) fail("Small Batch 1 should carry 14 tasks");
console.log("\nSchedule matches the downloaded file, block for block.");

const plan = {
  date: DATE, dayType, half, startTime, sb1: finalSb1, delegation: finalDelegation, focusSlots, extraFocus, focusLimit, ...breakPrefs,
  nonNegotiables, schedule, concluded: false, createdAt: Date.now(),
  eveningMode, eveningStart, eveningEnd, eveningStops, specialTasks,
  restoredFrom: "schedule-2026-09-23 2.html",
};

if (!WRITE) { console.log("\nDry run — nothing written. Re-run with --write to restore."); await client.close(); process.exit(0); }

// Add the one date to the plans document — only if nobody has written it since it was read.
const next = { ...plansDoc.value, [DATE]: plan };
const r = await kv.updateOne(
  { _id: `${USER}:dayplans`, updatedAt: plansDoc.doc.updatedAt },
  { $set: { value: JSON.stringify(next), updatedAt: new Date(), updatedBy: "restore-script" } }
);
if (!r.matchedCount) fail("the plans document changed while this ran — nothing written, run again");
const after = await read("dayplans");
console.log(`\nWritten. ${Object.keys(after.value).length} dates now, ${DATE} present: ${!!after.value[DATE]}, updatedAt ${after.doc.updatedAt.toISOString()}`);
await client.close();
