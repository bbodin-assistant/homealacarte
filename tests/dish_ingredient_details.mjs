import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, style] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/style.css", import.meta.url), "utf8"),
]);

assert.match(app, /data-dish-ingredient-details=/);
assert.match(app, /#dish-details-ingredients.*addEventListener\("click"/s);
assert.match(app, /closeDishDetails\(\);\s+openCatalogueItemDetails\(key, "food"\);/);
assert.match(style, /\.dish-details-ingredient\s*\{/);
assert.match(style, /\.dish-details-ingredient:focus-visible/);

console.log("Dish ingredients open their food catalogue information dialog.");
