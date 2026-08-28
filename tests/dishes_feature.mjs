import assert from "node:assert/strict";
import {
  allergenIcon,
  allergenCodesOverlap,
  countryFlag,
  dishFilterAllergenMatches,
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
    components: [{ key: "mixed_nuts", name: "Mixed nuts", allergens: ["tree_nut"] }],
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
assert.equal(allergenIcon("Peanut butter"), "🥜");
assert.equal(allergenIcon("milk"), "🥛");
assert.equal(allergenIcon("unknown allergen"), "⚠️");
assert.equal(allergenCodesOverlap("pistachio", "tree_nut"), true);
assert.equal(allergenCodesOverlap("tree_nut", "walnut"), true);
assert.equal(allergenCodesOverlap("pistachio", "walnut"), false);
assert.equal(dishFilterAllergenMatches("tree_nut", "brazil_nut"), true);
assert.equal(dishFilterAllergenMatches("brazil_nut", "brazil_nut"), true);
assert.equal(dishFilterAllergenMatches("brazil_nut", "tree_nut"), false);

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
assert.ok(!filterDishes(dishes, { ...baseFilters, allergens: new Set(["tree_nut"]) })
  .some((dish) => dish.key === "carrot_cake"));
assert.deepEqual(
  filterDishes(dishes, { ...baseFilters, countries: new Set(["FR", "JP"]), allergens: new Set() })
    .map((dish) => dish.key),
  ["cheap_a", "unknown"],
);

console.log("Dishes feature owns multi-country/allergen filtering, exact specific-nut browsing semantics, and SVG allergy badges.");
