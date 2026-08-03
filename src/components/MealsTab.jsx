import { useState } from "react";
import { CATEGORIES, guessCategory, priceKey } from "../constants";
import { Card, Btn, Input, Label, Badge, EmptyState, TypeLabel, Autocomplete } from "./UI";
import { fetchRecipe } from "../storage";
import { parseRecipe } from "../recipe";

export default function MealsTab({ meals, addMeal, importMeal, setMealRecipe, cloudReady, deleteMeal, addIngredient, deleteIngredient, setIngCategory, setIngredientQty, prices, setPrice, qtyTypes, setQtyType }) {
  const [expanded, setExpanded] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [ingDraft, setIngDraft] = useState({});

  // Recipe import flow
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [confirm, setConfirm] = useState(null); // { name, sourceUrl, recipeText, rows:[{name,qty,unit,category,include}] }
  const [snapOpen, setSnapOpen] = useState(false); // confirm-screen snapshot toggle

  // Per-meal recipe reference (attach/edit on any meal)
  const [recipeEditId, setRecipeEditId] = useState(null);
  const [recipeDraft, setRecipeDraft] = useState({ text: "", url: "" });
  const [recipeShownId, setRecipeShownId] = useState(null); // read-only snapshot toggle

  async function runImport() {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true); setImportError("");
    const res = await fetchRecipe(url);
    setImporting(false);
    if (!res || res.error) { setImportError((res && res.error) || "Couldn't read that recipe."); return; }
    const parsed = parseRecipe(res);
    setConfirm({
      name: parsed.name,
      sourceUrl: parsed.sourceUrl,
      recipeText: parsed.recipeText,
      rows: parsed.ingredients.map(i => ({ ...i, include: true })),
    });
    setSnapOpen(false);
    setImportOpen(false); setImportUrl("");
  }

  function setRow(idx, patch) {
    setConfirm(c => ({ ...c, rows: c.rows.map((r, i) => i === idx ? { ...r, ...patch } : r) }));
  }

  function saveImport() {
    const rows = confirm.rows.filter(r => r.include && r.name.trim());
    const id = importMeal({
      name: confirm.name.trim() || "Untitled meal",
      ingredients: rows.map(r => ({
        name: r.name.trim(),
        qty: parseFloat(r.qty) || 1,
        unit: r.unit || "",
        category: r.category || guessCategory(r.name),
      })),
      recipeText: confirm.recipeText,
      sourceUrl: confirm.sourceUrl,
    });
    setConfirm(null);
    setExpanded(id);
  }

  function openRecipeEditor(meal) {
    setRecipeEditId(meal.id);
    setRecipeDraft({ text: meal.recipeText || "", url: meal.sourceUrl || "" });
  }
  function saveRecipeEditor(mealId) {
    setMealRecipe(mealId, { recipeText: recipeDraft.text.trim(), sourceUrl: recipeDraft.url.trim() });
    setRecipeEditId(null);
  }

  const priceMap = prices || {};
  const priceOf = (name) => priceMap[priceKey(name)];
  const qtyMap = qtyTypes || {};
  const qtyTypeOf = (name) => qtyMap[priceKey(name)] === "meal" ? "meal" : "ind";
  const toggleQtyType = (name) => setQtyType(name, qtyTypeOf(name) === "meal" ? "ind" : "meal");

  // Suggestions for the ingredient autocomplete: every distinct ingredient name
  // across the library, with a lookup for its remembered category.
  const ingredientNames = [...new Set(meals.flatMap(m => (m.ingredients || []).map(i => i.name)))].sort((a, b) => a.localeCompare(b));
  const catIndex = {};
  meals.forEach(m => (m.ingredients || []).forEach(i => { catIndex[i.name.toLowerCase()] = i.category || guessCategory(i.name); }));
  const mealCost = (m) => (m.ingredients || []).reduce((s, ing) => s + (priceOf(ing.name) || 0) * (ing.qty || 1), 0);
  const costed = meals.map(mealCost).filter(c => c > 0);
  const avgCost = costed.length ? costed.reduce((a, b) => a + b, 0) / costed.length : 0;

  // Uncontrolled price field, committed on blur/Enter (shared price map, keyed
  // fuzzily by name — so a price set here also fills the grocery list).
  function priceCell(name) {
    const stored = priceOf(name);
    return (
      <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="$"
        defaultValue={stored ?? ""} key={priceKey(name) + ":" + (stored ?? "")}
        onFocus={e => e.target.select()}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        onBlur={e => { const v = e.target.value.trim(); if (String(v) !== String(stored ?? "")) setPrice(name, v); }}
        style={{ width: 54, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)", fontSize: 11, padding: "3px 6px", outline: "none", textAlign: "right" }} />
    );
  }

  function handleAddMeal() {
    if (!newName.trim()) return;
    const id = addMeal(newName.trim());
    setExpanded(id);
    setNewName(""); setAdding(false);
  }

  function handleAddIng(mealId) {
    const d = ingDraft[mealId] || {};
    const name = d.name?.trim();
    if (!name) return;
    const meal = meals.find(m => m.id === mealId);
    const idx = meal ? meal.ingredients.length : 0; // the new ingredient's index
    addIngredient(mealId, name, parseFloat(d.qty) || 1, "");
    if (d.category) setIngCategory(mealId, idx, d.category);
    if (d.price) setPrice(name, d.price);
    setIngDraft(p => ({ ...p, [mealId]: { name:"", qty:"", category:"", price:"" } }));
  }

  function setDraft(mealId, key, val) {
    setIngDraft(p => ({ ...p, [mealId]: { ...(p[mealId]||{}), [key]: val } }));
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:"var(--heading)", margin:"16px 0 4px" }}>Meal Library</h1>
          <p style={{ fontSize:13, color:"var(--faint)", marginBottom:0 }}>{meals.length} meals{avgCost ? ` · avg $${avgCost.toFixed(2)}/meal` : ""} · tap to manage</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {cloudReady && (
            <Btn onClick={() => { setImportOpen(o => !o); setImportError(""); }}>Import URL</Btn>
          )}
          <Btn variant="primary" onClick={() => setAdding(true)}>+ Add</Btn>
        </div>
      </div>

      {importOpen && !confirm && (
        <Card style={{ padding:14, marginBottom:12 }}>
          <Label>Import from a recipe URL</Label>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <Input value={importUrl} onChange={e => setImportUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !importing && runImport()}
              placeholder="https://…" autoFocus />
          </div>
          {importError && <p style={{ fontSize:12, color:"var(--danger)", margin:"0 0 8px" }}>{importError}</p>}
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <Btn variant="primary" onClick={runImport}>{importing ? "Reading…" : "Import"}</Btn>
            <Btn onClick={() => { setImportOpen(false); setImportUrl(""); setImportError(""); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {confirm && (
        <Card style={{ padding:14, marginBottom:12 }}>
          <Label>Review imported meal</Label>
          <Input value={confirm.name} onChange={e => setConfirm(c => ({ ...c, name: e.target.value }))}
            placeholder="Meal name" style={{ marginBottom:10 }} />

          {confirm.rows.length === 0 && <EmptyState style={{ padding:"12px 0" }}>No ingredients found — you can still save and add them manually.</EmptyState>}

          {confirm.rows.map((r, idx) => (
            <div key={idx} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 0", borderBottom:"1px solid var(--border-soft)", opacity: r.include ? 1 : 0.4 }}>
              <input type="checkbox" checked={r.include} onChange={e => setRow(idx, { include: e.target.checked })}
                style={{ width:16, height:16, flexShrink:0 }} />
              <input type="number" inputMode="decimal" min="0" step="1" value={r.qty}
                onChange={e => setRow(idx, { qty: e.target.value })}
                style={{ width:44, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text-2)", fontSize:12, padding:"3px 4px", outline:"none", textAlign:"center" }} />
              <input type="text" value={r.name} onChange={e => setRow(idx, { name: e.target.value })}
                style={{ flex:1, minWidth:60, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text-2)", fontSize:13, padding:"5px 8px", outline:"none" }} />
              <select value={r.category || guessCategory(r.name)} onChange={e => setRow(idx, { category: e.target.value })}
                style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, color:"var(--faint)", fontSize:11, padding:"3px 6px", outline:"none", maxWidth:110 }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}

          {confirm.recipeText && (
            <div style={{ marginTop:10 }}>
              <button onClick={() => setSnapOpen(o => !o)}
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--faint)", fontSize:12, padding:0 }}>
                {snapOpen ? "▾" : "▸"} Original recipe
              </button>
              {snapOpen && (
                <pre style={{ whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"inherit", fontSize:12, color:"var(--text-2)", background:"var(--inset)", border:"1px solid var(--border-soft)", borderRadius:8, padding:10, marginTop:6, maxHeight:220, overflowY:"auto" }}>{confirm.recipeText}</pre>
              )}
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <Btn variant="primary" onClick={saveImport}>Save meal</Btn>
            <Btn onClick={() => setConfirm(null)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {adding && (
        <Card style={{ padding:14, marginBottom:12 }}>
          <Label>New meal name</Label>
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            <Input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddMeal()}
              placeholder="e.g. Sheet Pan Fajitas" autoFocus />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="primary" onClick={handleAddMeal}>Save</Btn>
            <Btn onClick={() => { setAdding(false); setNewName(""); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {meals.length === 0 && <EmptyState>No meals yet — add one above.</EmptyState>}

      {meals.map(meal => {
        const open = expanded === meal.id;
        const d = ingDraft[meal.id] || {};
        const cost = mealCost(meal);
        return (
          <Card key={meal.id}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", cursor:"pointer", userSelect:"none" }}
              onClick={() => setExpanded(open ? null : meal.id)}>
              <span style={{ fontWeight:600, fontSize:14, color:"var(--text)", flex:1 }}>{meal.name}</span>
              {cost > 0 && <span style={{ fontSize:12, fontWeight:600, color:"var(--muted)", marginRight:8 }}>${cost.toFixed(2)}</span>}
              <Badge>{meal.ingredients.length} ing</Badge>
              <button onClick={e => { e.stopPropagation(); deleteMeal(meal.id); }}
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:16, padding:"2px 4px", marginLeft:4 }}>✕</button>
            </div>

            {open && (
              <div style={{ padding:"0 14px 14px", borderTop:"1px solid var(--border-soft)" }}>
                {meal.ingredients.length === 0 && <EmptyState style={{ padding:"16px 0" }}>No ingredients yet.</EmptyState>}

                {meal.ingredients.map((ing, idx) => (
                  <div key={idx} style={{ padding:"8px 0", borderBottom:"1px solid var(--border-soft)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ flex:1, fontSize:13, color:"var(--text-2)", minWidth:60 }}>{ing.name}</span>
                      <select value={ing.category || guessCategory(ing.name)}
                        onChange={e => setIngCategory(meal.id, idx, e.target.value)}
                        style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, color:"var(--faint)", fontSize:11, padding:"2px 6px", outline:"none", maxWidth:150 }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={() => deleteIngredient(meal.id, idx)}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:16, padding:"2px 4px" }}>✕</button>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:6, marginTop:6 }}>
                      <input type="number" inputMode="decimal" min="0" step="1"
                        defaultValue={ing.qty} key={"q:" + meal.id + ":" + idx + ":" + ing.qty}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        onBlur={e => { const v = parseFloat(e.target.value) || 1; if (v !== ing.qty) setIngredientQty(meal.id, idx, v); }}
                        style={{ width:44, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text-2)", fontSize:12, padding:"3px 4px", outline:"none", textAlign:"center" }} />
                      <TypeLabel type={qtyTypeOf(ing.name)} onToggle={() => toggleQtyType(ing.name)} />
                      {priceCell(ing.name)}
                    </div>
                  </div>
                ))}

                <div style={{ marginTop:12 }}>
                  <Label>Add ingredient</Label>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                    <Autocomplete value={d.name || ""} options={ingredientNames}
                      wrapperStyle={{ flex:2, minWidth:110 }} placeholder="Name"
                      onChange={v => setDraft(meal.id, "name", v)}
                      onSelect={v => {
                        setDraft(meal.id, "name", v);
                        const c = catIndex[v.toLowerCase()]; if (c) setDraft(meal.id, "category", c);
                        const p = priceOf(v); if (p != null) setDraft(meal.id, "price", String(p));
                      }}
                      onEnter={() => handleAddIng(meal.id)} />
                    <Input value={d.qty||""} onChange={e => setDraft(meal.id,"qty",e.target.value)}
                      type="number" placeholder="Qty" style={{ width:56 }} />
                    <select value={d.category||""} onChange={e => setDraft(meal.id,"category",e.target.value)}
                      style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--faint)", fontSize:12, padding:"8px 6px", outline:"none" }}>
                      <option value="">Category…</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input value={d.price||""} onChange={e => setDraft(meal.id,"price",e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddIng(meal.id)}
                      type="number" placeholder="$" style={{ width:60 }} />
                    <Btn variant="primary" onClick={() => handleAddIng(meal.id)}>Add</Btn>
                  </div>
                </div>

                {recipeEditId === meal.id ? (
                  <div style={{ marginTop:12, borderTop:"1px solid var(--border-soft)", paddingTop:12 }}>
                    <Label>Recipe</Label>
                    <Input value={recipeDraft.url} onChange={e => setRecipeDraft(d => ({ ...d, url: e.target.value }))}
                      placeholder="Recipe URL (https://…)" style={{ marginBottom:8 }} />
                    <textarea value={recipeDraft.text} onChange={e => setRecipeDraft(d => ({ ...d, text: e.target.value }))}
                      placeholder="Paste or type the recipe to reference later…" rows={6}
                      style={{ width:"100%", boxSizing:"border-box", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:13, padding:"9px 12px", outline:"none", fontFamily:"inherit", resize:"vertical" }} />
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <Btn variant="primary" onClick={() => saveRecipeEditor(meal.id)}>Save</Btn>
                      <Btn onClick={() => setRecipeEditId(null)}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop:12, borderTop:"1px solid var(--border-soft)", paddingTop:12, display:"flex", flexWrap:"wrap", gap:12, alignItems:"center" }}>
                    {meal.sourceUrl && (
                      <a href={meal.sourceUrl} target="_blank" rel="noopener noreferrer"
                        style={{ textDecoration:"none", padding:"6px 12px", borderRadius:8, fontWeight:600, fontSize:12, background:"var(--btn-bg)", color:"var(--muted)" }}>
                        Open recipe ↗
                      </a>
                    )}
                    {meal.recipeText && (
                      <button onClick={() => setRecipeShownId(id => id === meal.id ? null : meal.id)}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"var(--faint)", fontSize:12, padding:0 }}>
                        {recipeShownId === meal.id ? "Hide recipe" : "Show recipe"}
                      </button>
                    )}
                    <button onClick={() => openRecipeEditor(meal)}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"var(--accent)", fontSize:12, padding:0 }}>
                      {meal.recipeText || meal.sourceUrl ? "Edit recipe" : "+ Add recipe"}
                    </button>
                  </div>
                )}
                {recipeShownId === meal.id && meal.recipeText && recipeEditId !== meal.id && (
                  <pre style={{ whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"inherit", fontSize:12, color:"var(--text-2)", background:"var(--inset)", border:"1px solid var(--border-soft)", borderRadius:8, padding:10, marginTop:8, maxHeight:260, overflowY:"auto" }}>{meal.recipeText}</pre>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
