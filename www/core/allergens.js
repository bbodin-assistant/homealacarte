export const ALLERGEN_CODES = Object.freeze([
  "gluten", "wheat", "rye", "barley", "oat", "spelt", "crustacean", "mollusc", "egg", "fish",
  "peanut", "soy", "milk", "almond", "hazelnut", "walnut", "cashew_nut",
  "pecan", "brazil_nut", "pistachio", "macadamia", "celery", "mustard", "lupin", "sesame", "sulfite",
]);

const LABELS = {
  fr: {
    gluten: "Gluten", wheat: "Blé", rye: "Seigle", barley: "Orge", oat: "Avoine",
    spelt: "Épeautre", crustacean: "Crustacés", mollusc: "Mollusques", egg: "Œufs",
    fish: "Poisson", peanut: "Arachides / cacahuètes", soy: "Soja", milk: "Lait",
    almond: "Amandes", hazelnut: "Noisettes", walnut: "Noix",
    cashew_nut: "Noix de cajou", pecan: "Noix de pécan", brazil_nut: "Noix du Brésil",
    pistachio: "Pistaches", macadamia: "Noix de macadamia", celery: "Céleri",
    mustard: "Moutarde", lupin: "Lupin", sesame: "Sésame", sulfite: "Sulfites",
  },
  en: {
    gluten: "Gluten", wheat: "Wheat", rye: "Rye", barley: "Barley", oat: "Oats",
    spelt: "Spelt", crustacean: "Crustaceans", mollusc: "Molluscs", egg: "Eggs",
    fish: "Fish", peanut: "Peanuts", soy: "Soy", milk: "Milk",
    almond: "Almonds", hazelnut: "Hazelnuts", walnut: "Walnuts", cashew_nut: "Cashews",
    pecan: "Pecans", brazil_nut: "Brazil nuts", pistachio: "Pistachios",
    macadamia: "Macadamia nuts", celery: "Celery", mustard: "Mustard", lupin: "Lupin",
    sesame: "Sesame", sulfite: "Sulfites",
  },
};

const NUT_CODES = new Set([
  "almond", "hazelnut", "walnut", "cashew_nut", "pecan", "brazil_nut", "pistachio", "macadamia",
]);

