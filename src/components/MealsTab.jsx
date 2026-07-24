import { useState } from "react";
import { CATEGORIES, guessCategory } from "../constants";
import { Card, Btn, Input, Label, Badge, EmptyState } from "./UI";

export default function MealsTab({ meals, addMeal, deleteMeal, addIngredient, deleteIngredient, setIngCategory }) {
  const [expanded, setExpanded] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [ingDraft, setIngDraft] = useState({});

  function handleAddMeal() {
    if (!newName.trim()) return;
    const id = addMeal(newName.trim());
    setExpanded(id);
    setNewName(""); setAdding(false);
  }

  function handleAddIng(mealId) {
    const d = ingDraft[mealId] || {};
    if (!d.name?.trim()) return;
    addIngredient(mealId, d.name.trim(), parseFloat(d.qty) || 1, d.unit?.trim() || "");
    setIngDraft(p => ({ ...p, [mealId]: { name:"", qty:"", unit:"" } }));
  }

  function setDraft(mealId, key, val) {
    setIngDraft(p => ({ ...p, [mealId]: { ...(p[mealId]||{}), [key]: val } }));
  }

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", color:"var(--heading)", margin:"16px 0 4px" }}>Meal Library</h1>
          <p style={{ fontSize:13, color:"var(--faint)", marginBottom:0 }}>{meals.length} meals · tap to manage ingredients</p>
        </div>
        <Btn variant="primary" onClick={() => setAdding(true)}>+ Add</Btn>
      </div>

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
        return (
          <Card key={meal.id}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", cursor:"pointer", userSelect:"none" }}
              onClick={() => setExpanded(open ? null : meal.id)}>
              <span style={{ fontWeight:600, fontSize:14, color:"var(--text)", flex:1 }}>{meal.name}</span>
              <Badge>{meal.ingredients.length} ing</Badge>
              <button onClick={e => { e.stopPropagation(); deleteMeal(meal.id); }}
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:16, padding:"2px 4px", marginLeft:4 }}>✕</button>
            </div>

            {open && (
              <div style={{ padding:"0 14px 14px", borderTop:"1px solid var(--border-soft)" }}>
                {meal.ingredients.length === 0 && <EmptyState style={{ padding:"16px 0" }}>No ingredients yet.</EmptyState>}

                {meal.ingredients.map((ing, idx) => (
                  <div key={idx} style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:4, padding:"7px 0", borderBottom:"1px solid var(--border-soft)" }}>
                    <span style={{ flex:1, fontSize:13, color:"var(--text-2)", minWidth:100 }}>{ing.name}</span>
                    <select value={ing.category || guessCategory(ing.name)}
                      onChange={e => setIngCategory(meal.id, idx, e.target.value)}
                      style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, color:"var(--faint)", fontSize:11, padding:"2px 6px", outline:"none" }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={() => deleteIngredient(meal.id, idx)}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:16, padding:"2px 4px" }}>✕</button>
                  </div>
                ))}

                <div style={{ marginTop:12 }}>
                  <Label>Add ingredient</Label>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <Input value={d.name||""} onChange={e => setDraft(meal.id,"name",e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddIng(meal.id)}
                      placeholder="Name" style={{ flex:2, minWidth:100 }} />
                    <Input value={d.qty||""} onChange={e => setDraft(meal.id,"qty",e.target.value)}
                      type="number" placeholder="Qty" style={{ width:60 }} />
                    <Input value={d.unit||""} onChange={e => setDraft(meal.id,"unit",e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddIng(meal.id)}
                      placeholder="Unit" style={{ width:80 }} />
                    <Btn variant="primary" onClick={() => handleAddIng(meal.id)}>Add</Btn>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
