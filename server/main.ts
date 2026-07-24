// grocery-helper sync backend — Deno Deploy + Deno KV.
//
// A tiny authenticated JSON store with compare-and-swap (CAS) on top of Deno KV.
// It exists to fix the two things the client-only sync couldn't:
//   1. It holds the storage; no write credential is shipped in the public bundle.
//   2. CAS means two browsers can't silently clobber each other's writes.
//
// Env vars (set these in the Deno Deploy app → Settings → Environment Variables):
//   SYNC_SECRET  shared token; clients send `Authorization: Bearer <secret>`.
//
// Endpoints:
//   GET  /       -> health text (so a browser visit confirms it's live)
//   GET  /data   -> { version, data }            version = KV versionstamp (or null if empty)
//   PUT  /data   -> body { version, data }        CAS: only writes if version still matches
//                     200 { ok:true, version }    on success
//                     409 { version, data }       if someone wrote first (re-merge & retry)

const KEY = ["state"];
const kv = await Deno.openKv();

function cors(origin: string | null): HeadersInit {
  // Auth is a bearer token (no cookies), so reflecting the origin is safe and
  // saves us maintaining an allow-list across localhost + Pages + custom domains.
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function authorized(req: Request): boolean {
  const secret = Deno.env.get("SYNC_SECRET");
  if (!secret) return false; // misconfigured -> deny everything
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Constant-time-ish compare so we don't leak length/content via timing.
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  if (url.pathname === "/" && req.method === "GET") {
    return new Response("grocery-helper sync backend is running.", {
      headers: { "Content-Type": "text/plain", ...cors(origin) },
    });
  }

  if (url.pathname === "/data") {
    if (!Deno.env.get("SYNC_SECRET")) {
      return json({ error: "server misconfigured: SYNC_SECRET not set" }, 500, origin);
    }
    if (!authorized(req)) {
      return json({ error: "unauthorized" }, 401, origin);
    }

    if (req.method === "GET") {
      const entry = await kv.get(KEY);
      return json({ version: entry.versionstamp, data: entry.value }, 200, origin);
    }

    if (req.method === "PUT") {
      let body: { version?: string | null; data?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON" }, 400, origin);
      }
      const version = body?.version ?? null;
      const data = body?.data;
      if (data === undefined) {
        return json({ error: "missing data" }, 400, origin);
      }
      // CAS: the write only lands if the stored versionstamp still equals the
      // one the client last read. `version: null` means "key must not exist yet".
      const res = await kv.atomic()
        .check({ key: KEY, versionstamp: version })
        .set(KEY, data)
        .commit();
      if (res.ok) {
        return json({ ok: true, version: res.versionstamp }, 200, origin);
      }
      // Lost the race — hand back the current doc so the client re-merges & retries.
      const current = await kv.get(KEY);
      return json({ version: current.versionstamp, data: current.value }, 409, origin);
    }

    return json({ error: "method not allowed" }, 405, origin);
  }

  return json({ error: "not found" }, 404, origin);
});
