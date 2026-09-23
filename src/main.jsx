import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
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

// Keys are per-user on the server; the optional `shared` flag stores under a namespace
// visible to every account. Every document carries a version number: a read may say which
// version it already has, and a write says which version it was based on (see sync.js).
const storageUrl = (key, { shared, knownVersion } = {}) => {
  const q = [shared ? "shared=1" : "", knownVersion != null ? `v=${knownVersion}` : ""].filter(Boolean).join("&");
  return `/api/storage/${encodeURIComponent(key)}${q ? "?" + q : ""}`;
};

window.storage = {
  // Resolves { value, version } — or { unchanged: true, version } when the server's copy is
  // still at `knownVersion`.
  async get(key, opts = {}) {
    const res = await fetch(storageUrl(key, opts), { headers: authorized() });
    handle401(res);
    if (!res.ok) throw new Error(`storage get failed: ${res.status}`);
    return res.json();
  },
  // Resolves { ok: true, version } once written, or { ok: false, conflict: true, value, version }
  // when the server's copy has moved past `baseVersion` and the write was refused.
  async set(key, value, { shared, baseVersion } = {}) {
    const res = await fetch(storageUrl(key, { shared }), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authorized() },
      body: JSON.stringify({ value, baseVersion }),
    });
    handle401(res);
    if (res.status === 409) return { ok: false, conflict: true, ...(await res.json()) };
    if (!res.ok) throw new Error(`storage set failed: ${res.status}`);
    return res.json();
  },
};

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <App />
  </AuthGate>
);
