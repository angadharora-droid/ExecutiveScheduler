const KEY = "es_auth";

export const getAuth = () => {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
};
export const setAuth = (data) => localStorage.setItem(KEY, JSON.stringify(data));
export const clearAuth = () => localStorage.removeItem(KEY);

// Once the session token is a day old the server sends a fresh one with its answer, so a
// session that keeps being used never runs out.
export const keepRenewed = (res) => {
  const token = res.headers.get("X-Session-Token");
  const auth = getAuth();
  if (token && auth) setAuth({ ...auth, token });
};

export async function api(url, { method = "GET", body } = {}) {
  const token = getAuth()?.token;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  keepRenewed(res);
  // A signed-in request refused as unauthorized means the session is over (it ran out, or the
  // password was changed or reset elsewhere): back to the sign-in screen.
  if (res.status === 401 && token) {
    clearAuth();
    window.location.reload();
    throw new Error("session expired");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
