import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [feature, index, worker, app] = await Promise.all([
  readFile(new URL("../www/features/catalogue.js", import.meta.url), "utf8"),
  readFile(new URL("../www/views/catalogue.html", import.meta.url), "utf8"),
  readFile(new URL("../www/worker.js", import.meta.url), "utf8"),
  readFile(new URL("../www/app/feature-composition.js", import.meta.url), "utf8"),
]);

assert.match(index, /id="add-catalogue-item"/);
assert.match(index, /id="ingredient-name-fields"/);
assert.match(index, /id="household-item-name-fields"/);
assert.doesNotMatch(index, /id="(?:ingredient|household-item)-name-(?:en|fr)"/);
assert.match(feature, /function openNewCatalogueItem\(\)/);
assert.match(feature, /localizedFormValues/);
assert.match(feature, /renderLocalizedInputs/);
assert.match(feature, /name_i18n: nameI18n/);
assert.doesNotMatch(feature, /name-(?:en|fr)/);
assert.match(feature, /creating \? "add-ingredient" : "replace-ingredient"/);
assert.match(feature, /creating \? "add-household-item" : "replace-household-item"/);
assert.doesNotMatch(feature, /\bt\s*\(/);
assert.doesNotMatch(feature, /openCatalogueItemDetails/);
assert.match(worker, /type === "add-ingredient"/);
assert.match(worker, /type === "add-household-item"/);
assert.match(worker, /applyRecordMetadata\(snapshot, "items"/);
assert.match(app, /const locales = Object\.keys\(translations\)/);

console.log("Catalogue Add/Edit generates localized names from the shared locale list for food and general items.");
