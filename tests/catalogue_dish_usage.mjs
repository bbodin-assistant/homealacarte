import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  dishesUsingIngredient,
  ingredientCatalogueStats,
  menuUsesForIngredient,
} from "../www/features/catalogue/usage.js";

const dishes = [
  { key: "apple-pie", name: "Apple pie", components: [{ key: "apple", name: "Apple" }] },
  { key: "fruit-salad", name: "Fruit salad", components: [{ item_key: "apple", name: "Apple" }] },
  { key: "pear-tart", name: "Pear tart", components: [{ key: "pear", name: "Pear" }] },
];
const menuRows = [
  { item_key: "apple-pie" },
  { item_key: "apple" },
  { item_key: "pear-tart" },
];

assert.deepEqual(
  dishesUsingIngredient("apple", dishes).map((dish) => dish.key),
  ["apple-pie", "fruit-salad"],
);
assert.equal(menuUsesForIngredient("apple", dishes, menuRows).length, 2);
assert.deepEqual(
  ingredientCatalogueStats("apple", dishes, [], "piece", menuRows),
  { dishCount: 2, menuDishCount: 2, stockQuantity: null },
);

const [catalogue, details] = await Promise.all([
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/item-details.js", import.meta.url), "utf8"),
]);
assert.match(catalogue, /menu_dish_count/);
assert.match(catalogue, /translate\("nav_menu"\)/);
assert.match(details, /grocery-details-library-usages/);
assert.match(details, /dishesUsingIngredient/);

console.log("Catalogue separates current-menu uses from all recipe-library dish uses.");
