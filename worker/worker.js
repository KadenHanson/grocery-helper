// grocery-helper sync backend — Cloudflare Worker + D1 (multi-household).
//
// Each valid secret maps to its OWN data namespace, keyed by a SHA-256 of the
// secret. So separate households (e.g. relatives) can share one deployment with
// entirely separate menus — the client is unchanged; the secret both authorizes
// and selects the dataset. Compare-and-swap is per household.
//
// Env:
//   SYNC_SECRETS  comma-separated list of allowed secrets (one per household).
//                 Falls back to SYNC_SECRET (single) for backward compatibility.
//
// D1 table: households(secret_hash TEXT PRIMARY KEY, version INTEGER, data TEXT)

function cors(origin) {
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

function allowedSecrets(env) {
  const raw = env.SYNC_SECRETS || env.SYNC_SECRET || "";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function eq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// The bearer token must exactly match one of the allowed secrets.
function matchSecret(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  for (const s of allowedSecrets(env)) if (eq(token, s)) return s;
  return null;
}

async function tenantId(secret) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function currentRow(env, tenant, origin, status) {
  const row = await env.DB.prepare("SELECT version, data FROM households WHERE secret_hash = ?").bind(tenant).first();
  return json(
    { version: row ? String(row.version) : null, data: row ? JSON.parse(row.data) : null },
    status,
    origin,
  );
}

// Auth + household selection shared by every /data* route.
// Returns { tenant } on success, or { error: Response } to return verbatim.
async function resolveHousehold(request, env, origin) {
  if (!allowedSecrets(env).length) {
    return { error: json({ error: "server misconfigured: no SYNC_SECRETS set" }, 500, origin) };
  }
  const secret = matchSecret(request, env);
  if (!secret) return { error: json({ error: "unauthorized" }, 401, origin) };
  return { tenant: await tenantId(secret) };
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

    // Read-only convenience route: returns the stored plan already shaped like
    // the app's "Paste JSON" import ({ dinner: [{date, weekday, meal}] }), so a
    // caller (e.g. an iOS Scriptable script) doesn't reimplement the mapping.
    if (url.pathname === "/data/get-import-plan" && request.method === "GET") {
      const { tenant, error } = await resolveHousehold(request, env, origin);
      if (error) return error;
      const row = await env.DB.prepare("SELECT data FROM households WHERE secret_hash = ?").bind(tenant).first();
      const state = row ? JSON.parse(row.data) : null;
      const imported = Array.isArray(state?.importedPlan) ? state.importedPlan : [];
      const dinner = imported
        .filter(e => e && (e.meal || e.name))
        .map(e => ({ date: e.date || "", weekday: e.weekday || "", meal: e.meal || e.name }));
      return json({ dinner }, 200, origin);
    }

    if (url.pathname === "/data") {
      const { tenant, error } = await resolveHousehold(request, env, origin);
      if (error) return error;

      if (request.method === "GET") {
        return currentRow(env, tenant, origin, 200);
      }

      if (request.method === "PUT") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid JSON" }, 400, origin);
        }
        const version = body?.version ?? null;
        const data = body?.data;
        if (data === undefined) return json({ error: "missing data" }, 400, origin);
        const payload = JSON.stringify(data);

        if (version === null) {
          const res = await env.DB
            .prepare("INSERT INTO households (secret_hash, version, data) VALUES (?, 1, ?) ON CONFLICT(secret_hash) DO NOTHING")
            .bind(tenant, payload)
            .run();
          if (res.meta.changes === 1) return json({ ok: true, version: "1" }, 200, origin);
          return currentRow(env, tenant, origin, 409);
        }

        const expected = Number(version);
        const res = await env.DB
          .prepare("UPDATE households SET version = version + 1, data = ? WHERE secret_hash = ? AND version = ?")
          .bind(payload, tenant, expected)
          .run();
        if (res.meta.changes === 1) {
          return json({ ok: true, version: String(expected + 1) }, 200, origin);
        }
        return currentRow(env, tenant, origin, 409);
      }

      return json({ error: "method not allowed" }, 405, origin);
    }

    return json({ error: "not found" }, 404, origin);
  },
};
