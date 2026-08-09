import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, grocery, style] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/features/grocery.js", import.meta.url), "utf8"),
  readFile(new URL("../www/styles/grocery-catalogue.css", import.meta.url), "utf8"),
]);

assert.match(grocery, /class="grocery-item[^"]*"[^>]*data-grocery-details=/);
assert.match(grocery, /<input type="checkbox" data-id=/);
assert.doesNotMatch(grocery, /grocery-details-button/);
assert.match(grocery, /if \(event\.target\.closest\("input\[data-id\]"\)\) return;/);
assert.match(grocery, /openDetails\(decodeURIComponent\(item\.dataset\.groceryDetails\)\)/);
assert.match(app, /groceryFeature\.mount\(\)/);
assert.doesNotMatch(style, /\.grocery-details-button/);

console.log("Grocery checkbox remains independent and the rest of each item opens details.");
