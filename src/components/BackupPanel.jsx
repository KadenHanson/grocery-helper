import { useRef, useState } from "react";
import { Btn } from "./UI";
import { getSecret, setSecret } from "../storage";

export default function BackupPanel({ state, restoreBackup, syncNow, pullNow, syncStatus, onClose }) {
  const fileRef = useRef();
  const [secret, setSecretInput] = useState(getSecret());
  const [secretMsg, setSecretMsg] = useState("");

  function saveSecret() {
    setSecret(secret.trim());
    setSecretMsg(secret.trim() ? "Secret saved — pulling latest…" : "Secret cleared");
    setTimeout(() => setSecretMsg(""), 2500);
    if (secret.trim()) pullNow(); // now authenticated — grab the shared data
  }

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
  const syncColor = { idle:"var(--ghost)", saving:"var(--faint)", saved:"var(--accent)", error:"var(--danger)" }[syncStatus];

  return (
    <div style={{ background:"var(--surface)", borderBottom:"1px solid var(--border)", padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"var(--ghost)", textTransform:"uppercase" }}>Settings</span>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--faint)", cursor:"pointer", fontSize:18 }}>✕</button>
      </div>

      <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.06em", color:"var(--ghost)", textTransform:"uppercase", display:"block", marginBottom:6 }}>Backup</span>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
        <Btn variant="primary" onClick={handleBackup}>↓ Save backup</Btn>
        <Btn onClick={() => fileRef.current.click()}>↑ Restore backup</Btn>
        <input type="file" ref={fileRef} accept=".json" style={{ display:"none" }} onChange={handleRestore} />
      </div>

      <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.06em", color:"var(--ghost)", textTransform:"uppercase", display:"block", marginBottom:6 }}>Cloud sync</span>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:8 }}>
        <input
          type="password"
          value={secret}
          onChange={e => setSecretInput(e.target.value)}
          placeholder="Shared secret"
          style={{ flex:"1 1 160px", minWidth:0, padding:"7px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--inset)", color:"var(--text)", fontSize:13, fontFamily:"inherit" }}
        />
        <Btn variant="primary" onClick={saveSecret}>Save secret</Btn>
      </div>
      {secretMsg && <p style={{ fontSize:11, color:"var(--accent)", marginTop:0, marginBottom:8 }}>{secretMsg}</p>}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <Btn onClick={syncNow}>↑ Push changes</Btn>
        <Btn onClick={pullNow}>↓ Pull latest</Btn>
        {syncLabel && <span style={{ fontSize:12, color:syncColor }}>{syncLabel}</span>}
      </div>
      <p style={{ fontSize:11, color:"var(--ghost)", marginTop:8, lineHeight:1.5 }}>Enter the shared secret once on each device to enable sync — it's stored only on this device, never in the app. Push sends your data to the cloud; Pull loads the latest (useful if your wife made changes).</p>
    </div>
  );
}
