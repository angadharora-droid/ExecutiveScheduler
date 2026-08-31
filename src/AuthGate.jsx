import React, { useState, useEffect } from "react";
import { Users, LogOut, KeyRound, X, Plus, Shield, ArrowLeft } from "lucide-react";
import { getAuth, setAuth, clearAuth, api } from "./auth.js";

const INK = "#20222B";
const PAPER = "#F7F5F1";
const ACCENT = "#2F5D62";
const ALERT = "#B23A3A";

const SERIF = { fontFamily: "Georgia, 'Iowan Old Style', ui-serif, serif" };
const SANS = { fontFamily: "'Inter', ui-sans-serif, system-ui" };
const inputCls = "w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-black/30 bg-white";
const cardCls = "bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className={`${cardCls} w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-b-none sm:rounded-2xl`}>
        <div className="p-5 border-b border-black/[0.06] flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg" style={{ color: INK, ...SERIF }}>{title}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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
      <form onSubmit={submit} className={`${cardCls} w-full max-w-sm p-8 space-y-4`}>
        <div className="text-center space-y-1 mb-2">
          <h1 className="font-serif text-2xl" style={{ color: INK, ...SERIF }}>Executive Scheduler</h1>
          <p className="text-sm text-black/45">Sign in to continue</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoCapitalize="none" className={inputCls + " mt-1"} />
        </div>
        <div>
          <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + " mt-1"} />
        </div>
        {error && <p className="text-sm" style={{ color: ALERT }}>{error}</p>}
        <button type="submit" disabled={busy || !username || !password}
          style={{ background: busy || !username || !password ? "#C9C7C2" : INK }}
          className="w-full text-white px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide hover:opacity-90 disabled:cursor-not-allowed">
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

/* Admin page: user management only — nothing else is handled here. */
function AdminPage({ me }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "member" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = () => api("/api/auth/users").then((d) => setList(d.users)).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 2500); };

  const addUser = async () => {
    setError("");
    try {
      await api("/api/auth/users", { method: "POST", body: form });
      flash(`User "${form.username.trim().toLowerCase()}" added.`);
      setForm({ username: "", name: "", password: "", role: "member" });
      refresh();
    } catch (e) { setError(e.message); }
  };

  const removeUser = async (username) => {
    if (!window.confirm(`Remove user "${username}"?`)) return;
    setError("");
    try { await api(`/api/auth/users/${encodeURIComponent(username)}`, { method: "DELETE" }); flash(`User "${username}" removed.`); refresh(); }
    catch (e) { setError(e.message); }
  };

  const resetPassword = async (username) => {
    const password = window.prompt(`New password for "${username}":`);
    if (!password) return;
    setError("");
    try { await api(`/api/auth/users/${encodeURIComponent(username)}/password`, { method: "PUT", body: { password } }); flash(`Password updated for "${username}".`); }
    catch (e) { setError(e.message); }
  };

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
            <div key={u.username} className={`${cardCls} p-4 flex items-center gap-3`}>
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
              <input type="text" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls + " mt-1"} />
            </div>
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-wide">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls + " mt-1"}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button onClick={addUser} disabled={!form.username || !form.password}
            style={{ background: !form.username || !form.password ? "#C9C7C2" : INK }}
            className="text-white px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide flex items-center gap-2 hover:opacity-90 disabled:cursor-not-allowed">
            <Plus size={15} /> Add User
          </button>
        </div>
      </div>
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

function ChangePassword({ onClose }) {
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
        <input placeholder="New password" type="password" value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })} className={inputCls} />
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
  const [showPassword, setShowPassword] = useState(false);
  const isAdminPage = window.location.pathname.replace(/\/+$/, "") === "/admin";

  useEffect(() => {
    if (!getAuth()) { setChecked(true); return; }
    api("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => { clearAuth(); setUser(null); })
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-black/40" style={{ background: PAPER }}>Loading…</div>;
  }
  if (!user) return <Login onLogin={setUser} />;

  if (isAdminPage) {
    if (user.role !== "admin") return <NotAuthorized />;
    return (
      <>
        <div className="fixed top-2 right-3 z-40 flex items-center gap-3 text-xs no-print" style={SANS}>
          <button onClick={() => { clearAuth(); window.location.href = "/"; }} className="text-black/40 hover:text-black/70 flex items-center gap-1" title="Sign out">
            <LogOut size={13} /> Sign out
          </button>
        </div>
        <AdminPage me={user} />
      </>
    );
  }

  return (
    <>
      <div className="fixed top-2 right-3 z-40 flex items-center gap-3 text-xs no-print" style={SANS}>
        <button onClick={() => setShowPassword(true)} className="text-black/40 hover:text-black/70 flex items-center gap-1" title="Change password">
          {user.name}
        </button>
        {user.role === "admin" && (
          <a href="/admin" className="text-black/40 hover:text-black/70 flex items-center gap-1" title="Manage users">
            <Users size={13} /> Users
          </a>
        )}
        <button onClick={() => { clearAuth(); window.location.reload(); }} className="text-black/40 hover:text-black/70 flex items-center gap-1" title="Sign out">
          <LogOut size={13} /> Sign out
        </button>
      </div>
      {showPassword && <ChangePassword onClose={() => setShowPassword(false)} />}
      {children}
    </>
  );
}
