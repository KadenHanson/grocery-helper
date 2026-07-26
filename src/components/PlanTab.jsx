import { useState, useRef } from "react";
import { DAYS, DAY_NAMES, WEEKDAY_TO_SHORT, SPECIAL_OPTS, priceKey } from "../constants";
import { Btn, BtnSm, Input, Label, Badge, EmptyState, Block } from "./UI";

const WD_OFFSET = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };

function readBool(key, def) {
  try { const v = localStorage.getItem(key); return v == null ? def : v === "1"; } catch { return def; }
}

// Tap-to-swap + pointer drag-to-swap over rows tagged with data-swapkey.
// onSwap fires exactly once per gesture (never inside a state updater), and a
// short guard swallows the synthetic click browsers fire right after a drag —
// otherwise the swap would run twice and appear to "swap back".
function useSwap(onSwap) {
  const [selected, setSelected] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const guard = useRef(false);
  function tap(key) {
    if (guard.current) return;
    if (selected == null) { setSelected(key); return; }
    if (selected === key) { setSelected(null); return; }
    const from = selected;
    setSelected(null);
    onSwap(from, key);
  }
  function keyAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest("[data-swapkey]");
    return row ? row.getAttribute("data-swapkey") : null;
  }
  function startDrag(key) {
    return (e) => {
      e.preventDefault();
      setSelected(null);
      setOverKey(key);
      const move = (ev) => setOverKey(keyAt(ev.clientX, ev.clientY));
      const up = (ev) => {
        const target = keyAt(ev.clientX, ev.clientY);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setOverKey(null);
        guard.current = true;
        setTimeout(() => { guard.current = false; }, 350);
        if (target && target !== key) onSwap(key, target);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
  }
  return { selected, overKey, tap, startDrag };
}

function Section({ title, collapsed, onToggle, right, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"4px 0", marginBottom: collapsed ? 0 : 8 }}>
        <span style={{ fontSize:10, color:"var(--faint)", display:"inline-block", transform: collapsed ? "rotate(-90deg)" : "none", transition:"transform .15s" }}>▼</span>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"var(--ghost)", textTransform:"uppercase" }}>{title}</span>
        {right && <div style={{ marginLeft:"auto" }} onClick={e => e.stopPropagation()}>{right}</div>}
      </div>
      {!collapsed && children}
    </div>
  );
}

