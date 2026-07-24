# grocery-helper sync backend (Cloudflare Worker + D1)

Authenticated JSON store with compare-and-swap. Same API contract as the client
expects; `src/storage.js` needs no changes — only `VITE_SYNC_URL` points here.

Files: [`worker.js`](./worker.js), [`wrangler.toml`](./wrangler.toml), [`schema.sql`](./schema.sql).

## API

All `/data` requests require `Authorization: Bearer <SYNC_SECRET>`.

| Method | Path    | Body                | Response |
|--------|---------|---------------------|----------|
| GET    | `/`     | —                   | health text |
| GET    | `/data` | —                   | `{ version, data }` (`version` is a stringified integer, or `null` when empty) |
| PUT    | `/data` | `{ version, data }` | `200 { ok, version }`; `409 { version, data }` if `version` is stale |

## One-time setup

Run from the `worker/` directory. `npx` pulls wrangler on demand — no global install.

```bash
cd worker

# 1. Log in (opens a browser — run this yourself in the terminal).
npx wrangler login

# 2. Create the D1 database, then paste the printed database_id into wrangler.toml.
npx wrangler d1 create grocery-helper

# 3. Create the table in the remote DB.
npx wrangler d1 execute grocery-helper --remote --file=schema.sql

# 4. Set the shared secret (paste the same value used in the app).
npx wrangler secret put SYNC_SECRET

# 5. Deploy. Prints the https://grocery-helper-sync.<subdomain>.workers.dev URL.
npx wrangler deploy
```

Visit the printed URL — it should say "grocery-helper sync backend is running."
Visit `/data` — it should return `{"error":"unauthorized"}` (confirms the secret is set).

## Wire up the frontend

Set the GitHub repo variable **`VITE_SYNC_URL`** (Settings → Secrets and variables
→ Actions → Variables) to the `*.workers.dev` URL (no trailing slash), then re-run
the Pages deploy. Enter the same `SYNC_SECRET` in the app (Settings → Cloud sync).

## Local dev

```bash
cd worker
npx wrangler dev            # local Worker at http://localhost:8787
```

Use `--remote` to hit the real D1; plain `wrangler dev` uses a local SQLite.
