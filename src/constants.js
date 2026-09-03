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
