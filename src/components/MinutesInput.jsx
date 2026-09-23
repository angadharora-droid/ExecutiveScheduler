import React, { useState, useEffect } from "react";
import { MIN_TASK_MINUTES } from "../constants.js";

// A minutes box that can be emptied while typing and never saves less than 5: the value is
// committed on blur / Enter, and anything unusable falls back to what it was.
export default function MinutesInput({ value, onChange, className = "", min = MIN_TASK_MINUTES, placeholder = "Min", ...rest }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => { setDraft(value == null ? "" : String(value)); }, [value]);
  const commit = () => {
    const v = Math.round(Number(draft));
    const usable = draft.trim() !== "" && Number.isFinite(v);
    const next = usable ? Math.max(min, v) : (value == null ? min : value);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <input type="number" inputMode="numeric" min={min} step={5} value={draft} placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={className} {...rest} />
  );
}