const ALLERGEN_SVG_MARKS = Object.freeze({
  gluten: '<path d="M12 21V5M12 8 8 5M12 11 16 8M12 14 8 11M12 17 16 14"/><path d="M8 5c-2 1-3 3-2 5M16 8c2 1 3 3 2 5"/>',
  wheat: '<path d="M12 21V4"/><path d="m12 7-4-3c-1 3 1 5 4 5M12 10l4-3c1 3-1 5-4 5M12 14l-4-3c-1 3 1 5 4 5M12 17l4-3c1 3-1 5-4 5"/>',
  rye: '<path d="M9 21V5M15 21V3"/><path d="m9 8-3-2M9 11l3-2M15 7l-3-2M15 10l3-2M15 13l-3-2"/>',
  barley: '<path d="M12 21V6"/><path d="m12 8-5-4M12 10l6-5M12 12l-7-2M12 14l7-2M12 16l-6 3M12 18l5 2"/>',
  oat: '<path d="M9 21c2-6 3-11 2-17"/><path d="M11 8c-3 0-5 2-5 5 3 0 5-2 5-5M11 12c3 0 5 2 5 5-3 0-5-2-5-5M10 5c2 0 4 1 4 3-2 0-4-1-4-3"/>',
  spelt: '<path d="M12 3c5 4 6 11 0 18C6 14 7 7 12 3Z"/><path d="M9 9h6M9 13h6M10 17h4"/>',
  crustacean: '<path d="M7 10c0-4 10-4 10 0v5c0 5-10 5-10 0Z"/><path d="M7 12 3 9M17 12l4-3M7 16l-4 2M17 16l4 2M10 8 8-5M14 8 6 3"/><circle cx="10" cy="11" r="1"/><circle cx="14" cy="11" r="1"/>',
  mollusc: '<path d="M4 18c0-7 4-12 9-12 4 0 7 3 7 7 0 3-2 5-5 5H4Z"/><path d="M7 17c0-5 2-8 6-8 2 0 4 2 4 4 0 2-1 3-3 3H9"/>',
  egg: '<path d="M12 3c4 0 7 8 7 12a7 7 0 0 1-14 0c0-4 3-12 7-12Z"/>',
  fish: '<path d="M4 12c3-5 8-6 13-2l4-3v10l-4-3c-5 4-10 3-13-2Z"/><circle cx="14" cy="11" r="1"/>',
  peanut: '<path d="M8 4c3-2 6 1 5 4 4-1 6 3 4 6-2 4-5 7-8 6-3-1-3-5-1-7-3-2-3-7 0-9Z"/><path d="m8 8 8 7M7 13l6 6M11 5l6 5"/>',
  soy: '<path d="M4 15c5-8 10-10 16-8-1 7-6 12-13 12-2 0-4-2-3-4Z"/><circle cx="9" cy="14" r="2"/><circle cx="14" cy="10" r="2"/>',
  milk: '<path d="M7 6h10l2 4v11H5V10l2-4Z"/><path d="M8 3h8v3H8ZM5 10h14M12 10v11"/>',
  almond: '<path d="M12 3c5 4 6 10 0 18C6 13 7 7 12 3Z"/><path d="m9 8 6 8M15 8l-6 8"/>',
  hazelnut: '<path d="M7 9c0-4 10-4 10 0 2 2 2 8-1 11H8c-3-3-3-9-1-11Z"/><path d="M7 9c3-3 7-3 10 0M9 6c1-2 2-3 3-3s2 1 3 3"/>',
  walnut: '<path d="M12 4c-4-3-8 1-7 5-3 3 0 7 3 7-1 4 3 6 4 3 1 3 5 1 4-3 3 0 6-4 3-7 1-4-3-8-7-5Z"/><path d="M12 5v14M8 8c3 1 2 3 4 4M16 8c-3 1-2 3-4 4M8 16c2-2 2-3 4-4M16 16c-2-2-2-3-4-4"/>',
  cashew_nut: '<path d="M18 5c-6-3-13 1-13 7 0 6 7 9 11 5 3-3 0-7-3-6-2 1-2 4 0 5"/>',
  pecan: '<path d="M12 3c5 2 7 7 5 12-2 5-8 7-10 3-3-5 0-12 5-15Z"/><path d="M9 6c3 3 4 7 5 12M8 10l5 1M10 15l5-1"/>',
  brazil_nut: '<path d="m8 4 9 2 3 8-7 7-8-3-1-8 4-6Z"/><path d="m8 4 5 17M4 10l16 4"/>',
  pistachio: '<path d="M12 4c5 2 7 8 4 14-2 4-6 4-8 0-3-6-1-12 4-14Z"/><path d="M12 5c-2 5-2 10 0 15M12 5c2 5 2 10 0 15"/>',
  macadamia: '<circle cx="12" cy="13" r="8"/><path d="M7 8c4 2 6 6 8 11M8 17c3-4 5-7 9-8"/>',
  celery: '<path d="M8 21c1-7 0-12-2-16M12 21V4M16 21c-1-7 0-12 2-16"/><path d="M6 7 3 4M18 7l3-3M12 7 9 3M12 7l3-4"/>',
  mustard: '<path d="M7 8h10l2 3v9H5v-9l2-3Z"/><path d="M8 4h8v4H8Z"/><circle cx="9" cy="14" r="1"/><circle cx="13" cy="12" r="1"/><circle cx="15" cy="16" r="1"/>',
  lupin: '<path d="M12 21V8"/><path d="M12 8c-4 0-6-3-4-5 2-2 4 1 4 5ZM12 11c4 0 6-3 4-5-2-2-4 1-4 5ZM12 14c-4 0-6-3-4-5M12 17c4 0 6-3 4-5"/>',
  sesame: '<ellipse cx="8" cy="9" rx="2" ry="4" transform="rotate(-35 8 9)"/><ellipse cx="15" cy="7" rx="2" ry="4" transform="rotate(28 15 7)"/><ellipse cx="14" cy="16" rx="2" ry="4" transform="rotate(-20 14 16)"/><ellipse cx="7" cy="17" rx="1.5" ry="3" transform="rotate(25 7 17)"/>',
  sulfite: '<path d="M9 3h6M10 3v6l-5 9c-1 2 0 3 2 3h10c2 0 3-1 2-3l-5-9V3"/><path d="M7 16h10M9 13h6"/>',
});


function localizedLabels(language) {
  const entries = Object.entries(LABELS);
  const requested = String(language || "").trim().toLowerCase();
  const primary = requested.split("-")[0];
  return entries.find(([locale]) => locale.toLowerCase() === requested)?.[1]
    || entries.find(([locale]) => locale.toLowerCase().split("-")[0] === primary)?.[1]
    || entries[0]?.[1]
    || {};
}

export function allergenLabel(code, language) {
  return localizedLabels(language)[code] || code;
}

export function allergenIconSvg(code) {
  const mark = ALLERGEN_SVG_MARKS[code];
  if (!mark) {
    return '<svg class="allergen-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>';
  }
  return `<svg class="allergen-icon allergen-icon-${code}" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${mark}</svg>`;
}

export function allergenIcon(code) {
  const value = String(code || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (["gluten", "wheat", "rye", "barley", "oat", "spelt"].includes(value)
    || /gluten|wheat|ble|farine/.test(value)) return "🌾";
  if (["peanut", ...NUT_CODES].includes(value)
    || /peanut|nut|noix|noisette|amande|cajou|pistache|pecan/.test(value)) return "🥜";
  if (value === "milk" || /milk|lait|fromage|cheese|yaourt|yogurt/.test(value)) return "🥛";
  if (value === "egg" || /egg|oeuf/.test(value)) return "🥚";
  if (value === "fish" || /fish|poisson|saumon|salmon|thon|tuna|cabillaud|cod/.test(value)) return "🐟";
  if (["crustacean", "mollusc"].includes(value)
    || /shellfish|crustace|crevette|shrimp|crab|homard|lobster/.test(value)) return "🦐";
  if (value === "soy" || /soy|soja/.test(value)) return "🫘";
  if (value === "sesame" || /sesame/.test(value)) return "◌";
  return "⚠️";
}

export function allergenCodesOverlap(ruleAllergen, ingredientAllergen) {
  return ruleAllergen === ingredientAllergen
    && ALLERGEN_CODES.includes(ruleAllergen);
}
