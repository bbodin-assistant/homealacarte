import assert from "node:assert/strict";
import {
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

console.log("Dishes feature owns range calculation and catalogue filtering.");
