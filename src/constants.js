import {
  Briefcase, Home, Plane, Factory, Building2, PartyPopper, MoreHorizontal, Sun,
} from "lucide-react";

export const UNITS = ["CPA", "HCP Nagpur", "CP Navi Mumbai", "Restaurants", "Mickys / CP Foods", "Corporate", "HR", "L&D", "CEO / Leadership", "Finance", "Sales & Marketing", "Development", "Other"];

export const SMALL_BATCH_TYPES = ["Follow-up", "Call", "Approval", "Email", "Quick Review", "Instruction"];
export const FOCUS_TYPES = ["Meeting", "Deep Work", "Brainstorming", "Review", "Decision", "Planning"];
export const DELEGATION_TYPES = ["Delegation", "Instruction", "Handover", "Task Assignment"];
export const WORK_TYPE_OPTIONS = (cat) => cat === "focus" ? FOCUS_TYPES : cat === "delegation" ? DELEGATION_TYPES : SMALL_BATCH_TYPES;
export const CATEGORY_LABEL = { smallBatch: "Small Batch", focus: "Focus Work", delegation: "Delegation & Instructions" };
export const CATEGORY_DEFAULT_DURATION = { smallBatch: 15, focus: 40, delegation: 20 };
export const categoryChipTone = (cat) => cat === "focus" ? "focus" : cat === "delegation" ? "delegation" : "smallbatch";

// The three work type ids are fixed (they drive the schedule blocks). Their display names and
// activity lists are per-user defaults here; each account edits its own copy via WorkTypesContext.
export const CATEGORY_IDS = ["smallBatch", "focus", "delegation"];
export const DEFAULT_WORK_TYPES = {
  smallBatch: { label: "Small Batch", activities: SMALL_BATCH_TYPES },
  focus: { label: "Focus Work", activities: FOCUS_TYPES },
  delegation: { label: "Delegation & Instructions", activities: DELEGATION_TYPES },
};
// Merge a stored (possibly partial or legacy) config with the defaults so every id always
// has a non-empty name and at least one activity.
export const normalizeWorkTypes = (stored) => {
  const out = {};
  CATEGORY_IDS.forEach(cat => {
    const d = DEFAULT_WORK_TYPES[cat];
    const s = stored && typeof stored === "object" ? stored[cat] : null;
    const label = typeof s?.label === "string" && s.label.trim() ? s.label.trim() : d.label;
    const acts = Array.isArray(s?.activities) ? s.activities.filter(a => typeof a === "string" && a.trim()).map(a => a.trim()) : [];
    out[cat] = { label, activities: acts.length ? Array.from(new Set(acts)) : [...d.activities] };
  });
  return out;
};

// Per-user scheduling preferences. `focusLimit` is the most Focus Work slots one day may
// hold — it caps the slots a day type ships with, the extra slots added in Plan My Day, and
// the slots opened when a Focus task is dropped into an already-planned day. Each account
// sets its own via SettingsContext; the default matches a Full Office Day's three slots.
export const FOCUS_SLOT_MINUTES = 40;
export const FOCUS_LIMIT_MIN = 1;
export const FOCUS_LIMIT_MAX = 10;
export const DEFAULT_FOCUS_LIMIT = 3;
// Breaks and lunch are each account's own as well:
//   breakMinutes — length of every short break. null keeps each day type's built-in lengths
//                  (5–15 min); 0 drops the short breaks altogether.
//   lunchMinutes — length of the Lunch block on day types that ship with one (Full Office
//                  Day / WFH); 0 drops it.
//   lunchTime    — "HH:MM" pins Lunch to that clock time; "" lets it follow Focus Work 1.
export const BREAK_MINUTES_MAX = 60;
export const LUNCH_MINUTES_MAX = 120;
export const DEFAULT_BREAK_MINUTES = 10; // a break added on the fly (extra Focus slot, stand-in for Lunch)
export const DEFAULT_LUNCH_MINUTES = 40;
export const DEFAULT_SETTINGS = { focusLimit: DEFAULT_FOCUS_LIMIT, breakMinutes: null, lunchMinutes: DEFAULT_LUNCH_MINUTES, lunchTime: "" };
export const clampFocusLimit = (n) => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_FOCUS_LIMIT;
  return Math.min(FOCUS_LIMIT_MAX, Math.max(FOCUS_LIMIT_MIN, v));
};
export const clampBreakMinutes = (n) => {
  if (n === null || n === undefined || n === "") return null;
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.min(BREAK_MINUTES_MAX, Math.max(0, v));
};
export const clampLunchMinutes = (n) => {
  const v = Math.round(Number(n));
  if (n === null || n === undefined || n === "" || !Number.isFinite(v)) return DEFAULT_LUNCH_MINUTES;
  return Math.min(LUNCH_MINUTES_MAX, Math.max(0, v));
};
export const normalizeLunchTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : "";
// The break / lunch part of a settings (or saved plan) object, cleaned up for the schedule engine.
export const breakPrefsOf = (s) => ({
  breakMinutes: clampBreakMinutes(s?.breakMinutes),
  lunchMinutes: clampLunchMinutes(s?.lunchMinutes),
  lunchTime: normalizeLunchTime(s?.lunchTime),
});
// Merge a stored (possibly partial or legacy) settings object with the defaults.
export const normalizeSettings = (stored) => {
  const s = stored && typeof stored === "object" ? stored : {};
  return { ...DEFAULT_SETTINGS, focusLimit: clampFocusLimit(s.focusLimit ?? DEFAULT_FOCUS_LIMIT), ...breakPrefsOf(s) };
};

