import { useState } from "react";

// Text input with a fuzzy (substring) suggestion dropdown. Positioned absolute
// relative to its wrapper (reliable on mobile with the keyboard up, unlike
// fixed) — its container must not clip overflow. onSelect fires on pick.
export function Autocomplete({ value, onChange, onSelect, options, placeholder, autoFocus, onEnter, wrapperStyle }) {
  const [open, setOpen] = useState(false);
  const q = (value || "").trim().toLowerCase();
  const matches = q ? options.filter(o => { const l = o.toLowerCase(); return l.includes(q) && l !== q; }).slice(0, 8) : [];
  return (
    <div style={{ position:"relative", ...wrapperStyle }}>
      <input type="text" value={value} autoFocus={autoFocus} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => { if (e.key === "Enter") { setOpen(false); onEnter && onEnter(); } if (e.key === "Escape") setOpen(false); }}
        style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:13, padding:"9px 12px", outline:"none", width:"100%", fontFamily:"inherit" }} />
      {open && matches.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:50, background:"var(--card)", border:"1px solid var(--border)", borderRadius:8, boxShadow:"0 8px 20px rgba(0,0,0,0.35)", overflow:"hidden", maxHeight:220, overflowY:"auto" }}>
          {matches.map(m => (
            <div key={m} onMouseDown={e => { e.preventDefault(); onSelect(m); setOpen(false); }}
              style={{ padding:"8px 12px", fontSize:13, color:"var(--text-2)", cursor:"pointer", borderBottom:"1px solid var(--border-soft)" }}>
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Card({ children, style }) {
  return <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, marginBottom:10, ...style }}>{children}</div>;
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

export function Input({ value, onChange, onKeyDown, onFocus, placeholder, type, style, id, autoFocus, list }) {
  return (
    <input id={id} type={type||"text"} value={value} onChange={onChange} onKeyDown={onKeyDown} onFocus={onFocus}
      placeholder={placeholder} autoFocus={autoFocus} list={list}
      style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:13, padding:"9px 12px", outline:"none", width:"100%", fontFamily:"inherit", ...style }} />
  );
}

export function Label({ children }) {
  return <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"var(--ghost)", textTransform:"uppercase", marginBottom:6, display:"block" }}>{children}</span>;
}

export function Badge({ children, warn }) {
  return <span style={{ fontSize:11, color: warn ? "var(--warn)" : "var(--faint)", background: warn ? "var(--warn-bg)" : "var(--btn-bg)", padding:"2px 8px", borderRadius:20, marginLeft:8, whiteSpace:"nowrap" }}>{children}</span>;
}

// Small qualifier label: "meal" = meals-worth, "ind" = individual.
// Pass onToggle to make it tappable (cycles the type); omit for display-only.
export function TypeLabel({ type, onToggle }) {
  return (
    <span onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
      title={onToggle ? "Toggle meals-worth / individual" : undefined}
      style={{ fontSize:10.5, color:"var(--faint)", cursor: onToggle ? "pointer" : "default", whiteSpace:"nowrap", userSelect:"none", marginLeft:3 }}>
      {type === "meal" ? "meal" : "ind"}
    </span>
  );
}

// A read count plus its qualifier label (used where the quantity isn't editable).
export function QtyTag({ qty, type, onToggle }) {
  return (
    <span style={{ color:"var(--faint)", fontSize:12, whiteSpace:"nowrap" }}>
      {qty}<TypeLabel type={type} onToggle={onToggle} />
    </span>
  );
}

export function EmptyState({ children }) {
  return <div style={{ textAlign:"center", padding:"32px 20px", color:"var(--ghost)", fontSize:13 }}>{children}</div>;
}

export function Block({ children, style }) {
  return <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:16, marginBottom:12, ...style }}>{children}</div>;
}
