import React, { useState, useEffect } from "react";
import { Users, LogOut, KeyRound, X, Plus, Shield, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { getAuth, setAuth, clearAuth, api } from "./auth.js";
import { resolveSsoToken, ssoLogout } from "./lib/sso.js";
import { useEscape } from "./components/ui.jsx";

const INK = "#20222B";
const PAPER = "#F7F5F1";
const ACCENT = "#2F5D62";
const ALERT = "#B23A3A";

const SERIF = { fontFamily: "Georgia, 'Iowan Old Style', ui-serif, serif" };
const SANS = { fontFamily: "'Inter', ui-sans-serif, system-ui" };
const inputCls = "w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 bg-white";
const cardCls = "bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

function Modal({ title, onClose, children }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 bg-black/45 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`${cardCls} w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl rise`} onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg" style={{ color: INK, ...SERIF }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -m-2 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// A password box that hides what is typed, with an eye to show it.
function PasswordField({ value, onChange, placeholder = "", className = "", autoFocus = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} value={value} placeholder={placeholder} autoFocus={autoFocus} autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)} className={`${inputCls} pr-9 ${className}`} />
      <button type="button" onClick={() => setShow(s => !s)} title={show ? "Hide" : "Show"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/35 hover:text-black/60">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// Same rule as the server: at least 8 characters, never the username itself.
const passwordProblem = (password, username) =>
  password.length < 8 ? "At least 8 characters." : password.toLowerCase() === String(username || "").toLowerCase() ? "It can't be the same as the username." : "";

function ResetPasswordModal({ username, onClose, onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const problem = passwordProblem(password, username);
  const submit = async () => {
    setError("");
    try {
      await api(`/api/auth/users/${encodeURIComponent(username)}/password`, { method: "PUT", body: { password } });
      onDone(`Password updated for "${username}".`);
      onClose();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={`Reset password · ${username}`} onClose={onClose}>
      <div className="space-y-2">
        <PasswordField value={password} onChange={setPassword} placeholder="New password" autoFocus />
        <p className="text-xs" style={{ color: password && problem ? ALERT : "rgba(0,0,0,0.4)" }}>{password && problem ? problem : "At least 8 characters, and not the username. Share it with them privately — they can change it themselves once signed in."}</p>
        {error && <p className="text-sm" style={{ color: ALERT }}>{error}</p>}
        <button onClick={submit} disabled={!!problem}
          style={{ background: problem ? "#C9C7C2" : INK }}
          className="w-full text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:cursor-not-allowed">
          Set password
        </button>
      </div>
    </Modal>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
      setAuth(data);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Login failed");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: PAPER, ...SANS }}>
      <form onSubmit={submit} className={`${cardCls} w-full max-w-sm p-8 space-y-4 rise`}>
        <div className="text-center space-y-1 mb-2">
          <h1 className="font-serif text-2xl" style={{ color: INK, ...SERIF }}>Executive Scheduler</h1>
          <p className="text-sm text-black/45">Sign in to continue</p>
        </div>
        <div>
          <label htmlFor="login-username" className="text-xs font-semibold text-black/50 uppercase tracking-wide">Username</label>
          <input id="login-username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="none" autoCorrect="off" autoComplete="username" enterKeyHint="next" className={inputCls + " mt-1"} />
        </div>
        <div>
          <label htmlFor="login-password" className="text-xs font-semibold text-black/50 uppercase tracking-wide">Password</label>
          <input id="login-password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" enterKeyHint="go" className={inputCls + " mt-1"} />
        </div>
        {error && <p className="text-sm" role="alert" style={{ color: ALERT }}>{error}</p>}
        <button type="submit" disabled={busy || !username || !password}
          style={{ background: busy || !username || !password ? "#C9C7C2" : INK }}
          className="w-full min-h-11 text-white px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide hover:opacity-90 disabled:cursor-not-allowed">
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

/* Admin page: user management only — nothing else is handled here. */
function AdminPage({ me }) {
  const [list, setList] = useState([]);
  const blankForm = { username: "", name: "", password: "", role: "member" };
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState(""); // shown beside the Add user form, where it was caused
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(null); // username whose password is being reset

  const refresh = () => api("/api/auth/users").then((d) => setList(d.users)).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 2500); };
  const addProblem = form.password ? passwordProblem(form.password, form.username) : "";

  const addUser = async () => {
    setAddError("");
    try {
      await api("/api/auth/users", { method: "POST", body: form });
      flash(`User "${form.username.trim().toLowerCase()}" added.`);
      setForm(blankForm);
      refresh();
    } catch (e) { setAddError(e.message); }
  };

  const removeUser = async (username) => {
    if (!window.confirm(`Remove user "${username}"?`)) return;
    setError("");
    try { await api(`/api/auth/users/${encodeURIComponent(username)}`, { method: "DELETE" }); flash(`User "${username}" removed.`); refresh(); }
    catch (e) { setError(e.message); }
  };

  const resetPassword = (username) => { setError(""); setResetting(username); };

  return (
    <div className="min-h-screen pb-16" style={{ background: PAPER, ...SANS }}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 pt-10 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-serif text-2xl flex items-center gap-2" style={{ color: INK, ...SERIF }}><Shield size={20} /> User Management</h2>
            <p className="text-sm text-black/45 mt-0.5">{list.length} account{list.length === 1 ? "" : "s"} · admin only</p>
          </div>
          <a href="/" className="px-4 py-2 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/[0.03] flex items-center gap-2" style={{ color: INK }}>
            <ArrowLeft size={14} /> Back to Board
          </a>
        </div>

        {notice && <div className={`${cardCls} p-3 text-sm`} style={{ color: ACCENT }}>{notice}</div>}
        {error && <div className={`${cardCls} p-3 text-sm`} style={{ color: ALERT }}>{error}</div>}

        <div className="space-y-2">
          {list.map((u) => (
            <div key={u.username} className={`${cardCls} p-4 flex items-center gap-3 flex-wrap`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: INK }}>{u.name}</p>
                <p className="text-xs text-black/40 mt-0.5">{u.username}{u.username === me.username ? " · you" : ""}</p>
              </div>
              {u.role === "admin" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white" style={{ background: ACCENT }}>
                  <Shield size={10} /> admin
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-black/15 text-black/50">member</span>
              )}
              <button onClick={() => resetPassword(u.username)} title="Reset password"
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-black/10 hover:bg-black/[0.03] flex items-center gap-1.5" style={{ color: INK }}>
                <KeyRound size={12} /> Reset password
              </button>
              {u.username !== me.username && (
                <button onClick={() => removeUser(u.username)} title="Remove user"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-black/10 hover:bg-black/[0.03] flex items-center gap-1.5" style={{ color: ALERT }}>
                  <X size={12} /> Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={`${cardCls} p-6 space-y-3`}>
          <p className="text-sm font-medium" style={{ color: INK }}>Add user</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Username</label>
              <input placeholder="e.g. himshikhar" value={form.username} autoCapitalize="none"
                onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputCls + " mt-1"} />
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Display name</label>
              <input placeholder="e.g. Himshikhar" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls + " mt-1"} />
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Password</label>
              <div className="mt-1"><PasswordField value={form.password} onChange={(password) => { setForm({ ...form, password }); setAddError(""); }} /></div>
              <p className="text-[11px] mt-1" style={{ color: addProblem ? ALERT : "rgba(0,0,0,0.4)" }}>{addProblem || "At least 8 characters, not the username."}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls + " mt-1"}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-black/40">
            Every account gets its own board, and can send tasks to — and receive them from — any other account (Board → Submissions).
          </p>
          {addError && <p className="text-sm" style={{ color: ALERT }}>{addError}</p>}
          <button onClick={addUser} disabled={!form.username || !form.password || !!addProblem}
            style={{ background: !form.username || !form.password || addProblem ? "#C9C7C2" : INK }}
            className="text-white px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide flex items-center gap-2 hover:opacity-90 disabled:cursor-not-allowed">
            <Plus size={15} /> Add User
          </button>
        </div>
      </div>
      {resetting && <ResetPasswordModal username={resetting} onClose={() => setResetting(null)} onDone={flash} />}
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: PAPER, ...SANS }}>
      <div className={`${cardCls} w-full max-w-sm p-8 text-center space-y-4`}>
        <Shield size={24} className="mx-auto text-black/25" />
        <p className="text-sm text-black/55">This page is for admins only.</p>
        <a href="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-black/10 hover:bg-black/[0.03]" style={{ color: INK }}>
          <ArrowLeft size={14} /> Back to Board
        </a>
      </div>
    </div>
  );
}

export function ChangePassword({ onClose }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    try {
      await api("/api/auth/change-password", { method: "POST", body: form });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e) { setError(e.message); }
  };

  return (
    <Modal title="Change Password" onClose={onClose}>
      <div className="space-y-2">
        <input placeholder="Current password" type="password" value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} className={inputCls} />
        <PasswordField placeholder="New password" value={form.newPassword} onChange={(newPassword) => setForm({ ...form, newPassword })} />
        <p className="text-xs text-black/40">At least 8 characters, and not your username.</p>
        {error && <p className="text-sm" style={{ color: ALERT }}>{error}</p>}
        {done && <p className="text-sm" style={{ color: ACCENT }}>Password changed.</p>}
        <button onClick={submit} disabled={!form.currentPassword || !form.newPassword}
          style={{ background: !form.currentPassword || !form.newPassword ? "#C9C7C2" : INK }}
          className="w-full text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:cursor-not-allowed">
          Update Password
        </button>
      </div>
    </Modal>
  );
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(() => getAuth()?.user || null);
  const [checked, setChecked] = useState(false);
  const isAdminPage = window.location.pathname.replace(/\/+$/, "") === "/admin";

  useEffect(() => {
    if (!getAuth()) {
      // Central sign-on: no local session, so ask the CPG portal whether this visitor is signed in
      // there (no-op unless VITE_AUTH_URL is set). Anything short of success shows the login form.
      let cancelled = false;
      (async () => {
        try {
          const token = await resolveSsoToken();
          if (token && !cancelled) {
            const data = await api("/api/auth/sso", { method: "POST", body: { token } });
            if (!cancelled) { setAuth(data); setUser(data.user); }
          }
        } catch { /* fall through to the login form */ }
        if (!cancelled) setChecked(true);
      })();
      return () => { cancelled = true; };
    }
    api("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => { clearAuth(); setUser(null); })
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6" style={{ background: PAPER, ...SANS }} aria-busy="true">
        <div className="w-full max-w-sm space-y-3">
          <p className="text-lg text-center" style={{ color: INK, ...SERIF }}>Executive Scheduler</p>
          <div className="h-14 rounded-2xl bg-black/[0.06] pulse-soft" />
          <p className="text-xs text-center text-black/40">Signing you in…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Login onLogin={setUser} />;

  if (isAdminPage) {
    if (user.role !== "admin") return <NotAuthorized />;
    return (
      <>
        <div className="absolute top-2 right-3 z-40 flex items-center gap-3 text-xs no-print" style={SANS}>
          <button onClick={() => { ssoLogout(); clearAuth(); window.location.href = "/"; }} className="text-black/40 hover:text-black/70 flex items-center gap-1" title="Sign out">
            <LogOut size={13} /> Sign out
          </button>
        </div>
        <AdminPage me={user} />
      </>
    );
  }

  // The app draws its own header (name, account menu, sign out) once signed in.
  return <>{children}</>;
}