export const DAY_TYPES = [
  { id: "full", label: "Full Office Day", icon: Briefcase },
  { id: "half", label: "Half Day", icon: Sun },
  { id: "wfh", label: "WFH", icon: Home },
  { id: "travel", label: "Travel Day", icon: Plane },
  { id: "property", label: "Property Visit", icon: Building2 },
  { id: "factory", label: "Factory Visit", icon: Factory },
  { id: "event", label: "Event / Function", icon: PartyPopper },
  { id: "flexible", label: "Flexible / Other", icon: MoreHorizontal },
];

export const WEEKDAY_FOCUS_PREF = {
  1: { focus1: "CPA" },
  2: { focus2: "Amit" },
  3: { focus3: "Natasha", note: "Consider a Restaurant Visit afterwards" },
  4: { focus1: "HR", focus2: "L&D" },
  5: { focus1: "CEO / Leadership" },
  6: { focus1: "Guest Reviews" },
};
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const CONCLUDE_STATUSES = ["Completed", "Progress Made", "Needs Follow-Up", "Decision Pending", "Needs Another Meeting", "Waiting on Someone", "Delegated", "Reschedule", "No Progress"];

export const EVENING_STOP_GROUPS = {
  "Employee / Team": ["Specific employee", "HOD / Manager", "Department", "Team interaction"],
  "Guest": ["VIP Guest", "Long-stay Guest", "Guest requiring follow-up", "Event / Banquet host", "Specific guest"],
  "Property / Area": ["Front Office / Lobby", "Restaurant", "Banquet", "Kitchen", "BOH", "Guest Floors", "Engineering / Facility", "Other operational area"],
  "External / Social Visit": ["Restaurant visit", "Client", "Vendor", "Business associate", "Social commitment", "Other"],
};
export const PROPERTY_UNITS = ["Restaurants", "HCP Nagpur", "CP Navi Mumbai", "CPA", "Mickys / CP Foods"];
export const EVENING_ELIGIBLE_TYPES = ["full"]; // day types that get the evening window automatically
export const EVENING_OPTIONAL_TYPES = ["half", "wfh", "factory", "property", "event"]; // ask retain/modify/skip
export const PERSONAL_BLOCK_CATEGORIES = ["Personal / Social", "Medical", "Family", "Other"];

export const ACCENT = "#2F5D62";      // signal teal — focus work
export const ACCENT_WARM = "#B8862C"; // ochre — non-negotiable
export const ALERT = "#B23A3A";       // stalled / overloaded
export const INK = "#20222B";
export const PAPER = "#F7F5F1";
export const SAGE = "#7A8B6F";        // small batch

export const BLOCK_COLOR = { warmup: "#8B8579", smallbatch: SAGE, break: "#C9C7C2", delegation: "#6E7B8B", focus: ACCENT, visit: "#7A5C8B", evening: "#9B5B4A", buffer: "#B7A78E", closure: "#4A5A6E", flexible: "#D8D5CD", personal: "#8B6F9B", special: "#4A6E8B" };
