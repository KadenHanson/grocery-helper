import { useState } from "react";
import { DAYS, WEEKDAY_TO_SHORT } from "../constants";
import { aggregateIngredients, applyOverrides } from "../useStore";
import { Btn, BtnSm, Input, Label, Block, EmptyState } from "./UI";

export default function GroceryTab({ state, addExtraItem, deleteExtra, setOverride, clearOverrides }) {
  const { importedPlan, manualPlan, extraItems, groceryOverrides, meals } = state;
  const [exportMode, setExportMode] = useState("grocery");
  const [newExtra, setNewExtra] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");
  const [toast, setToast] = useState(null);

  const rawAgg = aggregateIngredients(state);
  const agg = applyOverrides(rawAgg, groceryOverrides);
  const hasOverrides = Object.keys(groceryOverrides || {}).length > 0;

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
    if (exportMode === "grocery") {
      const lines = agg.map(i => i.qty > 1 ? `${i.name} (${i.qty})` : i.name);
      if (extraItems.length) { lines.push(""); extraItems.forEach(e => lines.push(e)); }
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
      if (extraItems.length) { out.push(""); out.push("OTHER"); extraItems.forEach(e => out.push(`- ${e}`)); }
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

  const tabPill = (mode, label) => (
    <button onClick={() => setExportMode(mode)}
      style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${exportMode === mode ? "#e8e8e8" : "#2a2a2a"}`, background:"none", color: exportMode === mode ? "#e8e8e8" : "#555", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
      {label}
    </button>
  );

  return (
    <div>
      <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:"#fff", margin:"16px 0 4px" }}>Grocery List</h1>
      <p style={{ fontSize:13, color:"#555", marginBottom:20 }}>{total ? `From ${total} planned meal${total !== 1 ? "s" : ""}` : "No meals planned yet"}</p>

      {/* Ingredients */}
      {(agg.length > 0 || rawAgg.length > 0) ? (
        <Block>
          <div style={{ display:"flex", alignItems:"center", marginBottom:6 }}>
            <Label style={{ margin:0 }}>Ingredients needed</Label>
            {hasOverrides && <BtnSm onClick={clearOverrides} style={{ marginLeft:"auto" }}>Reset edits</BtnSm>}
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
            return (
              <div key={key} style={itemStyle}>
                <div style={itemBodyStyle} onClick={() => startEdit(i)}>
                  <span style={{ flex:1 }}>{i.name}</span>
                  {i.qty > 1 && <span style={{ color:"#555", fontSize:12 }}>({i.qty})</span>}
                </div>
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
        {extraItems.map((item, i) => (
          <div key={i} style={{ ...itemStyle, marginBottom: i === extraItems.length - 1 ? 8 : 0 }}>
            <div style={{ ...itemBodyStyle, cursor:"default" }}><span style={{ flex:1 }}>{item}</span></div>
            <div style={itemDelStyle} onClick={() => deleteExtra(i)}>✕</div>
          </div>
        ))}
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
          {tabPill("notes", "Full Notes")}
          {tabPill("json", "JSON DB")}
        </div>
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
