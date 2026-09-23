import React, { useEffect } from "react";
import { ACCENT, ALERT, INK, SAGE } from "../constants.js";

export function Chip({ children, tone = "default", className = "" }) {
  const tones = {
    default: "bg-black/5 text-[#20222B]",
    focus: "text-white",
    smallbatch: "text-white",
    delegation: "text-white",
    personal: "text-white",
    warn: "text-white",
    outline: "border border-black/15 text-[#20222B]/70",
  };
  const style =
    tone === "focus" ? { background: ACCENT } :
    tone === "smallbatch" ? { background: SAGE } :
    tone === "delegation" ? { background: "#6E7B8B" } :
    tone === "personal" ? { background: "#8B6F9B" } :
    tone === "warn" ? { background: ALERT } : {};
  return (
    <span style={style} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "", style = {}, onClick }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${onClick ? "cursor-pointer hover:border-black/[0.12]" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}

// Buttons are at least a finger tall (44px), show a press, and keep a visible keyboard focus.
export function PrimaryButton({ children, onClick, disabled, className = "", title, type = "button" }) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{ background: disabled ? "#C9C7C2" : INK }}
      className={`min-h-11 text-white px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide hover:opacity-90 disabled:cursor-not-allowed flex items-center gap-2 justify-center ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, className = "", title, type = "button" }) {
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`min-h-11 px-4 py-2 rounded-xl text-sm font-medium border border-black/10 bg-white/60 hover:bg-black/[0.04] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent flex items-center gap-2 justify-center ${className}`}>
      {children}
    </button>
  );
}

// An icon-only control with a full 44px hit area and a spoken name.
export function IconButton({ children, onClick, label, className = "", disabled, style = {} }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} style={style}
      className={`w-11 h-11 -m-1.5 inline-flex items-center justify-center rounded-full text-black/40 hover:text-black/70 hover:bg-black/[0.04] disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${className}`}>
      {children}
    </button>
  );
}

// A quiet card for a list with nothing in it: what this is, and the one thing to do next.
export function EmptyState({ icon: Icon, title, hint, action, className = "" }) {
  return (
    <Card className={`p-8 text-center space-y-3 ${className}`}>
      {Icon && <Icon size={26} className="mx-auto text-black/25" />}
      <p className="text-sm font-medium" style={{ color: INK }}>{title}</p>
      {hint && <p className="text-xs text-black/45 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="pt-1 flex justify-center">{action}</div>}
    </Card>
  );
}

// Escape closes whatever is open, as long as it is open.
export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active || !onClose) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}
