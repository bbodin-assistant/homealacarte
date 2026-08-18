import assert from "node:assert/strict";
import {
  allergenIcon,
  countryFlag,
  dishPreferenceBadges,
  dishRangeMaximums,
  filterDishes,
} from "../www/features/dishes.js";

const dishes = [
  { key: "cheap_a", name: "Cheap A", nutri_score: "A", per_serving: { cost: 1.234, kcal: 450 } },
  { key: "rich_c", name: "Rich C", nutri_score: "C", per_serving: { cost: 4.5, kcal: 800 } },
  { key: "unknown", name: "Unknown", nutri_score: "", per_serving: { cost: 2, kcal: 300 } },
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

const badges = dishPreferenceBadges({
  key: "pad_thai",
  components: [
    { key: "peanut", name: "Peanuts" },
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
assert.equal(badges.find((badge) => badge.kind === "allergy")?.icon, "🥜");
assert.match(badges.find((badge) => badge.kind === "allergy")?.title || "", /Alex/);

assert.deepEqual(
  filterDishes(dishes, {
    search: "cheap",
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
    nutriScores: new Set(["UNKNOWN"]),
    minimumCost: 0,
    maximumCost: 10,
    minimumKcal: 0,
    maximumKcal: 1000,
  }).map((dish) => dish.key),
  ["unknown"],
);

console.log("Dishes feature owns range/filter behavior and highlights household allergy, favorite, and forbidden rules.");
