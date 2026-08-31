import React from "react";
import { createRoot } from "react-dom/client";
import App from "../executive-scheduler.jsx";
import "./index.css";

// The app was written against the window.storage API. This shim keeps the app
// code untouched and backs it with the server's MongoDB-based key/value API.
window.storage = {
  async get(key) {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.value == null ? null : { value: data.value };
  },
  async set(key, value) {
    const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(`storage set failed: ${res.status}`);
  },
};

createRoot(document.getElementById("root")).render(<App />);
