import React, { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";
import { FOCUS_LIMIT_MIN, FOCUS_LIMIT_MAX, FOCUS_SLOT_MINUTES, INK } from "../constants.js";
import { useSettings } from "../SettingsContext.jsx";

// Stepper for the signed-in user's own Focus Work slot limit. Shared by Plan My Day's Focus
// step and the Work Types settings modal so the value is edited the same way everywhere.
// The typed value is committed on blur / Enter (not per keystroke) so "10" can be typed.
export default function FocusLimitControl({ compact = false }) {
  const { focusLimit, setFocusLimit } = useSettings();
  const [draft, setDraft] = useState(String(focusLimit));
  useEffect(() => { setDraft(String(focusLimit)); }, [focusLimit]);

  const commit = () => {
    const v = Number(draft);
    if (!draft.trim() || !Number.isFinite(v)) { setDraft(String(focusLimit)); return; }
    setFocusLimit(v);
    setDraft(String(Math.min(FOCUS_LIMIT_MAX, Math.max(FOCUS_LIMIT_MIN, Math.round(v)))));
  };
  const btn = "w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center hover:bg-black/[0.03] disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setFocusLimit(focusLimit - 1)} disabled={focusLimit <= FOCUS_LIMIT_MIN} className={btn} title="One slot fewer"><Minus size={14} /></button>
      <input type="number" min={FOCUS_LIMIT_MIN} max={FOCUS_LIMIT_MAX} value={draft} aria-label="Focus Work slots per day"
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-14 text-center border border-black/10 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-black/30" style={{ color: INK }} />
      <button type="button" onClick={() => setFocusLimit(focusLimit + 1)} disabled={focusLimit >= FOCUS_LIMIT_MAX} className={btn} title="One slot more"><Plus size={14} /></button>
      {!compact && <span className="text-xs text-black/40 whitespace-nowrap">slots / day · up to {focusLimit * FOCUS_SLOT_MINUTES} min</span>}
    </div>
  );
}
