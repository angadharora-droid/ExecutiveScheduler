export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export const minsToClock = (startMin) => {
  const h = Math.floor(startMin / 60) % 24;
  const m = startMin % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
};
export const timeToMins = (t) => {
  if (!t) return 11 * 60;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const minsToTimeStr = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
