export function Card({ children, style }) {
  return <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, marginBottom:10, overflow:"hidden", ...style }}>{children}</div>;
}

export function Btn({ children, onClick, variant, style, type }) {
  const bg = variant === "primary" ? "var(--invert-bg)" : variant === "danger" ? "var(--danger-bg)" : "var(--btn-bg)";
  const color = variant === "primary" ? "var(--invert-fg)" : variant === "danger" ? "var(--danger-fg)" : "var(--muted)";
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
      style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:13, padding:"9px 12px", outline:"none", width:"100%", fontFamily:"inherit", ...style }} />
  );
}

export function Label({ children }) {
  return <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"var(--ghost)", textTransform:"uppercase", marginBottom:6, display:"block" }}>{children}</span>;
}

export function Badge({ children, warn }) {
  return <span style={{ fontSize:11, color: warn ? "var(--warn)" : "var(--faint)", background: warn ? "var(--warn-bg)" : "var(--btn-bg)", padding:"2px 8px", borderRadius:20, marginLeft:8, whiteSpace:"nowrap" }}>{children}</span>;
}

// Quantity with a subscript qualifier: "m" = meals-worth, "ind" = individual.
// Pass onToggle to make it tappable (cycles the type); omit for display-only.
export function QtyTag({ qty, type, onToggle }) {
  return (
    <span onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
      title={onToggle ? "Toggle meals-worth / individual" : undefined}
      style={{ color:"var(--faint)", fontSize:12, cursor: onToggle ? "pointer" : "default", whiteSpace:"nowrap", userSelect:"none" }}>
      {qty}<sub style={{ fontSize:"0.72em", marginLeft:1 }}>{type === "meal" ? "m" : "ind"}</sub>
    </span>
  );
}

export function EmptyState({ children }) {
  return <div style={{ textAlign:"center", padding:"32px 20px", color:"var(--ghost)", fontSize:13 }}>{children}</div>;
}

export function Block({ children, style }) {
  return <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:16, marginBottom:12, ...style }}>{children}</div>;
}
