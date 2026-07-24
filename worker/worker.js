// grocery-helper sync backend — Cloudflare Worker + D1.
//
// Same contract as the (retired) Deno version: an authenticated JSON store with
// compare-and-swap. Chosen over Deno Deploy because Deno's new-org *.deno.net
// TLS cert flapped on every redeploy and broke the app's fetches; *.workers.dev
// TLS is stable and untouched by deploys.
//
// Storage: a single-row D1 (SQLite) table `state(id=1, version, data)`.
// CAS: the PUT only lands if the client's `version` still matches the stored
// one — enforced by `UPDATE ... WHERE id=1 AND version=?` and checking that
// exactly one row changed. A stale version returns 409 + the current doc.
//
// Config (set via wrangler):
//   secret SYNC_SECRET   shared token; clients send `Authorization: Bearer <secret>`
//   d1 binding DB        the D1 database (see wrangler.toml)

function cors(origin) {
  // Auth is a bearer token (no cookies), so reflecting the origin is safe.
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function authorized(request, env) {
  const secret = env.SYNC_SECRET;
  if (!secret) return false;
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Constant-time-ish compare so we don't leak length/content via timing.
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

async function current(env, origin, status) {
  const row = await env.DB.prepare("SELECT version, data FROM state WHERE id = 1").first();
  return json(
    { version: row ? String(row.version) : null, data: row ? JSON.parse(row.data) : null },
    status,
    origin,
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("grocery-helper sync backend is running.", {
        headers: { "Content-Type": "text/plain", ...cors(origin) },
      });
    }

    if (url.pathname === "/data") {
      if (!env.SYNC_SECRET) {
        return json({ error: "server misconfigured: SYNC_SECRET not set" }, 500, origin);
      }
      if (!authorized(request, env)) {
        return json({ error: "unauthorized" }, 401, origin);
      }

      if (request.method === "GET") {
        return current(env, origin, 200);
      }

      if (request.method === "PUT") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400, origin);
        }
        const version = body?.version ?? null; // string | null (from the client)
        const data = body?.data;
        if (data === undefined) {
          return json({ error: "missing data" }, 400, origin);
        }
        const payload = JSON.stringify(data);

        if (version === null) {
          // First-ever write: insert only if the row doesn't already exist.
          const res = await env.DB
            .prepare("INSERT INTO state (id, version, data) VALUES (1, 1, ?) ON CONFLICT(id) DO NOTHING")
            .bind(payload)
            .run();
          if (res.meta.changes === 1) return json({ ok: true, version: "1" }, 200, origin);
          return current(env, origin, 409); // row already existed → conflict
        }

        // CAS: bump the version only if it still matches what the client read.
        const expected = Number(version);
        const res = await env.DB
          .prepare("UPDATE state SET version = version + 1, data = ? WHERE id = 1 AND version = ?")
          .bind(payload, expected)
          .run();
        if (res.meta.changes === 1) {
          return json({ ok: true, version: String(expected + 1) }, 200, origin);
        }
        return current(env, origin, 409); // stale version → conflict
      }

      return json({ error: "method not allowed" }, 405, origin);
    }

    return json({ error: "not found" }, 404, origin);
  },
};
