import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_MEALS, guessCategory, normalize, isSpecial, CATEGORIES } from "./constants";
import { loadFromCloud, saveToCloud, loadFromLocal, saveToLocal } from "./storage";

const DEFAULT_STATE = {
  meals: DEFAULT_MEALS,
  importedPlan: [],
  manualPlan: {},
  extraItems: [],
  groceryOverrides: {},
};

function mergeState(saved) {
  return {
    ...DEFAULT_STATE,
    ...saved,
    groceryOverrides: saved.groceryOverrides || {},
  };
}

export function useStore() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);

  // Load on mount — local first, then cloud
  useEffect(() => {
    const local = loadFromLocal();
    if (local) setState(mergeState(local));

    loadFromCloud().then(cloud => {
      if (cloud) setState(mergeState(cloud));
    });
  }, []);

  // Debounced save whenever state changes
  const save = useCallback((newState) => {
    saveToLocal(newState);
    clearTimeout(saveTimer.current);
    setSyncStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const ok = await saveToCloud(newState);
      setSyncStatus(ok ? "saved" : "error");
      setTimeout(() => setSyncStatus("idle"), 2000);
    }, 1000);
  }, []);

  const update = useCallback((updater) => {
    setState(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      save(next);
      return next;
    });
  }, [save]);

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
  function addExtraItem(val) { update(s => ({ ...s, extraItems: [...s.extraItems, val] })); }
  function deleteExtra(i) { update(s => ({ ...s, extraItems: s.extraItems.filter((_, j) => j !== i) })); }

  function setOverride(key, data) {
    update(s => ({ ...s, groceryOverrides: { ...s.groceryOverrides, [key]: data } }));
  }
  function clearOverrides() { update(s => ({ ...s, groceryOverrides: {} })); }

  // ── Backup / Restore ──────────────────────────────────────────────────────
  function restoreBackup(data) {
    const next = mergeState(data);
    setState(next);
    save(next);
  }

  // ── Manual sync ───────────────────────────────────────────────────────────
  async function syncNow() {
    setSyncStatus("saving");
    const ok = await saveToCloud(state);
    setSyncStatus(ok ? "saved" : "error");
    setTimeout(() => setSyncStatus("idle"), 2000);
  }

  async function pullNow() {
    setSyncStatus("saving");
    const cloud = await loadFromCloud();
    if (cloud) {
      const next = mergeState(cloud);
      setState(next);
      saveToLocal(next);
      setSyncStatus("saved");
    } else {
      setSyncStatus("error");
    }
    setTimeout(() => setSyncStatus("idle"), 2000);
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
