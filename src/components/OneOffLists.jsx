import { useState, useEffect } from "react";
import { STORES, makeStoreGuesser, priceKey } from "../constants";
import { Btn, BtnSm, Input, Block, EmptyState, PriceInput } from "./UI";

// Bare quantity (no meal/ind qualifier — one-offs are always individual).
const Qty = ({ n }) => n > 1 ? <span style={{ color: "var(--faint)", fontSize: 12, whiteSpace: "nowrap" }}>×{n}</span> : null;

// Standalone ad-hoc lists (a mid-week store run), separate from the meal-plan
// grocery list. Each list combines the Manage + Shop affordances in one row
// (check off, edit name/qty, set store + price) since these lists are short.
// A fully-checked list auto-archives to Completed when you leave the Active
// view (or via "Mark done"); prices/stores reuse the shared global maps.
export default function OneOffLists({
  lists, prices, stores, setPrice, setStore,
  addOneoffList, deleteOneoffList, renameOneoffList, completeOneoffList, reopenOneoffList,
  addOneoffItem, setOneoffItem, deleteOneoffItem, toggleOneoffChecked, sweepCompletedOneoffs,
}) {
  const [sub, setSub] = useState("active"); // active | completed
  const [drafts, setDrafts] = useState({});   // listId -> add-item text
  const [editing, setEditing] = useState(null); // { listId, itemId, name, qty }
  const [openDone, setOpenDone] = useState({}); // completed listId -> expanded

  // Archive fully-checked lists whenever we leave the Active view — on unmount
  // (switching away from One-off) and when flipping to Completed.
  useEffect(() => () => sweepCompletedOneoffs(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const goCompleted = () => { sweepCompletedOneoffs(); setSub("completed"); };

  const priceOf = (name) => (prices || {})[priceKey(name)];
  const storeGuess = makeStoreGuesser(stores || {});
  const storeOf = (name) => (stores || {})[(name || "").trim().toLowerCase()] || storeGuess(name);
  const lineTotal = (it) => (priceOf(it.name) || 0) * (it.qty || 1);
  const listTotal = (l) => l.items.reduce((s, it) => s + lineTotal(it), 0);

  const active = (lists || []).filter(l => !l.completedAt);
  const completed = (lists || []).filter(l => l.completedAt)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  const fmt = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };

  const itemStyle = { fontSize: 14, color: "var(--text-2)", display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border-soft)", margin: "0 -16px", padding: "0 16px" };
  const delStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, flexShrink: 0, borderLeft: "1px solid var(--border-soft)", marginLeft: 6, cursor: "pointer", color: "var(--ghost)", fontSize: 17 };
  const storeSelectStyle = { width: 92, flexShrink: 0, alignSelf: "center", marginLeft: 8, background: "var(--inset)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--muted)", fontSize: 11, padding: "5px 4px", fontFamily: "inherit" };
  const bigCheck = (on) => ({ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 44, flexShrink: 0, fontSize: 24, color: on ? "var(--accent)" : "var(--ghost)", userSelect: "none", cursor: "pointer" });

  function priceCell(name) {
    const stored = priceOf(name);
    return (
      <PriceInput defaultValue={stored ?? ""} valueKey={(name || "").toLowerCase() + ":" + (stored ?? "")}
        stopClick wrapperStyle={{ marginLeft: 8, alignSelf: "center" }} inputStyle={{ width: 62 }}
        onCommit={v => { if (String(v) !== String(stored ?? "")) setPrice(name, v); }} />
    );
  }
  function storeCell(name) {
    return (
      <select value={storeOf(name)} onClick={e => e.stopPropagation()} onChange={e => setStore(name, e.target.value)} style={storeSelectStyle}>
        <option value="">Auto</option>
        {STORES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  function addDraft(listId) {
    const val = (drafts[listId] || "").trim();
    if (!val) return;
    addOneoffItem(listId, val, 1);
    setDrafts(d => ({ ...d, [listId]: "" }));
  }
  function saveItemEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    setOneoffItem(editing.listId, editing.itemId, { name, qty: parseFloat(editing.qty) || 1 });
    setEditing(null);
  }

  const pill = (activeOn, onClick, label) => (
    <button onClick={onClick}
      style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${activeOn ? "var(--text)" : "var(--border)"}`, background: "none", color: activeOn ? "var(--text)" : "var(--faint)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      {label}
    </button>
  );

  function activeListCard(l) {
    const checkedCount = l.items.filter(it => l.checked[it.id]).length;
    const allDone = l.items.length > 0 && checkedCount === l.items.length;
    const total = listTotal(l);
    return (
      <Block key={l.id}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Input value={l.name} onChange={e => renameOneoffList(l.id, e.target.value)}
            placeholder={`List — ${fmt(l.createdAt)}`} style={{ flex: 1, fontWeight: 600 }} />
          <div onClick={() => deleteOneoffList(l.id)} style={{ ...delStyle, borderLeft: "none", marginLeft: 0, width: 34 }} title="Delete list">🗑</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "var(--faint)" }}>Created {fmt(l.createdAt)}</span>
          {l.items.length > 0 && <span style={{ fontSize: 11, color: allDone ? "var(--accent)" : "var(--faint)" }}>· {checkedCount}/{l.items.length} in cart</span>}
          {total > 0 && <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>${total.toFixed(2)}</span>}
        </div>

        {l.items.map(it => {
          const on = !!l.checked[it.id];
          if (editing && editing.listId === l.id && editing.itemId === it.id) {
            return (
              <div key={it.id} style={{ ...itemStyle, flexWrap: "wrap", padding: "10px 16px", gap: 6, alignItems: "center" }}>
                <Input value={editing.name} onChange={e => setEditing(ed => ({ ...ed, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveItemEdit()} style={{ flex: 2, minWidth: 120 }} autoFocus />
                <Input value={editing.qty} onChange={e => setEditing(ed => ({ ...ed, qty: e.target.value }))} type="number" style={{ width: 64 }} />
                <Btn variant="primary" onClick={saveItemEdit} style={{ padding: "7px 12px", fontSize: 12 }}>Save</Btn>
                <Btn onClick={() => setEditing(null)} style={{ padding: "7px 12px", fontSize: 12 }}>Cancel</Btn>
              </div>
            );
          }
          return (
            <div key={it.id} style={itemStyle}>
              <div style={bigCheck(on)} onClick={() => toggleOneoffChecked(l.id, it.id)}>{on ? "☑" : "☐"}</div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, cursor: "pointer", padding: "10px 0" }}
                onClick={() => setEditing({ listId: l.id, itemId: it.id, name: it.name, qty: String(it.qty) })}>
                <span style={{ flex: 1, textDecoration: on ? "line-through" : "none", color: on ? "var(--faint)" : undefined }}>{it.name}</span>
                <Qty n={it.qty} />
              </div>
              {storeCell(it.name)}
              {priceCell(it.name)}
              <div style={delStyle} onClick={() => deleteOneoffItem(l.id, it.id)}>✕</div>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Input value={drafts[l.id] || ""} onChange={e => setDrafts(d => ({ ...d, [l.id]: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && addDraft(l.id)} placeholder="Add item…" />
          <Btn variant="primary" onClick={() => addDraft(l.id)} style={{ whiteSpace: "nowrap" }}>Add</Btn>
        </div>
        {l.items.length > 0 && (
          <BtnSm onClick={() => completeOneoffList(l.id)} variant={allDone ? "primary" : undefined} style={{ marginTop: 10 }}>
            {allDone ? "✓ Mark done" : "Mark done"}
          </BtnSm>
        )}
      </Block>
    );
  }

  function completedListCard(l) {
    const open = !!openDone[l.id];
    const total = listTotal(l);
    return (
      <Block key={l.id}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setOpenDone(o => ({ ...o, [l.id]: !o[l.id] }))}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--heading)" }}>{(l.name || "").trim() || `List — ${fmt(l.createdAt)}`}</div>
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
              Created {fmt(l.createdAt)} → Completed {fmt(l.completedAt)} · {l.items.length} item{l.items.length !== 1 ? "s" : ""}
            </div>
          </div>
          {total > 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>${total.toFixed(2)}</span>}
          <span style={{ fontSize: 12, color: "var(--ghost)" }}>{open ? "▲" : "▼"}</span>
        </div>
        {open && (
          <div style={{ marginTop: 10 }}>
            {l.items.map(it => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", padding: "5px 0", borderTop: "1px solid var(--border-soft)" }}>
                <span style={{ color: "var(--accent)" }}>☑</span>
                <span style={{ flex: 1 }}>{it.name}</span>
                <Qty n={it.qty} />
                {lineTotal(it) > 0 && <span style={{ color: "var(--muted)" }}>${lineTotal(it).toFixed(2)}</span>}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <BtnSm onClick={() => reopenOneoffList(l.id)}>Reopen</BtnSm>
              <BtnSm variant="danger" onClick={() => deleteOneoffList(l.id)} style={{ marginLeft: "auto" }}>Delete</BtnSm>
            </div>
          </div>
        )}
      </Block>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
        {pill(sub === "active", () => setSub("active"), `Active${active.length ? ` · ${active.length}` : ""}`)}
        {pill(sub === "completed", goCompleted, `Completed${completed.length ? ` · ${completed.length}` : ""}`)}
        {sub === "active" && <Btn variant="primary" onClick={() => addOneoffList()} style={{ marginLeft: "auto", padding: "6px 14px", fontSize: 12 }}>+ New list</Btn>}
      </div>

      {sub === "active" ? (
        active.length === 0
          ? <EmptyState>No active lists — tap “+ New list” to start a one-off run.</EmptyState>
          : active.map(activeListCard)
      ) : (
        completed.length === 0
          ? <EmptyState>Nothing completed yet.</EmptyState>
          : completed.map(completedListCard)
      )}
    </div>
  );
}
