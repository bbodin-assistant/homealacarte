import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [menu, style] = await Promise.all([
  readFile(new URL("../www/features/menu.js", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/dishes.css", import.meta.url), "utf8"),
]);

assert.match(menu, /data-dish-ingredient-details=/);
assert.match(menu, /#dish-details-ingredients.*addEventListener\("click"/s);
assert.match(menu, /closeDishDetails\(\);\s+openCatalogueItemDetails\(key, "food"\);/);
assert.match(style, /\.dish-details-ingredient\s*\{/);
assert.match(style, /\.dish-details-ingredient:focus-visible/);

console.log("Dish ingredients open their food catalogue information dialog.");
