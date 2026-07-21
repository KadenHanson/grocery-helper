import { useRef } from "react";
import { Btn } from "./UI";

export default function BackupPanel({ state, restoreBackup, syncNow, pullNow, syncStatus, onClose }) {
  const fileRef = useRef();

  function handleBackup() {
    const payload = JSON.stringify({ _backup: true, _date: new Date().toISOString(), ...state }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}).replace(/\//g,"-");
    a.href = url; a.download = `meal-db-backup-${dateStr}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }

  function handleRestore(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d._backup) { alert("Not a backup file"); return; }
        if (!confirm("Replace all current data?")) return;
        restoreBackup(d);
      } catch { alert("Invalid backup file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const syncLabel = { idle:"", saving:"Syncing…", saved:"Synced ✓", error:"Sync failed" }[syncStatus];
  const syncColor = { idle:"#444", saving:"#555", saved:"#4a9", error:"#c44" }[syncStatus];

  return (
    <div style={{ background:"#111", borderBottom:"1px solid #222", padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"#444", textTransform:"uppercase" }}>Settings</span>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:18 }}>✕</button>
      </div>

      <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.06em", color:"#333", textTransform:"uppercase", display:"block", marginBottom:6 }}>Backup</span>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
        <Btn variant="primary" onClick={handleBackup}>↓ Save backup</Btn>
        <Btn onClick={() => fileRef.current.click()}>↑ Restore backup</Btn>
        <input type="file" ref={fileRef} accept=".json" style={{ display:"none" }} onChange={handleRestore} />
      </div>

      <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.06em", color:"#333", textTransform:"uppercase", display:"block", marginBottom:6 }}>Cloud sync</span>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <Btn onClick={syncNow}>↑ Push changes</Btn>
        <Btn onClick={pullNow}>↓ Pull latest</Btn>
        {syncLabel && <span style={{ fontSize:12, color:syncColor }}>{syncLabel}</span>}
      </div>
      <p style={{ fontSize:11, color:"#333", marginTop:8, lineHeight:1.5 }}>Push sends your data to the cloud. Pull loads the latest from the cloud (useful if your wife made changes).</p>
    </div>
  );
}
