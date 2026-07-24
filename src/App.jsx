import { useState, useEffect } from "react";
import "./index.css";
import { useStore } from "./useStore";
import MealsTab from "./components/MealsTab";
import PlanTab from "./components/PlanTab";
import GroceryTab from "./components/GroceryTab";
import BackupPanel from "./components/BackupPanel";

export default function App() {
  const [tab, setTab] = useState("meals");
  const [showSettings, setShowSettings] = useState(false);
  // Per-device UI preference (not synced) — each person keeps their own theme.
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("gh_theme") || "dark"; } catch { return "dark"; }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("gh_theme", theme); } catch {}
  }, [theme]);

  const store = useStore();

  const navBtn = (name, label) => (
    <button onClick={() => { setTab(name); setShowSettings(false); }}
      style={{
        flex: 1, padding:"9px 0", border:"none", borderRadius:8, cursor:"pointer",
        fontSize:13, fontWeight:600, fontFamily:"inherit",
        background: tab === name && !showSettings ? "var(--invert-bg)" : "transparent",
        color: tab === name && !showSettings ? "var(--invert-fg)" : "var(--faint)",
        transition:"all 0.15s",
      }}>
      {label}
    </button>
  );

  const iconBtn = (active, onClick, content, title) => (
    <button onClick={onClick} title={title}
      style={{ flex:0, width:40, padding:"9px 0", border:"none", borderRadius:8, cursor:"pointer", fontSize:16, fontFamily:"inherit", background: active ? "var(--invert-bg)" : "transparent", color: active ? "var(--invert-fg)" : "var(--faint)" }}>
      {content}
    </button>
  );

  return (
    <div style={{ fontFamily:"-apple-system, system-ui, sans-serif", background:"var(--bg)", minHeight:"100vh", color:"var(--text)" }}>
      {/* Nav panel */}
      <nav style={{ display:"flex", gap:2, padding:"12px 16px", background:"var(--surface)", borderBottom:"1px solid var(--border)", position:"sticky", top:0, zIndex:10 }}>
        {navBtn("meals", "Library")}
        {navBtn("plan", "Plan")}
        {navBtn("grocery", "Grocery")}
        {iconBtn(false, () => setTheme(t => t === "light" ? "dark" : "light"), theme === "light" ? "🌙" : "☀️", "Toggle light/dark")}
        {iconBtn(showSettings, () => setShowSettings(p => !p), "⚙️", "Settings")}
      </nav>

      {/* Sync indicator */}
      {store.syncStatus !== "idle" && (
        <div style={{ textAlign:"center", padding:"4px 0", fontSize:11, fontWeight:600,
          color: { saving:"var(--faint)", saved:"var(--accent)", error:"var(--danger)" }[store.syncStatus],
          background:"var(--surface)", borderBottom:"1px solid var(--border-soft)" }}>
          {{ saving:"Syncing…", saved:"Saved to cloud ✓", error:"Cloud sync failed — data saved locally" }[store.syncStatus]}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <BackupPanel
          state={store.state}
          restoreBackup={store.restoreBackup}
          syncNow={store.syncNow}
          pullNow={store.pullNow}
          syncStatus={store.syncStatus}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Tabs at top */}
      <main style={{ padding:16, maxWidth:600, margin:"0 auto" }}>
        {tab === "meals" && (
          <MealsTab
            meals={store.state.meals}
            addMeal={store.addMeal}
            deleteMeal={store.deleteMeal}
            addIngredient={store.addIngredient}
            deleteIngredient={store.deleteIngredient}
            setIngCategory={store.setIngCategory}
            prices={store.state.prices}
            setPrice={store.setPrice}
            qtyTypes={store.state.qtyTypes}
            setQtyType={store.setQtyType}
          />
        )}
        {tab === "plan" && (
          <PlanTab
            state={store.state}
            importPlan={store.importPlan}
            clearImport={store.clearImport}
            setManualDay={store.setManualDay}
            clearManualDay={store.clearManualDay}
          />
        )}
        {tab === "grocery" && (
          <GroceryTab
            state={store.state}
            addExtraItem={store.addExtraItem}
            deleteExtra={store.deleteExtra}
            setOverride={store.setOverride}
            clearOverrides={store.clearOverrides}
            toggleChecked={store.toggleChecked}
            clearChecked={store.clearChecked}
            setPrice={store.setPrice}
            setStore={store.setStore}
            setQtyType={store.setQtyType}
          />
        )}
      </main>
    </div>
  );
}
