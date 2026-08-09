import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [feature, index, worker] = await Promise.all([
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/index.html", import.meta.url), "utf8"),
  readFile(new URL("../www/worker.js", import.meta.url), "utf8"),
]);

assert.match(index, /id="add-catalogue-item"/);
assert.match(feature, /function openNewCatalogueItem\(\)/);
assert.match(feature, /creating \? "add-ingredient" : "replace-ingredient"/);
assert.match(feature, /creating \? "add-household-item" : "replace-household-item"/);
assert.match(worker, /type === "add-ingredient"/);
assert.match(worker, /type === "add-household-item"/);

console.log("The catalogue Add action supports new food and general items.");
