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

// ── Recipe import ───────────────────────────────────────────────────────────

const MAX_PAGE_BYTES = 3 * 1024 * 1024; // 3 MB cap on a fetched recipe page

// Is a JSON-LD node a schema.org Recipe? @type may be a string or an array.
function isRecipeNode(node) {
  if (!node || typeof node !== "object") return false;
  const t = node["@type"];
  if (Array.isArray(t)) return t.some(x => String(x).toLowerCase() === "recipe");
  return String(t || "").toLowerCase() === "recipe";
}

// Walk a parsed JSON-LD value (object, array, or { @graph: [...] }) for a Recipe.
function findRecipe(data) {
  if (Array.isArray(data)) {
    for (const item of data) { const r = findRecipe(item); if (r) return r; }
    return null;
  }
  if (data && typeof data === "object") {
    if (isRecipeNode(data)) return data;
    if (Array.isArray(data["@graph"])) return findRecipe(data["@graph"]);
  }
  return null;
}

// recipeInstructions is a string, an array of strings, or an array of
// { @type: HowToStep, text } (optionally grouped under HowToSection.itemListElement).
function instructionLines(instr) {
  if (!instr) return [];
  if (typeof instr === "string") return [instr.trim()];
  if (Array.isArray(instr)) {
    const out = [];
    for (const step of instr) {
      if (typeof step === "string") out.push(step.trim());
      else if (step && typeof step === "object") {
        if (Array.isArray(step.itemListElement)) out.push(...instructionLines(step.itemListElement));
        else if (step.text) out.push(String(step.text).trim());
      }
    }
    return out.filter(Boolean);
  }
  return [];
}

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Decode the HTML entities recipe JSON-LD commonly carries (&amp;, &#39;, &#x2153; …).
function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, code) => {
    if (code[0] === "#") {
      const cp = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    const named = NAMED_ENTITIES[code.toLowerCase()];
    return named !== undefined ? named : m;
  });
}

function stripTags(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

// Browser-like headers: many recipe sites 403 a non-browser User-Agent.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Fetch a URL's HTML. Returns { html } on success, or { status } on failure
// (the upstream HTTP code, or 0 if the request threw or the body was too large).
async function fetchHtml(target) {
  try {
    const res = await fetch(target, { headers: BROWSER_HEADERS, redirect: "follow" });
    if (!res.ok) return { status: res.status };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_PAGE_BYTES) return { status: 0 };
    return { html: new TextDecoder("utf-8").decode(buf) };
  } catch {
    return { status: 0 };
  }
}

async function fetchRecipe(target, origin, env) {
  if (!target) return json({ error: "missing url" }, 400, origin);
  let parsed;
  try { parsed = new URL(target); } catch { return json({ error: "invalid url" }, 400, origin); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return json({ error: "unsupported url" }, 400, origin);
  }

  // Direct fetch first — free, and works for most independent recipe blogs. If
  // the site blocks our datacenter IP (big media brands do), retry through
  // ScraperAPI's proxy pool when SCRAPER_API_KEY is set. With no key we simply
  // stay direct-only, so nothing breaks for a deployment without one.
  let page = await fetchHtml(parsed.toString());
  if (!page.html && env && env.SCRAPER_API_KEY) {
    const api = `https://api.scraperapi.com/?api_key=${env.SCRAPER_API_KEY}&url=${encodeURIComponent(parsed.toString())}`;
    page = await fetchHtml(api);
  }
  if (!page.html) return json({ error: "could not fetch", status: page.status }, 502, origin);
  const html = page.html;

  // Pull every <script type="application/ld+json"> block and search each for a Recipe.
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let recipe = null;
  for (const m of blocks) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    recipe = findRecipe(data);
    if (recipe) break;
  }
  if (!recipe) return json({ error: "no recipe found" }, 404, origin);

  const name = stripTags(recipe.name);
  const rawIngredients = recipe.recipeIngredient || recipe.ingredients || [];
  const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : [rawIngredients])
    .map(stripTags).filter(Boolean);
  const steps = instructionLines(recipe.recipeInstructions).map(stripTags).filter(Boolean);

  const recipeText = [
    name,
    "",
    ...ingredients.map(i => "- " + i),
    ...(steps.length ? ["", "Instructions:", ...steps.map((s, i) => `${i + 1}. ${s}`)] : []),
  ].join("\n").trim();

  return json({ name, ingredients, recipeText, sourceUrl: parsed.toString() }, 200, origin);
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

    // Recipe import: fetch a recipe page server-side (the browser can't, due to
    // CORS) and return its schema.org Recipe fields. Secret-gated via
    // resolveHousehold so this is NOT an open proxy. JSON-LD only — pages
    // without it return 404 and the client falls back to manual entry.
    if (url.pathname === "/recipe" && request.method === "GET") {
      const { error } = await resolveHousehold(request, env, origin);
      if (error) return error;
      return fetchRecipe(url.searchParams.get("url"), origin, env);
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
