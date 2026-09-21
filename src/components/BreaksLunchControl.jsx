import React from "react";
import { X } from "lucide-react";
import { INK } from "../constants.js";
import { timeStrToClock } from "../utils.js";
import { useSettings } from "../SettingsContext.jsx";

const BREAK_CHOICES = [5, 10, 15, 20, 25, 30];
const LUNCH_CHOICES = [20, 30, 40, 45, 60, 75, 90];
// Keep a stored value that isn't one of the presets selectable.
const withCurrent = (choices, v) => (v > 0 && !choices.includes(v) ? [...choices, v].sort((a, b) => a - b) : choices);

const Row = ({ label, hint, children }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <div className="flex-1 min-w-[10rem]">
      <p className="text-sm" style={{ color: INK }}>{label}</p>
      {hint && <p className="text-xs text-black/40 mt-0.5">{hint}</p>}
    </div>
    {children}
  </div>
);

// The signed-in executive's own break and lunch settings. Shared by Plan My Day's Start Time
// step and the Work Types settings modal so they are edited the same way everywhere.
// `lunchApplies` is false on a day type that has no Lunch block (only Plan My Day knows that).
export default function BreaksLunchControl({ lunchApplies = true }) {
  const { settings, updateSettings } = useSettings();
  const { breakMinutes, lunchMinutes, lunchTime } = settings;
  const field = "border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-black/30 bg-white";

  return (
    <div className="space-y-3">
      <Row label="Short breaks" hint={breakMinutes === null ? "Built-in lengths — 5 to 15 min, depending on the day type." : breakMinutes === 0 ? "No short breaks are placed in the day." : `Every short break is ${breakMinutes} min.`}>
        <select value={breakMinutes === null ? "std" : String(breakMinutes)} aria-label="Short break length"
          onChange={(e) => updateSettings({ breakMinutes: e.target.value === "std" ? null : Number(e.target.value) })} className={field}>
          <option value="std">Standard</option>
          {withCurrent(BREAK_CHOICES, breakMinutes).map(m => <option key={m} value={m}>{m} min</option>)}
          <option value="0">No short breaks</option>
        </select>
      </Row>
      <Row label="Lunch" hint={lunchMinutes === 0 ? "No Lunch block — a short break takes its place." : "On Full Office Day and WFH days."}>
        <select value={String(lunchMinutes)} aria-label="Lunch length"
          onChange={(e) => updateSettings({ lunchMinutes: Number(e.target.value) })} className={field}>
          {withCurrent(LUNCH_CHOICES, lunchMinutes).map(m => <option key={m} value={m}>{m} min</option>)}
          <option value="0">No lunch block</option>
        </select>
      </Row>
      {lunchMinutes > 0 && (
        <Row label="Lunch time" hint={lunchTime ? `Lunch is fixed at ${timeStrToClock(lunchTime)}; the rest of the day flows around it.` : "Not set — Lunch follows Focus Work 1, wherever that lands."}>
          <div className="flex items-center gap-1.5">
            <input type="time" value={lunchTime} aria-label="Lunch time"
              onChange={(e) => updateSettings({ lunchTime: e.target.value })} className={field} />
            {lunchTime && (
              <button type="button" onClick={() => updateSettings({ lunchTime: "" })} title="Let Lunch follow Focus Work 1 again" className="text-black/35 hover:text-black/60">
                <X size={14} />
              </button>
            )}
          </div>
        </Row>
      )}
      {!lunchApplies && <p className="text-xs text-black/40">This day type has no Lunch block, so only the short-break setting applies to it.</p>}
    </div>
  );
}
