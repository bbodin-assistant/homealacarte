import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [feature, index, worker] = await Promise.all([
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/catalogue.html", import.meta.url), "utf8"),
  readFile(new URL("../www/worker.js", import.meta.url), "utf8"),
]);

assert.match(index, /id="add-catalogue-item"/);
assert.match(index, /id="ingredient-name-en"/);
assert.match(index, /id="ingredient-name-fr"/);
assert.match(index, /id="household-item-name-en"/);
assert.match(index, /id="household-item-name-fr"/);
assert.match(feature, /function openNewCatalogueItem\(\)/);
assert.match(feature, /name_i18n: nameI18n/);
assert.match(feature, /creating \? "add-ingredient" : "replace-ingredient"/);
assert.match(feature, /creating \? "add-household-item" : "replace-household-item"/);
assert.doesNotMatch(feature, /\bt\s*\(/);
assert.doesNotMatch(feature, /openCatalogueItemDetails/);
assert.match(worker, /type === "add-ingredient"/);
assert.match(worker, /type === "add-household-item"/);
assert.match(worker, /applyRecordMetadata\(snapshot, "items"/);

console.log("Catalogue Add/Edit preserves EN/FR names for food and general items.");
