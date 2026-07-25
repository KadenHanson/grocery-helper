import { useState, useRef } from "react";
import { DAYS, DAY_NAMES, WEEKDAY_TO_SHORT, SPECIAL_OPTS, priceKey } from "../constants";
import { Btn, BtnSm, Input, Label, Badge, EmptyState, Block } from "./UI";

export default function PlanTab({ state, importPlan, clearImport, setManualDay, clearManualDay }) {
  const { meals, importedPlan, manualPlan } = state;
  const [selectedDay, setSelectedDay] = useState(null);
  const [search, setSearch] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleJSON(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleJSON(text) {
    try {
      const data = JSON.parse(text);
      const dinners = data.dinner || data.dinners || data.meals || [];
      if (!Array.isArray(dinners) || !dinners.length) { alert("No dinner entries found"); return; }
      importPlan(dinners);
    } catch { alert("Invalid JSON"); }
  }

  function handlePaste() { handleJSON(pasteText); setPasteText(""); setShowPaste(false); }

  function getMealName(id) {
    if (id === "__GRILL__") return "Grill Out";
    if (id === "__LEFTOVER__") return "Leftovers/Go Out";
    return meals.find(m => m.id === id)?.name || id;
  }

  const all = [...SPECIAL_OPTS, ...meals];
  const filtered = all.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const unmatched = importedPlan.filter(e => !e.special && !e.matchedId);

  const prices = state.prices || {};
  const priceOf = (name) => prices[priceKey(name)];
  const mealCost = (m) => (m?.ingredients || []).reduce((s, ing) => s + (priceOf(ing.name) || 0) * (ing.qty || 1), 0);
  const plannedMeals = [];
  importedPlan.forEach(e => { if (!e.special && e.matchedId) { const m = meals.find(x => x.id === e.matchedId); if (m) plannedMeals.push(m); } });
  DAYS.forEach(d => { const id = manualPlan[d]; if (id && id !== "__GRILL__" && id !== "__LEFTOVER__") { const m = meals.find(x => x.id === id); if (m) plannedMeals.push(m); } });
  const weeklyTotal = plannedMeals.reduce((s, m) => s + mealCost(m), 0);

  const rowStyle = { display:"flex", alignItems:"flex-start", gap:8, padding:"9px 14px", borderTop:"1px solid var(--border-soft)" };

  return (
    <div>
      <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:"var(--heading)", margin:"16px 0 4px" }}>Weekly Plan</h1>
      <p style={{ fontSize:13, color:"var(--faint)", marginBottom:16 }}>Import your plan JSON or assign meals manually</p>

      {plannedMeals.length > 0 && weeklyTotal > 0 && (
        <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:18, padding:"11px 14px", background:"var(--inset)", border:"1px solid var(--border-soft)", borderRadius:10 }}>
          <span style={{ fontSize:12, color:"var(--muted)" }}>Est. plan cost</span>
          <span style={{ fontSize:19, fontWeight:700, color:"var(--heading)" }}>${weeklyTotal.toFixed(2)}</span>
          <span style={{ fontSize:11, color:"var(--faint)", marginLeft:"auto" }}>{plannedMeals.length} meal{plannedMeals.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Import */}
      <Block>
        <Label>Load plan from JSON</Label>
        <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
          <Btn variant="primary" onClick={() => fileRef.current.click()}>📂 Pick file</Btn>
          <Btn onClick={() => setShowPaste(p => !p)}>📋 Paste JSON</Btn>
        </div>
        <input type="file" ref={fileRef} accept=".json" style={{ display:"none" }} onChange={handleFile} />
        {showPaste && (
          <div>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
              placeholder="Paste your plan JSON here…"
              style={{ width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:13, padding:"9px 12px", outline:"none", fontFamily:"inherit", resize:"vertical", minHeight:100, marginBottom:8 }} />
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="primary" onClick={handlePaste}>Import</Btn>
              <Btn onClick={() => setShowPaste(false)}>Cancel</Btn>
            </div>
          </div>
        )}
      </Block>

      {/* Unmatched warning */}
      {unmatched.length > 0 && (
        <div style={{ fontSize:12, color:"var(--warn)", background:"var(--warn-bg)", border:"1px solid var(--warn-bg)", borderRadius:8, padding:"10px 12px", marginBottom:12, lineHeight:1.5 }}>
          ⚠️ {unmatched.length} meal(s) not in library — add them to get ingredients.<br />
          <small style={{ opacity:.7 }}>{unmatched.map(e => e.meal).join(", ")}</small>
        </div>
      )}

      {/* Imported plan */}
      {importedPlan.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"var(--ghost)", textTransform:"uppercase" }}>Imported plan</span>
            <BtnSm onClick={clearImport}>Clear</BtnSm>
          </div>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
            {importedPlan.map((entry, i) => {
              const dayShort = WEEKDAY_TO_SHORT[entry.weekday] || entry.weekday.slice(0,2);
              const libMeal = entry.matchedId ? meals.find(m => m.id === entry.matchedId) : null;
              const color = entry.special ? "var(--faint)" : !entry.matchedId ? "var(--warn)" : "var(--text-2)";
              return (
                <div key={i} style={rowStyle}>
                  <span style={{ fontWeight:700, fontSize:12, color:"var(--faint)", width:34, paddingTop:2, flexShrink:0 }}>{dayShort}—</span>
                  <span style={{ flex:1, fontSize:13, color, fontStyle: entry.special ? "italic" : "normal" }}>{entry.meal}</span>
                  {libMeal && mealCost(libMeal) > 0 && <span style={{ fontSize:12, color:"var(--muted)", marginRight:6, alignSelf:"center" }}>${mealCost(libMeal).toFixed(2)}</span>}
                  {!entry.special && entry.matchedId && <Badge>{libMeal?.ingredients.length || 0} ing</Badge>}
                  {!entry.special && !entry.matchedId && <Badge warn>no match</Badge>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual */}
      <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"var(--ghost)", textTransform:"uppercase", display:"block", marginBottom:8 }}>Manual assignments</span>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:12 }}>
        {DAYS.map(d => (
          <button key={d} onClick={() => setSelectedDay(selectedDay === d ? null : d)}
            style={{ border:"none", borderRadius:8, padding:"10px 4px", textAlign:"center", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit", background: selectedDay === d ? "var(--invert-bg)" : "var(--input-bg)", color: selectedDay === d ? "var(--invert-fg)" : "var(--faint)" }}>
            {d}
          </button>
        ))}
      </div>

      {selectedDay && (
        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, marginBottom:12, overflow:"hidden" }}>
          <div style={{ padding:"12px 14px 8px" }}>
            <Label>Assign meal for {DAY_NAMES[selectedDay] || selectedDay}</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meals…" autoFocus />
          </div>
          <div style={{ maxHeight:220, overflowY:"auto" }}>
            {filtered.map(m => (
              <div key={m.id} onClick={() => { setManualDay(selectedDay, m.id); setSelectedDay(null); setSearch(""); }}
                style={{ padding:"11px 14px", cursor:"pointer", borderTop:"1px solid var(--border-soft)", fontSize:13, color:"var(--text-2)" }}>
                {m.name}
              </div>
            ))}
            {!filtered.length && <EmptyState style={{ padding:16 }}>No matches</EmptyState>}
          </div>
          <div style={{ padding:"8px 14px" }}>
            <Btn onClick={() => { setSelectedDay(null); setSearch(""); }}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
        {DAYS.map((d, i) => {
          const id = manualPlan[d];
          const name = id ? getMealName(id) : null;
          const m = id && id !== "__GRILL__" && id !== "__LEFTOVER__" ? meals.find(x => x.id === id) : null;
          const c = m ? mealCost(m) : 0;
          return (
            <div key={d} style={{ ...rowStyle, borderTop: i === 0 ? "none" : "1px solid var(--border-soft)" }}>
              <span style={{ fontWeight:700, fontSize:12, color:"var(--faint)", width:34, paddingTop:2, flexShrink:0 }}>{d}—</span>
              <span style={{ flex:1, fontSize:13, color: name ? "var(--text-2)" : "var(--ghost)", fontStyle: name ? "normal" : "italic" }}>{name || "not set"}</span>
              {c > 0 && <span style={{ fontSize:12, color:"var(--muted)", marginRight:6, alignSelf:"center" }}>${c.toFixed(2)}</span>}
              {id && <button onClick={() => clearManualDay(d)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--ghost)", fontSize:16, padding:"2px 4px" }}>✕</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
