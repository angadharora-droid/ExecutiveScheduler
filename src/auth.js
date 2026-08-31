const KEY = "es_auth";

export const getAuth = () => {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
};
export const setAuth = (data) => localStorage.setItem(KEY, JSON.stringify(data));
export const clearAuth = () => localStorage.removeItem(KEY);

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
