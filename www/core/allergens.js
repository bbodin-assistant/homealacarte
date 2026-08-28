export const ALLERGEN_CODES = Object.freeze([
  "gluten", "wheat", "rye", "barley", "oat", "spelt", "crustacean", "mollusc", "egg", "fish",
  "peanut", "soy", "milk", "tree_nut", "almond", "hazelnut", "walnut", "cashew_nut",
  "pecan", "brazil_nut", "pistachio", "macadamia", "celery", "mustard", "lupin", "sesame", "sulfite",
]);

const LABELS = {
  fr: {
    gluten: "Gluten", wheat: "Blé", rye: "Seigle", barley: "Orge", oat: "Avoine",
    spelt: "Épeautre", crustacean: "Crustacés", mollusc: "Mollusques", egg: "Œufs",
    fish: "Poisson", peanut: "Arachides / cacahuètes", soy: "Soja", milk: "Lait",
    tree_nut: "Fruits à coque", almond: "Amandes", hazelnut: "Noisettes", walnut: "Noix",
    cashew_nut: "Noix de cajou", pecan: "Noix de pécan", brazil_nut: "Noix du Brésil",
    pistachio: "Pistaches", macadamia: "Noix de macadamia", celery: "Céleri",
    mustard: "Moutarde", lupin: "Lupin", sesame: "Sésame", sulfite: "Sulfites",
  },
  en: {
    gluten: "Gluten", wheat: "Wheat", rye: "Rye", barley: "Barley", oat: "Oats",
    spelt: "Spelt", crustacean: "Crustaceans", mollusc: "Molluscs", egg: "Eggs",
    fish: "Fish", peanut: "Peanuts", soy: "Soy", milk: "Milk", tree_nut: "Tree nuts",
    almond: "Almonds", hazelnut: "Hazelnuts", walnut: "Walnuts", cashew_nut: "Cashews",
    pecan: "Pecans", brazil_nut: "Brazil nuts", pistachio: "Pistachios",
    macadamia: "Macadamia nuts", celery: "Celery", mustard: "Mustard", lupin: "Lupin",
    sesame: "Sesame", sulfite: "Sulfites",
  },
};

const SPECIFIC_TREE_NUT_CODES = new Set([
  "almond", "hazelnut", "walnut", "cashew_nut", "pecan", "brazil_nut", "pistachio", "macadamia",
]);

export function isSpecificTreeNut(code) {
  return SPECIFIC_TREE_NUT_CODES.has(code);
}

export function allergenLabel(code, language = "en") {
  const locale = String(language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
  return LABELS[locale][code] || code;
}

export function allergenIcon(code) {
  const value = String(code || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (["gluten", "wheat", "rye", "barley", "oat", "spelt"].includes(value)
    || /gluten|wheat|ble|farine/.test(value)) return "🌾";
  if (["peanut", "tree_nut", ...SPECIFIC_TREE_NUT_CODES].includes(value)
    || /peanut|nut|noix|noisette|amande|cajou|pistache|pecan/.test(value)) return "🥜";
  if (value === "milk" || /milk|lait|fromage|cheese|yaourt|yogurt/.test(value)) return "🥛";
  if (value === "egg" || /egg|oeuf/.test(value)) return "🥚";
  if (value === "fish" || /fish|poisson|saumon|salmon|thon|tuna|cabillaud|cod/.test(value)) return "🐟";
  if (["crustacean", "mollusc"].includes(value)
    || /shellfish|crustace|crevette|shrimp|crab|homard|lobster/.test(value)) return "🦐";
  if (value === "soy" || /soy|soja/.test(value)) return "🫘";
  if (value === "sesame" || /sesame/.test(value)) return "🌱";
  return "⚠️";
}

export function allergenCodesOverlap(ruleAllergen, ingredientAllergen) {
  return ruleAllergen === ingredientAllergen
    || (ruleAllergen === "tree_nut" && SPECIFIC_TREE_NUT_CODES.has(ingredientAllergen))
    || (ingredientAllergen === "tree_nut" && SPECIFIC_TREE_NUT_CODES.has(ruleAllergen));
}
