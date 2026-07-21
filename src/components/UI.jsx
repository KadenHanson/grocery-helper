export function Card({ children, style }) {
  return <div style={{ background:"#161616", border:"1px solid #222", borderRadius:12, marginBottom:10, overflow:"hidden", ...style }}>{children}</div>;
}

export function Btn({ children, onClick, variant, style, type }) {
  const bg = variant === "primary" ? "#e8e8e8" : variant === "danger" ? "#3a1010" : "#1e1e1e";
  const color = variant === "primary" ? "#0a0a0a" : variant === "danger" ? "#ff6b6b" : "#aaa";
  return (
    <button type={type||"button"} onClick={onClick} style={{ padding:"9px 16px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600, fontSize:13, fontFamily:"inherit", background:bg, color, ...style }}>
      {children}
    </button>
  );
}

export function BtnSm({ children, onClick, variant, style }) {
  return <Btn onClick={onClick} variant={variant} style={{ padding:"6px 12px", fontSize:12, ...style }}>{children}</Btn>;
}

export function Input({ value, onChange, onKeyDown, placeholder, type, style, id, autoFocus }) {
  return (
    <input id={id} type={type||"text"} value={value} onChange={onChange} onKeyDown={onKeyDown}
      placeholder={placeholder} autoFocus={autoFocus}
      style={{ background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:8, color:"#e8e8e8", fontSize:13, padding:"9px 12px", outline:"none", width:"100%", fontFamily:"inherit", ...style }} />
  );
}

export function Label({ children }) {
  return <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"#444", textTransform:"uppercase", marginBottom:6, display:"block" }}>{children}</span>;
}

export function Badge({ children, warn }) {
  return <span style={{ fontSize:11, color: warn ? "#c8a04a" : "#555", background: warn ? "#2a2010" : "#1e1e1e", padding:"2px 8px", borderRadius:20, marginLeft:8, whiteSpace:"nowrap" }}>{children}</span>;
}

export function EmptyState({ children }) {
  return <div style={{ textAlign:"center", padding:"32px 20px", color:"#444", fontSize:13 }}>{children}</div>;
}

export function Block({ children, style }) {
  return <div style={{ background:"#161616", border:"1px solid #222", borderRadius:12, padding:16, marginBottom:12, ...style }}>{children}</div>;
}
