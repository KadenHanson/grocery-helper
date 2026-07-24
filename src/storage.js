// JSONBin.io storage
// Set your credentials in .env:
//   VITE_JSONBIN_API_KEY=your_key
//   VITE_JSONBIN_BIN_ID=your_bin_id
//
// NOTE (Phase 1): VITE_JSONBIN_API_KEY is inlined into the public bundle, so
// anyone can read/write the bin. JSONBin also has no compare-and-swap, so the
// merge in useStore.js leaves a small read->PUT race window between tabs. Both
// are only fully fixed by putting a serverless shim in front of the bin.

const API_KEY = import.meta.env.VITE_JSONBIN_API_KEY;
const BIN_ID = import.meta.env.VITE_JSONBIN_BIN_ID;
const BASE = "https://api.jsonbin.io/v3/b";

export async function loadFromCloud() {
  if (!API_KEY || !BIN_ID) return null;
  try {
    const res = await fetch(`${BASE}/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": API_KEY }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.record || null;
  } catch {
    return null;
  }
}

export async function saveToCloud(state) {
  if (!API_KEY || !BIN_ID) return false;
  try {
    const res = await fetch(`${BASE}/${BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": API_KEY,
      },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function loadFromLocal() {
  try {
    const s = localStorage.getItem("mealdb3");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export function saveToLocal(state) {
  try { localStorage.setItem("mealdb3", JSON.stringify(state)); } catch {}
}
