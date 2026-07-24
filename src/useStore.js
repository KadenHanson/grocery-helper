import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_MEALS, guessCategory, normalize, isSpecial, CATEGORIES } from "./constants";
import { loadFromCloud, saveToCloud, loadFromLocal, saveToLocal, cloudConfigured } from "./storage";
import { normalizeMeta, stampMeta, mergeStates, genId } from "./merge";

const DEFAULT_STATE = {
  meals: DEFAULT_MEALS,
  importedPlan: [],
  manualPlan: {},
  extraItems: [],
  groceryOverrides: {},
};

// Normalize a saved doc into current shape: fill defaults, migrate legacy
// extraItems (string[] -> {id,name}[]), drop backup wrapper keys, ensure _meta.
function mergeState(saved) {
  const { _backup, _date, ...rest } = saved || {};
  const s = {
    ...DEFAULT_STATE,
    ...rest,
    groceryOverrides: rest.groceryOverrides || {},
  };
  s.extraItems = (s.extraItems || []).map(e =>
    typeof e === "string" ? { id: genId("x"), name: e } : e
  );
  return normalizeMeta(s);
}

export function useStore() {
  const [state, setState] = useState(() => normalizeMeta(DEFAULT_STATE));
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);
  const stateRef = useRef(state); // freshest state for async merges
  const syncing = useRef(false);  // guards overlapping focus pulls

  function flashStatus(ok, ms = 2000) {
    setSyncStatus(ok ? "saved" : "error");
    setTimeout(() => setSyncStatus("idle"), ms);
  }

  // Read cloud, merge it with the freshest local state, adopt the result, and
  // push back (with compare-and-swap) if we changed anything the cloud didn't
  // already have. This is the one code path for every cloud interaction (write,
  // mount, focus, buttons).
  //
  // The write is a CAS against the versionstamp we just read: if another writer
  // slipped in between our read and our PUT, the backend replies 409 with the
  // current doc, and we loop — re-merge against it and retry. That closes the
  // read->PUT race the old JSONBin path couldn't.
  const mergeSync = useCallback(async ({ push }) => {
    if (!cloudConfigured()) return true; // local-only mode: nothing to sync
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await loadFromCloud();
      if (!remote) return false; // backend unreachable
      const local = stateRef.current;
      const remoteState = remote.state ? normalizeMeta(remote.state) : null;
      const merged = remoteState ? mergeStates(local, remoteState) : local;
      stateRef.current = merged;
      setState(merged);
      saveToLocal(merged);
      // Upload if asked to, or if our merge produced something the cloud lacks
      // (including the first-ever write, when the backend is still empty).
      const contributed = !remoteState || JSON.stringify(merged) !== JSON.stringify(remoteState);
      if (!(push || contributed)) return true;
      const res = await saveToCloud(merged, remote.version);
      if (res.ok) return true;
      if (res.conflict) continue; // someone wrote first; loop re-reads & re-merges
      return false; // non-conflict error
    }
    return false; // exhausted retries — treat as a failed sync
  }, []);

  // Local write is immediate; cloud write is debounced and merges on the way up.
  const save = useCallback((newState) => {
    stateRef.current = newState;
    saveToLocal(newState);
    clearTimeout(saveTimer.current);
    setSyncStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const ok = await mergeSync({ push: true });
      flashStatus(ok);
    }, 1000);
  }, [mergeSync]);

  const update = useCallback((updater) => {
    setState(prev => {
      const draft = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      const next = { ...draft, _meta: stampMeta(prev, draft) };
      save(next);
      return next;
    });
  }, [save]);

  // Load on mount — local first, then merge in cloud.
  useEffect(() => {
    const local = loadFromLocal();
    if (local) {
      const m = mergeState(local);
      stateRef.current = m;
      setState(m);
    }
    if (!cloudConfigured()) return; // local-only until a secret is entered
    (async () => {
      setSyncStatus("saving");
      const ok = await mergeSync({ push: true });
      flashStatus(ok, 1500);
    })();
  }, [mergeSync]);

  // Pull-on-focus: a tab left open goes stale, so re-merge with the cloud when
  // it becomes visible again before it's allowed to write over anyone.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "hidden" || syncing.current) return;
      if (!cloudConfigured()) return;
      syncing.current = true;
      setSyncStatus("saving");
      mergeSync({ push: false })
        .then(ok => flashStatus(ok, 1500))
        .finally(() => { syncing.current = false; });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [mergeSync]);

  // ── Meal library ─────────────────────────────────────────────────────────
  function addMeal(name) {
    const id = "meal-" + Date.now();
    update(s => ({ ...s, meals: [...s.meals, { id, name, ingredients: [] }] }));
    return id;
  }

  function deleteMeal(id) {
    update(s => ({ ...s, meals: s.meals.filter(m => m.id !== id) }));
  }

  function addIngredient(mealId, name, qty, unit) {
    update(s => ({
      ...s,
      meals: s.meals.map(m => m.id !== mealId ? m : {
        ...m,
        ingredients: [...m.ingredients, { name, qty, unit, category: guessCategory(name) }]
      })
    }));
  }

  function deleteIngredient(mealId, idx) {
    update(s => ({
      ...s,
      meals: s.meals.map(m => m.id !== mealId ? m : {
        ...m,
        ingredients: m.ingredients.filter((_, i) => i !== idx)
      })
    }));
  }

  function setIngCategory(mealId, idx, category) {
    update(s => ({
      ...s,
      meals: s.meals.map(m => m.id !== mealId ? m : {
        ...m,
        ingredients: m.ingredients.map((ing, i) => i !== idx ? ing : { ...ing, category })
      })
    }));
  }

  // ── Plan ─────────────────────────────────────────────────────────────────
  function importPlan(dinners) {
    const imported = dinners.map(entry => {
      const mealName = entry.meal || entry.name || "";
      const special = isSpecial(mealName);
      const matchedId = special ? null : findMatch(mealName, state.meals);
      return { date: entry.date || "", weekday: entry.weekday || "", meal: mealName, matchedId, special };
    });
    update(s => ({ ...s, importedPlan: imported }));
    return imported;
  }

  function clearImport() { update(s => ({ ...s, importedPlan: [] })); }

  function setManualDay(day, mealId) {
    update(s => ({ ...s, manualPlan: { ...s.manualPlan, [day]: mealId } }));
  }

  function clearManualDay(day) {
    update(s => {
      const mp = { ...s.manualPlan };
      delete mp[day];
      return { ...s, manualPlan: mp };
    });
  }

  // ── Grocery ───────────────────────────────────────────────────────────────
  function addExtraItem(val) { update(s => ({ ...s, extraItems: [...s.extraItems, { id: genId("x"), name: val }] })); }
  function deleteExtra(id) { update(s => ({ ...s, extraItems: s.extraItems.filter(e => e.id !== id) })); }

  function setOverride(key, data) {
    update(s => ({ ...s, groceryOverrides: { ...s.groceryOverrides, [key]: data } }));
  }
  function clearOverrides() { update(s => ({ ...s, groceryOverrides: {} })); }

  // ── Backup / Restore ──────────────────────────────────────────────────────
  // A restore is authoritative: stamp changes AND tombstone anything the backup
  // dropped, so the restored data wins the subsequent merge instead of being
  // re-merged with stale cloud entries.
  function restoreBackup(data) {
    const backup = mergeState(data);
    const prev = stateRef.current;
    const next = { ...backup, _meta: stampMeta(prev, backup) };
    save(next);
    setState(next);
  }

  // ── Manual sync ───────────────────────────────────────────────────────────
  async function syncNow() {
    if (!cloudConfigured()) return flashStatus(false);
    setSyncStatus("saving");
    const ok = await mergeSync({ push: true });
    flashStatus(ok);
  }

  async function pullNow() {
    if (!cloudConfigured()) return flashStatus(false);
    setSyncStatus("saving");
    const ok = await mergeSync({ push: false });
    flashStatus(ok);
  }

  return {
    state, syncStatus,
    addMeal, deleteMeal, addIngredient, deleteIngredient, setIngCategory,
    importPlan, clearImport, setManualDay, clearManualDay,
    addExtraItem, deleteExtra, setOverride, clearOverrides,
    restoreBackup, syncNow, pullNow,
  };
}

