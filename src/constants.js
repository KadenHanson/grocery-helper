export const DAYS = ["S","M","T","W","Th","F","Sa"];
export const DAY_NAMES = {S:"Sun",M:"Mon",T:"Tue",W:"Wed",Th:"Thu",F:"Fri",Sa:"Sat"};
export const WEEKDAY_TO_SHORT = {Saturday:"Sa",Sunday:"S",Monday:"M",Tuesday:"T",Wednesday:"W",Thursday:"Th",Friday:"F"};
export const SPECIAL_OPTS = [{id:"__GRILL__",name:"Grill Out"},{id:"__LEFTOVER__",name:"Leftovers/Go Out"}];

export const CATEGORIES = [
  "Meat & Protein","Produce","Dairy","Dry & Pasta",
  "Canned & Jarred","Sauces & Seasoning","Frozen","Bread & Bakery","Other"
];

// Stores you can assign items to (remembered per item). "Unassigned" is implicit.
export const STORES = ["Walmart", "Sam's Club", "Costco"];

export const CAT_KEYWORDS = {
  "Meat & Protein": ["chicken","beef","sausage","pork","turkey","steak","ground","meat","bacon","shrimp","fish","salmon","tuna","ham"],
  "Produce": ["broccoli","lettuce","tomato","tomatoes","onion","garlic","corn","pepper","spinach","carrot","celery","lemon","lime","avocado","mushroom","zucchini","cucumber","potato"],
  "Dairy": ["cheese","milk","butter","cream","sour cream","yogurt","parmesan","mozzarella","egg","eggs","half and half"],
  "Dry & Pasta": ["rice","pasta","noodle","spaghetti","fettuccine","penne","macaroni","flour","bread crumb","oat","quinoa","rice-a-roni"],
  "Canned & Jarred": ["canned","can ","salsa","beans","tomato sauce","broth","stock","olives","vegetable","soup"],
  "Sauces & Seasoning": ["sauce","seasoning","dressing","marinade","teriyaki","bbq","cajun","oil","vinegar","soy","mustard","ketchup","ranch","hot sauce","mayo","spice","garlic powder","onion powder","paprika","cumin","alfredo","pasta sauce"],
  "Frozen": ["frozen","potsticker","dumpling","ice cream","pizza"],
  "Bread & Bakery": ["bread","tortilla","bun","roll","loaf","pita","wrap","crouton"],
};

