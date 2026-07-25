// Cloud storage via the grocery-helper sync backend (Deno Deploy + Deno KV).
//
// The backend holds all storage credentials and enforces compare-and-swap, so
// the browser only needs two things:
//   - VITE_SYNC_URL   the backend URL, baked in at build time. NOT secret.
//   - a shared secret, entered once per device and kept in localStorage.
//     NEVER put this in the bundle or an env var: this site is public, and
//     inlining it would recreate the exact exposed-key problem we're fixing.
//
// Contract:
//   loadFromCloud()            -> { state, version } | null
//                                 null = not configured or backend unreachable.
//                                 state may be null when the backend is empty.
//   saveToCloud(state, version)-> { ok, conflict? }
//                                 conflict = { state, version } on a 409 (someone
//                                 else wrote first) so the caller can re-merge.

const SYNC_URL = import.meta.env.VITE_SYNC_URL;
const SECRET_KEY = "gh_sync_secret";

export function getSecret() {
  try { return localStorage.getItem(SECRET_KEY) || ""; } catch { return ""; }
}

export function setSecret(v) {
  try {
    if (v) localStorage.setItem(SECRET_KEY, v);
    else localStorage.removeItem(SECRET_KEY);
  } catch {}
}

// Cloud sync only runs when we have both a backend URL and a secret to auth with.
export function cloudConfigured() {
  return Boolean(SYNC_URL && getSecret());
}

function authHeaders() {
  return { "Authorization": `Bearer ${getSecret()}`, "Content-Type": "application/json" };
}

export async function loadFromCloud() {
  if (!cloudConfigured()) return null;
  try {
    const res = await fetch(`${SYNC_URL}/data`, { headers: authHeaders() });
    if (!res.ok) return null;
    const { version, data } = await res.json();
    return { state: data ?? null, version: version ?? null };
  } catch {
    return null;
  }
}

export async function saveToCloud(state, version) {
  if (!cloudConfigured()) return { ok: false };
  try {
    const res = await fetch(`${SYNC_URL}/data`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ version: version ?? null, data: state }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 409) {
      const { version: v, data } = await res.json();
      return { ok: false, conflict: { state: data ?? null, version: v ?? null } };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// Local cache is namespaced per secret so different households (different
// secrets) never share a local store — otherwise switching secrets would merge
// one household's data (and its deletion tombstones) into another's.
function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function localKey() {
  const s = getSecret();
  return s ? "mealdb3_" + shortHash(s) : "mealdb3";
}

export function loadFromLocal() {
  try {
    const s = localStorage.getItem(localKey());
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function saveToLocal(state) {
  try { localStorage.setItem(localKey(), JSON.stringify(state)); } catch {}
}
