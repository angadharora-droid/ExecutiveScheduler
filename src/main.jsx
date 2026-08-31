import React from "react";
import { createRoot } from "react-dom/client";
import App from "../executive-scheduler.jsx";
import AuthGate from "./AuthGate.jsx";
import { getAuth, clearAuth } from "./auth.js";
import "./index.css";

// The app was written against the window.storage API. This shim keeps the app
// code untouched and backs it with the server's MongoDB-based key/value API.
// All requests carry the signed-in user's token; a 401 sends them back to login.
const authorized = () => {
  const token = getAuth()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const handle401 = (res) => {
  if (res.status === 401) {
    clearAuth();
    window.location.reload();
    throw new Error("session expired");
  }
};

window.storage = {
  async get(key) {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, { headers: authorized() });
    handle401(res);
    if (!res.ok) return null;
    const data = await res.json();
    return data.value == null ? null : { value: data.value };
  },
  async set(key, value) {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authorized() },
      body: JSON.stringify({ value }),
    });
    handle401(res);
    if (!res.ok) throw new Error(`storage set failed: ${res.status}`);
  },
};

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <App />
  </AuthGate>
);
