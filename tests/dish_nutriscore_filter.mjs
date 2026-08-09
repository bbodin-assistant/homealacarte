import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  NUTRI_SCORES,
  matchesSelectedNutriScores,
} from "../www/dish-filters.js";

const dishes = [
  { key: "a", nutri_score: "A" },
  { key: "c", nutri_score: "C" },
  { key: "missing", nutri_score: "" },
];

assert.deepEqual(NUTRI_SCORES, ["A", "B", "C", "D", "E"]);
assert.deepEqual(
  dishes.filter((dish) => matchesSelectedNutriScores(dish, new Set())).map((dish) => dish.key),
  ["a", "c", "missing"],
  "an empty selection must leave all dishes visible, including uncomputed scores",
);
assert.deepEqual(
  dishes.filter((dish) =>
    matchesSelectedNutriScores(dish, new Set(["A", "C"]))).map((dish) => dish.key),
  ["a", "c"],
);
assert.deepEqual(
  dishes.filter((dish) =>
    matchesSelectedNutriScores(dish, new Set(["UNKNOWN"]))).map((dish) => dish.key),
  ["missing"],
);

const [feature, index] = await Promise.all([
  readFile(new URL("../www/features/dishes.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/dishes.html", import.meta.url), "utf8"),
]);
assert.match(feature, /nutriScores/);
assert.match(feature, /matchesSelectedNutriScores/);
assert.match(index, /data-dish-nutri-score="A"/);
assert.match(index, /data-dish-nutri-score="E"/);
assert.match(index, /data-dish-nutri-score="UNKNOWN"/);

console.log("Dish Nutri-Score filtering keeps all dishes by default and supports selected scores.");