export default function PlanTab({ state, importPlan, clearImport, setManualDay, clearManualDay, setPlanStart, swapDays, swapImported, setImportedMeal }) {
  const { meals, importedPlan, manualPlan, planStart } = state;
  const [assignTarget, setAssignTarget] = useState(null); // { type:'manual', day } | { type:'imported', idx }
  const [search, setSearch] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [cImport, setCImport] = useState(() => readBool("plan_c_import", true));
  const [cImported, setCImported] = useState(() => readBool("plan_c_imported", false));
  const [cManual, setCManual] = useState(() => readBool("plan_c_manual", false));
  const fileRef = useRef();

  const toggle = (key, val, setter) => { setter(val); try { localStorage.setItem(key, val ? "1" : "0"); } catch {} };

  const manualSwap = useSwap((a, b) => swapDays(a, b));
  const importedSwap = useSwap((a, b) => swapImported(Number(a), Number(b)));

  // Dates: default to the Sunday of the current week; editable start.
  const now = new Date();
  const defSun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const startISO = planStart || `${defSun.getFullYear()}-${String(defSun.getMonth()+1).padStart(2,"0")}-${String(defSun.getDate()).padStart(2,"0")}`;
  function dateLabel(offset) {
    const [y, m, d] = startISO.split("-").map(Number);
    const dt = new Date(y, m - 1, d + offset);
    return dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  }

  function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleJSON(ev.target.result);
    reader.readAsText(file); e.target.value = "";
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

  const prices = state.prices || {};
  const priceOf = (name) => prices[priceKey(name)];
  const mealCost = (m) => (m?.ingredients || []).reduce((s, ing) => s + (priceOf(ing.name) || 0) * (ing.qty || 1), 0);
  const plannedMeals = [];
  importedPlan.forEach(e => { if (!e.special && e.matchedId) { const m = meals.find(x => x.id === e.matchedId); if (m) plannedMeals.push(m); } });
  DAYS.forEach(d => { const id = manualPlan[d]; if (id && id !== "__GRILL__" && id !== "__LEFTOVER__") { const m = meals.find(x => x.id === id); if (m) plannedMeals.push(m); } });
  const weeklyTotal = plannedMeals.reduce((s, m) => s + mealCost(m), 0);

  const all = [...SPECIAL_OPTS, ...meals];
  const filtered = all.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const unmatched = importedPlan.filter(e => !e.special && !e.matchedId);

  function pickMeal(mealId) {
    if (!assignTarget) return;
    if (assignTarget.type === "manual") setManualDay(assignTarget.day, mealId);
    else setImportedMeal(assignTarget.idx, mealId);
    setAssignTarget(null); setSearch("");
  }

  const rowStyle = { display:"flex", alignItems:"center", gap:8, padding:"9px 14px", borderTop:"1px solid var(--border-soft)" };
  const dateStyle = { fontSize:11, color:"var(--faint)", width:38, flexShrink:0 };
  const dayStyle = { fontWeight:700, fontSize:12, color:"var(--faint)", width:26, flexShrink:0 };
  const handleStyle = { cursor:"grab", color:"var(--ghost)", fontSize:16, padding:"0 4px", touchAction:"none", flexShrink:0, userSelect:"none" };
  const rowBg = (key, sw) => sw.overKey === key ? "var(--btn-bg)" : sw.selected === key ? "var(--warn-bg)" : "transparent";

  // Shared meal-picker panel (used by both plans when assignTarget is set).
  const picker = assignTarget && (
    <Block>
      <Label>{assignTarget.type === "manual" ? `Assign meal for ${DAY_NAMES[assignTarget.day] || assignTarget.day}` : "Change meal"}</Label>
      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meals…" autoFocus />
      <div style={{ maxHeight:220, overflowY:"auto", margin:"8px -16px 0" }}>
        {filtered.map(m => (
          <div key={m.id} onClick={() => pickMeal(m.id)}
            style={{ padding:"11px 16px", cursor:"pointer", borderTop:"1px solid var(--border-soft)", fontSize:13, color:"var(--text-2)" }}>
            {m.name}
          </div>
        ))}
        {!filtered.length && <EmptyState style={{ padding:16 }}>No matches</EmptyState>}
      </div>
      <div style={{ marginTop:10 }}>
        <Btn onClick={() => { setAssignTarget(null); setSearch(""); }}>Cancel</Btn>
      </div>
    </Block>
  );

  return (
    <div>
      <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:"var(--heading)", margin:"16px 0 4px" }}>Weekly Plan</h1>
      <p style={{ fontSize:13, color:"var(--faint)", marginBottom:16 }}>Import your plan JSON or assign meals manually</p>

      {plannedMeals.length > 0 && weeklyTotal > 0 && (
        <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:14, padding:"11px 14px", background:"var(--inset)", border:"1px solid var(--border-soft)", borderRadius:10 }}>
          <span style={{ fontSize:12, color:"var(--muted)" }}>Est. plan cost</span>
          <span style={{ fontSize:19, fontWeight:700, color:"var(--heading)" }}>${weeklyTotal.toFixed(2)}</span>
          <span style={{ fontSize:11, color:"var(--faint)", marginLeft:"auto" }}>{plannedMeals.length} meal{plannedMeals.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Week start + edit toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--muted)" }}>
          Week of
          <input type="date" value={startISO} onChange={e => setPlanStart(e.target.value)}
            style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:13, padding:"7px 10px", outline:"none", fontFamily:"inherit" }} />
        </label>
        <Btn variant={editMode ? "primary" : undefined} onClick={() => setEditMode(v => !v)} style={{ marginLeft:"auto" }}>
          {editMode ? "Done" : "✎ Edit"}
        </Btn>
      </div>
      {editMode && <p style={{ fontSize:11, color:"var(--faint)", margin:"-6px 0 12px", lineHeight:1.5 }}>Drag the ⠿ handle or tap two rows to swap days. Tap ✎ on a row to change its meal.</p>}

      {/* Import */}
      <Section title="Import from JSON" collapsed={cImport} onToggle={() => toggle("plan_c_import", !cImport, setCImport)}>
        <Block>
          <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
            <Btn variant="primary" onClick={() => fileRef.current.click()}>📂 Pick file</Btn>
            <Btn onClick={() => setShowPaste(p => !p)}>📋 Paste JSON</Btn>
            {importedPlan.length > 0 && <BtnSm onClick={clearImport} style={{ marginLeft:"auto" }}>Clear import</BtnSm>}
          </div>
          <input type="file" ref={fileRef} accept=".json" style={{ display:"none" }} onChange={handleFile} />
          {showPaste && (
            <div>
              <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste your plan JSON here…"
                style={{ width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:13, padding:"9px 12px", outline:"none", fontFamily:"inherit", resize:"vertical", minHeight:100, marginBottom:8 }} />
              <div style={{ display:"flex", gap:8 }}>
                <Btn variant="primary" onClick={handlePaste}>Import</Btn>
                <Btn onClick={() => setShowPaste(false)}>Cancel</Btn>
              </div>
            </div>
          )}
        </Block>
      </Section>

      {unmatched.length > 0 && (
        <div style={{ fontSize:12, color:"var(--warn)", background:"var(--warn-bg)", border:"1px solid var(--warn-bg)", borderRadius:8, padding:"10px 12px", marginBottom:12, lineHeight:1.5 }}>
          ⚠️ {unmatched.length} meal(s) not in library — add them to get ingredients.<br />
          <small style={{ opacity:.7 }}>{unmatched.map(e => e.meal).join(", ")}</small>
        </div>
      )}

      {/* Imported plan */}
      {importedPlan.length > 0 && (
        <Section title="Imported plan" collapsed={cImported} onToggle={() => toggle("plan_c_imported", !cImported, setCImported)}>
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
            {importedPlan.map((entry, i) => {
              const key = String(i);
              const off = WD_OFFSET[entry.weekday] ?? i;
              const short = WEEKDAY_TO_SHORT[entry.weekday] || (entry.weekday || "").slice(0,2);
              const libMeal = entry.matchedId ? meals.find(m => m.id === entry.matchedId) : null;
              const color = entry.special ? "var(--faint)" : !entry.matchedId ? "var(--warn)" : "var(--text-2)";
              return (
                <div key={i} data-swapkey={key} style={{ ...rowStyle, borderTop: i === 0 ? "none" : rowStyle.borderTop, background: rowBg(key, importedSwap), cursor: editMode ? "pointer" : "default" }}
                  onClick={editMode ? () => importedSwap.tap(key) : undefined}>
                  {editMode && <span style={handleStyle} onPointerDown={importedSwap.startDrag(key)}>⠿</span>}
                  <span style={dayStyle}>{short}</span>
                  <span style={dateStyle}>{dateLabel(off)}</span>
                  <span style={{ flex:1, fontSize:13, color, fontStyle: entry.special ? "italic" : "normal" }}>{entry.meal}</span>
                  {libMeal && mealCost(libMeal) > 0 && <span style={{ fontSize:12, color:"var(--muted)" }}>${mealCost(libMeal).toFixed(2)}</span>}
                  {!editMode && !entry.special && entry.matchedId && <Badge>{libMeal?.ingredients.length || 0} ing</Badge>}
                  {!editMode && !entry.special && !entry.matchedId && <Badge warn>no match</Badge>}
                  {editMode && <span onClick={e => { e.stopPropagation(); setAssignTarget({ type:"imported", idx:i }); }} style={{ cursor:"pointer", color:"var(--muted)", fontSize:14, padding:"0 4px" }}>✎</span>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Manual assignments */}
      <Section title="Manual assignments" collapsed={cManual} onToggle={() => toggle("plan_c_manual", !cManual, setCManual)}>
        <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
          {DAYS.map((d, i) => {
            const id = manualPlan[d];
            const name = id ? getMealName(id) : null;
            const m = id && id !== "__GRILL__" && id !== "__LEFTOVER__" ? meals.find(x => x.id === id) : null;
            const c = m ? mealCost(m) : 0;
            return (
              <div key={d} data-swapkey={d} style={{ ...rowStyle, borderTop: i === 0 ? "none" : rowStyle.borderTop, background: rowBg(d, manualSwap), cursor:"pointer" }}
                onClick={editMode ? () => manualSwap.tap(d) : () => setAssignTarget({ type:"manual", day:d })}>
                {editMode && <span style={handleStyle} onPointerDown={manualSwap.startDrag(d)}>⠿</span>}
                <span style={dayStyle}>{d}</span>
                <span style={dateStyle}>{dateLabel(i)}</span>
                <span style={{ flex:1, fontSize:13, color: name ? "var(--text-2)" : "var(--ghost)", fontStyle: name ? "normal" : "italic" }}>{name || "tap to set"}</span>
                {c > 0 && <span style={{ fontSize:12, color:"var(--muted)" }}>${c.toFixed(2)}</span>}
                {editMode && <span onClick={e => { e.stopPropagation(); setAssignTarget({ type:"manual", day:d }); }} style={{ cursor:"pointer", color:"var(--muted)", fontSize:14, padding:"0 4px" }}>✎</span>}
                {!editMode && id && <span onClick={e => { e.stopPropagation(); clearManualDay(d); }} style={{ cursor:"pointer", color:"var(--ghost)", fontSize:16, padding:"0 4px" }}>✕</span>}
              </div>
            );
          })}
        </div>
      </Section>

      {picker}
    </div>
  );
}
