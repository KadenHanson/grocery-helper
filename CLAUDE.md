# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # production build to dist/
npm run lint      # oxlint (the only linter; no test runner is configured)
npm run preview   # serve the production build locally
npm run deploy    # build + publish dist/ to GitHub Pages (gh-pages branch)
```

There is **no test framework** in the project. Merge logic has been verified with throwaway Node ESM scripts (import `src/merge.js` directly, since it has no React/DOM dependencies) rather than a committed test suite.

Cloud sync talks to a Deno Deploy backend (`server/main.ts`). The client needs:
- `VITE_SYNC_URL` — the backend URL, inlined at build time. **Not secret.**
- a **shared write secret**, entered once per device in the app (Settings → Cloud
  sync) and kept in `localStorage`. It is deliberately **never** in the bundle or
  an env var — the site is public, so inlining it would recreate the exposed-key
  problem. See `server/README.md` for backend setup.

Without a URL *and* a secret, `cloudConfigured()` is false and `storage.js` no-ops
the cloud calls — the app runs local-only.

## Architecture

A single-page React 19 app (Vite, plain JS — no TypeScript, no router). It plans a week of dinners, aggregates the ingredients into a categorized grocery list, and syncs to a JSONBin cloud bin so two people (the author and spouse) can share one dataset. Deployed static to GitHub Pages.

### State lives entirely in one hook

`src/useStore.js` (`useStore()`) is the whole application state + persistence layer. **Every component is presentational** — `App.jsx` calls `useStore()` once and threads `state` plus mutator callbacks down as props. Components never touch storage or hold canonical data. When adding a feature, the mutator goes in `useStore`, not the component.

All mutations funnel through `update(updater)`, which:
1. produces the next state,
2. calls `stampMeta(prev, next)` to record per-entity change/deletion timestamps into a `_meta` block,
3. persists (local immediately, cloud debounced 1s).

### The state shape

```
{ meals, importedPlan, manualPlan, extraItems, groceryOverrides, _meta }
```
- `meals` — the library: `[{id, name, ingredients:[{name, qty, unit, category}]}]`
- `importedPlan` — a pasted/parsed week (bulk-replaced, no per-row identity)
- `manualPlan` — `{dayKey: mealId}`; `mealId` may be a special sentinel `__GRILL__` or `__LEFTOVER__`
- `extraItems` — `[{id, name}]` (ad-hoc grocery additions; **was** `string[]` before the sync work — legacy strings are migrated on load in `mergeState`)
- `groceryOverrides` — `{ingredientKey: patch | null}`; `null` means "remove this line from the list"
- `_meta` — sync bookkeeping (see below); strip `_backup`/`_date` wrapper keys when importing a backup

### Derived data (not stored)

The grocery list is computed, never persisted. `aggregateIngredients(state)` (in `useStore.js`) walks `importedPlan` + `manualPlan`, sums ingredient quantities by lowercased name, sorts by `CATEGORIES` order; `applyOverrides(agg, groceryOverrides)` then applies user edits/removals. `GroceryTab.jsx` renders the result and builds the copy-to-clipboard export formats.

### constants.js — the domain heuristics

- `DEFAULT_MEALS` seeds a new user's library.
- `guessCategory(name)` — keyword-matches an ingredient name to a `CATEGORIES` bucket (`CAT_KEYWORDS`).
- `findMatch(mealName, meals)` (in `useStore.js`) — fuzzy-matches a free-text imported dinner to a library meal (exact → substring → word-overlap ≥ 0.4).
- `isSpecial()` — detects "grill out"/"leftover"/"go out" entries that shouldn't contribute ingredients.

### Cloud sync & concurrency (`server/main.ts` + `storage.js` + `merge.js`)

This is the subtle part, and it works at two layers.

**Server layer — compare-and-swap (Phase 1).** `server/main.ts` (Deno Deploy) fronts a Deno KV store. `GET /data` returns `{version, data}` (version = KV versionstamp); `PUT /data` does an atomic `kv.atomic().check({versionstamp})` and returns **409 + the current doc** if the version is stale. This closes the read→PUT race and hides all storage credentials behind a `SYNC_SECRET` bearer token. (Replaced the old JSONBin bin, which had no CAS and shipped its key in the bundle.)

**Client layer — per-entity last-writer-wins with tombstones** in `src/merge.js`, still needed because CAS only serializes writes; it doesn't merge two people's concurrent edits:

- Each entity carries an `updatedAt` in `_meta`; deletions leave a tombstone in `_meta.del`. Merging keeps, per key, whichever side changed most recently; a tombstone newer than a value keeps the item deleted. Tombstones GC after 30 days.
- **Ties resolve to cloud (side B).** Deliberate — preserves "cloud is source of truth on load" for legacy docs whose timestamps are all 0.
- Entity keying: `meals`/`extraItems` by `id`; `manualPlan`/`groceryOverrides` by their own object keys; `importedPlan` as a single versioned blob.
- `useStore` routes **all** cloud interaction through one `mergeSync({push})` path: read cloud → merge with freshest local via `stateRef` → adopt → **CAS-push** with the read version, and on a 409 conflict loop (re-merge against the server's returned doc and retry, bounded to 4 attempts). It runs on debounced write, mount, window focus/`visibilitychange` (pull-on-focus), and the manual Push/Pull buttons. All of this is gated by `cloudConfigured()` (URL + secret present) — otherwise the app is local-only.

**Still deferred:** iOS Shortcuts as a 3rd writer and a public (unauthenticated) read endpoint. Both are now *unblocked* by Phase 1 but not yet built. See the `sync-safety-phases` project memory.
