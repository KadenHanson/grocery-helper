// Per-entity last-writer-wins merge with tombstones.
//
// JSONBin has no compare-and-swap (no ETag / If-Match), so we can't make the
// server reject a stale write. Concurrency safety is therefore app-side: every
// entity carries an updatedAt in `_meta`, and deletions leave a tombstone.
// Merging two documents keeps, per key, whichever side changed it most recently;
// a tombstone newer than the value wins (the item stays deleted).
//
// Ties go to `cloud` (side B). This preserves the old "cloud is the source of
// truth on load" behavior for un-migrated docs, whose timestamps are all 0.
//
// Entity keying:
//   meals, extraItems      -> arrays of objects keyed by `id`
//   manualPlan, groceryOverrides -> plain objects keyed by their own keys
//   importedPlan           -> a single blob (bulk-replaced, no per-row identity)

export const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

const KEYED = ["meals", "extraItems", "manualPlan", "groceryOverrides"];

function now() { return Date.now(); }

export function genId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const byId = (arr) => Object.fromEntries((arr || []).map((o) => [o.id, o]));

export function emptyMeta() {
  return {
    v: 1,
    meals: {}, extraItems: {}, manualPlan: {}, groceryOverrides: {},
    importedPlan: 0,
    del: { meals: {}, extraItems: {}, manualPlan: {}, groceryOverrides: {} },
  };
}

// Guarantee a well-formed `_meta` on a state (legacy docs get all-zero stamps).
export function normalizeMeta(state) {
  const src = state._meta || {};
  const meta = emptyMeta();
  for (const coll of KEYED) {
    meta[coll] = { ...(src[coll] || {}) };
    meta.del[coll] = { ...((src.del && src.del[coll]) || {}) };
  }
  meta.importedPlan = src.importedPlan || 0;
  return { ...state, _meta: meta };
}

function cloneMeta(m) {
  const out = emptyMeta();
  for (const coll of KEYED) {
    out[coll] = { ...(m[coll] || {}) };
    out.del[coll] = { ...((m.del && m.del[coll]) || {}) };
  }
  out.importedPlan = m.importedPlan || 0;
  return out;
}

// Diff prev->next for one key/value map, recording changes and deletions.
function stampMap(prevMap, nextMap, ts, del, t) {
  for (const key of Object.keys(nextMap)) {
    const changed =
      !(key in prevMap) ||
      JSON.stringify(prevMap[key]) !== JSON.stringify(nextMap[key]);
    if (changed) { ts[key] = t; delete del[key]; }
  }
  for (const key of Object.keys(prevMap)) {
    if (!(key in nextMap)) { del[key] = t; delete ts[key]; }
  }
}

// Produce the `_meta` for `next`, given the previous state it was derived from.
// Only changed/removed keys are re-stamped, so untouched entities keep their
// original timestamps and won't clobber a peer's concurrent edit.
export function stampMeta(prev, next) {
  const meta = cloneMeta(normalizeMeta(next)._meta);
  const t = now();
  stampMap(byId(prev.meals), byId(next.meals), meta.meals, meta.del.meals, t);
  stampMap(byId(prev.extraItems), byId(next.extraItems), meta.extraItems, meta.del.extraItems, t);
  stampMap(prev.manualPlan || {}, next.manualPlan || {}, meta.manualPlan, meta.del.manualPlan, t);
  stampMap(prev.groceryOverrides || {}, next.groceryOverrides || {}, meta.groceryOverrides, meta.del.groceryOverrides, t);
  if (JSON.stringify(prev.importedPlan || []) !== JSON.stringify(next.importedPlan || []))
    meta.importedPlan = t;
  return meta;
}

function gcTombstones(meta) {
  const cutoff = now() - TOMBSTONE_TTL;
  for (const coll of KEYED) {
    for (const key of Object.keys(meta.del[coll])) {
      if (meta.del[coll][key] < cutoff) delete meta.del[coll][key];
    }
  }
  return meta;
}

// Merge one key/value map. Writes surviving timestamps into outTs/outDel and
// returns the map of surviving values.
function mergeMap(aVals, aTs, aDel, bVals, bTs, bDel, outTs, outDel) {
  const keys = new Set([
    ...Object.keys(aVals), ...Object.keys(bVals),
    ...Object.keys(aTs), ...Object.keys(bTs),
    ...Object.keys(aDel), ...Object.keys(bDel),
  ]);
  const result = {};
  for (const key of keys) {
    const at = aTs[key] || 0, bt = bTs[key] || 0;
    const maxTs = Math.max(at, bt);
    const maxDel = Math.max(aDel[key] || 0, bDel[key] || 0);
    if (maxDel > maxTs) { outDel[key] = maxDel; continue; }
    const val = at > bt ? aVals[key] : bVals[key]; // cloud (B) wins ties
    if (val !== undefined) { result[key] = val; outTs[key] = maxTs; }
    else if (maxDel) { outDel[key] = maxDel; }
  }
  return result;
}

// Merge a keyed-array collection, preserving a stable order (local order first,
// then any cloud-only additions).
function mergeArray(aArr, bArr, aTs, aDel, bTs, bDel, outTs, outDel) {
  const map = mergeMap(byId(aArr), aTs, aDel, byId(bArr), bTs, bDel, outTs, outDel);
  const order = [];
  const seen = new Set();
  for (const o of [...(aArr || []), ...(bArr || [])]) {
    if (o.id in map && !seen.has(o.id)) { order.push(o.id); seen.add(o.id); }
  }
  return order.map((id) => map[id]);
}

// Merge local + cloud into one document. Both are normalized first, so legacy
// (meta-less) docs merge safely with cloud winning every tie.
export function mergeStates(local, cloud) {
  const a = normalizeMeta(local)._meta;
  const b = normalizeMeta(cloud)._meta;
  const meta = emptyMeta();

  const out = {};
  out.meals = mergeArray(local.meals, cloud.meals, a.meals, a.del.meals, b.meals, b.del.meals, meta.meals, meta.del.meals);
  out.extraItems = mergeArray(local.extraItems, cloud.extraItems, a.extraItems, a.del.extraItems, b.extraItems, b.del.extraItems, meta.extraItems, meta.del.extraItems);
  out.manualPlan = mergeMap(local.manualPlan || {}, a.manualPlan, a.del.manualPlan, cloud.manualPlan || {}, b.manualPlan, b.del.manualPlan, meta.manualPlan, meta.del.manualPlan);
  out.groceryOverrides = mergeMap(local.groceryOverrides || {}, a.groceryOverrides, a.del.groceryOverrides, cloud.groceryOverrides || {}, b.groceryOverrides, b.del.groceryOverrides, meta.groceryOverrides, meta.del.groceryOverrides);

  const ipA = a.importedPlan, ipB = b.importedPlan;
  out.importedPlan = (ipA > ipB ? local.importedPlan : cloud.importedPlan) || [];
  meta.importedPlan = Math.max(ipA, ipB);

  out._meta = gcTombstones(meta);
  return out;
}
