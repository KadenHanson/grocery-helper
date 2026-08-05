import { useState, useEffect, useCallback, useRef } from "react";
import { guessCategory, normalize, isSpecial, CATEGORIES, priceKey, titleCaseName } from "./constants";
import { loadFromCloud, saveToCloud, loadFromLocal, saveToLocal, cloudConfigured } from "./storage";
import { normalizeMeta, stampMeta, mergeStates, genId } from "./merge";

const DEFAULT_STATE = {
  meals: [],
  importedPlan: [],
  manualPlan: {},
  extraItems: [],
  groceryOverrides: {},
  checkedItems: {},
  prices: {},
  stores: {},
  qtyTypes: {},
  planStart: "",
  weekCount: 1,
};

// Title-Case every ingredient + extra-item name. Idempotent, so applying it on
// every hydrate (local load AND the remote doc pre-merge) makes all devices
// converge on consistent casing with no migration flag. Casing is display-only
// for behavior — all keys are lowercased downstream.
function normalizeNames(state) {
  return {
    ...state,
    meals: (state.meals || []).map(m => ({
      ...m,
      ingredients: (m.ingredients || []).map(i => ({ ...i, name: titleCaseName(i.name) })),
    })),
    extraItems: (state.extraItems || []).map(e => ({ ...e, name: titleCaseName(e.name) })),
  };
}

// Migrate a single-week manualPlan (keys "S"/"M"/…) to week-scoped composite
// keys ("0:S"). Remaps the matching _meta stamps + tombstones too, so per-day
// last-writer-wins survives. Then derives weekCount from the keys + any saved value.
function migrateManualWeeks(s, savedWeekCount) {
  const mp = s.manualPlan || {};
  if (Object.keys(mp).some(k => !k.includes(":"))) {
    const bump = (obj) => {
      if (!obj) return obj;
      const out = {};
      for (const k of Object.keys(obj)) out[k.includes(":") ? k : `0:${k}`] = obj[k];
      return out;
    };
    s.manualPlan = bump(mp);
    if (s._meta) {
      s._meta.manualPlan = bump(s._meta.manualPlan);
      if (s._meta.del) s._meta.del.manualPlan = bump(s._meta.del.manualPlan);
    }
  }
  const maxWeek = Object.keys(s.manualPlan).reduce((mx, k) => {
    const w = parseInt(String(k).split(":")[0], 10);
    return isNaN(w) ? mx : Math.max(mx, w);
  }, 0);
  s.weekCount = Math.max(1, maxWeek + 1, savedWeekCount || 1);
}

