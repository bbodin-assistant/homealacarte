import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allergenCodesOverlap,
  countryFlag,
  dishFilterAllergenMatches,
  dishAllergenCodes,
  dishPreferenceBadges,
  dishRangeMaximums,
  filterDishes,
} from "../www/features/dishes.js";

const dishes = [
  { key: "cheap_a", name: "Cheap A", origin_country: "FR", nutri_score: "A", components: [], per_serving: { cost: 1.234, kcal: 450 } },
  { key: "rich_c", name: "Rich C", origin_country: "IT", nutri_score: "C", components: [], per_serving: { cost: 4.5, kcal: 800 } },
  { key: "unknown", name: "Unknown", origin_country: "JP", nutri_score: "", components: [], per_serving: { cost: 2, kcal: 300 } },
  {
    key: "carrot_cake",
    name: "Carrot Cake",
    origin_country: "GB",
    nutri_score: "C",
    components: [{ key: "mixed_nuts", name: "Mixed nuts", allergens: ["walnut"] }],
    per_serving: { cost: 2.5, kcal: 500 },
  },
  {
    key: "brazil_bites",
    name: "Brazil Bites",
    origin_country: "BR",
    nutri_score: "C",
    components: [{ key: "brazil_nut", name: "Brazil nut", allergens: ["brazil_nut"] }],
    per_serving: { cost: 3, kcal: 550 },
  },
];

assert.deepEqual(dishRangeMaximums(dishes), { cost: 4.5, kcal: 800 });
assert.deepEqual(dishRangeMaximums([]), { cost: 0.01, kcal: 1 });
assert.equal(countryFlag("fr"), "🇫🇷");
assert.equal(countryFlag("JP"), "🇯🇵");
assert.equal(countryFlag(""), "");
assert.equal(countryFlag("France"), "");
assert.equal(allergenCodesOverlap("pistachio", "pistachio"), true);
assert.equal(allergenCodesOverlap("pistachio", "walnut"), false);
assert.equal(dishFilterAllergenMatches("brazil_nut", "brazil_nut"), true);
assert.equal(dishFilterAllergenMatches("brazil_nut", "walnut"), false);

const badges = dishPreferenceBadges({
  key: "pad_thai",
  components: [
    { key: "peanut", name: "Peanuts", allergens: ["peanut"] },
    { key: "rice_noodle", name: "Rice noodles" },
  ],
}, [
  {
    name: "Alex",
    food_rules: [
      { kind: "allergy", item_keys: ["peanut"] },
      { kind: "favorite", item_keys: ["pad_thai"] },
    ],
  },
  {
    name: "Sam",
    food_rules: [{ kind: "never", item_keys: ["pad_thai"] }],
  },
]);
assert.deepEqual(badges.map((badge) => badge.kind), ["favorite", "forbidden", "allergy"]);
assert.ok(badges.find((badge) => badge.kind === "allergy")?.icon.startsWith("<svg"));
assert.match(badges.find((badge) => badge.kind === "allergy")?.title || "", /Alex/);
assert.equal(badges.find((badge) => badge.kind === "allergy")?.householdWarning, true);

const multiAllergenDish = {
  key: "custard_toast",
  components: [
    { key: "custard", name: "Custard", allergens: ["milk", "egg"] },
    { key: "topping", name: "Sesame topping", allergens: ["sesame", "milk"] },
  ],
};
assert.deepEqual(dishAllergenCodes(multiAllergenDish), ["milk", "egg", "sesame"]);
const allDishAllergenBadges = dishPreferenceBadges(multiAllergenDish, [], "en")
  .filter((badge) => badge.kind === "allergy");
assert.deepEqual(allDishAllergenBadges.map((badge) => badge.code), ["milk", "egg", "sesame"]);
assert.ok(allDishAllergenBadges.every((badge) => badge.icon.startsWith("<svg")));
assert.ok(allDishAllergenBadges.every((badge) => badge.householdWarning === false));

