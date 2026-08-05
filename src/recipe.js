// Recipe-import parsing. Pure (no React/DOM) so it can be exercised with a
// throwaway Node ESM script the same way merge.js is.
//
// The Worker (/recipe route) returns a recipe's raw schema.org fields:
//   { name, ingredients: [rawString], recipeText, sourceUrl }
// The ingredient strings are free text ("2 cups flour"), so parsing is
// best-effort — the import confirm screen is the human backstop, which lets
// this stay deliberately simple. We only need the name roughly right; the
// exact measurements live in the recipeText snapshot.

import { guessCategory, cleanIngredientName } from "./constants";

// Unicode vulgar fractions → ascii "n/d". Covers the ones real recipe sites use.
const VULGAR = {
  "¼": "1/4", "½": "1/2", "¾": "3/4",
  "⅓": "1/3", "⅔": "2/3",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6",
};

// Known units (singular forms; plurals handled by a trailing-s strip). Matching
// a leading token against this set is how we tell "cups" from an ingredient word.
const UNITS = new Set([
  "cup", "c", "tbsp", "tablespoon", "tbs", "tsp", "teaspoon",
  "oz", "ounce", "lb", "pound", "g", "gram", "kg", "kilogram",
  "ml", "milliliter", "l", "liter", "litre", "qt", "quart", "pt", "pint",
  "gallon", "gal", "clove", "can", "package", "pkg", "pack", "bunch",
  "pinch", "dash", "slice", "stick", "head", "ear", "jar", "bottle",
  "box", "bag", "packet", "container", "sprig", "stalk", "fillet", "fl",
]);

// Insert a space between a leading integer and a vulgar fraction ("1½" → "1 1/2")
// then substitute the fraction glyph, so "1 1/2" parses as a mixed number.
function normalizeFractions(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (VULGAR[ch]) {
      if (out && /\d$/.test(out)) out += " ";
      out += VULGAR[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

function toNumber(qtyStr) {
  qtyStr = qtyStr.trim();
  // mixed number: "1 1/2"
  const mixed = qtyStr.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = qtyStr.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(qtyStr);
  return isFinite(n) ? n : null;
}

// Parse one free-text ingredient line into { name, qty, unit }.
// Unparseable amount → qty 1, unit "". Never throws.
export function parseIngredientLine(raw) {
  let s = normalizeFractions(String(raw || "")).replace(/\s+/g, " ").trim();
  if (!s) return { name: "", qty: 1, unit: "" };

  let qty = null;

  // Leading quantity: mixed number, fraction, or decimal — optionally a range
  // ("2-3", "2 to 3"), of which we keep the first number.
  const qtyMatch = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*/);
  if (qtyMatch) {
    qty = toNumber(qtyMatch[1]);
    s = s.slice(qtyMatch[0].length).trim();
  }

  // Optional unit as the next whole token (with an optional trailing period,
  // e.g. "oz."). Strip a trailing plural "s" before checking the known set.
  let unit = "";
  const tokenMatch = s.match(/^([a-zA-Z]+)\.?\b/);
  if (tokenMatch) {
    const tok = tokenMatch[1].toLowerCase();
    const singular = tok.length > 2 && tok.endsWith("s") ? tok.slice(0, -1) : tok;
    if (UNITS.has(tok) || UNITS.has(singular)) {
      unit = tok;
      s = s.slice(tokenMatch[0].length).trim();
    }
  }

  // Remainder is the name: drop parenthetical notes and a leading "of".
  let name = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  name = name.replace(/^of\s+/i, "").trim();
  // A comma usually separates the item from prep notes ("garlic, minced").
  if (name.includes(",")) name = name.split(",")[0].trim();

  return { name, qty: qty == null ? 1 : qty, unit };
}

// schema.org recipeYield → a serving count. Handles "4", "4 servings", ["6"],
// "6 to 8 servings" (first integer). Returns null when there's no number.
export function parseServings(recipeYield) {
  if (recipeYield == null) return null;
  const val = Array.isArray(recipeYield) ? recipeYield.find(v => v != null) : recipeYield;
  const m = String(val).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Turn the Worker's raw recipe payload into the meal shape MealsTab renders:
// { name, ingredients: [{ name, qty, unit, category }], recipeText, sourceUrl, servings }.
// Ingredient lines that parse to an empty name are dropped; names are cleaned +
// Title-Cased via cleanIngredientName.
export function parseRecipe(payload) {
  const p = payload || {};
  const lines = Array.isArray(p.ingredients) ? p.ingredients : [];
  const ingredients = lines
    .map(parseIngredientLine)
    .map(i => ({ ...i, name: cleanIngredientName(i.name) }))
    .filter(i => i.name)
    .map(i => ({ ...i, category: guessCategory(i.name) }));
  return {
    name: (p.name || "").trim(),
    ingredients,
    recipeText: p.recipeText || "",
    sourceUrl: p.sourceUrl || "",
    servings: parseServings(p.recipeYield),
  };
}
