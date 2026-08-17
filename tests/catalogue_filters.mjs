import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  catalogueCategories,
  filterCatalogueItems,
} from "../www/features/catalogue/filters.js";
import { ingredientCatalogueStats } from "../www/features/catalogue/usage.js";

const foods = [
  { name: "Green apple", category: "Produce::Fruit" },
  { name: "Apple juice", category: "Drinks::Juice" },
  { name: "Carrot", category: "Produce::Vegetables" },
  { name: "Pear", category: "Produce::Fruit" },
];

assert.deepEqual(catalogueCategories(foods), [
  "Drinks::Juice",
  "Produce::Fruit",
  "Produce::Vegetables",
]);
assert.deepEqual(
  filterCatalogueItems(foods, { name: "apple" }).map((item) => item.name),
  ["Green apple", "Apple juice"],
);
assert.deepEqual(
  filterCatalogueItems(foods, { category: "Produce::Fruit" }).map((item) => item.name),
  ["Green apple", "Pear"],
);
assert.deepEqual(
  filterCatalogueItems(foods, { name: "apple", category: "Produce::Fruit" })
    .map((item) => item.name),
  ["Green apple"],
);
assert.equal(filterCatalogueItems(foods).length, foods.length);

const dishes = [
  { components: [{ key: "tomato" }, { key: "salt" }] },
  { components: [{ item_key: "tomato" }, { key: "tomato" }] },
  { components: [{ key: "bread" }] },
];
assert.deepEqual(
  ingredientCatalogueStats("tomato", dishes, [
    { item_key: "tomato", quantity: 2.5, quantity_unit: "unit", measure_unit: "piece" },
  ], "piece"),
  { dishCount: 2, stockQuantity: { quantity: 2.5, unit: "piece" } },
);
assert.deepEqual(
  ingredientCatalogueStats("bread", dishes, [
    { item_key: "bread", quantity: 350, quantity_unit: "g" },
  ], "slice"),
  { dishCount: 1, stockQuantity: { quantity: 350, unit: "g" } },
);
assert.deepEqual(
  ingredientCatalogueStats("salt", dishes, [
    { item_key: "salt", quantity: 0, quantity_unit: "g" },
  ], "g"),
  { dishCount: 1, stockQuantity: null },
);
assert.deepEqual(
  ingredientCatalogueStats("missing", dishes, [], "g"),
  { dishCount: 0, stockQuantity: null },
);

const [feature, index] = await Promise.all([
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/catalogue.html", import.meta.url), "utf8"),
]);
assert.match(index, /id="item-search"/);
assert.match(index, /id="item-category-filter"/);
assert.match(index, /id="item-clear-filters"/);
assert.match(feature, /configureItemCategoryFilter/);
assert.match(feature, /filterCatalogueItems/);
assert.match(feature, /ingredientCatalogueStats/);
assert.match(feature, /current_stock/);

console.log("Catalogue filters and ingredient usage summaries cover dish counts and positive stock.");
