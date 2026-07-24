import { useState } from "react";
import "./index.css";
import { useStore } from "./useStore";
import MealsTab from "./components/MealsTab";
import PlanTab from "./components/PlanTab";
import GroceryTab from "./components/GroceryTab";
import BackupPanel from "./components/BackupPanel";

export default function App() {
  const [tab, setTab] = useState("meals");
  const [showSettings, setShowSettings] = useState(false);
  const store = useStore();

  const navBtn = (name, label) => (
    <button onClick={() => { setTab(name); setShowSettings(false); }}
      style={{
        flex: 1, padding:"9px 0", border:"none", borderRadius:8, cursor:"pointer",
        fontSize:13, fontWeight:600, fontFamily:"inherit",
        background: tab === name && !showSettings ? "#e8e8e8" : "transparent",
        color: tab === name && !showSettings ? "#0a0a0a" : "#555",
        transition:"all 0.15s",
      }}>
      {label}
    </button>
  );

  return (
    <div style={{ fontFamily:"-apple-system, system-ui, sans-serif", background:"#0a0a0a", minHeight:"100vh", color:"#e8e8e8" }}>
      {/* Nav panel */}
      <nav style={{ display:"flex", gap:2, padding:"12px 16px", background:"#111", borderBottom:"1px solid #222", position:"sticky", top:0, zIndex:10 }}>
        {navBtn("meals", "Library")}
        {navBtn("plan", "Plan")}
        {navBtn("grocery", "Grocery")}
        <button onClick={() => setShowSettings(p => !p)}
          style={{ flex:0, width:40, padding:"9px 0", border:"none", borderRadius:8, cursor:"pointer", fontSize:16, fontFamily:"inherit", background: showSettings ? "#e8e8e8" : "transparent", color: showSettings ? "#0a0a0a" : "#555" }}>
          ⚙️
        </button>
      </nav>

      {/* Sync indicator */}
      {store.syncStatus !== "idle" && (
        <div style={{ textAlign:"center", padding:"4px 0", fontSize:11, fontWeight:600,
          color: { saving:"#555", saved:"#4a9", error:"#c44" }[store.syncStatus],
          background:"#111", borderBottom:"1px solid #1a1a1a" }}>
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
          />
        )}
      </main>
    </div>
  );
}
