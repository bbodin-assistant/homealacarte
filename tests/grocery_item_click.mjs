import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, style] = await Promise.all([
  readFile(new URL("../www/app.js", import.meta.url), "utf8"),
  readFile(new URL("../www/style.css", import.meta.url), "utf8"),
]);

const groceryTemplate = app.slice(
  app.indexOf("function renderGrocery()"),
  app.indexOf("function customGroceryPayload()"),
);
assert.match(groceryTemplate, /class="grocery-item[^"]*"[^>]*data-grocery-details=/);
assert.match(groceryTemplate, /<input type="checkbox" data-id=/);
assert.doesNotMatch(groceryTemplate, /grocery-details-button/);
assert.match(app, /if \(event\.target\.closest\("input\[data-id\]"\)\) return;/);
assert.match(app, /openGroceryDetails\(decodeURIComponent\(item\.dataset\.groceryDetails\)\)/);
assert.doesNotMatch(style, /\.grocery-details-button/);

console.log("Grocery checkbox remains independent and the rest of each item opens details.");