export const DEFAULT_MEALS = [
  {id:"teriyaki-chicken",name:"Teriyaki Chicken, Rice, Broccoli, Potstickers",ingredients:[{name:"chicken breast",qty:2,unit:"lbs",category:"Meat & Protein"},{name:"teriyaki sauce",qty:1,unit:"bottle",category:"Sauces & Seasoning"},{name:"white rice",qty:2,unit:"cups",category:"Dry & Pasta"},{name:"broccoli",qty:1,unit:"head",category:"Produce"},{name:"frozen potstickers",qty:1,unit:"bag",category:"Frozen"}]},
  {id:"tacos",name:"Tacos",ingredients:[{name:"ground beef",qty:1,unit:"lb",category:"Meat & Protein"},{name:"taco seasoning",qty:1,unit:"packet",category:"Sauces & Seasoning"},{name:"flour tortillas",qty:1,unit:"pack",category:"Bread & Bakery"},{name:"shredded cheese",qty:1,unit:"bag",category:"Dairy"},{name:"sour cream",qty:1,unit:"container",category:"Dairy"},{name:"salsa",qty:1,unit:"jar",category:"Canned & Jarred"},{name:"lettuce",qty:1,unit:"head",category:"Produce"},{name:"tomatoes",qty:2,unit:"whole",category:"Produce"}]},
  {id:"marinated-chicken",name:"Marinated Chicken, Rice Roni, Canned Veg",ingredients:[{name:"chicken breast",qty:2,unit:"lbs",category:"Meat & Protein"},{name:"Italian dressing",qty:1,unit:"bottle",category:"Sauces & Seasoning"},{name:"Rice-A-Roni",qty:2,unit:"boxes",category:"Dry & Pasta"},{name:"canned vegetables",qty:2,unit:"cans",category:"Canned & Jarred"}]},
  {id:"spaghetti",name:"Spaghetti",ingredients:[{name:"ground beef",qty:1,unit:"lb",category:"Meat & Protein"},{name:"spaghetti noodles",qty:1,unit:"box",category:"Dry & Pasta"},{name:"pasta sauce",qty:1,unit:"jar",category:"Sauces & Seasoning"},{name:"parmesan cheese",qty:1,unit:"container",category:"Dairy"},{name:"garlic bread",qty:1,unit:"loaf",category:"Bread & Bakery"}]},
  {id:"cajun-chicken",name:"Cajun Chicken",ingredients:[{name:"chicken breast",qty:2,unit:"lbs",category:"Meat & Protein"},{name:"cajun seasoning",qty:1,unit:"bottle",category:"Sauces & Seasoning"},{name:"butter",qty:1,unit:"stick",category:"Dairy"},{name:"olive oil",qty:1,unit:"bottle",category:"Sauces & Seasoning"}]},
  {id:"orange-chicken",name:"Orange Chicken, Rice, Broccoli, Potstickers",ingredients:[{name:"frozen orange chicken",qty:1,unit:"bag",category:"Frozen"},{name:"white rice",qty:2,unit:"cups",category:"Dry & Pasta"},{name:"broccoli",qty:1,unit:"head",category:"Produce"},{name:"frozen potstickers",qty:1,unit:"bag",category:"Frozen"}]},
  {id:"sausage-alfredo",name:"Sausage Alfredo",ingredients:[{name:"Italian sausage",qty:1,unit:"lb",category:"Meat & Protein"},{name:"fettuccine noodles",qty:1,unit:"box",category:"Dry & Pasta"},{name:"alfredo sauce",qty:1,unit:"jar",category:"Sauces & Seasoning"},{name:"parmesan cheese",qty:1,unit:"container",category:"Dairy"},{name:"garlic",qty:3,unit:"cloves",category:"Produce"}]},
  {id:"bbq-chicken",name:"BBQ Chicken, Rice, Corn on the Cob",ingredients:[{name:"chicken breast",qty:2,unit:"lbs",category:"Meat & Protein"},{name:"BBQ sauce",qty:1,unit:"bottle",category:"Sauces & Seasoning"},{name:"white rice",qty:2,unit:"cups",category:"Dry & Pasta"},{name:"corn on the cob",qty:4,unit:"ears",category:"Produce"}]},
];

export function guessCategory(name) {
  const n = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (keywords.some(k => n.includes(k))) return cat;
  }
  return "Other";
}

// Rough default store when none is explicitly set. Meat & milk are usually a
// Costco run; most everything else is Walmart. Sam's Club is specific enough
// that it's left to manual assignment (never auto-guessed).
const COSTCO_HINTS = ["milk", ...CAT_KEYWORDS["Meat & Protein"]];
export function guessStore(name) {
  const n = (name || "").toLowerCase();
  return COSTCO_HINTS.some(k => n.includes(k)) ? "Costco" : "Walmart";
}

export function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();
}

// Fuzzy key for remembered prices: normalized + a light plural strip so
// "Chicken Breasts" and "chicken breast" resolve to the same saved price.
export function priceKey(name) {
  let k = normalize(name || "");
  if (k.length > 3 && k.endsWith("s") && !k.endsWith("ss")) k = k.slice(0, -1);
  return k;
}

// Sales tax rate for the optional estimate line (Orlando / Orange County, FL).
export const TAX_RATE = 0.065;

export function isSpecial(mealName) {
  const n = mealName.toLowerCase();
  return n.includes("grill out") || n.includes("leftover") || n.includes("go out");
}
