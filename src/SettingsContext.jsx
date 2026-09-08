import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS } from "./constants.js";

// Live, per-user scheduling preferences. Every account keeps its own copy (stored under
// its own username), starting from the built-in defaults until the saved values load.
//
//   focusLimit — the most Focus Work slots a single day may hold. It caps the slots a day
//                type ships with, the extra slots added in Plan My Day, and the slots the
//                Day view opens when a Focus task is dropped into an already-planned day.
export const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  focusLimit: DEFAULT_SETTINGS.focusLimit,
  setFocusLimit: () => {},
  resetSettings: () => {},
});

export const useSettings = () => useContext(SettingsContext);