// Normalize a saved doc into current shape: fill defaults, migrate legacy
// extraItems (string[] -> {id,name}[]) and single-week manualPlan, normalize
// names, drop backup wrapper keys, ensure _meta.
function mergeState(saved) {
  const { _backup, _date, ...rest } = saved || {};
  const s = {
    ...DEFAULT_STATE,
    ...rest,
    groceryOverrides: rest.groceryOverrides || {},
    checkedItems: rest.checkedItems || {},
    prices: rest.prices || {},
    stores: rest.stores || {},
    qtyTypes: rest.qtyTypes || {},
    planStart: rest.planStart || "",
    manualPlan: rest.manualPlan || {},
  };
  s.extraItems = (s.extraItems || []).map(e =>
    typeof e === "string" ? { id: genId("x"), name: e } : e
  );
  migrateManualWeeks(s, rest.weekCount);
  return normalizeNames(normalizeMeta(s));
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
      const remoteState = remote.state ? normalizeNames(normalizeMeta(remote.state)) : null;
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

  // Add a fully-formed meal (from the recipe-import confirm screen). Ingredients
  // arrive already shaped as {name, qty, unit, category} via parseRecipe.
  function importMeal({ name, ingredients, recipeText, sourceUrl, servings }) {
    const id = "meal-" + Date.now();
    update(s => ({
      ...s,
      meals: [...s.meals, { id, name, ingredients: ingredients || [], recipeText: recipeText || "", sourceUrl: sourceUrl || "", servings: servings || null }],
    }));
    return id;
  }

  // Attach/edit a recipe reference on any meal (imported, manual, or default).
  // Empty values clear the fields.
  function setMealRecipe(mealId, { recipeText, sourceUrl }) {
    update(s => ({
      ...s,
      meals: s.meals.map(m => m.id !== mealId ? m : { ...m, recipeText: recipeText || "", sourceUrl: sourceUrl || "" }),
    }));
  }

  function addIngredient(mealId, name, qty, unit) {
    const nm = titleCaseName(name);
    update(s => ({
      ...s,
      meals: s.meals.map(m => m.id !== mealId ? m : {
        ...m,
        ingredients: [...m.ingredients, { name: nm, qty, unit, category: guessCategory(nm) }]
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

  function setIngredientQty(mealId, idx, qty) {
    const q = parseFloat(qty) || 1;
    update(s => ({
      ...s,
      meals: s.meals.map(m => m.id !== mealId ? m : {
        ...m,
        ingredients: m.ingredients.map((ing, i) => i !== idx ? ing : { ...ing, qty: q })
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

  function setPlanStart(date) { update(s => ({ ...s, planStart: date })); }

  // Multi-week manual planning. Weeks are 0-based; manualPlan keys are "week:day"
  // (e.g. "0:S"). addWeek appends; removeLastWeek drops the last week and its
  // assignments (only the last is removable — avoids reindexing).
  function addWeek() { update(s => ({ ...s, weekCount: (s.weekCount || 1) + 1 })); }
  function removeLastWeek() {
    update(s => {
      const wc = s.weekCount || 1;
      if (wc <= 1) return s;
      const last = wc - 1;
      const mp = { ...s.manualPlan };
      for (const k of Object.keys(mp)) if (k.startsWith(`${last}:`)) delete mp[k];
      return { ...s, manualPlan: mp, weekCount: wc - 1 };
    });
  }

  // Swap which meal sits on two manual days.
  function swapDays(a, b) {
    update(s => {
      const mp = { ...s.manualPlan };
      const va = mp[a], vb = mp[b];
      if (vb === undefined) delete mp[a]; else mp[a] = vb;
      if (va === undefined) delete mp[b]; else mp[b] = va;
      return { ...s, manualPlan: mp };
    });
  }

  // Swap the meal content of two imported-plan slots (weekday/date stay put).
  function swapImported(i, j) {
    update(s => {
      const ip = s.importedPlan.map(e => ({ ...e }));
      if (!ip[i] || !ip[j]) return s;
      for (const k of ["meal", "matchedId", "special"]) {
        const t = ip[i][k]; ip[i][k] = ip[j][k]; ip[j][k] = t;
      }
      return { ...s, importedPlan: ip };
    });
  }

  // Reassign an imported-plan slot to a library meal (or a special).
  function setImportedMeal(i, mealId) {
    update(s => {
      const ip = s.importedPlan.map(e => ({ ...e }));
      if (!ip[i]) return s;
      if (mealId === "__GRILL__" || mealId === "__LEFTOVER__") {
        ip[i] = { ...ip[i], matchedId: null, special: true, meal: mealId === "__GRILL__" ? "Grill Out" : "Leftovers/Go Out" };
      } else {
        const m = s.meals.find(x => x.id === mealId);
        ip[i] = { ...ip[i], matchedId: mealId, special: false, meal: m ? m.name : ip[i].meal };
      }
      return { ...s, importedPlan: ip };
    });
  }

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
  function addExtraItem(val) { update(s => ({ ...s, extraItems: [...s.extraItems, { id: genId("x"), name: titleCaseName(val) }] })); }
  function deleteExtra(id) { update(s => ({ ...s, extraItems: s.extraItems.filter(e => e.id !== id) })); }

  function setOverride(key, data) {
    update(s => ({ ...s, groceryOverrides: { ...s.groceryOverrides, [key]: data } }));
  }
  function clearOverrides() { update(s => ({ ...s, groceryOverrides: {} })); }

  // Interactive shopping checklist. Keys are prefixed by source ("i:"<name> for
  // aggregated ingredients, "x:"<id> for extra items) so the two never collide.
  // Unchecking deletes the key (a merge tombstone) so the map holds only checked
  // entries — same last-writer-wins semantics as the other synced collections.
  function toggleChecked(key) {
    update(s => {
      const next = { ...s.checkedItems };
      if (next[key]) delete next[key]; else next[key] = true;
      return { ...s, checkedItems: next };
    });
  }
  function clearChecked() { update(s => ({ ...s, checkedItems: {} })); }

  // Remembered per-item unit prices, keyed by lowercased item name so a price
  // typed once carries across weeks and applies to any item with that name.
  // Empty/invalid clears the entry.
  function setPrice(name, value) {
    const key = priceKey(name);
    const n = parseFloat(value);
    update(s => {
      const next = { ...s.prices };
      if (!key || !isFinite(n) || n <= 0) delete next[key];
      else next[key] = Math.round(n * 100) / 100;
      return { ...s, prices: next };
    });
  }

  // Quantity qualifier per item name: "meal" (meals-worth) vs default individual.
  // Display-only (cost stays price × qty); helps read what the number means.
  function setQtyType(name, type) {
    const key = priceKey(name);
    update(s => {
      const next = { ...s.qtyTypes };
      if (!key || type !== "meal") delete next[key]; else next[key] = "meal";
      return { ...s, qtyTypes: next };
    });
  }

  // Remembered store assignment, keyed by lowercased item name (like prices).
  // Empty value clears it (item falls back to "Unassigned").
  function setStore(name, store) {
    const key = name.trim().toLowerCase();
    update(s => {
      const next = { ...s.stores };
      if (!key || !store) delete next[key];
      else next[key] = store;
      return { ...s, stores: next };
    });
  }

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
    state, syncStatus, cloudReady: cloudConfigured(),
    addMeal, deleteMeal, importMeal, setMealRecipe,
    addIngredient, deleteIngredient, setIngCategory, setIngredientQty,
    importPlan, clearImport, setManualDay, clearManualDay,
    setPlanStart, swapDays, swapImported, setImportedMeal, addWeek, removeLastWeek,
    addExtraItem, deleteExtra, setOverride, clearOverrides,
    toggleChecked, clearChecked, setPrice, setStore, setQtyType,
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

// weekFilter: null/"all" aggregates every manual week (default); a week index
// (number or numeric string) restricts manual meals to that week. The imported
// plan is always included.
export function aggregateIngredients(state, weekFilter = null) {
  const map = {};
  const addMeal = (meal) => {
    if (!meal) return;
    meal.ingredients.forEach(ing => {
      const key = ing.name.toLowerCase();
      if (!map[key]) map[key] = { name: ing.name, qty: 0, unit: ing.unit, category: ing.category || null };
      map[key].qty += ing.qty;
    });
  };
  state.importedPlan.forEach(entry => {
    if (entry.special || !entry.matchedId) return;
    addMeal(state.meals.find(m => m.id === entry.matchedId));
  });
  const onlyWeek = weekFilter != null && weekFilter !== "all" ? Number(weekFilter) : null;
  Object.entries(state.manualPlan).forEach(([key, id]) => {
    if (onlyWeek != null && parseInt(String(key).split(":")[0], 10) !== onlyWeek) return;
    if (id === "__GRILL__" || id === "__LEFTOVER__") return;
    addMeal(state.meals.find(m => m.id === id));
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
