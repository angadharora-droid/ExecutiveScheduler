import { createContext, useContext } from "react";
import { DEFAULT_WORK_TYPES } from "./constants.js";

// Live, per-user Work Type names and Activity lists. The three work type ids
// (smallBatch / focus / delegation) are fixed because the schedule engine builds
// its blocks from them; each account chooses what to call them and which
// activities sit under each. Defaults apply until the stored config loads.
export const WorkTypesContext = createContext({
  workTypes: DEFAULT_WORK_TYPES,
  categoryLabel: (cat) => DEFAULT_WORK_TYPES[cat]?.label || cat,
  activityOptions: (cat) => DEFAULT_WORK_TYPES[cat]?.activities || [],
  renameCategory: () => {},
  addActivity: () => {},
  removeActivity: () => {},
  resetWorkTypes: () => {},
});

export const useWorkTypes = () => useContext(WorkTypesContext);
