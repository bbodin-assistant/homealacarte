import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  catalogueCategories,
  catalogueItemIsIncomplete,
  filterCatalogueItems,
  sortCatalogueItems,
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
assert.equal(catalogueItemIsIncomplete({ incomplete: true }, 0), true);
assert.equal(catalogueItemIsIncomplete({ incomplete: false }, 2), true);
assert.equal(catalogueItemIsIncomplete({ incomplete: false }, 0), false);

const catalogueRows = [
  {
    name: "Soap",
    item_kind: "general",
    category: "Household",
    dish_count: 0,
    catalogue_incomplete: false,
  },
  {
    name: "Carrot",
    item_kind: "food",
    category: "Produce::Vegetables",
    dish_count: 1,
    catalogue_incomplete: true,
  },
  {
    name: "Apple",
    item_kind: "food",
    category: "Produce::Fruit",
    dish_count: 3,
    catalogue_incomplete: true,
  },
];
assert.deepEqual(
  filterCatalogueItems(catalogueRows, { incomplete: true }).map((item) => item.name),
  ["Carrot", "Apple"],
);
assert.deepEqual(
  sortCatalogueItems(catalogueRows, { key: "name" }).map((item) => item.name),
  ["Apple", "Carrot", "Soap"],
);
assert.deepEqual(
  sortCatalogueItems(catalogueRows, { key: "type" }).map((item) => item.name),
  ["Apple", "Carrot", "Soap"],
);
assert.deepEqual(
  sortCatalogueItems(catalogueRows, { key: "category" }).map((item) => item.name),
  ["Soap", "Apple", "Carrot"],
);
assert.deepEqual(
  sortCatalogueItems(catalogueRows, { key: "dishes", direction: "desc" })
    .map((item) => item.name),
  ["Apple", "Carrot", "Soap"],
);
assert.deepEqual(
  sortCatalogueItems(catalogueRows, { key: "original" }).map((item) => item.name),
  ["Soap", "Carrot", "Apple"],
);

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

const [feature, index, filters] = await Promise.all([
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/catalogue.html", import.meta.url), "utf8"),
  readFile(new URL("../www/features/catalogue/filters.js", import.meta.url), "utf8"),
]);
assert.match(index, /id="item-search"/);
assert.match(index, /id="item-category-filter"/);
assert.match(index, /id="item-clear-filters"/);
assert.match(feature, /configureItemCategoryFilter/);
assert.match(feature, /configureItemFilterControls/);
assert.match(feature, /data-item-catalogue-tab="all"/);
assert.match(feature, /id="item-sort"/);
assert.match(feature, /id="item-incomplete-filter"/);
assert.match(feature, /filterCatalogueItems/);
assert.match(feature, /sortCatalogueItems/);
assert.match(feature, /catalogueItemIsIncomplete/);
assert.match(feature, /ingredientCatalogueStats/);
assert.match(feature, /current_stock/);
assert.match(filters, /data-catalogue-sort/);
assert.match(filters, /item-dish-count/);
assert.match(filters, /value="original"/);
assert.match(filters, /sortSelect\.value = "original"/);
assert.match(filters, /directionButton\.dataset\.direction !== "asc"/);
assert.match(filters, /directionButton\.click\(\)/);
assert.match(filters, /catalogueSortSignature/);
assert.match(filters, /observer\.observe\(catalogue, \{ childList: true \}\)/);
assert.doesNotMatch(filters, /observer\.observe\(catalogue, \{ childList: true, subtree: true \}\)/);
assert.match(index, /id="ingredient-allergens"/);
assert.match(feature, /ingredientAllergenOptions/);
assert.match(feature, /#ingredient-allergens.*input:checked/);
assert.match(feature, /renderIngredientAllergenOptions\(ingredient\.allergens\)/);

console.log("Catalogue filters cover three-state header sorting, original order restoration, incomplete food detection, dish counts, and stock summaries.");