function findMatch(mealName, meals) {
  const n = normalize(mealName);
  let m = meals.find(m => normalize(m.name) === n);
  if (m) return m.id;
  m = meals.find(m => n.includes(normalize(m.name)) || normalize(m.name).includes(n));
  if (m) return m.id;
  const words = n.split(" ").filter(w => w.length > 2);
  const wordSet = new Set(words);
  let best = null, bestScore = 0;
  meals.forEach(m => {
    const mw = normalize(m.name).split(" ").filter(w => w.length > 2);
    const overlap = mw.filter(w => wordSet.has(w)).length;
    const score = overlap / Math.max(words.length, mw.length);
    if (score > bestScore && score >= 0.4) { bestScore = score; best = m; }
  });
  return best ? best.id : null;
}

export function aggregateIngredients(state) {
  const map = {};
  state.importedPlan.forEach(entry => {
    if (entry.special || !entry.matchedId) return;
    const meal = state.meals.find(m => m.id === entry.matchedId);
    if (!meal) return;
    meal.ingredients.forEach(ing => {
      const key = ing.name.toLowerCase();
      if (!map[key]) map[key] = { name: ing.name, qty: 0, unit: ing.unit, category: ing.category || null };
      map[key].qty += ing.qty;
    });
  });
  Object.values(state.manualPlan).forEach(id => {
    if (id === "__GRILL__" || id === "__LEFTOVER__") return;
    const meal = state.meals.find(m => m.id === id);
    if (!meal) return;
    meal.ingredients.forEach(ing => {
      const key = ing.name.toLowerCase();
      if (!map[key]) map[key] = { name: ing.name, qty: 0, unit: ing.unit, category: ing.category || null };
      map[key].qty += ing.qty;
    });
  });
  return Object.values(map)
    .map(i => ({ ...i, category: i.category || guessCategory(i.name) }))
    .sort((a, b) => {
      const ai = CATEGORIES.indexOf(a.category), bi = CATEGORIES.indexOf(b.category);
      const diff = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
}

export function applyOverrides(agg, overrides) {
  return agg.map(i => {
    const key = i.name.toLowerCase();
    if (key in overrides) {
      if (overrides[key] === null) return null;
      return { ...i, ...overrides[key] };
    }
    return i;
  }).filter(Boolean);
}
