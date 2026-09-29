import React, { useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { ALERT, INK } from "../constants.js";
import { fmtDate, timeToMins, minsToClock, minsToTimeStr } from "../utils.js";
import { clashWith, nextFreeStart } from "../scheduleEngine.js";

// Something on this board already fixed at the time a meeting needs (`taken`, from
// fixedTimesOn), and what can be done about it. The meeting can take the next free time
// (`onUseTime`, while it is still being set up), or the other task can move: to the first free
// time after the meeting, or to a time picked here (`onMoveTask(taskId, "HH:MM")`). Parts of a
// planned day — a break, the evening window — are not moved from here. Nothing shows when
// nothing clashes.
export default function ClashNotice({ date, time, minutes, taken, onUseTime, onMoveTask }) {
  const [pick, setPick] = useState("");
  const start = timeToMins(time);
  const clash = time ? clashWith(start, minutes, taken) : null;
  if (!clash) return null;

  const meeting = { label: "this meeting", start, end: start + minutes };
  const length = clash.end - clash.start;
  const others = [...taken.filter(b => b !== clash), meeting];
  const movable = !!(clash.taskId && onMoveTask);
  const afterMeeting = movable ? nextFreeStart(meeting.end, length, others) : null;
  const picked = pick ? timeToMins(pick) : null;
  const pickedClash = picked != null ? clashWith(picked, length, others) : null;
  const move = (mins) => { onMoveTask(clash.taskId, minsToTimeStr(mins)); setPick(""); };
  const btn = "min-h-9 px-3 rounded-lg text-xs font-semibold border bg-white hover:bg-black/[0.03] inline-flex items-center gap-1.5";

  return (
    <div className="rounded-lg p-3 text-xs space-y-2.5" style={{ background: "#FBEFEF" }}>
      <p className="flex items-start gap-1.5" style={{ color: ALERT }}>
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>
          “{clash.label}” is already fixed at {minsToClock(clash.start)}–{minsToClock(clash.end)} on {fmtDate(date)}.
          {movable ? " Move it, or the day's plan will push one of the two later." : " It is part of that day's plan."}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {movable && (
          <button type="button" onClick={() => move(afterMeeting)} className={btn} style={{ color: INK, borderColor: "rgba(0,0,0,0.12)" }}>
            <ArrowRight size={13} /> Move “{clash.label}” to {minsToClock(afterMeeting)}
          </button>
        )}
        {onUseTime && (
          <button type="button" onClick={() => onUseTime(minsToTimeStr(nextFreeStart(start, minutes, taken)))} className={btn} style={{ color: INK, borderColor: "rgba(0,0,0,0.12)" }}>
            Move the meeting to {minsToClock(nextFreeStart(start, minutes, taken))} instead
          </button>
        )}
      </div>
      {movable && (
        <div className="flex flex-wrap items-center gap-2 text-black/60">
          <span>Or move “{clash.label}” to</span>
          <input type="time" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`New time for ${clash.label}`}
            className="border border-black/15 rounded-lg px-2 py-1.5 text-xs outline-none bg-white" />
          <button type="button" onClick={() => move(picked)} disabled={picked == null || !!pickedClash}
            className={`${btn} disabled:opacity-40 disabled:cursor-not-allowed`} style={{ color: INK, borderColor: "rgba(0,0,0,0.12)" }}>
            Move it
          </button>
          {pickedClash && <span style={{ color: ALERT }}>That time clashes with “{pickedClash.label}”.</span>}
        </div>
      )}
    </div>
  );
}
