import { createContext, useContext } from "react";
import { UNITS } from "./constants.js";

// Live, user-editable unit list. Defaults to the built-in UNITS until the
// stored list loads (or if none was ever saved).
export const UnitsContext = createContext({
  units: UNITS,
  addUnit: () => {},
  removeUnit: () => {},
});

export const useUnits = () => useContext(UnitsContext);
