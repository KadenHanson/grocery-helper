# grocery-helper sync backend

A tiny [Deno Deploy](https://deno.com/deploy) app that fronts a [Deno KV](https://docs.deno.com/deploy/reference/deno_kv/)
store with **compare-and-swap**, so the browser never holds a storage credential
and two devices can't silently overwrite each other.

Single file: [`main.ts`](./main.ts).

## API

All `/data` requests require `Authorization: Bearer <SYNC_SECRET>`.

| Method | Path    | Body               | Response |
|--------|---------|--------------------|----------|
| GET    | `/`     | —                  | health text |
| GET    | `/data` | —                  | `{ version, data }` (`version` is the KV versionstamp, or `null` when empty) |
| PUT    | `/data` | `{ version, data }`| `200 { ok, version }` on success; `409 { version, data }` if `version` is stale |

The client reads `version` on GET, sends it back on PUT; a `409` means someone
wrote first, so the client re-merges against the returned doc and retries.

## Deploy (new Deno Deploy platform)

1. **App** — create a new app in your org, connected to this GitHub repo.
   Set the **entrypoint** to `server/main.ts`. There is no build step for the
   backend (it's plain Deno), so leave install/build empty.
2. **Database** — org dashboard → **Databases** → **Provision Database** →
   engine **Deno KV** → name it (e.g. `grocery-helper`) → **Assign** it to the app.
   `Deno.openKv()` then connects automatically.
3. **Env var** — app → Settings → Environment Variables → add
   `SYNC_SECRET` = a long random string. This is the shared secret both of you
   type into the app.
4. Note the app URL (e.g. `https://grocery-helper.deno.dev`). Visiting it in a
   browser should show "grocery-helper sync backend is running."

### CLI alternative

```bash
deno install -gArf jsr:@deno/deployctl
deployctl deploy --project=<your-app> --entrypoint=server/main.ts
```

## Local dev

```bash
SYNC_SECRET=devsecret deno run --unstable-kv --allow-net --allow-env server/main.ts
```

Then set `VITE_SYNC_URL=http://localhost:8000` in the frontend `.env` and enter
`devsecret` in the app's Settings → Cloud sync.

## Frontend wiring

- Build-time: `VITE_SYNC_URL` = this app's URL (repo variable + local `.env`).
- Runtime: the shared secret is entered per-device in the app and stored in
  `localStorage` — **never** put it in the bundle or an env var; the site is public.