const dialogSource = readFileSync(new URL("../www/views/dialogs.html", import.meta.url), "utf8");
const dishesViewSource = readFileSync(new URL("../www/views/dishes.html", import.meta.url), "utf8");
const dishesSource = readFileSync(new URL("../www/features/dishes.js", import.meta.url), "utf8");
const refinementSource = readFileSync(new URL("../www/styles/ui-refinements.css", import.meta.url), "utf8");
const detailRefinementSource = readFileSync(new URL("../www/styles/detail-refinements.css", import.meta.url), "utf8");
assert.match(dialogSource, /dish-details-allergens-section/);
assert.match(dialogSource, /dish-details-allergens/);
assert.match(dishesViewSource, /id="dish-stock-only"/);
assert.match(dishesSource, /dish-card-nutri-score/);
assert.match(refinementSource, /\.dish-filter-panel\.panel[\s\S]*?overflow:\s*visible/);
assert.match(refinementSource, /\.dish-preference-badge\.allergy[\s\S]*?border-radius:\s*50%/);
assert.match(detailRefinementSource, /\.dish-card-nutri-score\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*14px[\s\S]*?right:\s*14px/);
assert.match(detailRefinementSource, /\.dish-details-health\s*\{[\s\S]*?display:\s*grid/);

assert.deepEqual(
  filterDishes(dishes, {
    search: "cheap",
    countries: new Set(["FR", "IT"]),
    allergens: new Set(),
    nutriScores: new Set(["A"]),
    minimumCost: 0,
    maximumCost: 2,
    minimumKcal: 400,
    maximumKcal: 500,
  }).map((dish) => dish.key),
  ["cheap_a"],
);

assert.deepEqual(
  filterDishes(dishes, {
    search: "",
    countries: new Set(),
    allergens: new Set(),
    nutriScores: new Set(["UNKNOWN"]),
    minimumCost: 0,
    maximumCost: 10,
    minimumKcal: 0,
    maximumKcal: 1000,
  }).map((dish) => dish.key),
  ["unknown"],
);

const baseFilters = {
  search: "",
  countries: new Set(),
  nutriScores: new Set(),
  minimumCost: 0,
  maximumCost: 10,
  minimumKcal: 0,
  maximumKcal: 1000,
};
assert.ok(filterDishes(dishes, { ...baseFilters, allergens: new Set(["brazil_nut"]) })
  .some((dish) => dish.key === "carrot_cake"));
assert.ok(!filterDishes(dishes, { ...baseFilters, allergens: new Set(["brazil_nut"]) })
  .some((dish) => dish.key === "brazil_bites"));
assert.deepEqual(
  filterDishes(dishes, { ...baseFilters, countries: new Set(["FR", "JP"]), allergens: new Set() })
    .map((dish) => dish.key),
  ["cheap_a", "unknown"],
);

const stockFilteredDishes = [
  {
    key: "exactly_one_portion",
    name: "Exactly one portion",
    origin_country: "FR",
    nutri_score: "A",
    components: [{ key: "rice", name: "Rice", grams: 100 }],
    per_serving: { cost: 1, kcal: 300 },
  },
  {
    key: "less_than_one_portion",
    name: "Less than one portion",
    origin_country: "FR",
    nutri_score: "A",
    components: [{ key: "rice", name: "Rice", grams: 150 }],
    per_serving: { cost: 1, kcal: 300 },
  },
];
assert.deepEqual(
  filterDishes(stockFilteredDishes, {
    ...baseFilters,
    allergens: new Set(),
    stockOnly: true,
    stockRows: [{ item_key: "rice", quantity: 100, quantity_unit: "g", grams_per_measure_unit: 1 }],
  }).map((dish) => dish.key),
  ["exactly_one_portion"],
);

console.log("Dishes feature owns multi-country/allergen filtering, stock-ready filtering, exact specific-nut browsing semantics, and SVG allergy badges.");