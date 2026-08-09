import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  catalogueCategories,
  filterCatalogueItems,
} from "../www/catalogue-filters.js";

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

const [feature, index] = await Promise.all([
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
]);
assert.match(index, /id="item-search"/);
assert.match(index, /id="item-category-filter"/);
assert.match(index, /id="item-clear-filters"/);
assert.match(feature, /configureItemCategoryFilter/);
assert.match(feature, /filterCatalogueItems/);

console.log("Catalogue filters support name and active-tab category filtering.");
