import { useState } from "react";
import { DAYS, WEEKDAY_TO_SHORT, CATEGORIES, STORES, makeStoreGuesser, guessCategory, priceKey, TAX_RATE } from "../constants";
import { aggregateIngredients, applyOverrides } from "../useStore";
import { Btn, BtnSm, Input, Label, Block, EmptyState, QtyTag, PriceInput } from "./UI";
import OneOffLists from "./OneOffLists";

export default function GroceryTab({ state, addExtraItem, deleteExtra, setExtra, setOverride, clearOverrides, toggleChecked, clearChecked, setPrice, setStore, setQtyType,
  addOneoffList, deleteOneoffList, renameOneoffList, completeOneoffList, reopenOneoffList,
  addOneoffItem, setOneoffItem, deleteOneoffItem, toggleOneoffChecked, sweepCompletedOneoffs }) {
  const { importedPlan, manualPlan, extraItems, groceryOverrides, meals, checkedItems, prices, stores, qtyTypes } = state;
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("gh_grocery_mode") || "mealplan"; } catch { return "mealplan"; } }); // mealplan | oneoff
  function pickMode(m) { setMode(m); try { localStorage.setItem("gh_grocery_mode", m); } catch {} }
  const [view, setView] = useState("manage"); // manage | shop
  const [exportMode, setExportMode] = useState("grocery");
  const [newExtra, setNewExtra] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [toast, setToast] = useState(null);

  // Which manual week(s) feed the list: "all" (default) or a week index. Clamp a
  // stale selection (e.g. after a week was removed) back to "all".
  const weekCount = state.weekCount || 1;
  const [weekSel, setWeekSel] = useState(() => { try { return localStorage.getItem("gh_grocery_week") || "all"; } catch { return "all"; } });
  function pickWeek(v) { setWeekSel(v); try { localStorage.setItem("gh_grocery_week", v); } catch {} }
  const effWeek = weekSel !== "all" && Number(weekSel) < weekCount ? Number(weekSel) : "all";

  const rawAgg = aggregateIngredients(state, effWeek === "all" ? null : effWeek);
  const agg = applyOverrides(rawAgg, groceryOverrides);
  const hasOverrides = Object.keys(groceryOverrides || {}).length > 0;

  const checked = checkedItems || {};
  const priceMap = prices || {};
  const storeMap = stores || {};
  const priceOf = (name) => priceMap[priceKey(name)];
  const storeRaw = (name) => storeMap[(name || "").trim().toLowerCase()] || "";
  // Effective store: explicit assignment, else a guess learned from THIS
  // household's own assignments (most-used store for the item's category, then
  // overall, then a generic default). Used for Shop grouping + the Manage picker.
  const storeGuess = makeStoreGuesser(storeMap);
  const storeOf = (name) => storeRaw(name) || storeGuess(name);
  // Quantity qualifier (display-only): "meal" (meals-worth) vs "ind" (individual).
  const qtyMap = qtyTypes || {};
  const qtyTypeOf = (name) => qtyMap[priceKey(name)] === "meal" ? "meal" : "ind";
  const toggleQtyType = (name) => setQtyType(name, qtyTypeOf(name) === "meal" ? "ind" : "meal");

  // Unified item list used by every view + the totals. Extras fold into the
  // aggregated ingredients by lowercased name: an extra whose name matches a
  // planned ingredient adds its qty to that row (and tags it with extraId so it
  // stays removable); non-matching extras become their own categorized rows.
  // One de-duplicated, categorized, name-keyed (`i:<name>`) list — so adding
  // "butter" as an extra when it's already needed just bumps the one row.
  const itemMap = new Map();
  agg.forEach(i => {
    const key = i.name.toLowerCase();
    itemMap.set(key, { name: i.name, qty: i.qty, category: i.category || guessCategory(i.name), key, fromMeals: true, extraId: null, checkKey: "i:" + key });
  });
  extraItems.forEach(e => {
    const key = e.name.toLowerCase();
    const q = e.qty || 1;
    const row = itemMap.get(key);
    if (row) { row.qty += q; row.extraId = e.id; }
    else itemMap.set(key, { name: e.name, qty: q, category: guessCategory(e.name), key, fromMeals: false, extraId: e.id, checkKey: "i:" + key });
  });
  const items = [...itemMap.values()].sort((a, b) => {
    const ai = CATEGORIES.indexOf(a.category), bi = CATEGORIES.indexOf(b.category);
    const diff = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
  const totalItems = items.length;
  const checkedCount = items.filter(it => checked[it.checkKey]).length;
  const estTotal = items.reduce((s, it) => s + (priceOf(it.name) || 0) * (it.qty || 1), 0);
  const pricedCount = items.filter(it => priceOf(it.name)).length;
  const lineTotal = (it) => (priceOf(it.name) || 0) * (it.qty || 1);
  const tax = estTotal * TAX_RATE;
  const grandTotal = estTotal + tax;

  const [taxOn, setTaxOn] = useState(() => { try { return localStorage.getItem("gh_tax") === "1"; } catch { return false; } });
  function toggleTax() {
    setTaxOn(v => { const nv = !v; try { localStorage.setItem("gh_tax", nv ? "1" : ""); } catch {} return nv; });
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function startEdit(it) {
    setEditingKey(it.key);
    setEditName(it.name);
    setEditQty(String(it.qty));
  }
  // Save an inline edit. Meal-derived rows write a grocery override; a pure extra
  // updates the extra. A merged row (both) becomes a single override at the typed
  // total, and its extra is folded in (deleted) so it stops double-counting.
  function saveItemEdit(it) {
    const name = editName.trim();
    if (!name) return;
    const qty = parseFloat(editQty) || 1;
    if (it.fromMeals) {
      setOverride(it.key, { name, qty });
      if (it.extraId) deleteExtra(it.extraId);
    } else {
      setExtra(it.extraId, { name, qty });
    }
    setEditingKey(null);
  }
  function deleteItem(it) {
    if (it.fromMeals) setOverride(it.key, null);
    if (it.extraId) deleteExtra(it.extraId);
  }
  function handleAddExtra() {
    if (!newExtra.trim()) return;
    addExtraItem(newExtra.trim());
    setNewExtra("");
  }
  function getMealName(id) {
    if (id === "__GRILL__") return "Grill Out";
    if (id === "__LEFTOVER__") return "Leftovers/Go Out";
    return meals.find(m => m.id === id)?.name || id;
  }

  function buildExport() {
    if (exportMode === "anylist") {
      // AnyList bulk-add: one clean item name per line (it splits on line breaks).
      return items.map(i => i.name).join("\n");
    }
    if (exportMode === "grocery") {
      return items.map(i => i.qty > 1 ? `${i.name} (${i.qty})` : i.name).join("\n");
    }
    if (exportMode === "notes") {
      const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
      const dinnerLines = importedPlan.map(e => {
        const short = WEEKDAY_TO_SHORT[e.weekday] || e.weekday.slice(0, 2);
        return `${short}- ${e.meal}`;
      });
      DAYS.forEach(d => {
        const id = manualPlan[d];
        if (id) dinnerLines.push(`${d}- ${getMealName(id)}`);
      });
      const ingLines = items.map(i => `- ${i.name}${i.qty > 1 ? ` (${i.qty})` : ""}`);
      const out = [`Week of: ${today}`, "", "DINNER", ...dinnerLines, "", "GROCERIES", ...ingLines];
      return out.join("\n");
    }
    return JSON.stringify({ version: 1, meals: state.meals }, null, 2);
  }
  function copyExport() {
    const text = buildExport();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied!")).catch(() => showToast("Copy failed"));
    } else { showToast("Copy failed"); }
  }

  // Group an item list by category in CATEGORIES order (unknowns last).
  function byCategory(arr) {
    const groups = {};
    arr.forEach(it => { (groups[it.category] || (groups[it.category] = [])).push(it); });
    const ordered = CATEGORIES.filter(c => groups[c]);
    Object.keys(groups).forEach(c => { if (!CATEGORIES.includes(c)) ordered.push(c); });
    return ordered.map(c => ({ category: c, items: groups[c] }));
  }
  // Shop view: group by store (STORES order, Unassigned last), then category.
  const storeOrder = [...STORES, "Unassigned"];
  const byStore = {};
  items.forEach(it => { const st = storeOf(it.name); (byStore[st] || (byStore[st] = [])).push(it); });
  const storeGroups = storeOrder.filter(s => byStore[s]).map(s => ({ store: s, items: byStore[s] }));

  const itemBodyStyle = { flex: 1, padding: "13px 0", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, minWidth: 0 };
  const itemDelStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 44, flexShrink: 0, borderLeft: "1px solid var(--border-soft)", marginLeft: 8, cursor: "pointer", color: "var(--ghost)", fontSize: 18 };
  const itemStyle = { fontSize: 13, color: "var(--text-2)", display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border-soft)", margin: "0 -16px", padding: "0 16px" };
  const storeSelectStyle = { width: 92, flexShrink: 0, alignSelf: "center", marginLeft: 8, background: "var(--inset)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)", fontSize: 11, padding: "5px 4px", fontFamily: "inherit" };

  function priceCell(name) {
    const stored = priceOf(name);
    return (
      <PriceInput defaultValue={stored ?? ""} valueKey={(name || "").toLowerCase() + ":" + (stored ?? "")}
        stopClick wrapperStyle={{ marginLeft: 8, alignSelf: "center" }} inputStyle={{ width: 62 }}
        onCommit={v => { if (String(v) !== String(stored ?? "")) setPrice(name, v); }} />
    );
  }
  function storeCell(name) {
    return (
      <select value={storeOf(name)} onClick={e => e.stopPropagation()} onChange={e => setStore(name, e.target.value)} style={storeSelectStyle}>
        <option value="">Auto</option>
        {STORES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  const importedCount = importedPlan.filter(e => !e.special && e.matchedId).length;
  const manualCount = Object.values(manualPlan).filter(id => id !== "__GRILL__" && id !== "__LEFTOVER__").length;
  const total = importedCount + manualCount;

  const pill = (active, onClick, label) => (
    <button onClick={onClick}
      style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${active ? "var(--text)" : "var(--border)"}`, background: "none", color: active ? "var(--text)" : "var(--faint)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      {label}
    </button>
  );

  // Big, tap-friendly checkbox for the shop view.
  const bigCheckStyle = (on) => ({ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, flexShrink: 0, fontSize: 27, color: on ? "var(--accent)" : "var(--ghost)", userSelect: "none" });

  function shopRow(it) {
    const on = !!checked[it.checkKey];
    const lt = lineTotal(it);
    return (
      <div key={it.checkKey} onClick={() => toggleChecked(it.checkKey)}
        style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid var(--border-soft)", cursor: "pointer" }}>
        <div style={bigCheckStyle(on)}>{on ? "☑" : "☐"}</div>
        <span style={{ flex: 1, fontSize: 15, textDecoration: on ? "line-through" : "none", color: on ? "var(--faint)" : "var(--text)" }}>
          {it.name}
        </span>
        <QtyTag qty={it.qty} type={qtyTypeOf(it.name)} />
        {" "}
        {lt > 0 && <span style={{ fontSize: 13, color: on ? "var(--ghost)" : "var(--muted)", paddingRight: 4 }}>${lt.toFixed(2)}</span>}
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--heading)", margin: "16px 0 4px" }}>Grocery List</h1>
      <p style={{ fontSize: 13, color: "var(--faint)", marginBottom: 16 }}>{total ? `From ${total} planned meal${total !== 1 ? "s" : ""}` : "No meals planned yet"}</p>

      {/* Meal-plan list vs standalone one-off lists */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {pill(mode === "mealplan", () => pickMode("mealplan"), "Meal plan")}
        {pill(mode === "oneoff", () => pickMode("oneoff"), "One-off")}
      </div>

      {mode === "oneoff" ? (
        <OneOffLists
          lists={state.oneoffLists || []} prices={prices} stores={stores}
          setPrice={setPrice} setStore={setStore}
          addOneoffList={addOneoffList} deleteOneoffList={deleteOneoffList} renameOneoffList={renameOneoffList}
          completeOneoffList={completeOneoffList} reopenOneoffList={reopenOneoffList}
          addOneoffItem={addOneoffItem} setOneoffItem={setOneoffItem} deleteOneoffItem={deleteOneoffItem}
          toggleOneoffChecked={toggleOneoffChecked} sweepCompletedOneoffs={sweepCompletedOneoffs} />
      ) : (
      <>
      {totalItems > 0 && (
        <div style={{ marginBottom: 14, padding: "11px 14px", background: "var(--inset)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Est. {taxOn ? "subtotal" : "total"}</span>
            <span style={{ fontSize: 19, fontWeight: 700, color: "var(--heading)" }}>${estTotal.toFixed(2)}</span>
            <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: "auto" }}>{pricedCount}/{totalItems} priced</span>
          </div>
          {taxOn && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>+ Tax (6.5%) ${tax.toFixed(2)}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--heading)", marginLeft: "auto" }}>Total ${grandTotal.toFixed(2)}</span>
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: "var(--faint)", cursor: "pointer" }}>
            <input type="checkbox" checked={taxOn} onChange={toggleTax} style={{ cursor: "pointer" }} /> Add FL sales tax (6.5%)
          </label>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {pill(view === "manage", () => setView("manage"), "Manage")}
        {pill(view === "shop", () => setView("shop"), `Shop${checkedCount ? ` · ${checkedCount}/${totalItems}` : ""}`)}
      </div>

      {/* Week selector (only when the manual plan spans multiple weeks) */}
      {weekCount > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--faint)", marginRight: 2 }}>Shop for:</span>
          {pill(effWeek === "all", () => pickWeek("all"), "All weeks")}
          {Array.from({ length: weekCount }, (_, w) => pill(effWeek === w, () => pickWeek(String(w)), `Week ${w + 1}`))}
        </div>
      )}

      {view === "manage" ? (
        <>
          {/* Unified grocery list: planned ingredients + extras, categorized and
              de-duplicated. Add-item input feeds the same list as extras. */}
          <Block>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
              <Label style={{ margin: 0 }}>Grocery list</Label>
              {hasOverrides && <BtnSm onClick={clearOverrides} style={{ marginLeft: "auto" }}>Reset edits</BtnSm>}
            </div>
            {items.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ghost)", padding: "6px 0" }}>Nothing yet — plan meals or add an item below.</div>
            ) : byCategory(items).map(cg => (
              <div key={cg.category}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--ghost)", textTransform: "uppercase", margin: "10px 0 2px" }}>{cg.category}</div>
                {cg.items.map(it => {
                  if (editingKey === it.key) {
                    return (
                      <div key={it.key} style={{ ...itemStyle, flexWrap: "wrap", padding: "10px 16px", gap: 6, alignItems: "center" }}>
                        <Input value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveItemEdit(it)}
                          style={{ flex: 2, minWidth: 120 }} autoFocus />
                        <Input value={editQty} onChange={e => setEditQty(e.target.value)} type="number" style={{ width: 64 }} />
                        <Btn variant="primary" onClick={() => saveItemEdit(it)} style={{ padding: "7px 12px", fontSize: 12 }}>Save</Btn>
                        <Btn onClick={() => setEditingKey(null)} style={{ padding: "7px 12px", fontSize: 12 }}>Cancel</Btn>
                      </div>
                    );
                  }
                  return (
                    <div key={it.key} style={itemStyle}>
                      <div style={itemBodyStyle} onClick={() => startEdit(it)}>
                        <span style={{ flex: 1 }}>{it.name}</span>
                        <QtyTag qty={it.qty} type={qtyTypeOf(it.name)} onToggle={() => toggleQtyType(it.name)} />
                      </div>
                      {storeCell(it.name)}
                      {priceCell(it.name)}
                      <div style={itemDelStyle} onClick={() => deleteItem(it)}>✕</div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Input value={newExtra} onChange={e => setNewExtra(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddExtra()} placeholder="Add item…" />
              <Btn variant="primary" onClick={handleAddExtra} style={{ whiteSpace: "nowrap" }}>Add</Btn>
            </div>
          </Block>

          {/* Export */}
          <Block>
            <Label>Export</Label>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {pill(exportMode === "grocery", () => setExportMode("grocery"), "Grocery only")}
              {pill(exportMode === "anylist", () => setExportMode("anylist"), "AnyList")}
              {pill(exportMode === "notes", () => setExportMode("notes"), "Full Notes")}
              {pill(exportMode === "json", () => setExportMode("json"), "JSON DB")}
            </div>
            {exportMode === "anylist" && (
              <p style={{ fontSize: 11, color: "var(--faint)", marginTop: 0, marginBottom: 10, lineHeight: 1.5 }}>
                Copy, then in AnyList tap add-item and paste — it splits each line into its own item.
              </p>
            )}
            <div style={{ background: "var(--inset)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, fontFamily: "monospace", fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 260, overflowY: "auto" }}>
              {buildExport()}
            </div>
            <button onClick={copyExport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: "var(--btn-bg)", color: "var(--muted)", marginTop: 12, fontFamily: "inherit" }}>
              📋 Copy to clipboard
            </button>
          </Block>
        </>
      ) : (
        /* Shop view */
        totalItems === 0 ? (
          <EmptyState>Nothing to shop yet — add items in Manage.</EmptyState>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12, gap: 8 }}>
              <span style={{ fontSize: 13, color: checkedCount === totalItems ? "var(--accent)" : "var(--muted)" }}>{checkedCount} of {totalItems} in cart</span>
              {checkedCount > 0 && <BtnSm onClick={clearChecked} style={{ marginLeft: "auto" }}>Uncheck all</BtnSm>}
            </div>
            {storeGroups.map(g => {
              const gChecked = g.items.filter(it => checked[it.checkKey]).length;
              const gSubtotal = g.items.reduce((s, it) => s + lineTotal(it), 0);
              return (
                <Block key={g.store}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--heading)" }}>{g.store}</span>
                    <span style={{ fontSize: 11, color: gChecked === g.items.length ? "var(--accent)" : "var(--faint)" }}>{gChecked}/{g.items.length}</span>
                    {gSubtotal > 0 && <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>${gSubtotal.toFixed(2)}</span>}
                  </div>
                  {byCategory(g.items).map(cg => (
                    <div key={cg.category}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--ghost)", textTransform: "uppercase", margin: "10px 0 2px" }}>{cg.category}</div>
                      {cg.items.map(shopRow)}
                    </div>
                  ))}
                </Block>
              );
            })}
          </>
        )
      )}
      </>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--invert-bg)", color: "var(--invert-fg)", borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 13, zIndex: 999, pointerEvents: "none", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
