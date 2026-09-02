import React from "react";
import { ACCENT, ALERT, INK, SAGE } from "../constants.js";

export function Chip({ children, tone = "default", className = "" }) {
  const tones = {
    default: "bg-black/5 text-[#20222B]",
    focus: "text-white",
    smallbatch: "text-white",
    delegation: "text-white",
    warn: "text-white",
    outline: "border border-black/15 text-[#20222B]/70",
  };
  const style =
    tone === "focus" ? { background: ACCENT } :
    tone === "smallbatch" ? { background: SAGE } :
    tone === "delegation" ? { background: "#6E7B8B" } :
    tone === "warn" ? { background: ALERT } : {};
  return (
    <span style={style} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "", style = {}, onClick }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`} style={style}>
      {children}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: disabled ? "#C9C7C2" : INK }}
      className={`text-white px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 disabled:cursor-not-allowed flex items-center gap-2 justify-center ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = "" }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/[0.03] flex items-center gap-2 justify-center ${className}`}>
      {children}
    </button>
  );
}
