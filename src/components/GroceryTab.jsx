import { useState } from "react";
import { DAYS, WEEKDAY_TO_SHORT } from "../constants";
import { aggregateIngredients, applyOverrides } from "../useStore";
import { Btn, BtnSm, Input, Label, Block, EmptyState } from "./UI";

export default function GroceryTab({ state, addExtraItem, deleteExtra, setOverride, clearOverrides, toggleChecked, clearChecked, setPrice }) {
  const { importedPlan, manualPlan, extraItems, groceryOverrides, meals, checkedItems, prices } = state;
  const [exportMode, setExportMode] = useState("grocery");
  const [newExtra, setNewExtra] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [toast, setToast] = useState(null);

  const rawAgg = aggregateIngredients(state);
  const agg = applyOverrides(rawAgg, groceryOverrides);
  const hasOverrides = Object.keys(groceryOverrides || {}).length > 0;

  const checked = checkedItems || {};
  const ingKey = (i) => "i:" + i.name.toLowerCase();
  const extraKey = (e) => "x:" + e.id;
  const totalItems = agg.length + extraItems.length;
  const checkedCount = agg.filter(i => checked[ingKey(i)]).length + extraItems.filter(e => checked[extraKey(e)]).length;

  const priceMap = prices || {};
  const priceOf = (name) => priceMap[(name || "").trim().toLowerCase()];
  const estTotal = agg.reduce((s, i) => s + (priceOf(i.name) || 0) * (i.qty || 1), 0)
    + extraItems.reduce((s, e) => s + (priceOf(e.name) || 0), 0);
  const pricedCount = agg.filter(i => priceOf(i.name)).length + extraItems.filter(e => priceOf(e.name)).length;

  const importedCount = importedPlan.filter(e => !e.special && e.matchedId).length;
  const manualCount = Object.values(manualPlan).filter(id => id !== "__GRILL__" && id !== "__LEFTOVER__").length;
  const total = importedCount + manualCount;

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  function startEdit(item) {
    setEditingKey(item.name.toLowerCase());
    setEditName(item.name);
    setEditQty(String(item.qty));
  }

  function saveEdit(key) {
    if (!editName.trim()) return;
    setOverride(key, { name: editName.trim(), qty: parseFloat(editQty) || 1 });
    setEditingKey(null);
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
      return [...agg.map(i => i.name), ...extraItems.map(e => e.name)].join("\n");
    }
    if (exportMode === "grocery") {
      const lines = agg.map(i => i.qty > 1 ? `${i.name} (${i.qty})` : i.name);
      if (extraItems.length) { lines.push(""); extraItems.forEach(e => lines.push(e.name)); }
      return lines.join("\n");
    }
    if (exportMode === "notes") {
      const today = new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
      const dinnerLines = importedPlan.map(e => {
        const short = WEEKDAY_TO_SHORT[e.weekday] || e.weekday.slice(0,2);
        return `${short}- ${e.meal}`;
      });
      DAYS.forEach(d => {
        const id = manualPlan[d];
        if (id) dinnerLines.push(`${d}- ${getMealName(id)}`);
      });
      const ingLines = agg.map(i => `- ${i.name}${i.qty > 1 ? ` (${i.qty})` : ""}`);
      const out = [`Week of: ${today}`, "", "DINNER", ...dinnerLines, "", "GROCERIES", ...ingLines];
      if (extraItems.length) { out.push(""); out.push("OTHER"); extraItems.forEach(e => out.push(`- ${e.name}`)); }
      return out.join("\n");
    }
    return JSON.stringify({ version:1, meals: state.meals }, null, 2);
  }

  function copyExport() {
    const text = buildExport();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied!")).catch(() => showToast("Copy failed"));
    } else { showToast("Copy failed"); }
  }

  const itemBodyStyle = { flex:1, padding:"13px 0", cursor:"pointer", display:"flex", alignItems:"center", gap:8, minWidth:0 };
  const itemDelStyle = { display:"flex", alignItems:"center", justifyContent:"center", width:52, flexShrink:0, borderLeft:"1px solid #1e1e1e", marginLeft:12, cursor:"pointer", color:"#3a3a3a", fontSize:20 };
  const itemStyle = { fontSize:13, color:"#ccc", display:"flex", alignItems:"stretch", borderBottom:"1px solid #1a1a1a", margin:"0 -16px", padding:"0 16px" };
  const checkCellStyle = (on) => ({ display:"flex", alignItems:"center", justifyContent:"center", width:34, flexShrink:0, cursor:"pointer", fontSize:17, color: on ? "#4a9" : "#3a3a3a", userSelect:"none" });
  const nameStyle = (on) => ({ flex:1, textDecoration: on ? "line-through" : "none", color: on ? "#555" : undefined });
  const priceInputStyle = { width:56, flexShrink:0, alignSelf:"center", marginLeft:8, background:"#0d0d0d", border:"1px solid #262626", borderRadius:6, color:"#bbb", fontSize:12, padding:"5px 6px", fontFamily:"inherit", textAlign:"right" };

  // Uncontrolled price field, committed on blur/Enter so typing doesn't spam the
  // synced store. Keyed by name+stored so it re-syncs if a peer changes the price.
  function priceCell(name) {
    const stored = priceOf(name);
    return (
      <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="$"
        defaultValue={stored ?? ""} key={(name || "").toLowerCase() + ":" + (stored ?? "")}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        onBlur={e => { const v = e.target.value.trim(); if (String(v) !== String(stored ?? "")) setPrice(name, v); }}
        style={priceInputStyle} />
    );
  }

  const tabPill = (mode, label) => (
    <button onClick={() => setExportMode(mode)}
      style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${exportMode === mode ? "#e8e8e8" : "#2a2a2a"}`, background:"none", color: exportMode === mode ? "#e8e8e8" : "#555", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
      {label}
    </button>
  );

  return (
    <div>
      <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:"#fff", margin:"16px 0 4px" }}>Grocery List</h1>
      <p style={{ fontSize:13, color:"#555", marginBottom:16 }}>{total ? `From ${total} planned meal${total !== 1 ? "s" : ""}` : "No meals planned yet"}</p>

      {totalItems > 0 && (
        <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:18, padding:"11px 14px", background:"#0d0d0d", border:"1px solid #1e1e1e", borderRadius:10 }}>
          <span style={{ fontSize:12, color:"#777" }}>Est. total</span>
          <span style={{ fontSize:19, fontWeight:700, color:"#fff" }}>${estTotal.toFixed(2)}</span>
          <span style={{ fontSize:11, color:"#555", marginLeft:"auto" }}>{pricedCount}/{totalItems} priced</span>
        </div>
      )}

      {/* Ingredients */}
      {(agg.length > 0 || rawAgg.length > 0) ? (
        <Block>
          <div style={{ display:"flex", alignItems:"center", marginBottom:6, gap:8 }}>
            <Label style={{ margin:0 }}>Ingredients needed</Label>
            {totalItems > 0 && <span style={{ fontSize:11, color: checkedCount === totalItems ? "#4a9" : "#555" }}>{checkedCount}/{totalItems} in cart</span>}
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              {checkedCount > 0 && <BtnSm onClick={clearChecked}>Uncheck all</BtnSm>}
              {hasOverrides && <BtnSm onClick={clearOverrides}>Reset edits</BtnSm>}
            </div>
          </div>
          {agg.map(i => {
            const key = i.name.toLowerCase();
            if (editingKey === key) {
              return (
                <div key={key} style={{ ...itemStyle, flexWrap:"wrap", padding:"10px 16px", gap:6, alignItems:"center" }}>
                  <Input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit(key)}
                    style={{ flex:2, minWidth:120 }} autoFocus />
                  <Input value={editQty} onChange={e => setEditQty(e.target.value)}
                    type="number" style={{ width:64 }} />
                  <Btn variant="primary" onClick={() => saveEdit(key)} style={{ padding:"7px 12px", fontSize:12 }}>Save</Btn>
                  <Btn onClick={() => setEditingKey(null)} style={{ padding:"7px 12px", fontSize:12 }}>Cancel</Btn>
                </div>
              );
            }
            const on = !!checked[ingKey(i)];
            return (
              <div key={key} style={itemStyle}>
                <div style={checkCellStyle(on)} onClick={() => toggleChecked(ingKey(i))}>{on ? "☑" : "☐"}</div>
                <div style={itemBodyStyle} onClick={() => startEdit(i)}>
                  <span style={nameStyle(on)}>{i.name}</span>
                  {i.qty > 1 && <span style={{ color:"#555", fontSize:12 }}>({i.qty})</span>}
                </div>
                {priceCell(i.name)}
                <div style={itemDelStyle} onClick={() => setOverride(key, null)}>✕</div>
              </div>
            );
          })}
        </Block>
      ) : (
        <EmptyState>No meals planned — import a plan or assign meals manually.</EmptyState>
      )}

      {/* Extra items */}
      <Block>
        <Label>Extra items</Label>
        {extraItems.map((item, i) => {
          const on = !!checked[extraKey(item)];
          return (
            <div key={item.id} style={{ ...itemStyle, marginBottom: i === extraItems.length - 1 ? 8 : 0 }}>
              <div style={checkCellStyle(on)} onClick={() => toggleChecked(extraKey(item))}>{on ? "☑" : "☐"}</div>
              <div style={{ ...itemBodyStyle, cursor:"default" }}><span style={nameStyle(on)}>{item.name}</span></div>
              {priceCell(item.name)}
              <div style={itemDelStyle} onClick={() => deleteExtra(item.id)}>✕</div>
            </div>
          );
        })}
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <Input value={newExtra} onChange={e => setNewExtra(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddExtra()}
            placeholder="Add item…" />
          <Btn variant="primary" onClick={handleAddExtra} style={{ whiteSpace:"nowrap" }}>Add</Btn>
        </div>
      </Block>

      {/* Export */}
      <Block>
        <Label>Export</Label>
        <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
          {tabPill("grocery", "Grocery only")}
          {tabPill("anylist", "AnyList")}
          {tabPill("notes", "Full Notes")}
          {tabPill("json", "JSON DB")}
        </div>
        {exportMode === "anylist" && (
          <p style={{ fontSize:11, color:"#555", marginTop:0, marginBottom:10, lineHeight:1.5 }}>
            Copy, then in AnyList tap add-item and paste — it splits each line into its own item (which you can then bulk-add to Walmart from AnyList).
          </p>
        )}
        <div style={{ background:"#0d0d0d", border:"1px solid #222", borderRadius:10, padding:14, fontFamily:"monospace", fontSize:12, color:"#aaa", whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:260, overflowY:"auto" }}>
          {buildExport()}
        </div>
        <button onClick={copyExport} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 16px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600, fontSize:13, background:"#1e1e1e", color:"#aaa", marginTop:12, fontFamily:"inherit" }}>
          📋 Copy to clipboard
        </button>
      </Block>

      {toast && (
        <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"#e8e8e8", color:"#0a0a0a", borderRadius:10, padding:"10px 20px", fontWeight:600, fontSize:13, zIndex:999, pointerEvents:"none", whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
